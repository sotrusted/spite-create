import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import PostComposer from '../components/PostComposer';
import { Post, RepostData, RootStackParamList } from '../types';

interface Props {
  onPost?: (post: Post) => void;
}

interface RouteParams {
  repostData?: RepostData;
}

type PostComposerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PostComposer'>;

export default function PostComposerScreen({ onPost }: Props) {
  const navigation = useNavigation<PostComposerScreenNavigationProp>();
  const route = useRoute();
  const { repostData } = (route.params as RouteParams) || {};

  const handlePost = (post: Post) => {
    // Pass post to parent for immediate feed update first
    onPost?.(post);
    
    // Reset navigation stack to Main
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

  const handleClose = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <PostComposer 
        onPost={handlePost} 
        onClose={handleClose}
        repostData={repostData}
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
