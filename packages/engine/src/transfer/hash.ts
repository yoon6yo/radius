import type { Sha256 } from "./types";

export const webCryptoSha256: Sha256 = async (data) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>));

/** Root = SHA-256 over all block hashes in (file, block) order. */
export async function rootHash(sha: Sha256, hashes: Uint8Array[]): Promise<Uint8Array> {
  const all = new Uint8Array(hashes.length * 32);
  hashes.forEach((h, i) => all.set(h, i * 32));
  return sha(all);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
