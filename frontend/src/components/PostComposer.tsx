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
import AnimatedReanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { Colors, FontChoices } from '../constants/colors';
import { PostCreate, RepostData } from '../types';
import { api, endpoints } from '../config/api';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
          opacity: 0.7
        }}
        resizeMode="contain" // Use contain to prevent overflow
        onLoad={() => console.log('✅ Image loaded successfully')}
        onError={(error) => console.log('❌ Image error:', error)}
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
  const [currentFontSize, setCurrentFontSize] = useState<number>(24); // Current editing font size (12-48)
  
  // Local state for immediate text input updates (prevents input lag)
  const [localTextContent, setLocalTextContent] = useState<Record<string, string>>({});
  
  // Canvas background
  const [backgroundColor, setBackgroundColor] = useState('#F8F8FF');
  const [backgroundGradient, setBackgroundGradient] = useState<string[]>([]);
  const backgroundOptions = ['#F8F8FF', '#1B1B1B', '#FF1A1A', '#4A90E2', '#7B68EE', '#FF6B6B', '#4ECDC4'];
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  
  // UI state - Instagram Create Mode
  const [activeControlOption, setActiveControlOption] = useState<'font' | 'color' | 'glow' | 'background'>('font');
  const [showControlBar, setShowControlBar] = useState(false);
  const [screenDarkened, setScreenDarkened] = useState(false);
  
  // Animations
  const postButtonScale = useSharedValue(1);
  const postButtonOpacity = useSharedValue(1);

  const maxLength = 500;


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
    console.log('🎯 Canvas tap detected, isEditingText:', isEditingText);
    
    // If we're currently editing, ALWAYS exit editing mode when tapping canvas
    if (isEditingText) {
      console.log('📝 Exiting edit mode due to canvas tap...');
      const currentElement = getCurrentTextElement();
      if (currentElement) {
        // Check local content (what user actually typed) instead of state content
        const currentContent = localTextContent[currentElement.id] !== undefined 
          ? localTextContent[currentElement.id] 
          : currentElement.content;
        
        if (currentContent.trim() === '') {
          console.log('🗑️ Removing empty text element');
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
    console.log('📍 Tap coordinates:', { locationX, locationY });
    
    // Check if tap is on existing text element
    const tappedElement = findElementAtPosition(locationX, locationY);
    
    if (tappedElement) {
      console.log('✏️ Tapped on existing text element:', tappedElement.id);
      setSelectedTextId(tappedElement.id);
      startEditingText(tappedElement.id);
    } else {
      console.log('➕ Creating new text element at:', { locationX, locationY });
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

  const handlePost = async () => {
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
    
    if (!allText.trim()) {
      Alert.alert('Error', 'Please add some text before posting');
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
      font_choice: currentElements[0]?.fontFamily || 'arial-black',
      font_size: Math.round((currentElements[0]?.fontSize || 24) * (currentElements[0]?.scale || 1)),
      text_color: currentElements[0]?.color || '#FF1A1A',
      background_color: backgroundColor,
      background_gradient: backgroundGradient.length > 0 ? backgroundGradient : undefined,
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
    };

    try {
      const response = await api.post(endpoints.createPost, postData);
      
      // Success animation
      postButtonScale.value = withSpring(1.1, { duration: 200 });
      
      setTimeout(() => {
        onPost?.(response.data);
        onClose?.();
        
        Toast.show({
          type: 'success',
          text1: 'Posted! 🚀',
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

  // Keep the start positions per element
  const dragStart = useRef<Record<string, { x: number; y: number }>>({});

  const handlePanStateChange = (event: any, elementId: string) => {
    const { state } = event.nativeEvent;
    if (state === State.BEGAN) {
      const el = textElements.find(e => e.id === elementId);
      if (el) dragStart.current[elementId] = { x: el.x, y: el.y };
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      delete dragStart.current[elementId];
    }
  };

  const handlePanGesture = (event: any, elementId: string) => {
    if (event.nativeEvent.state !== State.ACTIVE || isEditingText) return;
    const start = dragStart.current[elementId];
    if (!start) return;

    const { translationX, translationY } = event.nativeEvent;
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
              }
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
                      styles.textInput, 
                      { 
                        fontSize: currentFontSize, // Use current editing font size
                        width: screenWidth * 0.95,
                        maxWidth: screenWidth * 0.95,
                        position: 'absolute',
                        left: -(screenWidth * 0.95) / 2,
                        top: -currentFontSize / 2,
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

  const renderCanvas = () => {

    const canvasChildren = (
      <View style={styles.fullScreenCanvas}>
        {/* Repost image layer */}
        <RepostImageLayer uri={repostData?.screenshotUri} />
    
        {/* 2) (Optional) keep your debug tint exactly in the same layer */}
        {/* <View style={[styles.repostImage, { backgroundColor: 'rgba(0,255,0,0.15)' }]} pointerEvents="none" /> */}
    
        {/* 3) Dim overlay lives ABOVE the image but BELOW text */}
        {screenDarkened && <View style={styles.screenOverlay} pointerEvents="none" />}
        {/* 4) Interaction/text layer sits on top */}
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 20 }]} 
          onPress={handleCanvasTap}
          activeOpacity={1}
        >

          {renderEditableText()}
        </TouchableOpacity>
      </View>    
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
      <View style={[styles.fullScreenCanvas, { backgroundColor }]}>
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
          {/* Background Color Cycle */}
          <TouchableOpacity style={styles.topMenuButton} onPress={cycleBackgroundColor}>
            <View style={[styles.backgroundPreview, { backgroundColor }]} />
          </TouchableOpacity>
          
          {/* Text Button */}
          <TouchableOpacity style={styles.topMenuButton} onPress={createNewTextElement}>
            <Text style={styles.topMenuText}>Text</Text>
          </TouchableOpacity>
          
          {/* Placeholder buttons */}
          <TouchableOpacity style={styles.topMenuButton} disabled>
            <Ionicons name="image" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.topMenuButton} disabled>
            <Ionicons name="brush" size={20} color="rgba(255,255,255,0.5)" />
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
      
        {/* Post Button */}
        {!isEditingText && (
          <TouchableOpacity 
            style={styles.postButton} 
            onPress={handlePost}
            disabled={isPosting}
          >
            {isPosting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </TouchableOpacity>
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
    position: 'absolute',
    bottom: 60,
    right: 20,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  postButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
    justifyContent: 'center',
    alignItems: 'center',
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
});
