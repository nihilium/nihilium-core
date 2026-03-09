import type { AONAEPayload, ProcessorPayload } from "./types.js";

/**
 * Serialize an AONAE payload to bytes.
 *
 * Format:
 *   [4 bytes content length] [content]
 *   [4 bytes peer count]
 *   For each peer:
 *     [4 bytes processorId length] [processorId as UTF-8]
 *     [4 bytes ciphertexts length] [ciphertexts]
 *     [4 bytes commitment length]  [commitment]
 *     [4 bytes metadata length]    [metadata]
 *   [32 bytes signal]
 *   [32 bytes nonce]
 */
export function serializePayload(payload: AONAEPayload): Uint8Array {
  const parts: Uint8Array[] = [];

  // Content
  parts.push(uint32(payload.content.length));
  parts.push(payload.content);

  // Peer payloads
  parts.push(uint32(payload.peerPayloads.length));
  for (const peer of payload.peerPayloads) {
    const idBytes = new TextEncoder().encode(peer.processorId);
    parts.push(uint32(idBytes.length));
    parts.push(idBytes);
    parts.push(uint32(peer.ciphertexts.length));
    parts.push(peer.ciphertexts);
    parts.push(uint32(peer.commitment.length));
    parts.push(peer.commitment);
    parts.push(uint32(peer.metadata.length));
    parts.push(peer.metadata);
  }

  // Signal and nonce (fixed 32 bytes each)
  parts.push(payload.signal);
  parts.push(payload.nonce);

  return concat(parts);
}

export function deserializePayload(data: Uint8Array): AONAEPayload {
  let offset = 0;

  function readUint32(): number {
    const val = new DataView(
      data.buffer, data.byteOffset + offset, 4
    ).getUint32(0, true);
    offset += 4;
    return val;
  }

  function readBytes(len: number): Uint8Array {
    const slice = data.slice(offset, offset + len);
    offset += len;
    return slice;
  }

  const contentLen = readUint32();
  const content = readBytes(contentLen);

  const peerCount = readUint32();
  const peerPayloads: ProcessorPayload[] = [];
  for (let i = 0; i < peerCount; i++) {
    const idLen = readUint32();
    const processorId = new TextDecoder().decode(readBytes(idLen));
    const ctLen = readUint32();
    const ciphertexts = readBytes(ctLen);
    const comLen = readUint32();
    const commitment = readBytes(comLen);
    const metaLen = readUint32();
    const metadata = readBytes(metaLen);
    peerPayloads.push({ processorId, ciphertexts, commitment, metadata });
  }

  const signal = readBytes(32);
  const nonce = readBytes(32);

  return { content, peerPayloads, signal, nonce };
}

// --- helpers ---

function uint32(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, n, true);
  return buf;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
