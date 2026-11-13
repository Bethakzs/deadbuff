/* Small HTTP helpers shared by the Pages Functions. */

export function json(data: unknown, init: ResponseInit = {}, cookies: string[] = []): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** Error answer: `{ error: code }` — the SPA translates the code. */
export const fail = (error: string, status = 400, cookies: string[] = []) => json({ error }, { status }, cookies);

/** Body of a JSON request, or null when it isn't JSON, is too big or doesn't parse. */
export async function readJson<T>(req: Request, max = 8192): Promise<T | null> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * CSRF guard for state-changing requests: browsers always send Origin on a fetch() POST/DELETE,
 * and it must be our own host. (The session cookie is SameSite=Lax as well.)
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return host === new URL(req.url).host || host === req.headers.get('host');
  } catch {
    return false;
  }
}

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'local';

/** Value of one cookie from the Cookie header. */
export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/** A same-site path to send the user back to (never another host: "//evil.com" or "/\\evil.com" are refused). */
export function safeNext(raw: string | null | undefined, fallback = '/me'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.length > 300) return fallback;
  return raw;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const randomToken = (bytes = 18) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
