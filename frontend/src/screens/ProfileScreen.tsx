import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import LoadingScreen from '../components/LoadingScreen';
import { Colors, FontChoices } from '../constants/colors';
import { FontChoice, User } from '../types';
import { api, endpoints } from '../config/api';

// Signature customization: signing renders your handle under the post in
// this font and color. Empty color means auto-contrast.
const SIGNATURE_COLORS = ['', '#FF1A1A', '#0000EE', '#9932CC', '#32CD32', '#FFD700', '#000000', '#F8F8FF'];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get(endpoints.getUserProfile);
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const updateSignature = async (updates: { signature_font?: string; signature_color?: string }) => {
    if (!user) return;
    const previous = user;
    setUser({ ...user, ...updates });
    try {
      const response = await api.patch(endpoints.getUserProfile, updates);
      setUser(response.data);
    } catch (error) {
      console.error('Error updating signature:', error);
      setUser(previous);
      Alert.alert('Error', 'Failed to update signature');
    }
  };

  const saveHandle = async () => {
    const next = handleDraft.trim().toLowerCase();
    if (!user || !next || next === user.handle) {
      setEditingHandle(false);
      return;
    }
    try {
      const response = await api.patch(endpoints.getUserProfile, { handle: next });
      setUser(response.data);
      setEditingHandle(false);
    } catch (error: any) {
      const message = error.response?.data?.handle?.[0] || 'Could not update handle';
      Alert.alert('Handle', message);
    }
  };

  const handleSettings = () => {
    navigation.navigate('Settings' as never);
  };

  const handleClose = () => {
    navigation.goBack();
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleSettings} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {user && (
          <>
            <View style={styles.profileSection}>
              <View 
                style={[
                  styles.avatar, 
                  { backgroundColor: user.avatar_color }
                ]} 
              />
              {editingHandle ? (
                <View style={styles.handleEditRow}>
                  <Text style={styles.handle}>@</Text>
                  <TextInput
                    style={[styles.handle, styles.handleInput]}
                    value={handleDraft}
                    onChangeText={setHandleDraft}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    onSubmitEditing={saveHandle}
                    returnKeyType="done"
                  />
                  <TouchableOpacity onPress={saveHandle} style={styles.handleSave}>
                    <Ionicons name="checkmark" size={22} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.handleEditRow}
                  onPress={() => { setHandleDraft(user.handle); setEditingHandle(true); }}
                >
                  <Text style={styles.handle}>@{user.handle}</Text>
                  <Ionicons name="pencil" size={16} color={Colors.secondary} style={{ marginLeft: 8, marginBottom: 8 }} />
                </TouchableOpacity>
              )}
              <Text style={styles.subtitle}>Your profile</Text>
            </View>

            <View style={styles.statsSection}>
              <Text style={styles.statLine}>
                {user.total_posts ?? 0} {(user.total_posts ?? 0) === 1 ? 'post' : 'posts'}
              </Text>
            </View>

            {/* Account Status section slimmed 2026-09-20: anonymous-mode and
                device-identity rows retired; only a live shadowban warning
                still earns the space */}
            {user.is_shadowbanned && (
              <View style={styles.infoSection}>
                <Text style={styles.sectionTitle}>ACCOUNT STATUS</Text>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoText, { color: Colors.error }]}>
                    Shadowbanned: {user.shadowban_reason}
                  </Text>
                </View>
              </View>
            )}

            {/* Signature customization parked 2026-09-20 (feature gated) */}
            {false && user && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>SIGNATURE</Text>
              <Text style={styles.signatureHint}>
                When you sign a post, your handle renders under it in this style.
              </Text>

              {/* Live preview */}
              <View style={styles.signaturePreview}>
                <Text
                  style={{
                    fontFamily: FontChoices[(user!.signature_font as FontChoice) || 'arial-black']?.fontFamily || 'ArialBlack',
                    fontWeight: (FontChoices[(user!.signature_font as FontChoice) || 'arial-black']?.fontWeight || 'normal') as any,
                    fontSize: 14,
                    color: user!.signature_color || Colors.primary,
                  }}
                >
                  @{user!.handle}
                </Text>
              </View>

              {/* Font choices */}
              <View style={styles.signatureRow}>
                {(Object.keys(FontChoices) as FontChoice[]).map(key => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.signatureOption,
                      (user!.signature_font || 'arial-black') === key && styles.signatureOptionActive,
                    ]}
                    onPress={() => updateSignature({ signature_font: key })}
                  >
                    <Text
                      style={{
                        fontFamily: FontChoices[key].fontFamily,
                        fontWeight: FontChoices[key].fontWeight as any,
                        color: Colors.primary,
                        fontSize: 13,
                      }}
                    >
                      Aa
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color choices: first swatch is auto-contrast */}
              <View style={styles.signatureRow}>
                {SIGNATURE_COLORS.map(color => (
                  <TouchableOpacity
                    key={color || 'auto'}
                    style={[
                      styles.signatureSwatch,
                      color ? { backgroundColor: color } : styles.signatureSwatchAuto,
                      (user!.signature_color || '') === color && styles.signatureOptionActive,
                    ]}
                    onPress={() => updateSignature({ signature_color: color })}
                  >
                    {!color && <Text style={styles.signatureAutoText}>A</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            )}

            <View style={styles.actionSection}>
              <TouchableOpacity style={styles.actionButton} onPress={handleSettings}>
                <Ionicons name="settings-outline" size={20} color={Colors.primary} />
                <Text style={styles.actionText}>Settings</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.secondary,
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
  },
  settingsButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    padding: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  handle: {
    fontSize: 24,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.secondary,
  },
  statLine: {
    fontSize: 16,
    color: Colors.secondary,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.surface,
  },
  statItem: {
    alignItems: 'center',
    marginHorizontal: 32,
  },
  statNumber: {
    fontSize: 24,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.secondary,
    marginTop: 4,
  },
  infoSection: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'ArialBlack',
    fontWeight: 'bold',
    letterSpacing: 1,
    color: Colors.primary,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoText: {
    fontSize: 16,
    color: Colors.primary,
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: Colors.secondary,
  },
  actionSection: {
    padding: 24,
  },
  handleEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handleInput: {
    minWidth: 120,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingVertical: 0,
  },
  handleSave: {
    marginLeft: 10,
    padding: 4,
  },
  signatureHint: {
    fontSize: 14,
    color: Colors.secondary,
    marginBottom: 12,
  },
  signaturePreview: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    marginBottom: 12,
  },
  signatureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  signatureOption: {
    width: 42,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signatureOptionActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  signatureSwatch: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signatureSwatchAuto: {
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signatureAutoText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.secondary,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  actionText: {
    fontSize: 16,
    color: Colors.primary,
    flex: 1,
  },
});
