export type {
  BJJPoint,
  BJJKeypair,
  ProcessorPayload,
  AONAEPayload,
  AONAECiphertext,
  Argon2Params,
  SignalCommitment,
} from "./types.js";

export { getSubtle, randomBytes } from "./crypto-env.js";

export { generateKeypair, ecdh, getBJJ } from "./bjj-ecdh.js";

export { deriveKey, generateSalt, DEFAULT_ARGON2_PARAMS } from "./kdf.js";

export { aontEncode, aontDecode } from "./aont.js";

export { encrypt, decrypt } from "./aes-gcm.js";

export { serializePayload, deserializePayload } from "./payload.js";

export { seal, unseal, unsealAsProcessor } from "./aonae.js";
export type { SealResult } from "./aonae.js";

export { verifySignal } from "./signal.js";
