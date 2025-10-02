import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Text,
  Alert,
  Animated,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/colors';
import { Post, FeedResponse } from '../types';
import { api, endpoints } from '../config/api';
import PostCard from './PostCard';
import { screenWidth } from '../constants/layout';
import websocketService, { WebSocketMessage } from '../services/websocket';

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
  const [wsConnected, setWsConnected] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const [newPostAnimation] = useState(new Animated.Value(0));

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

  // WebSocket event handlers
  const handleNewPost = useCallback((message: WebSocketMessage) => {
    console.log('📡 New post received via WebSocket:', message);
    
    if (message.post_data) {
      const newPost = message.post_data as Post;
      
      setPosts(prev => {
        // Check if post already exists to prevent duplicates
        const existingPost = prev.find(p => p.id === newPost.id);
        if (existingPost) {
          return prev; // Post already exists, don't add duplicate
        }
        
        // Add new post to the top with animation
        console.log('✨ Adding new post to feed:', newPost.id);
        
        // Trigger animation for new post
        newPostAnimation.setValue(0);
        Animated.spring(newPostAnimation, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
        
        return [newPost, ...prev];
      });
      
      // Show subtle notification
      Toast.show({
        type: 'success',
        text1: 'New post!',
        text2: `From @${newPost.author.handle}`,
        position: 'top',
        visibilityTime: 2000,
      });
    }
  }, [newPostAnimation]);

  const handleWsConnected = useCallback(() => {
    console.log('📡 WebSocket connected');
    setWsConnected(true);
    websocketService.joinFeed();
  }, []);

  const handleWsDisconnected = useCallback(() => {
    console.log('📡 WebSocket disconnected');
    setWsConnected(false);
    setShowConnectionStatus(true);
    
    // Hide status after 5 seconds
    setTimeout(() => {
      setShowConnectionStatus(false);
    }, 5000);
  }, []);

  const handleWsError = useCallback((message: WebSocketMessage) => {
    console.log('📡 WebSocket connection unavailable (feed continues normally):', message);
    setWsConnected(false);
    setShowConnectionStatus(true);
    
    // Hide status after 3 seconds for errors
    setTimeout(() => {
      setShowConnectionStatus(false);
    }, 3000);
    // Don't show error toasts - WebSocket is optional
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

  // WebSocket connection setup (optional - feed works without it)
  useEffect(() => {
    try {
      // Set up WebSocket event listeners
      websocketService.on('new_post', handleNewPost);
      websocketService.on('connected', handleWsConnected);
      websocketService.on('disconnected', handleWsDisconnected);
      websocketService.on('error', handleWsError);
      
      // Connect to WebSocket (non-blocking)
      websocketService.connect();
      
      // Cleanup on unmount
      return () => {
        try {
          websocketService.off('new_post', handleNewPost);
          websocketService.off('connected', handleWsConnected);
          websocketService.off('disconnected', handleWsDisconnected);
          websocketService.off('error', handleWsError);
          websocketService.disconnect();
        } catch (error) {
          console.log('WebSocket cleanup error (non-critical):', error);
        }
      };
    } catch (error) {
      console.log('WebSocket setup failed (feed will work without real-time updates):', error);
      setWsConnected(false);
    }
  }, [handleNewPost, handleWsConnected, handleWsDisconnected, handleWsError]);

  // Initial load
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const renderPost = ({ item, index }: { item: Post; index: number }) => {
    console.log('🎨 Rendering post:', {
      id: item.id,
      hasImage: !!item.rendered_image_url,
      imageUrl: item.rendered_image_url,
      textContent: item.text_content?.substring(0, 20) + '...'
    });
    
    // Apply animation to the first post (newest)
    const animatedStyle = index === 0 ? {
      transform: [
        {
          translateY: newPostAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [-50, 0],
          }),
        },
        {
          scale: newPostAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.95, 1],
          }),
        },
      ],
      opacity: newPostAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    } : {};
    
    return (
      <Animated.View style={animatedStyle}>
        <PostCard
          post={item}
          onReport={(reason, description) => handlePostAction(item.id, 'report', { reason, description })}
          onMute={() => handlePostAction(item.id, 'mute')}
          onCopyText={() => handleCopyText(item.text_content)}
          onRepost={() => handleRepost(item)}
        />
      </Animated.View>
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
      {/* WebSocket connection status indicator - only show briefly */}
      {!wsConnected && showConnectionStatus && posts.length > 0 && (
        <View style={styles.connectionStatus}>
          <View style={styles.connectionDot} />
          <Text style={styles.connectionText}>Live updates unavailable</Text>
        </View>
      )}
      
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
  connectionStatus: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 100,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginRight: 6,
  },
  connectionText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '500',
  },
 });
