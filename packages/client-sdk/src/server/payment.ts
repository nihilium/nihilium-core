/**
 * Server-side payment helper for the Nihilium protocol.
 *
 * Developers instantiate this class on their own server (where the API key is safe)
 * and expose a token endpoint that the client SDK's NihiliumPaymentProvider calls.
 *
 * Flow:
 *   Browser (NihiliumPaymentProvider)
 *     → Developer server (NihiliumServerPayment)
 *       → Nihilium backend (api/get-processor-token)
 */
export class NihiliumServerPayment {
  constructor(
    private readonly nihiliumBackendUrl: string,
    private readonly apiKey: string,
  ) {}

  async getProcessorToken(processorId: string, requestId: string): Promise<string> {
    const res = await fetch(`${this.nihiliumBackendUrl}/api/get-processor-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ processorId, requestId }),
    });
    if (!res.ok) {
      throw new Error(`Nihilium backend error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}
