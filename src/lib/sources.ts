/*
 * Names and groups the visit sources of /admin. The server stores what the browser tells: the referrer host
 * ("google.com.ua", an Android app id for app referrers) or, for a tagged link without one, "#ref=twitch"
 * (see server/stats.ts visitSource). Google never passes the search words, so "Search · Google" is as far as
 * a single visit goes.
 */

export type SourceKind = 'search' | 'ai' | 'social' | 'partner' | 'site' | 'tag' | 'direct';
/** Display order of the groups. */
export const SOURCE_KINDS: SourceKind[] = ['search', 'ai', 'social', 'partner', 'site', 'tag', 'direct'];

export interface SourceInfo {
  kind: SourceKind;
  /** brand name ("Google", "Twitch") or the host / tag itself; "" for direct */
  name: string;
}

type Entry = [SourceKind, string];

/** Android app referrers: "android-app://<id>/…" (the host is the app id). */
const APPS: Record<string, Entry> = {
  'com.google.android.googlequicksearchbox': ['search', 'Google app'],
  'com.google.android.gm': ['site', 'Gmail'],
  'com.openai.chatgpt': ['ai', 'ChatGPT'],
  'org.telegram.messenger': ['social', 'Telegram'],
  'com.discord': ['social', 'Discord'],
  'com.reddit.frontpage': ['social', 'Reddit'],
  'com.google.android.youtube': ['social', 'YouTube'],
  'tv.twitch.android.app': ['social', 'Twitch'],
  'com.twitter.android': ['social', 'X'],
  'com.instagram.android': ['social', 'Instagram'],
  'com.facebook.katana': ['social', 'Facebook'],
  'com.zhiliaoapp.musically': ['social', 'TikTok'],
  'com.valvesoftware.android.steam.community': ['social', 'Steam'],
};

/** Domains, matched on the host or any parent domain ("m.twitch.tv" → "twitch.tv"). */
const SITES: Record<string, Entry> = {
  'mail.google.com': ['site', 'Gmail'],
  'gemini.google.com': ['ai', 'Gemini'],
  'chatgpt.com': ['ai', 'ChatGPT'],
  'chat.openai.com': ['ai', 'ChatGPT'],
  'perplexity.ai': ['ai', 'Perplexity'],
  'copilot.microsoft.com': ['ai', 'Copilot'],
  'claude.ai': ['ai', 'Claude'],
  'grok.com': ['ai', 'Grok'],
  'deepseek.com': ['ai', 'DeepSeek'],
  'you.com': ['ai', 'You.com'],
  'phind.com': ['ai', 'Phind'],
  'bing.com': ['search', 'Bing'],
  'duckduckgo.com': ['search', 'DuckDuckGo'],
  'search.brave.com': ['search', 'Brave Search'],
  'ecosia.org': ['search', 'Ecosia'],
  'search.yahoo.com': ['search', 'Yahoo'],
  'ya.ru': ['search', 'Yandex'],
  'startpage.com': ['search', 'Startpage'],
  'qwant.com': ['search', 'Qwant'],
  'baidu.com': ['search', 'Baidu'],
  'naver.com': ['search', 'Naver'],
  'seznam.cz': ['search', 'Seznam'],
  'twitch.tv': ['social', 'Twitch'],
  'youtube.com': ['social', 'YouTube'],
  'youtu.be': ['social', 'YouTube'],
  'reddit.com': ['social', 'Reddit'],
  'discord.com': ['social', 'Discord'],
  'discordapp.com': ['social', 'Discord'],
  't.me': ['social', 'Telegram'],
  'telegram.org': ['social', 'Telegram'],
  'x.com': ['social', 'X'],
  't.co': ['social', 'X'],
  'twitter.com': ['social', 'X'],
  'facebook.com': ['social', 'Facebook'],
  'instagram.com': ['social', 'Instagram'],
  'tiktok.com': ['social', 'TikTok'],
  'vk.com': ['social', 'VK'],
  'steamcommunity.com': ['social', 'Steam'],
  'steampowered.com': ['social', 'Steam'],
  'threads.net': ['social', 'Threads'],
  'bsky.app': ['social', 'Bluesky'],
  'linkedin.com': ['social', 'LinkedIn'],
  'deadlock-api.com': ['partner', 'Deadlock API'],
};

/** Tag values without a dot ("?ref=twitch", "via=facebook") → the same brands by name. */
const NAMES: Record<string, Entry> = Object.fromEntries(
  [...Object.values(APPS), ...Object.values(SITES)].map((e) => [e[1].toLowerCase().replace(/\s+/g, ''), e]),
);

/** The search page itself only: google.com, google.com.ua, google.de (mail.google.com etc. are other sites). */
const GOOGLE = /^google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const YANDEX = /^yandex\.[a-z]{2,3}(\.[a-z]{2})?$/;

function lookup(raw: string): Entry | undefined {
  const host = raw.toLowerCase().replace(/^www\./, '');
  if (APPS[host]) return APPS[host];
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (SITES[h]) return SITES[h];
  if (GOOGLE.test(host)) return ['search', 'Google'];
  if (YANDEX.test(host)) return ['search', 'Yandex'];
  return NAMES[host.replace(/[\s_-]+/g, '')];
}

/** "ref=twitch · utm_medium=panel" → "twitch" (the first tag that names a source). */
export function tagName(tag: string): string {
  return tag.match(/(?:^|· )(?:ref|utm_source|src|source|from|via)=([^·]+)/)?.[1].trim() ?? tag;
}

/** A source key of the report: referrer host, "#<tags>" or "" (direct). */
export function sourceInfo(key: string | null | undefined): SourceInfo {
  if (!key) return { kind: 'direct', name: '' };
  if (key.startsWith('#')) {
    const name = tagName(key.slice(1));
    const hit = lookup(name);
    return hit ? { kind: hit[0], name: hit[1] } : { kind: 'tag', name };
  }
  const hit = lookup(key);
  return hit ? { kind: hit[0], name: hit[1] } : { kind: 'site', name: key };
}

/** "/r/DeadlockTheGame/comments/abc" with %-escapes decoded where possible. */
export function readablePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}
