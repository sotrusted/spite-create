import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import PostComposer from '../components/PostComposer';
import { Post, RepostData, RootStackParamList } from '../types';
import { CanvasState } from '../types/canvas';
import { currentDraft, newDraftId, Draft } from '../utils/drafts';

interface Props {
  onPost?: (post: Post) => void;
}

interface RouteParams {
  repostData?: RepostData;
  restoreState?: CanvasState;
}

type PostComposerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PostComposer'>;

export default function PostComposerScreen({ onPost }: Props) {
  const navigation = useNavigation<PostComposerScreenNavigationProp>();
  const route = useRoute();
  const params = (route.params as RouteParams) || {};

  // Which canvas is open. A quote or "Edit again" brings its own; the plain
  // + button reopens the canvas you last walked away from, if any. Picking
  // another draft (or New) from the drafts grid swaps the session, and the
  // key remounts the composer onto it.
  const [session, setSession] = useState(() => {
    if (params.repostData || params.restoreState) {
      return { draftId: newDraftId(), repostData: params.repostData, restoreState: params.restoreState };
    }
    const draft = currentDraft();
    return draft
      ? { draftId: draft.id, repostData: draft.repostData, restoreState: draft.state }
      : { draftId: newDraftId(), repostData: undefined, restoreState: undefined };
  });
  const openDraft = (draft: Draft | null) => setSession(draft
    ? { draftId: draft.id, repostData: draft.repostData, restoreState: draft.state }
    : { draftId: newDraftId(), repostData: undefined, restoreState: undefined });

  // goBack pops the composer and returns to the EXISTING feed. A
  // navigation.reset here rebuilt MainScreen from scratch, which meant every
  // post was followed by an empty feed showing the loading animation while it
  // refetched - and it threw away the masthead theme and scroll position too.
  const returnToFeed = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  };

  // The composer closes itself the instant you hit Post; this fires ~1s later
  // when the server render lands. Navigating again from here found no screen
  // to pop, fell back to reset(), and rebuilt the feed from scratch - the
  // loading screen people saw after every post.
  const handlePost = (post: Post) => {
    onPost?.(post);
  };

  const handleClose = returnToFeed;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <PostComposer
        key={session.draftId}
        draftId={session.draftId}
        onPost={handlePost}
        onClose={handleClose}
        onOpenDraft={openDraft}
        repostData={session.repostData}
        restoreState={session.restoreState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Black background for full immersion
  },
});
