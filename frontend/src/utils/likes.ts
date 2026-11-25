import { useEffect, useState } from 'react';
import { api, endpoints } from '../config/api';
import { Post } from '../types';

// Hearts. The same post is on screen in more than one place (its feed card,
// its page, the profile), each holding its own copy from the server, so what
// this phone has done since lives here and every copy reads through it.
export type LikeState = { liked: boolean; count: number };

const known = new Map<string, LikeState>();
const listeners = new Map<string, Set<() => void>>();

const announce = (id: string) => listeners.get(id)?.forEach(listener => listener());

export const likeStateOf = (post: Pick<Post, 'id' | 'liked' | 'like_count'>): LikeState =>
  known.get(post.id) ?? { liked: !!post.liked, count: post.like_count ?? 0 };

// The heart flips at once; the server's answer settles the count, and a
// refusal puts it back.
export const toggleLike = async (post: Pick<Post, 'id' | 'liked' | 'like_count'>) => {
  const before = likeStateOf(post);
  const liked = !before.liked;
  known.set(post.id, { liked, count: Math.max(0, before.count + (liked ? 1 : -1)) });
  announce(post.id);
  try {
    const response = liked
      ? await api.post(endpoints.likePost(post.id))
      : await api.delete(endpoints.likePost(post.id));
    // a later tap may already have moved on: only the count is the server's
    const now = known.get(post.id);
    if (now && now.liked === response.data.liked) {
      known.set(post.id, { liked: now.liked, count: response.data.like_count });
    }
  } catch (error) {
    console.log('Heart failed:', error);
    known.set(post.id, before);
  }
  announce(post.id);
};

export const useLike = (post: Pick<Post, 'id' | 'liked' | 'like_count'>): LikeState => {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw(n => n + 1);
    const set = listeners.get(post.id) ?? new Set();
    listeners.set(post.id, set);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(post.id);
    };
  }, [post.id]);
  return likeStateOf(post);
};
