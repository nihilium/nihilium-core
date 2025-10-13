import { Request, Response } from 'express';
import { Processor } from '@nihilium/privacy-lib/dist/lib/processor';
import { SingleSealRequest, SingleUnsealRequest } from '@nihilium/privacy-lib/dist/types/protocol/common';
/**
 * Process data received from the client
 * @param req Express request object
 * @param res Express response object
 */
export const request_public_keys = async (req: Request, res: Response): Promise<void> => {
  try {
    const processor: Processor = req.app.locals.processor; 
    const public_keys = await processor.get_public_keys();
    
    // Process the data (example)
    const processedData = public_keys;
    
    // Return the processed data
    res.status(200).json(processedData);
  } catch (error) {
    console.error('Error processing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 


export const identity = async (req: Request, res: Response): Promise<void> => {
  const processor: Processor = req.app.locals.processor; 
  const public_keys = await processor.get_public_keys();
  res.json({ result: {
      chained_proof_address: processor.get_chained_proof_address(),
      
      chain_id: processor.get_chain_id().toString(),
      public_keys: [{signing_public_key:public_keys.signing_public_key, active:true}, {he_public_key:public_keys.he_public_key, active:true}],
  } });
}
export const request_seal = async (req: Request, res: Response): Promise<void> => {
  try {
    console.time("Seal Request")
    const data:SingleSealRequest = req.body;
    const processor: Processor = req.app.locals.processor; 
    const seal_response = await processor.process_seal_request(data);
    console.timeEnd("Seal Request")
    res.status(200).json(seal_response);
  } catch (error) {
    console.error('Error processing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const request_unseal = async (req: Request, res: Response): Promise<void> => {
  try {
    console.time("Unseal Request")
    const data:SingleUnsealRequest = req.body;
    const processor: Processor = req.app.locals.processor; 
    const unseal_response = await processor.process_unseal_request(data);
    console.timeEnd("Unseal Request")
    res.status(200).json(unseal_response);
  } catch (error) {
    console.error('Error processing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};