import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import PostComposer from '../components/PostComposer';
import { Post, RepostData, RootStackParamList } from '../types';
import { CanvasState } from '../types/canvas';

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
  const { repostData, restoreState } = (route.params as RouteParams) || {};

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
        onPost={handlePost} 
        onClose={handleClose}
        repostData={repostData}
        restoreState={restoreState}
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
