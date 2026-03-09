export function getSubtle(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle !== "undefined") {
    return globalThis.crypto.subtle;
  }
  // Node.js < 19 fallback
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { webcrypto } = require("crypto");
  return webcrypto.subtle;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues !== "undefined") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomFillSync } = require("crypto");
    randomFillSync(buf);
  }
  return buf;
}
