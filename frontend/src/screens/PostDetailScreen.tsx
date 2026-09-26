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
import { Share, StatusBar } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as LegacyFS from 'expo-file-system/legacy';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, endpoints, absoluteUrl } from '../config/api';
import LoadingScreen from '../components/LoadingScreen';
import { Colors } from '../constants/colors';
import { CHROME } from '../constants/layout';
import { displayCropBounds } from '../utils/displayCrop';
import { Post } from '../types';

const { width: screenWidth } = Dimensions.get('window');

// Minimal post detail: the full composite, selectable text, repost.
// No author chrome: unsigned posts stay anonymous here too - signed posts
// carry their rendered username inside the image itself.
export default function PostDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { postId, post: seed } = (route.params as { postId: string; post?: Post }) || {};
  // Seeded from the feed when there is one - no fetch, no loading frame
  const [post, setPost] = useState<Post | null>(seed ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!postId) return;
    api.get<Post>(endpoints.getPost(postId))
      .then(response => setPost(response.data))
      .catch(() => { if (!seed) setError(true); });
  }, [postId, seed]);

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
      const crop = displayCropBounds(topY, bottomY, canvasWidth, canvasHeight, screenWidth);
      return (
        <View style={{ width: '100%', height: (crop.bottomY - crop.topY) * scale, overflow: 'hidden' }}>
          <Image
            source={{ uri: absoluteUrl(post.rendered_image_url) }}
            style={{ width: '100%', height: canvasHeight * scale, transform: [{ translateY: -crop.topY * scale }] }}
            resizeMode="cover"
          />
          {/* Invisible selectable text laid over the rendered text: we know
              the exact content and geometry, so selection works word-by-word
              on what looks like the image */}
          {(post as any).text_elements?.map((el: any, index: number) => {
            if (!el?.content?.trim()) return null;
            const x = (el.x || 0) * scale;
            const y = ((el.y || 0) - crop.topY) * scale;
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

  // Save the post's rendered image: one tap to Photos, share sheet if the
  // build predates the photo permission string.
  const handleDownload = async () => {
    const remote = post?.rendered_image_url;
    if (!remote) return;
    try {
      const target = LegacyFS.cacheDirectory + `post-${post!.id}.png`;
      const { uri } = await LegacyFS.downloadAsync(absoluteUrl(remote)!, target);
      try {
        const { granted } = await MediaLibrary.requestPermissionsAsync(true);
        if (!granted) return;
        await MediaLibrary.saveToLibraryAsync(uri);
      } catch {
        await Share.share({ url: uri });
      }
    } catch (error) {
      console.log('Post export failed:', error);
    }
  };

  const background = post?.background_color || Colors.background;
  const chrome = chromeColor(background);

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
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
        <>
          {/* The status bar sits on the post's colour too: same contrast rule
              as the buttons, or the clock vanishes on a black post */}
          <StatusBar barStyle={chrome === '#FFFFFF' ? 'light-content' : 'dark-content'} animated />
          {/* Full bleed: the post floats in its own colour, vertically centred */}
          <View style={styles.stage}>{renderImage()}</View>

          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={CHROME.iconSize} color={chrome} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.downloadButton} onPress={handleDownload}>
            <Ionicons name="download-outline" size={CHROME.iconSize} color={chrome} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quoteButton, { backgroundColor: chrome }]}
            onPress={handleRepost}
            activeOpacity={0.7}
          >
            <Text style={[styles.quoteButtonText, { color: background }]}>Aa</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// Chrome reads against the post's own colour, same rule as the feed's chip
const chromeColor = (background: string) => {
  const hex = background.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000000' : '#FFFFFF';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // The post floats in its own colour, centred vertically, edge to edge
  stage: {
    flex: 1,
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: Colors.primary,
    fontSize: 16,
  },
  closeButton: {
    position: 'absolute',
    top: CHROME.topInset,
    left: CHROME.inset,
    width: CHROME.iconButton,
    height: CHROME.iconButton,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  downloadButton: {
    position: 'absolute',
    top: CHROME.topInset,
    right: CHROME.inset,
    width: CHROME.iconButton,
    height: CHROME.iconButton,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  quoteButton: {
    position: 'absolute',
    right: CHROME.inset,
    bottom: CHROME.inset,
    width: CHROME.buttonWidth,
    height: CHROME.buttonHeight,
    borderWidth: 1,
    borderColor: CHROME.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  quoteButtonText: {
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    fontSize: 15,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
