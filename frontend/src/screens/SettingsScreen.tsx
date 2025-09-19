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
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/colors';

export default function SettingsScreen() {
  const handleExportData = () => {
    Toast.show({
      type: 'info',
      text1: 'Export Data',
      text2: 'Data export feature coming soon',
    });
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@tbd-app.com?subject=TBD App Support');
  };

  const handleViewGuidelines = () => {
    Alert.alert(
      'Community Guidelines',
      '1. Be respectful to others\n2. No spam or repetitive content\n3. No harassment or hate speech\n4. No explicit or inappropriate content\n5. Respect intellectual property\n\nViolations may result in content removal or account restrictions.',
      [{ text: 'OK' }]
    );
  };

  const handlePrivacyPolicy = () => {
    Alert.alert(
      'Privacy Policy',
      'TBD is designed with privacy in mind:\n\n• Semi-anonymous posting with auto-generated handles\n• Minimal data collection\n• No personal information required\n• Device-based identification for rate limiting\n• Posts are public by default\n\nFor detailed privacy information, visit our website.',
      [{ text: 'OK' }]
    );
  };

  const handleTermsOfService = () => {
    Alert.alert(
      'Terms of Service',
      'By using TBD, you agree to:\n\n• Follow community guidelines\n• Use the service responsibly\n• Respect other users\n• Not abuse the platform\n\nTBD reserves the right to moderate content and restrict accounts that violate these terms.',
      [{ text: 'OK' }]
    );
  };

  const renderSettingItem = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    onPress: () => void,
    color: string = Colors.primary
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.settingText, { color }]}>{title}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Privacy & Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Data</Text>
          {renderSettingItem('download-outline', 'Export Data', handleExportData)}
          {renderSettingItem('shield-outline', 'Privacy Policy', handlePrivacyPolicy)}
        </View>

        {/* Community */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community</Text>
          {renderSettingItem('book-outline', 'Community Guidelines', handleViewGuidelines)}
          {renderSettingItem('document-text-outline', 'Terms of Service', handleTermsOfService)}
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          {renderSettingItem('mail-outline', 'Contact Support', handleContactSupport)}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.aboutItem}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutItem}>
            <Text style={styles.aboutLabel}>Platform</Text>
            <Text style={styles.aboutValue}>TBD</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            TBD - Semi-Anonymous, Realtime Creative Expression
          </Text>
          <Text style={styles.footerSubtext}>
            Made with ❤️ for creative minds
          </Text>
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
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
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
    paddingVertical: 12,
  },
  aboutLabel: {
    color: Colors.primary,
    fontSize: 16,
  },
  aboutValue: {
    color: Colors.secondary,
    fontSize: 16,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.secondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    color: Colors.secondary,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.7,
  },
});
