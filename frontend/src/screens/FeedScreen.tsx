import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feed from '../components/Feed';
import { Colors } from '../constants/colors';
import { Post } from '../types';

interface Props {
  newPost?: Post | null;
  onNewPostDisplayed?: () => void;
}

export default function FeedScreen({ newPost, onNewPostDisplayed }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Feed newPost={newPost} onNewPostDisplayed={onNewPostDisplayed} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
