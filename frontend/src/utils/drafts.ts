import * as LegacyFS from 'expo-file-system/legacy';
import { CanvasState } from '../types/canvas';
import { RepostData } from '../types';
import { hasDraftContent } from './canvasState';

// Drafts: canvases kept on this device until they are posted or deleted.
//
// Every composer session is a draft. It saves itself as you work, so walking
// away loses nothing, and the "current" draft - the one you last walked away
// from - is what the + button reopens. Opening "New" from the drafts grid
// leaves it in the list and starts a blank canvas instead.
//
// Read once before the first render (App waits for it, like the boot feed),
// so the composer can open straight onto a draft; writes go to disk in the
// background, one at a time.
const DIR = LegacyFS.documentDirectory + 'drafts/';
const INDEX = DIR + 'index.json';
const VERSION = 1;

export interface Draft {
  id: string;
  updatedAt: number;
  state: CanvasState;
  // A quote keeps the post it quotes, so reopening needs no network
  repostData?: RepostData;
  thumb?: string; // file:// snapshot of the whole canvas
  // Where the content sits in it (screen points), so the list can show the
  // post's band the way the feed would rather than a mostly empty screen
  focus?: { top: number; bottom: number };
}

type Stored = { version: typeof VERSION; current: string | null; drafts: Draft[] };

let store: Stored = { version: VERSION, current: null, drafts: [] };
const listeners = new Set<() => void>();

let writing: Promise<void> = Promise.resolve();
const persist = () => {
  const snapshot = JSON.stringify(store);
  writing = writing
    .then(() => LegacyFS.makeDirectoryAsync(DIR, { intermediates: true }))
    .then(() => LegacyFS.writeAsStringAsync(INDEX, snapshot))
    .catch(error => console.log('Draft save failed:', error));
  listeners.forEach(fn => fn());
};

export const loadDrafts = async () => {
  try {
    const info = await LegacyFS.getInfoAsync(INDEX);
    if (!info.exists) return;
    const data = JSON.parse(await LegacyFS.readAsStringAsync(INDEX));
    if (data?.version === VERSION && Array.isArray(data.drafts)) store = data;
  } catch {
    // unreadable index: start with no drafts rather than not at all
  }
};

export const onDraftsChanged = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

// Newest first
export const listDrafts = (): Draft[] =>
  [...store.drafts].sort((a, b) => b.updatedAt - a.updatedAt);

export const getDraft = (id: string) => store.drafts.find(d => d.id === id) ?? null;

// The canvas the + button reopens, if one was left unfinished
export const currentDraft = () => (store.current ? getDraft(store.current) : null);

export const newDraftId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Save a canvas as you work: a canvas with nothing on it is not a draft, so
// emptying one deletes it. Saving also makes it the one + reopens.
export const saveDraft = (id: string, state: CanvasState, repostData?: RepostData) => {
  if (!hasDraftContent(state)) {
    removeDraft(id);
    return;
  }
  const existing = getDraft(id);
  const draft: Draft = { ...existing, id, updatedAt: Date.now(), state, repostData };
  store = {
    ...store,
    current: id,
    drafts: existing ? store.drafts.map(d => (d.id === id ? draft : d)) : [...store.drafts, draft],
  };
  persist();
};

// Keep a fresh snapshot for the drafts list. Each gets its own file name, so the
// image cache never shows a stale one.
export const saveDraftThumb = async (
  id: string,
  capturedUri: string,
  focus?: { top: number; bottom: number },
) => {
  const draft = getDraft(id);
  if (!draft) return;
  const to = `${DIR}${id}-${Date.now()}.jpg`;
  try {
    await LegacyFS.makeDirectoryAsync(DIR, { intermediates: true });
    // copied, not moved: the capture sits in a folder the app may only read
    await LegacyFS.copyAsync({ from: capturedUri, to });
  } catch (error) {
    console.log('Draft thumbnail failed:', error);
    return;
  }
  const old = draft.thumb;
  store = { ...store, drafts: store.drafts.map(d => (d.id === id ? { ...d, thumb: to, focus } : d)) };
  persist();
  if (old) LegacyFS.deleteAsync(old, { idempotent: true }).catch(() => {});
};

export const removeDraft = (id: string) => {
  const draft = getDraft(id);
  if (!draft && store.current !== id) return;
  store = {
    ...store,
    current: store.current === id ? null : store.current,
    drafts: store.drafts.filter(d => d.id !== id),
  };
  persist();
  if (draft?.thumb) LegacyFS.deleteAsync(draft.thumb, { idempotent: true }).catch(() => {});
};

// Nothing to reopen: + starts blank (a draft stays in the list)
export const clearCurrentDraft = () => {
  if (store.current === null) return;
  store = { ...store, current: null };
  persist();
};
