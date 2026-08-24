import * as nhsdk from "@nihilium/core";
import { AddressMap } from "@nihilium/core/types";
import { getProcessorEndpoint } from "../../lib/endpoint-selection";
import { checkEmailDomain, type ZKEmailDomainCheck } from "./email_domain";

/** Status values the recovery-email proving service reports (external API contract). */
export const ZKEmailRecoveryStatus = {
    Accepted: "accepted",
    Queued: "queued",
    Proving: "proving",
    Finished: "finished",
} as const;

/** Minimal fetch shape so this scenario needs no DOM lib types; defaults to the global fetch. */
export type FetchLike = (url: string, init?: any) => Promise<{ json(): Promise<any> }>;

/**
 * Where the unseal has got to, for callers that need to drive UI off it. Prefer this over matching on
 * the human-readable progress strings, which are free to change.
 */
export const ZKEmailUnsealPhase = {
    /** Resolving the proving timestamp / publishing reveal values. */
    Preparing: "preparing",
    /** The recovery email has been sent; the user must reply before anything else can happen. */
    AwaitingEmailReply: "awaiting_email_reply",
    /** The reply landed; the service is producing the ZKEmail proof. */
    Proving: "proving",
    /** Proofs are being produced and the processors are being asked to unseal. */
    Unsealing: "unsealing",
    Done: "done",
} as const;
export type ZKEmailUnsealPhase = typeof ZKEmailUnsealPhase[keyof typeof ZKEmailUnsealPhase];

export type ZKEmailUnsealingOptions = nhsdk.NihiliumUnsealingClientOptions & {
    /**
     * Base URL of the recovery-email proving service (e.g. https://zkemail.nihilium.io). Optional when
     * the seal records one (the sealing client stores it), and overrides the seal's value when given.
     */
    emailServiceUrl?: string;
    /** The recovery email address. Defaults to the seal's stored proving hints. */
    email?: string;
    /** Optional human-readable progress callback (email exchange + proving steps). */
    onProgress?: (message: string) => void;
    /** Structured counterpart of onProgress; stable across wording changes. */
    onPhase?: (phase: ZKEmailUnsealPhase) => void;
    /** Injectable fetch (defaults to global fetch); handy for tests / non-browser hosts. */
    fetchFn?: FetchLike;
};

type ZKEmailScenarioState = {
    hashTiedPreimage?: string; // decimal string
    emailSubject?: string;     // hex string; doubles as the recovery id
    emailAccepted?: boolean;
    // What the email service reported about the proof it produced. Diagnostic only: the timestamp that
    // goes into the proof's public signals is the protocol's proving timestamp, not this one.
    emailProofType?: string;
    emailServiceTimestamp?: number;
};

/**
 * ZKEmail + HashTie unseal scenario — the flow the forgot-my-password front end uses, generalized to
 * k-of-n. This is use-case-focused code, so it lives in the client SDK (built on the generic
 * NihiliumUnsealingClient scenario mechanism in @nihilium/core). The unseal path is
 * [opening (per-processor) -> HashTie (per-processor) -> ZKEmail (shared)]:
 *
 *  - Generates a random hash-tie preimage and derives emailSubject = poseidon1(preimage). Only this hash
 *    is ever put in the email, so the per-processor reveal_value stays hidden behind it.
 *  - Drives the recovery-email exchange: POST the subject to the service, wait until it is accepted, then
 *    the ZKEmail resolver polls for the finished proof.
 *  - HashTie's resolver supplies the preimage (its tied_value comes from the seal via context).
 *
 * The preimage/subject/acceptance are persisted in scenario_state, so a resume reuses the same email
 * exchange; and because ZKEmail is a shared module its (expensive) proof is produced once and reused
 * across all k processors.
 */
export class ZKEmailUnsealingClient extends nhsdk.NihiliumUnsealingClient {
    private emailServiceUrl: string;
    private email?: string;
    private onProgress: (message: string) => void;
    private onPhase: (phase: ZKEmailUnsealPhase) => void;
    private fetchFn: FetchLike;
    constructor(
        seal: nhsdk.types.NihiliumSeal,
        processors: nhsdk.types.ProcessorEndpoint[],
        dataStreams: nhsdk.IDualDataStream[],
        address_map: AddressMap,
        opts: ZKEmailUnsealingOptions,
    ) {
        // ZKEmail names the RSA verifier it used in a public signal, so the addresses have to reach
        // proof production — they travel on the production context, not through the resolver.
        super(seal, processors, dataStreams, { ...opts, address_map: opts.address_map ?? address_map });
        const emailServiceUrl = opts.emailServiceUrl ?? seal.shared_proving_hints?.email_service_url;
        if (!emailServiceUrl) {
            throw new Error(
                "ZKEmailUnsealingClient: no recovery email service (pass opts.emailServiceUrl, or seal " +
                "with one so the seal records it)");
        }
        this.emailServiceUrl = emailServiceUrl.replace(/\/+$/, "");
        this.email = opts.email
            ?? seal.shared_proving_hints?.email
            ?? seal.packages[0]?.private_package?.proving_hints?.email;
        this.onProgress = opts.onProgress ?? (() => { /* noop */ });
        this.onPhase = opts.onPhase ?? (() => { /* noop */ });
        // Call fetch through globalThis so the browser keeps its `this` binding — assigning the bare global
        // fetch to an instance field and invoking it as a method throws "Illegal invocation".
        this.fetchFn = opts.fetchFn ?? ((url, init) => (globalThis as any).fetch(url, init));
    }

