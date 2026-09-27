import * as LegacyFS from 'expo-file-system/legacy';
import { Post } from '../types';

// The first feed page, kept on the device so a launch paints the feed at once
// (and picks its masthead from it) instead of showing the loading screen and
// then swapping everything in. The network refresh lands on top silently.
// Only server results are stored - never optimistic local posts.
//
// Read once before the first render (App waits for it alongside the fonts),
// then consumed synchronously by the feed and the masthead.
const FILE = LegacyFS.documentDirectory + 'feed-page.json';
const VERSION = 1;
const MAX_POSTS = 20;

type Stored = { version: typeof VERSION; savedAt: number; posts: Post[]; next: string | null };

let boot: Stored | null = null;

export const loadBootFeed = async () => {
  try {
    const info = await LegacyFS.getInfoAsync(FILE);
    if (!info.exists) return;
    const data = JSON.parse(await LegacyFS.readAsStringAsync(FILE));
    if (data?.version === VERSION && Array.isArray(data.posts) && data.posts.length > 0) {
      boot = data;
    }
  } catch {
    // unreadable cache: behave as a first launch
  }
};

// null on a first launch (or after a reset) - the one time the loading screen shows
export const bootFeed = () => boot;

export const saveBootFeed = (posts: Post[], next: string | null) => {
  const stored: Stored = { version: VERSION, savedAt: Date.now(), posts: posts.slice(0, MAX_POSTS), next };
  LegacyFS.writeAsStringAsync(FILE, JSON.stringify(stored)).catch(() => {});
};

export const clearBootFeed = async () => {
  boot = null;
  await LegacyFS.deleteAsync(FILE, { idempotent: true });
};
