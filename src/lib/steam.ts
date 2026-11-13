/* ------------------------------------------------------------------ *
 * Steam identifiers. Deadlock API uses the 32-bit `account_id` (SteamID3);
 * Steam profile links and Steam login (stage 2) give the 64-bit SteamID64.
 *   account_id = steam64 − 76561197960265728
 * ------------------------------------------------------------------ */
const STEAM64_BASE = 76561197960265728n;

export const steam64ToAccountId = (steam64: string | bigint) => Number(BigInt(steam64) - STEAM64_BASE);
export const accountIdToSteam64 = (accountId: number) => (BigInt(accountId) + STEAM64_BASE).toString();

/**
 * Turns whatever the user pasted into an account id, when it can be resolved without a Steam API key:
 *   "123456789" (account id), "7656119…" (SteamID64), "[U:1:123456789]" (SteamID3),
 *   "steamcommunity.com/profiles/7656119…". Vanity URLs (/id/name) and nicknames return null →
 *   the caller falls back to a name search.
 */
export function parseAccountInput(raw: string): number | null {
  const s = raw.trim();
  const profile = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profile) return steam64ToAccountId(profile[1]);
  const id3 = s.match(/^\[?U:1:(\d+)\]?$/i);
  if (id3) return Number(id3[1]);
  if (/^7656119\d{10}$/.test(s)) return steam64ToAccountId(s);
  if (/^\d{1,10}$/.test(s) && Number(s) > 0 && Number(s) < 2 ** 32) return Number(s);
  return null;
}

/** Name to search for when the input is a vanity URL ("steamcommunity.com/id/name" → "name") or a nickname. */
export function searchTermFromInput(raw: string): string {
  const vanity = raw.trim().match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  return vanity ? decodeURIComponent(vanity[1]) : raw.trim();
}
