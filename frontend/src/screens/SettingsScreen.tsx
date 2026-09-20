import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/colors';
import LoadingScreen from '../components/LoadingScreen';
import { GUIDELINES_TEXT, TERMS_TEXT, PRIVACY_TEXT } from '../constants/legal';

export default function SettingsScreen() {
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPaused, setPreviewPaused] = useState(false);
  const handleExportData = () => {
    Toast.show({
      type: 'info',
      text1: 'Export Data',
      text2: 'Data export feature coming soon',
    });
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@subscript-app.com?subject=Creative Mind%27s Ideas Magazine Support');
  };

  const handleViewGuidelines = () => {
    Alert.alert('Community Guidelines', GUIDELINES_TEXT, [{ text: 'OK' }]);
  };

  const handlePrivacyPolicy = () => {
    Alert.alert('Privacy Policy', PRIVACY_TEXT, [{ text: 'OK' }]);
  };

  const handleTermsOfService = () => {
    Alert.alert('Terms of Service', TERMS_TEXT, [{ text: 'OK' }]);
  };

  const renderSettingItem = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    onPress: () => void
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={styles.settingText}>{title}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        {/* Privacy & Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY & DATA</Text>
          {renderSettingItem('download-outline', 'Export Data', handleExportData)}
          {renderSettingItem('shield-outline', 'Privacy Policy', handlePrivacyPolicy)}
        </View>

        {/* Community */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COMMUNITY</Text>
          {renderSettingItem('book-outline', 'Community Guidelines', handleViewGuidelines)}
          {renderSettingItem('document-text-outline', 'Terms of Service', handleTermsOfService)}
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORT</Text>
          {renderSettingItem('mail-outline', 'Contact Support', handleContactSupport)}
        </View>

        {/* TEMP: dev preview of the loading animation (too fast to catch
            on localhost). Remove before release. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEV</Text>
          {renderSettingItem('play-outline', 'Preview Loading Screen', () => setPreviewLoading(true))}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.aboutItem}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
        </View>
      </View>

      <Modal visible={previewLoading} animationType="fade" onRequestClose={() => setPreviewLoading(false)}>
        {/* Tap dismisses; press-and-hold freezes the current frame */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPreviewLoading(false)}
          onLongPress={() => setPreviewPaused(true)}
          delayLongPress={180}
          onPressOut={() => setPreviewPaused(false)}
        >
          <LoadingScreen paused={previewPaused} />
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 12,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingText: {
    color: Colors.primary,
    fontSize: 16,
    flex: 1,
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  aboutLabel: {
    color: Colors.primary,
    fontSize: 16,
  },
  aboutValue: {
    color: Colors.secondary,
    fontSize: 16,
  },
});
