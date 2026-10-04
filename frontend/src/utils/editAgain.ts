import { Alert } from 'react-native';
import { api, endpoints } from '../config/api';
import type { CanvasState } from '../types/canvas';
import type { Post, RepostData } from '../types';

// "Edit again": reopen the composer with the exact canvas a post was made
// from. The saved state only comes back to its author, from the detail
// endpoint; a quote is re-fetched because the state references it by id.
// Posting from there makes a new post - the original stays as it was.
export async function editAgain(navigation: { navigate: (...args: any[]) => void }, postId: string) {
  try {
    const { data: full } = await api.get<Post>(endpoints.getPost(postId));
    const state = full.canvas_state as CanvasState | undefined;
    if (!state) throw new Error('no saved canvas');
    let repostData: RepostData | undefined;
    if (state.repost) {
      const { data: original } = await api.get<Post>(endpoints.getPost(state.repost.originalPostId));
      repostData = { originalPost: original, screenshotUri: original.rendered_image_url! };
    }
    navigation.navigate('PostComposer', { restoreState: state, repostData });
  } catch (error) {
    console.log('Edit again failed:', error);
    Alert.alert('Could not reopen this post', 'Try again in a moment.');
  }
}
