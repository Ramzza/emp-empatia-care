export async function hashCnp(value: string): Promise<string> {
  if (!/^\d{13}$/.test(value)) throw new Error("CNP must contain exactly 13 digits.");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex;
}
