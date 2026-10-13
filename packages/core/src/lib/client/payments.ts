import { sha256, toUtf8Bytes } from 'ethers';

/** What a `PaymentProvider` returns for one processor share of a seal. */
export interface ProcessorToken {
  /** EdDSA JWT bound to one processor and one request body; the processor accepts it once. */
  token: string;
  /** ISO-8601 expiry, or "" when the issuer did not say. */
  expires_at: string;
  /** The token's own `amount_charged` claim, decoded without verification: informational only. */
  amountCharged: string;
}

export interface PaymentProvider {
  /**
   * Returns a Bearer token string authorising a seal request.
   * @param processorId  Ethereum address of the target processor.
   * @param requestId    0x-prefixed SHA-256 hex of the JSON-serialised request body.
   */
  getProcessorToken(processorId: string, requestId: string): Promise<ProcessorToken>;
}

/**
 * The route that mints processor tokens. The Nihilium backend serves it, and a developer's server
 * proxying for `NihiliumPaymentProvider` must serve it too. The body is `{ processorAddress, requestId }`.
 */
export const PROCESSOR_TOKEN_PATH = '/api/request-processor-token';

/**
 * Compute the canonical request ID for a seal request body.
 * Must produce the same value as the processor's nihilium-jwt verifier.
 */
export function hashRequestBody(body: unknown): string {
  // bigint values (e.g. field-element template inputs) are not JSON-serializable by default — stringify them.
  return sha256(toUtf8Bytes(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value))));
}

/**
 * Bring a token response into the `ProcessorToken` shape.
 *
 * The Nihilium backend answers `{ token, expiresAt }`, with no charge field. A developer's proxy
 * may answer either that or the `ProcessorToken` shape. Both are accepted. A missing charge is read
 * from the JWT's `amount_charged` claim.
 */
export function normalizeProcessorToken(body: unknown): ProcessorToken {
  const raw = (body ?? {}) as { token?: unknown; expires_at?: unknown; expiresAt?: unknown; amountCharged?: unknown };
  if (typeof raw.token !== 'string' || raw.token === '') {
    throw new Error('Payment response carried no token.');
  }
  const expires = raw.expires_at ?? raw.expiresAt;
  return {
    token: raw.token,
    expires_at: typeof expires === 'string' ? expires : '',
    amountCharged: typeof raw.amountCharged === 'string' ? raw.amountCharged : amountChargedClaim(raw.token),
  };
}

/** The JWT's `amount_charged` claim, unverified. The processor does the verifying. */
function amountChargedClaim(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return 'unknown';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { amount_charged?: unknown };
    return claims.amount_charged === undefined ? 'unknown' : String(claims.amount_charged);
  } catch {
    return 'unknown';
  }
}

export interface NihiliumPaymentProviderOptions {
  /**
   * Extra request headers, typically a credential your server uses to tell its own users from
   * anyone else who can reach it. A function is called for every token, so a session can be read
   * fresh each time.
   */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
}

/**
 * Client-side PaymentProvider that delegates to the developer's server.
 * The developer's server holds the Nihilium API key and proxies requests
 * to the Nihilium backend — the API key never reaches the browser.
 *
 * The server serves `PROCESSOR_TOKEN_PATH`; `NihiliumServerPayment` in
 * `@nihilium/client-sdk/server` is the Node half. The proxy spends the developer's
 * credits, so pass `headers` with a credential the server checks.
 */
export class NihiliumPaymentProvider implements PaymentProvider {
  constructor(
    private readonly developerServerUrl: string,
    private readonly options: NihiliumPaymentProviderOptions = {},
  ) {}

  async getProcessorToken(processorAddress: string, requestId: string): Promise<ProcessorToken> {
    const extra = typeof this.options.headers === 'function' ? await this.options.headers() : this.options.headers;
    const res = await fetch(`${this.developerServerUrl}${PROCESSOR_TOKEN_PATH}`, {
      method: 'POST',
      headers: { ...extra, 'Content-Type': 'application/json' },
      body: JSON.stringify({ processorAddress, requestId }),
    });
    if (!res.ok) {
      throw new Error(`Payment proxy error ${res.status}: ${await res.text()}`);
    }
    return normalizeProcessorToken(await res.json());
  }
}



/**
 * PaymentProvider for processors that do not charge. It sends no token.
 * This is the `NihiliumSealingClient` default, so a seal against a paid processor
 * fails at the processor with a 401 instead of being paid for silently.
 */
export class NihiliumPaymentProviderUnauthenticated implements PaymentProvider {
  async getProcessorToken(processorAddress: string, requestId: string): Promise<ProcessorToken> {
    return { token: "", expires_at: "", amountCharged: "0" };
  }
}



/**
 * Client-side PaymentProvider that uses the client's API key to directly request tokens from the Nihilium backend.
 * Do not use in production: Exposes the API key in client code.
 */
export class NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE implements PaymentProvider {
  constructor(
    private readonly nihiliumBackendUrl: string,
    private readonly apiKey: string,
  ) {}

  async getProcessorToken(processorAddress: string, requestId: string): Promise<ProcessorToken> {
    const res = await fetch(`${this.nihiliumBackendUrl}${PROCESSOR_TOKEN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ processorAddress, requestId }),
    });
    if (!res.ok) {
      throw new Error(`Nihilium backend error ${res.status}: ${await res.text()}`);
    }
    return normalizeProcessorToken(await res.json());
  }
}
