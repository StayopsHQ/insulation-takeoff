const encoder = new TextEncoder();
// Hosted Workers cap PBKDF2 at 100,000 iterations even when local workerd does not.
// This is below current OWASP guidance. Keep the cost/version in each stored hash
// so a stronger scheme can be introduced without invalidating existing accounts.
export const PASSWORD_ITERATIONS = 100000;
const LEGACY_ITERATIONS = 310000;
const PREFIX = `pbkdf2-sha256$${PASSWORD_ITERATIONS}$`;

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: decode(salt), iterations, hash: "SHA-256"
  }, key, 256);
  return encode(new Uint8Array(bits));
}

function equalHashes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export async function passwordHash(password, salt) {
  return PREFIX + await derive(password, salt, PASSWORD_ITERATIONS);
}

export async function verifyPassword(password, salt, storedHash) {
  if (typeof storedHash !== "string") return false;
  if (storedHash.startsWith(PREFIX)) {
    const hash = storedHash.slice(PREFIX.length);
    if (!/^[A-Za-z0-9_-]{43}$/.test(hash)) return false;
    return equalHashes(await derive(password, salt, PASSWORD_ITERATIONS), hash);
  }
  // Preserve pre-existing local accounts. Never silently reinterpret their hashes
  // at the new iteration count. A hosted runtime may still reject this legacy cost.
  if (!/^[A-Za-z0-9_-]{43}$/.test(storedHash)) return false;
  return equalHashes(await derive(password, salt, LEGACY_ITERATIONS), storedHash);
}
