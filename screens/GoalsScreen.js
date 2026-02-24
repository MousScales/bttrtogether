import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Animated, TextInput, Image, Alert, Dimensions, RefreshControl, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { Video, ResizeMode } from 'expo-av';
import { Asset } from 'expo-asset';
import { supabase, getAvatarDisplayUrl, getProofDisplayUrl, getProofDisplayUrlAsync } from '../lib/supabase';
import { getInviteWebBaseUrl } from '../lib/config';
import { useRealtime } from '../hooks/useRealtime';

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|m4v|avi)(\?|$)/i;
function isVideoProofUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return VIDEO_EXTENSIONS.test(url.split('?')[0]);
}

// Generate completion history based on goal creation date
// Returns array where index 0 is the creation day, and we show future days
function generateCompletionHistory(goalCreatedAt) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const createdDate = new Date(goalCreatedAt);
  createdDate.setHours(0, 0, 0, 0);
  
  // Calculate days since creation (0 = creation day, 1 = day after, etc.)
  const daysSinceCreation = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
  
  // Show 28 boxes total (creation day + 27 future days)
  const totalDays = 28;
  
  return Array.from({ length: totalDays }, (_, index) => {
    if (index < daysSinceCreation) {
      // Past days - show as not completed (false) for now
      // TODO: Load actual completion history from database
      return false;
    } else if (index === daysSinceCreation) {
      // Today - return current completion status (will be set from goal.completed)
      return null; // Will be set based on goal.completed
    } else {
      // Future days
      return null;
    }
  });
}

// Get the current day index (0 = creation day)
function getCurrentDayIndex(goalCreatedAt) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const createdDate = new Date(goalCreatedAt);
  createdDate.setHours(0, 0, 0, 0);
  
  return Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
}

/** True if a group goal is considered complete: more than 50% of participants validated at least one post. */
function isGroupGoalComplete(item) {
  if (item?.goal_list_type !== 'group') return false;
  if (item.todayCompletions?.length > 0) {
    return item.todayCompletions.some(p => p.totalValidators > 0 && p.validatedCount >= p.totalValidators / 2);
  }
  return (item.totalViewers ?? 0) > 0 && (item.validated ?? 0) >= item.totalViewers / 2;
}

/** Placeholder when proof image/video is missing or failed to load. */
function ProofPlaceholder({ style }) {
  return (
    <View style={[style, styles.proofPlaceholder]}>
      <Ionicons name="image-outline" size={48} color="#666666" />
      <Text style={styles.proofPlaceholderText}>Photo or video</Text>
    </View>
  );
}

/** Renders proof image with natural aspect ratio (portrait or landscape). */
function ProofImage({ proofUrl, style, displayUri, onError, onLoad }) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const handleLoad = (e) => {
    const { width, height } = e?.nativeEvent?.source || {};
    if (width && height && height > 0) {
      setAspectRatio(width / height);
    }
    onLoad?.();
  };

  if (!displayUri) return null;
  return (
    <View style={[styles.proofMediaContainer, style]}>
      <Image
        source={{ uri: displayUri }}
        style={[styles.proofImageNatural, { aspectRatio }]}
        resizeMode="contain"
        onError={onError}
        onLoad={handleLoad}
      />
    </View>
  );
}

/** Renders proof video (expo-av). */
function ProofVideo({ displayUri, style, onError }) {
  const videoRef = useRef(null);
  if (!displayUri) return null;
  return (
    <View style={[styles.proofMediaContainer, styles.proofVideoContainer, style]}>
      <Video
        ref={videoRef}
        source={{ uri: displayUri }}
        style={styles.proofVideo}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        onError={onError}
        shouldPlay={false}
      />
    </View>
  );
}

