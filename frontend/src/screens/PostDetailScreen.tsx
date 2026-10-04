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
  Animated,
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
import { Image as ExpoImage } from 'expo-image';
import { TapGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import PlanText from '../components/PlanText';
import { isTextPlan } from '../types/textPlan';
import { textResolutionFor } from '../utils/zoom';
import { FEATURES } from '../constants/features';
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
  const { postId, post: seed, textMode: textModeParam, zoomTest } =
    (route.params as { postId: string; post?: Post; textMode?: 'plan' | 'image'; zoomTest?: string }) || {};
  // 'plan': text drawn from the draw list over the text-free render; 'image':
  // the server's render. Development can force either (the parity check
  // opens each post both ways)
  const textMode = __DEV__ && textModeParam ? textModeParam : FEATURES.vectorPostText ? 'plan' : 'image';
  // Seeded from the feed when there is one - no fetch, no loading frame
  const [post, setPost] = useState<Post | null>(seed ?? null);
  const [error, setError] = useState(false);
  // The stage's height, to line a gradient background up with the image
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    if (!postId) return;
    // the screen can be handed another post (a link): start clean
    setError(false);
    setTextResolution(1);
    if (post && post.id !== postId) setPost(seed?.id === postId ? seed : null);
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
  // scroll. Taps and double taps are gesture handlers so their coordinates
  // are the box's own.
  //
  // With a text-free render, the text is drawn here as real text (PostText):
  // the post's own, and each visible quoted level's, clipped to its strip -
  // so zooming lays it out again at the new size instead of magnifying a
  // picture of it. Posts without one show their full render.
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
    const { scale } = layout;
    // visible quoted levels, outermost first; a hidden (blocked) one hides
    // everything inside it
    const chain = post.quote_chain ?? [];
    const hiddenAt = chain.findIndex(level => level.hidden);
    const levels = hiddenAt >= 0 ? chain.slice(0, hiddenAt) : chain;
    // Real text only when every visible level has its draw list; otherwise
    // the server's image, which always matches the feed
    const vector = textMode === 'plan' && !!post.textless_image_url && isTextPlan(post.text_plan)
      && levels.every(level => isTextPlan(level.text_plan));
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
            {/* the feed's own image component and cache: the post is already
                on disk from the feed, so it is there on the first frame */}
            <ExpoImage
              source={{ uri: absoluteUrl(vector ? post.textless_image_url! : post.rendered_image_url) }}
              style={{
                position: 'absolute',
                left: layout.imageLeft,
                top: layout.imageTop,
                width: layout.imageWidth,
                height: layout.imageHeight,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
            {vector && levels.map((level, i) => {
              const width = level.strip.image_width;
              if (!width || !isTextPlan(level.text_plan)) return null;
              // level px -> root px, and where the level's own canvas sits
              const levelScale = level.rect.width / width;
              return (
                <View
                  key={i}
                  pointerEvents="box-none"
                  style={{
                    position: 'absolute',
                    left: layout.imageLeft + level.rect.x * scale,
                    top: layout.imageTop + level.rect.y * scale,
                    width: level.rect.width * scale,
                    height: level.rect.height * scale,
                    overflow: 'hidden',
                  }}
                >
                  <PlanText
                    plan={level.text_plan}
                    resolution={textResolution}
                    scale={scale * levelScale}
                    offsetX={0}
                    offsetY={-(level.crop_top ?? 0) * levelScale * scale}
                    selectable
                  />
                </View>
              );
            })}
            {vector && isTextPlan(post.text_plan) && (
              <PlanText
                plan={post.text_plan}
                resolution={textResolution}
                scale={scale}
                offsetX={layout.imageLeft}
                offsetY={layout.imageTop}
                selectable
              />
            )}
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

  // Zoom is iOS's own (the scroll view's pinch): smooth, and nothing is laid
  // out again, so nothing can jump. Once a zoom settles the real text is
  // redrawn at that resolution (PlanText `resolution`: the same positions,
  // rasterised for the zoom), so it sharpens rather than staying a
  // magnified picture. Resolution steps are whole numbers to keep redraws few.
  const [textResolution, setTextResolution] = useState(1);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onZoomScroll = (zoomScale: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setTextResolution(textResolutionFor(zoomScale, GESTURES.zoom.maxScale));
    }, GESTURES.zoom.settleMs);
  };
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  // Development only: zoom in by itself (the flicker check records it)
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!__DEV__ || !zoomTest || !stageHeight) return;
    const t = setTimeout(() => (scrollRef.current as any)?.scrollResponderZoomTo?.({
      x: screenWidth * 0.3, y: stageHeight * 0.4, width: screenWidth * 0.4, height: stageHeight * 0.2, animated: true,
    }), 1200);
    return () => clearTimeout(t);
  }, [zoomTest, stageHeight, postId]);

  const layout = post ? fullPostLayout(post, screenWidth) : null;
  // Short posts sit centred in the stage; taller ones start at its top
  const boxTop = layout && stageHeight ? Math.max(0, (stageHeight - layout.height) / 2) : 0;
  const contentHeight = Math.max(stageHeight, (layout?.height ?? 0) + 2 * boxTop);

  // A gradient post's image is only its band of the gradient, so the same
  // gradient fills the content around it, mapped through the image's
  // placement so where they overlap they are the same pixels
  const renderGradient = () => {
    const stops = post?.background_gradient;
    if (!post || !layout || !stops || stops.length < 2 || !stageHeight) return null;
    return (
      <LinearGradient
        pointerEvents="none"
        colors={stops as [string, string, ...string[]]}
        {...gradientEndpoints(post, layout, { width: layout.width, height: contentHeight, top: boxTop })}
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
            <ScrollView
              // a new post starts unzoomed
              key={post.id}
              ref={scrollRef}
              style={StyleSheet.absoluteFill}
              contentContainerStyle={{ minHeight: contentHeight, paddingTop: boxTop }}
              maximumZoomScale={GESTURES.zoom.maxScale}
              minimumZoomScale={1}
              bouncesZoom
              onScroll={e => onZoomScroll(e.nativeEvent.zoomScale ?? 1)}
              scrollEventThrottle={32}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              {renderGradient()}
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
