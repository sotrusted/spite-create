import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { User } from '../types';
import { api, endpoints } from '../config/api';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleSettings = () => {
    navigation.navigate('Settings' as never);
  };

  const handleClose = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleSettings} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={Colors.primary} />
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
              <Text style={styles.handle}>@{user.handle}</Text>
              <Text style={styles.subtitle}>Your TBD Profile</Text>
            </View>

            <View style={styles.statsSection}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{user.posts_count_today || 0}</Text>
                <Text style={styles.statLabel}>Posts Today</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{user.report_count || 0}</Text>
                <Text style={styles.statLabel}>Reports</Text>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Account Status</Text>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color={Colors.secondary} />
                <Text style={styles.infoText}>Anonymous Mode: {user.is_anonymous_mode ? 'On' : 'Off'}</Text>
              </View>
              {user.is_shadowbanned && (
                <View style={styles.infoRow}>
                  <Ionicons name="warning-outline" size={20} color={Colors.error} />
                  <Text style={[styles.infoText, { color: Colors.error }]}>
                    Account is shadowbanned: {user.shadowban_reason}
                  </Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.accent} />
                <Text style={styles.infoText}>Device-based identity for privacy</Text>
              </View>
            </View>

            <View style={styles.actionSection}>
              <TouchableOpacity style={styles.actionButton} onPress={handleSettings}>
                <Ionicons name="settings-outline" size={24} color={Colors.primary} />
                <Text style={styles.actionText}>Settings</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondary} />
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
    fontWeight: 'bold',
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
    borderRadius: 40,
    marginBottom: 16,
  },
  handle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
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
    fontWeight: 'bold',
    color: Colors.accent,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    color: Colors.secondary,
    marginLeft: 12,
    flex: 1,
  },
  actionSection: {
    padding: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  actionText: {
    fontSize: 16,
    color: Colors.primary,
    marginLeft: 12,
    flex: 1,
  },
});