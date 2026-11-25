import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { Colors } from '../constants/colors';
import { Post } from '../types';
import { api, endpoints, absoluteUrl } from '../config/api';
import { SPACE } from '../constants/space';

// The archive: every post as a square, three across, newest first - the
// feed seen the way a photo album shows a camera roll. A square opens its
// post page.

const COLUMNS = 3;
const GAP = 2;
// a multiple of three, so a page never ends on a ragged row
const PAGE_SIZE = 48;

// The square cut from a post's render: full canvas width, centred on the
// post's content, kept inside the canvas. Pure, so a post always shows the
// same square.
export const archiveSquare = (post: Pick<Post, 'image_width' | 'image_height' | 'top_y' | 'bottom_y'>, tile: number) => {
  const canvasWidth = post.image_width || 0;
  const canvasHeight = post.image_height || 0;
  if (!canvasWidth || !canvasHeight) return null;
  const scale = tile / canvasWidth;
  const height = canvasHeight * scale;
  const centre = typeof post.top_y === 'number' && typeof post.bottom_y === 'number'
    ? (post.top_y + post.bottom_y) / 2
    : canvasHeight / 2;
  const top = Math.min(0, Math.max(tile - height, tile / 2 - centre * scale));
  return { top, height };
};

const Tile = React.memo(({ post, size, onOpen }: { post: Post; size: number; onOpen: (post: Post) => void }) => {
  const square = archiveSquare(post, size);
  const uri = absoluteUrl(post.rendered_image_url);
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onOpen(post)}
      accessibilityLabel={post.text_content || 'Post'}
      style={{ width: size, height: size, overflow: 'hidden', backgroundColor: post.background_color || Colors.surface }}
    >
      {uri && (
        <ExpoImage
          source={{ uri }}
          style={square
            ? { position: 'absolute', left: 0, top: square.top, width: size, height: square.height }
            : { width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={post.id}
        />
      )}
    </TouchableOpacity>
  );
});

export default function ArchiveScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadingMore = useRef(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    try {
      const response = await api.get(endpoints.getFeed, {
        params: cursor ? { cursor, page_size: PAGE_SIZE } : { page_size: PAGE_SIZE },
      });
      const { results, next } = response.data;
      setPosts(prev => {
        if (!cursor) return results;
        const have = new Set(prev.map(p => p.id));
        return [...prev, ...results.filter((p: Post) => !have.has(p.id))];
      });
      setNextUrl(next);
    } catch (error) {
      console.log('Could not load the archive:', error);
    } finally {
      setLoaded(true);
      loadingMore.current = false;
    }
  }, []);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const loadMore = () => {
    if (!nextUrl || loadingMore.current) return;
    const cursor = new URL(nextUrl).searchParams.get('cursor');
    if (!cursor) return;
    loadingMore.current = true;
    fetchPage(cursor);
  };

  const openPost = useCallback((post: Post) => {
    (navigation as any).navigate('PostDetail', { postId: post.id, post });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Archive</Text>
        <View style={styles.headerButton} />
      </View>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP }}
        renderItem={({ item }) => <Tile post={item} size={size} onOpen={openPost} />}
        getItemLayout={(_, index) => ({ length: size + GAP, offset: (size + GAP) * Math.floor(index / COLUMNS), index })}
        onEndReached={loadMore}
        onEndReachedThreshold={1}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={loaded ? <Text style={styles.empty}>Nothing here yet</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  headerButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'CourierPrimeBold', fontSize: 16, color: Colors.primary, letterSpacing: 1 },
  empty: { fontFamily: 'CourierPrime', fontSize: 14, color: Colors.secondary, textAlign: 'center', marginTop: SPACE.xl },
});
