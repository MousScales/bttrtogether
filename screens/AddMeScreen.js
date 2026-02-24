import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getAvatarDisplayUrl } from '../lib/supabase';

export default function AddMeScreen({ navigation, route }) {
  const { userId } = route.params || {};
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [alreadyFriends, setAlreadyFriends] = useState(false);
  const [alreadyRequested, setAlreadyRequested] = useState(false);
  const [isSelf, setIsSelf] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      if (userId === user.id) {
        setIsSelf(true);
        setLoading(false);
        return;
      }
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      if (!error && profileData) {
        setProfile(profileData);
        const { data: friendshipList } = await supabase
          .from('friends')
          .select('id')
          .or(`and(user_id.eq.${user.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${user.id})`)
          .limit(1);
        if (friendshipList && friendshipList.length > 0) setAlreadyFriends(true);
        else {
          const { data: request } = await supabase
            .from('friend_requests')
            .select('id, status')
            .eq('requester_id', user.id)
            .eq('recipient_id', userId)
            .eq('status', 'pending')
            .maybeSingle();
          if (request) setAlreadyRequested(true);
        }
      }
      setLoading(false);
    };
    fetchProfile();
  }, [userId]);

  const handleAddFriend = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to add friends.');
      return;
    }
    if (!userId) return;

    setAdding(true);
    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user.id,
          recipient_id: userId,
          status: 'pending',
        });

      if (error) {
        Alert.alert('Error', error.message || 'Could not send friend request.');
      } else {
        setAlreadyRequested(true);
        Alert.alert('Sent!', 'Friend request sent.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not send friend request.');
    } finally {
      setAdding(false);
    }
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.invalidText}>Invalid link.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isSelf) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.invalidText}>You can't add yourself.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.invalidText}>User not found.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyFriends) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.alreadyText}>You're already friends with {profile.name || 'this user'}.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyRequested) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.alreadyText}>Friend request already sent.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = profile?.name || profile?.username || 'this user';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={28} color="#888888" />
      </TouchableOpacity>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#ffffff" />
        ) : profile ? (
          <>
            <View style={styles.avatarWrap}>
              {getAvatarDisplayUrl(profile.avatar_url) ? (
                <Image
                  source={{ uri: getAvatarDisplayUrl(profile.avatar_url) }}
                  style={styles.avatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color="#666666" />
                </View>
              )}
            </View>
            <Text style={styles.title}>Add {displayName} as friend?</Text>
            <Text style={styles.subtitle}>@{profile.username || 'user'}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddFriend}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.addButtonText}>Add friend</Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  avatarWrap: {
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 32,
  },
  addButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  invalidText: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 24,
    textAlign: 'center',
  },
  alreadyText: {
    fontSize: 18,
    color: '#e0e0e0',
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
});