    /**
     * Build a client straight from a stored seal, resolving the processors and datastreams it records.
     * Preferred over the constructor: it takes the address map from `network` instead of a positional
     * argument, so there is no way to slide the options into the wrong slot.
     */
    static async fromSeal(
        seal: nhsdk.types.NihiliumSeal,
        opts: Omit<ZKEmailUnsealingOptions, "address_map"> & { network: number },
    ): Promise<ZKEmailUnsealingClient> {
        const processors = await Promise.all(
            seal.packages.map((pkg) =>
                getProcessorEndpoint({
                    url: pkg.public_package.processor_url,
                    name: "Processor",
                    // Unseal is never paid, so the address is unused — a placeholder is fine.
                    ethAddress: "0x0000000000000000000000000000000000000000",
                    is_tor: false,
                    jurisdiction: "US",
                    stake: 0n,
                }),
            ),
        );
        const urls = Array.from(
            new Set(seal.packages.flatMap((pkg) => pkg.public_package.data_stream_urls)),
        );
        const dataStreams = urls.map((url) => new nhsdk.DataStreamClient(url));
        await Promise.all(dataStreams.map((d) => d.initialize()));

        const address_map = nhsdk.toAddressMap(opts.network);
        return new ZKEmailUnsealingClient(seal, processors, dataStreams, address_map, opts);
    }

    /**
     * Whether this seal's recovery email can be proven against at all, asked of the service the seal
     * records. Convenience over `checkEmailDomain`, for the common case where a recovery UI has only
     * the .nh file and wants to fail fast instead of sending an email that can never be proven.
     */
    async checkRecoveryEmailDomain(): Promise<ZKEmailDomainCheck> {
        if (!this.email) {
            throw new Error("ZKEmailUnsealingClient: no recovery email (pass opts.email or seal proving_hints.email)");
        }
        return checkEmailDomain(this.emailServiceUrl, this.email, this.fetchFn);
    }

    /**
     * Recover the value this seal was created with: unseal the vault key with the first k processors,
     * then decrypt the blob the sealing client encrypted to the vault public key.
     */
    async unseal(): Promise<string> {
        const blob = this.seal.shared_proving_hints?.encrypted_value as nhsdk.VaultEncryptedBlob | undefined;
        if (!blob) {
            throw new Error(
                "This seal carries no encrypted value. Seals made before the vault keypair change are " +
                "not recoverable by this client.",
            );
        }
        const threshold = this.seal.fdt_seal.threshold;
        await this.start_unsealing(Array.from({ length: threshold }, (_, i) => i));
        const value = await this.decrypt_vault_blob_to_string(blob);
        this.onPhase(ZKEmailUnsealPhase.Done);
        return value;
    }

