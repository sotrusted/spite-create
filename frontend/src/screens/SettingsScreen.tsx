import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/colors';
import { GUIDELINES_TEXT, TERMS_TEXT, PRIVACY_TEXT } from '../constants/legal';
import { SPACE, CHROME } from '../constants/space';
import * as Updates from 'expo-updates';
import { api, endpoints, resetIdentity } from '../config/api';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const handleExportData = () => {
    Toast.show({
      type: 'info',
      text1: 'Export Data',
      text2: 'Data export feature coming soon',
    });
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@creativemindsideasmagazine.com?subject=Type Support');
  };

  const handleViewGuidelines = () => {
    Alert.alert('Community Guidelines', GUIDELINES_TEXT, [{ text: 'OK' }]);
  };

  const handlePrivacyPolicy = () => {
    Alert.alert('Privacy Policy', PRIVACY_TEXT, [{ text: 'OK' }]);
  };

  // Apple 5.1.1(v): deletion in-app, and it has to really delete. The server
  // removes the account, its posts and files, and replaces this user's quotes
  // inside other people's reposts with a "post removed" placeholder.
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'Your handle and every post you made are deleted for good. Where other people quoted you, their post will show "post removed". This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteAccount },
      ],
    );
  };

  const deleteAccount = async () => {
    try {
      await api.delete(endpoints.deleteAccount);
    } catch (error) {
      console.log('Account deletion failed:', error);
      Alert.alert('Could not delete your account', 'Nothing was deleted. Check your connection and try again.');
      return;
    }
    // Start over as a brand-new install: fresh identity, handle picker next.
    // A full reload also drops the live connection made under the old id;
    // where reloading is unavailable (dev client) a fresh feed does the rest,
    // since the missing onboarding flag brings up the handle picker.
    await resetIdentity();
    try {
      await Updates.reloadAsync();
    } catch {
      navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
    }
  };

  const handleTermsOfService = () => {
    Alert.alert('Terms of Service', TERMS_TEXT, [{ text: 'OK' }]);
  };

  const renderSettingItem = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    onPress: () => void,
    color: string = Colors.primary,
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.settingText, { color }]}>{title}</Text>
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

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          {renderSettingItem('trash-outline', 'Delete Account', handleDeleteAccount, Colors.accent)}
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
    padding: SPACE.xl,
    paddingTop: SPACE.md,
  },
  section: {
    marginBottom: SPACE.xl,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: SPACE.xs,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.lg,
    gap: SPACE.md,
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
    paddingVertical: SPACE.lg,
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
