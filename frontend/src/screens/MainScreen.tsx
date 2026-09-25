import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Alert,
  Pressable,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { api, endpoints } from '../config/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Feed from '../components/Feed';
import { GUIDELINES_TEXT, TERMS_TEXT } from '../constants/legal';
import { subscribeToPostCreated, PostEvent } from '../utils/postEvents';
import { metricsFor, inkBaselineFor } from '../constants/fontMetrics';
import { Colors, FontChoices, resolveFontFace } from '../constants/colors';
import { contrastRatio, hexToRgb } from '../utils/contrast';
import { FontChoice, Post } from '../types';
import { SPACE, CHROME } from '../constants/space';

const { width: screenWidth } = Dimensions.get('window');

export default function MainScreen() {
  const navigation = useNavigation();
  const [newPost, setNewPost] = useState<Post | null>(null);

  // The masthead is part of the collage: on load it randomly inherits the
  // style of one of the first-page posts (font, color, and formatting),
  // and tapping the header's negative space re-rolls it from the same pool.
  const [headerTheme, setHeaderTheme] = useState({
    background: Colors.background,
    text: Colors.primary,
    fontFamily: 'ArialBlack',
    fontWeight: 'normal' as 'normal' | 'bold',
    underline: false,
    letterSpacing: 1,
    glow: false,
    caps: false,
    fontSize: 24,
    sourceId: '',
  });
  const themePool = useRef<Post[]>([]);
  const themeLatched = useRef(false);
  // The + button keeps the launch theme; header rerolls leave it alone
  const [buttonTheme, setButtonTheme] = useState({ background: Colors.accent, text: Colors.background });
  const buttonThemeLatched = useRef(false);

  const applyThemeFromPost = (post: Post) => {
    const background = post.background_color || Colors.background;
    const bg = hexToRgb(background);
    const text = contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0])
      ? '#FFFFFF'
      : '#000000';
    const fontKey = (post.font_choice as FontChoice) in FontChoices ? (post.font_choice as FontChoice) : 'arial-black';
    const fontConfig = FontChoices[fontKey];
    // Inherit formatting from the post's first element with ink, clamped
    // to what the masthead can wear without breaking
    const elements: any[] = Array.isArray((post as any).text_elements) ? (post as any).text_elements : [];
    const el = elements.find(e => (e?.text || '').trim().length > 0) || {};
    const k = 1080 / Dimensions.get('window').width; // canvas px -> screen pt
    if (!buttonThemeLatched.current) {
      buttonThemeLatched.current = true;
      setButtonTheme({ background, text });
    }
    setHeaderTheme({
      background,
      text,
      fontFamily: resolveFontFace(fontKey, !!el.bold, !!el.italic),
      fontWeight: fontConfig.fontWeight as 'normal' | 'bold',
      underline: !!el.underline,
      letterSpacing: Math.min((Number(el.letterSpacing) || 0) / k, 3) || 1,
      glow: !!el.glow,
      caps: !!el.capsLock,
      fontSize: fitHeaderSize(resolveFontFace(fontKey, !!el.bold, !!el.italic)),
      sourceId: post.id,
    });
  };

  const handleFeedLoaded = (posts: Post[]) => {
    try {
      buildThemePool(posts);
    } catch (error) {
      console.log('Masthead theme sampling failed (non-critical):', error);
    }
  };

  const buildThemePool = (posts: Post[]) => {
    // Every level on the page is a candidate, quoted ancestors included -
    // a repost's middle levels have styles the top level never shows.
    const levels: Post[] = [];
    posts.slice(0, 20).forEach(post => {
      levels.push(post);
      (post.quote_chain || []).forEach((level: any, i: number) => {
        if (!level?.background_color) return;
        levels.push({
          ...post,
          id: `${post.id}-q${i}`,
          background_color: level.background_color,
          font_choice: level.font_choice || post.font_choice,
          text_elements: level.text_elements || [],
        } as Post);
      });
    });
    themePool.current = levels;
    if (themeLatched.current || posts.length === 0) return;
    themeLatched.current = true;
    // The masthead starts randomized. Half the time it borrows a costume
    // from something on the page (any level, quoted ancestors included),
    // half the time it rolls the full composer option space - same as a tap.
    const pool = themePool.current;
    if (pool.length > 0 && Math.random() < 0.5) {
      applyThemeFromPost(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      rerollHeaderTheme();
    }
  };

  // Tapping the masthead re-rolls it from the FULL composer option space -
  // every font, colour and formatting toggle a post could use - rather than
  // from what happens to be in the feed. Guards: the font always changes,
  // ink always clears 4.5:1 against the background, size stays in a range
  // the one-line masthead can wear.
  // The baseline is held by arithmetic, not by freezing the size: each title
  // is positioned so (top + ascent x fontSize) lands on the same line, using
  // ascents measured from the shipped TTFs. Size picks the largest that still
  // fits the slot, so autoshrink never fires and never invalidates the maths.
  const HEADER_SIZE_RANGE = [20, 30];
  const HEADER_BASELINE = 30; // px from the top of the title slot
  const headerSlotWidth = screenWidth - 92; // padding + profile icon + margin

  const fitHeaderSize = (fontFamily: string) => {
    const { widthPerPt } = metricsFor(fontFamily);
    const maxThatFits = Math.floor(headerSlotWidth / widthPerPt);
    const hi = Math.min(HEADER_SIZE_RANGE[1], maxThatFits);
    const lo = Math.min(HEADER_SIZE_RANGE[0], hi);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  };
  const rerollHeaderTheme = () => {
    const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
    const fontKeys = (Object.keys(FontChoices) as FontChoice[]).filter(
      k => resolveFontFace(k, false, false) !== headerTheme.fontFamily,
    );
    const fontKey = pick(fontKeys.length > 0 ? fontKeys : (Object.keys(FontChoices) as FontChoice[]));
    const variants = (FontChoices[fontKey] as any).variants || {};
    const bold = !!variants.bold && Math.random() < 0.4;
    const italic = !!variants.italic && Math.random() < 0.3;

    const background = pick(Colors.postColors);
    const bg = hexToRgb(background);
    // Readable ink only: palette colours that clear 4.5:1, else black/white
    const readable = Colors.postColors.filter(
      c => contrastRatio(bg, hexToRgb(c)) >= 4.5,
    );
    const text = readable.length > 0
      ? pick(readable)
      : (contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0]) ? '#FFFFFF' : '#000000');

    setHeaderTheme({
      background,
      text,
      fontFamily: resolveFontFace(fontKey, bold, italic),
      fontWeight: FontChoices[fontKey].fontWeight as 'normal' | 'bold',
      underline: Math.random() < 0.08,
      letterSpacing: pick([0, 1, 2, 3]),
      glow: Math.random() < 0.25,
      caps: Math.random() < 0.3,
      fontSize: fitHeaderSize(resolveFontFace(fontKey, bold, italic)),
      sourceId: '',
    });
  };

  // First-open: offer the generated handle for editing before first use
  const ONBOARD_FLAG = FileSystem.documentDirectory + 'onboarded.flag';
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardHandle, setOnboardHandle] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(ONBOARD_FLAG);
        if (!info.exists) {
          const profile = await api.get(endpoints.getUserProfile);
          setOnboardHandle(profile.data.handle || '');
          setShowOnboarding(true);
        }
      } catch (error) {
        console.log('Onboarding check failed (non-critical):', error);
      }
    })();
  }, []);

  const completeOnboarding = async () => {
    if (!agreedTerms) return;
    const next = onboardHandle.trim().toLowerCase();
    try {
      if (next) {
        await api.patch(endpoints.getUserProfile, { handle: next });
      }
      await FileSystem.writeAsStringAsync(ONBOARD_FLAG, 'done');
      setShowOnboarding(false);
    } catch (error: any) {
      Alert.alert('Handle', error.response?.data?.handle?.[0] || 'Could not save handle');
    }
  };

  // Header rides the scroll 1:1 (Safari-style): diffClamp accumulates
  // scroll deltas into [0, HEADER_HIDE], so any downward motion tucks the
  // header proportionally and any upward motion immediately returns it.
  // Native driver keeps it glued to the finger.
  const HEADER_HIDE = 100;
  // Dead zone: the first SLOP points of downward scroll do nothing, so
  // micro-scrolls and re-grips don't tuck the header. Once committed the
  // ride is 1:1, and revealing on scroll-up is instant (the interpolation
  // band sits at the top of the clamp range).
  const HEADER_SLOP = 80;
  const scrollY = useRef(new Animated.Value(0)).current;
  // The top-bounce's spring-back reads as downward scroll and would eat
  // the dead zone; clamping negative offsets makes the bounce invisible
  // to the header math.
  const scrollYPositive = useRef(
    scrollY.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: 'clamp',
    })
  ).current;
  const headerTranslateY = useRef(
    Animated.diffClamp(scrollYPositive, 0, HEADER_SLOP + HEADER_HIDE).interpolate({
      inputRange: [0, HEADER_SLOP, HEADER_SLOP + HEADER_HIDE],
      outputRange: [0, 0, -HEADER_HIDE],
      extrapolate: 'clamp',
    })
  ).current;

  const [newPostEvent, setNewPostEvent] = useState<PostEvent | null>(null);

  const handleNewPost = (post: Post) => {
    setNewPost(post);
  };

  // Eagerly-posted content arrives here after the composer has already closed
  useEffect(() => subscribeToPostCreated(setNewPostEvent), []);

  const handleNewPostDisplayed = () => {
    setNewPost(null);
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const openPostComposer = () => {
    navigation.navigate('PostComposer' as never);
  };

  const openProfile = () => {
    navigation.navigate('Profile' as never);
  };

  return (
    <View style={styles.container}>
      {/* Collapsible Header */}
      <Animated.View
        style={[
          styles.header,
          {
            transform: [{ translateY: headerTranslateY }],
            backgroundColor: headerTheme.background,
          },
        ]}
      >
        <Pressable onPress={rerollHeaderTheme}>
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          <View style={styles.appTitleSlot}>
          <Text
            style={[styles.appTitle, {
              top: HEADER_BASELINE - inkBaselineFor(headerTheme.fontFamily) * headerTheme.fontSize,
              color: headerTheme.text,
              fontFamily: headerTheme.fontFamily,
              fontWeight: headerTheme.fontWeight,
              fontSize: headerTheme.fontSize,
              textDecorationLine: headerTheme.underline ? 'underline' as const : 'none' as const,
              letterSpacing: headerTheme.letterSpacing,
              textTransform: headerTheme.caps ? 'uppercase' as const : 'none' as const,
              ...(headerTheme.glow ? {
                textShadowColor: headerTheme.text,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
              } : {}),
            }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            Creative Mind's Ideas
          </Text>
          </View>
          <TouchableOpacity onPress={openProfile} style={styles.profileButton}>
            <Ionicons name="person-circle-outline" size={28} color={headerTheme.text} />
          </TouchableOpacity>
        </SafeAreaView>
        </Pressable>
      </Animated.View>

      {/* Main Feed */}
      <View style={styles.feedContainer}>
        <Feed 
          newPost={newPost}
          onNewPostDisplayed={handleNewPostDisplayed}
          onFeedLoaded={handleFeedLoaded}
          postEvent={newPostEvent}
          onScroll={handleScroll}
          contentInsetAdjustmentBehavior="never"
          contentInset={{ top: 100 }}
          scrollIndicatorInsets={{ top: 80 }}
        />
      </View>

      {/* First-open handle picker */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        {/* Tap anywhere outside a control to drop the keyboard */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.onboardOverlay}>
          <View style={styles.onboardCard}>
            <Text style={styles.onboardTitle}>Pick your handle</Text>
            <View style={styles.onboardInputRow}>
              <Text style={styles.onboardAt}>@</Text>
              <TextInput
                style={styles.onboardInput}
                value={onboardHandle}
                onChangeText={setOnboardHandle}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
            </View>
            <TouchableOpacity
              style={styles.onboardCheckRow}
              onPress={() => setAgreedTerms(prev => !prev)}
              activeOpacity={0.7}
            >
              <View style={[styles.onboardCheckbox, agreedTerms && styles.onboardCheckboxChecked]} />
              <Text style={styles.onboardCheckText}>
                I agree to the{' '}
                <Text
                  style={styles.onboardLink}
                  onPress={() => Alert.alert('Terms of Service', TERMS_TEXT, [{ text: 'OK' }])}
                >
                  terms
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.onboardLink}
                  onPress={() => Alert.alert('Community Guidelines', GUIDELINES_TEXT, [{ text: 'OK' }])}
                >
                  guidelines
                </Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.onboardButton, !agreedTerms && styles.onboardButtonDisabled]}
              onPress={completeOnboarding}
              disabled={!agreedTerms}
            >
              <Text style={styles.onboardButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Floating Post Button */}
      <TouchableOpacity
        style={[styles.floatingButton, { backgroundColor: buttonTheme.background }]}
        onPress={openPostComposer}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={buttonTheme.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    zIndex: 1000,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CHROME.inset,
    paddingBottom: SPACE.md,
  },
  // The slot has a fixed height and bottom-aligns its text, so every
  // randomized costume - whatever font or size it draws - sits on the same
  // baseline instead of bouncing the masthead around.
  appTitleSlot: {
    flex: 1,
    height: 38,
    marginRight: SPACE.md,
  },
  appTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    includeFontPadding: false,
    fontSize: 24,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    color: Colors.primary,
    letterSpacing: 1,
  },
  profileButton: {
    padding: SPACE.xs,
    marginRight: -SPACE.xs,
  },
  feedContainer: {
    flex: 1,
  },
  onboardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xxl,
  },
  onboardCard: {
    backgroundColor: Colors.background,
    padding: SPACE.xl,
  },
  onboardTitle: {
    fontSize: 20,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: SPACE.sm,
  },
  onboardInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: SPACE.md,
    marginBottom: SPACE.xl,
  },
  onboardAt: {
    fontSize: 18,
    fontFamily: 'CourierPrime',
    color: Colors.secondary,
    marginRight: SPACE.xs,
  },
  onboardInput: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'CourierPrime',
    color: Colors.primary,
    paddingVertical: SPACE.md,
  },
  onboardCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  onboardCheckbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: SPACE.sm,
  },
  onboardCheckboxChecked: {
    backgroundColor: Colors.primary,
  },
  onboardCheckText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'CourierPrime',
    color: Colors.primary,
  },
  onboardLink: {
    textDecorationLine: 'underline',
  },
  onboardButton: {
    backgroundColor: Colors.accent,
    paddingVertical: SPACE.md,
    alignItems: 'center',
  },
  onboardButtonDisabled: {
    opacity: 0.35,
  },
  onboardButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'CourierPrime',
    fontWeight: '700',
  },
  floatingButton: {
    position: 'absolute',
    bottom: CHROME.bottomInset,
    right: CHROME.inset,
    borderWidth: 1,
    borderColor: CHROME.hairline,
    width: 56,
    height: 56,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: Colors.accent,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
