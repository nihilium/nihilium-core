import express from 'express';
import { identity, request_public_keys, request_seal, request_unseal } from '../controllers/processor';
import { makePaymentMiddleware } from '../payment';

export const router = express.Router();

router.get('/status', (req, res) => {
  res.status(200).json({ message: 'API is working' });
});

router.get('/get_public_keys', request_public_keys);
router.get('/identity', identity);

// Payment required at seal time only. Unseal is always free — protocol guarantee.
router.post('/request_seal', (req, res, next) => {
  const verifier = req.app.locals.paymentVerifier;
  if (verifier) return makePaymentMiddleware(verifier)(req, res, next);
  next();
}, request_seal);

router.post('/request_unseal', express.json({ limit: '10mb' }), request_unseal);

export default router;
