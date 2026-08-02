import * as nhsdk from "@nihilium/core";
import { AddressMap } from "@nihilium/core/types";

/** Status values the recovery-email proving service reports (external API contract). */
export const ZKEmailRecoveryStatus = {
    Accepted: "accepted",
    Queued: "queued",
    Proving: "proving",
    Finished: "finished",
} as const;

/** Minimal fetch shape so this scenario needs no DOM lib types; defaults to the global fetch. */
export type FetchLike = (url: string, init?: any) => Promise<{ json(): Promise<any> }>;

export type ZKEmailUnsealingOptions = nhsdk.NihiliumUnsealingClientOptions & {
    /** Base URL of the recovery-email proving service (e.g. https://zkemail.nihilium.io). */
    emailServiceUrl: string;
    /** The recovery email address. Defaults to the seal's stored proving_hints.email. */
    email?: string;
    /** Optional human-readable progress callback (email exchange + proving steps). */
    onProgress?: (message: string) => void;
    /** Injectable fetch (defaults to global fetch); handy for tests / non-browser hosts. */
    fetchFn?: FetchLike;
};

type ZKEmailScenarioState = {
    hashTiedPreimage?: string; // decimal string
    emailSubject?: string;     // hex string; doubles as the recovery id
    emailAccepted?: boolean;
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
    private fetchFn: FetchLike;
    private address_map: AddressMap;
    constructor(
        seal: nhsdk.types.NihiliumSeal,
        processors: nhsdk.types.ProcessorEndpoint[],
        dataStreams: nhsdk.IDualDataStream[],
        address_map: AddressMap,
        opts: ZKEmailUnsealingOptions,
    ) {
        super(seal, processors, dataStreams, opts);
        this.emailServiceUrl = opts.emailServiceUrl.replace(/\/+$/, "");
        this.email = opts.email ?? seal.packages[0]?.private_package?.proving_hints?.email;
        this.address_map = address_map;
        this.onProgress = opts.onProgress ?? (() => { /* noop */ });
        // Call fetch through globalThis so the browser keeps its `this` binding — assigning the bare global
        // fetch to an instance field and invoking it as a method throws "Illegal invocation".
        this.fetchFn = opts.fetchFn ?? ((url, init) => (globalThis as any).fetch(url, init));
    }

    /**
     * Generate (once) the hash-tie preimage + email subject, then run the recovery-email exchange up to
     * acceptance. Everything is persisted so a resume reuses the same subject instead of starting a new
     * email flow.
     */
    protected async prepareProofProduction(): Promise<void> {
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
            await this.awaitEmailAccepted(scenario.emailSubject!);
            await this.setScenarioState({ emailAccepted: true });
            this.onProgress("Email reply received.");
        }
    }

    /**
     * HashTie takes the locally generated preimage; ZKEmail's proof is fetched on demand from the email
     * service. Keyed by module_name — the producer falls back to module_name when there is no module_id
     * match, so this works regardless of the compiled module ids.
     */
    protected buildResolvers(): nhsdk.UnsealResolvers {
        const { hashTiedPreimage, emailSubject } = this.getScenarioState<ZKEmailScenarioState>();
        return {
            HashTieModule: async () => ({ preimage: hashTiedPreimage! }),
            ZKEmailModule: async () => this.awaitEmailProof(emailSubject!),
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
                    return { proof, publicSignals: data.publicSignals, proofType: data.proofType };
                }
                if (data.status === ZKEmailRecoveryStatus.Queued) {
                    this.onProgress("Email proving queued. Position in queue: " + data.queuePosition);
                }
                if (data.status === ZKEmailRecoveryStatus.Proving) {
                    this.onProgress("Email proving in progress. Waiting for proof...");
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
