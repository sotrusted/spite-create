import React, { useEffect, useRef, useState } from 'react';
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
import { Colors } from '../constants/colors';
import { CHROME } from '../constants/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { TapGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { Post } from '../types';
import { fullPostLayout, gradientEndpoints, canvasPointIn, CardLayout } from '../utils/cardLayout';
import { quotedPostAt } from '../utils/hitTest';
import { GESTURES } from '../constants/gestures';
import { TEXT_WRAP_FRACTION } from '../utils/buildPostPayload';

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
  // The stage's height, to line a gradient background up with the image
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    if (!postId) return;
    api.get<Post>(endpoints.getPost(postId))
      .then(response => setPost(response.data))
      .catch(() => { if (!seed) setError(true); });
  }, [postId, seed]);

  const quote = (original: Post) => {
    if (!original.rendered_image_url) return;
    (navigation as any).navigate('PostComposer', {
      repostData: { originalPost: original, screenshotUri: original.rendered_image_url },
    });
  };
  const handleRepost = () => {
    if (post) quote(post);
  };

  // A tap's post: one quoted inside this one when the tap is on its strip
  // (deepest wins), else this post. x/y are in the post box's own
  // coordinates (the gesture handler reports them unzoomed).
  const postAt = (layout: CardLayout, x: number, y: number) =>
    quotedPostAt(post?.quote_chain ?? [], canvasPointIn(layout, { x, y }));
  const handleTap = (layout: CardLayout, x: number, y: number) => {
    const id = postAt(layout, x, y);
    if (id) (navigation as any).push('PostDetail', { postId: id });
  };
  const handleDoubleTap = async (layout: CardLayout, x: number, y: number) => {
    const id = postAt(layout, x, y);
    if (!id) {
      handleRepost();
      return;
    }
    try {
      const { data } = await api.get<Post>(endpoints.getPost(id));
      quote(data);
    } catch {
      // the tap simply does nothing if the quoted post cannot be fetched
    }
  };
  const doubleTapRef = useRef(null);

  // The whole post, full width, never cropped (fullPostLayout); tall posts
  // scroll, and the stage zooms. Taps and double taps are gesture handlers
  // so their coordinates are the box's own, whatever the zoom.
  const renderImage = (layout: CardLayout | null) => {
    if (!post?.rendered_image_url) return null;
    if (!layout) {
      return (
        <Image
          source={{ uri: absoluteUrl(post.rendered_image_url) }}
          style={{ width: '100%', aspectRatio: 0.8 }}
          resizeMode="contain"
        />
      );
    }
    const { scale, crop } = layout;
    return (
      <TapGestureHandler
        waitFor={doubleTapRef}
        onHandlerStateChange={e => {
          if (e.nativeEvent.state === GestureState.ACTIVE) handleTap(layout, e.nativeEvent.x, e.nativeEvent.y);
        }}
      >
        <TapGestureHandler
          ref={doubleTapRef}
          numberOfTaps={2}
          maxDelayMs={GESTURES.tap.doubleTapWindowMs}
          onHandlerStateChange={e => {
            if (e.nativeEvent.state === GestureState.ACTIVE) handleDoubleTap(layout, e.nativeEvent.x, e.nativeEvent.y);
          }}
        >
          <View style={{ width: layout.width, height: layout.height, overflow: 'hidden' }}>
            <Image
              source={{ uri: absoluteUrl(post.rendered_image_url) }}
              style={{
                position: 'absolute',
                left: layout.imageLeft,
                top: layout.imageTop,
                width: layout.imageWidth,
                height: layout.imageHeight,
              }}
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
              const maxWidth = layout.width * TEXT_WRAP_FRACTION;
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
        </TapGestureHandler>
      </TapGestureHandler>
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

  const layout = post ? fullPostLayout(post, screenWidth) : null;
  // Short posts sit centred in the stage; taller ones start at its top
  const boxTop = layout && stageHeight ? Math.max(0, (stageHeight - layout.height) / 2) : 0;

  // A gradient post's image is only its band of the gradient, so the same
  // gradient fills the stage around it, mapped through the image's placement
  // so where they overlap they are the same pixels.
  const renderGradient = () => {
    const stops = post?.background_gradient;
    if (!post || !layout || !stops || stops.length < 2 || !stageHeight) return null;
    return (
      <LinearGradient
        pointerEvents="none"
        colors={stops as [string, string, ...string[]]}
        {...gradientEndpoints(post, layout, { width: screenWidth, height: stageHeight, top: boxTop })}
        style={StyleSheet.absoluteFill}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {!post && !error && (
        <View style={styles.loading}>
          {/* blank in the post's colour: the loading animation is first-launch only */}
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
          <View style={styles.stage} onLayout={e => setStageHeight(e.nativeEvent.layout.height)}>
            {renderGradient()}
            <ScrollView
              style={StyleSheet.absoluteFill}
              // a short post sits centred (boxTop), a tall one starts at the top
              contentContainerStyle={{ paddingTop: boxTop, paddingBottom: boxTop }}
              maximumZoomScale={GESTURES.zoom.maxScale}
              minimumZoomScale={1}
              bouncesZoom
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              {renderImage(layout)}
            </ScrollView>
          </View>

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
  // The post floats in its own colour, edge to edge
  stage: {
    flex: 1,
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
    bottom: CHROME.bottomInset,
    width: CHROME.detailButtonWidth,
    height: CHROME.detailButtonHeight,
    borderWidth: 1,
    borderColor: CHROME.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  quoteButtonText: {
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    fontSize: CHROME.detailButtonFontSize,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
