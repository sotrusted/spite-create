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
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AnimatedReanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { Colors, FontChoices } from '../constants/colors';
import { PostCreate, RepostData, StickerElement, User } from '../types';
import { api, endpoints } from '../config/api';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
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
  fontFamily: 'arial-black' | 'crimson-text' | 'papyrus' | 'impact';
  hasBackground: boolean;
  backgroundColor: string;
  backgroundMode: 'off' | 'white' | 'inverted';
  capsLock: boolean;
  scale: number;
}

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

const RepostImageLayer = ({ uri }: { uri?: string }) => {
  if (!uri) return null;

  console.log('🖼️ RepostImageLayer rendering with URI:', uri);
  
  return (
    <View style={styles.repostImage}>
      <Image 
        source={{ uri }}
        style={{ 
          width: '100%', 
          height: '100%',
          opacity: 0.95, // Very minimal opacity reduction
        }}
        resizeMode="contain" // Use contain to prevent overflow
        onLoad={() => console.log('✅ Image loaded successfully')}
        onError={(error) => console.log('❌ Image error:', error)}
        // Note: Quality compression will be handled in backend
      />
    </View>
  );
};

export default function PostComposer({ onPost, onClose, repostData }: Props) {
  // Text elements state
  const [textElements, setTextElements] = useState<TextElement[]>([
    {
      id: '1',
      content: '',
      x: screenWidth / 2,
      y: screenHeight * 0.3, // Position in upper third of screen
      originalX: null,
      originalY: null,
      fontSize: 24,
      color: '#FF1A1A',
      fontFamily: 'arial-black',
      hasBackground: false,
      backgroundColor: '#FFFFFF',
      backgroundMode: 'off',
      capsLock: true,
      scale: 1,
    }
  ]);
  
  const [selectedTextId, setSelectedTextId] = useState<string>('1');
  const [isEditingText, setIsEditingText] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [userProfile, setUserProfile] = useState<User | null>(null);
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
  const getInitialBackgroundColor = () => {
    if (repostData?.originalPost?.background_color) {
      return getNextBackgroundColor(repostData.originalPost.background_color);
    }
    return Colors.postColors[0]; // Default to first color in the list
  };
  
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
  
  // Shared values for image background gestures
  const imageScale = useSharedValue(1);
  const imageTranslateX = useSharedValue(0);
  const imageTranslateY = useSharedValue(0);
  const imageBaseScale = useSharedValue(1);
  const imageBaseTranslateX = useSharedValue(0);
  const imageBaseTranslateY = useSharedValue(0);
  
  // UI state - Instagram Create Mode
  const [activeControlOption, setActiveControlOption] = useState<'font' | 'color' | 'glow' | 'background'>('font');
  const [showControlBar, setShowControlBar] = useState(false);
  const [screenDarkened, setScreenDarkened] = useState(false);
  
  // Animations
  const postButtonScale = useSharedValue(1);
  const postButtonOpacity = useSharedValue(1);
  const longPressTriggeredRef = useRef(false);

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
          const fullUrl = uploadResponse.data.url.startsWith('http') 
            ? uploadResponse.data.url 
            : `http://192.168.1.158:8001${uploadResponse.data.url}`;
            
          setBackgroundImage(fullUrl);
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
      const fullUrl = uploadResponse.data.url.startsWith('http') 
        ? uploadResponse.data.url 
        : `http://192.168.1.158:8001${uploadResponse.data.url}`;
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
    const { locationX, locationY } = event.nativeEvent;
    console.log('Tap coordinates:', { locationX, locationY });
    
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
        color: '#FF1A1A',
        fontFamily: 'arial-black',
        hasBackground: false,
        backgroundColor: '#FFFFFF',
        backgroundMode: 'off',
        capsLock: true,
        scale: 1,
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

  const signaturePrefs = resolveSignaturePreference();
  const tapPostMode: 'signed' | 'anonymous' = signaturePrefs.prefersSigned ? 'signed' : 'anonymous';
  const longPressPostMode: 'signed' | 'anonymous' = signaturePrefs.prefersSigned ? 'anonymous' : 'signed';
  const postHintText = signaturePrefs.prefersSigned
    ? 'Tap to post with signature · Hold to go anonymous'
    : 'Tap to post anonymously · Hold to sign';

  const handlePost = async (mode: 'default' | 'signed' | 'anonymous' = 'default') => {
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

    const { prefersSigned, style: preferredStyle } = resolveSignaturePreference();
    let shouldSign: boolean;
    if (mode === 'signed') {
      shouldSign = true;
    } else if (mode === 'anonymous') {
      shouldSign = false;
    } else {
      shouldSign = prefersSigned;
    }

    const signatureStyle = shouldSign ? preferredStyle : undefined;

    const postData: PostCreate = {
      text_content: allText,
      text_elements: currentElements.map(el => ({
        content: el.content,
        x: el.x,
        y: el.y,
        fontSize: Math.round(el.fontSize * el.scale), // Apply scale factor to get actual visual size
        color: el.color,
        fontFamily: el.fontFamily,
        hasBackground: el.hasBackground,
        backgroundColor: el.backgroundColor,
      })),
      sticker_elements: stickerElements.map(sticker => ({
        id: sticker.id,
        uri: sticker.uri,
        x: sticker.x,
        y: sticker.y,
        width: sticker.width,
        height: sticker.height,
        scale: sticker.scale,
        rotation: sticker.rotation,
        shape: sticker.shape,
      })),
      font_choice: currentElements[0]?.fontFamily || 'arial-black',
      font_size: Math.round((currentElements[0]?.fontSize || 24) * (currentElements[0]?.scale || 1)),
      text_color: currentElements[0]?.color || '#FF1A1A',
      background_color: backgroundColor,
      background_gradient: backgroundGradient.length > 0 ? backgroundGradient : undefined,
      background_image: backgroundImage || undefined,
      background_image_scale: backgroundImage ? imageBackgroundScale : undefined,
      background_image_position: backgroundImage ? imageBackgroundPosition : undefined,
      has_outline: false,
      outline_color: '#000000',
      has_text_background: currentElements[0]?.hasBackground || false,
      text_background_color: currentElements[0]?.hasBackground ? currentElements[0].backgroundColor : undefined,
      canvas_width: Math.round(screenWidth),
      canvas_height: Math.round(screenHeight),
      repost_data: repostData ? {
        original_post_id: repostData.originalPost.id,
        screenshot_uri: repostData.screenshotUri,
        // Simple repost geometry
        repost_geometry: {
          x: 0,  // Position on canvas
          y: 0,  // Position on canvas
          scale: 1.0, // Scale factor
        },
      } : undefined,
      is_signed: shouldSign,
      signature_style: signatureStyle,
    };

    try {
      const response = await api.post(endpoints.createPost, postData);
      
      // Success animation
      postButtonScale.value = withSpring(1.1, { duration: 200 });
      
      setTimeout(() => {
        setIsPosting(false);
        onPost?.(response.data);
        onClose?.();
        
        Toast.show({
          type: 'success',
          text1: 'Posted!',
          position: 'bottom',
          visibilityTime: 2000,
        });
      }, 300);
      
    } catch (error: any) {
      console.error('Error creating post:', error);
      
      // Reset button animation
      postButtonScale.value = withSpring(1, { duration: 200 });
      postButtonOpacity.value = withTiming(1, { duration: 200 });
      
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.error ||
                          'Failed to create post';
      Alert.alert('Error', errorMessage);
      
      setIsPosting(false);
    }
  };

  const startEditingText = (id: string) => {
    console.log('🏁 startEditingText called for id:', id);
    setSelectedTextId(id);
    setIsEditingText(true);
    setScreenDarkened(true);
    setShowControlBar(true);
    moveTextIntoViewForEditing(id);
    
    // Initialize local text content and font size with current element
    const element = textElements.find(el => el.id === id);
    if (element) {
      setLocalTextContent(prev => ({ ...prev, [id]: element.content }));
      setCurrentFontSize(element.fontSize);
    }
    
    console.log('✅ Edit state set: editing=true, darkened=true, controls=true');
  };

  const moveTextIntoViewForEditing = (id: string) => {
    const element = textElements.find(el => el.id === id);

    if (element) {
      element.originalX = element.x;
      element.originalY = element.y;
      
      // Only move text if it's outside the visible area (with some margin)
      const margin = 100;
      const isOffScreen = element.x < margin || 
                         element.x > screenWidth - margin || 
                         element.y < margin || 
                         element.y > screenHeight - margin;
      
      if (isOffScreen) {
        element.x = screenWidth * 0.5;
        element.y = screenHeight * 0.3;
      }
      // If text is already on-screen, leave it where it is
    }
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

  const cycleBackgroundColor = () => {
    const nextIndex = (currentBgIndex + 1) % backgroundOptions.length;
    setCurrentBgIndex(nextIndex);
    setBackgroundColor(backgroundOptions[nextIndex]);
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
      color: '#FF1A1A',
      fontFamily: 'arial-black',
      hasBackground: false,
      backgroundColor: '#FFFFFF',
      backgroundMode: 'off',
      capsLock: true,
      scale: 1,
    };
    setTextElements(prev => [...prev, newElement]);
    setSelectedTextId(newId);
    startEditingText(newId);
  };

  const getTextStyle = (element: TextElement) => {
    const fontConfig = FontChoices[element.fontFamily];
    
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
      fontFamily: fontConfig.fontFamily,
      fontWeight: fontConfig.fontWeight as any,
      textAlign: 'center' as const,
      backgroundColor: bgColor,
      paddingHorizontal: hasPadding ? 8 : 0,
      paddingVertical: hasPadding ? 4 : 0,
      borderRadius: hasPadding ? 4 : 0,
      textTransform: element.capsLock ? 'uppercase' : 'none' as any,
      includeFontPadding: false,
      textAlignVertical: 'center' as const,
      transform: [{ scale: element.scale }], // Apply absolute scale transform
    };
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
      // Show trash can when starting to drag a text element
      if (!backgroundImage) {
        console.log('📝 Text drag BEGAN, showing trash can');
        setIsDraggingElement(true);
      }
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

  const handlePinchGesture = (event: any, elementId: string) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      const element = textElements.find(el => el.id === elementId);
      if (element && !isEditingText) {
        const newScale = Math.max(0.3, Math.min(5.0, element.scale * event.nativeEvent.scale));
        updateTextElement(elementId, {
          scale: newScale, // Use scale instead of fontSize for absolute scaling
        });
      }
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
        console.log('🎬 BEGAN - Reset deletion flag');
        
        // Only show trash can if we're starting to drag a selected element (not background)
        if ((selectedStickerId || selectedTextId) && !backgroundImage) {
          console.log('🎬 Starting element drag:', { selectedStickerId, selectedTextId, backgroundImage });
          setIsDraggingElement(true);
        } else {
          console.log('🎬 NOT starting element drag:', { selectedStickerId, selectedTextId, backgroundImage });
        }
      } else if (state === State.ACTIVE) {
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
      if (state === State.ACTIVE && translationY < -50 && velocityY < -500 && !isPickerOpen) {
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
              style={[
                styles.stickerImage,
                { borderRadius: sticker.shape === 'rounded' ? 12 : sticker.shape === 'square' ? 0 : 8 }
              ]}
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
          enabled={!isEditingText}
        >
          <AnimatedReanimated.View 
            style={[
              styles.textElementTouchArea, // Much larger touch area for pinch
              {
                left: element.x - 60,
                top: element.y - 60,
              },
              selectedTextId === element.id ? deletionAnimatedStyle : {},
            ]}
          >
            <PanGestureHandler
              onGestureEvent={(event) => handlePanGesture(event, element.id)}
              onHandlerStateChange={(event) => handlePanStateChange(event, element.id)}
              enabled={!isEditingText}
            >
              <AnimatedReanimated.View style={styles.textElement}>
                {isEditingText && selectedTextId === element.id ? (
                  <TextInput
                    key={`input-${element.id}-${isEditingText}`} // Stable key for re-rendering
                    style={[
                      getTextStyle(element), 
                      { 
                        fontSize: currentFontSize, // Use current editing font size
                        width: screenWidth * 0.9,
                        maxWidth: screenWidth * 0.9,
                        position: 'absolute',
                        left: -(screenWidth * 0.9) / 2,
                        top: -currentFontSize / 2,
                        padding: 0, // Remove any default padding
                        margin: 0, // Remove any default margin
                        textAlign: 'center', // Ensure centering
                      }
                    ]}
                    value={getDisplayText(element)}
                    onChangeText={(text) => handleTextInputChange(element.id, text)}
                    autoFocus
                    multiline={true} // Enable multiline for wrapping
                    textAlign="center"
                    placeholder="TYPE HERE..."
                    placeholderTextColor="rgba(255,255,255,0.5)"
                  />
                ) : (
                  <TouchableOpacity 
                    onPress={() => startEditingText(element.id)}
                    onLongPress={() => deleteTextElement(element.id)}
                  >
                    <Text style={getTextStyle(element)}>
                      {getDisplayText(element) || (element.id === '1' ? "TAP TO ADD TEXT" : "")}
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
          >
            <AnimatedReanimated.View style={StyleSheet.absoluteFill}>
              {/* Repost image layer */}
              <RepostImageLayer uri={repostData?.screenshotUri} />
          
              {/* Dim overlay lives ABOVE the image but BELOW text */}
              {screenDarkened && <View style={styles.screenOverlay} pointerEvents="none" />}
              
              {/* Interaction/text layer sits on top */}
              <TouchableOpacity
                style={[StyleSheet.absoluteFill, { zIndex: 20 }]} 
                onPress={handleCanvasTap}
                activeOpacity={1}
              >
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
  const renderTopMenu = () => {
    
    return (
      <View style={styles.topMenu}>
        {/* Left - Close Button */}
        <TouchableOpacity style={styles.topMenuButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
        
        {/* Right - Controls */}
        <View style={styles.topMenuRight}>
          {/* Sticker Button */}
          <TouchableOpacity style={styles.topMenuButton} onPress={pickImageSticker}>
            <Ionicons name="images" size={20} color="white" />
          </TouchableOpacity>
          
          {/* Background Color Cycle */}
          <TouchableOpacity style={styles.topMenuButton} onPress={cycleBackgroundColor}>
            <View style={[styles.backgroundPreview, { backgroundColor }]} />
          </TouchableOpacity>
          
          {/* Text Button */}
          <TouchableOpacity style={styles.topMenuButton} onPress={createNewTextElement}>
            <Text style={styles.topMenuText}>Text</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderBottomControlBar = () => {
    if (!showControlBar) return null;
    
    return (
      <View style={styles.bottomControlContainer}>
        {/* Floating Selection Menu */}
        {renderFloatingSelectionMenu()}
        
        {/* Control Bar */}
        <View style={styles.bottomControlBar}>
          <TouchableOpacity 
            style={[styles.controlOption, activeControlOption === 'font' && styles.controlOptionActive]}
            onPress={() => {
              console.log('🔤 Font control pressed, current option:', activeControlOption);
              setActiveControlOption('font');
            }}
          >
            <Ionicons name="text" size={20} color={activeControlOption === 'font' ? Colors.accent : 'white'} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.controlOption, activeControlOption === 'color' && styles.controlOptionActive]}
            onPress={() => {
              console.log('🎨 Color control pressed, current option:', activeControlOption);
              setActiveControlOption('color');
            }}
          >
            <Ionicons name="color-palette" size={20} color={activeControlOption === 'color' ? Colors.accent : 'white'} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.controlOption, getCurrentTextElement()?.capsLock && styles.controlOptionActive]}
            onPress={() => {
              const current = getCurrentTextElement();
              if (current) updateTextElement(current.id, { capsLock: !current.capsLock });
            }}
          >
            <Ionicons name="text-outline" size={20} color={getCurrentTextElement()?.capsLock ? Colors.accent : 'white'} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.controlOption, getCurrentTextElement()?.backgroundMode !== 'off' && styles.controlOptionActive]}
            onPress={() => {
              const current = getCurrentTextElement();
              if (current) {
                const nextMode = current.backgroundMode === 'off' ? 'white' : 
                               current.backgroundMode === 'white' ? 'inverted' : 'off';
                updateTextElement(current.id, { backgroundMode: nextMode });
              }
            }}
          >
            <Ionicons name="color-fill" size={20} color={getCurrentTextElement()?.backgroundMode !== 'off' ? Colors.accent : 'white'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderScaleSlider = () => {
    if (!isEditingText) return null;
    
    return (
      <View style={styles.scaleSliderContainer}>
        {/* Instagram-style tapered slider */}
        <View style={styles.scaleSliderTrack}>
          {/* Create the cone/taper effect with multiple segments */}
          {Array.from({ length: 20 }, (_, index) => {
            const progress = index / 19; // 0 to 1
            const width = 2 + (progress * 8); // 2px to 10px width (taper effect)
            const opacity = 0.3 + (progress * 0.4); // Fade effect
            const isActive = ((currentFontSize - 8) / (72 - 8)) >= progress;
            
            return (
              <View
                key={index}
                style={[
                  styles.scaleSliderSegment,
                  {
                    width: width,
                    backgroundColor: isActive 
                      ? `rgba(255, 255, 255, ${opacity + 0.4})` 
                      : `rgba(255, 255, 255, ${opacity})`,
                  }
                ]}
              />
            );
          })}
        </View>
        
        {/* Draggable slider handle with larger touch area */}
        <PanGestureHandler
          onGestureEvent={(event) => {
            const { translationY } = event.nativeEvent;
            const sliderHeight = 200; // Height of the slider
            const minFontSize = 8;  // Much wider range
            const maxFontSize = 72; // Much wider range
            const progress = Math.max(0, Math.min(1, 1 - (translationY / sliderHeight)));
            const newFontSize = minFontSize + (progress * (maxFontSize - minFontSize));
            setCurrentFontSize(newFontSize);
          }}
        >
          <View style={styles.scaleSliderTouchArea}>
            <View 
              style={[
                styles.scaleSliderHandle,
                { 
                  bottom: `${((currentFontSize - 8) / (72 - 8)) * 85}%` // Convert 8-72 range to 0-85% position
                }
              ]}
            />
          </View>
        </PanGestureHandler>
      </View>
    );
  };

  const renderFloatingSelectionMenu = () => {
    const currentElement = getCurrentTextElement();
    console.log('🎛️ renderFloatingSelectionMenu called:', { 
      currentElement: currentElement?.id, 
      activeControlOption,
      showControlBar 
    });
    
    if (!currentElement) {
      console.log('❌ No current element found');
      return null;
    }

    return (
      <View style={styles.floatingSelectionMenu}>
        {activeControlOption === 'font' && (
          <>
            {console.log('🔤 Rendering font selection')}
            {renderFontSelection(currentElement)}
          </>
        )}
        {activeControlOption === 'color' && (
          <>
            {console.log('🎨 Rendering color selection')}
            {renderColorSelection(currentElement)}
          </>
        )}
      </View>
    );
  };

  const renderFontSelection = (element: TextElement) => (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      style={styles.fontScrollView}
      keyboardShouldPersistTaps="always"
    >
      {Object.entries(FontChoices).map(([key, font]) => (
        <TouchableOpacity
          key={key}
          style={[styles.fontOption, element.fontFamily === key && styles.fontOptionActive]}
          onPress={() => {
            console.log('🔤 Font selected:', key, 'for element:', element.id);
            updateTextElement(element.id, { fontFamily: key as 'arial-black' | 'crimson-text' | 'papyrus' | 'impact' });
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.fontOptionText, { fontFamily: font.fontFamily, fontWeight: font.fontWeight as any }]}>
            {font.name || key}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderColorSelection = (element: TextElement) => (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      style={styles.colorScrollView}
      keyboardShouldPersistTaps="always"
    >
      {Colors.postColors.map((color, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.colorSwatch, { backgroundColor: color }, element.color === color && styles.colorSwatchActive]}
          onPress={() => {
            console.log('🎨 Color selected:', color, 'for element:', element.id);
            updateTextElement(element.id, { color });
          }}
          activeOpacity={0.8}
        />
      ))}
    </ScrollView>
  );

  const renderGlowSelection = (element: TextElement) => (
    <View style={styles.toggleContainer}>
      <Text style={styles.toggleText}>Glow Effect</Text>
      <TouchableOpacity 
        style={[styles.toggleButton, element.hasBackground && styles.toggleButtonActive]}
        onPress={() => updateTextElement(element.id, { hasBackground: !element.hasBackground })}
      >
        <Text style={styles.toggleButtonText}>{element.hasBackground ? 'ON' : 'OFF'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBackgroundSelection = (element: TextElement) => (
    <View style={styles.toggleContainer}>
      <Text style={styles.toggleText}>Text Background</Text>
      <TouchableOpacity 
        style={[styles.toggleButton, element.hasBackground && styles.toggleButtonActive]}
        onPress={() => updateTextElement(element.id, { hasBackground: !element.hasBackground })}
      >
        <Text style={styles.toggleButtonText}>{element.hasBackground ? 'ON' : 'OFF'}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Background color layer */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor }]} />
      
      {/* Background image layer - outside KeyboardAvoidingView so keyboard doesn't shift it */}
      {backgroundImage && (
        <PinchGestureHandler
          onGestureEvent={(event) => handleUnifiedGesture(event, 'pinch')}
          onHandlerStateChange={(event) => handleUnifiedGesture(event, 'pinch')}
          simultaneousHandlers={['pan']}
        >
          <AnimatedReanimated.View style={StyleSheet.absoluteFill}>
            <PanGestureHandler
              onGestureEvent={(event) => handleUnifiedGesture(event, 'pan')}
              onHandlerStateChange={(event) => handleUnifiedGesture(event, 'pan')}
              simultaneousHandlers={['pinch']}
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
        
        {/* Full Screen Canvas - handles all taps via handleCanvasTap */}
        <View style={styles.canvasContainer}>
          {renderCanvas()}
        </View>
      
      {/* Top Menu (when not editing) */}
      {renderTopMenu()}
      
      {/* Bottom Control Bar (when editing) */}
      {renderBottomControlBar()}
      
      {/* Scale Slider (when editing text) */}
      {renderScaleSlider()}

        {/* Trash Can (appears during drag) */}
        {renderTrashCan()}


        {/* Post Button */}
        {!isEditingText && (
          <View style={styles.postActionCluster}>
            <TouchableOpacity 
              style={styles.postButton} 
              onPress={() => {
                if (longPressTriggeredRef.current) {
                  longPressTriggeredRef.current = false;
                  return;
                }
                handlePost(tapPostMode);
              }}
              onLongPress={() => {
                if (isPosting) {
                  return;
                }
                longPressTriggeredRef.current = true;
                handlePost(longPressPostMode);
              }}
              onPressOut={() => {
                longPressTriggeredRef.current = false;
              }}
              delayLongPress={600}
              disabled={isPosting}
            >
              {isPosting ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.postButtonHint}>{postHintText}</Text>
          </View>
        )}
        
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    borderRadius: 22,
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
    borderRadius: 12,
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
    width: 30,
    height: 30,
    borderRadius: 15,
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
    borderRadius: 20,
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
    borderRadius: 20,
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
    borderRadius: 15,
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
    borderRadius: 25,
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'right',
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
  
  // Scale Slider (Instagram-style)
  scaleSliderContainer: {
    position: 'absolute',
    left: -5, // Almost off screen like Instagram  
    top: '25%',
    height: '50%',
    width: 60, // Wider for easier touch
    zIndex: 30, // Above everything
    justifyContent: 'center',
    alignItems: 'center',
  },
  scaleSliderTrack: {
    height: 200,
    width: 20, // Wide enough for the taper
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  scaleSliderSegment: {
    height: 8, // Height of each segment
    borderRadius: 1,
    marginVertical: 1,
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
    borderRadius: 12,
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
    borderRadius: 8,
    zIndex: 15,
  },
  stickerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
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
    borderRadius: 30,
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
