import type { Processor, types } from '@nihilium/core';
import type { EvidenceMeta } from './types';

type SingleSealRequest = types.SingleSealRequest;
type SingleUnsealRequest = types.SingleUnsealRequest;

export async function buildEvidenceMeta(
  processor: Processor,
  request: SingleSealRequest | SingleUnsealRequest
): Promise<EvidenceMeta> {
  const keys = await processor.get_public_keys();
  const chainId = await processor.get_chain_id();
  const meta: EvidenceMeta = {
    chainId: String(chainId),
    signingPubKey: keys.signing_public_key as [string, string],
    hePubKey: keys.he_public_key as [string, string],
  };
  if ('hashed_unseal_condition_root' in request && request.hashed_unseal_condition_root) {
    meta.hashedUnsealRoot = request.hashed_unseal_condition_root;
  }
  return meta;
}
