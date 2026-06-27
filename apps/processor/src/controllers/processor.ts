import { Request, Response } from 'express';
import { Processor } from '@nihilium/core';
import { SingleSealRequest, SingleUnsealRequest } from '@nihilium/core/dist/types/protocol/common';
import { buildEvidenceMeta } from '../evidence/helpers';
import { QuorumNotMetError, EvidenceStoreError } from '../evidence';

function sendEvidenceError(res: Response, error: unknown): void {
  if (error instanceof QuorumNotMetError) {
    res.status(503).json(error.toJSON());
    return;
  }
  if (error instanceof EvidenceStoreError) {
    res.status(503).json({ error: 'evidence_store_error', message: error.message });
    return;
  }
  console.error('Error processing data:', error);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Process data received from the client
 * @param req Express request object
 * @param res Express response object
 */
export const request_public_keys = async (req: Request, res: Response): Promise<void> => {
  try {
    const processor: Processor = req.app.locals.processor; 
    const public_keys = await processor.get_public_keys();
    
    const processedData = public_keys;
    
    res.status(200).json(processedData);
  } catch (error) {
    console.error('Error processing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 


export const identity = async (req: Request, res: Response): Promise<void> => {
  const processor: Processor = req.app.locals.processor; 
  const [public_keys, chain_id] = await Promise.all([processor.get_public_keys(), processor.get_chain_id()]);
  res.json({ result: {
      chained_proof_address: processor.get_chained_proof_address(),
      chain_id: chain_id.toString(),
      public_keys: [{signing_public_key:public_keys.signing_public_key, active:true}, {he_public_key:public_keys.he_public_key, active:true}],
  } });
}
export const request_seal = async (req: Request, res: Response): Promise<void> => {
  try {
    console.time("Seal Request")
    const data: SingleSealRequest = req.body;
    const processor: Processor = req.app.locals.processor;
    const evidenceStore = req.app.locals.evidenceStore;
    const seal_response = await processor.process_seal_request(data);
    const meta = await buildEvidenceMeta(processor, data);
    await evidenceStore.persist({
      op: 'seal',
      request: data,
      response: seal_response,
      meta,
    });
    console.timeEnd("Seal Request")
    res.status(200).json(seal_response);
  } catch (error) {
    sendEvidenceError(res, error);
  }
};

export const request_unseal = async (req: Request, res: Response): Promise<void> => {
  try {
    console.time("Unseal Request")
    const data: SingleUnsealRequest = req.body;
    const processor: Processor = req.app.locals.processor;
    const evidenceStore = req.app.locals.evidenceStore;
    const unseal_response = await processor.process_unseal_request(data);
    const meta = await buildEvidenceMeta(processor, data);
    await evidenceStore.persist({
      op: 'unseal',
      request: data,
      response: unseal_response,
      meta,
    });
    console.timeEnd("Unseal Request")
    res.status(200).json(unseal_response);
  } catch (error) {
    sendEvidenceError(res, error);
  }
};
