import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  Alert,
  Animated,
  AppState,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { bootFeed, saveBootFeed } from '../utils/bootFeed';
import { separatorColor } from '../utils/feedSeparator';
import { Colors } from '../constants/colors';
import { Post, FeedResponse } from '../types';
import { api, endpoints, isOfflineError } from '../config/api';
import PostCard from './PostCard';
import { screenWidth } from '../constants/layout';
import websocketService, { WebSocketMessage } from '../services/websocket';
import { SPACE, CHROME } from '../constants/space';

interface Props {
  newPost?: Post | null;
  onNewPostDisplayed?: () => void;
  onFeedLoaded?: (posts: Post[]) => void;
  postEvent?: { post: Post; replacesId?: string } | null;
  onScroll?: any;
  contentInsetAdjustmentBehavior?: 'automatic' | 'scrollableAxes' | 'never' | 'always';
  scrollIndicatorInsets?: { top?: number; left?: number; bottom?: number; right?: number };
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number };
}

export default function Feed({ 
  newPost, 
  onNewPostDisplayed, 
  onFeedLoaded,
  postEvent,
  onScroll,
  contentInsetAdjustmentBehavior,
  scrollIndicatorInsets,
  contentInset 
}: Props) {
  // A launch starts from the cached first page (utils/bootFeed); the fetch
  // below refreshes it in place
  const boot = useRef(bootFeed()).current;
  const [posts, setPosts] = useState<Post[]>(boot?.posts ?? []);
  // Posts arriving over the WS buffer here; a tappable [N NEW POSTS]
  // banner releases them (Twitter-style) instead of shifting the feed
  // under the reader
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(!boot);
  // Opening on the cached page: a small spinner under the masthead says the
  // fresh page is on its way (it may differ). Held back 300ms so a quick
  // refresh never flashes it.
  const [syncing, setSyncing] = useState(!!boot);
  const [showSyncSpinner, setShowSyncSpinner] = useState(false);
  useEffect(() => {
    if (!syncing) {
      setShowSyncSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSyncSpinner(true), 300);
    return () => clearTimeout(timer);
  }, [syncing]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(boot?.next ?? null);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  // Rests at 1 so the first post is visible on initial load; reset to 0 and
  // sprung back to 1 only when a new post arrives over the WebSocket.
  const [newPostAnimation] = useState(new Animated.Value(1));
  const listRef = useRef<FlatList<Post>>(null);
  // Read inside fetchFeed (a stable callback): is there a feed on screen?
  const postsRef = useRef(posts);
  postsRef.current = posts;
  // The last first-page fetch died offline: coming back to the app retries it
  const firstPageFailedRef = useRef(false);

  // Topmost visible post drives the header theme. FlatList needs stable
  // refs for viewability callbacks.
  const feedLoadedRef = useRef(onFeedLoaded);
  feedLoadedRef.current = onFeedLoaded;
  // Only one swipe rail open at a time across the whole feed
  const openSwipeableRef = useRef<any>(null);
  const handleSwipeableOpen = useCallback((ref: any) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
      openSwipeableRef.current.current?.close?.();
    }
    openSwipeableRef.current = ref;
  }, []);

  // Header clearance is real content padding (contentInset is unreliable on
  // RN new architecture), so the top of the content is simply offset 0
  const headerClearance = contentInset?.top ?? 0;
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const fetchFeed = useCallback(async (isRefresh = false, cursor?: string) => {
    try {
      setError(null);
      
      const params: any = {};
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await api.get<FeedResponse>(endpoints.getFeed, { params });
      const { results, next } = response.data;
      if (!cursor) firstPageFailedRef.current = false;

      if (__DEV__) {
        console.log('🪵 Feed fetch results (first 3):',
          results.slice(0, 3).map((post, index) => ({
            index,
            id: post.id,
            rendered_image_url: post.rendered_image_url,
            text_content_preview: post.text_content?.slice(0, 40),
            image_width: post.image_width,
            image_height: post.image_height,
            top_y: post.top_y,
            bottom_y: post.bottom_y,
            is_signed: post.is_signed,
          })),
        );
      }

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
      // First page in hand: the masthead picks its disguise from these, and
      // the next launch opens on them
      if (!cursor) {
        feedLoadedRef.current?.(results);
        saveBootFeed(results, next);
      }

      setNextUrl(next);
    } catch (error: any) {
      console.error('Error fetching feed:', error);
      const offline = isOfflineError(error);
      if (!cursor) firstPageFailedRef.current = offline;
      // A dropped connection (already retried in the API client) with a feed
      // on screen - the cached page, or older pages - is not worth an alarm:
      // the reader keeps what they have. Only a pull to refresh, which asked
      // for news, hears that none came.
      if (offline && postsRef.current.length > 0 && !isRefresh) return;
      const errorMessage = offline
        ? 'Check your connection and pull down to try again'
        : error.response?.data?.detail || 'Could not load the feed';
      setError(errorMessage);

      Toast.show({
        type: 'error',
        text1: offline ? 'No connection' : 'Something went wrong',
        text2: errorMessage,
      });
      // settle the first-launch loading screen so the error is visible
      if (!cursor) feedLoadedRef.current?.([]);
    } finally {
      if (!cursor) setSyncing(false);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setPendingPosts([]); // the refetch includes them
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

  const handlePostAction = useCallback(async (postId: string, action: 'report' | 'mute' | 'block', data?: any) => {
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
        case 'mute': {
          const post = posts.find(p => p.id === postId);
          if (post) {
            await api.post(endpoints.muteUser(post.author.handle));
            setPosts(prev => prev.filter(p => p.author.handle !== post.author.handle));
            Toast.show({
              type: 'success',
              text1: 'Muted',
              text2: 'You will not see their posts anymore',
            });
          }
          break;
        }
        case 'block': {
          const post = posts.find(p => p.id === postId);
          if (post) {
            await api.post(endpoints.blockUser(post.author.handle));
            setPosts(prev => prev.filter(p => p.author.handle !== post.author.handle));
            // Refetch so quoted strips of the blocked author hide too
            fetchFeed(true);
            Toast.show({
              type: 'success',
              text1: 'Blocked',
              text2: 'Their posts are hidden and yours are hidden from them',
            });
          }
          break;
        }
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

  // WebSocket event handlers
  const handleNewPost = useCallback((message: WebSocketMessage) => {
    // The consumer wraps the broadcast as 'post'; older code sent 'post_data'
    const payload = message.post ?? message.post_data;
    if (payload) {
      const incoming = payload as Post;
      setPendingPosts(prev => {
        if (prev.find(p => p.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    }
  }, []);

  const releasePendingPosts = useCallback(() => {
    setPendingPosts(pending => {
      if (pending.length > 0) {
        setPosts(prev => {
          const existing = new Set(prev.map(p => p.id));
          return [...pending.filter(p => !existing.has(p.id)), ...prev];
        });
        setTimeout(scrollToTop, 50);
      }
      return [];
    });
  }, [scrollToTop]);

  const handleRepostNotification = useCallback((message: WebSocketMessage) => {
    Toast.show({
      type: 'success',
      text1: `@${message.actor_handle} reposted you`,
      text2: message.snippet ? `"${message.snippet}"` : undefined,
      position: 'top',
      visibilityTime: 3500,
    });
    api.post(endpoints.markNotificationsRead).catch(() => {});
  }, []);

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
      setPendingPosts(prev => prev.filter(p => p.id !== newPost.id));
      onNewPostDisplayed?.();
      // The user just posted: bring their post into view above the header
      setTimeout(scrollToTop, 100);
    }
  }, [newPost, onNewPostDisplayed, scrollToTop]);

  // An optimistic post shows instantly; the real one takes its place (same
  // slot, no reflow) when the server render arrives.
  useEffect(() => {
    if (!postEvent) return;
    const { post, replacesId } = postEvent;
    setPosts(prev => {
      if (replacesId) {
        const at = prev.findIndex(p => p.id === replacesId);
        if (at >= 0) {
          const next = [...prev];
          next[at] = post;
          return next;
        }
      }
      if (prev.some(p => p.id === post.id)) return prev;
      return [post, ...prev];
    });
    setPendingPosts(prev => prev.filter(p => p.id !== post.id));
    if (!replacesId) setTimeout(scrollToTop, 50);
  }, [postEvent, scrollToTop]);

  // Reposts that happened while the app was closed
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(endpoints.getNotifications);
        const items = res.data?.results || [];
        if (items.length === 1) {
          Toast.show({
            type: 'success',
            text1: `@${items[0].actor_handle} reposted you`,
            text2: items[0].snippet ? `"${items[0].snippet}"` : undefined,
            position: 'top',
            visibilityTime: 3500,
          });
        } else if (items.length > 1) {
          Toast.show({
            type: 'success',
            text1: `${items.length} reposts while you were away`,
            position: 'top',
            visibilityTime: 3500,
          });
        }
        if (items.length > 0) await api.post(endpoints.markNotificationsRead);
      } catch (error) {
        console.log('Notification fetch failed (non-critical):', error);
      }
    })();
  }, []);

  // WebSocket connection setup (optional - feed works without it)
  useEffect(() => {
    try {
      // Set up WebSocket event listeners
      websocketService.on('new_post', handleNewPost);
      websocketService.on('repost_notification', handleRepostNotification);
      websocketService.on('connected', handleWsConnected);
      websocketService.on('disconnected', handleWsDisconnected);
      websocketService.on('error', handleWsError);
      
      // Connect to WebSocket (non-blocking)
      websocketService.connect();
      
      // Cleanup on unmount
      return () => {
        try {
          websocketService.off('new_post', handleNewPost);
          websocketService.off('repost_notification', handleRepostNotification);
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

  // The first page never arrived (offline): try again when the app comes
  // back to the foreground - usually with a connection by then
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && firstPageFailedRef.current) fetchFeed();
    });
    return () => sub.remove();
  }, [fetchFeed]);

  // Between two posts whose touching edges are the same or nearly the same
  // colour, a hairline keeps them from running together (utils/feedSeparator).
  // The list hands a separator only the post above it; the one below is the
  // next in the feed.
  const PostSeparator = useCallback(({ leadingItem }: { leadingItem?: Post }) => {
    const index = leadingItem ? posts.findIndex(p => p.id === leadingItem.id) : -1;
    const below = index >= 0 ? posts[index + 1] : undefined;
    const color = leadingItem && below ? separatorColor(leadingItem, below) : null;
    // one device pixel: a rule, not a border
    return color ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color }} /> : null;
  }, [posts]);

  const renderPost = ({ item, index }: { item: Post; index: number }) => {
    /*
    console.log('🎨 Rendering post:', {
      id: item.id,
      hasImage: !!item.rendered_image_url,
      imageUrl: item.rendered_image_url,
      textContent: item.text_content?.substring(0, 20) + '...'
    });
    */
    
    // Animate the first post (newest); the animation value rests at 1, so
    // this is a no-op except right after a WebSocket new-post arrival.
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
          onBlock={() => handlePostAction(item.id, 'block')}
          onSwipeableOpen={handleSwipeableOpen}
        />
      </Animated.View>
    );
  };

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

  // The first-launch loading screen is drawn full-screen by MainScreen (it
  // covers the masthead too); the feed just waits underneath
  if (loading && posts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {showSyncSpinner && (
        <View style={[styles.syncSpinner, { top: headerClearance + SPACE.md }]} pointerEvents="none">
          <ActivityIndicator size="small" color={Colors.secondary} />
        </View>
      )}
      {pendingPosts.length > 0 && (
        <TouchableOpacity style={[styles.newPostsBanner, { top: headerClearance + 8 }]} onPress={releasePendingPosts}>
          <Text style={styles.newPostsBannerText}>
            {pendingPosts.length} new post{pendingPosts.length > 1 ? 's' : ''} ↑
          </Text>
        </TouchableOpacity>
      )}
      {/* WebSocket connection status indicator - only show briefly */}
      {!wsConnected && showConnectionStatus && posts.length > 0 && (
        <View style={styles.connectionStatus}>
          <View style={styles.connectionDot} />
          <Text style={styles.connectionText}>Live updates unavailable</Text>
        </View>
      )}
      
      <Animated.FlatList
        ref={listRef as any}
        data={posts}
        alwaysBounceVertical
        overScrollMode="always"
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
        contentContainerStyle={
          posts.length === 0
            ? [styles.emptyContainer, { paddingTop: headerClearance }]
            : { paddingTop: headerClearance, paddingHorizontal: 0, flexGrow: 1 }
        }
        ItemSeparatorComponent={PostSeparator}
        extraData={posts}
        style={{ backgroundColor: Colors.background, margin: 0, padding: 0, flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
        scrollIndicatorInsets={scrollIndicatorInsets}
        progressViewOffset={headerClearance}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  syncSpinner: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 40,
  },
  newPostsBanner: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 40,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: CHROME.hairline,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  newPostsBannerText: {
    color: Colors.background,
    fontSize: 12,
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    letterSpacing: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    margin: 0,
    padding: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  loadingMore: {
    padding: SPACE.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACE.xxl,
    // header clearance pads the top of the scroll view; lift the centered
    // block so it sits at true visual center
    paddingBottom: 185,
  },
  emptyTitle: {
    color: Colors.primary,
    fontSize: 20,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    marginBottom: SPACE.sm,
  },
  emptySubtitle: {
    color: Colors.secondary,
    fontSize: 16,
    fontFamily: 'CourierPrime',
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
    zIndex: 100,
  },
  connectionDot: {
    width: 6,
    height: 6,
    backgroundColor: Colors.accent,
    marginRight: 6,
  },
  connectionText: {
    color: 'white',
    fontSize: 11,
    fontFamily: 'CourierPrime',
    fontWeight: '500',
  },
 });
