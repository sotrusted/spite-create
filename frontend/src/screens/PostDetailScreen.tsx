import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, endpoints, absoluteUrl } from '../config/api';
import LoadingScreen from '../components/LoadingScreen';
import { Colors } from '../constants/colors';
import { Post } from '../types';

const { width: screenWidth } = Dimensions.get('window');

// Minimal post detail: the full composite, selectable text, repost.
// No author chrome: unsigned posts stay anonymous here too - signed posts
// carry their rendered username inside the image itself.
export default function PostDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { postId } = (route.params as { postId: string }) || {};
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!postId) return;
    api.get<Post>(endpoints.getPost(postId))
      .then(response => setPost(response.data))
      .catch(() => setError(true));
  }, [postId]);

  const handleRepost = () => {
    if (!post?.rendered_image_url) return;
    (navigation as any).navigate('PostComposer', {
      repostData: {
        originalPost: post,
        screenshotUri: post.rendered_image_url,
      },
    });
  };

  const renderImage = () => {
    if (!post?.rendered_image_url) return null;
    const canvasWidth = post.image_width || 0;
    const canvasHeight = post.image_height || 0;
    const topY = typeof post.top_y === 'number' ? post.top_y : null;
    const bottomY = typeof post.bottom_y === 'number' ? post.bottom_y : null;

    if (canvasWidth > 0 && canvasHeight > 0 && topY !== null && bottomY !== null && bottomY > topY) {
      const scale = screenWidth / canvasWidth;
      return (
        <View style={{ width: '100%', height: (bottomY - topY) * scale, overflow: 'hidden' }}>
          <Image
            source={{ uri: absoluteUrl(post.rendered_image_url) }}
            style={{ width: '100%', height: canvasHeight * scale, transform: [{ translateY: -topY * scale }] }}
            resizeMode="cover"
          />
          {/* Invisible selectable text laid over the rendered text: we know
              the exact content and geometry, so selection works word-by-word
              on what looks like the image */}
          {(post as any).text_elements?.map((el: any, index: number) => {
            if (!el?.content?.trim()) return null;
            const x = (el.x || 0) * scale;
            const y = ((el.y || 0) - topY) * scale;
            const fontSize = Math.max(8, (el.fontSize || 24) * scale);
            const maxWidth = screenWidth * 0.9;
            return (
              <Text
                key={index}
                selectable
                style={{
                  position: 'absolute',
                  left: Math.max(0, x - maxWidth / 2),
                  top: y - fontSize * 0.75,
                  width: maxWidth,
                  textAlign: (el.align || 'center') as any,
                  fontSize,
                  letterSpacing: (el.letterSpacing || 0) * scale,
                  color: 'transparent',
                  lineHeight: fontSize * 1.15,
                }}
              >
                {el.content}
              </Text>
            );
          })}
        </View>
      );
    }
    return (
      <Image
        source={{ uri: absoluteUrl(post.rendered_image_url) }}
        style={{ width: '100%', aspectRatio: 0.8 }}
        resizeMode="contain"
      />
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={24} color={Colors.primary} />
      </TouchableOpacity>

      {!post && !error && (
        <View style={styles.loading}>
          <LoadingScreen />
        </View>
      )}
      {error && (
        <View style={styles.loading}>
          <Text style={styles.errorText}>Could not load post</Text>
        </View>
      )}

      {post && (
        <ScrollView contentContainerStyle={styles.content}>
          {renderImage()}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.repostButton} onPress={handleRepost}>
              <Ionicons name="repeat-outline" size={18} color="white" />
              <Text style={styles.repostText}>Repost</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: Colors.secondary,
    fontSize: 16,
    fontFamily: 'CourierPrime',
  },
  content: {
    paddingTop: 110,
    paddingBottom: 60,
  },
  textBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  selectableText: {
    color: Colors.primary,
    fontSize: 16,
    fontFamily: 'CourierPrime',
    lineHeight: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  repostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  repostText: {
    color: 'white',
    fontSize: 15,
    fontFamily: 'CourierPrime',
    fontWeight: '700',
  },
});
