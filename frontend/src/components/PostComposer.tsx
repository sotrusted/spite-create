import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  ScrollView,
  ImageBackground,
  Image,
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Share,
  Modal,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AnimatedReanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { Colors, FontChoices, resolveFontFace } from '../constants/colors';
import { FEATURES } from '../constants/features';
import { FontChoice, PostCreate, RepostData, StickerElement, User } from '../types';
import { api, endpoints, absoluteUrl } from '../config/api';
import { captureRef } from 'react-native-view-shot';
import { emitPostCreated } from '../utils/postEvents';
import { buildPostPayload, getRepostStripRect, CANVAS_WIDTH } from '../utils/buildPostPayload';
import { contrastRatio, hexToRgb, pickReadableColor } from '../utils/contrast';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Flip to true (dev only) to overlay the server render on the composer canvas
// after posting - the WYSIWYG parity check. Costs the eager-post behaviour
// while on, so it stays off.
const SHOW_PARITY_GHOST = false;

// Default ink must read against whatever canvas it lands on. Reposting a
// ghost-white post picks red as the next background, and the default ink was
// also red - so quoting produced a red-on-red canvas every time.
const readableDefaultInk = (canvas: string) => {
  const base = '#FF1A1A';
  if (contrastRatio(hexToRgb(canvas), hexToRgb(base)) >= 3.0) return base;
  return pickReadableColor(canvas, Colors.postColors, base);
};
const DEFAULT_SIGNATURE_STYLE = 'default';

// User can pick their own images as stickers - no presets needed

// Helper function to get the next background color in the sequence
const getNextBackgroundColor = (currentColor: string): string => {
  const colorIndex = Colors.postColors.indexOf(currentColor);
  if (colorIndex === -1) {
    // If current color is not in the list, return the first color
    return Colors.postColors[0];
  }
  // Return the next color in the sequence, wrapping around to the beginning
  return Colors.postColors[(colorIndex + 1) % Colors.postColors.length];
};

interface TextElement {
  id: string;
  content: string;
  x: number;
  y: number;
  originalX: number | null;
  originalY: number | null;
  fontSize: number;
  color: string;
  fontFamily: FontChoice;
  hasBackground: boolean;
  backgroundColor: string;
  backgroundMode: 'off' | 'white' | 'inverted';
  capsLock: boolean;
  scale: number;
  letterSpacing: number;
  opacity?: number;
  glow: boolean;
  rainbow: boolean;
  // Two palette colours cycled per letter; wins over rainbow when set
  alternateColors?: string[];
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  underline: boolean;
  listStyle: 'none' | 'bullet' | 'dash' | 'star' | 'number';
}

const LIST_STYLES = ['none', 'bullet', 'dash', 'star', 'number'] as const;
const LIST_MARKERS: Record<string, string> = { bullet: '\u2022 ', dash: '- ', star: '* ' };
const LAST_FONT_KEY = 'last-font.json';

const TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;

const LETTER_SPACING_PRESETS = [
  { label: 'AB', value: 0 },
  { label: 'A B', value: 3 },
  { label: 'A  B', value: 8 },
  { label: 'A   B', value: 15 },
];

