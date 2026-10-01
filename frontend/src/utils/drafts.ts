import * as LegacyFS from 'expo-file-system/legacy';
import { CanvasState } from '../types/canvas';
import { RepostData } from '../types';
import { hasDraftContent } from './canvasState';

// Two kinds of kept canvas, both on this device only:
//
// - The scratch canvas: whatever you were working on and walked away from
//   without posting or saving. One at a time, never listed; + reopens it.
// - Drafts: canvases you saved on purpose ("Save to drafts"), listed in the
//   composer's drafts drawer. Opening one edits it in place; posting it
//   removes it.
//
// Read once before the first render (App waits for it, like the boot feed),
// so the composer opens straight onto the scratch canvas; writes go to disk
// in the background, one at a time.
const DIR = LegacyFS.documentDirectory + 'drafts/';
const INDEX = DIR + 'index.json';
const VERSION = 2;

export interface Draft {
  id: string;
  updatedAt: number;
  state: CanvasState;
  // A quote keeps the post it quotes, so reopening needs no network
  repostData?: RepostData;
  thumb?: string; // file:// snapshot of the whole canvas
  // Where the content sits in it (screen points), so the drawer can show the
  // post's band the way the feed would rather than a mostly empty screen
  focus?: { top: number; bottom: number };
}

export type Scratch = Pick<Draft, 'state' | 'repostData'>;

// Which kept canvas a composer session saves itself into
export type DraftTarget = { kind: 'scratch' } | { kind: 'draft'; id: string };

type Stored = { version: typeof VERSION; scratch: Scratch | null; drafts: Draft[] };

let store: Stored = { version: VERSION, scratch: null, drafts: [] };
const listeners = new Set<() => void>();

let writing: Promise<void> = Promise.resolve();
const commit = (next: Stored) => {
  store = next;
  const snapshot = JSON.stringify(store);
  writing = writing
    .then(() => LegacyFS.makeDirectoryAsync(DIR, { intermediates: true }))
    .then(() => LegacyFS.writeAsStringAsync(INDEX, snapshot))
    .catch(error => console.log('Draft save failed:', error));
  listeners.forEach(fn => fn());
};

const deleteFile = (uri?: string) => {
  if (uri) LegacyFS.deleteAsync(uri, { idempotent: true }).catch(() => {});
};

export const loadDrafts = async () => {
  try {
    const info = await LegacyFS.getInfoAsync(INDEX);
    if (!info.exists) return;
    const data = JSON.parse(await LegacyFS.readAsStringAsync(INDEX));
    if (data?.version === VERSION && Array.isArray(data.drafts)) {
      store = data;
    } else if (data?.version === 1 && Array.isArray(data.drafts)) {
      // v1 kept every canvas as a draft; they all belong in the drawer
      store = { version: VERSION, scratch: null, drafts: data.drafts };
    }
  } catch {
    // unreadable index: start with no drafts rather than not at all
  }
};

export const onDraftsChanged = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

// The drawer, newest first
export const listDrafts = (): Draft[] =>
  [...store.drafts].sort((a, b) => b.updatedAt - a.updatedAt);

const getDraft = (id: string) => store.drafts.find(d => d.id === id) ?? null;

export const newDraftId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// --- the scratch canvas ---

export const getScratch = () => store.scratch;

// A canvas with nothing on it is not worth keeping: emptying it clears it
export const saveScratch = (state: CanvasState, repostData?: RepostData) => {
  if (!hasDraftContent(state)) {
    clearScratch();
    return;
  }
  commit({ ...store, scratch: { state, repostData } });
};

export const clearScratch = () => {
  if (store.scratch) commit({ ...store, scratch: null });
};

// --- drafts ---

// Save into the drawer (a new id adds one). Emptying a draft deletes it.
export const saveDraft = (id: string, state: CanvasState, repostData?: RepostData) => {
  if (!hasDraftContent(state)) {
    removeDraft(id);
    return;
  }
  const existing = getDraft(id);
  const draft: Draft = { ...existing, id, updatedAt: Date.now(), state, repostData };
  commit({
    ...store,
    drafts: existing ? store.drafts.map(d => (d.id === id ? draft : d)) : [...store.drafts, draft],
  });
};

// Keep a fresh snapshot for the drawer. Each gets its own file name, so the
// image cache never shows a stale one.
export const saveDraftThumb = async (
  id: string,
  capturedUri: string,
  focus?: { top: number; bottom: number },
) => {
  if (!getDraft(id)) return;
  const to = `${DIR}${id}-${Date.now()}.jpg`;
  try {
    await LegacyFS.makeDirectoryAsync(DIR, { intermediates: true });
    // copied, not moved: the capture sits in a folder the app may only read
    await LegacyFS.copyAsync({ from: capturedUri, to });
  } catch (error) {
    console.log('Draft thumbnail failed:', error);
    return;
  }
  const draft = getDraft(id); // may have been deleted meanwhile
  if (!draft) {
    deleteFile(to);
    return;
  }
  commit({ ...store, drafts: store.drafts.map(d => (d.id === id ? { ...d, thumb: to, focus } : d)) });
  deleteFile(draft.thumb);
};

export const removeDraft = (id: string) => {
  const draft = getDraft(id);
  if (!draft) return;
  commit({ ...store, drafts: store.drafts.filter(d => d.id !== id) });
  deleteFile(draft.thumb);
};

// The scratch canvas, if it has anything on it, moves into the drawer (a
// quote or another draft is about to take its place)
export const stashScratch = () => {
  const scratch = store.scratch;
  if (!scratch || !hasDraftContent(scratch.state)) return;
  commit({
    ...store,
    scratch: null,
    drafts: [...store.drafts, { id: newDraftId(), updatedAt: Date.now(), ...scratch }],
  });
};
