import { sha256, toUtf8Bytes } from 'ethers';

export interface PaymentProvider {
  /**
   * Returns a Bearer token string authorising a seal request.
   * @param processorId  Ethereum address of the target processor.
   * @param requestId    0x-prefixed SHA-256 hex of the JSON-serialised request body.
   */
  getProcessorToken(processorId: string, requestId: string): Promise<{token: string, expires_at: string, amountCharged: string}>;
}

/**
 * Compute the canonical request ID for a seal request body.
 * Must produce the same value as the processor's nihilium-jwt verifier.
 */
export function hashRequestBody(body: unknown): string {
  // bigint values (e.g. field-element template inputs) are not JSON-serializable by default — stringify them.
  return sha256(toUtf8Bytes(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value))));
}

/**
 * Client-side PaymentProvider that delegates to the developer's server.
 * The developer's server holds the Nihilium API key and proxies requests
 * to the Nihilium backend — the API key never reaches the browser.
 */
export class NihiliumPaymentProvider implements PaymentProvider {
  constructor(private readonly developerServerUrl: string) {}

  async getProcessorToken(processorAddress: string, requestId: string): Promise<{token: string, expires_at: string, amountCharged: string}> {
    const res = await fetch(`${this.developerServerUrl}/api/request-processor-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processorAddress, requestId }),
    });
    if (!res.ok) {
      throw new Error(`Payment proxy error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}



/**
 * Client-side PaymentProvider that delegates to the developer's server.
 * The developer's server holds the Nihilium API key and proxies requests
 * to the Nihilium backend — the API key never reaches the browser.
 */
export class NihiliumPaymentProviderUnauthenticated implements PaymentProvider {
  async getProcessorToken(processorAddress: string, requestId: string): Promise<{token: string, expires_at: string, amountCharged: string}> {
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

  async getProcessorToken(processorAddress: string, requestId: string): Promise<{token: string, expires_at: string, amountCharged: string}> {
    const res = await fetch(`${this.nihiliumBackendUrl}/api/request-processor-token`, {
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
    return res.json();
  }
}