import { Post } from '../types';

// The composer is a navigation screen, so it cannot be handed callbacks as
// props - its onPost was silently undefined and new posts only showed up
// because closing the composer remounted the feed. With eager posting the
// request finishes AFTER that remount, so the post needs its own channel.
//
// A single buffered slot covers the race: if the post lands before the feed
// has resubscribed, it is delivered to the next subscriber instead of lost.

// replacesId carries the temporary id of an optimistic post that this real
// one supersedes, so the feed swaps it in place instead of showing both.
export type PostEvent = { post: Post; replacesId?: string };

type Listener = (event: PostEvent) => void;

const listeners = new Set<Listener>();
let pending: PostEvent | null = null;

export const emitPostCreated = (post: Post, replacesId?: string) => {
  const event = { post, replacesId };
  if (listeners.size === 0) {
    pending = event;
    return;
  }
  listeners.forEach(listener => listener(event));
};

export const subscribeToPostCreated = (listener: Listener) => {
  listeners.add(listener);
  if (pending) {
    const buffered = pending;
    pending = null;
    listener(buffered);
  }
  return () => {
    listeners.delete(listener);
  };
};
