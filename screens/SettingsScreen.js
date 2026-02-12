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
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

export default function SettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Profile fields
  const [userId, setUserId] = useState(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState(''); // Track original for validation
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState(''); // Track original email
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [localAvatarUri, setLocalAvatarUri] = useState(''); // For newly picked image

  // Preferences
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      setUserId(user.id);
      setEmail(user.email || '');
      setOriginalEmail(user.email || '');

      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, username, bio, avatar_url, notifications_enabled, theme')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      if (profile) {
        setName(profile.name || '');
        setUsername(profile.username || '');
        setOriginalUsername(profile.username || '');
        setBio(profile.bio || '');
        setAvatarUrl(profile.avatar_url || '');
        setNotificationsEnabled(profile.notifications_enabled ?? true);
        setTheme(profile.theme || 'dark');
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
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5, // Compress to reduce file size
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

      // Convert image to blob
      const response = await fetch(localAvatarUri);
      const blob = await response.blob();

      // Create file name
      const fileExt = localAvatarUri.split('.').pop();
      const fileName = `${userId}/avatar.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true, // Overwrite existing
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload avatar: ' + error.message);
      return null;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function checkUsernameUnique(newUsername) {
    if (newUsername === originalUsername) return true; // No change

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', newUsername)
        .limit(1);

      if (error) throw error;

      return data.length === 0; // True if no matches
    } catch (error) {
      console.error('Error checking username:', error);
      return false;
    }
  }

  async function handleSave() {
    try {
      setSaving(true);

      // Validation
      if (!name.trim()) {
        Alert.alert('Error', 'Name is required');
        return;
      }

      if (!username.trim()) {
        Alert.alert('Error', 'Username is required');
        return;
      }

      // Check username uniqueness
      if (username !== originalUsername) {
        const isUnique = await checkUsernameUnique(username);
        if (!isUnique) {
          Alert.alert('Error', 'Username is already taken');
          return;
        }
      }

      // Upload avatar if new image selected
      let newAvatarUrl = avatarUrl;
      if (localAvatarUri) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          newAvatarUrl = uploadedUrl;
        }
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          username: username.trim(),
          bio: bio.trim(),
          avatar_url: newAvatarUrl,
          notifications_enabled: notificationsEnabled,
          theme,
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Update email if changed
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

      // Update local state
      setAvatarUrl(newAvatarUrl);
      setLocalAvatarUri('');
      setOriginalUsername(username);
      if (email !== originalEmail && email.trim()) {
        setOriginalEmail(email);
      }
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
            await supabase.auth.signOut();
            // Navigation will be handled by auth state change in App.js
          } catch (error) {
            console.error('Error logging out:', error);
            Alert.alert('Error', 'Failed to logout');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const displayAvatar = localAvatarUri || avatarUrl;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.changeAvatarButton}
            onPress={pickImage}
            disabled={uploadingAvatar}
          >
            <Text style={styles.changeAvatarText}>
              {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#999"
          />
        </View>

        {/* Username */}
        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Your username"
            placeholderTextColor="#999"
            autoCapitalize="none"
          />
        </View>

        {/* Email */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Changing your email will send a verification email
          </Text>
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
          />
        </View>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Preferences</Text>

        {/* Notifications */}
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceLabel}>
            <Text style={styles.label}>Push Notifications</Text>
            <Text style={styles.hint}>Receive updates from friends</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={notificationsEnabled ? '#007AFF' : '#f4f3f4'}
          />
        </View>

        {/* Theme */}
        <View style={styles.field}>
          <Text style={styles.label}>Theme</Text>
          <View style={styles.themeToggle}>
            <TouchableOpacity
              style={[
                styles.themeButton,
                theme === 'dark' && styles.themeButtonActive,
              ]}
              onPress={() => setTheme('dark')}
            >
              <Text
                style={[
                  styles.themeButtonText,
                  theme === 'dark' && styles.themeButtonTextActive,
                ]}
              >
                Dark
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.themeButton,
                theme === 'light' && styles.themeButtonActive,
              ]}
              onPress={() => setTheme('light')}
            >
              <Text
                style={[
                  styles.themeButtonText,
                  theme === 'light' && styles.themeButtonTextActive,
                ]}
              >
                Light
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving || uploadingAvatar}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Changes</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  changeAvatarButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeAvatarText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  preferenceLabel: {
    flex: 1,
    marginRight: 20,
  },
  themeToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  themeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  themeButtonActive: {
    backgroundColor: '#007AFF',
  },
  themeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  themeButtonTextActive: {
    color: '#fff',
  },
  logoutButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff3b30',
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff3b30',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#999',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});
