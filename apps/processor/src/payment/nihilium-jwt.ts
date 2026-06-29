import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';
import type { PaymentContext, PaymentVerifier } from './types';
import { RequestIdStore } from './dedup';

function hashBody(body: unknown): string {
  return '0x' + createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export type NihiliumJwtConfig = {
  jwksUrl: string;
  issuer: string;
  processorId: string;
};

export class NihiliumJwtVerifier implements PaymentVerifier {
  readonly name = 'nihilium-jwt';

  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly processorId: string;
  private readonly dedup = new RequestIdStore();

  constructor(config: NihiliumJwtConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl));
    this.issuer = config.issuer;
    this.processorId = config.processorId;
  }

  async verify(req: Request): Promise<PaymentContext> {
    const authHeader = req.headers['authorization'];
    if (!authHeader) throw new Error('Missing Authorization header');

    const token = authHeader.replace(/^Bearer\s+/i, '');

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      algorithms: ['EdDSA'],
    });

    if (payload['type'] !== 'processor_token') {
      throw new Error(`Invalid token type: expected processor_token, got ${payload['type']}`);
    }

    if (payload.sub?.toLowerCase() !== this.processorId.toLowerCase()) {
      throw new Error('Token sub does not match this processor');
    }

    const requestId = payload['request_id'];
    if (typeof requestId !== 'string' || !requestId) {
      throw new Error('Missing or invalid request_id claim');
    }

    const amountCharged = payload['amount_charged'];
    if (typeof amountCharged !== 'string') {
      throw new Error('Missing or invalid amount_charged claim');
    }

    if (typeof payload.exp !== 'number') {
      throw new Error('Missing exp claim');
    }

    // Bind token to this exact payload — prevents reuse of a valid token with a different body.
    const bodyHash = hashBody(req.body);
    if (requestId !== bodyHash) {
      throw new Error(`request_id does not match request body hash (got ${bodyHash})`);
    }

    // Replay check — must come after exp/signature validation so replays of expired
    // tokens are caught by jose before hitting the dedup store.
    if (this.dedup.record(requestId, payload.exp)) {
      throw new Error(`Replayed request_id: ${requestId}`);
    }

    return { requestId, amountCharged };
  }
}
