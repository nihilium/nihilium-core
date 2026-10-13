import { PROCESSOR_TOKEN_PATH, normalizeProcessorToken } from '@nihilium/core';
import type { PaymentProvider, ProcessorToken } from '@nihilium/core';

/**
 * Server-side payment helper for the Nihilium protocol.
 *
 * Developers instantiate this class on their own server (where the API key is safe)
 * and expose a token endpoint that the client SDK's NihiliumPaymentProvider calls.
 *
 * Flow:
 *   Browser (NihiliumPaymentProvider)
 *     → Developer server (NihiliumServerPayment), at PROCESSOR_TOKEN_PATH
 *       → Nihilium backend (PROCESSOR_TOKEN_PATH, X-API-Key)
 *
 * That endpoint spends the developer's credits. It must check its own caller (for example
 * a session, sent through `NihiliumPaymentProvider`'s `headers` option) before calling this.
 *
 * Also a `PaymentProvider` itself, so a Node process that seals directly can pass it as `payment`.
 */
export class NihiliumServerPayment implements PaymentProvider {
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
