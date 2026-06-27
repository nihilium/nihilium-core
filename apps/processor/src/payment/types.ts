import type { Request } from 'express';

export type PaymentContext = {
  requestId: string;
  amountCharged: string;
};

export interface PaymentVerifier {
  readonly name: string;
  /**
   * Resolves with payment context on success; throws on any verification failure.
   * The middleware translates thrown errors into 401 responses.
   */
  verify(req: Request): Promise<PaymentContext>;
}
