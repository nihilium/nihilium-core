import type { RequestHandler } from 'express';
import type { PaymentVerifier } from './types';

export function makePaymentMiddleware(verifier: PaymentVerifier): RequestHandler {
  return async (req, res, next) => {
    try {
      res.locals.payment = await verifier.verify(req);
      next();
    } catch (err) {
      res.status(401).json({
        error: 'payment_verification_failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
