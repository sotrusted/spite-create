import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Text,
  Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/colors';
import { Post, FeedResponse } from '../types';
import { api, endpoints } from '../config/api';
import PostCard from './PostCard';
import { screenWidth } from '../constants/layout';

interface Props {
  newPost?: Post | null;
  onNewPostDisplayed?: () => void;
  onScroll?: any;
  contentInsetAdjustmentBehavior?: 'automatic' | 'scrollableAxes' | 'never' | 'always';
  scrollIndicatorInsets?: { top?: number; left?: number; bottom?: number; right?: number };
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number };
}

export default function Feed({ 
  newPost, 
  onNewPostDisplayed, 
  onScroll,
  contentInsetAdjustmentBehavior,
  scrollIndicatorInsets,
  contentInset 
}: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async (isRefresh = false, cursor?: string) => {
    try {
      setError(null);
      
      const params: any = {};
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await api.get<FeedResponse>(endpoints.getFeed, { params });
      const { results, next } = response.data;

      if (isRefresh) {
        setPosts(results);
      } else {
        setPosts(prev => {
          if (cursor) {
            // When loading more posts, filter out any duplicates
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = results.filter(post => !existingIds.has(post.id));
            return [...prev, ...newPosts];
          } else {
            return results;
          }
        });
      }
      
      setNextUrl(next);
    } catch (error: any) {
      console.error('Error fetching feed:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to load feed';
      setError(errorMessage);
      
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: errorMessage,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed(true);
  }, [fetchFeed]);

  const handleLoadMore = useCallback(() => {
    if (nextUrl && !loadingMore) {
      setLoadingMore(true);
      const cursor = new URL(nextUrl).searchParams.get('cursor');
      if (cursor) {
        fetchFeed(false, cursor);
      }
    }
  }, [nextUrl, loadingMore, fetchFeed]);

  const handlePostAction = useCallback(async (postId: string, action: 'report' | 'mute', data?: any) => {
    try {
      switch (action) {
        case 'report':
          await api.post(endpoints.reportPost(postId), data);
          Toast.show({
            type: 'success',
            text1: 'Reported',
            text2: 'Thank you for helping keep the community safe',
          });
          break;
        case 'mute':
          const post = posts.find(p => p.id === postId);
          if (post) {
            await api.post(endpoints.muteUser(post.author.handle));
            setPosts(prev => prev.filter(p => p.author.handle !== post.author.handle));
            Toast.show({
              type: 'success',
              text1: 'Muted',
              text2: `You won't see posts from @${post.author.handle} anymore`,
            });
          }
          break;
      }
    } catch (error: any) {
      console.error(`Error ${action}ing post:`, error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.detail || 
                          `Failed to ${action} post`;
      
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: errorMessage,
      });
    }
  }, [posts]);

  const handleCopyText = useCallback((text: string) => {
    // This would use Expo Clipboard in a real implementation
    Toast.show({
      type: 'success',
      text1: 'Copied',
      text2: 'Text copied to clipboard',
    });
  }, []);

  // Add new post to feed when created
  useEffect(() => {
    if (newPost) {
      setPosts(prev => {
        // Check if post already exists to prevent duplicates
        const existingPost = prev.find(p => p.id === newPost.id);
        if (existingPost) {
          return prev; // Post already exists, don't add duplicate
        }
        return [newPost, ...prev];
      });
      onNewPostDisplayed?.();
    }
  }, [newPost, onNewPostDisplayed]);

  // Initial load
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const renderPost = ({ item }: { item: Post }) => {
    console.log('🎨 Rendering post:', {
      id: item.id,
      hasImage: !!item.rendered_image_url,
      imageUrl: item.rendered_image_url,
      textContent: item.text_content?.substring(0, 20) + '...'
    });
    
    return (
      <PostCard
        post={item}
        onReport={(reason, description) => handlePostAction(item.id, 'report', { reason, description })}
        onMute={() => handlePostAction(item.id, 'mute')}
        onCopyText={() => handleCopyText(item.text_content)}
        onRepost={() => handleRepost(item)}
      />
    );
  };

  const handleRepost = useCallback((post: Post) => {
    // This will be implemented to capture screenshot and open composer
    console.log('Repost functionality will be implemented', post.id);
  }, []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={Colors.accent} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No posts yet</Text>
        <Text style={styles.emptySubtitle}>
          {error ? 'Pull to refresh and try again' : 'Be the first to post something!'}
        </Text>
      </View>
    );
  };

  if (loading && posts.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Loading feed...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={posts.length === 0 ? styles.emptyContainer : { paddingVertical: 0, paddingHorizontal: 0 }}
        ItemSeparatorComponent={null}
        style={{ backgroundColor: Colors.background, margin: 0, padding: 0, flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
        scrollIndicatorInsets={scrollIndicatorInsets}
        contentInset={contentInset}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    margin: 0,
    padding: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.secondary,
    marginTop: 16,
    fontSize: 16,
  },
  loadingMore: {
    padding: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.secondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
 });