    /**
     * Generate (once) the hash-tie preimage + email subject, run the recovery-email exchange up to
     * acceptance, and only then resolve the proving timestamp. Everything is persisted so a resume
     * reuses the same subject instead of starting a new email flow.
     *
     * The email goes out first on purpose. Nothing in the exchange depends on the reveal values being
     * anchored — the email carries only the hash-tie subject, and the service's proof takes no
     * timestamp — while the anchoring wait is the slowest thing here. Sending first overlaps it with
     * the (much longer) wait for a human to reply, instead of stacking the two.
     */
    protected async prepareProofProduction(): Promise<void> {
        this.onPhase(ZKEmailUnsealPhase.Preparing);
        let scenario = this.getScenarioState<ZKEmailScenarioState>();
        if (!scenario.emailSubject) {
            const hashTiedPreimage = nhsdk.cryptoTools.generateRandom248BitNumber().toString();
            const emailSubject = nhsdk.utils.toPaddedHex(nhsdk.cryptoTools.poseidonTools.poseidon1([BigInt(hashTiedPreimage)]));
            await this.setScenarioState({ hashTiedPreimage, emailSubject });
            scenario = this.getScenarioState<ZKEmailScenarioState>();
        }
        if (!scenario.emailAccepted) {
            if (!this.email) {
                throw new Error("ZKEmailUnsealingClient: no recovery email (pass opts.email or seal proving_hints.email)");
            }
            this.onProgress("Sending recovery email...");
            await this.sendRecoveryEmail(scenario.emailSubject!);
            this.onProgress("Recovery email sent. Awaiting reply...");
            this.onPhase(ZKEmailUnsealPhase.AwaitingEmailReply);
            await this.awaitEmailAccepted(scenario.emailSubject!);
            await this.setScenarioState({ emailAccepted: true });
            this.onProgress("Email reply received.");
        }

        // Now resolve "now": it pins which publication of the reveal values every opening proof is built
        // from, re-batching them if they landed in different rounds. It has to be settled before any
        // module produces, because the chain substitutes the opening proof's anchoring timestamp into
        // the public signals the ZKEmail module writes it into.
        this.onPhase(ZKEmailUnsealPhase.Unsealing);
        this.onProgress("Waiting for the reveal values to be anchored...");
        const provingTimestamp = await this.waitForProvingTimestamp();
        this.onProgress(`Proving against data stream timestamp ${provingTimestamp}.`);
    }

    /**
     * HashTie takes the locally generated preimage; ZKEmail's proof is fetched on demand from the email
     * service. Keyed by module_name — the producer falls back to module_name when there is no module_id
     * match, so this works regardless of the compiled module ids.
     *
     * The ZKEmail module fills in the timestamp and the verifier addresses from the production context,
     * so only the parts that are genuinely external to the protocol are supplied here.
     */
    protected buildResolvers(): nhsdk.UnsealResolvers {
        const { hashTiedPreimage, emailSubject } = this.getScenarioState<ZKEmailScenarioState>();
        return {
            HashTieModule: async () => ({ preimage: hashTiedPreimage! }),
            ZKEmailModule: async () => {
                const { proof, publicSignals, proofType } = await this.awaitEmailProof(emailSubject!);
                return { proof, publicSignals, proof_type: proofType };
            },
        };
    }

    private async sendRecoveryEmail(emailSubject: string): Promise<void> {
        await this.fetchFn(`${this.emailServiceUrl}/recovery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recovery_id: emailSubject,
                recovery_secret: emailSubject,
                email: this.email,
            }),
        });
    }

    private async awaitEmailAccepted(emailSubject: string): Promise<void> {
        while (true) {
            try {
                const response = await this.fetchFn(
                    `${this.emailServiceUrl}/recovery/${emailSubject}/proofs`, { method: "POST" },
                );
                const data = await response.json();
                if (data.status === ZKEmailRecoveryStatus.Accepted) return;
            } catch {
                /* transient; retry */
            }
            await sleep(1000);
        }
    }

    /**
     * The service also reports the time it saw the email and which RSA key size it proved with. The
     * key size selects the verifier; its timestamp is recorded for diagnostics only — the timestamp in
     * the proof's public signals must be the opening proof's anchoring time, because the chain
     * substitutes that value there at verify time. An anchor earlier than the email is expected and
     * safe: the registry check is "this DKIM key was not yet revoked then".
     */
    private async awaitEmailProof(emailSubject: string): Promise<{ proof: string; publicSignals: any[], proofType: string }> {
        this.onProgress("Awaiting ZKEmail proof...");
        while (true) {
            try {
                const response = await this.fetchFn(
                    `${this.emailServiceUrl}/recovery/${emailSubject}/proofs/${emailSubject}`,
                );
                const data = await response.json();
                if (data.status === ZKEmailRecoveryStatus.Finished) {
                    let proof = data.proof.hex as string;
                    if (proof.slice(0, 2) !== "0x") proof = "0x" + proof;
                    //Proof Type is RSA2048 or RSA1024
                    await this.setScenarioState({
                        emailProofType: data.proofType,
                        emailServiceTimestamp: data.timestamp !== undefined ? Number(data.timestamp) : undefined,
                    });
                    this.onProgress(`Email proof received (${data.proofType}).`);
                    return { proof, publicSignals: data.publicSignals, proofType: data.proofType };
                }
                if (data.status === ZKEmailRecoveryStatus.Queued) {
                    this.onProgress("Email proving queued. Position in queue: " + data.queuePosition);
                }
                if (data.status === ZKEmailRecoveryStatus.Proving) {
                    this.onProgress("Email proving in progress. Waiting for proof...");
                    this.onPhase(ZKEmailUnsealPhase.Proving);
                }
            } catch {
                /* transient; retry */
            }
            await sleep(1000);
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
