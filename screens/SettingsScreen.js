import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, getAvatarDisplayUrl, getAvatarDisplayUrlAsync } from '../lib/supabase';
import { savePushTokenToProfile } from '../hooks/usePushNotifications';

/** Decode base64 to ArrayBuffer so Supabase gets real image bytes (fixes black/missing pfp in RN). */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
import { useRealtime } from '../hooks/useRealtime';

export default function SettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Profile fields
  const [userId, setUserId] = useState(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [localAvatarUri, setLocalAvatarUri] = useState('');
  const [resolvedAvatarUri, setResolvedAvatarUri] = useState('');

  // Preferences
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Which field is being edited (tap to edit)
  const [editingField, setEditingField] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  // Realtime: refetch profile when it changes (e.g. from another device)
  useRealtime(['profiles'], loadProfile, 'settings-screen');

  // Resolve avatar URL for display (signed URL works for private buckets)
  useEffect(() => {
    if (localAvatarUri) {
      setResolvedAvatarUri(localAvatarUri);
      return;
    }
    if (!avatarUrl) {
      setResolvedAvatarUri('');
      return;
    }
    let cancelled = false;
    getAvatarDisplayUrlAsync(avatarUrl).then((url) => {
      if (!cancelled && url) setResolvedAvatarUri(url);
      else if (!cancelled) setResolvedAvatarUri(getAvatarDisplayUrl(avatarUrl) || avatarUrl || '');
    }).catch(() => { if (!cancelled) setResolvedAvatarUri(getAvatarDisplayUrl(avatarUrl) || avatarUrl || ''); });
    return () => { cancelled = true; };
  }, [localAvatarUri, avatarUrl]);

  async function loadProfile() {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      setUserId(user.id);
      setEmail(user.email || '');
      setOriginalEmail(user.email || '');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, username, avatar_url, notifications_enabled')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      if (profile) {
        setName(profile.name || '');
        setUsername(profile.username || '');
        setOriginalUsername(profile.username || '');
        setAvatarUrl(profile.avatar_url || '');
        setNotificationsEnabled(profile.notifications_enabled ?? true);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0]) {
        setLocalAvatarUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  }

  async function uploadAvatar() {
    if (!localAvatarUri || !userId) return null;

    try {
      setUploadingAvatar(true);

      // Read file as base64 then ArrayBuffer (fetch+blob fails for file:// in React Native and can produce black/broken images)
      const base64 = await FileSystem.readAsStringAsync(localAvatarUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64) throw new Error('Could not read image file');
      const arrayBuffer = base64ToArrayBuffer(base64);

      const rawExt = (localAvatarUri.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase().replace(/[^a-z0-9]/gi, '') || 'jpg';
      const fileExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(rawExt) ? rawExt : 'jpg';
      const fileName = `${userId}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          cacheControl: '3600',
          upsert: true,
          contentType,
        });

      if (uploadError) throw uploadError;

      // Return storage path so we can use signed URLs for display (works when bucket is private)
      return fileName;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload avatar: ' + (error.message || 'Unknown error'));
      return null;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function checkUsernameUnique(newUsername) {
    if (newUsername === originalUsername) return true;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', newUsername)
        .limit(1);

      if (error) throw error;
      return data.length === 0;
    } catch (error) {
      console.error('Error checking username:', error);
      return false;
    }
  }

  async function handleSave() {
    try {
      setSaving(true);

      if (!name.trim()) {
        Alert.alert('Error', 'Name is required');
        return;
      }

      if (!username.trim()) {
        Alert.alert('Error', 'Username is required');
        return;
      }

      if (username !== originalUsername) {
        const isUnique = await checkUsernameUnique(username);
        if (!isUnique) {
          Alert.alert('Error', 'Username is already taken');
          return;
        }
      }

      let newAvatarUrl = avatarUrl;
      if (localAvatarUri) {
        const uploadedUrl = await uploadAvatar();
        if (!uploadedUrl) {
          // Upload failed; keep showing the picked image and don't overwrite profile avatar
          setSaving(false);
          return;
        }
        newAvatarUrl = uploadedUrl;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          username: username.trim(),
          avatar_url: newAvatarUrl,
          notifications_enabled: notificationsEnabled,
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      if (!notificationsEnabled) await savePushTokenToProfile(null);

      if (email !== originalEmail && email.trim()) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email.trim(),
        });
        if (emailError) throw emailError;
        Alert.alert(
          'Success',
          'Profile updated! A verification email has been sent to your new email address.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Success', 'Profile updated!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }

      setAvatarUrl(newAvatarUrl);
      setLocalAvatarUri(''); // Only clear after successful save so pfp doesn't disappear on upload failure
      setOriginalUsername(username);
      if (email !== originalEmail && email.trim()) setOriginalEmail(email);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await savePushTokenToProfile(null);
            await supabase.auth.signOut();
          } catch (error) {
            console.error('Error logging out:', error);
            Alert.alert('Error', 'Failed to logout');
          }
        },
      },
    ]);
  }

  const displayAvatar = localAvatarUri || resolvedAvatarUri || getAvatarDisplayUrl(avatarUrl) || avatarUrl;

  const renderRow = (label, value, fieldKey) => {
    const isEditing = editingField === fieldKey;
    return (
      <TouchableOpacity
        key={fieldKey}
        style={styles.row}
        onPress={() => setEditingField(isEditing ? null : fieldKey)}
        activeOpacity={0.7}
      >
        <Text style={styles.rowLabel}>{label}</Text>
        {isEditing ? (
          <TextInput
            style={styles.rowInput}
            value={fieldKey === 'name' ? name : fieldKey === 'username' ? username : email}
            onChangeText={fieldKey === 'name' ? setName : fieldKey === 'username' ? setUsername : setEmail}
            placeholder={fieldKey === 'name' ? 'Your name' : fieldKey === 'username' ? 'username' : 'your@email.com'}
            placeholderTextColor="#666666"
            autoCapitalize={fieldKey === 'name' ? 'words' : 'none'}
            keyboardType={fieldKey === 'email' ? 'email-address' : 'default'}
            autoFocus
            onBlur={() => setEditingField(null)}
          />
        ) : (
          <Text style={styles.rowValue} numberOfLines={1}>
            {fieldKey === 'name' ? (name || '') : fieldKey === 'username' ? (username ? `@${username}` : '') : (email || '')}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Big profile photo */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={pickImage}
            disabled={uploadingAvatar}
            style={styles.bigAvatarWrap}
            activeOpacity={0.8}
          >
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.bigAvatar} />
            ) : (
              <View style={styles.bigAvatarPlaceholder}>
                <Text style={styles.bigAvatarInitial}>
                  {name.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickImage}
            disabled={uploadingAvatar}
            style={styles.changePhotoLink}
          >
            <Text style={styles.changePhotoLinkText}>
              {uploadingAvatar ? 'Uploading...' : 'Change photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Underlined rows - tap to edit */}
        <View style={styles.rowsBlock}>
          {renderRow('Name', name, 'name')}
          {renderRow('Username', username, 'username')}
          {renderRow('Email', email, 'email')}
        </View>

        {/* Notifications - underlined row */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#333333', true: '#34C759' }}
            thumbColor="#ffffff"
          />
        </View>

        {/* Log out - underlined row */}
        <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutLabel}>Log out</Text>
          <Ionicons name="chevron-forward" size={20} color="#ff4444" />
        </TouchableOpacity>

        {/* Save - minimal underline style */}
        <TouchableOpacity
          style={[styles.saveButton, (saving || uploadingAvatar) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || uploadingAvatar}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={[styles.saveButtonText, (saving || uploadingAvatar) && styles.saveButtonTextDisabled]}>
              Save changes
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerRight: {
    width: 44,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  bigAvatarWrap: {
    marginBottom: 12,
  },
  bigAvatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#1a1a1a',
  },
  bigAvatarPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#333333',
  },
  bigAvatarInitial: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
  },
  changePhotoLink: {
    paddingVertical: 4,
  },
  changePhotoLinkText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  rowsBlock: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  rowValue: {
    fontSize: 16,
    color: '#888888',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  rowInput: {
    fontSize: 16,
    color: '#ffffff',
    padding: 0,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
    minWidth: 120,
  },
  logoutLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ff4444',
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textDecorationLine: 'underline',
  },
  saveButtonTextDisabled: {
    color: '#888888',
  },
  bottomSpacer: {
    height: 40,
  },
});
