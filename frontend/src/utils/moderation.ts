import { api, endpoints } from '../config/api';

// Report, mute and block: the API calls, the copy, and the event that tells
// the feed an author's posts should go. Used by the post page's menu, which
// never shows who wrote a post: unsigned posts stay anonymous.

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'fake' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'fake', label: 'Fake or misleading' },
  { value: 'other', label: 'Other' },
];

export type HideKind = 'mute' | 'block';

export const MODERATION_COPY = {
  mute: { title: 'Mute', confirm: 'Mute whoever wrote this?', body: "You won't see their posts anymore.", done: 'Muted' },
  block: {
    title: 'Block',
    confirm: 'Block whoever wrote this?',
    body: 'Their posts disappear for you, your posts disappear for them, and their quoted posts are hidden.',
    done: 'Blocked',
  },
  reported: 'Thank you - a person will review it.',
} as const;

export const reportPost = (postId: string, reason: ReportReason) =>
  api.post(endpoints.reportPost(postId), { reason, description: '' });

// --- an author's posts leave the feed ---

export type AuthorHidden = { handle: string; kind: HideKind };
const listeners = new Set<(event: AuthorHidden) => void>();

export const onAuthorHidden = (fn: (event: AuthorHidden) => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

export async function hideAuthor(handle: string, kind: HideKind) {
  await api.post(kind === 'mute' ? endpoints.muteUser(handle) : endpoints.blockUser(handle));
  listeners.forEach(fn => fn({ handle, kind }));
}