interface Props {
  onPost?: (post: any) => void;
  onClose?: () => void;
  repostData?: RepostData;
}
// Heuristic: normalize and provide fallbacks iOS sometimes needs
const buildImageCandidates = (raw?: string) => {
  if (!raw) return [];
  let u = raw.trim();

  // Ensure scheme
  if (
    !/^file:\/\//i.test(u) &&
    !/^content:\/\//i.test(u) &&
    !/^https?:\/\//i.test(u) &&
    !/^data:image\//i.test(u)
  ) {
    u = `file://${u}`;
  }

  const candidates: string[] = [u];

  // iOS-specific: try removing the "/private" prefix variant
  if (Platform.OS === 'ios') {
    const noPrivate = u.replace(/^file:\/\/\/private\//i, 'file:///');
    if (noPrivate !== u) candidates.push(noPrivate);
  }

  return candidates;
};

const RepostImageLayer = ({ repostData }: { repostData?: RepostData }) => {
  const uri = repostData?.screenshotUri;
  if (!uri) return null;

  // WYSIWYG: this exact rect (via getRepostStripRect) is what the payload
  // sends and the server bakes - preview and render share one source
  const original = repostData?.originalPost;
  const rect = getRepostStripRect(original, screenWidth, screenHeight);
  if (rect && original) {
    const scale = rect.width / (original.image_width || 1);
    const topY = original.top_y || 0;
    return (
      <View
        style={[
          styles.repostStrip,
          { top: rect.top, height: rect.height, left: rect.left, width: rect.width },
        ]}
        pointerEvents="none"
      >
        <Image
          source={{ uri }}
          style={{
            width: rect.width,
            height: (original.image_height || 0) * scale,
            transform: [{ translateY: -topY * scale }],
          }}
          resizeMode="cover"
          onError={(error) => console.log('❌ Repost image error:', error)}
        />
      </View>
    );
  }

  // Fallback when the original has no crop geometry
  return (
    <View style={styles.repostImage} pointerEvents="none">
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
        onError={(error) => console.log('❌ Repost image error:', error)}
      />
    </View>
  );
};

export default function PostComposer({ onPost, onClose, repostData }: Props) {
  // Resolved before the first text element so its ink can be checked against it
  const initialBackground = repostData?.originalPost?.background_color
    ? getNextBackgroundColor(repostData.originalPost.background_color)
    : Colors.postColors[0];
  // Text elements state
  const [textElements, setTextElements] = useState<TextElement[]>([
    {
      id: '1',
      content: '',
      x: screenWidth / 2,
      y: repostData ? screenHeight * 0.34 : screenHeight / 2, // Center; higher for reposts so caption + strip together sit mid-canvas
      originalX: null,
      originalY: null,
      fontSize: 24,
      color: readableDefaultInk(initialBackground),
      fontFamily: 'arial-black',
      hasBackground: false,
      backgroundColor: '#FFFFFF',
      backgroundMode: 'off',
      capsLock: false,
      scale: 1,
      letterSpacing: 0,
      glow: false,
      rainbow: false,
      align: 'center',
      bold: false,
      italic: false,
      underline: false,
      listStyle: 'none',
    }
  ]);
  
  const [selectedTextId, setSelectedTextId] = useState<string>('1');
  const [isEditingText, setIsEditingText] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [userProfile, setUserProfile] = useState<User | null>(null);

  // Signature is a visible toggle (top bar) with a live band preview on the
  // canvas, replacing the old hidden hold-to-sign gesture
  const [signPost, setSignPost] = useState(false);

  useEffect(() => {
    api.get(endpoints.getUserProfile)
      .then(response => {
        setUserProfile(response.data);
        setSignPost(!!response.data?.default_signed_posts);
      })
      .catch(() => {});
  }, []);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [currentFontSize, setCurrentFontSize] = useState<number>(24); // Current editing font size (12-48)

  // Sticker elements state
  const [stickerElements, setStickerElements] = useState<StickerElement[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false); // For trash can visibility
  
  // Sticker scaling state (similar to image background)
  const stickerBaseScale = useRef<Record<string, number>>({});
  
  // Track if we just deleted an element (prevents gesture handler from continuing)
  const justDeletedRef = useRef(false);
  // Real handler refs: string ids in simultaneousHandlers type-error AND
  // no-op at runtime; refs make pinch+pan on the background actually
  // recognize together
  const bgPinchRef = useRef(null);
  const bgPanRef = useRef(null);
  
  // Animation values for deletion
  const deletionScale = useSharedValue(1);
  const deletionOpacity = useSharedValue(1);
  
  // Animated style for deletion effect
  const deletionAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: deletionScale.value }],
      opacity: deletionOpacity.value,
    };
  });
  
  // Local state for immediate text input updates (prevents input lag)
  const [localTextContent, setLocalTextContent] = useState<Record<string, string>>({});

  
  // Canvas background - use next color in sequence if reposting
  const getInitialBackgroundColor = () => initialBackground;
  
  const [backgroundColor, setBackgroundColor] = useState(getInitialBackgroundColor());
  const [backgroundGradient, setBackgroundGradient] = useState<string[]>([]);
  const backgroundOptions = Colors.postColors; // Use the proper color list
  const [currentBgIndex, setCurrentBgIndex] = useState(() => {
    const initialColor = getInitialBackgroundColor();
    return Colors.postColors.indexOf(initialColor);
  });

  // Image background state
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [imageBackgroundScale, setImageBackgroundScale] = useState(1);
  const [imageBackgroundPosition, setImageBackgroundPosition] = useState({ x: 0, y: 0 });
  // Natural-size to canvas cover factor. The preview treats scale 1 as
  // contentFit="cover", while the backend scales the raw image pixels, so
  // the gesture scale is multiplied by this factor at submit time.
  const [imageCoverScale, setImageCoverScale] = useState(1);

  // Crop bars for image backgrounds: the band between them is what the feed
  // shows. Dragging both bars to the screen edges (0 / screenHeight) makes
  // the post full bleed. The initial positions are inset so the grips are
  // visible below the status area and above the home indicator.
  const CROP_MIN_BAND = 120;
  const CROP_INITIAL_TOP = 90;
  const CROP_INITIAL_BOTTOM = screenHeight - 110;
  const [cropTop, setCropTop] = useState(CROP_INITIAL_TOP);
  const [cropBottom, setCropBottom] = useState(CROP_INITIAL_BOTTOM);
  const cropDragStart = useRef({ top: 0, bottom: 0 });
  
  // Shared values for image background gestures
  const imageScale = useSharedValue(1);
  const imageTranslateX = useSharedValue(0);
  const imageTranslateY = useSharedValue(0);
  const imageBaseScale = useSharedValue(1);
  const imageBaseTranslateX = useSharedValue(0);
  const imageBaseTranslateY = useSharedValue(0);
  
  // UI state - Instagram Create Mode
  const [showControlBar, setShowControlBar] = useState(false);
  const [screenDarkened, setScreenDarkened] = useState(false);

  // Dev-only WYSIWYG check: after posting, overlay the server render on the
  // live canvas at half opacity so any drift is immediately visible
  const [parityGhost, setParityGhost] = useState<{ uri: string; post: any } | null>(null);
  const [colorGridMode, setColorGridMode] = useState<'background' | 'text' | null>(null);
  // Colours collected so far while building a two-colour letter cycle;
  // null means the grid is in its normal single-pick mode.
  const [duoPending, setDuoPending] = useState<string[] | null>(null);
  const canvasCaptureRef = useRef<View>(null);

  // The quoted strip is draggable like a text element; its position is
  // WYSIWYG (the payload sends whatever rect is showing)
  const defaultStripRect = getRepostStripRect(repostData?.originalPost, screenWidth, screenHeight);
  const [stripPosition, setStripPosition] = useState<{ x: number; y: number } | null>(null);
  const [stripScale, setStripScale] = useState(1);
  const stripRect = defaultStripRect
    ? {
        left: stripPosition ? stripPosition.x : defaultStripRect.left,
        top: stripPosition ? stripPosition.y : defaultStripRect.top,
        width: defaultStripRect.width * stripScale,
        height: defaultStripRect.height * stripScale,
      }
    : null;
  const stripDragStart = useRef({ x: 0, y: 0 });
  const stripPinchBase = useRef(1);

  // Remember the last font across composer sessions: untouched empty
  // elements (and all new ones) start in it
  const lastFontRef = useRef<FontChoice>('arial-black');
  useEffect(() => {
    (async () => {
      try {
        const raw = await LegacyFS.readAsStringAsync(LegacyFS.documentDirectory + LAST_FONT_KEY);
        const saved = JSON.parse(raw)?.font;
        if (saved && FontChoices[saved as FontChoice]) {
          lastFontRef.current = saved;
          setTextElements(prev => prev.map(el =>
            el.content ? el : { ...el, fontFamily: saved }
          ));
        }
        const savedBg = JSON.parse(raw)?.background;
        // Reposts pick their color from the parent; plain posts resume the
        // last background
        if (savedBg && !repostData && Colors.postColors.includes(savedBg)) {
          lastBgRef.current = savedBg;
          setBackgroundColor(savedBg);
          setCurrentBgIndex(Colors.postColors.indexOf(savedBg));
          // untouched default ink must stay readable on the restored canvas
          setTextElements(prev => prev.map(el =>
            !el.content && el.color === '#FF1A1A'
              ? { ...el, color: readableDefaultInk(savedBg) }
              : el
          ));
        }
      } catch {}
    })();
  }, []);

  const lastBgRef = useRef<string | null>(null);
  const persistComposerPrefs = () => {
    LegacyFS.writeAsStringAsync(
      LegacyFS.documentDirectory + LAST_FONT_KEY,
      JSON.stringify({ font: lastFontRef.current, background: lastBgRef.current }),
    ).catch(() => {});
  };

  const rememberFont = (font: FontChoice) => {
    lastFontRef.current = font;
    persistComposerPrefs();
  };

  // A quote may be enlarged past the canvas edges. When it is bigger than the
  // canvas it pans like a zoomed image; when smaller it stays fully on screen.
  const clampStripAxis = (value: number, size: number, screen: number) =>
    size >= screen
      ? Math.min(0, Math.max(screen - size, value))
      : Math.max(0, Math.min(screen - size, value));

  const handleStripPan = (event: any) => {
    if (!stripRect) return;
    const { state, translationX, translationY } = event.nativeEvent;
    if (state === State.BEGAN) {
      stripDragStart.current = { x: stripRect.left, y: stripRect.top };
    } else if (state === State.ACTIVE) {
      setStripPosition({
        x: clampStripAxis(stripDragStart.current.x + translationX, stripRect.width, screenWidth),
        y: clampStripAxis(stripDragStart.current.y + translationY, stripRect.height, screenHeight),
      });
    }
  };

  const handleStripPinch = (event: any) => {
    if (!stripRect || !defaultStripRect) return;
    const { state, scale } = event.nativeEvent;
    if (state === State.BEGAN) {
      stripPinchBase.current = stripScale;
    } else if (state === State.ACTIVE) {
      // up to 3x the canvas: the quote can be blown up past the edges
      const maxScale = (screenWidth * 3) / defaultStripRect.width;
      const next = Math.max(0.2, Math.min(maxScale, stripPinchBase.current * scale));
      // Zoom around the strip's center
      const centerX = stripRect.left + stripRect.width / 2;
      const centerY = stripRect.top + stripRect.height / 2;
      const newWidth = defaultStripRect.width * next;
      const newHeight = defaultStripRect.height * next;
      setStripScale(next);
      setStripPosition({
        x: clampStripAxis(centerX - newWidth / 2, newWidth, screenWidth),
        y: clampStripAxis(centerY - newHeight / 2, newHeight, screenHeight),
      });
    }
  };

  const renderRepostLayer = () => {
    const uri = repostData?.screenshotUri;
    const original = repostData?.originalPost;
    if (!uri || !original) return null;

    if (!stripRect) {
      // Legacy original without crop geometry
      return (
        <View style={styles.repostImage} pointerEvents="none">
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
      );
    }

    const scale = stripRect.width / (original.image_width || 1);
    return (
      <PinchGestureHandler
        onGestureEvent={handleStripPinch}
        onHandlerStateChange={handleStripPinch}
        enabled={!isEditingText}
      >
        <AnimatedReanimated.View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <PanGestureHandler
            onGestureEvent={handleStripPan}
            onHandlerStateChange={handleStripPan}
            enabled={!isEditingText}
          >
            <AnimatedReanimated.View
              style={[
                styles.repostStrip,
                { top: stripRect.top, height: stripRect.height, left: stripRect.left, width: stripRect.width },
              ]}
            >
              <Image
                source={{ uri }}
                style={{
                  width: stripRect.width,
                  height: (original.image_height || 0) * scale,
                  transform: [{ translateY: -(original.top_y || 0) * scale }],
                }}
                resizeMode="cover"
              />
            </AnimatedReanimated.View>
          </PanGestureHandler>
        </AnimatedReanimated.View>
      </PinchGestureHandler>
    );
  };

  // Measured layout of each text element's box so it can be centered on the
  // element's (x, y) anchor, matching the backend's middle-middle text anchor.
  // Without this, boxes wider than the 120px minimum drift right/down.
  const [elementSizes, setElementSizes] = useState<Record<string, { width: number; height: number }>>({});

  // Measured text block sizes (the actual ink, not the padded touch area),
  // used to project the feed crop bounds for the adaptive guides
  const [textInkSizes, setTextInkSizes] = useState<Record<string, { width: number; height: number }>>({});
  
  // Animations
  const postButtonScale = useSharedValue(1);
  const postButtonOpacity = useSharedValue(1);

  const maxLength = 500;

  // Image background functions
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to add image backgrounds!');
      return false;
    }
    return true;
  };

  const pickImageBackground = async () => {
    console.log('🎯 pickImageBackground called, isPickerOpen:', isPickerOpen);
    
    if (isPickerOpen) {
      console.log('🚫 Picker already open, ignoring request');
      return;
    }
    
    console.log('🔓 Setting picker open to true');
    setIsPickerOpen(true);
    
    try {
      console.log('📋 Requesting permissions...');
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        console.log('❌ No permission granted');
        setIsPickerOpen(false);
        return;
      }
      console.log('✅ Permission granted');
      console.log('📱 Launching image picker...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        aspect: undefined,
      });

      console.log('📸 Image picker result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        console.log('✅ Background image selected:', imageUri);
        
        // Upload the background image to backend using dedicated endpoint
        console.log('Uploading background image...');
        const formData = new FormData();
        
        // Get file info from URI
        const filename = imageUri.split('/').pop() || 'background.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const extension = match ? match[1] : 'jpg';
        const mimeType = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'webp': 'image/webp'
        }[extension.toLowerCase()] || 'image/jpeg';
        
        console.log('Preparing background upload:', { uri: imageUri, filename, mimeType });
        
        // Create file object for FormData
        const file = {
          uri: imageUri,
          name: filename,
          type: mimeType
        };
        
        formData.append('image', file as any);
        
        try {
          const uploadResponse = await api.post(endpoints.uploadBackground, formData, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'multipart/form-data'
            },
          });
          
          console.log('Background uploaded:', uploadResponse.data);
          const fullUrl = absoluteUrl(uploadResponse.data.url)!;

          setBackgroundImage(fullUrl);

          // Preview renders the image with contentFit="cover" at scale 1.
          // Record the cover factor (canvas / natural size) so handlePost can
          // convert the gesture scale into the raw-pixel scale the backend
          // expects when it composites the image.
          Image.getSize(imageUri, (imgWidth, imgHeight) => {
            const scaleToCover = Math.max(screenWidth / imgWidth, screenHeight / imgHeight);
            console.log(`Image dimensions: ${imgWidth}x${imgHeight}, cover scale: ${scaleToCover}`);
            setImageCoverScale(scaleToCover);
          }, (error) => {
            console.error('Failed to get image size:', error);
            setImageCoverScale(1);
          });
        } catch (error) {
          console.error('Background upload failed:', error);
          Toast.show({
            type: 'error',
            text1: 'Upload failed',
            text2: 'Could not upload background image',
            position: 'top',
            visibilityTime: 2000,
          });
          return;
        }

        // Reset image position and scale to center and full width
        resetImageBackground();

        Toast.show({
          type: 'success',
          text1: 'Image background added!',
          text2: 'Pinch to zoom, drag to reposition',
          position: 'top',
          visibilityTime: 2000,
        });
      } else {
        console.log('❌ Image picker canceled or no assets');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setIsPickerOpen(false);
    }
  };

  const resetImageBackground = () => {
    // Reset to center and full width
    imageScale.value = withSpring(1);
    imageTranslateX.value = withSpring(0);
    imageTranslateY.value = withSpring(0);
    imageBaseScale.value = 1;
    imageBaseTranslateX.value = 0;
    imageBaseTranslateY.value = 0;
    setImageBackgroundScale(1);
    setImageBackgroundPosition({ x: 0, y: 0 });
    setCropTop(CROP_INITIAL_TOP);
    setCropBottom(CROP_INITIAL_BOTTOM);
  };

  const handleCropBarPan = (event: any, bar: 'top' | 'bottom') => {
    const { state, translationY } = event.nativeEvent;
    if (state === State.BEGAN) {
      cropDragStart.current = { top: cropTop, bottom: cropBottom };
    } else if (state === State.ACTIVE) {
      if (bar === 'top') {
        const next = cropDragStart.current.top + translationY;
        setCropTop(Math.max(0, Math.min(next, cropBottom - CROP_MIN_BAND)));
      } else {
        const next = cropDragStart.current.bottom + translationY;
        setCropBottom(Math.min(screenHeight, Math.max(next, cropTop + CROP_MIN_BAND)));
      }
    }
  };

  const getCurrentTextElement = () => {
    return textElements.find(el => el.id === selectedTextId) || textElements[0];
  };

  const updateTextElement = (id: string, updates: Partial<TextElement>) => {
    console.log('🔄 updateTextElement called:', { id, updates });
    setTextElements(prev => {
      const newElements = prev.map(el => 
        el.id === id ? { ...el, ...updates } : el
      );
      console.log('📝 Text elements updated:', newElements);
    return newElements;
    });
  };

  // Upload sticker image to backend
  const uploadStickerImage = async (localUri: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      
      // Get file info from URI
      const filename = localUri.split('/').pop() || 'sticker.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const extension = match ? match[1] : 'jpg';
      const mimeType = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp'
      }[extension.toLowerCase()] || 'image/jpeg';
      
      console.log('Preparing file upload:', { uri: localUri, filename, mimeType });
      
      // Create file object for FormData
      const file = {
        uri: localUri,
        name: filename,
        type: mimeType
      };
      
      formData.append('image', file as any);
      
      const uploadResponse = await api.post(endpoints.uploadSticker, formData, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data'
        },
      });
      
      console.log('✅ Sticker uploaded:', uploadResponse.data);
      // Convert relative URL to full URL
      const fullUrl = absoluteUrl(uploadResponse.data.url)!;
      console.log('🔗 Full sticker URL:', fullUrl);
      return fullUrl;
      
    } catch (error) {
      console.error('❌ Sticker upload failed:', error);
      return null;
    }
  };

  // Sticker management functions
  const pickImageSticker = async () => {
    console.log('🎯 pickImageSticker called, isPickerOpen:', isPickerOpen);
    
    if (isPickerOpen) {
      console.log('🚫 Picker already open, ignoring request');
      return;
    }
    
    console.log('🔓 Setting picker open to true');
    setIsPickerOpen(true);
    
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        console.log('❌ No permission granted');
        setIsPickerOpen(false);
        return;
      }

      console.log('📱 Launching image picker for sticker...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // No cropping by default - preserve full dimensions
        quality: 0.8,
      });

      console.log('📸 Sticker picker result:', result);
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        console.log('✅ Sticker image selected:', imageUri);
        
        // Upload the image to backend first
        console.log('📤 Uploading sticker image...');
        const uploadedUrl = await uploadStickerImage(imageUri);
        console.log('🔍 Upload result:', uploadedUrl);
        
        if (!uploadedUrl) {
          console.log('❌ Upload failed, no URL returned');
          Toast.show({
            type: 'error',
            text1: 'Upload failed',
            text2: 'Could not upload sticker image',
            position: 'top',
            visibilityTime: 2000,
          });
          return;
        }

        console.log('🎯 Creating new sticker with uploaded URL:', uploadedUrl);
        const newSticker: StickerElement = {
          id: `sticker-${Date.now()}`,
          uri: uploadedUrl, // Use the uploaded URL instead of local URI
          x: screenWidth / 2,
          y: screenHeight / 2,
          width: 120, // Standard size - user can tap to change shape/crop
          height: 120,
          scale: 1,
          rotation: 0,
          shape: 'full', // Default to full dimensions - user can tap to cycle shapes
        };
        
        console.log('📝 Adding sticker to elements:', newSticker);
        console.log('📊 Current sticker elements before add:', stickerElements);
        setStickerElements(prev => {
          const updated = [...prev, newSticker];
          console.log('📋 Updated sticker elements:', updated);
          console.log('📊 Sticker elements length:', updated.length);
          return updated;
        });
        setSelectedStickerId(newSticker.id);
        console.log('🎯 Selected sticker ID set to:', newSticker.id);
        console.log('✅ Sticker should now be visible on canvas');
        
        Toast.show({
          type: 'success',
          text1: 'Image sticker added!',
          text2: 'Drag to move, pinch to resize',
          position: 'top',
          visibilityTime: 1500,
        });
      } else {
        console.log('❌ Sticker picker canceled or no assets');
      }
    } catch (error) {
      console.error('❌ Error picking sticker image:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to pick image',
        text2: 'Please try again',
        position: 'top',
        visibilityTime: 2000,
      });
    } finally {
      setIsPickerOpen(false);
    }
  };

  const updateStickerElement = (id: string, updates: Partial<StickerElement>) => {
    setStickerElements(prev => 
      prev.map(el => el.id === id ? { ...el, ...updates } : el)
    );
  };

  const deleteSticker = (id: string) => {
    setStickerElements(prev => prev.filter(el => el.id !== id));
    if (selectedStickerId === id) {
      setSelectedStickerId(null);
    }
  };

  // Handle text input changes with only local updates (no state updates until editing stops)
  const handleTextInputChange = useCallback((id: string, text: string) => {
    // Only update local state for immediate UI feedback
    setLocalTextContent(prev => ({ ...prev, [id]: text }));
  }, []);

  // Get the current display text (local if available, otherwise from state)
  const getDisplayText = useCallback((element: TextElement) => {
    return localTextContent[element.id] !== undefined 
      ? localTextContent[element.id] 
      : element.content;
  }, [localTextContent]);

  const handleCanvasTap = (event: any) => {
    console.log('Canvas tap detected, isEditingText:', isEditingText);
    
    // If we're currently editing, ALWAYS exit editing mode when tapping canvas
    if (isEditingText) {
      console.log('Exiting edit mode due to canvas tap...');
      const currentElement = getCurrentTextElement();
      if (currentElement) {
        // Check local content (what user actually typed) instead of state content
        const currentContent = localTextContent[currentElement.id] !== undefined 
          ? localTextContent[currentElement.id] 
          : currentElement.content;
        
        if (currentContent.trim() === '') {
          console.log('Removing empty text element');
          setTextElements(prev => prev.filter(el => el.id !== currentElement.id));
          setSelectedTextId('');
          // Clear the local content for this element since we're removing it
          setLocalTextContent(prev => {
            const newLocal = { ...prev };
            delete newLocal[currentElement.id];
            return newLocal;
          });
        }
      }
      stopEditingText();
      Keyboard.dismiss();
      return;
    }

    // Only create/edit text when NOT currently editing
    // locationX/Y are relative to whichever CHILD received the touch, so a
    // tap that landed on an existing element's touch area reported tiny
    // coordinates and dropped the new element in the top-left corner. pageX/Y
    // are screen coordinates, and this canvas is full-screen, so they are the
    // canvas coordinates regardless of which child was hit.
    const ne = event.nativeEvent || {};
    const pageX = ne.pageX;
    const pageY = ne.pageY;
    const locationX = Number.isFinite(pageX)
      ? pageX
      : (Number.isFinite(ne.locationX) ? ne.locationX : screenWidth / 2);
    const locationY = Number.isFinite(pageY)
      ? pageY
      : (Number.isFinite(ne.locationY) ? ne.locationY : screenHeight / 2);
    
    // Check if tap is on existing text element
    const tappedElement = findElementAtPosition(locationX, locationY);
    
    if (tappedElement) {
      console.log('Tapped on existing text element:', tappedElement.id);
      setSelectedTextId(tappedElement.id);
      setSelectedStickerId(''); // Deselect sticker
      startEditingText(tappedElement.id);
    } else {
      console.log('Creating new text element at:', { locationX, locationY });
      const newId = Date.now().toString();
      const newElement: TextElement = {
        id: newId,
        content: '',
        x: locationX,
        y: locationY,
        originalX: null,
        originalY: null,
        fontSize: 24,
        color: readableDefaultInk(backgroundColor),
        fontFamily: lastFontRef.current,
        hasBackground: false,
        backgroundColor: '#FFFFFF',
        backgroundMode: 'off',
        capsLock: false,
        scale: 1,
        letterSpacing: 0,
        glow: false,
        rainbow: false,
        align: 'center',
        bold: false,
        italic: false,
        underline: false,
        listStyle: 'none',
      };
      
      setTextElements(prev => [...prev, newElement]);
      setSelectedTextId(newId);
      startEditingText(newId);
    }
  };

  const findElementAtPosition = (x: number, y: number) => {
    return textElements.find(element => {
      const elementX = element.x - 100; // Account for centering
      const elementY = element.y - 25;
      // Make the first/default text element easier to select with larger hit area
      const isFirstElement = element.id === '1';
      const elementWidth = isFirstElement ? 300 : 200; // Larger hit area for first element
      const elementHeight = isFirstElement ? 80 : 50; // Larger hit area for first element
      
      return (
        x >= elementX &&
        x <= elementX + elementWidth &&
        y >= elementY &&
        y <= elementY + elementHeight
      );
    });
  };

  const deleteTextElement = (id: string) => {
    if (textElements.length > 1) {
      setTextElements(prev => prev.filter(el => el.id !== id));
      if (selectedTextId === id) {
        setSelectedTextId(textElements.find(el => el.id !== id)?.id || '');
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchProfile = async () => {
      try {
        const response = await api.get(endpoints.getUserProfile);
        if (isMounted) {
          setUserProfile(response.data);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const resolveSignaturePreference = () => {
    const prefersSigned = userProfile?.default_signed_posts ?? false;
    const style = (userProfile?.preferred_signature_style || DEFAULT_SIGNATURE_STYLE).toLowerCase();
    return { prefersSigned, style };
  };

  const handlePost = async () => {
    if (isPosting) {
      return;
    }

    // Commit any pending local text changes to state before posting
    Object.entries(localTextContent).forEach(([id, content]) => {
      updateTextElement(id, { content });
    });

    
    // Wait for state update to complete, then check content
    // Use local content for immediate validation, but state will be updated for the actual post
    const currentElements = textElements.map(el => ({
      ...el,
      content: localTextContent[el.id] !== undefined ? localTextContent[el.id] : el.content
    }));
    
    const allText = currentElements
      .filter(el => el.content.trim())
      .map(el => el.content)
      .join(' ');
    
    // Allow posting with just image background (no text required)
    if (!allText.trim() && !backgroundImage) {
      Alert.alert('Error', 'Please add some text or an image background before posting');
      return;
    }

    if (allText.length > maxLength) {
      Alert.alert('Error', `Text must be under ${maxLength} characters`);
      return;
    }

    // Dopamine hit - animate button
    postButtonScale.value = withSpring(0.9, { duration: 100 });
    postButtonOpacity.value = withTiming(0.7, { duration: 100 });
    
    setIsPosting(true);

    // Signing is the visible topbar toggle, previewed on the canvas
    const shouldSign = FEATURES.signatures && signPost;
    const signatureStyle = shouldSign ? resolveSignaturePreference().style : undefined;

    // Pure payload construction: maps screen points onto the fixed logical
    // canvas. Kept in buildPostPayload so the payload contract is testable
    // from fixtures (npm test in frontend, contract test in backend).
    const postData: PostCreate = buildPostPayload({
      screenWidth,
      screenHeight,
      textElements: currentElements,
      stickerElements,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      imageBackgroundScale,
      imageBackgroundPosition,
      imageCoverScale,
      cropTop,
      cropBottom,
      isSigned: shouldSign,
      signatureStyle,
      repostData,
      repostStripRect: stripRect,
    });

    if (SHOW_PARITY_GHOST) {
      // Parity checking only: blocks so the server render can be overlaid on
      // the canvas that produced it. Off by default so dev exercises the
      // same eager path that ships.
      try {
        const response = await api.post(endpoints.createPost, postData);
        setIsPosting(false);
        if (response.data?.rendered_image_url) {
          setParityGhost({ uri: response.data.rendered_image_url, post: response.data });
          return;
        }
        finishPost(response.data);
      } catch (error: any) {
        console.error('Error creating post:', error);
        postButtonScale.value = withSpring(1, { duration: 200 });
        postButtonOpacity.value = withTiming(1, { duration: 200 });
        Alert.alert('Error', error.response?.data?.detail || 'Failed to create post');
        setIsPosting(false);
      }
      return;
    }

    // Eager post: snapshot the canvas, drop it into the feed immediately, and
    // let the request finish in the background. The server render replaces
    // the snapshot when it lands, so the feed never shows a gap or a spinner.
    const optimistic = await buildOptimisticPost(postData);
    setIsPosting(false);
    finishPost(null);
    if (optimistic) emitPostCreated(optimistic);
    submitInBackground(postData, optimistic?.id);
  };

  // A local snapshot of the canvas, shaped like a feed post. Crop bounds come
  // from the same projection the crop guides draw, so it lands in the feed at
  // the height the real render will occupy.
  const buildOptimisticPost = async (payload: PostCreate): Promise<any | null> => {
    try {
      const captured = await captureRef(canvasCaptureRef, { format: 'png', quality: 1 });
      // captureRef hands back a bare path on iOS; without a scheme the feed
      // resolves it against the API base and 404s
      const uri = /^[a-z][a-z0-9+.-]*:/i.test(captured) ? captured : `file://${captured}`;
      const k = CANVAS_WIDTH / screenWidth;
      const bounds = getProjectedCropBounds();
      const canvasHeight = Math.round(screenHeight * k);
      return {
        id: `optimistic-${Date.now()}`,
        text_content: payload.text_content,
        background_color: payload.background_color,
        font_choice: payload.font_choice,
        rendered_image_url: uri,
        image_width: CANVAS_WIDTH,
        image_height: canvasHeight,
        top_y: bounds ? Math.round(bounds.top * k) : 0,
        bottom_y: bounds ? Math.round(bounds.bottom * k) : canvasHeight,
        created_at: new Date().toISOString(),
        is_repost: !!repostData,
        author: { handle: '', avatar_color: Colors.accent },
        text_elements: payload.text_elements,
        __optimistic: true,
      };
    } catch (error) {
      console.log('Canvas snapshot failed (non-critical):', error);
      return null;
    }
  };

  const submitInBackground = async (payload: PostCreate, optimisticId?: string) => {
    try {
      const response = await api.post(endpoints.createPost, payload);
      emitPostCreated(response.data, optimisticId);
      onPost?.(response.data);
    } catch (error: any) {
      console.error('Error creating post:', error);
      const errorMessage = error.response?.data?.detail ||
                           error.response?.data?.error ||
                           'Failed to create post';
      Alert.alert('Post failed', errorMessage, [
        { text: 'Discard', style: 'destructive' },
        { text: 'Retry', onPress: () => submitInBackground(payload) },
      ]);
    }
  };

  const finishPost = (post: any) => {
    if (post) onPost?.(post);
    onClose?.();
    Toast.show({
      type: 'success',
      text1: 'Posted!',
      position: 'bottom',
      visibilityTime: 2000,
    });
  };

  const renderParityGhost = () => {
    if (!parityGhost) return null;
    return (
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, styles.parityGhostContainer]}
        activeOpacity={1}
        onPress={() => {
          const ghost = parityGhost;
          setParityGhost(null);
          finishPost(ghost.post);
        }}
      >
        <ExpoImage
          source={{ uri: absoluteUrl(parityGhost.uri) }}
          style={styles.parityGhostImage}
          contentFit="fill"
        />
        <View style={styles.parityGhostBadge}>
          <Text style={styles.parityGhostBadgeText}>
            PARITY GHOST: server render at 50% over your canvas. Tap to continue.
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const startEditingText = (id: string) => {
    console.log('🏁 startEditingText called for id:', id);
    setSelectedTextId(id);
    setIsEditingText(true);
    setScreenDarkened(true);
    setShowControlBar(true);
    // Editing happens in a staged input above the controls (renderEditingInput);
    // the element's canvas position is never moved for editing

    // Initialize local text content and font size with current element
    const element = textElements.find(el => el.id === id);
    if (element) {
      setLocalTextContent(prev => ({ ...prev, [id]: element.content }));
      setCurrentFontSize(element.fontSize);
    }
    
    console.log('✅ Edit state set: editing=true, darkened=true, controls=true');
  };


  const stopEditingText = () => {
    console.log('🛑 stopEditingText called');
    console.log('📝 Local text content before commit:', localTextContent);
    console.trace('📍 stopEditingText call stack');
    
    // Commit any local text changes and font size to actual state before stopping edit mode
    Object.entries(localTextContent).forEach(([id, content]) => {
      console.log(`💾 Committing text for element ${id}:`, content);
      updateTextElement(id, { content, fontSize: currentFontSize });
    });
    
    setIsEditingText(false);
    setScreenDarkened(false);
    setShowControlBar(false);
    
    // Clear local text content when stopping edit mode
    setLocalTextContent({});
    console.log('✅ stopEditingText completed');
  };

  // Two-stop vertical gradients (top -> bottom), rendered identically by
  // the server's legacy gradient path. Long-press the bg button to cycle;
  // a plain tap returns to solid colors.
  // Only the rainbow: the two-stop presets were decoration, and gradients
  // are grid-only now (long-press the background swatch).
  const GRADIENT_PRESETS: string[][] = [Colors.rainbowPalette];
  // Applying a background in one place: the ink guard is the same whether the
  // colour came from the cycle button or the grid.
  const applyBackground = (color: string, gradient: string[] = []) => {
    setBackgroundGradient(gradient);
    setBackgroundColor(color);
    const index = Colors.postColors.indexOf(color);
    if (index >= 0) setCurrentBgIndex(index);
    if (gradient.length === 0) {
      lastBgRef.current = color;
      persistComposerPrefs();
    }
    setTextElements(prev => prev.map(el => {
      if (el.rainbow) return el;
      if (contrastRatio(hexToRgb(color), hexToRgb(el.color)) >= 3.0) return el;
      return { ...el, color: pickReadableColor(color, Colors.postColors, el.color) };
    }));
  };


  const cycleBackgroundColor = () => {
    if (backgroundGradient.length > 0) {
      // leaving gradient mode: fall back to the top stop as a solid
      setBackgroundGradient([]);
      return;
    }
    let nextIndex = (currentBgIndex + 1) % backgroundOptions.length;
    // Reposts may not reuse their parent's background color: the quote chip
    // carries that color, so the repost must differ for the chip to read
    if (repostData?.originalPost?.background_color === backgroundOptions[nextIndex]) {
      nextIndex = (nextIndex + 1) % backgroundOptions.length;
    }
    const nextColor = backgroundOptions[nextIndex];
    setCurrentBgIndex(nextIndex);
    setBackgroundColor(nextColor);
    lastBgRef.current = nextColor;
    persistComposerPrefs();

    // Keep text readable: any element whose color vanishes against the new
    // background gets bumped to the next palette color that reads clearly
    setTextElements(prev => prev.map(el => {
      if (el.rainbow) return el;
      if (contrastRatio(hexToRgb(nextColor), hexToRgb(el.color)) >= 3.0) return el;
      return { ...el, color: pickReadableColor(nextColor, Colors.postColors, el.color) };
    }));
  };

  const createNewTextElement = () => {
    const newId = Date.now().toString();
    const newElement: TextElement = {
      id: newId,
      content: '',
      x: screenWidth / 2,
      y: screenHeight * 0.3, // Position in upper third of screen, above controls
      originalX: null,
      originalY: null,
      fontSize: 24,
      color: readableDefaultInk(backgroundColor),
      fontFamily: lastFontRef.current,
      hasBackground: false,
      backgroundColor: '#FFFFFF',
      backgroundMode: 'off',
      capsLock: false,
      scale: 1,
      letterSpacing: 0,
      glow: false,
      rainbow: false,
      align: 'center',
      bold: false,
      italic: false,
      underline: false,
      listStyle: 'none',
    };
    setTextElements(prev => [...prev, newElement]);
    setSelectedTextId(newId);
    startEditingText(newId);
  };

  const getTextStyle = (element: TextElement) => {
    const fontConfig = FontChoices[element.fontFamily];
    const fontFace = resolveFontFace(element.fontFamily, element.bold, element.italic);
    const effectiveAlign = element.listStyle !== 'none' ? 'left' : element.align;
    
    let textColor = element.color;
    let bgColor = 'transparent';
    let hasPadding = false;
    
    if (element.backgroundMode === 'white') {
      bgColor = '#FFFFFF';
      hasPadding = true;
    } else if (element.backgroundMode === 'inverted') {
      bgColor = element.color;
      textColor = '#FFFFFF';
      hasPadding = true;
    }
    
    return {
      fontSize: element.fontSize,
      color: textColor,
      fontFamily: fontFace,
      fontWeight: fontConfig.fontWeight as any,
      textAlign: effectiveAlign,
      textDecorationLine: element.underline ? 'underline' as const : 'none' as const,
      // Chips render per-line via a nested span (staircase), not a block
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: hasPadding ? 4 : 0,
      textTransform: element.capsLock ? 'uppercase' : 'none' as any,
      includeFontPadding: false,
      textAlignVertical: 'center' as const,
      letterSpacing: element.letterSpacing || 0,
      // RN letter-spacing trails the last glyph; the server spaces between
      // glyphs only. Shed the trailing unit so centered = centered ink.
      marginRight: -(element.letterSpacing || 0),
      opacity: element.opacity ?? 1,
      // Glow previews as a zero-offset text shadow; the server renders a
      // blurred ink layer with a matching radius
      ...(element.glow
        ? {
            textShadowColor: textColor,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: Math.max(2, element.fontSize * 0.12),
          }
        : {}),
      transform: [{ scale: element.scale }], // Apply absolute scale transform
    };
  };

  // Rainbow text renders per-character color spans, cycling the same palette
  // the server uses (spaces do not advance the cycle)
  const applyListPrefixes = (text: string, listStyle: TextElement['listStyle']) => {
    if (listStyle === 'none' || !text) return text;
    let counter = 0;
    return text.split('\n').map(line => {
      if (!line.trim()) return line;
      if (listStyle === 'number') {
        counter += 1;
        return `${counter}. ` + line;
      }
      return LIST_MARKERS[listStyle] + line;
    }).join('\n');
  };

  const anyElementHasInk = () =>
    textElements.some(el => (getDisplayText(el) || '').trim().length > 0);

  // Placeholder at half strength, scaled by the element's own opacity so
  // pre-typing opacity taps give immediate feedback
  const placeholderNode = (element: TextElement) => {
    const alpha = Math.round(128 * (element.opacity ?? 1)).toString(16).padStart(2, '0');
    return <Text style={{ color: (element.color || '#1B1B1B') + alpha }}>Type...</Text>;
  };

  // The palette a text element cycles per letter, or null for a flat colour.
  // Mirrors Post._normalize_alternate_colors on the server.
  const cycleColorsFor = (element: TextElement): string[] | null => {
    if (element.alternateColors?.length === 2) return element.alternateColors;
    if (element.rainbow) return Colors.rainbowPalette;
    return null;
  };

  const renderDisplayContent = (element: TextElement) => {
    const showPlaceholder = !getDisplayText(element) && element.id === '1' && !isEditingText && !anyElementHasInk();
    if (showPlaceholder) return placeholderNode(element);
    const raw = getDisplayText(element) || '';
    const text = applyListPrefixes(raw, element.listStyle);
    let content: React.ReactNode = text;
    // Same rule as the server: one palette advanced per non-space character,
    // with an explicit pair taking precedence over rainbow.
    const cyclePalette = cycleColorsFor(element);
    if (cyclePalette && text) {
      let colorIndex = 0;
      content = text.split('').map((ch, i) => {
        if (/\s/.test(ch)) return ch;
        const color = cyclePalette[colorIndex++ % cyclePalette.length];
        return (
          <Text key={i} style={{ color }}>
            {ch}
          </Text>
        );
      });
    }
    // Nested span background highlights each rendered line (staircase),
    // matching the server's per-line chips
    const chipColor =
      element.backgroundMode === 'white' ? '#FFFFFF'
      : element.backgroundMode === 'inverted' ? element.color
      : null;
    if (chipColor && text) {
      return <Text style={{ backgroundColor: chipColor }}>{content}</Text>;
    }
    return content;
  };

  // Keep the start positions per element (text and stickers)
  const dragStart = useRef<Record<string, { x: number; y: number }>>({});
  const stickerDragStart = useRef<Record<string, { x: number; y: number }>>({});

  // Shared deletion check logic
  const checkAndHandleDeletion = (absoluteX: number, absoluteY: number, elementId: string, elementType: 'text' | 'sticker'): boolean => {
    const trashCenterX = screenWidth / 2;
    const trashCenterY = screenHeight - 100;
    const trashRadius = 60;

    const distanceToTrash = Math.sqrt(
      Math.pow(absoluteX - trashCenterX, 2) + 
      Math.pow(absoluteY - trashCenterY, 2)
    );

    const isInTrashZone = distanceToTrash < trashRadius;
    
    if (isInTrashZone) {
      console.log(`🗑️ ${elementType} element entered trash zone, DELETING NOW!`, { 
        elementId,
        elementType,
        textElementsCount: textElements.length,
        stickerElementsCount: stickerElements.length,
        textElementIds: textElements.map(t => t.id),
        stickerElementIds: stickerElements.map(s => s.id)
      });
      
      // Mark as deleted immediately
      justDeletedRef.current = true;
      
      // Animate deletion
      deletionScale.value = withSpring(0, { duration: 300 });
      deletionOpacity.value = withTiming(0, { duration: 300 });
      
      let deletionHappened = false;
      
      if (elementType === 'text') {
        console.log('🗑️ Attempting text deletion:', { 
          elementId, 
          currentCount: textElements.length
        });
        
        // Always allow deletion - we'll filter out the element
        setTextElements(prev => {
          const filtered = prev.filter(el => el.id !== elementId);
          console.log('🗑️ Text elements after deletion:', filtered.map(t => t.id));
          return filtered;
        });
        setSelectedTextId('');
        deletionHappened = true;
        Toast.show({
          type: 'success',
          text1: 'Text element deleted',
          position: 'top',
          visibilityTime: 1000,
        });
      } else if (elementType === 'sticker') {
        console.log('🗑️ Attempting sticker deletion:', { elementId });
        deleteSticker(elementId);
        setSelectedStickerId(null);
        deletionHappened = true;
        Toast.show({
          type: 'success',
          text1: 'Sticker deleted',
          position: 'top',
          visibilityTime: 1000,
        });
      }
      
      if (!deletionHappened) {
        console.log('⚠️ Deletion did not happen!');
        // Reset animation if deletion didn't happen
        deletionScale.value = 1;
        deletionOpacity.value = 1;
      }
      
      // Clean up state
      setIsDraggingElement(false);
      
      // Reset animation values after a delay (only if deletion happened)
      if (deletionHappened) {
        setTimeout(() => {
          deletionScale.value = 1;
          deletionOpacity.value = 1;
        }, 300);
      }
      
      return deletionHappened;
    }
    
    return false; // Element was not deleted
  };

  const handlePanStateChange = (event: any, elementId: string) => {
    const { state } = event.nativeEvent;
    if (state === State.BEGAN) {
      justDeletedRef.current = false;
      const el = textElements.find(e => e.id === elementId);
      if (el) dragStart.current[elementId] = { x: el.x, y: el.y };
      // Trash can appears only after real movement (see handlePanGesture)
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      console.log('📝 Text drag END, hiding trash can');
      delete dragStart.current[elementId];
      setIsDraggingElement(false);
    }
  };

  const handlePanGesture = (event: any, elementId: string) => {
    if (event.nativeEvent.state !== State.ACTIVE || isEditingText || justDeletedRef.current) return;
    const start = dragStart.current[elementId];
    if (!start) return;

    const { translationX, translationY, absoluteX, absoluteY } = event.nativeEvent;

    // Show the trash can only once this is unambiguously a drag
    if (!isDraggingElement && Math.hypot(translationX, translationY) > 12) {
      setIsDraggingElement(true);
    }

    // Check for deletion using shared logic
    if (checkAndHandleDeletion(absoluteX, absoluteY, elementId, 'text')) {
      return; // Element was deleted, stop processing
    }

    // Normal drag behavior
    const newX = start.x + translationX;
    const newY = start.y + translationY;
    
    updateTextElement(elementId, {
      x: newX, // Full responsiveness - no dampening
      y: newY,
    });
  };

  // Pinch scale is computed from the scale at gesture start (base), not from
  // the last frame's value - compounding per-frame caused jitter and stuck
  // clamping at the extremes
  const textPinchBase = useRef<Record<string, number>>({});
  const handlePinchGesture = (event: any, elementId: string) => {
    const { state, scale } = event.nativeEvent;
    if (isEditingText) return;
    if (state === State.BEGAN) {
      const element = textElements.find(el => el.id === elementId);
      textPinchBase.current[elementId] = element?.scale ?? 1;
    } else if (state === State.ACTIVE) {
      const base = textPinchBase.current[elementId] ?? 1;
      updateTextElement(elementId, {
        scale: Math.max(0.3, Math.min(5.0, base * scale)),
      });
    }
  };


  // Unified gesture handler that detects target and action
  const handleUnifiedGesture = (event: any, gestureType: 'pan' | 'pinch') => {
    const { state } = event.nativeEvent;
    
    if (gestureType === 'pan') {
      const { translationY, velocityY, translationX, absoluteX, absoluteY } = event.nativeEvent;
      // Removed excessive logging for better performance
      
      // Handle element dragging states
      if (state === State.BEGAN) {
        // Reset deletion flag at start of new gesture
        justDeletedRef.current = false;
      } else if (state === State.ACTIVE) {
        // Trash can appears only once a selected element is actually dragged
        if (
          !isDraggingElement &&
          (selectedStickerId || selectedTextId) &&
          !backgroundImage &&
          Math.hypot(translationX, translationY) > 12
        ) {
          setIsDraggingElement(true);
        }
        if (isDraggingElement && !justDeletedRef.current && (selectedStickerId || selectedTextId)) {
          // Check for deletion using shared logic
          const elementId = selectedStickerId || selectedTextId || '';
          const elementType = selectedStickerId ? 'sticker' : 'text';
          
          if (checkAndHandleDeletion(absoluteX, absoluteY, elementId, elementType as 'text' | 'sticker')) {
            return; // Element was deleted, stop processing
          }
        }
      } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        console.log('🛑 Gesture ended:', { state, isDraggingElement });
        // Always clean up state on any type of drag end
        setIsDraggingElement(false);
      }
      
      // Don't process any more pan gestures if we just deleted
      if (justDeletedRef.current) {
        return;
      }
      
      // Check for swipe up (image picker) - prioritize this over element dragging
      if (FEATURES.imageUploads && state === State.ACTIVE && translationY < -50 && velocityY < -500 && !isPickerOpen) {
        console.log('✅ Swipe up detected, launching image picker');
        pickImageBackground();
        return;
      }
      
      // Handle sticker drag start
      if (selectedStickerId && state === State.BEGAN) {
        const sticker = stickerElements.find(s => s.id === selectedStickerId);
        if (sticker) {
          stickerDragStart.current[selectedStickerId] = { x: sticker.x, y: sticker.y };
        }
      }
      
      // Check if we're dragging a selected sticker
      if (selectedStickerId && state === State.ACTIVE) {
        const start = stickerDragStart.current[selectedStickerId];
        if (start) {
          const newX = start.x + translationX;
          const newY = start.y + translationY;
          updateStickerElement(selectedStickerId, { x: newX, y: newY });
          return;
        }
      }
      
      // Check if we're dragging the image background
      if (backgroundImage && state === State.ACTIVE && !selectedStickerId) {
        // Auto-deselect text when dragging background
        if (selectedTextId && !isEditingText) {
          setTimeout(() => setSelectedTextId(''), 0);
        }
        
        console.log('Dragging background image:', { translationX, translationY });
        imageTranslateX.value = imageBaseTranslateX.value + translationX;
        imageTranslateY.value = imageBaseTranslateY.value + translationY;
        return;
      }
      
      // Handle pan end for image background
      if (backgroundImage && state === State.END && !selectedStickerId && !selectedTextId) {
        imageBaseTranslateX.value = imageTranslateX.value;
        imageBaseTranslateY.value = imageTranslateY.value;
        // Update state after gesture ends
        setTimeout(() => {
          setImageBackgroundPosition({
            x: imageTranslateX.value,
            y: imageTranslateY.value,
          });
        }, 0);
        return;
      }
    }
    
    if (gestureType === 'pinch') {
      const { scale } = event.nativeEvent;
      
      // Handle sticker pinch start
      if (selectedStickerId && state === State.BEGAN) {
        const sticker = stickerElements.find(s => s.id === selectedStickerId);
        if (sticker) {
          stickerBaseScale.current[selectedStickerId] = sticker.scale;
        }
      }
      
      // Check if we're pinching a selected sticker
      if (selectedStickerId && state === State.ACTIVE) {
        const baseScale = stickerBaseScale.current[selectedStickerId] || 1;
        // Continuous, unbounded scaling
        const newScale = baseScale * scale;
        updateStickerElement(selectedStickerId, { scale: newScale });
        console.log('📏 Sticker pinch:', newScale);
        return;
      }
      
      // Handle sticker pinch end
      if (selectedStickerId && state === State.END) {
        const sticker = stickerElements.find(s => s.id === selectedStickerId);
        if (sticker) {
          stickerBaseScale.current[selectedStickerId] = sticker.scale;
        }
      }
      
      // Check if we're pinching the image background
      if (backgroundImage && state === State.ACTIVE && !selectedStickerId) {
        // Auto-deselect text when pinching background
        if (selectedTextId && !isEditingText) {
          setTimeout(() => setSelectedTextId(''), 0);
        }
        
        console.log('Pinching background image:', scale);
        const newScale = imageBaseScale.value * scale;
        imageScale.value = newScale;
        return;
      }
      
      // Handle pinch end for image background
      if (backgroundImage && state === State.END && !selectedStickerId && !selectedTextId) {
        imageBaseScale.value = imageScale.value;
        // Update state after gesture ends
        setTimeout(() => {
          setImageBackgroundScale(imageScale.value);
        }, 0);
        return;
      }
    }
  };

  // Render sticker elements
  const renderStickers = () => {
    console.log('🎨 renderStickers called, elements:', stickerElements.length);
    return stickerElements.map((sticker) => {
      const isSelected = selectedStickerId === sticker.id;
      
      return (
        <AnimatedReanimated.View
          key={sticker.id}
          style={[
            isSelected ? deletionAnimatedStyle : {},
          ]}
        >
          <TouchableOpacity
            style={[
              styles.stickerElement,
              {
                left: sticker.x - (sticker.width * sticker.scale) / 2,
                top: sticker.y - (sticker.height * sticker.scale) / 2,
                width: sticker.width * sticker.scale,
                height: sticker.height * sticker.scale,
                transform: [{ rotate: `${sticker.rotation}deg` }],
              }
            ]}
            onPress={() => {
              if (selectedStickerId === sticker.id) {
                // Cycle through shapes if already selected
                const shapes: Array<'full' | 'square' | 'rounded'> = ['full', 'square', 'rounded'];
                const currentIndex = shapes.indexOf(sticker.shape);
                const nextShape = shapes[(currentIndex + 1) % shapes.length];
                updateStickerElement(sticker.id, { shape: nextShape });
                
                Toast.show({
                  type: 'info',
                  text1: `Shape: ${nextShape}`,
                  position: 'top',
                  visibilityTime: 1000,
                });
              } else {
                // Select sticker
                setSelectedStickerId(sticker.id);
                setSelectedTextId(''); // Deselect text
              }
            }}
            activeOpacity={0.8}
          >
            <ExpoImage
              source={{ uri: sticker.uri }}
              style={styles.stickerImage}
              contentFit={sticker.shape === 'full' ? 'contain' : 'cover'}
            />
          </TouchableOpacity>
        </AnimatedReanimated.View>
      );
    });
  };

  const renderEditableText = () => {
    return textElements.map((element) => {
      return (
        <PinchGestureHandler
          key={`pinch-${element.id}`}
          onGestureEvent={(event) => handlePinchGesture(event, element.id)}
          onHandlerStateChange={(event) => handlePinchGesture(event, element.id)}
          enabled={!isEditingText}
        >
          <AnimatedReanimated.View
            style={[
              styles.textElementTouchArea, // Much larger touch area for pinch
              {
                // Center the measured box on the (x, y) anchor
                left: element.x - (elementSizes[element.id]?.width ?? 120) / 2,
                top: element.y - (elementSizes[element.id]?.height ?? 120) / 2,
              },
              selectedTextId === element.id ? deletionAnimatedStyle : {},
            ]}
            onLayout={(event) => {
              // While this element is being edited its display collapses to
              // the touch-area minimum; recording that stale size made the
              // text jump sideways on commit. Keep the last real measurement.
              if (isEditingText && selectedTextId === element.id) return;
              const { width, height } = event.nativeEvent.layout;
              setElementSizes(prev => {
                const current = prev[element.id];
                if (current && Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1) {
                  return prev;
                }
                return { ...prev, [element.id]: { width, height } };
              });
            }}
          >
            <PanGestureHandler
              onGestureEvent={(event) => handlePanGesture(event, element.id)}
              onHandlerStateChange={(event) => handlePanStateChange(event, element.id)}
              enabled={!isEditingText}
              minDist={4}
            >
              <AnimatedReanimated.View style={styles.textElement}>
                {isEditingText && selectedTextId === element.id ? (
                  // The editing input is rendered at canvas level (see
                  // renderEditingInput) so it centers on the element anchor
                  // without depending on this nested box's geometry
                  null
                ) : (
                  <TouchableOpacity
                    onPress={() => startEditingText(element.id)}
                    onLongPress={() => deleteTextElement(element.id)}
                  >
                    <Text
                      style={getTextStyle(element)}
                      onLayout={(event) => {
                        // True text block size (unlike the 120px-min touch
                        // area), used by the adaptive crop guides
                        const { width, height } = event.nativeEvent.layout;
                        setTextInkSizes(prev => {
                          const current = prev[element.id];
                          if (current && Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1) {
                            return prev;
                          }
                          return { ...prev, [element.id]: { width, height } };
                        });
                      }}
                    >
                      {renderDisplayContent(element)}
                    </Text>
                  </TouchableOpacity>
                )}
              </AnimatedReanimated.View>
            </PanGestureHandler>
          </AnimatedReanimated.View>
        </PinchGestureHandler>
      );
    });
  };

  // Staged editing: centered in the negative space between the top of the
  // screen and the config row. A styled MIRROR shows exactly what will render
  // (chip wrapping the text block, rainbow, glow) while an invisible-text
  // TextInput overlays it to handle typing and the caret. The element's real
  // canvas (x, y) is untouched; display text returns there on commit.
  const EDITING_STAGE_BOTTOM = 395; // top edge of the config row area
  const renderEditingInput = () => {
    if (!isEditingText || !selectedTextId) return null;
    const element = textElements.find(el => el.id === selectedTextId);
    if (!element) return null;

    const inputWidth = screenWidth * 0.9;
    const content = getDisplayText(element);
    const textStyle = [
      getTextStyle(element),
      { fontSize: currentFontSize, maxWidth: inputWidth },
    ];
    const wrapperAlign =
      element.align === 'left' ? 'flex-start' as const
      : element.align === 'right' ? 'flex-end' as const
      : 'center' as const;

    return (
      <View
        style={[styles.editingStage, { left: (screenWidth - inputWidth) / 2, width: inputWidth }]}
        pointerEvents="box-none"
      >
        <View style={{ alignItems: wrapperAlign }} pointerEvents="box-none">
          {/* Styled mirror - the source of visual truth while editing */}
          <Text
            style={[
              textStyle,
              !content && { color: 'rgba(255,255,255,0.5)' },
            ]}
            pointerEvents="none"
          >
            {content ? renderDisplayContent(element) : (isEditingText || anyElementHasInk()) ? '' : placeholderNode(element)}
          </Text>
          {/* Invisible-text input on top: caret and typing only */}
          <TextInput
            key={`editing-${element.id}`}
            style={[
              textStyle,
              StyleSheet.absoluteFillObject,
              {
                width: inputWidth,
                color: 'transparent',
                backgroundColor: 'transparent',
                textShadowColor: 'transparent',
              },
            ]}
            selectionColor={element.rainbow ? Colors.accent : element.color}
            value={content}
            onChangeText={(text) => handleTextInputChange(element.id, text)}
            autoFocus
            multiline={true}
            textAlign={element.align}
          />
        </View>
      </View>
    );
  };

  // Image background animated style
  const imageBackgroundAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: imageTranslateX.value },
        { translateY: imageTranslateY.value },
        { scale: imageScale.value },
      ],
    };
  });

  // Simple image background component (no gestures - handled by unified handlers)
  const renderImageBackground = () => {
    if (!backgroundImage) return null;

    return (
      <AnimatedReanimated.View style={[StyleSheet.absoluteFill, { zIndex: 1 }, imageBackgroundAnimatedStyle]}>
        <ExpoImage
          source={{ uri: backgroundImage }}
          style={styles.backgroundImage}
          contentFit="cover"
        />
      </AnimatedReanimated.View>
    );
  };

  // Crop bars for image backgrounds. Rendered outside the canvas gesture
  // tree so their pans never compete with the background drag/pinch.
  const renderCropBars = () => {
    if (!backgroundImage || isEditingText) return null;

    return (
      <>
        {/* Dimmed regions outside the band = cropped away in the feed */}
        {cropTop > 0 && (
          <View
            pointerEvents="none"
            style={[styles.cropDim, { top: 0, height: cropTop }]}
          />
        )}
        {cropBottom < screenHeight && (
          <View
            pointerEvents="none"
            style={[styles.cropDim, { top: cropBottom, height: screenHeight - cropBottom }]}
          />
        )}

        <PanGestureHandler
          onGestureEvent={(event) => handleCropBarPan(event, 'top')}
          onHandlerStateChange={(event) => handleCropBarPan(event, 'top')}
        >
          <AnimatedReanimated.View style={[styles.cropBarHitArea, { top: cropTop - 22 }]}>
            <View style={styles.cropBarLine} />
            <View style={styles.cropBarGrip} />
          </AnimatedReanimated.View>
        </PanGestureHandler>

        <PanGestureHandler
          onGestureEvent={(event) => handleCropBarPan(event, 'bottom')}
          onHandlerStateChange={(event) => handleCropBarPan(event, 'bottom')}
        >
          <AnimatedReanimated.View style={[styles.cropBarHitArea, { top: cropBottom - 22 }]}>
            <View style={styles.cropBarLine} />
            <View style={styles.cropBarGrip} />
          </AnimatedReanimated.View>
        </PanGestureHandler>
      </>
    );
  };

  // Projected feed crop for the current canvas, mirroring the backend's
  // bounds math: content extent + margin, capped at the max post aspect
  // (5:4 portrait) centered on the content
  const MAX_POST_ASPECT = 1.25; // height <= 1.25 x width
  const getProjectedCropBounds = () => {
    const measured = textElements.filter(
      el => el.content.trim() && textInkSizes[el.id]
    );
    if (measured.length === 0 && !stripRect) return null;

    let top = Infinity;
    let bottom = -Infinity;
    measured.forEach(el => {
      const height = textInkSizes[el.id].height * el.scale;
      top = Math.min(top, el.y - height / 2);
      bottom = Math.max(bottom, el.y + height / 2);
    });

    const margin = (40 * screenWidth) / CANVAS_WIDTH; // backend margin in points
    // The reply's outer edge gets extra room (mirrors REPLY_EDGE_MARGIN on
    // the server) so it never sits flush against the crop.
    const replyEdge = (48 * screenWidth) / CANVAS_WIDTH;
    let topExtra = 0;
    let bottomExtra = 0;

    // The quoted strip is part of the post, and the backend's bounds include
    // it. Leaving it out cropped the OP off the optimistic preview entirely
    // and made the crop guides lie about reposts.
    if (stripRect) {
      const stripTop = stripRect.top;
      const stripBottom = stripRect.top + stripRect.height;
      if (measured.length > 0) {
        const replyMid = (top + bottom) / 2;
        if (replyMid < (stripTop + stripBottom) / 2) topExtra = replyEdge;
        else bottomExtra = replyEdge;
      }
      top = Math.min(top, stripTop);
      bottom = Math.max(bottom, stripBottom);
    }

    top = Math.max(0, top - margin - topExtra);
    bottom = Math.min(screenHeight, bottom + margin + bottomExtra);

    const maxHeight = screenWidth * MAX_POST_ASPECT;
    if (bottom - top > maxHeight) {
      const center = (top + bottom) / 2;
      top = Math.max(0, center - maxHeight / 2);
      bottom = Math.min(screenHeight, top + maxHeight);
    }

    return { top, bottom };
  };

  // Adaptive crop guides: hairlines showing where the feed will crop
  const renderCropGuides = () => {
    // With a quote in the canvas the crop is anchored by the strip, so the
    // guides just drew white hairlines around the OP - noise, not
    // information. The bounds themselves still include the strip.
    if (isEditingText || backgroundImage || stripRect) return null;
    const bounds = getProjectedCropBounds();
    if (!bounds) return null;
    if (bounds.top <= 0 && bounds.bottom >= screenHeight) return null;

    return (
      <>
        {/* Dim what the feed will crop away */}
        <View pointerEvents="none" style={[styles.cropOutsideDim, { top: 0, height: bounds.top }]} />
        <View pointerEvents="none" style={[styles.cropOutsideDim, { top: bounds.bottom, bottom: 0 }]} />
        <View pointerEvents="none" style={[styles.cropGuideLine, { top: bounds.top }]} />
        <View pointerEvents="none" style={[styles.cropGuideLine, { top: bounds.bottom }]} />
      </>
    );
  };

  // Trash can component that appears during drag
  const renderTrashCan = () => {
    if (!isDraggingElement) return null;
    
    return (
      <View style={styles.trashCanContainer}>
        <View style={styles.trashCan}>
          <Ionicons name="trash" size={30} color="white" />
        </View>
      </View>
    );
  };

  const renderCanvas = () => {

    const canvasChildren = (
      <PinchGestureHandler
        onGestureEvent={(event) => handleUnifiedGesture(event, 'pinch')}
        onHandlerStateChange={(event) => handleUnifiedGesture(event, 'pinch')}
      >
        <AnimatedReanimated.View style={styles.fullScreenCanvas}>
          <PanGestureHandler
            onGestureEvent={(event) => handleUnifiedGesture(event, 'pan')}
            onHandlerStateChange={(event) => handleUnifiedGesture(event, 'pan')}
            shouldCancelWhenOutside={false}
            minPointers={1}
            maxPointers={1}
            // A finger almost never stays still. Without a movement threshold
            // this pan activated on the first pixel of drift and swallowed the
            // tap, so placing text demanded an unnaturally precise press.
            minDist={28}
          >
            <AnimatedReanimated.View style={StyleSheet.absoluteFill}>
              {/* Repost image layer */}
          
              {/* Dim overlay lives ABOVE the image but BELOW text */}
              {screenDarkened && <View style={styles.screenOverlay} pointerEvents="none" />}
              
              {/* Interaction/text layer sits on top */}
              <TouchableOpacity
                style={[StyleSheet.absoluteFill, { zIndex: 20 }]}
                onPress={handleCanvasTap}
                activeOpacity={1}
                pressRetentionOffset={{ top: 40, left: 40, right: 40, bottom: 40 }}
                hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              >
                {renderRepostLayer()}
                {renderEditableText()}
                {renderStickers()}
              </TouchableOpacity>
            </AnimatedReanimated.View>
          </PanGestureHandler>
        </AnimatedReanimated.View>
      </PinchGestureHandler>
    );

    if (backgroundGradient.length > 0) {
      return (
        <LinearGradient 
          colors={backgroundGradient as [string, string, ...string[]]}
          style={styles.fullScreenCanvas}
        >
          {canvasChildren}
        </LinearGradient>
      );
    }

    return (
      <View style={styles.fullScreenCanvas}>
        {canvasChildren}
      </View>
    );
  };

  // Instagram Create Mode UI Components
  const handleDownload = async () => {
    let uri: string;
    try {
      const captured = await captureRef(canvasCaptureRef, { format: 'png', quality: 1 });
      uri = /^[a-z][a-z0-9+.-]*:/i.test(captured) ? captured : `file://${captured}`;
    } catch (error) {
      console.log('Canvas capture failed:', error);
      Toast.show({ type: 'error', text1: 'Could not export', position: 'bottom' });
      return;
    }

    // One tap saves straight to Photos. Needs NSPhotoLibraryAddUsageDescription,
    // which only exists in a build - on anything older this throws and we fall
    // back to the share sheet rather than failing.
    try {
      const { granted } = await MediaLibrary.requestPermissionsAsync(true);
      if (!granted) {
        Toast.show({ type: 'info', text1: 'Photo access denied', position: 'bottom' });
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Toast.show({ type: 'success', text1: 'Saved to Photos', position: 'bottom' });
    } catch (error) {
      console.log('Direct save unavailable, using share sheet:', error);
      try {
        await Share.share({ url: uri });
      } catch {}
    }
  };


  // Long-press the background swatch. Deliberately plain: flat squares, a
  // hairline, and the current colour marked. Gradients get the last row since
  // the long-press used to cycle them.
  const selectedElement = () =>
    textElements.find(el => el.id === selectedTextId) || textElements[0] || null;
  const selectedElementColor = () => selectedElement()?.color ?? null;
  // Picking a flat colour clears both cycles, so the three modes stay
  // mutually exclusive instead of leaving a stale pair behind the swatch.
  const setSelectedElementColor = (color: string) => {
    const el = selectedElement();
    if (el) updateTextElement(el.id, { color, rainbow: false, alternateColors: undefined });
  };
  const setSelectedElementRainbow = () => {
    const el = selectedElement();
    if (el) updateTextElement(el.id, { rainbow: true, alternateColors: undefined });
  };
  const setSelectedElementDuo = (colors: string[]) => {
    const el = selectedElement();
    if (el) updateTextElement(el.id, { rainbow: false, alternateColors: colors });
  };

  const closeColorGrid = () => {
    setColorGridMode(null);
    setDuoPending(null);
  };

  // Tapping a swatch means different things depending on whether a duo is
  // being collected, so both paths funnel through here.
  const handleGridColorPress = (color: string) => {
    if (duoPending) {
      if (duoPending.includes(color)) return; // a duo of one colour is a solid
      const picked = [...duoPending, color];
      if (picked.length < 2) {
        setDuoPending(picked);
        return;
      }
      setSelectedElementDuo(picked);
      closeColorGrid();
      return;
    }
    if (colorGridMode === 'text') setSelectedElementColor(color);
    else applyBackground(color);
    closeColorGrid();
  };

  const renderColorGrid = () => {
    const el = colorGridMode === 'text' ? selectedElement() : null;
    const duo = el?.alternateColors?.length === 2 ? el.alternateColors : null;
    return (
    <Modal visible={colorGridMode !== null} transparent animationType="fade" onRequestClose={closeColorGrid}>
      <TouchableWithoutFeedback onPress={closeColorGrid}>
        <View style={styles.colorGridBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.colorGridCard}>
              {duoPending && (
                <Text style={styles.colorGridLabel}>
                  {duoPending.length === 0 ? 'PICK FIRST COLOR' : 'PICK SECOND COLOR'}
                </Text>
              )}
              <View style={styles.colorGrid}>
                {Colors.postColors.map(color => {
                  const current = duoPending
                    ? null
                    : colorGridMode === 'text'
                      ? (el?.rainbow || duo ? null : selectedElementColor())
                      : (backgroundGradient.length === 0 ? backgroundColor : null);
                  const picked = duoPending?.includes(color);
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorCell,
                        { backgroundColor: color },
                        (color === current || picked) && styles.colorCellActive,
                      ]}
                      onPress={() => handleGridColorPress(color)}
                    />
                  );
                })}
              </View>
              {colorGridMode === 'background' && (
                <View style={styles.colorGrid}>
                  {GRADIENT_PRESETS.map((preset, i) => {
                    const active = backgroundGradient.length > 0 && backgroundGradient[0] === preset[0]
                      && backgroundGradient[backgroundGradient.length - 1] === preset[preset.length - 1];
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => { applyBackground(preset[0], preset); closeColorGrid(); }}
                      >
                        <LinearGradient
                          colors={preset as [string, string, ...string[]]}
                          style={[styles.colorCell, active && styles.colorCellActive]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {/* Text gets the per-letter cycles on their own row: rainbow,
                  and a duo built from two taps on the palette above. */}
              {colorGridMode === 'text' && !duoPending && (
                <View style={styles.colorGrid}>
                  <TouchableOpacity onPress={() => { setSelectedElementRainbow(); closeColorGrid(); }}>
                    <LinearGradient
                      colors={Colors.rainbowPalette as [string, string, ...string[]]}
                      style={[styles.colorCell, !!el?.rainbow && styles.colorCellActive]}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDuoPending([])}>
                    <View style={[styles.colorCell, !!duo && styles.colorCellActive]}>
                      <View style={[styles.duoHalf, { backgroundColor: duo ? duo[0] : '#F8F8FF' }]} />
                      <View style={[styles.duoHalf, { backgroundColor: duo ? duo[1] : '#000000' }]} />
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    );
  };

  const renderTopMenu = () => {
    
    return (
      <View style={styles.topMenu}>
        {/* Left - Close Button */}
        <TouchableOpacity style={styles.topMenuButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
        
        {/* Right - Controls */}
        <View style={styles.topMenuRight}>
          {FEATURES.imageUploads && (
            <>
              {/* Image Background Button (also reachable via swipe up) */}
              <TouchableOpacity style={styles.topMenuButton} onPress={pickImageBackground}>
                <Ionicons name="image" size={20} color="white" />
              </TouchableOpacity>

              {/* Sticker Button */}
              <TouchableOpacity style={styles.topMenuButton} onPress={pickImageSticker}>
                <Ionicons name="images" size={20} color="white" />
              </TouchableOpacity>
            </>
          )}

          {/* Background: tap cycles solids, long-press cycles gradients */}
          <TouchableOpacity
            style={styles.topMenuButton}
            onPress={cycleBackgroundColor}
            onLongPress={() => setColorGridMode('background')}
            delayLongPress={350}
          >
            {backgroundGradient.length > 0 ? (
              <LinearGradient colors={backgroundGradient as [string, string]} style={styles.backgroundPreview} />
            ) : (
              <View style={[styles.backgroundPreview, { backgroundColor }]} />
            )}
          </TouchableOpacity>

          {/* Signature toggle: previews as a band on the canvas */}
          {FEATURES.signatures && (
            <TouchableOpacity
              style={[styles.topMenuButton, signPost && styles.topMenuButtonActive]}
              onPress={() => setSignPost(v => !v)}
            >
              <Ionicons name="create" size={20} color={signPost ? Colors.accent : 'white'} />
            </TouchableOpacity>
          )}

          {/* Export the canvas as an image */}
          {!isEditingText && (
            <TouchableOpacity style={styles.topMenuButton} onPress={handleDownload}>
              <Ionicons name="download-outline" size={22} color="white" />
            </TouchableOpacity>
          )}

          {/* Commit editing. Tapping anywhere off the text does the same;
              this is the discoverable version of it. */}
          {isEditingText && (
            <TouchableOpacity style={styles.topMenuButton} onPress={stopEditingText}>
              <Ionicons name="checkmark" size={26} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Single config row: every button changes the value in place (cycle or
  // toggle) - no selector rows
  const renderBottomControlBar = () => {
    if (!showControlBar) return null;
    const el = getCurrentTextElement();
    if (!el) return null;

    const fontKeys = Object.keys(FontChoices) as FontChoice[];
    const fontConfig = FontChoices[el.fontFamily];

    const cycleFont = () => {
      const next = fontKeys[(fontKeys.indexOf(el.fontFamily) + 1) % fontKeys.length];
      updateTextElement(el.id, { fontFamily: next });
      rememberFont(next);
    };

    const cycleColor = () => {
      // Palette colors in order, then rainbow, then back to the start.
      // A duo is only reachable from the grid, so tapping through drops it.
      if (el.alternateColors?.length === 2) {
        updateTextElement(el.id, { alternateColors: undefined, color: Colors.postColors[1] });
        return;
      }
      if (el.rainbow) {
        updateTextElement(el.id, { rainbow: false, color: Colors.postColors[1] });
        return;
      }
      const index = Colors.postColors.indexOf(el.color);
      if (index === Colors.postColors.length - 1 || index === -1) {
        updateTextElement(el.id, { rainbow: true });
      } else {
        updateTextElement(el.id, { color: Colors.postColors[index + 1] });
      }
    };

    const cycleAlign = () => {
      const next = TEXT_ALIGNMENTS[(TEXT_ALIGNMENTS.indexOf(el.align) + 1) % TEXT_ALIGNMENTS.length];
      updateTextElement(el.id, { align: next });
    };

    const cycleSpacing = () => {
      const values = LETTER_SPACING_PRESETS.map(p => p.value);
      const next = values[(values.indexOf(el.letterSpacing || 0) + 1) % values.length];
      updateTextElement(el.id, { letterSpacing: next });
    };

    const cycleOpacity = () => {
      const steps = [1, 0.7, 0.45, 0.25];
      const current = el.opacity ?? 1;
      const idx = steps.findIndex(v => Math.abs(v - current) < 0.01);
      updateTextElement(el.id, { opacity: steps[(idx + 1) % steps.length] });
    };

    const cycleChip = () => {
      const nextMode = el.backgroundMode === 'off' ? 'white'
        : el.backgroundMode === 'white' ? 'inverted' : 'off';
      updateTextElement(el.id, { backgroundMode: nextMode });
    };

    const variants = (FontChoices[el.fontFamily] as any).variants || {};
    const canBold = !!(variants.bold || variants.boldItalic);
    const canItalic = !!(variants.italic || variants.boldItalic);

    const cycleList = () => {
      const next = LIST_STYLES[(LIST_STYLES.indexOf(el.listStyle) + 1) % LIST_STYLES.length];
      updateTextElement(el.id, { listStyle: next });
    };

    return (
      <View style={styles.bottomControlContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.bottomControlBar, { flexGrow: 1, justifyContent: 'center' }]}
          keyboardShouldPersistTaps="always"
        >
          {/* Font: shows and cycles the typeface */}
          <TouchableOpacity style={styles.controlOption} onPress={cycleFont}>
            <Text
              style={[styles.controlFontLabel, {
                fontFamily: fontConfig.fontFamily,
                fontWeight: fontConfig.fontWeight as any,
              }]}
            >
              Aa
            </Text>
          </TouchableOpacity>
          {/* Bold/italic appear only for families with the real face */}
          {canBold && (
            <TouchableOpacity
              style={[styles.controlOption, styles.controlLetterOption, el.bold && styles.controlOptionActive]}
              onPress={() => updateTextElement(el.id, { bold: !el.bold })}
            >
              <Text style={[styles.controlFormatLabel, { color: el.bold ? Colors.accent : 'white' }]}>B</Text>
            </TouchableOpacity>
          )}

          {canItalic && (
            <TouchableOpacity
              style={[styles.controlOption, styles.controlLetterOption, el.italic && styles.controlOptionActive]}
              onPress={() => updateTextElement(el.id, { italic: !el.italic })}
            >
              <Text style={[styles.controlFormatLabel, styles.controlItalicLabel, { color: el.italic ? Colors.accent : 'white' }]}>I</Text>
            </TouchableOpacity>
          )}
          {/* Underline */}
          <TouchableOpacity
            style={[styles.controlOption, styles.controlLetterOption, el.underline && styles.controlOptionActive]}
            onPress={() => updateTextElement(el.id, { underline: !el.underline })}
          >
            <Text style={[styles.controlFormatLabel, {
              color: el.underline ? Colors.accent : 'white',
              textDecorationLine: 'underline',
            }]}>U</Text>
          </TouchableOpacity>
          {/* Color: swatch shows current, tap cycles palette then rainbow */}
          <TouchableOpacity
            style={styles.controlOption}
            onPress={cycleColor}
            onLongPress={() => setColorGridMode('text')}
            delayLongPress={350}
          >
            {el.alternateColors?.length === 2 ? (
              <View style={styles.controlColorSwatch}>
                <View style={[styles.duoHalf, { backgroundColor: el.alternateColors[0] }]} />
                <View style={[styles.duoHalf, { backgroundColor: el.alternateColors[1] }]} />
              </View>
            ) : el.rainbow ? (
              <LinearGradient
                colors={Colors.rainbowPalette as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.controlColorSwatch}
              />
            ) : (
              <View style={[styles.controlColorSwatch, { backgroundColor: el.color }]} />
            )}
          </TouchableOpacity>
          {/* Text chip background cycle: off / white / inverted */}
          <TouchableOpacity
            style={[styles.controlOption, el.backgroundMode !== 'off' && styles.controlOptionActive]}
            onPress={cycleChip}
          >
            <Ionicons name="color-fill" size={20} color={el.backgroundMode !== 'off' ? Colors.accent : 'white'} />
          </TouchableOpacity>
          {/* Opacity: cycles 100 / 70 / 45 / 25 percent */}
          <TouchableOpacity
            style={[styles.controlOption, (el.opacity ?? 1) < 1 && styles.controlOptionActive]}
            onPress={cycleOpacity}
          >
            <MaterialIcons
              name="opacity"
              size={24}
              color={(el.opacity ?? 1) < 1 ? Colors.accent : 'white'}
            />
          </TouchableOpacity>
          {/* Glow toggle */}
          <TouchableOpacity
            style={[styles.controlOption, el.glow && styles.controlOptionActive]}
            onPress={() => updateTextElement(el.id, { glow: !el.glow })}
          >
            <Ionicons name="sunny" size={20} color={el.glow ? Colors.accent : 'white'} />
          </TouchableOpacity>
          {/* Justification cycle */}
          <TouchableOpacity style={styles.controlOption} onPress={cycleAlign}>
            <MaterialIcons
              name={el.align === 'left' ? 'format-align-left' : el.align === 'right' ? 'format-align-right' : 'format-align-center'}
              size={20}
              color="white"
            />
          </TouchableOpacity>
          {/* Letter spacing cycle */}
          <TouchableOpacity
            style={[styles.controlOption, (el.letterSpacing || 0) > 0 && styles.controlOptionActive]}
            onPress={cycleSpacing}
          >
            <Text
              style={[styles.controlSpacingLabel, {
                color: (el.letterSpacing || 0) > 0 ? Colors.accent : 'white',
                letterSpacing: Math.min(el.letterSpacing || 0, 4),
                marginRight: -Math.min(el.letterSpacing || 0, 4),
              }]}
            >
              AB
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const SLIDER_MIN_FONT = 8;
  const SLIDER_MAX_FONT = 72;
  const SLIDER_HEIGHT = 200;
  const sliderBaseFont = useRef(24);

  const renderScaleSlider = () => {
    if (!isEditingText) return null;

    const fraction = (currentFontSize - SLIDER_MIN_FONT) / (SLIDER_MAX_FONT - SLIDER_MIN_FONT);

    return (
      <View style={styles.scaleSliderContainer}>
        {/* Smooth wedge, wide at the top (big text up) */}
        <View style={styles.scaleSliderWedge} pointerEvents="none" />

        <PanGestureHandler
          onGestureEvent={(event) => {
            // Relative to the size at gesture start - no jumping, no jitter,
            // and the handle always moves off the extremes
            const delta = (-event.nativeEvent.translationY / SLIDER_HEIGHT) * (SLIDER_MAX_FONT - SLIDER_MIN_FONT);
            const next = sliderBaseFont.current + delta;
            setCurrentFontSize(Math.max(SLIDER_MIN_FONT, Math.min(SLIDER_MAX_FONT, next)));
          }}
          onHandlerStateChange={(event) => {
            if (event.nativeEvent.state === State.BEGAN) {
              sliderBaseFont.current = currentFontSize;
            }
          }}
        >
          <View style={styles.scaleSliderTouchArea}>
            <View
              style={[
                styles.scaleSliderHandle,
                { top: `${(1 - fraction) * 85}%` },
              ]}
            />
          </View>
        </PanGestureHandler>
      </View>
    );
  };


  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Background color layer */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor }]} />
      
      {/* Background image layer - outside KeyboardAvoidingView so keyboard doesn't shift it */}
      {backgroundImage && (
        <PinchGestureHandler
          ref={bgPinchRef}
          onGestureEvent={(event) => handleUnifiedGesture(event, 'pinch')}
          onHandlerStateChange={(event) => handleUnifiedGesture(event, 'pinch')}
          simultaneousHandlers={bgPanRef}
        >
          <AnimatedReanimated.View style={StyleSheet.absoluteFill}>
            <PanGestureHandler
              ref={bgPanRef}
              onGestureEvent={(event) => handleUnifiedGesture(event, 'pan')}
              onHandlerStateChange={(event) => handleUnifiedGesture(event, 'pan')}
              simultaneousHandlers={bgPinchRef}
              shouldCancelWhenOutside={false}
              minPointers={1}
              maxPointers={1}
            >
              <AnimatedReanimated.View 
                style={[
                  StyleSheet.absoluteFill, 
                  { zIndex: 0 },
                  imageBackgroundAnimatedStyle
                ]}
              >
                <ExpoImage
                  source={{ uri: backgroundImage }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              </AnimatedReanimated.View>
            </PanGestureHandler>
          </AnimatedReanimated.View>
        </PinchGestureHandler>
      )}
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        
        {/* Full Screen Canvas - handles all taps via handleCanvasTap.
            The ref captures the canvas WITHOUT the crop guides, which render
            outside it, so the optimistic feed image has no chrome in it. */}
        {/* The background colour is painted here, INSIDE the capture ref, as
            well as by the screen-level layer below. captureRef snapshots only
            this subtree, so without it every solid-colour export came out
            transparent - invisible on a light post, obvious on a black one.
            Skipped when a background image is up: this view sits above the
            image layer and an opaque colour would hide it. */}
        <View
          style={[styles.canvasContainer, !backgroundImage && { backgroundColor }]}
          ref={canvasCaptureRef}
          collapsable={false}
        >
          {renderCanvas()}
        </View>

      {/* Crop bars for image backgrounds */}
      {renderCropBars()}

      {/* Adaptive crop guides for text posts */}
      {renderCropGuides()}

      {/* Signature band preview at the projected top edge of the post -
          where the feed will draw it. Hidden while the parity ghost is up
          (the band is a feed overlay, not part of the rendered PNG). */}
      {FEATURES.signatures && signPost && !parityGhost && !isEditingText && (() => {
        const bounds = getProjectedCropBounds();
        if (!bounds) return null;
        return (
          <View style={[styles.signaturePreviewBand, { top: bounds.top }]} pointerEvents="none">
            <Text style={styles.signaturePreviewText} numberOfLines={1}>
              @{(userProfile?.handle || 'you').toUpperCase()}
            </Text>
          </View>
        );
      })()}

      {/* Top Menu (hidden while editing text) */}
      {!isEditingText && renderTopMenu()}
      
      {/* Bottom Control Bar (when editing) */}
      {renderBottomControlBar()}

      {/* Staged editing input: screen-fixed just above the config row, like
          the row itself, so keyboard state cannot reorder them */}
      {renderEditingInput()}
      
      {/* Scale Slider (when editing text) */}
      {renderScaleSlider()}

        {/* Trash Can (appears during drag) */}
        {renderTrashCan()}


        {/* Post Button */}
        {!isEditingText && (
          <View style={styles.postActionCluster}>
            <TouchableOpacity
              style={styles.postButton}
              onPress={() => handlePost()}
              disabled={isPosting}
            >
              {isPosting ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      </KeyboardAvoidingView>
      {renderColorGrid()}
      {renderParityGhost()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  parityGhostContainer: {
    zIndex: 1000,
  },
  parityGhostImage: {
    flex: 1,
    opacity: 0.5,
  },
  parityGhostBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '85%',
  },
  parityGhostBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  keyboardContainer: {
    flex: 1,
  },
  
  // Instagram Create Mode Styles
  screenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)', // Lighter so you can still "feel" the repost
    zIndex: 13, // Below canvas (10) but above background
  },
  
  // Top Menu (when not editing)
  colorGridBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorGridCard: {
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: '#88888A',
    padding: 14,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 6 * 48,
  },
  colorCell: {
    width: 44,
    height: 44,
    margin: 2,
    borderWidth: 1,
    borderColor: '#88888A',
  },
  colorCellActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  duoHalf: {
    flex: 1,
  },
  colorGridLabel: {
    color: '#F9F9F9',
    fontFamily: 'CourierPrime',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  topMenu: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  topMenuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  topMenuButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topMenuText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backgroundPreview: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: 'white',
  },
  
  // Bottom Control Bar (when editing)
  bottomControlContainer: {
    position: 'absolute',
    bottom: 150,
    left: 0,
    right: 0,
    zIndex: 200,
  },
  bottomControlBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(128,128,128,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginBottom: 180,
    zIndex: 150, // Above overlay and text elements
  },
  controlOption: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  controlOptionActive: {
    backgroundColor: 'rgba(255,26,26,0.2)',
  },
  
  // Floating Selection Menu (above control bar)
  floatingSelectionMenu: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginBottom: 5,
  },
  
  // Font Selection
  fontScrollView: {
    maxHeight: 60,
  },
  fontOption: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontOptionActive: {
    backgroundColor: Colors.accent,
  },
  fontOptionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Color Selection
  colorScrollView: {
    maxHeight: 60,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    marginRight: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: 'white',
    borderWidth: 3,
  },
  
  // Toggle Controls (Glow/Background)
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  toggleText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  toggleButtonActive: {
    backgroundColor: Colors.accent,
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Post Button (bottom right when not editing)
  postButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  postActionCluster: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    alignItems: 'flex-end',
    gap: 12,
    zIndex: 100,
  },
  postButtonHint: {
    // Dark chip so the hint reads on any canvas background color
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  
  // Canvas and Text Elements
  canvasContainer: {
    flex: 1,
    zIndex: 10,
  },
  fullScreenCanvas: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    position: 'relative', // important for absolute children
  },
  textElementTouchArea: {
    position: 'absolute',
    minWidth: 120, // Much larger touch area for easier pinch gestures
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  textElement: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minWidth: 50, // Much smaller minimum
    maxWidth: screenWidth - 40, // Leave some margin
    minHeight: 50,
  },
  textInput: {
    minWidth: 50,
    maxWidth: screenWidth - 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    maxHeight: 200, // Prevent excessive growth
    zIndex: 15,
  },
  // Image background style
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  // Repost image draws above background, below text
  repostImage: {
    ...StyleSheet.absoluteFillObject,
    position: 'absolute',
    zIndex: 12,
    width: '100%',
    height: '100%',
  },
  // Cropped strip of the original post, stacked above the caption area
  repostStrip: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 12,
    borderWidth: 1,
    borderColor: '#88888A',
  },
  // Single config row controls
  controlFontLabel: {
    color: 'white',
    fontSize: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 26,
  },
  controlColorSwatch: {
    width: 28,
    height: 22,
    borderWidth: 2,
    borderColor: 'white',
    overflow: 'hidden',
  },
  controlOptionDisabled: {
    opacity: 0.3,
  },
  controlFormatLabel: {
    fontSize: 22,
    fontFamily: 'CourierPrimeBold',
    color: 'white',
    // match the optical baseline of the Aa / AB labels beside them
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 26,
  },
  // B, I and U are single letters - they do not need a full-width button
  controlLetterOption: {
    width: 26,
  },
  controlItalicLabel: {
    fontFamily: 'CourierPrimeItalic',
  },
  controlSpacingLabel: {
    fontSize: 19,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 26,
  },
  topMenuButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  // Signature band preview (mirrors the feed's band, slimmed down)
  signaturePreviewBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(5, 5, 5, 0.92)',
    justifyContent: 'center',
    paddingHorizontal: 12,
    zIndex: 23,
  },
  signaturePreviewText: {
    color: '#F5F5F5',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  // Staged editing area: centered in the free space above the config row
  editingStage: {
    position: 'absolute',
    top: 90,
    bottom: 395,
    justifyContent: 'center',
    zIndex: 30,
  },
  cropOutsideDim: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    zIndex: 21,
  },
  // Adaptive crop guide hairlines for text posts
  cropGuideLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    zIndex: 22,
  },
  // Crop bars for image backgrounds
  cropDim: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 24,
  },
  cropBarHitArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },
  cropBarLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  cropBarGrip: {
    width: 44,
    height: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  
  // Scale Slider (Instagram-style)
  scaleSliderContainer: {
    position: 'absolute',
    left: -5, // Almost off screen like Instagram
    top: 150,
    height: 340,
    width: 60, // Wider for easier touch
    zIndex: 30, // Above everything
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Smooth wedge, wide at the top: drag up = bigger text
  scaleSliderWedge: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 200,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.55)',
  },
  scaleSliderTouchArea: {
    position: 'absolute',
    width: 60, // Much larger touch area
    height: 220, // Slightly larger than track
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor: 'rgba(255,0,0,0.1)', // Debug: uncomment to see touch area
  },
  scaleSliderHandle: {
    position: 'absolute',
    width: 24, // Slightly larger handle
    height: 24,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  
  // Sticker Elements
  stickerElement: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  
  // Trash Can
  trashCanContainer: {
    position: 'absolute',
    bottom: 50,
    left: screenWidth / 2 - 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  trashCan: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
});
