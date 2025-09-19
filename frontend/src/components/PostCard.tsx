import React, { useState, useRef } from 'react';
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

export default function PostCard({ post, onReport, onMute, onCopyText, onRepost }: Props) {
  const navigation = useNavigation();
  const postRef = useRef<View>(null);
  const [showActions, setShowActions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

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
            <Image 
              source={{ uri: post.rendered_image_url }}
              style={[
                styles.postImage, 
                { 
                  aspectRatio: imageAspectRatio,
                  maxHeight: screenWidth * 1.5 // Prevent overflow while allowing full content
                }
              ]}
              resizeMode="contain"
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
  postImage: {
    width: '100%',
    backgroundColor: Colors.surface,
  },
  placeholderImage: {
    width: '100%',
    aspectRatio: 2/3,
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
