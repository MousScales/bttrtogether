import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function JoinChallengeScreen({ navigation, route }) {
  const { goalListId } = route.params || {};
  const [goalList, setGoalList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);

  const [inviterName, setInviterName] = useState(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  useEffect(() => {
    if (!goalListId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchList = async () => {
      const { data, error } = await supabase
        .from('goal_lists')
        .select('id, name, type, user_id')
        .eq('id', goalListId)
        .maybeSingle();
      if (!error && data) {
        setGoalList(data);
        if (data.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', data.user_id)
            .maybeSingle();
          setInviterName(profile?.name || 'Someone');
        } else {
          setInviterName('Someone');
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: participant } = await supabase
            .from('group_goal_participants')
            .select('id')
            .eq('goal_list_id', goalListId)
            .eq('user_id', user.id)
            .maybeSingle();
          if (participant) setAlreadyJoined(true);
        }
      }
      setLoading(false);
    };
    fetchList();
  }, [goalListId]);

  const handleJoin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to join.');
      return;
    }
    if (!goalListId) return;

    setJoining(true);
    try {
      const { error } = await supabase
        .from('group_goal_participants')
        .upsert(
          { goal_list_id: goalListId, user_id: user.id, payment_status: 'pending' },
          { onConflict: 'goal_list_id,user_id' }
        );

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Already joined', 'You\'re already in this challenge.');
        } else {
          Alert.alert('Could not join', error.message || 'Try again.');
        }
        setJoining(false);
        return;
      }

      Alert.alert('You\'re in!', `You joined "${goalList?.name || 'the challenge'}". Check the Goals tab to see it.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not join.');
    } finally {
      setJoining(false);
    }
  };

  if (!goalListId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.invalidText}>Invalid invite link.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!goalList && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.invalidText}>Challenge not found or link expired.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyJoined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.alreadyJoinedText}>You've already joined this challenge.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={28} color="#888888" />
      </TouchableOpacity>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#ffffff" />
        ) : (
          <>
            <Text style={styles.inviteLine}>
              {inviterName || 'Someone'} invited you
            </Text>
            <Text style={styles.challengeName}>{goalList?.name || 'Challenge'}</Text>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={handleJoin}
              disabled={joining}
            >
              {joining ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.joinButtonText}>Join</Text>
              )}
            </TouchableOpacity>
          </>
        )}
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
  inviteLine: {
    fontSize: 22,
    fontWeight: '500',
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 28,
  },
  challengeName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 48,
    textAlign: 'center',
  },
  joinButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  joinButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  invalidText: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 24,
    textAlign: 'center',
  },
  alreadyJoinedText: {
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