/** Resolves URL and renders image; respects original orientation (portrait/landscape). */
function ProofMedia({ proofUrl, style }) {
  const isFullUrl = proofUrl && typeof proofUrl === 'string' && (proofUrl.startsWith('http://') || proofUrl.startsWith('https://'));
  const initialUri = proofUrl && (isFullUrl ? proofUrl : getProofDisplayUrl(proofUrl));
  const [uri, setUri] = useState(initialUri || null);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    if (!proofUrl) {
      setUri(null);
      setFailed(false);
      setRetried(false);
      return;
    }
    setFailed(false);
    setRetried(false);
    const next = isFullUrl ? proofUrl : (getProofDisplayUrl(proofUrl) || proofUrl);
    setUri(next);
  }, [proofUrl]);

  const handleError = () => {
    if (retried) {
      setFailed(true);
      return;
    }
    setRetried(true);
    getProofDisplayUrlAsync(proofUrl)
      .then((signedUrl) => {
        if (signedUrl && signedUrl !== uri) {
          setFailed(false);
          setUri(signedUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  };

  if (!proofUrl) return <ProofPlaceholder style={style} />;
  if (failed || !uri) return <ProofPlaceholder style={style} />;

  if (isVideoProofUrl(proofUrl) || isVideoProofUrl(uri)) {
    return (
      <ProofVideo
        displayUri={uri}
        style={style}
        onError={handleError}
      />
    );
  }

  return (
    <ProofImage
      proofUrl={proofUrl}
      style={style}
      displayUri={uri}
      onError={handleError}
      onLoad={() => setFailed(false)}
    />
  );
}

export default function GoalsScreen({ navigation }) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [addGoalModalVisible, setAddGoalModalVisible] = useState(false);
  const [editGoalModalVisible, setEditGoalModalVisible] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [newGoalName, setNewGoalName] = useState('');
  const [timeRemainingDay, setTimeRemainingDay] = useState('');
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState([]);
  const [goalLists, setGoalLists] = useState([]);
  const [currentGoalList, setCurrentGoalList] = useState(null);
  const [ownerHasPaid, setOwnerHasPaid] = useState(true); // Track if owner has paid
  const [ownerPaidViaStripe, setOwnerPaidViaStripe] = useState(false); // Track if owner paid via Stripe
  const [participants, setParticipants] = useState([]); // Track all participants
  const [allParticipantsPaid, setAllParticipantsPaid] = useState(true); // Track if all participants paid
  const [currentUserProfile, setCurrentUserProfile] = useState(null); // Current user's profile from Supabase
  const [currentUser, setCurrentUser] = useState(null); // Current user from auth
  const [availableFriends, setAvailableFriends] = useState([]); // All available friends to add
  const [friendsSearchQuery, setFriendsSearchQuery] = useState(''); // Search query for friends
  const [friendsSearchResults, setFriendsSearchResults] = useState([]); // Search results
  const [searchingFriends, setSearchingFriends] = useState(false); // Loading state for search
  const [switchingGoal, setSwitchingGoal] = useState(false); // Loading state for goal switching
  const [refreshing, setRefreshing] = useState(false); // Pull-to-refresh
  const [hasPersonalGoals, setHasPersonalGoals] = useState(false); // Track if current user has personal goals
  const [groupGoals, setGroupGoals] = useState([]); // Group goals for the current goal list
  const [participantPersonalGoals, setParticipantPersonalGoals] = useState({}); // { userId: [goals] }
  const [goalListStarted, setGoalListStarted] = useState(false); // Track if goal list has been started
  const [declaredWinnerId, setDeclaredWinnerId] = useState(null); // winner_id from goal_lists
  const [declaredTieWinnerIds, setDeclaredTieWinnerIds] = useState(null); // tie_winner_ids when tie
  const [friendActivityModalVisible, setFriendActivityModalVisible] = useState(false);
  const [selectedFriendActivity, setSelectedFriendActivity] = useState(null); // { friend, completions[], validations[] }
  const [loadingFriendActivity, setLoadingFriendActivity] = useState(false);

  // Ref so loadGoals (from Realtime/focus) always uses latest selection and never overwrites a user switch
  const currentGoalListRef = React.useRef(null);
  currentGoalListRef.current = currentGoalList;
  
  // Deadline - set to February 15, 2026 for example
  const deadline = new Date('2026-02-15T23:59:59');
  
  // Load current user on mount
  useEffect(() => {
    const loadCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    loadCurrentUser();
  }, []);

  // Load goals from Supabase
  useEffect(() => {
    loadGoals();
  }, []);

  // Reload goals when screen comes into focus (e.g. after adding a post) — not when only switching lists
  useFocusEffect(
    React.useCallback(() => {
      loadGoals();
      const list = currentGoalListRef.current;
      if (list) checkOwnerPaymentStatus();
    }, []) // empty deps: run only on focus, so switching lists won't re-trigger and overwrite selection
  );

  // Realtime: refetch when goals, lists, participants, completions, validations or payments change
  useRealtime(
    ['goal_lists', 'goals', 'group_goal_participants', 'goal_completions', 'goal_validations', 'payments'],
    async () => {
      await loadGoals();
      await checkOwnerPaymentStatus();
      await loadGroupGoals();
    },
    'goals-screen'
  );

  // Reload goals when current goal list changes
  useEffect(() => {
    if (currentGoalList) {
      // Restore started state from the DB column (persists across reloads)
      setGoalListStarted(!!currentGoalList.started_at);

      setSwitchingGoal(true);
      Promise.all([
        loadGoalsForCurrentList(),
        checkOwnerPaymentStatus(),
        loadGroupGoals()
      ]).finally(() => {
        setSwitchingGoal(false);
      });
    }
  }, [currentGoalList?.id]);

  // Load available friends when participants change
  useEffect(() => {
    if (currentGoalList && currentUser) {
      loadAvailableFriends();
    }
  }, [currentGoalList, currentUser, participants.length]);
  
  // Refresh payment status periodically for group goals
  useEffect(() => {
    if (!currentGoalList || currentGoalList.type !== 'group') {
      return;
    }
    
    // Refresh payment status every 5 seconds for group goals
    const interval = setInterval(() => {
      checkOwnerPaymentStatus();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [currentGoalList]);

  // Load available friends (include all friends, mark participants as "already added")
  const loadAvailableFriends = async () => {
    if (!currentGoalList || !currentUser) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get existing participant IDs
      const existingParticipantIds = participants.map(p => p.user_id);

      // Load only accepted friends (bidirectional)
      const { data: friendships, error: friendshipsError } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (friendshipsError) {
        console.error('Error loading friendships:', friendshipsError);
        setAvailableFriends([]);
        return;
      }

      // Extract friend IDs (bidirectional)
      const friendIds = friendships
        .map(f => f.user_id === user.id ? f.friend_id : f.user_id);

      if (friendIds.length === 0) {
        setAvailableFriends([]);
        return;
      }

      // Load friend profiles
      const { data: friendsData, error: friendsError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', friendIds);

      if (friendsError) {
        console.error('Error loading friend profiles:', friendsError);
        setAvailableFriends([]);
      } else {
        // Mark friends who are already participants
        const friendsWithStatus = (friendsData || []).map(friend => ({
          ...friend,
          isAlreadyAdded: existingParticipantIds.includes(friend.id),
        }));
        setAvailableFriends(friendsWithStatus);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
      setAvailableFriends([]);
    }
  };

  // Search friends
  const searchFriends = async (query) => {
    if (!query.trim()) {
      setFriendsSearchResults([]);
      return;
    }

    setSearchingFriends(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get existing participant IDs
      const existingParticipantIds = participants.map(p => p.user_id);
      const allParticipantIds = [...existingParticipantIds, user.id];

      // First search all users
      const { data: allUsers, error: searchError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
        .neq('id', user.id)
        .limit(50);

      if (searchError) {
        console.error('Error searching users:', searchError);
        setFriendsSearchResults([]);
        return;
      }

      // Filter to only show accepted friends (bidirectional)
      const { data: friendships } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      const friendIds = friendships?.map(f => f.user_id === user.id ? f.friend_id : f.user_id) || [];
      
      // Filter results to only include friends (include participants but mark them)
      const filtered = (allUsers || []).filter(user => 
        friendIds.includes(user.id)
      ).map(friend => ({
        ...friend,
        isAlreadyAdded: allParticipantIds.includes(friend.id),
      }));
      
      setFriendsSearchResults(filtered);
    } catch (error) {
      console.error('Error searching friends:', error);
    } finally {
      setSearchingFriends(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (friendsSearchQuery.trim()) {
        searchFriends(friendsSearchQuery);
      } else {
        setFriendsSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [friendsSearchQuery]);

  // Send friend request (instead of directly adding)
  // Handle starting the goal list
  const handleStartGoalList = async () => {
    if (!currentGoalList || !allParticipantsPaid) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (currentGoalList.user_id !== user.id) {
        Alert.alert('Error', 'Only the goal list creator can start the challenge');
        return;
      }

      const now = new Date().toISOString();

      // Persist started_at so the challenge stays started across reloads
      const { error: updateError } = await supabase
        .from('goal_lists')
        .update({ started_at: now, all_paid: true })
        .eq('id', currentGoalList.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Reflect the change immediately in local state
      setGoalListStarted(true);
      setCurrentGoalList(prev => ({ ...prev, started_at: now, all_paid: true }));

      Alert.alert('Challenge Started! 🚀', 'All participants can now track their progress.');

      await loadGoalsForCurrentList();
      await checkOwnerPaymentStatus();
    } catch (error) {
      console.error('Error starting goal list:', error);
      Alert.alert('Error', 'Failed to start challenge. Please try again.');
    }
  };

  const handleRemoveParticipant = async (participant) => {
    if (!currentGoalList || !currentUser || currentGoalList.user_id !== currentUser.id || goalListStarted) return;
    if (participant.user_id === currentUser.id) return; // don't remove self

    const name = participant.profile?.name || 'This person';
    Alert.alert(
      'Remove from list',
      `Remove ${name} from this goal list? They will need to be re-added to join again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('group_goal_participants')
                .delete()
                .eq('goal_list_id', currentGoalList.id)
                .eq('user_id', participant.user_id);

              if (error) {
                console.error('Error removing participant:', error);
                Alert.alert('Error', 'Could not remove them. Run fix_group_goal_participants_delete_rls.sql in Supabase (SQL Editor).');
              } else {
                await checkOwnerPaymentStatus();
                await loadGroupGoals();
                await loadGoalsForCurrentList();
                Alert.alert('Removed', `${name} has been removed from the list.`);
              }
            } catch (e) {
              console.error('Error removing participant:', e);
              Alert.alert('Error', 'Something went wrong.');
            }
          },
        },
      ]
    );
  };

  const handleAddFriendToGoal = async (friend) => {
    if (!currentGoalList || !currentUser) return;

    try {
      // Check if already friends (bidirectional)
      const { data: friendshipCheck } = await supabase
        .from('friends')
        .select('id, user_id, friend_id')
        .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${currentUser.id})`)
        .limit(1);

      const isFriend = friendshipCheck && friendshipCheck.length > 0;

      if (isFriend) {
        // Already friends, add directly to goal
        const { error } = await supabase
          .from('group_goal_participants')
          .insert({
            goal_list_id: currentGoalList.id,
            user_id: friend.id,
            payment_status: 'pending',
          });

        if (error) {
          console.error('Error adding friend:', error);
          Alert.alert('Error', 'Failed to add friend to goal');
        } else {
          Alert.alert('Success', 'Friend added to goal!');
          await checkOwnerPaymentStatus();
          await loadAvailableFriends();
          setFriendsSearchQuery('');
          setFriendsSearchResults([]);
        }
      } else {
        // Check if friend request already exists (bidirectional)
        const { data: existingRequests } = await supabase
          .from('friend_requests')
          .select('id, status, requester_id, recipient_id')
          .or(`and(requester_id.eq.${currentUser.id},recipient_id.eq.${friend.id}),and(requester_id.eq.${friend.id},recipient_id.eq.${currentUser.id})`)
          .limit(1);

        const existingRequest = existingRequests && existingRequests.length > 0 ? existingRequests[0] : null;

        if (existingRequest) {
          if (existingRequest.status === 'pending') {
            Alert.alert('Friend Request', 'Friend request already sent!');
          } else if (existingRequest.status === 'accepted') {
            Alert.alert('Info', 'You are already friends!');
          } else {
            // Request was declined, update it back to pending
            const { error } = await supabase
              .from('friend_requests')
              .update({
                status: 'pending',
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingRequest.id);

            if (error) {
              console.error('Error resending friend request:', error);
              Alert.alert('Error', 'Failed to send friend request');
            } else {
              Alert.alert('Success', 'Friend request sent! They will see it in their profile.');
              await loadAvailableFriends();
              setFriendsSearchQuery('');
              setFriendsSearchResults([]);
            }
          }
        } else {
          // Send new friend request
          const { error } = await supabase
            .from('friend_requests')
            .insert({
              requester_id: currentUser.id,
              recipient_id: friend.id,
              status: 'pending',
            });

          if (error) {
            console.error('Error sending friend request:', error);
            Alert.alert('Error', 'Failed to send friend request');
          } else {
            Alert.alert('Success', 'Friend request sent! They will see it in their profile.');
            await loadAvailableFriends();
            setFriendsSearchQuery('');
            setFriendsSearchResults([]);
          }
        }
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to send friend request');
    }
  };
  
  const checkOwnerPaymentStatus = async () => {
    if (!currentGoalList) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Set current user state
      setCurrentUser(user);

      // Fetch current user's profile from Supabase
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .eq('id', user.id)
        .single();
      setCurrentUserProfile(profile || null);

      // Check if owner has paid for group goals
      if (currentGoalList.type === 'group') {
        // Prefer fresh DB row for winner/tie/started; fall back to currentGoalList (we already have it from loadGoals)
        const { data: goalListCheck } = await supabase
          .from('goal_lists')
          .select('user_id, winner_id, tie_winner_ids, started_at')
          .eq('id', currentGoalList.id)
          .single();

        const source = goalListCheck ?? currentGoalList;

        // Sync declared winner / tie and started state from DB or from list we already have
        if (source?.tie_winner_ids?.length > 1) {
          setDeclaredTieWinnerIds(source.tie_winner_ids);
          setDeclaredWinnerId(null);
        } else if (source?.winner_id) {
          setDeclaredWinnerId(source.winner_id);
          setDeclaredTieWinnerIds(null);
        } else {
          setDeclaredWinnerId(null);
          setDeclaredTieWinnerIds(null);
        }
        if (source?.started_at) {
          setGoalListStarted(true);
        }

        // Check if user is owner or participant (use source so we work when direct query returns no row, e.g. RLS/timing)
        const isOwner = source?.user_id === user.id;
        const { data: participantCheck } = await supabase
          .from('group_goal_participants')
          .select('id')
          .eq('goal_list_id', currentGoalList.id)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!isOwner && !participantCheck) {
          console.error('User does not have access to this goal list');
          return;
        }
        
        // Load all participants with their payment status
        const { data: participantsData, error: participantsError } = await supabase
          .from('group_goal_participants')
          .select('*')
          .eq('goal_list_id', currentGoalList.id);

        if (participantsError) {
          console.error('Error loading participants:', participantsError);
        }
        
        // Always include the creator (owner) even if not in participants table
        const creatorId = currentGoalList.user_id;
        
        if (!creatorId) {
          console.error('Goal list has no user_id:', currentGoalList);
          return;
        }
        
        const creatorInParticipants = (participantsData || [])?.find(p => p.user_id === creatorId);
        
        let allParticipantsList = [...(participantsData || [])];
        
        // If creator is not in participants, add them and check their payment status
        if (!creatorInParticipants && creatorId) {
          // Load creator's profile
          const { data: creatorProfile, error: creatorProfileError } = await supabase
            .from('profiles')
            .select('id, name, username, avatar_url')
            .eq('id', creatorId)
            .single();
          
          if (creatorProfileError) {
            console.error('Error loading creator profile:', creatorProfileError);
          }
          
          // Check creator's payment status
          let creatorPaymentStatus = 'pending';
          if (currentGoalList.consequence_type === 'money') {
            // Check if creator has a successful payment
            const { data: creatorPayment } = await supabase
              .from('payments')
              .select('status')
              .eq('goal_list_id', currentGoalList.id)
              .eq('user_id', creatorId)
              .eq('status', 'succeeded')
              .maybeSingle();
            
            if (creatorPayment) {
              creatorPaymentStatus = 'paid';
            }
          } else {
            // For punishment goals, check if creator accepted
            const { data: creatorParticipant } = await supabase
              .from('group_goal_participants')
              .select('payment_status')
              .eq('goal_list_id', currentGoalList.id)
              .eq('user_id', creatorId)
              .maybeSingle();
            
            if (creatorParticipant) {
              creatorPaymentStatus = creatorParticipant.payment_status;
            }
          }
          
          allParticipantsList.unshift({
            id: `creator-${creatorId}`,
            user_id: creatorId,
            goal_list_id: currentGoalList.id,
            payment_status: creatorPaymentStatus,
            profile: creatorProfile || null,
          });
        }
        
        console.log('All participants list:', allParticipantsList.length, 'Creator ID:', creatorId);
        
        if (allParticipantsList.length > 0) {
          // Load profile data for each participant
          const participantsWithProfiles = await Promise.all(
            allParticipantsList.map(async (participant) => {
              // If profile is already loaded (for creator), use it
              if (participant.profile) {
                return participant;
              }
              
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, name, username, avatar_url')
                .eq('id', participant.user_id)
                .single();
              
              return {
                ...participant,
                profile: profile || null,
              };
            })
          );
          
          setParticipants(participantsWithProfiles);
          
          // Check if all participants have paid
          const allPaid = participantsWithProfiles.every(p => p.payment_status === 'paid');
          setAllParticipantsPaid(allPaid);
          
          // Check if current user has paid
          const currentUserParticipant = participantsWithProfiles.find(p => p.user_id === user.id);
          const hasPaid = currentUserParticipant?.payment_status === 'paid';
          setOwnerHasPaid(hasPaid);
          
          // Check if user paid via Stripe (only for money goals)
          if (hasPaid && currentGoalList.consequence_type === 'money') {
            const { data: paymentRecord } = await supabase
              .from('payments')
              .select('stripe_payment_intent_id')
              .eq('goal_list_id', currentGoalList.id)
              .eq('user_id', user.id)
              .eq('status', 'succeeded')
              .single();
            
            setOwnerPaidViaStripe(!!paymentRecord?.stripe_payment_intent_id);
          } else {
            setOwnerPaidViaStripe(false);
          }
        } else {
          // No participants yet, but still show the creator
          console.log('No participants found, loading creator profile for:', creatorId);
          const { data: creatorProfile, error: creatorProfileError } = await supabase
            .from('profiles')
            .select('id, name, username, avatar_url')
            .eq('id', creatorId)
            .single();
          
          if (creatorProfileError) {
            console.error('Error loading creator profile in else block:', creatorProfileError);
          }
          
          const creatorParticipant = {
            id: `creator-${creatorId}`,
            user_id: creatorId,
            goal_list_id: currentGoalList.id,
            payment_status: 'pending',
            profile: creatorProfile || null,
          };
          
          console.log('Setting participants with creator:', creatorParticipant);
          setParticipants([creatorParticipant]);
          setOwnerHasPaid(false);
          setAllParticipantsPaid(false);
          setOwnerPaidViaStripe(false);
        }
        
        // Check if current user has personal goals for this goal list
        const { data: personalGoalsData } = await supabase
          .from('goals')
          .select('id')
          .eq('goal_list_id', currentGoalList.id)
          .eq('user_id', user.id)
          .eq('goal_type', 'personal')
          .limit(1);
        
        setHasPersonalGoals((personalGoalsData || []).length > 0);
      } else {
        setOwnerHasPaid(true); // Personal goals don't need payment
        setAllParticipantsPaid(true);
        setParticipants([]);
        setHasPersonalGoals(false);
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    }
  };

  // Load creator's group goal titles for overlay; participants don't have their own group goal rows
  const loadGroupGoals = async () => {
    if (!currentGoalList) return;
    
    try {
      let ownerId = currentGoalList.user_id;
      if (!ownerId && currentGoalList.type === 'group') {
        const { data: listRow } = await supabase.from('goal_lists').select('user_id').eq('id', currentGoalList.id).single();
        ownerId = listRow?.user_id;
      }
      if (!ownerId) {
        setGroupGoals([]);
      } else {
        const { data: groupGoalsData, error } = await supabase
          .from('goals')
          .select('title, created_at')
          .eq('goal_list_id', currentGoalList.id)
          .eq('user_id', ownerId)
          .eq('goal_type', 'group')
          .order('created_at', { ascending: true });
        if (error) {
          setGroupGoals([]);
        } else {
          const uniqueGroupGoals = (groupGoalsData || []).map(g => g.title);
          setGroupGoals(uniqueGroupGoals);
        }
      }

      // Load personal goals for all participants
      const { data: personalGoalsData, error: personalError } = await supabase
        .from('goals')
        .select('user_id, title')
        .eq('goal_list_id', currentGoalList.id)
        .eq('goal_type', 'personal')
        .order('created_at', { ascending: true });

      if (personalError) {
        console.error('Error loading personal goals:', personalError);
        setParticipantPersonalGoals({});
      } else {
        // Group personal goals by user_id
        const goalsByUser = {};
        personalGoalsData?.forEach(goal => {
          if (!goalsByUser[goal.user_id]) {
            goalsByUser[goal.user_id] = [];
          }
          goalsByUser[goal.user_id].push(goal.title);
        });
        setParticipantPersonalGoals(goalsByUser);
      }
    } catch (error) {
      console.error('Error loading goals:', error);
      setGroupGoals([]);
      setParticipantPersonalGoals({});
    }
  };

  const loadGoalsForCurrentList = async (overrideList) => {
    const list = overrideList ?? currentGoalList;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && list) {
        // Use started_at already on the list object — avoids an extra DB query that
        // participants can't execute (goal_lists SELECT RLS only allows owners).
        let isStarted = false;
        if (list.type === 'group') {
          isStarted = !!list.started_at;
        }
        
        let data;
        let allParticipantsGoals = [];
        
        if (isStarted && list.type === 'group') {
          // Shared group goals: load creator's group goals + current user's personal goals only (any participant can complete group goals)
          let ownerId = list.user_id;
          if (!ownerId) {
          const { data: listRow } = await supabase
            .from('goal_lists')
            .select('user_id')
            .eq('id', list.id)
            .single();
          ownerId = listRow?.user_id;
        }
        const { data: creatorGroupGoals, error: groupError } = await supabase
          .from('goals')
          .select('*')
          .eq('goal_list_id', list.id)
          .eq('user_id', ownerId)
          .eq('goal_type', 'group')
          .order('created_at', { ascending: true });
        if (groupError) throw groupError;
        const { data: myPersonalGoals, error: personalError } = await supabase
          .from('goals')
          .select('*')
          .eq('goal_list_id', list.id)
          .eq('user_id', user.id)
          .eq('goal_type', 'personal')
          .order('created_at', { ascending: true });
          if (personalError) throw personalError;
          // Other participants' personal goals (weave in read-only with status)
          const { data: participantsData } = await supabase.from('group_goal_participants').select('user_id').eq('goal_list_id', list.id);
          const participantIds = [ownerId, ...(participantsData || []).map(p => p.user_id)];
          const otherParticipantIds = [...new Set(participantIds)].filter(id => id !== user.id);
          let otherPersonalGoals = [];
          if (otherParticipantIds.length > 0) {
            const { data: otherGoals } = await supabase
              .from('goals')
              .select('*')
              .eq('goal_list_id', list.id)
              .eq('goal_type', 'personal')
              .in('user_id', otherParticipantIds)
              .order('created_at', { ascending: true });
            otherPersonalGoals = otherGoals || [];
          }
          data = [...(creatorGroupGoals || []), ...(myPersonalGoals || []), ...otherPersonalGoals];
          data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          allParticipantsGoals = data;
        } else {
          // For non-started or personal: load current user's goals
          const { data: userGoalsData, error: userGoalsError } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_list_id', list.id)
            .order('created_at', { ascending: true });
          
          if (userGoalsError) throw userGoalsError;
          const userGoals = userGoalsData || [];

          // For group lists, show owner's group goals to participants so they see the challenge
          const isParticipantOnGroupList = list.type === 'group' && list.user_id !== user.id;
          if (isParticipantOnGroupList) {
            // 1) Load owner's goals with goal_type = 'group'
            const { data: ownerGroupGoalsData, error: ownerGoalsError } = await supabase
              .from('goals')
              .select('*')
              .eq('goal_list_id', list.id)
              .eq('user_id', list.user_id)
              .eq('goal_type', 'group')
              .order('created_at', { ascending: true });
            if (ownerGoalsError) {
              console.warn('Could not load owner group goals for participant:', ownerGoalsError.message);
            }
            let ownerGroupGoals = ownerGroupGoalsData || [];
            // 2) Fallback: all group goals in this list (any user), dedupe by title
            if (ownerGroupGoals.length === 0) {
              const { data: allGroupGoalsData } = await supabase
                .from('goals')
                .select('*')
                .eq('goal_list_id', list.id)
                .eq('goal_type', 'group')
                .order('created_at', { ascending: true });
              const allGroup = allGroupGoalsData || [];
              const byTitle = new Map();
              allGroup.forEach((g) => {
                if (!byTitle.has(g.title)) byTitle.set(g.title, g);
              });
              ownerGroupGoals = Array.from(byTitle.values()).sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at)
              );
            }
            // 3) Fallback for old lists: owner's goals may have goal_type null/personal; load all owner's goals
            if (ownerGroupGoals.length === 0) {
              const { data: allOwnerGoalsData } = await supabase
                .from('goals')
                .select('*')
                .eq('goal_list_id', list.id)
                .eq('user_id', list.user_id)
                .order('created_at', { ascending: true });
              ownerGroupGoals = allOwnerGoalsData || [];
            }
            const participantPersonalGoals = userGoals.filter(g => g.goal_type === 'personal');
            data = [...ownerGroupGoals, ...participantPersonalGoals];
          } else {
            data = userGoals;
          }
        }

        // Get today's date string
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        // Get goal IDs - use all participants' goals if started
        const goalIdsToCheck = isStarted && list.type === 'group' 
          ? allParticipantsGoals.map(g => g.id)
          : data.map(g => g.id);
        
          // Load completion records for today - for all goals if started
          let todayCompletions = new Set();
          if (goalIdsToCheck.length > 0) {
            const { data: completionsData } = await supabase
              .from('goal_completions')
              .select('goal_id, user_id')
              .in('goal_id', goalIdsToCheck)
              .eq('completed_at', todayStr);
            
            if (completionsData) {
              // For started group goals, track completions by goal_id and user_id
              // For personal goals, only track current user's completions
              if (isStarted && list.type === 'group') {
                completionsData.forEach(c => {
                  todayCompletions.add(`${c.goal_id}_${c.user_id}`);
                });
              } else {
                completionsData
                  .filter(c => c.user_id === user.id)
                  .forEach(c => {
                    todayCompletions.add(c.goal_id);
                  });
              }
            }
          }

          // Load past completion records to populate history
          let pastCompletions = {};
          let pastCompletionsWithValidation = {}; // Track which completions are validated
          if (goalIdsToCheck.length > 0) {
            const { data: pastCompletionsData } = await supabase
              .from('goal_completions')
              .select('id, goal_id, completed_at, user_id, proof_url')
              .in('goal_id', goalIdsToCheck)
              .lt('completed_at', todayStr);
          
          if (pastCompletionsData) {
            // Load validations for all past completions
            const completionIds = pastCompletionsData.map(c => c.id);
            let validationsMap = {};
            if (completionIds.length > 0 && list.type === 'group') {
              const { data: validationsData } = await supabase
                .from('goal_validations')
                .select('goal_completion_id')
                .in('goal_completion_id', completionIds);
              
              // Count validations per completion
              if (validationsData) {
                validationsData.forEach(v => {
                  if (!validationsMap[v.goal_completion_id]) {
                    validationsMap[v.goal_completion_id] = 0;
                  }
                  validationsMap[v.goal_completion_id]++;
                });
              }
            }
            
            // Get total validators count for group goals
            let totalValidators = 0;
            if (list.type === 'group') {
              const { data: participantsData } = await supabase
                .from('group_goal_participants')
                .select('user_id')
                .eq('goal_list_id', list.id);
              
              const participantIds = [
                list.user_id,
                ...(participantsData || []).map(p => p.user_id)
              ];
              totalValidators = [...new Set(participantIds)].length;
            }
            
            pastCompletionsData.forEach(c => {
              const dateStr = c.completed_at.includes('T') ? c.completed_at.split('T')[0] : c.completed_at;
              const key = isStarted && list.type === 'group' 
                ? `${c.goal_id}_${c.user_id}`
                : c.goal_id;
              if (!pastCompletions[key]) {
                pastCompletions[key] = new Set();
                pastCompletionsWithValidation[key] = new Set();
              }
              pastCompletions[key].add(dateStr);
              
              // Check if this completion is validated (for group goals: more than 50% of participants validated)
              const isValidated = list.type === 'group' 
                ? totalValidators > 0 && (validationsMap[c.id] || 0) >= totalValidators / 2
                : true; // Personal goals are always "validated"
              
              if (isValidated) {
                pastCompletionsWithValidation[key].add(dateStr);
              }
            });
          }
        }

        // Goals to transform: for started group we already have creator's group + my personal only
        const goalsToTransform = data;

        // Group goals: same visibility as goals — load ALL today's completions (all participants) so everyone sees everyone's posts
        const groupGoalIds = goalsToTransform.filter(g => g.goal_type === 'group').map(g => g.id);
        let todayCompletionsByGoal = {}; // goal_id -> [{ id, user_id, proof_url, proof_urls, caption, user_name, user_avatar, user_username, validatedCount, totalValidators, isValidated }, ...]
        let totalValidatorsForList = 0;
        if (list.type === 'group' && groupGoalIds.length > 0) {
          const { data: allTodayCompletions } = await supabase
            .from('goal_completions')
            .select('id, goal_id, user_id, proof_url, proof_urls, caption')
            .in('goal_id', groupGoalIds)
            .eq('completed_at', todayStr);
          const completionIds = (allTodayCompletions || []).map(c => c.id);
          const userIds = [...new Set((allTodayCompletions || []).map(c => c.user_id))];
          let profilesMap = {};
          if (userIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, name, username, avatar_url').in('id', userIds);
            (profiles || []).forEach(p => { profilesMap[p.id] = p; });
          }
          const { data: participantsData } = await supabase.from('group_goal_participants').select('user_id').eq('goal_list_id', list.id);
          const participantIds = [list.user_id, ...(participantsData || []).map(p => p.user_id)];
          totalValidatorsForList = [...new Set(participantIds)].length;
          let validationsByCompletion = {};
          if (completionIds.length > 0) {
            const { data: validations } = await supabase.from('goal_validations').select('goal_completion_id, validator_id').in('goal_completion_id', completionIds);
            (validations || []).forEach(v => {
              if (!validationsByCompletion[v.goal_completion_id]) validationsByCompletion[v.goal_completion_id] = [];
              validationsByCompletion[v.goal_completion_id].push(v.validator_id);
            });
          }
          const validatorIds = [...new Set(Object.values(validationsByCompletion).flat())];
          let validatorProfilesMap = {};
          if (validatorIds.length > 0) {
            const { data: validatorProfiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', validatorIds);
            (validatorProfiles || []).forEach(p => { validatorProfilesMap[p.id] = p; });
          }
          (allTodayCompletions || []).forEach(c => {
            const profile = profilesMap[c.user_id] || {};
            const validations = validationsByCompletion[c.id] || [];
            const validators = validations.map(vid => ({
              id: vid,
              name: validatorProfilesMap[vid]?.name,
              avatar_url: validatorProfilesMap[vid]?.avatar_url,
            })).filter(Boolean);
            if (!todayCompletionsByGoal[c.goal_id]) todayCompletionsByGoal[c.goal_id] = [];
            todayCompletionsByGoal[c.goal_id].push({
              id: c.id,
              user_id: c.user_id,
              proof_url: c.proof_url || null,
              proof_urls: Array.isArray(c.proof_urls) && c.proof_urls.length > 0 ? c.proof_urls.filter(Boolean) : (c.proof_url ? [c.proof_url] : []),
              caption: (c.caption || '').trim() || null,
              user_name: profile.name || 'User',
              user_avatar: profile.avatar_url || '👤',
              user_username: profile.username || '@user',
              validatedCount: validations.length,
              totalValidators: totalValidatorsForList,
              isValidated: user && validations.some(v => v === user.id),
              validators,
            });
          });
        }
        
        // Transform data to match existing format
        const transformedGoals = await Promise.all(goalsToTransform.map(async (goal) => {
          const isOwnGoal = goal.user_id === user.id;
          const history = generateCompletionHistory(goal.created_at);
          const currentDayIndex = getCurrentDayIndex(goal.created_at);
          
          const completionKey = isStarted && list.type === 'group' 
            ? (goal.goal_type === 'group' ? `${goal.id}_${user.id}` : `${goal.id}_${goal.user_id}`)
            : goal.id;
          const isCompletedToday = todayCompletions.has(completionKey);
          
          if (isOwnGoal && goal.completed !== isCompletedToday) {
            await supabase
              .from('goals')
              .update({ completed: isCompletedToday })
              .eq('id', goal.id)
              .eq('user_id', user.id);
          }
          
          const pastCompletionsKey = isStarted && list.type === 'group'
            ? (goal.goal_type === 'group' ? `${goal.id}_${user.id}` : `${goal.id}_${goal.user_id}`)
            : goal.id;
          if (pastCompletions[pastCompletionsKey]) {
            const createdDate = new Date(goal.created_at);
            createdDate.setHours(0, 0, 0, 0);
            pastCompletions[pastCompletionsKey].forEach(dateStr => {
              const completionDate = new Date(dateStr);
              completionDate.setHours(0, 0, 0, 0);
              const dayIndex = Math.floor((completionDate - createdDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < history.length && dayIndex < currentDayIndex) {
                const isValidated = pastCompletionsWithValidation[pastCompletionsKey]?.has(dateStr) || goal.goal_type === 'personal';
                if (isValidated) history[dayIndex] = true;
              }
            });
          }
          
          history[currentDayIndex] = isCompletedToday;
          
          let userProfile = null;
          if (!isOwnGoal) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, name, username, avatar_url')
              .eq('id', goal.user_id)
              .single();
            userProfile = profile;
          }
          
          // Single-post fields (personal goals, or fallback for group)
          let hasProof = false;
          let proofUrl = null;
          let proofUrls = [];
          let caption = null;
          let completionId = null;
          let validatedCount = 0;
          let totalValidators = totalValidatorsForList || 0;
          let isValidated = false;
          const todayCompletionsList = list.type === 'group' ? (todayCompletionsByGoal[goal.id] || []) : [];
          
          if (list.type === 'group' && todayCompletionsList.length > 0) {
            // Group goal: use first completion for legacy fields (e.g. validation button on one post); primary display uses todayCompletionsList
            const first = todayCompletionsList[0];
            completionId = first.id;
            validatedCount = first.validatedCount;
            totalValidators = first.totalValidators;
            isValidated = first.isValidated;
          } else if (isCompletedToday) {
            const completionUserId = isOwnGoal ? user.id : goal.user_id;
            const { data: todayCompletion } = await supabase
              .from('goal_completions')
              .select('id, proof_url, proof_urls, caption')
              .eq('goal_id', goal.id)
              .eq('user_id', completionUserId)
              .eq('completed_at', todayStr)
              .single();
            proofUrl = todayCompletion?.proof_url || null;
            if (Array.isArray(todayCompletion?.proof_urls) && todayCompletion.proof_urls.length > 0) {
              proofUrls = todayCompletion.proof_urls.filter(Boolean);
            } else if (proofUrl) proofUrls = [proofUrl];
            hasProof = proofUrls.length > 0 || !!proofUrl;
            caption = todayCompletion?.caption?.trim() || null;
            completionId = todayCompletion?.id;
            if (completionId && list.type === 'group') {
              const { data: participantsData } = await supabase.from('group_goal_participants').select('user_id').eq('goal_list_id', list.id);
              const pids = [list.user_id, ...(participantsData || []).map(p => p.user_id)];
              totalValidators = [...new Set(pids)].length;
              const { data: validations } = await supabase.from('goal_validations').select('validator_id').eq('goal_completion_id', completionId);
              validatedCount = validations?.length || 0;
              if (user && validations) isValidated = validations.some(v => v.validator_id === user.id);
            }
          }
          
          return {
            id: goal.id,
            title: goal.title,
            checked: isCompletedToday,
            viewers: [],
            type: 'goal',
            validated: validatedCount,
            totalViewers: totalValidators,
            completionId: completionId,
            isValidated: isValidated,
            completionHistory: history,
            color: getRandomColor(),
            goal_list_type: list.type,
            goal_type: goal.goal_type || 'personal',
            created_at: goal.created_at,
            currentDayIndex: currentDayIndex,
            isOwnGoal: isOwnGoal,
            user_id: goal.user_id,
            user_name: userProfile?.name || 'User',
            user_avatar: userProfile?.avatar_url || '👤',
            user_username: userProfile?.username || '@user',
            hasProof: hasProof,
            proof_url: proofUrl,
            proof_urls: proofUrls,
            caption: caption,
            todayCompletions: todayCompletionsList, // group goals: all participants' posts (same visibility as group goals)
          };
        }));

        // Sort goals: group goals first, then personal goals, then by creation date
        const sortedGoals = transformedGoals.sort((a, b) => {
          // Group goals first
          if (a.goal_type === 'group' && b.goal_type !== 'group') return -1;
          if (a.goal_type !== 'group' && b.goal_type === 'group') return 1;
          
          // Then by creation date
          return new Date(a.created_at) - new Date(b.created_at);
        });
        
        setGoals(sortedGoals);
        
        // Do NOT auto-set goalListStarted when goals exist. List only starts when owner taps "Begin".
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const loadGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Load goal lists where user is owner
        const { data: ownedLists, error: ownedError } = await supabase
          .from('goal_lists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (ownedError) throw ownedError;

        // Load goal lists where user is a participant
        const { data: participantLists, error: participantError } = await supabase
          .from('group_goal_participants')
          .select('goal_list_id, goal_lists(*)')
          .eq('user_id', user.id);

        if (participantError) {
          console.error('Error loading participant goal lists:', participantError);
        }

        // Combine owned and participant goal lists
        const participantGoalLists = (participantLists || [])
          .map(p => p.goal_lists)
          .filter(list => list && !ownedLists?.some(owned => owned.id === list.id)); // Remove duplicates

        const allLists = [...(ownedLists || []), ...participantGoalLists]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // Exclude ended lists (winner declared) — they're over, no actions needed
        const isEnded = (l) => l.winner_id || (Array.isArray(l.tie_winner_ids) && l.tie_winner_ids.length > 0);
        const activeLists = (allLists || []).filter((l) => !isEnded(l));

        setGoalLists(activeLists);

        // Use ref so we never overwrite a user's list switch with stale closure (e.g. from Realtime/focus)
        const selected = currentGoalListRef.current;
        if (selected?.id) {
          const freshList = activeLists.find((l) => l.id === selected.id);
          if (freshList) setCurrentGoalList(freshList);
          else if (activeLists.length > 0) setCurrentGoalList(activeLists[0]);
          else setCurrentGoalList(null);
        } else if (activeLists.length > 0) {
          setCurrentGoalList(activeLists[0]);
        } else {
          setCurrentGoalList(null);
        }

        const listToLoad = selected?.id
          ? (activeLists.find((l) => l.id === selected.id) || (activeLists?.length ? activeLists[0] : null))
          : (activeLists?.length ? activeLists[0] : null);
        if (listToLoad) {
          // Check if owner has paid for group goals with payment required
          if (listToLoad.type === 'group' && listToLoad.payment_required) {
            const { data: participant } = await supabase
              .from('group_goal_participants')
              .select('payment_status')
              .eq('goal_list_id', listToLoad.id)
              .eq('user_id', user.id)
              .single();
            
            setOwnerHasPaid(participant?.payment_status === 'paid');
          } else {
            setOwnerHasPaid(true); // Personal goals don't need payment
          }
          
          await loadGoalsForCurrentList(listToLoad);
        } else {
          setGoals([]);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading goals:', error);
      setLoading(false);
    }
  };

  const getRandomColor = () => {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const toggleValidation = async (goalOrCompletionId, completionIdArg) => {
    // When called from group goal post: (goalId, completionId); when from other user personal: (goalId) and goal.completionId is used
    const goalId = completionIdArg != null ? goalOrCompletionId : goalOrCompletionId;
    const completionId = completionIdArg != null ? completionIdArg : null;
    const goal = goals.find(g => g.id === goalId);
    const targetCompletionId = completionId || goal?.completionId;
    if (!goal || !targetCompletionId) return;
    
    const isCurrentlyValidated = completionId
      ? (goal.todayCompletions?.find(p => p.id === completionId)?.isValidated ?? false)
      : goal.isValidated;
    
    // Validation is irreversible: do not allow unvalidating
    if (isCurrentlyValidated) return;
    
    Alert.alert(
      'Confirm validation',
      'Are you sure? This is irreversible — you won\'t be able to remove your validation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Validate',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              const { error } = await supabase
                .from('goal_validations')
                .insert({
                  goal_completion_id: targetCompletionId,
                  validator_id: user.id,
                });
              if (!error) {
                const { data: validations } = await supabase
                  .from('goal_validations')
                  .select('validator_id')
                  .eq('goal_completion_id', targetCompletionId);
                const newValidatedCount = validations?.length || 0;
                const validatorIds = (validations || []).map(v => v.validator_id);
                let validators = [];
                if (validatorIds.length > 0) {
                  const { data: validatorProfiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', validatorIds);
                  validators = (validatorProfiles || []).map(p => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }));
                }
                setGoals(prev => prev.map(item => {
                  if (item.id !== goalId) return item;
                  if (completionId && item.todayCompletions?.length) {
                    return {
                      ...item,
                      todayCompletions: item.todayCompletions.map(p =>
                        p.id === completionId ? { ...p, validatedCount: newValidatedCount, isValidated: true, validators } : p
                      ),
                    };
                  }
                  return { ...item, validated: newValidatedCount, isValidated: true };
                }));
              }
            } catch (error) {
              console.error('Error toggling validation:', error);
            }
          },
        },
      ]
    );
  };

  const toggleGoal = async (id) => {
    const goal = goals.find(g => g.id === id && g.type === 'goal');
    if (!goal) return;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // For personal goals, directly toggle without navigation
    if (goal.goal_list_type === 'personal') {
      const newChecked = !goal.checked;
      if (!newChecked) {
        // About to remove completion — confirm first
        Alert.alert(
          'Remove post?',
          'Are you sure? This will remove your completion and proof for today. You can\'t undo this.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => doPersonalUncheck(id, todayStr, user.id) },
          ]
        );
        return;
      }
      await doPersonalCheck(id, todayStr, user.id);
    } else {
      // Group goals: any participant can complete; we only touch goal_completions (goal row is creator's)
      if (!goal.checked) {
        navigation.navigate('GoalPost', { goal });
      } else {
        // Uncheck: confirm before removing our completion
        Alert.alert(
          'Remove your post?',
          'Are you sure? This will remove your completion and proof for today. You can\'t undo this.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => doGroupUncheck(id, todayStr, user.id) },
          ]
        );
      }
    }
  };

  const doPersonalCheck = async (id, todayStr, userId) => {
    const goal = goals.find(g => g.id === id && g.type === 'goal');
    if (!goal) return;
    const newChecked = true;
    const { error } = await supabase
      .from('goals')
      .update({ completed: newChecked })
      .eq('id', id)
      .eq('user_id', userId);
    if (!error) {
      await supabase
        .from('goal_completions')
        .upsert({
          goal_id: id,
          user_id: userId,
          completed_at: todayStr,
        }, { onConflict: 'goal_id,user_id,completed_at' });
      setGoals(prev => prev.map(g => {
        if (g.id === id) {
          const updatedHistory = [...(g.completionHistory || [])];
          updatedHistory[g.currentDayIndex] = newChecked;
          return { ...g, checked: newChecked, completionHistory: updatedHistory };
        }
        return g;
      }));
    }
  };

  const doPersonalUncheck = async (id, todayStr, userId) => {
    const { error } = await supabase
      .from('goals')
      .update({ completed: false })
      .eq('id', id)
      .eq('user_id', userId);
    if (!error) {
      await supabase
        .from('goal_completions')
        .delete()
        .eq('goal_id', id)
        .eq('user_id', userId)
        .eq('completed_at', todayStr);
      setGoals(prev => prev.map(g => {
        if (g.id === id) {
          const updatedHistory = [...(g.completionHistory || [])];
          updatedHistory[g.currentDayIndex] = false;
          return { ...g, checked: false, completionHistory: updatedHistory };
        }
        return g;
      }));
    }
  };

  const doGroupUncheck = async (id, todayStr, userId) => {
    const { error } = await supabase
      .from('goal_completions')
      .delete()
      .eq('goal_id', id)
      .eq('user_id', userId)
      .eq('completed_at', todayStr);
    if (!error) {
      setGoals(prev => prev.map(g => {
        if (g.id === id) {
          const updatedHistory = [...(g.completionHistory || [])];
          updatedHistory[g.currentDayIndex] = false;
          const updatedTodayCompletions = (g.todayCompletions || []).filter(p => p.user_id !== userId);
          return { ...g, checked: false, completionHistory: updatedHistory, todayCompletions: updatedTodayCompletions };
        }
        return g;
      }));
    } else {
      Alert.alert('Could not remove post', error.message || 'Try again.');
    }
  };

  // State for friends/participants
  const [friends, setFriends] = useState([]);
  
  // Load friends/participants for group goals
  useEffect(() => {
    const loadFriends = async () => {
      if (!currentGoalList) {
        setFriends([]);
        return;
      }
      
      if (currentGoalList.type === 'group') {
        try {
          // Load all participants
          const { data: participantsData } = await supabase
            .from('group_goal_participants')
            .select('user_id')
            .eq('goal_list_id', currentGoalList.id);
          
          const participantIds = [
            currentGoalList.user_id, // Include creator
            ...(participantsData || []).map(p => p.user_id)
          ];
          
          // Remove duplicates
          const uniqueParticipantIds = [...new Set(participantIds)];
          
          // Load profiles for all participants
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, username, avatar_url')
            .in('id', uniqueParticipantIds);
          
          if (profiles) {
            // Calculate progress for each participant
            const friendsList = await Promise.all(profiles.map(async (profile) => {
              // Get all goals for this user in this goal list
              const { data: userGoals } = await supabase
                .from('goals')
                .select('id, goal_type')
                .eq('goal_list_id', currentGoalList.id)
                .eq('user_id', profile.id);
              
              const totalGoals = userGoals?.length || 0;
              
              if (totalGoals === 0) {
                return {
                  id: profile.id,
                  emoji: profile.avatar_url || '👤',
                  name: profile.name || 'User',
                  progress: 0,
                };
              }
              
              // Get today's date
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const todayStr = today.toISOString().split('T')[0];
              
              // Count completed goals (validated for group goals)
              let completedCount = 0;
              
              if (userGoals && userGoals.length > 0) {
                const goalIds = userGoals.map(g => g.id);
                
                // Get today's completions
                const { data: todayCompletions } = await supabase
                  .from('goal_completions')
                  .select('id, goal_id')
                  .in('goal_id', goalIds)
                  .eq('user_id', profile.id)
                  .eq('completed_at', todayStr);
                
                if (todayCompletions && todayCompletions.length > 0) {
                  const completionIds = todayCompletions.map(c => c.id);
                  
                  // For group goals, check if validated
                  const groupGoalIds = userGoals.filter(g => g.goal_type === 'group').map(g => g.id);
                  const personalGoalIds = userGoals.filter(g => g.goal_type === 'personal').map(g => g.id);
                  
                  // Count validated group goals
                  if (groupGoalIds.length > 0) {
                    const groupCompletions = todayCompletions.filter(c => groupGoalIds.includes(c.goal_id));
                    if (groupCompletions.length > 0) {
                      const { data: validations } = await supabase
                        .from('goal_validations')
                        .select('goal_completion_id')
                        .in('goal_completion_id', groupCompletions.map(c => c.id));
                      
                      // Get total validators
                      const { data: participantsData } = await supabase
                        .from('group_goal_participants')
                        .select('user_id')
                        .eq('goal_list_id', currentGoalList.id);
                      
                      const participantIds = [
                        currentGoalList.user_id,
                        ...(participantsData || []).map(p => p.user_id)
                      ];
                      const totalValidators = [...new Set(participantIds)].length;
                      
                      // Count validations per completion
                      const validationCounts = {};
                      if (validations) {
                        validations.forEach(v => {
                          validationCounts[v.goal_completion_id] = (validationCounts[v.goal_completion_id] || 0) + 1;
                        });
                      }
                      
                      // Count validated group goals (more than 50% validated = complete)
                      groupCompletions.forEach(c => {
                        if (totalValidators > 0 && (validationCounts[c.id] || 0) >= totalValidators / 2) {
                          completedCount++;
                        }
                      });
                    }
                  }
                  
                  // Count personal goals (always count as completed if they have a completion)
                  const personalCompletions = todayCompletions.filter(c => personalGoalIds.includes(c.goal_id));
                  completedCount += personalCompletions.length;
                }
              }
              
              const progress = totalGoals > 0 ? completedCount / totalGoals : 0;
              
              return {
                id: profile.id,
                emoji: profile.avatar_url || '👤',
                name: profile.name || 'User',
                progress: Math.min(progress, 1), // Cap at 1
              };
            }));
            
            setFriends(friendsList);
          } else {
            setFriends([]);
          }
        } catch (error) {
          console.error('Error loading friends:', error);
          setFriends([]);
        }
      } else {
        setFriends([]);
      }
    };
    
    loadFriends();
  }, [currentGoalList]);

  // Create animated values for each friend - recreate when friends change
  const floatAnims = useRef([]);

  useEffect(() => {
    // Recreate animated values when friends change
    floatAnims.current = friends.map(() => new Animated.Value(0));
  }, [friends.length]);

  useEffect(() => {
    if (floatAnims.current.length === 0) return;
    
    // Create floating animation for each avatar
    const animations = floatAnims.current.map((anim, index) => {
      if (!anim) return null;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000 + (index * 200), // Stagger the timing
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 2000 + (index * 200),
            useNativeDriver: true,
          }),
        ])
      );
    }).filter(Boolean);

    animations.forEach(animation => animation.start());

    return () => animations.forEach(animation => animation.stop());
  }, [friends.length]);

  // Load a friend's activity in this goal list (completions + validations) and show modal
  const loadFriendActivityAndShowModal = async (friend) => {
    if (!currentGoalList?.id || !friend?.id) return;
    setLoadingFriendActivity(true);
    setSelectedFriendActivity({ friend: { id: friend.id, name: friend.name, emoji: friend.emoji }, completions: [], validations: [] });
    setFriendActivityModalVisible(true);
    try {
      const listId = currentGoalList.id;
      const userId = friend.id;

      // Goals in this list (for titles and filtering)
      const { data: listGoals } = await supabase
        .from('goals')
        .select('id, title, goal_type')
        .eq('goal_list_id', listId);
      const goalIds = (listGoals || []).map(g => g.id);
      const goalById = (listGoals || []).reduce((acc, g) => { acc[g.id] = g; return acc; }, {});

      // Completions by this user in this list
      const completions = [];
      if (goalIds.length > 0) {
        const { data: comps } = await supabase
          .from('goal_completions')
          .select('id, goal_id, completed_at')
          .in('goal_id', goalIds)
          .eq('user_id', userId)
          .order('completed_at', { ascending: false });
        (comps || []).forEach(c => {
          const goal = goalById[c.goal_id];
          if (goal) completions.push({ ...c, goal_title: goal.title, goal_type: goal.goal_type });
        });
      }

      // Validations by this user (for completions in this list)
      const { data: validations } = await supabase
        .from('goal_validations')
        .select('goal_completion_id')
        .eq('validator_id', userId);
      const validationList = [];
      if (validations?.length > 0) {
        const completionIds = [...new Set(validations.map(v => v.goal_completion_id))];
        const { data: compRows } = await supabase
          .from('goal_completions')
          .select('id, goal_id, user_id, completed_at')
          .in('id', completionIds);
        const inList = (compRows || []).filter(c => goalIds.includes(c.goal_id));
        const completerIds = [...new Set(inList.map(c => c.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', completerIds);
        const nameById = (profiles || []).reduce((acc, p) => { acc[p.id] = p.name || 'Someone'; return acc; }, {});
        inList.forEach(c => {
          const goal = goalById[c.goal_id];
          if (goal) validationList.push({
            goal_title: goal.title,
            completed_at: c.completed_at,
            completer_name: nameById[c.user_id] || 'Someone',
          });
        });
        validationList.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
      }

      setSelectedFriendActivity({
        friend: { id: friend.id, name: friend.name, emoji: friend.emoji },
        completions,
        validations: validationList,
      });
    } catch (e) {
      console.error('Error loading friend activity:', e);
      setSelectedFriendActivity({ friend: { id: friend.id, name: friend.name, emoji: friend.emoji }, completions: [], validations: [] });
    } finally {
      setLoadingFriendActivity(false);
    }
  };

  // Countdown timer for day
  useEffect(() => {
    const updateCountdowns = () => {
      const now = new Date();

      // Day countdown (time until midnight)
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const dayDifference = endOfDay - now;
      
      if (dayDifference > 0) {
        const hours = Math.floor(dayDifference / (1000 * 60 * 60));
        const minutes = Math.floor((dayDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((dayDifference % (1000 * 60)) / 1000);
        setTimeRemainingDay(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeRemainingDay('Day ended');
      }
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);

    return () => clearInterval(interval);
  }, []);

  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <View style={styles.container}>
      {/* Top Left Date */}
      <View style={styles.dateContainer}>
        <Text style={styles.dateText}>{currentDate}</Text>
      </View>

      {/* Top Right Goal List Picker - Only show if there are goal lists */}
      {goalLists.length > 0 && currentGoalList && (
      <View style={styles.switcherContainer}>
        <TouchableOpacity 
          onPress={() => setDropdownVisible(true)}
            style={styles.switcherButton}
        >
            <Text style={styles.pillText}>{currentGoalList.name}</Text>
            <Ionicons name="chevron-down" size={16} color="#ffffff" />
        </TouchableOpacity>
          </View>
        )}

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.challengesContainer}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadGoals();
              setRefreshing(false);
            }}
            tintColor="#fff"
          />
        }
      >
        {/* Floating Friends - Only for group goals */}
        {currentGoalList?.type === 'group' && friends.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.friendsScrollView}
            contentContainerStyle={styles.friendsContainer}
            >
              {friends.map((friend, index) => {
              const floatAnim = floatAnims.current[index];
              if (!floatAnim) return null;
              
              const translateY = floatAnim.interpolate({
              inputRange: [0, 1],
                outputRange: [0, -10],
            });

            return (
              <TouchableOpacity
                key={friend.id}
                activeOpacity={0.8}
                onPress={() => loadFriendActivityAndShowModal(friend)}
              >
                <Animated.View 
                  style={[
                    styles.friendItem,
                    {
                      transform: [{ translateY }],
                    },
                  ]}
                >
                  <View style={styles.avatarWithProgress}>
                    <Svg width={64} height={64} style={styles.progressRing}>
                      <Circle
                        cx={32}
                        cy={32}
                        r={30}
                        stroke="#2a2a2a"
                        strokeWidth={3}
                        fill="none"
                      />
                      <Circle
                        cx={32}
                        cy={32}
                        r={30}
                        stroke="#4CAF50"
                        strokeWidth={3}
                        fill="none"
                        strokeDasharray={2 * Math.PI * 30}
                        strokeDashoffset={2 * Math.PI * 30 * (1 - friend.progress)}
                        strokeLinecap="round"
                        rotation="-90"
                        origin="32, 32"
                      />
                    </Svg>
                    {getAvatarDisplayUrl(friend.emoji) ? (
                      <Image source={{ uri: getAvatarDisplayUrl(friend.emoji) }} style={styles.avatarImageInRing} />
                    ) : (
                      <Text style={styles.avatarEmoji}>{friend.emoji || '👤'}</Text>
                    )}
                  </View>
                  <Text style={styles.friendName}>{friend.name}</Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        )}

        {/* Modal: Friend activity in this goal list */}
        <Modal
          visible={friendActivityModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setFriendActivityModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.friendActivityModalBackdrop}
            onPress={() => setFriendActivityModalVisible(false)}
          >
            <View style={styles.friendActivityModalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.friendActivityModalHeader}>
                {selectedFriendActivity?.friend && (
                  <>
                    <View style={styles.friendActivityAvatarWrap}>
                      {getAvatarDisplayUrl(selectedFriendActivity.friend.emoji) ? (
                        <Image source={{ uri: getAvatarDisplayUrl(selectedFriendActivity.friend.emoji) }} style={styles.friendActivityAvatar} />
                      ) : (
                        <Text style={styles.friendActivityAvatarEmoji}>{selectedFriendActivity.friend.emoji || '👤'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendActivityModalTitle}>{selectedFriendActivity.friend.name}'s activity</Text>
                      <Text style={styles.friendActivityModalSubtitle}>In this challenge</Text>
                    </View>
                  </>
                )}
                <TouchableOpacity style={styles.friendActivityModalClose} onPress={() => setFriendActivityModalVisible(false)}>
                  <Ionicons name="close" size={28} color="#ffffff" />
                </TouchableOpacity>
              </View>
              {loadingFriendActivity ? (
                <View style={styles.friendActivityLoading}>
                  <Text style={styles.friendActivityLoadingText}>Loading…</Text>
                </View>
              ) : selectedFriendActivity && (
                <ScrollView style={styles.friendActivityScroll} showsVerticalScrollIndicator={false}>
                  {selectedFriendActivity.completions?.length > 0 && (
                    <View style={styles.friendActivitySection}>
                      <Text style={styles.friendActivitySectionTitle}>Goals completed</Text>
                      {selectedFriendActivity.completions.map((c) => (
                        <View key={c.id} style={styles.friendActivityRow}>
                          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                          <Text style={styles.friendActivityRowText}>
                            {c.goal_title} — {c.completed_at ? new Date(c.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {selectedFriendActivity.validations?.length > 0 && (
                    <View style={styles.friendActivitySection}>
                      <Text style={styles.friendActivitySectionTitle}>Posts validated</Text>
                      {selectedFriendActivity.validations.map((v, idx) => (
                        <View key={idx} style={styles.friendActivityRow}>
                          <Ionicons name="thumbs-up" size={20} color="#2196F3" />
                          <Text style={styles.friendActivityRowText}>
                            Validated {v.completer_name}'s post for "{v.goal_title}" — {v.completed_at ? new Date(v.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {!loadingFriendActivity && selectedFriendActivity?.completions?.length === 0 && selectedFriendActivity?.validations?.length === 0 && (
                    <Text style={styles.friendActivityEmpty}>No activity in this challenge yet.</Text>
                  )}
                </ScrollView>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Duration/Deadline Info - Only for group goals */}
        {currentGoalList?.type === 'group' && currentGoalList && (
          <View style={styles.durationContainer}>
            {currentGoalList.deadline && (
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>Deadline:</Text>
                <Text style={styles.durationValue}>{new Date(currentGoalList.deadline).toLocaleDateString()}</Text>
              </View>
            )}
            {(currentGoalList.duration_days || currentGoalList.is_unlimited) && (
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>Duration:</Text>
                <Text style={styles.durationValue}>
                  {currentGoalList.duration_days ? `${currentGoalList.duration_days} days` : 'Unlimited'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Countdown Timer - Only show if there are goals */}
        {goals.length > 0 && (
          <View style={styles.countdownContainerOuter}>
            <View style={styles.countdownRow}>
              <Text style={styles.countdownLabel}>Time left in day:</Text>
              <Text style={styles.countdownText}>{timeRemainingDay}</Text>
            </View>
          </View>
        )}
                  
        {/* Personal Goals */}
        <View style={styles.personalGoalsContainer}>
          {/* Show placeholder if no goals (but not for test group goal) */}
          {goals.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyStateContainer}
              onPress={() => navigation.navigate('CreateGoalList')}
              activeOpacity={1}
            >
              <Text style={styles.emptyStateTitle}>Start your adventure</Text>
              <Image source={require('../assets/fsf.png')} style={styles.emptyStateLogo} resizeMode="contain" />
              <Text style={styles.emptyStateQuote}>"Time passes anyways so why not grow with it"</Text>
              <Text style={styles.emptyStateQuoteAuthor}>— Moustapha Gueye</Text>
            </TouchableOpacity>
          ) : (
            /* Goals List */
            <>
              {goals.filter(item => item.type === 'goal').map((item) => {
              // isOtherUserGoal only applies to OTHER users' PERSONAL goals (posts to validate).
              // Shared group goals (goal_type === 'group') are always shown to every participant.
              const isSharedGroupGoal = item.goal_type === 'group';
              const isOtherUserGoal = item.goal_list_type === 'group' && !item.isOwnGoal && !isSharedGroupGoal;
              
              return (
                <View key={item.id} style={[
                  styles.personalGoalItem,
                  isOtherUserGoal && item.checked && (item.hasProof || item.caption) && styles.otherUserPostItem
                ]}>
              {/* Goal Title and Complete Button — own goals + shared group goals */}
              {(!isOtherUserGoal) && (
                  <View style={styles.goalPillWrapper}>
                  {/* Title: editable only for own personal goals */}
                  {item.isOwnGoal && !isSharedGroupGoal ? (
                    <TouchableOpacity 
                      onPress={() => {
                        setEditingGoalId(item.id);
                        setNewGoalName(item.title);
                        setEditGoalModalVisible(true);
                      }}
                      style={{ flex: 1 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <Text style={styles.goalTitleText}>{item.title.toUpperCase()}</Text>
                        <Text style={styles.goalTypeLabel}>{' '}- personal goal</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <Text style={styles.goalTitleText}>{item.title.toUpperCase()}</Text>
                        <Text style={styles.goalTypeLabel}>{' '}- group goal</Text>
                      </View>
                    </View>
                  )}
                    <TouchableOpacity 
                      style={styles.statusContainer}
                      onPress={() => {
                        if (item.goal_list_type === 'group' && isGroupGoalComplete(item)) return;
                        toggleGoal(item.id);
                      }}
                    >
                      <Text style={[
                        styles.statusText,
                        item.checked && item.goal_list_type === 'group' && isGroupGoalComplete(item) && styles.statusTextCompleted,
                        item.checked && item.goal_list_type === 'group' && !isGroupGoalComplete(item) && styles.statusTextWaiting,
                        item.checked && item.goal_list_type === 'personal' && styles.statusTextCompleted
                      ]}>
                      {item.checked 
                        ? (item.goal_list_type === 'group' 
                          ? (isGroupGoalComplete(item) ? 'COMPLETED' : 'WAITING FOR VALIDATION')
                          : 'COMPLETED')
                        : 'COMPLETE'}
                      </Text>
                    </TouchableOpacity>
                  </View>
              )}
              {/* Other user's personal goal — read-only row (weaved in), status only, no complete/validate */}
              {isOtherUserGoal && (
                  <View style={styles.goalPillWrapper}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <View style={styles.otherUserAvatarSmall}>
                      {getAvatarDisplayUrl(item.user_avatar) ? (
                        <Image source={{ uri: getAvatarDisplayUrl(item.user_avatar) }} style={styles.otherUserAvatarImage} />
                      ) : (
                        <Text style={styles.otherUserAvatarEmoji}>{item.user_avatar || '👤'}</Text>
                      )}
                    </View>
                    <View>
                      <Text style={styles.goalTitleText}>{item.title.toUpperCase()}</Text>
                      <Text style={styles.otherUserGoalByLabel}>by {item.user_name || 'User'}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusContainer, styles.statusContainerReadOnly]}>
                    <Text style={[
                      styles.statusText,
                      item.checked && styles.statusTextCompleted
                    ]}>
                      {item.checked ? 'COMPLETED' : 'Not completed yet'}
                    </Text>
                  </View>
                  </View>
              )}
                  
              {/* Completion History — own goals + shared group goals */}
              {!isOtherUserGoal && item.completionHistory && (() => {
                const totalBoxes = item.completionHistory.length;
                const numRows = 3; // Always 3 rows
                const boxesPerColumn = numRows; // 3 boxes per column
                const numColumns = Math.ceil(totalBoxes / boxesPerColumn);
                
                // Organize into columns (each column has 3 boxes stacked)
                const columns = [];
                for (let col = 0; col < numColumns; col++) {
                  const columnBoxes = [];
                  for (let row = 0; row < numRows; row++) {
                    const originalIndex = col * numRows + row;
                    if (originalIndex < totalBoxes) {
                      columnBoxes.push({
                        status: item.completionHistory[originalIndex],
                        originalIndex: originalIndex
                      });
                    }
                  }
                  if (columnBoxes.length > 0) {
                    columns.push(columnBoxes);
                  }
                }
                
                return (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.historyCarouselContainer}
                    style={styles.historyCarousel}
                  >
                    {columns.map((columnBoxes, colIndex) => (
                      <View key={colIndex} style={styles.historyColumn}>
                        {columnBoxes.map((box) => {
                          const isToday = box.originalIndex === item.currentDayIndex;
                          const isFuture = box.originalIndex > item.currentDayIndex;
                          
                          // For past days: if history shows true, it means it was validated (we only add validated to history)
                          // For today: check if it's validated (for group goals) or completed (for personal goals)
                          const isPastDayCompleted = !isToday && box.originalIndex < item.currentDayIndex && box.status === true;
                          const isTodayAndValidated = isToday && item.checked && 
                            (item.goal_list_type === 'personal' || 
                             (item.goal_list_type === 'group' && isGroupGoalComplete(item)));
                          
                          const shouldShowCompleted = isToday 
                            ? isTodayAndValidated 
                            : isPastDayCompleted;
                        
                        return (
                          <View 
                              key={box.originalIndex} 
                            style={[
                              styles.historySquare,
                              isFuture 
                                ? styles.historySquareFuture
                                : shouldShowCompleted 
                                  ? { backgroundColor: item.color || '#4CAF50' }
                                  : styles.historySquareIncomplete,
                              isToday && styles.historySquareToday
                            ]} 
                          />
                        );
                      })}
                    </View>
                    ))}
                  </ScrollView>
                );
              })()}

              {/* Group goal: list participants under the boxes — 2 per row, avatar + username + completed */}
              {!isOtherUserGoal && isSharedGroupGoal && participants.length > 0 && (
                <View style={styles.groupGoalParticipantsList}>
                  {participants.reduce((rows, participant, index) => {
                    const completed = (item.todayCompletions || []).some(p => p.user_id === participant.user_id);
                    const displayName = participant.profile?.username?.replace(/^@/, '') || participant.profile?.name || 'User';
                    const isYou = participant.user_id === currentUser?.id;
                    const cell = (
                      <View key={participant.user_id} style={styles.groupGoalParticipantRow}>
                        <View style={styles.groupGoalParticipantAvatar}>
                          {getAvatarDisplayUrl(participant.profile?.avatar_url) ? (
                            <Image source={{ uri: getAvatarDisplayUrl(participant.profile.avatar_url) }} style={styles.groupGoalParticipantAvatarImage} />
                          ) : (
                            <Text style={styles.groupGoalParticipantAvatarEmoji}>{participant.profile?.avatar_url || '👤'}</Text>
                          )}
                        </View>
                        <Text style={styles.groupGoalParticipantName} numberOfLines={1}>{isYou ? 'You' : displayName}</Text>
                        <View style={styles.groupGoalParticipantStatus}>
                          <Ionicons name={completed ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={completed ? '#4CAF50' : '#666666'} />
                        </View>
                      </View>
                    );
                    if (index % 2 === 0) rows.push([cell]);
                    else rows[rows.length - 1].push(cell);
                    return rows;
                  }, []).map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.groupGoalParticipantsRow}>
                      {row[0]}
                      {row[1] ?? <View style={styles.groupGoalParticipantSpacer} />}
                    </View>
                  ))}
                </View>
              )}
              
              {/* Group goal: show all participants' posts (same visibility as group goals — everyone sees everyone's) */}
              {!isOtherUserGoal && isSharedGroupGoal && item.todayCompletions?.length > 0 && item.todayCompletions.map((post) => (
                <View key={post.id}>
                  <View style={styles.postSeparator} />
                  <View style={styles.postHeaderWithGoalRow}>
                    <View style={styles.postHeaderLeft}>
                      <TouchableOpacity
                        style={styles.otherUserHeader}
                        onPress={() => {
                          if (post.user_id !== currentUser?.id) {
                            navigation.navigate('UserGoals', {
                              user: {
                                id: post.user_id,
                                name: post.user_name,
                                emoji: post.user_avatar,
                                username: post.user_username,
                                progress: 0.8,
                              },
                            });
                          }
                        }}
                      >
                        <View style={styles.otherUserAvatar}>
                          {getAvatarDisplayUrl(post.user_avatar) ? (
                            <Image source={{ uri: getAvatarDisplayUrl(post.user_avatar) }} style={styles.otherUserAvatarImage} />
                          ) : (
                            <Text style={styles.otherUserAvatarEmoji}>{post.user_avatar || '👤'}</Text>
                          )}
                        </View>
                        <View style={styles.otherUserInfo}>
                          <Text style={styles.otherUserName} numberOfLines={1}>{post.user_id === currentUser?.id ? 'You' : (post.user_name || 'User')}</Text>
                          <Text style={styles.otherUserUsername} numberOfLines={1}>{post.user_id === currentUser?.id ? '' : (post.user_username?.replace('@', '') || 'username')}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.postGoalNameWrap}>
                      <Text style={styles.postGoalNameLabel} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                  </View>
                  {post.caption && <Text style={styles.postCaption}>{post.caption}</Text>}
                  {(post.proof_urls?.length > 0 || post.proof_url) ? (
                    <ScrollView
                      horizontal
                      pagingEnabled={post.proof_urls?.length > 1}
                      showsHorizontalScrollIndicator={post.proof_urls?.length > 1}
                      contentContainerStyle={post.proof_urls?.length > 1 ? styles.postProofGalleryContent : undefined}
                      style={styles.postProofGallery}
                    >
                      {(post.proof_urls?.length > 0 ? post.proof_urls : [post.proof_url]).filter(Boolean).map((url, idx) => (
                        <View key={idx} style={[styles.postProofImageWrap, { width: Dimensions.get('window').width - 32 }]}>
                          <ProofMedia proofUrl={url} style={styles.postProofMedia} />
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="image-outline" size={48} color="#666666" />
                    </View>
                  )}
                  {item.goal_list_type === 'group' && (
                    <View style={styles.viewersSectionColumn}>
                      <View style={[styles.viewersSection, styles.viewersSectionFirstRow]}>
                        <View style={[styles.viewersRow, styles.viewersRowValidate]}>
                          <Text style={styles.viewersLabel}>
                            {post.validatedCount}/{post.totalValidators} validated
                          </Text>
                          {post.user_id !== currentUser?.id ? (
                            <TouchableOpacity
                              style={[styles.validateButtonSmall, post.isValidated && styles.validateButtonDone]}
                              onPress={() => toggleValidation(item.id, post.id)}
                            >
                              <Text style={styles.validateButtonSmallText}>{post.isValidated ? 'Validated' : 'Validate'}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                      {post.validators?.length > 0 ? (
                        <View style={styles.validatorsRow}>
                          <Text style={styles.validatorsLabel}>Validated by</Text>
                          <View style={styles.validatorsAvatars}>
                            {post.validators.map((v) => (
                              <View key={v.id} style={styles.validatorAvatarWrap}>
                                {getAvatarDisplayUrl(v.avatar_url) ? (
                                  <Image source={{ uri: getAvatarDisplayUrl(v.avatar_url) }} style={styles.validatorAvatar} />
                                ) : (
                                  <Text style={styles.validatorAvatarEmoji}>{v.avatar_url || '👤'}</Text>
                                )}
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              ))}
              {/* Your post (own personal goal) - single post */}
              {!isOtherUserGoal && !isSharedGroupGoal && item.checked && (item.hasProof || item.caption) && (
                <>
                  <View style={styles.postSeparator} />
                  {item.caption && (
                    <Text style={styles.postCaption}>{item.caption}</Text>
                  )}
                  {(item.proof_urls?.length > 0 || item.proof_url) ? (
                    <ScrollView
                      horizontal
                      pagingEnabled={item.proof_urls?.length > 1}
                      showsHorizontalScrollIndicator={item.proof_urls?.length > 1}
                      contentContainerStyle={item.proof_urls?.length > 1 ? styles.postProofGalleryContent : undefined}
                      style={styles.postProofGallery}
                    >
                      {(item.proof_urls?.length > 0 ? item.proof_urls : [item.proof_url]).filter(Boolean).map((url, idx) => (
                        <View key={idx} style={[styles.postProofImageWrap, { width: Dimensions.get('window').width - 32 }]}>
                          <ProofMedia proofUrl={url} style={styles.postProofMedia} />
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="image-outline" size={48} color="#666666" />
                    </View>
                  )}
                </>
              )}
                  
              {/* Other user's post/validate hidden when weaved in (read-only status row only) */}
              {false && isOtherUserGoal && item.checked && (item.hasProof || item.caption) && (
                <>
                  {/* Separator Line with spacing */}
                  <View style={styles.postSeparator} />
                  
                  {/* Other User's Goal Header */}
                  <TouchableOpacity 
                    style={styles.otherUserHeader}
                    onPress={() => {
                      // Navigate to user profile
                      navigation.navigate('UserGoals', {
                        user: {
                          id: item.user_id,
                          name: item.user_name,
                          emoji: item.user_avatar,
                          username: item.user_username,
                          progress: 0.8,
                        }
                      });
                    }}
                  >
                    <View style={styles.otherUserAvatar}>
                      {getAvatarDisplayUrl(item.user_avatar) ? (
                        <Image source={{ uri: getAvatarDisplayUrl(item.user_avatar) }} style={styles.otherUserAvatarImage} />
                      ) : (
                        <Text style={styles.otherUserAvatarEmoji}>{item.user_avatar || '👤'}</Text>
                      )}
                    </View>
                    <View style={styles.otherUserInfo}>
                      <Text style={styles.otherUserName}>{item.user_name || 'User'}</Text>
                      <Text style={styles.otherUserUsername}>{item.user_username?.replace('@', '') || 'username'}</Text>
                    </View>
                  </TouchableOpacity>
                  
                  {/* Goal Title - Under profile picture */}
                  <Text style={styles.otherUserGoalTitle}>{item.title}</Text>
                  
                  {/* Caption */}
                  {item.caption && (
                    <Text style={styles.postCaption}>{item.caption}</Text>
                  )}
                  
                  {(item.proof_urls?.length > 0 || item.proof_url) ? (
                    <ScrollView
                      horizontal
                      pagingEnabled={item.proof_urls?.length > 1}
                      showsHorizontalScrollIndicator={item.proof_urls?.length > 1}
                      contentContainerStyle={item.proof_urls?.length > 1 ? styles.postProofGalleryContent : undefined}
                      style={styles.postProofGallery}
                    >
                      {(item.proof_urls?.length > 0 ? item.proof_urls : [item.proof_url]).filter(Boolean).map((url, idx) => (
                        <View key={idx} style={[styles.postProofImageWrap, { width: Dimensions.get('window').width - 32 }]}>
                          <ProofMedia proofUrl={url} style={styles.postProofMedia} />
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="image-outline" size={48} color="#666666" />
                    </View>
                  )}
                  
                  {/* Viewers and Validation - Inline */}
                  <View style={styles.viewersSection}>
                    <View style={styles.viewersRow}>
                      {item.viewers && item.viewers.slice(0, 4).map((emoji, index) => (
                        <View 
                          key={index} 
                          style={[
                            styles.viewerAvatar,
                            index > 0 && { marginLeft: -8 }
                          ]}
                        >
                          <Text style={styles.viewerEmoji}>{emoji}</Text>
                        </View>
                      ))}
                    </View>
                      <Text style={styles.validationCount}>
                      {item.validated || 0}/{item.totalViewers || 0} have validated
                      </Text>
                  <TouchableOpacity 
                      style={styles.validateButtonTextOnly}
                      onPress={() => toggleValidation(item.id)}
                  >
                    <Text style={[
                        styles.validateButtonTextOnlyText,
                        item.isValidated && styles.validateButtonTextOnlyTextActive
                    ]}>
                        {item.isValidated ? 'Validated' : 'Validate'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                </>
              )}
              </View>
                      );
                    })}
            </>
                )}
            
        </View>
      </ScrollView>

      {/* Goal List Dropdown Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={dropdownVisible}
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        >
          <View style={styles.dropdownMenuContainer} pointerEvents="box-none">
            <View style={styles.dropdownMenu} pointerEvents="box-none">
              {goalLists.map((list) => (
                <TouchableOpacity
                  key={list.id}
                  style={[
                    styles.dropdownItem,
                    currentGoalList?.id === list.id && styles.dropdownItemSelected
                  ]}
                  onPress={() => {
                    setDropdownVisible(false);
                    setCurrentGoalList(list);
                  }}
                >
                  <Text style={[
                    styles.dropdownItemText,
                    currentGoalList?.id === list.id && styles.dropdownItemTextSelected
                  ]}>
                    {list.name}
                  </Text>
                  {currentGoalList?.id === list.id && (
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setDropdownVisible(false);
                  navigation.navigate('CreateGoalList');
                }}
              >
                <Text style={styles.dropdownItemText}>Add New</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Goal Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={addGoalModalVisible}
        onRequestClose={() => setAddGoalModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAddGoalModalVisible(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.addGoalModalContainer}
          >
            <View style={styles.addGoalModal}>
              <Text style={styles.addGoalModalTitle}>Add New Goal</Text>
              <TextInput
                style={styles.addGoalInput}
                placeholder="Enter goal name"
                placeholderTextColor="#666666"
                value={newGoalName}
                onChangeText={setNewGoalName}
                autoFocus
              />
              <View style={styles.addGoalModalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setAddGoalModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addButton, !newGoalName.trim() && styles.addButtonDisabled]}
                  onPress={async () => {
                    if (newGoalName.trim() && currentGoalList) {
                      setLoading(true);
                      const { data: { user } } = await supabase.auth.getUser();
                      
                      if (user) {
                        const { error } = await supabase
                          .from('goals')
                          .insert({
                            user_id: user.id,
                            goal_list_id: currentGoalList.id,
                            title: newGoalName.trim(),
                            completed: false,
                          });

                        if (error) {
                          console.error('Error adding goal:', error);
                        } else {
                          await loadGoals();
                        }
                      }
                      
                      setLoading(false);
                      setAddGoalModalVisible(false);
                      setNewGoalName('');
                    }
                  }}
                  disabled={!newGoalName.trim()}
                >
                  <Text style={[styles.addButtonText, !newGoalName.trim() && styles.addButtonTextDisabled]}>
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit Goal Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={editGoalModalVisible}
        onRequestClose={() => setEditGoalModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditGoalModalVisible(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.addGoalModalContainer}
          >
            <View style={styles.addGoalModal}>
              <Text style={styles.addGoalModalTitle}>Edit Goal</Text>
              <TextInput
                style={styles.addGoalInput}
                placeholder="Enter goal name"
                placeholderTextColor="#666666"
                value={newGoalName}
                onChangeText={setNewGoalName}
                autoFocus
              />
              <View style={styles.addGoalModalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setEditGoalModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addButton, !newGoalName.trim() && styles.addButtonDisabled]}
                  onPress={async () => {
                    if (newGoalName.trim()) {
                      // Get current user
                      const { data: { user: currentUser } } = await supabase.auth.getUser();
                      if (!currentUser) return;
                      
                      // Update in Supabase
                      const { error } = await supabase
                        .from('goals')
                        .update({ title: newGoalName.trim() })
                        .eq('id', editingGoalId)
                        .eq('user_id', currentUser.id);

                      if (!error) {
                        // Update local state
                        setGoals(goals.map(g => 
                          g.id === editingGoalId 
                            ? { ...g, title: newGoalName.trim() }
                            : g
                        ));
                      }
                      
                      setEditGoalModalVisible(false);
                      setNewGoalName('');
                      setEditingGoalId(null);
                    }
                  }}
                  disabled={!newGoalName.trim()}
                >
                  <Text style={[styles.addButtonText, !newGoalName.trim() && styles.addButtonTextDisabled]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Payment Overlay - Outside ScrollView for proper positioning */}
      {currentGoalList?.type === 'group' && currentUser && !switchingGoal && (() => {
        const participantsForThisList = participants.filter(p => p.goal_list_id === currentGoalList.id);
        // If we have participants but none for this list, wait for load (avoid showing wrong list's data)
        if (participantsForThisList.length === 0 && participants.length > 0) {
          return null;
        }
        
        const otherParticipants = participantsForThisList.filter(p => p.user_id !== currentUser?.id);
        const hasOtherParticipants = otherParticipants.length > 0;
        
        // Always show overlay until everyone has paid/accepted AND owner has tapped "Begin"
        const showOverlay = !allParticipantsPaid || !hasOtherParticipants || !goalListStarted;
        if (!showOverlay) return null;
        
        if (currentGoalList.type !== 'group') return null;
        
        // Owner: use currentGoalList.user_id, or creator row we inject (id starts with 'creator-')
        const creatorParticipant = participantsForThisList.find(p => String(p.id || '').startsWith('creator-'));
        const ownerId = currentGoalList.user_id ?? creatorParticipant?.user_id;
        const isOwner = !!(ownerId && currentUser?.id && ownerId === currentUser.id);
        
        // Get current user's participant data
        const currentUserParticipant = participantsForThisList.find(p => p.user_id === currentUser?.id);
        const amountPerPerson = parseFloat(currentGoalList.amount || 0);
        const totalParticipants = participantsForThisList.length;
        const totalAmount = amountPerPerson * totalParticipants;
        
        // Use profile from participant if available, otherwise use fetched profile from Supabase
        const displayProfile = currentUserParticipant?.profile || currentUserProfile || {};
        
        // Get creator ID (for display)
        const creatorId = ownerId;
        
        return (
          <View style={styles.paymentOverlayContainer}>
            {/* Blurred Background */}
            <View style={styles.paymentOverlayBackdrop} />
            
            {/* Content directly on blurred background - scrollable so overlay stays usable when content grows (e.g. after accept/Begin) */}
            <View style={styles.paymentOverlayContent}>
              <ScrollView
                style={styles.paymentOverlayScroll}
                contentContainerStyle={styles.paymentOverlayScrollContent}
                showsVerticalScrollIndicator={true}
              >
              {/* Total Amount at Top - Only for money */}
              {currentGoalList.consequence_type === 'money' && (
                <View style={styles.totalAmountContainer}>
                  <Text style={styles.totalAmountLabel}>Total Amount</Text>
                  <Text style={styles.totalAmountValue}>
                    ${totalAmount.toFixed(2)}
                  </Text>
                  <Text style={styles.totalAmountSubtext}>
                    ${amountPerPerson.toFixed(2)} × {totalParticipants} {totalParticipants === 1 ? 'person' : 'people'}
                  </Text>
                </View>
              )}
              
              {/* Punishment at Top - Only for punishment */}
              {currentGoalList.consequence_type === 'punishment' && currentGoalList.consequence && (
                <View style={styles.totalAmountContainer}>
                  <Text style={styles.totalAmountLabel}>Punishment</Text>
                  <Text style={styles.totalAmountValue}>
                    {currentGoalList.consequence}
                  </Text>
                </View>
              )}

              {/* Group Goals - Below price/punishment */}
              {groupGoals.length > 0 && (
                <View style={styles.groupGoalsListContainer}>
                  <Text style={styles.groupGoalsListTitle}>Group Goals</Text>
                  <View style={styles.groupGoalsBulletList}>
                    {groupGoals.map((goalTitle, index) => (
                      <View key={index} style={styles.groupGoalBulletItem}>
                        <Text style={styles.groupGoalBullet}>•</Text>
                        <Text style={styles.groupGoalBulletText}>{goalTitle}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Invite link - above friends/participants list */}
              {(() => {
                const webBase = getInviteWebBaseUrl();
                const inviteUrl = webBase
                  ? `${webBase}/join/${currentGoalList.id}`
                  : `bttrtogether://join/${currentGoalList.id}`;
                const handleShareInvite = async () => {
                  try {
                    if (webBase) {
                      await Share.share({ message: inviteUrl, title: 'Join my challenge' });
                    } else {
                      const message = `Join my challenge "${currentGoalList.name}" on Bttr Together: ${inviteUrl}`;
                      const asset = Asset.fromModule(require('../assets/fsf.png'));
                      await asset.downloadAsync();
                      await Share.share({
                        message,
                        ...(asset.localUri && { url: asset.localUri }),
                        title: 'Join my challenge',
                      });
                    }
                  } catch (e) {
                    if (e.message && !e.message.includes('cancel')) Alert.alert('Error', 'Could not share.');
                  }
                };
                return (
                  <TouchableOpacity style={styles.overlayInviteLinkButton} onPress={handleShareInvite}>
                    <Ionicons name="share-outline" size={20} color="#ffffff" />
                    <Text style={styles.overlayInviteLinkText}>Invite link</Text>
                  </TouchableOpacity>
                );
              })()}
              
              {/* For Punishment Goals: Match money overlay structure */}
              {currentGoalList.consequence_type === 'punishment' ? (
                <>
                  {/* Status Section */}
                  <View style={styles.statusSection}>
                    <Text style={styles.statusSectionTitle}>Status</Text>
                    <ScrollView style={styles.statusParticipantsList} showsVerticalScrollIndicator={false}>
                      {participantsForThisList.length > 0 ? participantsForThisList.map((participant) => {
                        const profile = participant.profile || {};
                        const isCurrentUser = participant.user_id === currentUser?.id;
                        const hasAccepted = participant.payment_status === 'paid';
                        
                        return (
                          <View key={participant.id} style={styles.youStatusItemNoBox}>
                            <View style={styles.youStatusLeft}>
                              <View style={styles.youStatusAvatar}>
                                {getAvatarDisplayUrl(profile.avatar_url) ? (
                                  <Image 
                                    source={{ uri: getAvatarDisplayUrl(profile.avatar_url) }} 
                                    style={styles.youStatusAvatarImage}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Text style={styles.youStatusAvatarEmoji}>👤</Text>
                                )}
                              </View>
                              <View style={styles.youStatusInfo}>
                                <Text style={styles.youStatusName}>
                                  {profile.name || 'User'}
                                  {isCurrentUser && ' (You)'}
                                </Text>
                                <Text style={styles.youStatusUsername}>
                                  {profile.username?.replace('@', '') || 'username'}
                                </Text>
                                {/* Personal Goals for this participant */}
                                {participantPersonalGoals[participant.user_id] && participantPersonalGoals[participant.user_id].length > 0 && (
                                  <View style={styles.participantPersonalGoalsList}>
                                    {participantPersonalGoals[participant.user_id].map((goalTitle, idx) => (
                                      <View key={idx} style={styles.participantPersonalGoalItem}>
                                        <Text style={styles.participantPersonalGoalBullet}>•</Text>
                                        <Text style={styles.participantPersonalGoalText}>{goalTitle}</Text>
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                            </View>
                            <View style={styles.youStatusRight}>
                              {isCurrentUser ? (
                                hasAccepted ? (
                                  <Text style={styles.youStatusBadgeTextPaid}>
                                    Accepted
                                  </Text>
                                ) : (
                                  <TouchableOpacity 
                                    onPress={async () => {
                                      if (!hasPersonalGoals) {
                                        navigation.navigate('AddGoals', {
                                          goalListId: currentGoalList.id,
                                          goalListName: currentGoalList.name,
                                          consequenceType: currentGoalList.consequence_type,
                                        });
                                      } else {
                                        navigation.navigate('AddGoals', {
                                          goalListId: currentGoalList.id,
                                          goalListName: currentGoalList.name,
                                          consequenceType: currentGoalList.consequence_type,
                                        });
                                      }
                                    }}
                                  >
                                    <Text style={styles.youStatusBadgeTextAction}>
                                      Continue
                                    </Text>
                                  </TouchableOpacity>
                                )
                              ) : (
                                <>
                                  <Text style={hasAccepted ? styles.youStatusBadgeTextPaid : styles.youStatusBadgeText}>
                                    {hasAccepted ? 'Accepted' : 'Not Accepted'}
                                  </Text>
                                  {!goalListStarted && isOwner && (
                                    <TouchableOpacity
                                      onPress={() => handleRemoveParticipant(participant)}
                                      style={styles.removeParticipantButton}
                                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons name="person-remove-outline" size={22} color="#f44336" />
                                    </TouchableOpacity>
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                        );
                      }) : (
                        <View style={styles.youStatusItemNoBox}>
                          <Text style={styles.youStatusName}>Loading participants...</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                  
                  {/* Start Button or Waiting Message - Show when all participants have paid */}
                  {allParticipantsPaid && hasOtherParticipants && (
                    <View style={styles.startButtonContainer}>
                      {isOwner ? (
                        <TouchableOpacity 
                          style={styles.startButton}
                          onPress={handleStartGoalList}
                        >
                          <Text style={styles.startButtonText}>Begin</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.waitingForOwnerText}>Waiting for owner to start</Text>
                      )}
                    </View>
                  )}
                  
                  {/* Add User Section */}
                  {!goalListStarted && isOwner && (
                    <View style={styles.addUserSection}>
                      <Text style={styles.addUserText}>
                        Add at least one friend to start
                      </Text>
                      
                      {/* Search Input */}
                      <View style={styles.friendsSearchContainer}>
                        <Ionicons name="search" size={20} color="#888888" style={styles.searchIcon} />
                        <TextInput
                          style={styles.friendsSearchInput}
                          placeholder="Search friends by name..."
                          placeholderTextColor="#666666"
                          value={friendsSearchQuery}
                          onChangeText={setFriendsSearchQuery}
                        />
                        {friendsSearchQuery.length > 0 && (
                          <TouchableOpacity
                            onPress={() => {
                              setFriendsSearchQuery('');
                              setFriendsSearchResults([]);
                            }}
                            style={styles.clearSearchButton}
                          >
                            <Ionicons name="close-circle" size={20} color="#888888" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Friends List */}
                      <ScrollView style={styles.friendsListContainer} showsVerticalScrollIndicator={false}>
                        {searchingFriends ? (
                          <View style={styles.friendsLoadingContainer}>
                            <Text style={styles.friendsLoadingText}>Searching...</Text>
                          </View>
                        ) : friendsSearchQuery.trim() ? (
                          // Show search results
                          friendsSearchResults.length > 0 ? (
                            friendsSearchResults.map((friend) => {
                              const isAlreadyAdded = friend.isAlreadyAdded || false;
                              return (
                                <TouchableOpacity
                                  key={friend.id}
                                  style={[styles.friendListItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {getAvatarDisplayUrl(friend.avatar_url) ? (
                                        <Image 
                                          source={{ uri: getAvatarDisplayUrl(friend.avatar_url) }} 
                                          style={styles.friendItemAvatarImage}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <Text style={styles.friendItemAvatarEmoji}>👤</Text>
                                      )}
                                    </View>
                                    <View style={styles.friendItemInfo}>
                                      <Text style={styles.friendItemName}>
                                        {friend.name || 'User'}
                                      </Text>
                                      <Text style={styles.friendItemUsername}>
                                        {friend.username?.replace('@', '') || 'username'}
                                      </Text>
                                    </View>
                                  </View>
                                  {isAlreadyAdded ? (
                                    <View style={styles.alreadyAddedContainer}>
                                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                                      <Text style={styles.alreadyAddedText}>Added</Text>
                                    </View>
                                  ) : (
                                    <Ionicons name="add-circle" size={24} color="#4CAF50" />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          ) : (
                            <View style={styles.friendsEmptyContainer}>
                              <Text style={styles.friendsEmptyText}>No users found</Text>
                            </View>
                          )
                        ) : (
                          // Show all available friends
                          availableFriends.length > 0 ? (
                            availableFriends.map((friend) => {
                              const isAlreadyAdded = friend.isAlreadyAdded || false;
                              return (
                                <TouchableOpacity
                                  key={friend.id}
                                  style={[styles.friendListItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {getAvatarDisplayUrl(friend.avatar_url) ? (
                                        <Image
                                          source={{ uri: getAvatarDisplayUrl(friend.avatar_url) }}
                                          style={styles.friendItemAvatarImage}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <Text style={styles.friendItemAvatarEmoji}>👤</Text>
                                      )}
                                    </View>
                                    <View style={styles.friendItemInfo}>
                                      <Text style={styles.friendItemName}>
                                        {friend.name || 'User'}
                                      </Text>
                                      <Text style={styles.friendItemUsername}>
                                        {friend.username?.replace('@', '') || 'username'}
                                      </Text>
                                    </View>
                                  </View>
                                  {isAlreadyAdded ? (
                                    <View style={styles.alreadyAddedContainer}>
                                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                                      <Text style={styles.alreadyAddedText}>Added</Text>
                                    </View>
                                  ) : (
                                    <Ionicons name="add-circle" size={24} color="#4CAF50" />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          ) : (
                            <View style={styles.friendsEmptyContainer}>
                              <Text style={styles.friendsEmptyText}>No friends available</Text>
                            </View>
                          )
                        )}
                      </ScrollView>
                    </View>
                  )}
                </>
              ) : (
                // Money Goals: Keep existing layout
                <>
                  {/* Status Section */}
                  <View style={styles.statusSection}>
                    <Text style={styles.statusSectionTitle}>Status</Text>
                    <ScrollView style={styles.statusParticipantsList} showsVerticalScrollIndicator={false}>
                      {participantsForThisList.length > 0 ? participantsForThisList.map((participant) => {
                        const profile = participant.profile || {};
                        const isCurrentUser = participant.user_id === currentUser?.id;
                        const hasPaid = participant.payment_status === 'paid';
                        
                        return (
                          <View key={participant.id} style={styles.youStatusItemNoBox}>
                            <View style={styles.youStatusLeft}>
                              <View style={styles.youStatusAvatar}>
                                {getAvatarDisplayUrl(profile.avatar_url) ? (
                                  <Image 
                                    source={{ uri: getAvatarDisplayUrl(profile.avatar_url) }} 
                                    style={styles.youStatusAvatarImage}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Text style={styles.youStatusAvatarEmoji}>👤</Text>
                                )}
                              </View>
                              <View style={styles.youStatusInfo}>
                                <Text style={styles.youStatusName}>
                                  {profile.name || 'User'}
                                  {isCurrentUser && ' (You)'}
                                </Text>
                                <Text style={styles.youStatusUsername}>
                                  {profile.username?.replace('@', '') || 'username'}
                                </Text>
                                {/* Personal Goals for this participant */}
                                {participantPersonalGoals[participant.user_id] && participantPersonalGoals[participant.user_id].length > 0 && (
                                  <View style={styles.participantPersonalGoalsList}>
                                    {participantPersonalGoals[participant.user_id].map((goalTitle, idx) => (
                                      <View key={idx} style={styles.participantPersonalGoalItem}>
                                        <Text style={styles.participantPersonalGoalBullet}>•</Text>
                                        <Text style={styles.participantPersonalGoalText}>{goalTitle}</Text>
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                            </View>
                            <View style={styles.youStatusRight}>
                              {isCurrentUser ? (
                                hasPaid ? (
                                  <Text style={styles.youStatusBadgeTextPaid}>
                                    Paid
                                  </Text>
                                ) : (
                                  <TouchableOpacity 
                                    style={styles.proceedButtonSmall}
                                    onPress={() => {
                                      if (!hasPersonalGoals) {
                                        navigation.navigate('AddGoals', {
                                          goalListId: currentGoalList.id,
                                          goalListName: currentGoalList.name,
                                          consequenceType: currentGoalList.consequence_type,
                                        });
                                      } else {
                                        navigation.navigate('GroupGoalPayment', {
                                          goalListId: currentGoalList.id,
                                          amount: currentGoalList.amount,
                                          goalListName: currentGoalList.name,
                                        });
                                      }
                                    }}
                                  >
                                    <Text style={styles.proceedButtonSmallText}>
                                      Continue
                                    </Text>
                                  </TouchableOpacity>
                                )
                              ) : (
                                <>
                                  <Text style={hasPaid ? styles.youStatusBadgeTextPaid : styles.youStatusBadgeText}>
                                    {hasPaid ? 'Paid' : 'Not Paid'}
                                  </Text>
                                  {!goalListStarted && isOwner && (
                                    <TouchableOpacity
                                      onPress={() => handleRemoveParticipant(participant)}
                                      style={styles.removeParticipantButton}
                                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons name="person-remove-outline" size={22} color="#f44336" />
                                    </TouchableOpacity>
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                        );
                      }) : (
                        <View style={styles.youStatusItemNoBox}>
                          <Text style={styles.youStatusName}>Loading participants...</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                  
                  {/* Start Button or Waiting Message - Show when all participants have paid */}
                  {allParticipantsPaid && hasOtherParticipants && (
                    <View style={styles.startButtonContainer}>
                      {isOwner ? (
                        <TouchableOpacity 
                          style={styles.startButton}
                          onPress={handleStartGoalList}
                        >
                          <Text style={styles.startButtonText}>Begin</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.waitingForOwnerText}>Waiting for owner to start</Text>
                      )}
                    </View>
                  )}

                  {/* ── WINNER ZONE (money goals only) ─────────────────────── */}
                  {currentGoalList.consequence_type === 'money' && allParticipantsPaid && (declaredWinnerId || (declaredTieWinnerIds && declaredTieWinnerIds.length > 1)) && (() => {
                    const isTie = declaredTieWinnerIds && declaredTieWinnerIds.length > 1;
                    const fullPrize = currentGoalList.prize_pool_amount || (currentGoalList.total_pot || 0) * 0.9;
                    const shareAmount = isTie ? fullPrize / declaredTieWinnerIds.length : fullPrize;
                    const isWinner = isTie ? declaredTieWinnerIds.includes(currentUser?.id) : declaredWinnerId === currentUser?.id;
                    return (
                      <View style={styles.winnerZone}>
                        <View style={styles.winnerAnnouncementBox}>
                          <Ionicons name="trophy" size={28} color="#FFD700" />
                          <Text style={styles.winnerAnnouncementText}>
                            {isTie
                              ? (isWinner ? '🎉 You won (tie)! Claim your share.' : `${declaredTieWinnerIds.map(id => participants.find(p => p.user_id === id)?.profile?.name || 'Someone').join(', ')} won (tie)!`)
                              : (isWinner ? '🎉 You won this challenge!' : `${participants.find(p => p.user_id === declaredWinnerId)?.profile?.name || 'Someone'} won!`)}
                          </Text>
                          {isWinner && (
                            <TouchableOpacity
                              style={styles.claimButton}
                              onPress={() =>
                                navigation.navigate('Payout', {
                                  goalListId:   currentGoalList.id,
                                  goalListName: currentGoalList.name,
                                  totalAmount:  String(currentGoalList.total_pot || 0),
                                })
                              }
                            >
                              <Ionicons name="cash-outline" size={18} color="#ffffff" />
                              <Text style={styles.claimButtonText}>
                                {isTie ? `Claim your share ($${shareAmount.toFixed(2)})` : `Claim $${shareAmount.toFixed(2)}`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })()}

                  {/* ── DARE FOR LOSER (punishment goals only) ───────────────── */}
                  {currentGoalList.consequence_type === 'punishment' && (declaredWinnerId || (declaredTieWinnerIds && declaredTieWinnerIds.length > 1)) && currentGoalList.consequence && (() => {
                    const isWinner = declaredWinnerId === currentUser?.id || (declaredTieWinnerIds && declaredTieWinnerIds.includes(currentUser?.id));
                    const isLoser = currentUser?.id && !isWinner;
                    return (
                      <View style={styles.winnerZone}>
                        <View style={styles.loserAnnouncementBox}>
                          {isLoser ? (
                            <>
                              <Ionicons name="warning" size={28} color="#FF9800" />
                              <Text style={styles.winnerAnnouncementText}>Your dare</Text>
                              <Text style={styles.dareText}>{currentGoalList.consequence}</Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.winnerAnnouncementText}>
                                {(declaredTieWinnerIds && declaredTieWinnerIds.length > 1)
                                  ? `${declaredTieWinnerIds.map(id => participants.find(p => p.user_id === id)?.profile?.name || 'Someone').join(', ')} won (tie)!`
                                  : `${participants.find(p => p.user_id === declaredWinnerId)?.profile?.name || 'Someone'} won!`}
                              </Text>
                              <Text style={styles.dareSubtext}>The dare goes to everyone else:</Text>
                              <Text style={styles.dareText}>{currentGoalList.consequence}</Text>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })()}

                  {/* Add User Section */}
                  {!goalListStarted && isOwner && (
                    <View style={styles.addUserSection}>
                      <Text style={styles.addUserText}>
                        Add at least one friend to start
                      </Text>
                      
                      {/* Search Input */}
                      <View style={styles.friendsSearchContainer}>
                        <Ionicons name="search" size={20} color="#888888" style={styles.searchIcon} />
                        <TextInput
                          style={styles.friendsSearchInput}
                          placeholder="Search friends by name..."
                          placeholderTextColor="#666666"
                          value={friendsSearchQuery}
                          onChangeText={setFriendsSearchQuery}
                        />
                        {friendsSearchQuery.length > 0 && (
                          <TouchableOpacity
                            onPress={() => {
                              setFriendsSearchQuery('');
                              setFriendsSearchResults([]);
                            }}
                            style={styles.clearSearchButton}
                          >
                            <Ionicons name="close-circle" size={20} color="#888888" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Friends List */}
                      <ScrollView style={styles.friendsListContainer} showsVerticalScrollIndicator={false}>
                        {searchingFriends ? (
                          <View style={styles.friendsLoadingContainer}>
                            <Text style={styles.friendsLoadingText}>Searching...</Text>
                          </View>
                        ) : friendsSearchQuery.trim() ? (
                          // Show search results
                          friendsSearchResults.length > 0 ? (
                            friendsSearchResults.map((friend) => {
                              const isAlreadyAdded = friend.isAlreadyAdded || false;
                              return (
                                <TouchableOpacity
                                  key={friend.id}
                                  style={[styles.friendListItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {getAvatarDisplayUrl(friend.avatar_url) ? (
                                        <Image
                                          source={{ uri: getAvatarDisplayUrl(friend.avatar_url) }}
                                          style={styles.friendItemAvatarImage}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <Text style={styles.friendItemAvatarEmoji}>👤</Text>
                                      )}
                                    </View>
                                    <View style={styles.friendItemInfo}>
                                      <Text style={styles.friendItemName}>
                                        {friend.name || 'User'}
                                      </Text>
                                      <Text style={styles.friendItemUsername}>
                                        {friend.username?.replace('@', '') || 'username'}
                                      </Text>
                                    </View>
                                  </View>
                                  {isAlreadyAdded ? (
                                    <View style={styles.alreadyAddedContainer}>
                                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                                      <Text style={styles.alreadyAddedText}>Added</Text>
                                    </View>
                                  ) : (
                                    <Ionicons name="add-circle" size={24} color="#4CAF50" />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          ) : (
                            <View style={styles.friendsEmptyContainer}>
                              <Text style={styles.friendsEmptyText}>No users found</Text>
                            </View>
                          )
                        ) : (
                          // Show all available friends
                          availableFriends.length > 0 ? (
                            availableFriends.map((friend) => {
                              const isAlreadyAdded = friend.isAlreadyAdded || false;
                              return (
                                <TouchableOpacity
                                  key={friend.id}
                                  style={[styles.friendListItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {getAvatarDisplayUrl(friend.avatar_url) ? (
                                        <Image
                                          source={{ uri: getAvatarDisplayUrl(friend.avatar_url) }}
                                          style={styles.friendItemAvatarImage}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <Text style={styles.friendItemAvatarEmoji}>👤</Text>
                                      )}
                                    </View>
                                    <View style={styles.friendItemInfo}>
                                      <Text style={styles.friendItemName}>
                                        {friend.name || 'User'}
                                      </Text>
                                      <Text style={styles.friendItemUsername}>
                                        {friend.username?.replace('@', '') || 'username'}
                                      </Text>
                                    </View>
                                  </View>
                                  {isAlreadyAdded ? (
                                    <View style={styles.alreadyAddedContainer}>
                                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                                      <Text style={styles.alreadyAddedText}>Added</Text>
                                    </View>
                                  ) : (
                                    <Ionicons name="add-circle" size={24} color="#4CAF50" />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          ) : (
                            <View style={styles.friendsEmptyContainer}>
                              <Text style={styles.friendsEmptyText}>No friends available</Text>
                            </View>
                          )
                        )}
                      </ScrollView>
                    </View>
                  )}
                </>
              )}
              
              </ScrollView>
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 50,
  },
  dateContainer: {
    position: 'absolute',
    top: 80,
    left: 20,
    zIndex: 10001,
    elevation: 10001,
  },
  dateText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  switcherContainer: {
    position: 'absolute',
    top: 80,
    right: 20,
    zIndex: 10001,
    elevation: 10001,
  },
  switcherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topRightIcons: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  challengesContainer: {
    paddingTop: 80,
    paddingBottom: 100,
  },
  pillContainer: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  pill: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333333',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownIcon: {
    marginLeft: 8,
  },
  countdownsContainerOuter: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  durationContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 6,
    width: '100%',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  durationLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  durationValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cccccc',
  },
  countdownContainerOuter: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 4,
    width: '100%',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countdownValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10002,
    elevation: 10002,
  },
  dropdownMenuContainer: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    width: 200,
    zIndex: 10003,
    elevation: 10003,
  },
  dropdownMenu: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  dropdownItemSelected: {
    backgroundColor: '#2a2a2a',
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#ffffff',
  },
  dropdownItemTextSelected: {
    fontWeight: '500',
  },
  friendsScrollView: {
    paddingTop: 30,
    marginBottom: 20,
    backgroundColor: 'transparent', // Ensure no background
  },
  friendsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    gap: 40,
    backgroundColor: 'transparent', // Ensure no background
  },
  friendItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 64,
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
  },
  avatarWithProgress: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 8,
  },
  progressRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  avatarEmoji: {
    fontSize: 32,
    zIndex: 1,
  },
  avatarImageInRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    zIndex: 1,
  },
  friendName: {
    fontSize: 12,
    fontWeight: '400',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 4,
    width: 64,
  },
  friendActivityModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  friendActivityModalContent: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    marginTop: 56,
    marginHorizontal: 12,
    marginBottom: 24,
    borderRadius: 20,
  },
  friendActivityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  friendActivityAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  friendActivityAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  friendActivityAvatarEmoji: {
    fontSize: 24,
  },
  friendActivityModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  friendActivityModalSubtitle: {
    fontSize: 13,
    color: '#888888',
    marginTop: 2,
  },
  friendActivityModalClose: {
    padding: 8,
  },
  friendActivityLoading: {
    padding: 40,
    alignItems: 'center',
  },
  friendActivityLoadingText: {
    fontSize: 15,
    color: '#888888',
  },
  friendActivityScroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  friendActivitySection: {
    marginBottom: 20,
  },
  friendActivitySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888888',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  friendActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 6,
  },
  friendActivityRowText: {
    flex: 1,
    fontSize: 14,
    color: '#e0e0e0',
    lineHeight: 20,
  },
  friendActivityEmpty: {
    fontSize: 15,
    color: '#888888',
    textAlign: 'center',
    paddingVertical: 32,
  },
  goalsListContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: 20,
  },
  goalItemContainer: {
    gap: 12,
    marginBottom: 16,
  },
  goalPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalPill: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#333333',
    marginRight: 12,
  },
  goalPillText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#ffffff',
  },
  viewersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    gap: 12,
  },
  validationCount: {
    fontSize: 13,
    fontWeight: '400',
    color: '#888888',
  },
  viewersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  viewersSectionColumn: {
    flexDirection: 'column',
    marginTop: 12,
    width: '100%',
  },
  viewersSectionFirstRow: {
    marginTop: 0,
  },
  validatorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  validatorsLabel: {
    fontSize: 12,
    color: '#888888',
    marginRight: 8,
  },
  validatorsAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  validatorAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  validatorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  validatorAvatarEmoji: {
    fontSize: 16,
  },
  viewersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewersRowValidate: {
    width: '100%',
    justifyContent: 'space-between',
  },
  viewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerEmoji: {
    fontSize: 18,
  },
  validationContainer: {
    gap: 12,
  },
  validationUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  validationAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  validationAvatarEmoji: {
    fontSize: 20,
  },
  validationUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  validationTaskTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#ffffff',
  },
  validationBio: {
    fontSize: 14,
    fontWeight: '400',
    color: '#888888',
    marginTop: -4,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 12,
  },
  postProofImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    marginTop: 12,
    overflow: 'hidden',
  },
  postProofMedia: {
    width: '100%',
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  proofMediaContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  proofVideoContainer: {
    minHeight: 220,
  },
  proofVideo: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  proofImageNatural: {
    width: '100%',
    maxHeight: 400,
    borderRadius: 12,
  },
  postProofGallery: {
    marginTop: 12,
  },
  postProofGalleryContent: {
    paddingRight: 16,
  },
  postProofImageWrap: {
    marginRight: 12,
  },
  proofPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  proofPlaceholderText: {
    marginTop: 8,
    fontSize: 13,
    color: '#666666',
  },
  postInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  postDate: {
    fontSize: 14,
    fontWeight: '400',
    color: '#888888',
  },
  validateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#444444',
  },
  validateButtonSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444444',
  },
  validateButtonDone: {
    backgroundColor: '#1a3a2a',
    borderColor: '#4CAF50',
  },
  validateButtonActive: {
    backgroundColor: '#1a3a2a',
    borderColor: '#4CAF50',
  },
  validateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  validateButtonSmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  validateButtonTextActive: {
    color: '#4CAF50',
  },
  validateButtonTextOnly: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  validateButtonTextOnlyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },
  validateButtonTextOnlyTextActive: {
    color: '#4CAF50',
  },
  postHeaderWithGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    width: '100%',
  },
  postHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  postGoalNameWrap: {
    marginLeft: 12,
    maxWidth: '50%',
    flexShrink: 0,
  },
  postGoalNameLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#cccccc',
    textAlign: 'right',
  },
  postSeparator: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginTop: 12,
    marginBottom: 12,
  },
  otherUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  otherUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  otherUserAvatarEmoji: {
    fontSize: 24,
  },
  otherUserInfo: {
    flex: 1,
  },
  otherUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  otherUserUsername: {
    fontSize: 13,
    color: '#888888',
  },
  otherUserGoalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 8,
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  otherUserAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupGoalParticipantsList: {
    marginTop: 12,
    marginBottom: 4,
  },
  groupGoalParticipantsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 8,
    gap: 12,
  },
  groupGoalParticipantRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  groupGoalParticipantSpacer: {
    flex: 1,
    minWidth: 0,
  },
  groupGoalParticipantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupGoalParticipantAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  groupGoalParticipantAvatarEmoji: {
    fontSize: 16,
  },
  groupGoalParticipantName: {
    fontSize: 14,
    color: '#e0e0e0',
    flex: 1,
    minWidth: 0,
  },
  groupGoalParticipantStatus: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherUserGoalByLabel: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  statusContainerReadOnly: {
    opacity: 1,
  },
  postCaption: {
    fontSize: 15,
    color: '#ffffff',
    marginTop: 12,
    marginBottom: 8,
    lineHeight: 20,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#666666',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  statusContainer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 0.5,
  },
  statusTextCompleted: {
    color: '#4CAF50',
  },
  statusTextWaiting: {
    color: '#FF9800',
  },
  personalGoalsContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
    flex: 1,
  },
  personalGoalItem: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  otherUserPostItem: {
    marginTop: 20,
    marginBottom: 20,
  },
  postSpacing: {
    marginBottom: 16,
  },
  goalTitleText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  goalTypeLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888888',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  historyCarousel: {
    marginTop: 12,
  },
  historyCarouselContainer: {
    paddingHorizontal: 4,
    gap: 4,
  },
  historyColumn: {
    gap: 4,
  },
  historySquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  historySquareCompleted: {
    backgroundColor: '#4CAF50',
  },
  historySquareIncomplete: {
    backgroundColor: '#2a2a2a',
  },
  historySquareFuture: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  historySquareToday: {
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  addGoalText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 1.2,
  },
  addGoalModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  addGoalModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addGoalModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  addGoalInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 20,
  },
  addGoalModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888888',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#2a2a2a',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  addButtonTextDisabled: {
    color: '#666666',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 28,
  },
  emptyStateLogo: {
    width: 80,
    height: 80,
    marginBottom: 28,
  },
  emptyStateQuote: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  emptyStateQuoteAuthor: {
    fontSize: 13,
    color: '#555555',
    textAlign: 'center',
    marginTop: 8,
  },
  paymentOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  paymentOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  paymentOverlayContent: {
    width: '90%',
    maxWidth: 420,
    height: '90%',
    maxHeight: '90%',
    zIndex: 10000,
    elevation: 10000,
  },
  paymentOverlayScroll: {
    flex: 1,
  },
  paymentOverlayScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 40,
  },
  groupGoalsListContainer: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  groupGoalsListTitle: {
    fontSize: 12,
    color: '#ffffff',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  groupGoalsBulletList: {
    gap: 4,
  },
  groupGoalBulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  groupGoalBullet: {
    fontSize: 10,
    color: '#ffffff',
    marginTop: 2,
  },
  groupGoalBulletText: {
    fontSize: 10,
    color: '#ffffff',
    flex: 1,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  participantPersonalGoalsList: {
    marginTop: 6,
    gap: 2,
  },
  participantPersonalGoalItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  participantPersonalGoalBullet: {
    fontSize: 10,
    color: '#ffffff',
    marginTop: 2,
  },
  participantPersonalGoalText: {
    fontSize: 10,
    color: '#ffffff',
    flex: 1,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  totalAmountContainer: {
    alignItems: 'center',
    marginBottom: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  totalAmountLabel: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  totalAmountValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#4CAF50',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  totalAmountSubtext: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '500',
  },
  overlayInviteLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444444',
    alignSelf: 'center',
  },
  overlayInviteLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  statusSection: {
    marginBottom: 28,
  },
  statusSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 18,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statusParticipantsList: {
    maxHeight: 300,
  },
  youStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f0f',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  youStatusItemNoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  youStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  youStatusAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333333',
  },
  youStatusAvatarImage: {
    width: '100%',
    height: '100%',
  },
  youStatusAvatarEmoji: {
    fontSize: 30,
  },
  youStatusInfo: {
    flex: 1,
  },
  youStatusLabel: {
    fontSize: 11,
    color: '#888888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  youStatusName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  youStatusUsername: {
    fontSize: 14,
    color: '#888888',
    fontWeight: '500',
  },
  youStatusRight: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeParticipantButton: {
    marginLeft: 8,
    padding: 4,
  },
  youStatusBadge: {
    // No background, border, or padding - just text
  },
  youStatusBadgePaid: {
    // No background, border, or padding - just text
  },
  youStatusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  youStatusBadgeTextAction: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  youStatusBadgeTextPaid: {
    color: '#4CAF50',
  },
  startButtonContainer: {
    marginTop: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  waitingForOwnerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Winner Zone styles ──────────────────────────────────────────────────
  winnerZone: {
    marginTop: 16,
    gap: 12,
  },
  winnerAnnouncementBox: {
    backgroundColor: '#1a1500',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFD700',
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  winnerAnnouncementText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 8,
    marginTop: 4,
  },
  claimButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  loserAnnouncementBox: {
    backgroundColor: '#1a1508',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FF9800',
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  dareText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 4,
  },
  dareSubtext: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    marginTop: 4,
  },
  // ── End Winner Zone ─────────────────────────────────────────────────────

  otherUsersSection: {
    marginBottom: 24,
  },
  otherUsersTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  otherUsersList: {
    maxHeight: 280,
  },
  otherUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f0f',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  otherUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  otherUserAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333333',
  },
  otherUserAvatarImage: {
    width: '100%',
    height: '100%',
  },
  otherUserAvatarEmoji: {
    fontSize: 24,
  },
  otherUserInfo: {
    flex: 1,
  },
  otherUserName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  otherUserUsername: {
    fontSize: 13,
    color: '#888888',
    fontWeight: '500',
  },
  otherUserRight: {
    marginLeft: 12,
  },
  otherUserBadge: {
    backgroundColor: '#2a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ff4444',
  },
  otherUserBadgePaid: {
    backgroundColor: '#1a3a2a',
    borderColor: '#4CAF50',
  },
  otherUserBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  otherUserBadgeTextPaid: {
    color: '#4CAF50',
  },
  punishmentParticipantsSection: {
    marginTop: 8,
  },
  punishmentParticipantsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  punishmentParticipantsList: {
    maxHeight: 400,
  },
  punishmentParticipantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  punishmentParticipantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  punishmentParticipantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333333',
  },
  punishmentParticipantAvatarImage: {
    width: '100%',
    height: '100%',
  },
  punishmentParticipantAvatarEmoji: {
    fontSize: 24,
  },
  punishmentParticipantInfo: {
    flex: 1,
  },
  punishmentParticipantName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  punishmentParticipantUsername: {
    fontSize: 13,
    color: '#888888',
    fontWeight: '500',
  },
  punishmentParticipantRight: {
    marginLeft: 12,
  },
  punishmentStatusAccept: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff4444',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  punishmentStatusAccepted: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  punishmentStatusNotAccepted: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addUserSection: {
    padding: 24,
    marginBottom: 24,
  },
  addUserText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
    fontWeight: '500',
  },
  friendsSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  friendsSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
  },
  clearSearchButton: {
    marginLeft: 8,
    padding: 4,
  },
  friendsListContainer: {
    maxHeight: 300,
  },
  friendsLoadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  friendsLoadingText: {
    color: '#888888',
    fontSize: 14,
    marginTop: 8,
  },
  friendsEmptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  friendsEmptyText: {
    color: '#666666',
    fontSize: 14,
  },
  friendListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f0f',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 12,
  },
  friendItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendItemAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  friendItemAvatarImage: {
    width: '100%',
    height: '100%',
  },
  friendItemAvatarEmoji: {
    fontSize: 20,
  },
  friendItemInfo: {
    flex: 1,
  },
  friendItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  friendItemUsername: {
    fontSize: 14,
    color: '#888888',
  },
  friendItemAdded: {
    opacity: 0.6,
  },
  alreadyAddedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alreadyAddedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  addUserButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 36,
    borderRadius: 14,
    gap: 10,
    width: '100%',
    shadowColor: '#4CAF50',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addUserButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  addUserButtonTextOnly: {
    paddingVertical: 8,
  },
  addUserButtonTextUnderlined: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textDecorationLine: 'underline',
    letterSpacing: 0.5,
  },
  paymentOverlayTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 24,
  },
  participantsList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  participantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  participantAvatarImage: {
    width: '100%',
    height: '100%',
  },
  participantAvatarEmoji: {
    fontSize: 24,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  participantUsername: {
    fontSize: 13,
    color: '#888888',
  },
  paymentStatusBadge: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444444',
  },
  paymentStatusBadgePaid: {
    backgroundColor: '#1a3a2a',
    borderColor: '#4CAF50',
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
  },
  paymentStatusTextPaid: {
    color: '#4CAF50',
  },
  paymentRequiredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
  paymentRequiredTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  paymentRequiredText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  payNowButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    paddingHorizontal: 36,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#4CAF50',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  payNowButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  proceedButtonSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  proceedButtonSmallText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});

