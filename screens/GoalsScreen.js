import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Animated, TextInput, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { supabase } from '../lib/supabase';

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

export default function GoalsScreen({ navigation }) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [addGoalModalVisible, setAddGoalModalVisible] = useState(false);
  const [editGoalModalVisible, setEditGoalModalVisible] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [newGoalName, setNewGoalName] = useState('');
  const [timeRemainingDay, setTimeRemainingDay] = useState('');
  const [loading, setLoading] = useState(true);
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
  const [hasPersonalGoals, setHasPersonalGoals] = useState(false); // Track if current user has personal goals
  const [groupGoals, setGroupGoals] = useState([]); // Group goals for the current goal list
  const [participantPersonalGoals, setParticipantPersonalGoals] = useState({}); // { userId: [goals] }
  const [goalListStarted, setGoalListStarted] = useState(false); // Track if goal list has been started
  const [declaredWinnerId, setDeclaredWinnerId] = useState(null); // winner_id from goal_lists
  const [declaringWinner, setDeclaringWinner] = useState(false); // loading for declare winner action
  const [showWinnerPicker, setShowWinnerPicker] = useState(false); // show participant picker modal
  
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

  // Reload goals when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadGoals();
      if (currentGoalList) {
        checkOwnerPaymentStatus();
      }
    }, [currentGoalList])
  );

  // Reload goals when current goal list changes
  useEffect(() => {
    if (currentGoalList) {
      // Reset started state when goal list changes
      setGoalListStarted(false);
      
      // Run both async functions in parallel for faster loading
      setSwitchingGoal(true);
      Promise.all([
        loadGoalsForCurrentList(),
        checkOwnerPaymentStatus(),
        loadGroupGoals()
      ]).finally(() => {
        setSwitchingGoal(false);
      });
    }
  }, [currentGoalList]);

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
      
      // Check if user is the owner
      if (currentGoalList.user_id !== user.id) {
        Alert.alert('Error', 'Only the goal list creator can start the challenge');
        return;
      }
      
      // Update goal list to mark it as started
      // Try to update all_paid, but if it doesn't exist, we'll use a different approach
      // For now, we'll just reload the data - the started state can be determined by checking if all participants paid
      // You can add a 'started_at' timestamp column later if needed
      
      // Mark goal list as started
      setGoalListStarted(true);
      
      // Reload the goal list to get updated data
      const { data: updatedGoalList } = await supabase
        .from('goal_lists')
        .select('*')
        .eq('id', currentGoalList.id)
        .single();
      
      if (updatedGoalList) {
        setCurrentGoalList(updatedGoalList);
      }
      
      Alert.alert('Success', 'Goal list started! All participants can now track their progress.');
      
      // Reload goals to show them
      await loadGoalsForCurrentList();
      await checkOwnerPaymentStatus();
    } catch (error) {
      console.error('Error starting goal list:', error);
      Alert.alert('Error', 'Failed to start goal list');
    }
  };

  // ── Declare a winner (called by the goal list owner) ──────────────────────
  const handleDeclareWinner = (winnerId) => {
    if (!currentGoalList || !currentUser) return;
    if (currentGoalList.user_id !== currentUser.id) {
      Alert.alert('Error', 'Only the challenge creator can declare a winner');
      return;
    }

    const winnerProfile = participants.find(p => p.user_id === winnerId)?.profile;
    const winnerName    = winnerProfile?.name || 'this participant';

    Alert.alert(
      'Declare Winner',
      `Declare ${winnerName} as the winner? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setDeclaringWinner(true);
            try {
              const { error } = await supabase
                .from('goal_lists')
                .update({ winner_id: winnerId })
                .eq('id', currentGoalList.id)
                .eq('user_id', currentUser.id); // ensures only owner can do this

              if (error) throw error;
              setDeclaredWinnerId(winnerId);
              setShowWinnerPicker(false);
              Alert.alert('Winner Declared!', `${winnerName} has been declared the winner and can now claim their prize.`);
            } catch (err) {
              console.error('Error declaring winner:', err);
              Alert.alert('Error', err.message || 'Failed to declare winner');
            } finally {
              setDeclaringWinner(false);
            }
          },
        },
      ]
    );
  };

  // Helper function to create group goals for a participant
  const createGroupGoalsForParticipant = async (userId, goalListId) => {
    try {
      // Get creator's group goals for this goal list
      const { data: goalListData } = await supabase
        .from('goal_lists')
        .select('user_id')
        .eq('id', goalListId)
        .single();

      if (!goalListData) return;

      // Check if participant already has group goals
      const { data: existingGroupGoals } = await supabase
        .from('goals')
        .select('id')
        .eq('goal_list_id', goalListId)
        .eq('user_id', userId)
        .eq('goal_type', 'group')
        .limit(1);

      if (existingGroupGoals && existingGroupGoals.length > 0) {
        // Already has group goals, skip
        return;
      }

      // Get creator's group goals
      const { data: creatorGroupGoals } = await supabase
        .from('goals')
        .select('title')
        .eq('goal_list_id', goalListId)
        .eq('user_id', goalListData.user_id)
        .eq('goal_type', 'group')
        .order('created_at', { ascending: true });

      if (creatorGroupGoals && creatorGroupGoals.length > 0) {
        // Create group goals for the participant
        const groupGoalsToInsert = creatorGroupGoals.map(goal => ({
          user_id: userId,
          goal_list_id: goalListId,
          title: goal.title,
          goal_type: 'group',
          completed: false,
        }));

        const { error: groupGoalsError } = await supabase
          .from('goals')
          .insert(groupGoalsToInsert);

        if (groupGoalsError) {
          console.error('Error creating group goals for participant:', groupGoalsError);
        }
      }
    } catch (error) {
      console.error('Error in createGroupGoalsForParticipant:', error);
    }
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
          // Create group goals for the new participant
          await createGroupGoalsForParticipant(friend.id, currentGoalList.id);
          
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

      // Hard-coded group goal requires payment
      // Check if owner has paid for group goals
      if (currentGoalList.type === 'group') {
        // Verify user has access to this goal list (either owner or participant)
        const { data: goalListCheck } = await supabase
          .from('goal_lists')
          .select('user_id, winner_id')
          .eq('id', currentGoalList.id)
          .single();

        // Sync declared winner into local state
        if (goalListCheck?.winner_id) {
          setDeclaredWinnerId(goalListCheck.winner_id);
        }
        
        if (!goalListCheck) {
          console.error('Goal list not found or access denied');
          return;
        }
        
        // Check if user is owner or participant
        const isOwner = goalListCheck.user_id === user.id;
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

  // Load group goals and participant personal goals for the current goal list
  const loadGroupGoals = async () => {
    if (!currentGoalList) return;
    
    try {
      // Load ALL group goals for this goal list (from any user, since they should all be the same)
      const { data: groupGoalsData, error } = await supabase
        .from('goals')
        .select('title, created_at, user_id')
        .eq('goal_list_id', currentGoalList.id)
        .eq('goal_type', 'group')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading group goals:', error);
        setGroupGoals([]);
      } else {
        // Get unique group goal titles
        const seenTitles = new Set();
        const uniqueGroupGoals = [];
        groupGoalsData?.forEach(goal => {
          if (!seenTitles.has(goal.title)) {
            seenTitles.add(goal.title);
            uniqueGroupGoals.push(goal.title);
          }
        });
        setGroupGoals(uniqueGroupGoals);
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

  const loadGoalsForCurrentList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && currentGoalList) {
        // Handle hard-coded group goal
        // Check if goal list is started (all participants have paid for group goals)
        // We determine this by checking if all participants have paid_status = 'paid'
        const isStarted = currentGoalList.type === 'group' && allParticipantsPaid;
        
        let data;
        let allParticipantsGoals = [];
        
        if (isStarted && currentGoalList.type === 'group') {
          // Load all participants' goals (group and personal) for started group goal lists
          // First, get all participants
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
          
          // Load all goals from all participants
          const { data: allGoalsData, error: allGoalsError } = await supabase
            .from('goals')
            .select('*')
            .eq('goal_list_id', currentGoalList.id)
            .in('user_id', uniqueParticipantIds)
            .order('created_at', { ascending: true });
          
          if (allGoalsError) throw allGoalsError;
          
          allParticipantsGoals = allGoalsData || [];
          
          // For current user, load their goals as before
          const { data: userGoalsData, error: userGoalsError } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_list_id', currentGoalList.id)
            .order('created_at', { ascending: true });
          
          if (userGoalsError) throw userGoalsError;
          data = userGoalsData || [];
        } else {
          // For non-started or personal goals, only load current user's goals
          const { data: userGoalsData, error: userGoalsError } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_list_id', currentGoalList.id)
            .order('created_at', { ascending: true });
          
          if (userGoalsError) throw userGoalsError;
          data = userGoalsData || [];
        }

        // Get today's date string
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        // Get goal IDs - use all participants' goals if started
        const goalIdsToCheck = isStarted && currentGoalList.type === 'group' 
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
              if (isStarted && currentGoalList.type === 'group') {
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
            if (completionIds.length > 0 && currentGoalList.type === 'group') {
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
            if (currentGoalList.type === 'group') {
              const { data: participantsData } = await supabase
                .from('group_goal_participants')
                .select('user_id')
                .eq('goal_list_id', currentGoalList.id);
              
              const participantIds = [
                currentGoalList.user_id,
                ...(participantsData || []).map(p => p.user_id)
              ];
              totalValidators = [...new Set(participantIds)].length;
            }
            
            pastCompletionsData.forEach(c => {
              const dateStr = c.completed_at.includes('T') ? c.completed_at.split('T')[0] : c.completed_at;
              const key = isStarted && currentGoalList.type === 'group' 
                ? `${c.goal_id}_${c.user_id}`
                : c.goal_id;
              if (!pastCompletions[key]) {
                pastCompletions[key] = new Set();
                pastCompletionsWithValidation[key] = new Set();
              }
              pastCompletions[key].add(dateStr);
              
              // Check if this completion is validated (for group goals)
              const isValidated = currentGoalList.type === 'group' 
                ? (validationsMap[c.id] || 0) >= totalValidators && totalValidators > 0
                : true; // Personal goals are always "validated"
              
              if (isValidated) {
                pastCompletionsWithValidation[key].add(dateStr);
              }
            });
          }
        }

        // If started group goal, transform all participants' goals
        // But for group goals, only show unique ones (one per title, not one per user)
        let goalsToTransform = [];
        if (isStarted && currentGoalList.type === 'group') {
          // Separate group goals and personal goals
          const groupGoalsMap = new Map(); // title -> goal (keep first occurrence)
          const personalGoalsList = [];
          
          allParticipantsGoals.forEach(goal => {
            if (goal.goal_type === 'group') {
              // For group goals, only keep one per unique title
              if (!groupGoalsMap.has(goal.title)) {
                groupGoalsMap.set(goal.title, goal);
              }
            } else {
              // Personal goals - include all of them
              personalGoalsList.push(goal);
            }
          });
          
          // Combine unique group goals with all personal goals
          goalsToTransform = [...Array.from(groupGoalsMap.values()), ...personalGoalsList];
        } else {
          goalsToTransform = data;
        }
        
        // Transform data to match existing format
        const transformedGoals = await Promise.all(goalsToTransform.map(async (goal) => {
          const isOwnGoal = goal.user_id === user.id;
          const history = generateCompletionHistory(goal.created_at);
          const currentDayIndex = getCurrentDayIndex(goal.created_at);
          
          // Check if goal is completed today based on completion record
          const completionKey = isStarted && currentGoalList.type === 'group' 
            ? `${goal.id}_${goal.user_id}`
            : goal.id;
          const isCompletedToday = todayCompletions.has(completionKey);
          
          // Only update if it's the current user's goal
          if (isOwnGoal && goal.completed !== isCompletedToday) {
            await supabase
              .from('goals')
              .update({ completed: isCompletedToday })
              .eq('id', goal.id)
              .eq('user_id', user.id);
          }
          
          // Populate past days in history from completion records
          const pastCompletionsKey = isStarted && currentGoalList.type === 'group'
            ? `${goal.id}_${goal.user_id}`
            : goal.id;
          if (pastCompletions[pastCompletionsKey]) {
            const createdDate = new Date(goal.created_at);
            createdDate.setHours(0, 0, 0, 0);
            
            pastCompletions[pastCompletionsKey].forEach(dateStr => {
              const completionDate = new Date(dateStr);
              completionDate.setHours(0, 0, 0, 0);
              
              const dayIndex = Math.floor((completionDate - createdDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < history.length && dayIndex < currentDayIndex) {
                // Only mark as completed if validated (for group goals) or if it's a personal goal
                const isValidated = pastCompletionsWithValidation[pastCompletionsKey]?.has(dateStr) || goal.goal_type === 'personal';
                if (isValidated) {
                  history[dayIndex] = true;
                }
              }
            });
          }
          
          // Set today's completion status
          history[currentDayIndex] = isCompletedToday;
          
          // Load profile for other users' goals
          let userProfile = null;
          if (!isOwnGoal) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, name, username, avatar_url')
              .eq('id', goal.user_id)
              .single();
            userProfile = profile;
          }
          
          // Check if there's a post (completion with proof) for today
          let hasProof = false;
          let caption = null;
          let completionId = null;
          let validatedCount = 0;
          let totalValidators = 0;
          let isValidated = false;
          
          if (isCompletedToday) {
            const { data: todayCompletion } = await supabase
              .from('goal_completions')
              .select('id, proof_url')
              .eq('goal_id', goal.id)
              .eq('user_id', goal.user_id)
              .eq('completed_at', todayStr)
              .single();
            
            hasProof = !!todayCompletion?.proof_url;
            completionId = todayCompletion?.id;
            
            // Load validation count if completion exists
            if (completionId) {
              // Count total validators (participants in the goal list)
              if (currentGoalList.type === 'group') {
                const { data: participantsData } = await supabase
                  .from('group_goal_participants')
                  .select('user_id')
                  .eq('goal_list_id', currentGoalList.id);
                
                const participantIds = [
                  currentGoalList.user_id,
                  ...(participantsData || []).map(p => p.user_id)
                ];
                totalValidators = [...new Set(participantIds)].length;
                
                // Count actual validations
                const { data: validations } = await supabase
                  .from('goal_validations')
                  .select('validator_id')
                  .eq('goal_completion_id', completionId);
                
                validatedCount = validations?.length || 0;
                
                // Check if current user has validated
                if (user && validations) {
                  isValidated = validations.some(v => v.validator_id === user.id);
                }
              }
            }
            // TODO: Load caption from posts table if you have one
          }
          
          return {
            id: goal.id,
            title: goal.title,
            checked: isCompletedToday,
            viewers: [],
            type: 'goal',
            validated: validatedCount, // Store actual validation count
            totalViewers: totalValidators,
            completionId: completionId, // Store completion ID for validation
            isValidated: isValidated, // Store if current user has validated
            completionHistory: history,
            color: getRandomColor(),
            goal_list_type: currentGoalList.type,
            goal_type: goal.goal_type || 'personal', // 'group' or 'personal'
            created_at: goal.created_at,
            currentDayIndex: currentDayIndex,
            isOwnGoal: isOwnGoal,
            user_id: goal.user_id,
            user_name: userProfile?.name || 'User',
            user_avatar: userProfile?.avatar_url || '👤',
            user_username: userProfile?.username || '@user',
            hasProof: hasProof,
            caption: caption,
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

        setGoalLists(allLists);
        
        // Set current goal list to the first one if not set
        if (allLists.length > 0 && !currentGoalList) {
          setCurrentGoalList(allLists[0]);
        }

        // Load goals for current goal list if one is selected
        if (currentGoalList) {
          const selectedList = currentGoalList;
          
          // Check if owner has paid for group goals with payment required
          if (selectedList.type === 'group' && selectedList.payment_required) {
            const { data: participant } = await supabase
              .from('group_goal_participants')
              .select('payment_status')
              .eq('goal_list_id', selectedList.id)
              .eq('user_id', user.id)
              .single();
            
            setOwnerHasPaid(participant?.payment_status === 'paid');
          } else {
            setOwnerHasPaid(true); // Personal goals don't need payment
          }
          
          const { data, error } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_list_id', selectedList.id)
            .order('created_at', { ascending: true });

          if (error) throw error;

          // Get today's date string
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = today.toISOString().split('T')[0];

          // Get goal IDs
          const goalIds = data.map(g => g.id);
          
          // Load completion records for today
          let todayCompletions = new Set();
          if (goalIds.length > 0) {
            const { data: completionsData } = await supabase
              .from('goal_completions')
              .select('goal_id')
              .in('goal_id', goalIds)
              .eq('user_id', user.id)
              .eq('completed_at', todayStr);
            
            if (completionsData) {
              todayCompletions = new Set(completionsData.map(c => c.goal_id));
            }
          }

          // Load past completion records to populate history
          let pastCompletions = {};
          if (goalIds.length > 0) {
            const { data: pastCompletionsData } = await supabase
              .from('goal_completions')
              .select('goal_id, completed_at')
              .in('goal_id', goalIds)
              .eq('user_id', user.id)
              .lt('completed_at', todayStr);
            
            if (pastCompletionsData) {
              pastCompletionsData.forEach(c => {
                const dateStr = c.completed_at.includes('T') ? c.completed_at.split('T')[0] : c.completed_at;
                if (!pastCompletions[c.goal_id]) {
                  pastCompletions[c.goal_id] = new Set();
                }
                pastCompletions[c.goal_id].add(dateStr);
              });
            }
          }

          // Transform data to match existing format
          const transformedGoals = await Promise.all(data.map(async (goal) => {
            const history = generateCompletionHistory(goal.created_at);
            const currentDayIndex = getCurrentDayIndex(goal.created_at);
            
            // Check if goal is completed today based on completion record
            const isCompletedToday = todayCompletions.has(goal.id);
            
            // If goal.completed doesn't match today's completion status, update it
            if (goal.completed !== isCompletedToday) {
              await supabase
                .from('goals')
                .update({ completed: isCompletedToday })
                .eq('id', goal.id)
                .eq('user_id', user.id);
            }
            
            // Populate past days in history from completion records
            if (pastCompletions[goal.id]) {
              const createdDate = new Date(goal.created_at);
              createdDate.setHours(0, 0, 0, 0);
              
              pastCompletions[goal.id].forEach(dateStr => {
                const completionDate = new Date(dateStr);
                completionDate.setHours(0, 0, 0, 0);
                
                const dayIndex = Math.floor((completionDate - createdDate) / (1000 * 60 * 60 * 24));
                if (dayIndex >= 0 && dayIndex < history.length && dayIndex < currentDayIndex) {
                  history[dayIndex] = true;
                }
              });
            }
            
            // Set today's completion status
            history[currentDayIndex] = isCompletedToday;
            
            return {
              id: goal.id,
              title: goal.title,
              checked: isCompletedToday,
              viewers: [],
              type: 'goal',
              validated: 0,
              totalViewers: 0,
              completionHistory: history,
              color: getRandomColor(),
              goal_list_type: selectedList.type, // Store goal list type
              created_at: goal.created_at, // Store creation date
              currentDayIndex: currentDayIndex, // Store current day index for this goal
            };
          }));

          setGoals(transformedGoals);
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

  const toggleValidation = async (id) => {
    const goal = goals.find(g => g.id === id);
    if (!goal || !goal.completionId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const isCurrentlyValidated = goal.isValidated;
      
      if (isCurrentlyValidated) {
        // Remove validation
        const { error } = await supabase
          .from('goal_validations')
          .delete()
          .eq('goal_completion_id', goal.completionId)
          .eq('validator_id', user.id);
        
        if (!error) {
          // Reload validation count
          const { data: validations } = await supabase
            .from('goal_validations')
            .select('validator_id')
            .eq('goal_completion_id', goal.completionId);
          
          const newValidatedCount = validations?.length || 0;
          
          setGoals(goals.map(item => 
            item.id === id
              ? { 
                  ...item, 
                  validated: newValidatedCount,
                  isValidated: false
                } 
              : item
          ));
        }
      } else {
        // Add validation
        const { error } = await supabase
          .from('goal_validations')
          .insert({
            goal_completion_id: goal.completionId,
            validator_id: user.id,
          });
        
        if (!error) {
          // Reload validation count
          const { data: validations } = await supabase
            .from('goal_validations')
            .select('validator_id')
            .eq('goal_completion_id', goal.completionId);
          
          const newValidatedCount = validations?.length || 0;
          
          setGoals(goals.map(item => 
            item.id === id
              ? { 
                  ...item, 
                  validated: newValidatedCount,
                  isValidated: true
                } 
              : item
          ));
        }
      }
    } catch (error) {
      console.error('Error toggling validation:', error);
    }
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
      
      // Update in Supabase
      const { error } = await supabase
        .from('goals')
        .update({ completed: newChecked })
        .eq('id', id)
        .eq('user_id', user.id);

      if (!error) {
        // Save or delete completion record for today
        if (newChecked) {
          // Insert completion record for today
          await supabase
            .from('goal_completions')
            .upsert({
              goal_id: id,
              user_id: user.id,
              completed_at: todayStr,
            }, {
              onConflict: 'goal_id,completed_at'
            });
        } else {
          // Delete completion record for today if unchecking
          await supabase
            .from('goal_completions')
            .delete()
            .eq('goal_id', id)
            .eq('user_id', user.id)
            .eq('completed_at', todayStr);
        }

        // Update local state
        setGoals(goals.map(g => {
          if (g.id === id) {
            const updatedHistory = [...(g.completionHistory || [])];
            updatedHistory[g.currentDayIndex] = newChecked;
            return { 
              ...g, 
              checked: newChecked,
              completionHistory: updatedHistory
            };
          }
          return g;
        }));
      }
    } else {
      // For group goals, navigate to post screen if not checked
      if (!goal.checked) {
      navigation.navigate('GoalPost', { goal });
    } else {
        // If already checked, toggle it off
        const newChecked = false;
        
        const { error } = await supabase
          .from('goals')
          .update({ completed: newChecked })
          .eq('id', id)
          .eq('user_id', user.id);

        if (!error) {
          // Delete completion record for today
          await supabase
            .from('goal_completions')
            .delete()
            .eq('goal_id', id)
            .eq('user_id', user.id)
            .eq('completed_at', todayStr);

      setGoals(goals.map(g => {
        if (g.id === id) {
          const updatedHistory = [...(g.completionHistory || [])];
              updatedHistory[g.currentDayIndex] = newChecked;
          return { 
            ...g, 
            checked: newChecked,
            completionHistory: updatedHistory
          };
        }
        return g;
      }));
    }
      }
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
                      
                      // Count validated group goals
                      groupCompletions.forEach(c => {
                        if ((validationCounts[c.id] || 0) >= totalValidators && totalValidators > 0) {
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

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.challengesContainer}>
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
              <Animated.View 
                key={friend.id}
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
                  {friend.emoji && (friend.emoji.startsWith('http://') || friend.emoji.startsWith('https://')) ? (
                    <Image source={{ uri: friend.emoji }} style={styles.avatarImageInRing} />
                  ) : (
                    <Text style={styles.avatarEmoji}>{friend.emoji || '👤'}</Text>
                  )}
                </View>
                <Text style={styles.friendName}>{friend.name}</Text>
              </Animated.View>
            );
          })}
        </ScrollView>
        )}

        {/* Duration/Deadline Info - Only for group goals */}
        {currentGoalList?.type === 'group' && currentGoalList && (
          <View style={styles.durationContainer}>
            {currentGoalList.deadline && (
              <Text style={styles.durationText}>
                Deadline: {new Date(currentGoalList.deadline).toLocaleDateString()}
              </Text>
            )}
            {currentGoalList.duration_days && (
              <Text style={styles.durationText}>
                Duration: {currentGoalList.duration_days} days
              </Text>
            )}
            {currentGoalList.is_unlimited && (
              <Text style={styles.durationText}>Duration: Unlimited</Text>
            )}
                    </View>
        )}

        {/* Countdown Timer - Only show if there are goals */}
        {goals.length > 0 && (
          <View style={styles.countdownContainerOuter}>
            <Text style={styles.countdownLabel}>Time left in day</Text>
            <Text style={styles.countdownText}>{timeRemainingDay}</Text>
                  </View>
        )}
                  
        {/* Personal Goals */}
        <View style={styles.personalGoalsContainer}>
          {/* Show placeholder if no goals (but not for test group goal) */}
          {goals.length === 0 ? (
            <View style={styles.placeholderContainer}>
              <TouchableOpacity onPress={() => navigation.navigate('CreateGoalList')}>
                <Text style={styles.placeholderText}>START YOUR ADVENTURE</Text>
                  </TouchableOpacity>
                </View>
          ) : (
            /* Goals List */
            <>
              {goals.filter(item => item.type === 'goal').map((item) => {
              const isOtherUserGoal = item.goal_list_type === 'group' && !item.isOwnGoal;
              
              return (
                <View key={item.id} style={[
                  styles.personalGoalItem,
                  isOtherUserGoal && item.checked && item.hasProof && styles.otherUserPostItem
                ]}>
              {/* Goal Title and Complete Button - Only for own goals */}
              {!isOtherUserGoal && (
                  <View style={styles.goalPillWrapper}>
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
                      <Text style={styles.goalTypeLabel}>
                        {' '}{item.goal_type === 'group' ? '- group goal' : '- personal goal'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.statusContainer}
                      onPress={() => toggleGoal(item.id)}
                    >
                      <Text style={[
                        styles.statusText,
                        item.checked && item.goal_list_type === 'group' && item.validated >= item.totalViewers && item.totalViewers > 0 && styles.statusTextCompleted,
                        item.checked && item.goal_list_type === 'group' && (item.validated < item.totalViewers || item.totalViewers === 0) && styles.statusTextWaiting,
                        item.checked && item.goal_list_type === 'personal' && styles.statusTextCompleted
                      ]}>
                      {item.checked 
                        ? (item.goal_list_type === 'group' 
                          ? (item.validated >= item.totalViewers && item.totalViewers > 0 ? 'COMPLETED' : 'WAITING FOR VALIDATION')
                          : 'COMPLETED')
                        : 'COMPLETE'}
                      </Text>
                    </TouchableOpacity>
                  </View>
              )}
                  
              {/* Completion History - Only for own goals */}
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
                             (item.goal_list_type === 'group' && item.validated >= item.totalViewers && item.totalViewers > 0));
                          
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
                  
              {/* Other User's Post - Image, Caption, Validate Section */}
              {isOtherUserGoal && item.checked && item.hasProof && (
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
                      {item.user_avatar && (item.user_avatar.startsWith('http://') || item.user_avatar.startsWith('https://')) ? (
                        <Image source={{ uri: item.user_avatar }} style={styles.otherUserAvatarImage} />
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
                  
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={48} color="#666666" />
                  </View>
                  
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
            
          {/* Add Goal Button - Show only if there are goal lists */}
          {goalLists.length > 0 && (
            <TouchableOpacity 
              style={styles.addGoalButton}
              onPress={() => {
                setNewGoalName('');
                setAddGoalModalVisible(true);
              }}
            >
              <Ionicons name="add" size={20} color="#888888" />
              <Text style={styles.addGoalText}>ADD GOAL</Text>
            </TouchableOpacity>
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
          <View style={styles.dropdownMenuContainer}>
            <View style={styles.dropdownMenu}>
              {goalLists.map((list) => (
                <TouchableOpacity
                  key={list.id}
                  style={[
                    styles.dropdownItem,
                    currentGoalList?.id === list.id && styles.dropdownItemSelected
                  ]}
                  onPress={() => {
                    setDropdownVisible(false);
                    // Set the new current goal list - useEffect will handle loading
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
        // Only show overlay if participants are loaded for this goal list
        const participantsForThisList = participants.filter(p => p.goal_list_id === currentGoalList.id);
        if (participantsForThisList.length === 0 && participants.length > 0) {
          // Participants don't match current goal list, don't show overlay yet
          return null;
        }
        
        const otherParticipants = participantsForThisList.filter(p => p.user_id !== currentUser?.id);
        const hasOtherParticipants = otherParticipants.length > 0;
        
        // Always show overlay until everyone has paid/accepted AND owner has tapped "Begin"
        const showOverlay = !allParticipantsPaid || !hasOtherParticipants || !goalListStarted;
        if (!showOverlay) return null;
        
        if (currentGoalList.type !== 'group') return null;
        
        // Get current user's participant data
        const currentUserParticipant = participantsForThisList.find(p => p.user_id === currentUser?.id);
        const amountPerPerson = parseFloat(currentGoalList.amount || 0);
        const totalParticipants = participantsForThisList.length;
        const totalAmount = amountPerPerson * totalParticipants;
        
        // Use profile from participant if available, otherwise use fetched profile from Supabase
        const displayProfile = currentUserParticipant?.profile || currentUserProfile || {};
        
        // Get creator ID
        const creatorId = currentGoalList.user_id;
        
        return (
          <View style={styles.paymentOverlayContainer}>
            {/* Blurred Background */}
            <View style={styles.paymentOverlayBackdrop} />
            
            {/* Content directly on blurred background */}
            <View style={styles.paymentOverlayContent}>
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
                                {profile.avatar_url ? (
                                  <Image 
                                    source={{ uri: profile.avatar_url }} 
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
                                <Text style={hasAccepted ? styles.youStatusBadgeTextPaid : styles.youStatusBadgeText}>
                                  {hasAccepted ? 'Accepted' : 'Not Accepted'}
                                </Text>
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
                      {currentGoalList.user_id === currentUser?.id ? (
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
                  {!goalListStarted && currentGoalList.user_id === currentUser?.id && (
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
                                  style={[styles.friendItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {friend.avatar_url ? (
                                        <Image 
                                          source={{ uri: friend.avatar_url }} 
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
                                  style={[styles.friendItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {friend.avatar_url ? (
                                        <Image
                                          source={{ uri: friend.avatar_url }}
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
                                {profile.avatar_url ? (
                                  <Image 
                                    source={{ uri: profile.avatar_url }} 
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
                                <Text style={hasPaid ? styles.youStatusBadgeTextPaid : styles.youStatusBadgeText}>
                                  {hasPaid ? 'Paid' : 'Not Paid'}
                                </Text>
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
                      {currentGoalList.user_id === currentUser?.id ? (
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
                  {currentGoalList.consequence_type === 'money' && allParticipantsPaid && (
                    <View style={styles.winnerZone}>
                      {/* If no winner yet and user is owner → show Declare button */}
                      {!declaredWinnerId && currentGoalList.user_id === currentUser?.id && (
                        <>
                          {showWinnerPicker ? (
                            <View style={styles.winnerPickerContainer}>
                              <Text style={styles.winnerPickerTitle}>Select the Winner</Text>
                              {participants.map((p) => {
                                const profile = p.profile || {};
                                return (
                                  <TouchableOpacity
                                    key={p.user_id}
                                    style={styles.winnerPickerRow}
                                    onPress={() => handleDeclareWinner(p.user_id)}
                                    disabled={declaringWinner}
                                  >
                                    <Text style={styles.winnerPickerName}>
                                      {profile.name || 'User'}
                                      {p.user_id === currentUser?.id && ' (You)'}
                                    </Text>
                                    {declaringWinner
                                      ? <ActivityIndicator size="small" color="#FFD700" />
                                      : <Ionicons name="trophy-outline" size={18} color="#FFD700" />
                                    }
                                  </TouchableOpacity>
                                );
                              })}
                              <TouchableOpacity
                                style={styles.winnerPickerCancel}
                                onPress={() => setShowWinnerPicker(false)}
                              >
                                <Text style={styles.winnerPickerCancelText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.declareWinnerButton}
                              onPress={() => setShowWinnerPicker(true)}
                            >
                              <Ionicons name="trophy-outline" size={18} color="#FFD700" />
                              <Text style={styles.declareWinnerButtonText}>Declare Winner</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}

                      {/* Winner announcement + Claim button */}
                      {declaredWinnerId && (
                        <View style={styles.winnerAnnouncementBox}>
                          <Ionicons name="trophy" size={28} color="#FFD700" />
                          <Text style={styles.winnerAnnouncementText}>
                            {declaredWinnerId === currentUser?.id
                              ? '🎉 You won this challenge!'
                              : `${participants.find(p => p.user_id === declaredWinnerId)?.profile?.name || 'Someone'} won!`}
                          </Text>
                          {declaredWinnerId === currentUser?.id && (
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
                                Claim ${(currentGoalList.prize_pool_amount || (currentGoalList.total_pot || 0) * 0.9).toFixed(2)}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Add User Section */}
                  {!goalListStarted && currentGoalList.user_id === currentUser?.id && (
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
                                  style={[styles.friendItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {friend.avatar_url ? (
                                        <Image
                                          source={{ uri: friend.avatar_url }}
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
                                  style={[styles.friendItem, isAlreadyAdded && styles.friendItemAdded]}
                                  onPress={() => !isAlreadyAdded && handleAddFriendToGoal(friend)}
                                  disabled={isAlreadyAdded}
                                >
                                  <View style={styles.friendItemLeft}>
                                    <View style={styles.friendItemAvatar}>
                                      {friend.avatar_url ? (
                                        <Image
                                          source={{ uri: friend.avatar_url }}
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
    paddingBottom: 20,
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
    gap: 4,
    alignItems: 'center',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countdownContainerOuter: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 4,
    alignItems: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    overflow: 'hidden',
    borderRadius: 32,
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
  viewersRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  validateButtonActive: {
    backgroundColor: '#1a3a2a',
    borderColor: '#4CAF50',
  },
  validateButtonText: {
    fontSize: 15,
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
    marginBottom: 0,
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
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  placeholderText: {
    fontSize: 28,
    fontWeight: '300',
    color: '#888888',
    textAlign: 'center',
    letterSpacing: 1,
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
    maxHeight: '90%',
    zIndex: 10000,
    elevation: 10000,
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
  declareWinnerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a00',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  declareWinnerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
  },
  winnerPickerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
    gap: 4,
  },
  winnerPickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  winnerPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  winnerPickerName: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
  winnerPickerCancel: {
    paddingTop: 12,
    alignItems: 'center',
  },
  winnerPickerCancelText: {
    fontSize: 14,
    color: '#888888',
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
  friendItem: {
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

