import { NihiliumJwtVerifier } from './nihilium-jwt';
import type { PaymentVerifier } from './types';

export type { PaymentContext, PaymentVerifier } from './types';
export { NihiliumJwtVerifier } from './nihilium-jwt';
export { makePaymentMiddleware } from './middleware';
export { RequestIdStore } from './dedup';

/**
 * Build a PaymentVerifier from environment variables.
 * Returns null when NIHILIUM_JWKS_URL is not set (dev / no-payment mode).
 *
 * Required env vars (when payment is enabled):
 *   NIHILIUM_JWKS_URL    — e.g. https://api.nihilium.io/.well-known/jwks.json
 *   NIHILIUM_JWT_ISSUER  — e.g. https://api.nihilium.io
 */
export function buildPaymentVerifier(
  env: NodeJS.ProcessEnv,
  processorId: string,
): PaymentVerifier | null {
  const { NIHILIUM_JWKS_URL, NIHILIUM_JWT_ISSUER } = env;

  if (!NIHILIUM_JWKS_URL) return null;

  if (!NIHILIUM_JWT_ISSUER) {
    throw new Error('NIHILIUM_JWT_ISSUER must be set when NIHILIUM_JWKS_URL is configured');
  }

  return new NihiliumJwtVerifier({
    jwksUrl: NIHILIUM_JWKS_URL,
    issuer: NIHILIUM_JWT_ISSUER,
    processorId,
  });
}
