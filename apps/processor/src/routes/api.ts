import express from 'express';
import { request_public_keys, request_seal, request_unseal } from '../controllers/processor';

export const router = express.Router();

// Example route
router.get('/status', (req, res) => {
  res.status(200).json({ message: 'API is working' });
});

// Process data endpoint
router.get('/get_public_keys', request_public_keys);
router.post('/request_seal', request_seal);
router.post('/request_unseal', express.json({ limit: '10mb' }), request_unseal);

export default router; 