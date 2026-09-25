import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { FEATURES } from '../constants/features';
import { CHROME } from '../constants/layout';
import { Colors } from '../constants/colors';
import { Post } from '../types';
import { absoluteUrl } from '../config/api';
import { contrastRatio, hexToRgb } from '../utils/contrast';
import { displayCropBounds } from '../utils/displayCrop';

const { width: screenWidth } = Dimensions.get('window');

interface Props {
  onSwipeableOpen?: (ref: React.RefObject<Swipeable | null>) => void;
  post: Post;
  onReport: (reason: string, description: string) => void;
  onMute: () => void;
  onBlock: () => void;
}

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'fake', label: 'Fake/Misleading' },
  { value: 'other', label: 'Other' },
];

const chipTextColor = (background: string) => {
  const bg = hexToRgb(background);
  return contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0])
    ? '#FFFFFF'
    : '#000000';
};

export default function PostCard({ post, onReport, onMute, onBlock, onSwipeableOpen }: Props) {
  const swipeableRef = React.useRef<Swipeable | null>(null);
  const navigation = useNavigation();
  const [showReportModal, setShowReportModal] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1);
  // Recursive compression. collapsedAt: null = fully expanded; 0 = the
  // whole card is a chip; k >= 1 = ancestors from level k down are hidden
  // behind a chip (level 1 = direct parent). Blocked ancestors lock the
  // deepest allowed expansion.
  const chain = post.quote_chain || [];
  const hiddenIndex = chain.findIndex(level => level.hidden);
  const lockLevel = hiddenIndex >= 0 ? hiddenIndex + 1 : null;
  const [collapsedAt, setCollapsedAt] = useState<number | null>(lockLevel);

  // Prefetch the renders that collapse states need, so toggling is instant
  useEffect(() => {
    const urls = [post.response_image_url, ...chain.map(level => level.strip.url)]
      .filter(Boolean)
      .map(u => absoluteUrl(u as string)!);
    urls.forEach(u => Image.prefetch(u).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  if (__DEV__ && !post.rendered_image_url) {
    console.log('Post missing rendered image; falling back to placeholder.', {
      id: post.id,
      text_length: post.text_content?.length || 0,
    });
  }

  const hasResponseRender = !!post.response_image_url;
  const levelCollapsed = collapsedAt !== null && collapsedAt >= 1 && hasResponseRender;
  const displayUri = post.rendered_image_url;
  const displayTopY = post.top_y;
  const displayBottomY = post.bottom_y;

  const handleRepost = () => {
    const imageUri = post.rendered_image_url;
    if (!imageUri) {
      Alert.alert('Error', 'This post cannot be reposted (no image available)');
      return;
    }
    (navigation as any).navigate('PostComposer', {
      repostData: {
        originalPost: post,
        screenshotUri: imageUri,
      },
    });
  };

  // Captured at onPressIn: locationX/Y are unreliable in onPress events
  const pressLocation = { current: { x: 0, y: 0 } } as { current: { x: number; y: number } };
  // Double tap quotes the post. A single tap's action (collapse, when that
  // feature is on) waits out the double-tap window so the two don't both
  // fire; with collapse parked the wait costs nothing.
  // A light flash confirms the tap landed - the posts are full-bleed images
  // with no other press feedback. Colour is chosen against the post's own
  // background so it reads on white and black alike.
  const flashOpacity = React.useRef(new Animated.Value(0)).current;
  const flashColor = chipTextColor(post.background_color || '#1B1B1B');
  const flash = () => {
    flashOpacity.stopAnimation();
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 0.18, duration: 60, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const DOUBLE_TAP_MS = 260;
  const tapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  const handleBodyPress = () => {
    flash();
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      handleRepost();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      handleSingleTap();
    }, DOUBLE_TAP_MS);
  };

  const handleSingleTap = () => {
    if (!FEATURES.collapsePosts) {
      openDetail();
      return;
    }
    // locationX/Y are relative to the touched child - the full-canvas Image -
    // so dividing by scale yields CANVAS coordinates directly
    const { x: locationX, y: locationY } = pressLocation.current;
    const canvasWidth = post.image_width || 0;
    if (collapsedAt === null && chain.length > 0 && canvasWidth > 0) {
      const scale = screenWidth / canvasWidth;
      const canvasX = locationX / scale;
      const canvasY = locationY / scale;
      // Deepest level whose rect contains the tap wins
      let hit: number | null = null;
      chain.forEach((level, index) => {
        const r = level.rect;
        if (
          canvasY >= r.y && canvasY <= r.y + r.height &&
          canvasX >= r.x && canvasX <= r.x + r.width
        ) {
          hit = index + 1;
        }
      });
      if (hit !== null) {
        setCollapsedAt(hit);
        return;
      }
    }
    setCollapsedAt(0);
  };

  const openDetail = () => {
    // Hand the post over: the feed already has every field the detail screen
    // needs, and its image is already in cache, so the screen renders warm
    // instead of flashing the loading animation while it refetches.
    (navigation as any).navigate('PostDetail', { postId: post.id, post });
  };

  const confirmMute = () => {
    Alert.alert(
      'Mute User',
      "You won't see their posts anymore.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mute', style: 'destructive', onPress: onMute },
      ]
    );
  };

  const confirmBlock = () => {
    Alert.alert(
      'Block User',
      'Their posts disappear for you, your posts disappear for them, and their quoted posts are hidden.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: onBlock },
      ]
    );
  };

  const handleReport = (reason: string) => {
    setShowReportModal(false);
    onReport(reason, '');
  };

  // Left-edge rail (swipe right): the bad stuff
  const renderModerationRail = () => (
    <View style={styles.rail}>
      <TouchableOpacity
        style={[styles.railButton, { backgroundColor: Colors.warning }]}
        onPress={() => setShowReportModal(true)}
      >
        <Text style={styles.railText}>Report</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.railButton, { backgroundColor: Colors.secondary }]}
        onPress={confirmMute}
      >
        <Text style={styles.railText}>Mute</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.railButton, { backgroundColor: Colors.error }]}
        onPress={confirmBlock}
      >
        <Text style={styles.railText}>Block</Text>
      </TouchableOpacity>
    </View>
  );

  // Collapsed-at-level view: stacked segments with dead space squeezed.
  // Own reply (tight crop) + each still-visible ancestor's reply strip +
  // a chip band in the post's own background color.
  const renderChipContents = (background: string, snippet: string, expandTo: number | null) => {
    const textColor = chipTextColor(background);
    return (
      <TouchableOpacity
        style={[styles.collapsedChip, { backgroundColor: background, marginVertical: 0 }]}
        onPress={() => setCollapsedAt(expandTo)}
        activeOpacity={0.85}
      >
        <Text style={[styles.collapsedChipText, { color: textColor }]} numberOfLines={1}>
          {snippet.trim() || '...'}
        </Text>
        <Text style={[styles.collapsedChipToggle, { color: textColor }]}>+</Text>
      </TouchableOpacity>
    );
  };

  const renderSqueezedStack = () => {
    const level = collapsedAt as number; // >= 1
    const rootScale = screenWidth / (post.image_width || 1080);
    const chipLevel = chain[level - 1];
    const MARGIN = 8;

    const chipNode = chipLevel?.hidden ? (
      <View style={[styles.collapsedChip, styles.inlineChipHidden]}>
        <Text style={styles.inlineChipHiddenText}>hidden</Text>
      </View>
    ) : (
      renderChipContents(
        chipLevel?.background_color || Colors.surface,
        chipLevel?.snippet || '',
        lockLevel !== null && lockLevel <= level ? lockLevel : null,
      )
    );

    // A crop of `source` (full-canvas render) covering source rows
    // [fromY, toY), displayed at displayScale
    const cropSegment = (
      key: string,
      url: string,
      imageHeight: number,
      fromY: number,
      toY: number,
      displayScale: number,
    ) => {
      const height = (toY - fromY) * displayScale;
      if (height < 3) return null;
      return (
        <View key={key} style={{ width: '100%', height, overflow: 'hidden' }}>
          <Image
            source={{ uri: absoluteUrl(url) }}
            style={{
              width: '100%',
              height: imageHeight * displayScale,
              transform: [{ translateY: -fromY * displayScale }],
            }}
            resizeMode="cover"
          />
        </View>
      );
    };

    // Recursive: content of ancestor level `i`, splitting its strip around
    // its own child (the next ancestor's rect, or the chip when i+1 is the
    // collapsed level). Rects are all in root-canvas px, so relative
    // geometry falls out of subtraction.
    const buildChild = (i: number): React.ReactNode => {
      if (i >= level - 1) {
        return <View style={styles.chipWrap}>{chipNode}</View>;
      }
      const ancestor = chain[i];
      const strip = ancestor.strip;
      if (!strip.url || !strip.image_width) {
        return <View style={styles.chipWrap}>{chipNode}</View>;
      }
      const displayWidth = ancestor.rect.width * rootScale;
      const stripScale = displayWidth / strip.image_width;
      const child = chain[i + 1];

      // Child rect relative to this ancestor's strip, in source rows of the
      // ancestor's own canvas
      const childTopSrc = strip.top_y + (child.rect.y - ancestor.rect.y) / (ancestor.rect.height / Math.max(strip.bottom_y - strip.top_y, 1));
      const childHeightSrc = child.rect.height / (ancestor.rect.height / Math.max(strip.bottom_y - strip.top_y, 1));
      const childWidth = child.rect.width * rootScale;
      const childLeft = Math.max(0, Math.min(displayWidth - childWidth, (child.rect.x - ancestor.rect.x) * rootScale));

      return (
        <View
          style={{
            width: displayWidth,
            borderWidth: 1,
            borderColor: '#88888A',
            overflow: 'hidden',
            backgroundColor: ancestor.background_color || Colors.surface,
          }}
        >
          {cropSegment(`a${i}-top`, strip.url, strip.image_height || 0,
            strip.top_y, Math.max(strip.top_y, childTopSrc - MARGIN / stripScale), stripScale)}
          <View style={{ width: childWidth, marginLeft: childLeft, marginVertical: 6 }}>
            {buildChild(i + 1)}
          </View>
          {cropSegment(`a${i}-bottom`, strip.url, strip.image_height || 0,
            Math.min(strip.bottom_y, childTopSrc + childHeightSrc + MARGIN / stripScale), strip.bottom_y, stripScale)}
        </View>
      );
    };

    // Root level: split the reply render around level 1's rect, preserving
    // where content sits relative to the (now hidden or shrunken) quote
    const rootRect = chain[0].rect;
    const responseTop = typeof post.response_top_y === 'number' ? post.response_top_y : rootRect.y;
    const responseBottom = typeof post.response_bottom_y === 'number' ? post.response_bottom_y : rootRect.y + rootRect.height;
    const canvasHeight = post.image_height || 0;
    const marginSrc = MARGIN / rootScale;
    const childWidth = rootRect.width * rootScale;
    const childLeft = Math.max(0, Math.min(screenWidth - childWidth, rootRect.x * rootScale));
    const rectBottom = rootRect.y + rootRect.height;

    // Side-by-side detection: when reply content overlaps the strip's
    // vertical range, splitting would cut it - keep the band and overlay
    // the collapsed chain at the strip's true position instead (relative
    // geometry honored, no squeeze for this case)
    const overlap = Math.max(0, Math.min(responseBottom, rectBottom) - Math.max(responseTop, rootRect.y));
    const sideBySide = overlap > rootRect.height * 0.2;

    if (sideBySide && post.response_image_url) {
      const bandTop = Math.min(rootRect.y, responseTop);
      const bandBottom = Math.max(rectBottom, responseBottom);
      return (
        <View style={{ width: '100%', backgroundColor: post.background_color || Colors.surface }}>
          {cropSegment('band', post.response_image_url, canvasHeight, bandTop, bandBottom, rootScale)}
          <View
            style={{
              position: 'absolute',
              left: childLeft,
              top: (rootRect.y - bandTop) * rootScale,
              width: childWidth,
              height: rootRect.height * rootScale,
              justifyContent: 'center',
            }}
          >
            {buildChild(0)}
          </View>
        </View>
      );
    }

    return (
      <View style={{ width: '100%', backgroundColor: post.background_color || Colors.surface }}>
        {post.response_image_url && cropSegment('root-top', post.response_image_url, canvasHeight,
          responseTop, rootRect.y - marginSrc, rootScale)}
        <View style={{ width: childWidth, marginLeft: childLeft, marginVertical: 6 }}>
          {buildChild(0)}
        </View>
        {post.response_image_url && cropSegment('root-bottom', post.response_image_url, canvasHeight,
          rootRect.y + rootRect.height + marginSrc, responseBottom, rootScale)}
      </View>
    );
  };

  const renderImage = () => {
    if (levelCollapsed) {
      return renderSqueezedStack();
    }
    if (!displayUri) {
      return (
        <View style={styles.placeholderImage}>
          <Text style={styles.placeholderText}>{post.text_content}</Text>
        </View>
      );
    }

    const canvasWidth = post.image_width && post.image_width > 0 ? post.image_width : null;
    const canvasHeight = post.image_height && post.image_height > 0 ? post.image_height : null;
    const topY = typeof displayTopY === 'number' ? displayTopY : null;
    const bottomY = typeof displayBottomY === 'number' ? displayBottomY : null;

    if (canvasWidth && canvasHeight && topY !== null && bottomY !== null && bottomY > topY) {
      const scale = screenWidth / canvasWidth;
      const crop = displayCropBounds(topY, bottomY, canvasWidth, canvasHeight, screenWidth);
      const croppedHeight = Math.max(crop.bottomY - crop.topY, 1);
      return (
        <View style={[styles.postImageWrapper, { height: croppedHeight * scale }]}>
          <Image
            source={{ uri: absoluteUrl(displayUri) }}
            style={[styles.postImage, {
              height: canvasHeight * scale,
              transform: [{ translateY: -crop.topY * scale }],
            }]}
            resizeMode="cover"
            onError={(error) => console.log('Post image error:', error.nativeEvent)}
          />
        </View>
      );
    }

    return (
      <View style={[styles.postImageWrapper, { aspectRatio: imageAspectRatio, maxHeight: screenWidth * 1.5 }]}>
        <Image
          source={{ uri: absoluteUrl(displayUri) }}
          style={[styles.postImage, { aspectRatio: imageAspectRatio }]}
          resizeMode="cover"
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source;
            setImageAspectRatio(width / height);
          }}
        />
      </View>
    );
  };

  const renderReportModal = () => (
    <Modal
      visible={showReportModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowReportModal(false)}
    >
      <TouchableWithoutFeedback onPress={() => setShowReportModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.reportModal}>
              <Text style={styles.modalTitle}>Report Post</Text>
              <Text style={styles.modalSubtitle}>Why are you reporting this post?</Text>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.value}
                  style={styles.reportReason}
                  onPress={() => handleReport(reason.value)}
                >
                  <Text style={styles.reportReasonText}>{reason.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  // Right-edge rail (swipe left): actions on the post - the growth slot
  // (like/follow will live here someday)
  const renderActionsRail = () => (
    <View style={styles.rail}>
      <TouchableOpacity
        style={[styles.railButton, { backgroundColor: Colors.link }]}
        onPress={openDetail}
      >
        <Text style={styles.railText}>Open</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.railButton, { backgroundColor: Colors.surface }]}
        onPress={handleRepost}
      >
        <Text style={styles.railText}>Quote</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderModerationRail}
      renderRightActions={renderActionsRail}
      overshootRight={false}
      overshootLeft={false}
      onSwipeableOpenStartDrag={() => onSwipeableOpen?.(swipeableRef)}
      onSwipeableWillOpen={() => onSwipeableOpen?.(swipeableRef)}
    >
      <View
        style={[
          styles.container,
          // a locally-snapshotted post is provisional until the server
          // render replaces it
          (post as any).__optimistic && { opacity: 0.5 },
        ]}
      >
        {/* Tap opens detail (selectable text); long-press stages a repost */}
        {collapsedAt === 0 ? (
          <TouchableOpacity
            style={styles.collapsedRow}
            onPress={() => setCollapsedAt(lockLevel)}
            activeOpacity={0.7}
          >
          <TouchableOpacity
            style={[styles.collapsedChip, { backgroundColor: post.background_color || Colors.surface }]}
            onPress={() => setCollapsedAt(lockLevel)}
            onLongPress={handleRepost}
            delayLongPress={400}
            activeOpacity={0.85}
          >
            <Text
              style={[styles.collapsedChipText, { color: chipTextColor(post.background_color || '#1B1B1B') }]}
              numberOfLines={1}
            >
              {(post.text_content || '').trim().slice(0, 24) || '...'}
            </Text>
            <Text style={[styles.collapsedChipToggle, { color: chipTextColor(post.background_color || '#1B1B1B') }]}>
              +
            </Text>
          </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.postContent}
            onPressIn={(event) => {
              pressLocation.current = {
                x: event.nativeEvent.locationX,
                y: event.nativeEvent.locationY,
              };
            }}
            onPress={handleBodyPress}
            onLongPress={handleRepost}
            delayLongPress={400}
            activeOpacity={0.95}
          >
            {renderImage()}
          </TouchableOpacity>
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: flashColor, opacity: flashOpacity },
          ]}
        />
        {/* Visible quote affordance - double tap and long press do the same,
            but neither announces itself. Auto-contrasts against the post. */}
        {collapsedAt !== 0 && (
          <TouchableOpacity
            style={[styles.quoteButton, { backgroundColor: flashColor }]}
            onPress={handleRepost}
            activeOpacity={0.7}
            hitSlop={{ top: CHROME.hitSlop, left: CHROME.hitSlop, right: CHROME.hitSlop, bottom: CHROME.hitSlop }}
          >
            <Text style={[styles.quoteButtonText, { color: post.background_color || Colors.background }]}>Aa</Text>
          </TouchableOpacity>
        )}
        {renderReportModal()}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
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
    zIndex: 30,
  },
  quoteButtonText: {
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    fontSize: 15,
    // no lineHeight: an explicit one sat the glyph high in the box
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  container: {
    backgroundColor: Colors.background,
    marginBottom: 0, // no gap between posts
    width: '100%',
  },
  postContent: {
    width: '100%',
  },
  postImageWrapper: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  postImage: {
    width: '100%',
    backgroundColor: Colors.surface,
  },
  placeholderImage: {
    width: '100%',
    aspectRatio: '2/3',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    color: Colors.primary,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'CourierPrime',
  },
  // Collapsed post: the whole post compressed into a chip
  collapsedChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 14,
    marginBottom: 10,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.18)',
  },
  collapsedRow: {
    width: '100%',
    alignItems: 'center',
  },
  chipWrap: {
    width: '100%',
    alignItems: 'center',
  },
  collapsedChipText: {
    fontSize: 14,
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  collapsedChipToggle: {
    fontSize: 16,
    fontFamily: 'CourierPrime',
    fontWeight: '800',
  },
  // Chip band: a slim margin-colored row holding the collapse chip
  chipBand: {
    width: '100%',
    paddingVertical: 8,
    alignItems: 'center',
  },
  inlineChipHidden: {
    backgroundColor: '#3A3A3C',
    marginVertical: 0,
  },
  inlineChipHiddenText: {
    color: '#9A9A9E',
    fontSize: 12,
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Swipe rail
  rail: {
    flexDirection: 'row',
  },
  railButton: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  railText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'CourierPrime',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  reportModal: {
    backgroundColor: Colors.surface,
    marginHorizontal: 32,
    padding: 24,
    alignSelf: 'center',
    maxWidth: 300,
    width: '100%',
  },
  modalTitle: {
    color: Colors.primary,
    fontSize: 18,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: Colors.secondary,
    fontSize: 14,
    fontFamily: 'CourierPrime',
    textAlign: 'center',
    marginBottom: 24,
  },
  reportReason: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  reportReasonText: {
    color: Colors.primary,
    fontSize: 16,
    fontFamily: 'CourierPrime',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
  },
  cancelText: {
    color: Colors.secondary,
    fontSize: 16,
    fontFamily: 'CourierPrime',
    textAlign: 'center',
  },
});
