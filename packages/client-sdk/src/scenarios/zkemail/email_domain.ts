import type { FetchLike } from "./zkemail_unsealing_client";

/**
 * What the recovery service's DKIM registry knows about a domain.
 *
 * Verbatim from `GET /v1/registry/check` — the field meanings are the service's, not ours. Use
 * `domainVerdict` rather than reading the flags directly: only `known` domains are actually
 * recoverable, and an all-false response is a "no record found", not an approval.
 */
export type ZKEmailDomainCheck = {
    /** The domain the service resolved and answered for. */
    domain: string;
    /** The registry holds this domain's DKIM key(s). Without it there is nothing to prove against. */
    known: boolean;
    /** The service wants a recovery email sent to this domain (e.g. to observe its current key). */
    shouldSendEmail: boolean;
    /** The domain cannot be proven against — recovery through this service is impossible. */
    unsupported: boolean;
};

/** Whether a seal made against a domain could actually be recovered, and if not, why not. */
export type ZKEmailDomainVerdict =
    /** The registry holds a key for it: recoverable today. */
    | "eligible"
    /** Provable in principle, but the service needs to observe the current key first. */
    | "needs_registration"
    /** No DKIM record found. Recovery would be a guess, so it is not one of the safe answers. */
    | "unverified"
    /** Cannot be proven at all. */
    | "unsupported";

/**
 * Read a registry answer as a recoverability verdict.
 *
 * The rule that matters: `known` is required. A response with every flag false is the registry saying
 * it found no DKIM record for the domain — not that the domain is fine. Treating that as eligible would
 * let someone seal against an address whose recovery is a guess, and the guess is only tested at
 * recovery time, when nothing can be done about it.
 */
export function domainVerdict(check: ZKEmailDomainCheck): ZKEmailDomainVerdict {
    if (check.unsupported) return "unsupported";
    if (check.shouldSendEmail) return "needs_registration";
    if (!check.known) return "unverified";
    return "eligible";
}

/**
 * Ask the recovery service whether a domain can be recovered through ZKEmail at all.
 *
 * Standalone rather than a client method: the useful moment to call it is *before* sealing, while the
 * user is still typing their address and no client exists yet.
 *
 * Accepts a full address or a bare domain — the local part is dropped, so nothing identifying is sent
 * beyond the domain itself.
 */
export async function checkEmailDomain(
    emailServiceUrl: string,
    emailOrDomain: string,
    fetchFn?: FetchLike,
): Promise<ZKEmailDomainCheck> {
    const domain = domainOf(emailOrDomain);
    // Call through globalThis so the browser keeps fetch's `this` binding ("Illegal invocation").
    const doFetch: FetchLike = fetchFn ?? ((url, init) => (globalThis as any).fetch(url, init));

    const base = emailServiceUrl.replace(/\/+$/, "");
    const response = await doFetch(
        `${base}/v1/registry/check?domain=${encodeURIComponent(domain)}`,
    );
    const data = await response.json();
    if (!data || typeof data.unsupported !== "boolean") {
        throw new Error(
            `Recovery service at ${base} did not answer the domain check for "${domain}" ` +
            `(got ${JSON.stringify(data)})`);
    }
    return {
        domain: data.domain ?? domain,
        known: data.known === true,
        shouldSendEmail: data.shouldSendEmail === true,
        unsupported: data.unsupported,
    };
}

/** The domain half of an address, or the input itself when it is already a bare domain. */
export function domainOf(emailOrDomain: string): string {
    const at = emailOrDomain.lastIndexOf("@");
    const domain = (at === -1 ? emailOrDomain : emailOrDomain.slice(at + 1)).trim().toLowerCase();
    if (domain === "") {
        throw new Error(`"${emailOrDomain}" has no email domain to check`);
    }
    return domain;
}
