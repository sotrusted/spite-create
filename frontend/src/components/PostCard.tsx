import React, { useState, useRef, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Post } from '../types';

const { width: screenWidth } = Dimensions.get('window');
const SIGNATURE_BAND_HEIGHT = Math.max(28, Math.round(screenWidth * 0.06));

interface Props {
  post: Post;
  onReport: (reason: string, description: string) => void;
  onMute: () => void;
  onCopyText: () => void;
  onRepost: () => void;
}

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'fake', label: 'Fake/Misleading' },
  { value: 'other', label: 'Other' },
];

const SIGNATURE_BASE_STYLES: Record<string, { background: string; text: string }> = {
  default: { background: '#050505', text: '#F5F5F5' },
  pulse: { background: '#FF1A1A', text: '#FFFFFF' },
  noir: { background: '#161616', text: '#F2F2F2' },
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return [0, 0, 0];
  }
  return [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16));
};

const contrastRatio = (rgb1: number[], rgb2: number[]) => {
  const luminance = (rgb: number[]) => {
    const toLinear = (channel: number) => {
      const c = channel / 255;
      if (c <= 0.03928) return c / 12.92;
      return Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = rgb;
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const lum1 = luminance(rgb1);
  const lum2 = luminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
};

const resolveSignatureTheme = (styleKey?: string) => {
  const base = SIGNATURE_BASE_STYLES[styleKey?.toLowerCase() || 'default'] || SIGNATURE_BASE_STYLES.default;
  const bandRgb = hexToRgb(base.background);
  const textRgb = hexToRgb(base.text);
  const contrast = contrastRatio(bandRgb, textRgb);

  if (contrast >= 3.0) {
    return base;
  }

  const whiteContrast = contrastRatio(bandRgb, [255, 255, 255]);
  const blackContrast = contrastRatio(bandRgb, [0, 0, 0]);

  return {
    background: base.background,
    text: whiteContrast >= blackContrast ? '#FFFFFF' : '#000000',
  };
};

export default function PostCard({ post, onReport, onMute, onCopyText, onRepost }: Props) {
  const navigation = useNavigation();
  const postRef = useRef<View>(null);
  const [showActions, setShowActions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  const signatureTheme = useMemo(() => resolveSignatureTheme(post.signature_style), [post.signature_style]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const handleLongPress = () => {
    setShowActions(true);
  };

  const handleCopyText = async () => {
    try {
      await Clipboard.setStringAsync(post.text_content);
      onCopyText();
    } catch (error) {
      console.error('Error copying text:', error);
    }
    setShowActions(false);
  };

  const handleReport = (reason: string) => {
    setShowReportModal(false);
    setShowActions(false);
    onReport(reason, '');
  };

  const handleRepost = async () => {
    try {
      setShowActions(false);
      
      // Use the existing rendered image URL instead of capturing
      const imageUri = post.rendered_image_url;
      
      if (!imageUri) {
        Alert.alert('Error', 'This post cannot be reposted (no image available)');
        return;
      }
      
      console.log('🖼️ Using post image URI:', imageUri);
      
      // Navigate to PostComposer with repost data
      (navigation as any).navigate('PostComposer', {
        repostData: {
          originalPost: post,
          screenshotUri: imageUri,
        },
      });
      
    } catch (error) {
      console.error('Error setting up repost:', error);
      Alert.alert('Error', 'Failed to set up repost');
    }
  };

  const handleMute = () => {
    Alert.alert(
      'Mute User',
      `Are you sure you want to mute @${post.author.handle}? You won't see their posts anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Mute', 
          style: 'destructive',
          onPress: () => {
            onMute();
            setShowActions(false);
          }
        },
      ]
    );
  };

  const renderActionSheet = () => (
    <Modal
      visible={showActions}
      transparent
      animationType="fade"
      onRequestClose={() => setShowActions(false)}
    >
      <TouchableWithoutFeedback onPress={() => setShowActions(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.actionSheet}>
              <TouchableOpacity style={styles.actionItem} onPress={handleCopyText}>
                <Ionicons name="copy-outline" size={20} color={Colors.primary} />
                <Text style={styles.actionText}>Copy Text</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionItem} 
                onPress={handleRepost}
              >
                <Ionicons name="repeat-outline" size={20} color={Colors.accent} />
                <Text style={[styles.actionText, { color: Colors.accent }]}>Repost</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionItem} 
                onPress={() => {
                  setShowActions(false);
                  setShowReportModal(true);
                }}
              >
                <Ionicons name="flag-outline" size={20} color={Colors.error} />
                <Text style={[styles.actionText, { color: Colors.error }]}>Report</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionItem} onPress={handleMute}>
                <Ionicons name="volume-mute-outline" size={20} color={Colors.warning} />
                <Text style={[styles.actionText, { color: Colors.warning }]}>
                  Mute @{post.author.handle}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.actionItem, styles.cancelAction]} 
                onPress={() => setShowActions(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

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
              <Text style={styles.modalSubtitle}>
                Why are you reporting this post?
              </Text>
              
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

  return (
    <View style={styles.container}>
      <View ref={postRef} style={styles.captureContainer}>
        {/* Post Content - Full Bleed */}
        <TouchableOpacity 
          style={styles.postContent}
          onLongPress={handleLongPress}
          delayLongPress={500}
          activeOpacity={0.95}
        >
          {post.rendered_image_url ? (
            <View
              style={(() => {
                const canvasWidth = post.image_width && post.image_width > 0 ? post.image_width : null;
                const canvasHeight = post.image_height && post.image_height > 0 ? post.image_height : null;
                const topY = typeof post.top_y === 'number' ? post.top_y : null;
                const bottomY = typeof post.bottom_y === 'number' ? post.bottom_y : null;
                const signatureOffset = post.is_signed ? SIGNATURE_BAND_HEIGHT : 0;
                if (canvasWidth && canvasHeight && topY !== null && bottomY !== null && bottomY > topY) {
                  const scale = screenWidth / canvasWidth;
                  const croppedHeight = Math.max(bottomY - topY, 1);
                  return [
                    styles.postImageWrapper,
                    {
                      height: croppedHeight * scale + signatureOffset,
                      paddingTop: signatureOffset,
                    },
                  ];
                }
                return [
                  styles.postImageWrapper,
                  {
                    aspectRatio: imageAspectRatio,
                    maxHeight: screenWidth * 1.5 + signatureOffset,
                    paddingTop: signatureOffset,
                  },
                ];
              })()}
            >
              {post.is_signed && (
                <View
                  pointerEvents="none"
                  style={[styles.signatureBand, { backgroundColor: signatureTheme.background }]}
                >
                  <Text
                    style={[styles.signatureText, { color: signatureTheme.text }]}
                    numberOfLines={1}
                  >
                    @{(post.author.handle || '').toUpperCase()}
                  </Text>
                </View>
              )}
              <Image 
                source={{ uri: post.rendered_image_url }}
                style={(() => {
                  const canvasWidth = post.image_width && post.image_width > 0 ? post.image_width : null;
                  const canvasHeight = post.image_height && post.image_height > 0 ? post.image_height : null;
                  const topY = typeof post.top_y === 'number' ? post.top_y : null;
                  const bottomY = typeof post.bottom_y === 'number' ? post.bottom_y : null;
                  const signatureOffset = post.is_signed ? SIGNATURE_BAND_HEIGHT : 0;
                  if (canvasWidth && canvasHeight && topY !== null && bottomY !== null && bottomY > topY) {
                    const scale = screenWidth / canvasWidth;
                    return [
                      styles.postImage,
                      {
                        height: canvasHeight * scale,
                        transform: [{ translateY: -topY * scale + signatureOffset }],
                      },
                    ];
                  }
                  return [
                    styles.postImage,
                    {
                      aspectRatio: imageAspectRatio,
                      maxHeight: screenWidth * 1.5,
                      marginTop: -signatureOffset,
                    }
                  ];
                })()}
                resizeMode="cover"
                onLoad={(event) => {
                  const { width, height } = event.nativeEvent.source;
                  const aspectRatio = width / height;
                  setImageAspectRatio(aspectRatio);
                  console.log('📐 Image dimensions:', { width, height, aspectRatio });
                }}
                onError={(error) => {
                  console.error('Error loading post image:', error);
                  console.log('Failed image URL:', post.rendered_image_url);
                }}
              />
            </View>
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>
                {post.text_content}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {renderActionSheet()}
      {renderReportModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    marginBottom: 0, // no gap between posts
    width: '100%',
  },
  captureContainer: {
    backgroundColor: Colors.background,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  handle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  metadata: {
    alignItems: 'flex-end',
  },
  timeAgo: {
    color: Colors.secondary,
    fontSize: 12,
  },
  viewCount: {
    color: Colors.secondary,
    fontSize: 10,
    marginTop: 2,
  },
  postContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postImageWrapper: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  signatureBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SIGNATURE_BAND_HEIGHT,
    paddingHorizontal: 16,
    zIndex: 5,
    justifyContent: 'center',
  },
  signatureText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
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
  },
  textContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  postText: {
    color: Colors.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  actionText: {
    color: Colors.primary,
    fontSize: 16,
  },
  cancelAction: {
    borderTopWidth: 1,
    borderTopColor: Colors.background,
    marginTop: 8,
  },
  cancelText: {
    color: Colors.secondary,
    fontSize: 16,
    textAlign: 'center',
  },
  reportModal: {
    backgroundColor: Colors.surface,
    marginHorizontal: 32,
    borderRadius: 16,
    padding: 24,
    alignSelf: 'center',
    maxWidth: 300,
    width: '100%',
  },
  modalTitle: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: Colors.secondary,
    fontSize: 14,
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
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
  },
});
