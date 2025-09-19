import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Feed from '../components/Feed';
import { Colors } from '../constants/colors';
import { Post } from '../types';

const { width: screenWidth } = Dimensions.get('window');

export default function MainScreen() {
  const navigation = useNavigation();
  const [newPost, setNewPost] = useState<Post | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const headerAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const handleNewPost = (post: Post) => {
    setNewPost(post);
  };

  const handleNewPostDisplayed = () => {
    setNewPost(null);
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const diff = currentScrollY - lastScrollY.current;

        // Simple logic: hide on scroll down, show on scroll up
        if (Math.abs(diff) > 3) { // Only trigger on meaningful scroll
          if (diff > 0 && currentScrollY > 80) {
            // Scrolling down and past threshold - hide header
            Animated.timing(headerTranslateY, {
              toValue: -100,
              duration: 300,
              useNativeDriver: true,
            }).start();
          } else if (diff < 0 || currentScrollY <= 80) {
            // Scrolling up or near top - show header
            Animated.timing(headerTranslateY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start();
          }
          lastScrollY.current = currentScrollY;
        }
      },
    }
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
          },
        ]}
      >
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          <Text style={styles.appTitle}>TBD</Text>
          <TouchableOpacity onPress={openProfile} style={styles.profileButton}>
            <Ionicons name="person-circle-outline" size={28} color={Colors.primary} />
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>

      {/* Main Feed */}
      <View style={styles.feedContainer}>
        <Feed 
          newPost={newPost}
          onNewPostDisplayed={handleNewPostDisplayed}
          onScroll={handleScroll}
          contentInsetAdjustmentBehavior="never"
          contentInset={{ top: 100 }}
          scrollIndicatorInsets={{ top: 80 }}
        />
      </View>

      {/* Floating Post Button */}
      <TouchableOpacity 
        style={styles.floatingButton}
        onPress={openPostComposer}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={Colors.background} />
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    letterSpacing: 2,
  },
  profileButton: {
    padding: 4,
  },
  feedContainer: {
    flex: 1,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
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

