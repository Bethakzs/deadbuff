/* ------------------------------------------------------------------ *
 * Password hashing: PBKDF2-SHA256 via Web Crypto (native in Workers, no WASM).
 * Stored as `pbkdf2_sha256$<iterations>$<salt b64url>$<hash b64url>` so the
 * iteration count can change without breaking existing hashes.
 * ------------------------------------------------------------------ */
import { b64url, fromB64url } from './http';

const PREFIX = 'pbkdf2_sha256';
/** Workers refuses more than 100000 rounds. */
const MAX_ROUNDS = 100_000;
const DEFAULT_ROUNDS = 60_000;

export function roundsFrom(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 10_000 ? Math.min(n, MAX_ROUNDS) : DEFAULT_ROUNDS;
}

async function derive(password: string, salt: Uint8Array, rounds: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, rounds: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, rounds);
  return `${PREFIX}$${rounds}$${b64url(salt)}$${b64url(hash)}`;
}

/** `rounds` is what the stored hash used — the caller re-hashes when it is below the current setting. */
export async function verifyPassword(password: string, stored: string | null): Promise<{ ok: boolean; rounds: number }> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, rounds: 0 };
  const rounds = Number(parts[1]);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) return { ok: false, rounds: 0 };
  const expected = fromB64url(parts[3]);
  const actual = await derive(password, fromB64url(parts[2]), rounds);
  // constant-time compare
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i];
  return { ok: diff === 0, rounds };
}
