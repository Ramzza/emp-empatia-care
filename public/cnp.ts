export async function hashCnp(cnp: string): Promise<string> {
  const normalized = cnp.trim();
  if (!/^\d{13}$/.test(normalized)) {
    throw new Error("CNP must contain exactly 13 digits.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  let hash = "";
  for (const byte of new Uint8Array(digest)) {
    hash += byte.toString(16).padStart(2, "0");
  }
  return hash;
}
