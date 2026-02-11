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
      loadGoalsForCurrentList();
      checkOwnerPaymentStatus();
    }
  }, [currentGoalList]);

  // Load available friends when participants change
  useEffect(() => {
    if (currentGoalList && currentUser) {
      loadAvailableFriends();
    }
  }, [currentGoalList, currentUser, participants.length]);

  // Load available friends (only accepted friends, excluding existing participants)
  const loadAvailableFriends = async () => {
    if (!currentGoalList || !currentUser) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get existing participant IDs
      const existingParticipantIds = participants.map(p => p.user_id);
      const allParticipantIds = [...existingParticipantIds, user.id];

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
        .map(f => f.user_id === user.id ? f.friend_id : f.user_id)
        .filter(id => !allParticipantIds.includes(id));

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
        setAvailableFriends(friendsData || []);
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
      
      // Filter results to only include friends and exclude participants
      const filtered = (allUsers || []).filter(user => 
        friendIds.includes(user.id) && !allParticipantIds.includes(user.id)
      );
      
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

      // Hard-coded group goal requires payment
      if (currentGoalList.id === 'hardcoded-group-goal') {
        setOwnerHasPaid(false);
        return;
      }

      // Check if owner has paid for group goals with payment required
      if (currentGoalList.type === 'group' && currentGoalList.payment_required) {
        // Verify user has access to this goal list (either owner or participant)
        const { data: goalListCheck } = await supabase
          .from('goal_lists')
          .select('user_id')
          .eq('id', currentGoalList.id)
          .single();
        
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
        } else if (participantsData) {
          // Load profile data for each participant
          const participantsWithProfiles = await Promise.all(
            participantsData.map(async (participant) => {
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
          
          // Check if user paid via Stripe (has a payment record with stripe_payment_intent_id)
          if (hasPaid) {
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
        }
      } else {
        setOwnerHasPaid(true); // Personal goals don't need payment
        setAllParticipantsPaid(true);
        setParticipants([]);
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    }
  };

  const loadGoalsForCurrentList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && currentGoalList) {
        // Skip loading goals for hard-coded group goal
        if (currentGoalList.id === 'hardcoded-group-goal') {
          setGoals([]);
          return;
        }
        
        const { data, error } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('goal_list_id', currentGoalList.id)
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
            goal_list_type: currentGoalList.type, // Store goal list type
            created_at: goal.created_at, // Store creation date
            currentDayIndex: currentDayIndex, // Store current day index for this goal
          };
        }));

        setGoals(transformedGoals);
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const loadGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Load goal lists
        const { data: listsData, error: listsError } = await supabase
          .from('goal_lists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (listsError) throw listsError;

        // Add hard-coded group goal for testing
        const hardCodedGroupGoal = {
          id: 'hardcoded-group-goal',
          name: 'Test Group Goal',
          type: 'group',
          user_id: user.id,
          created_at: new Date().toISOString(),
          payment_required: true,
          amount: 10.00,
          consequence_type: 'money',
        };

        // Combine hard-coded goal with loaded goals
        const allGoalLists = [hardCodedGroupGoal, ...(listsData || [])];
        setGoalLists(allGoalLists);
        
        // Set current goal list to the first one if not set
        if (allGoalLists.length > 0 && !currentGoalList) {
          setCurrentGoalList(allGoalLists[0]);
        }

        // Load goals for current goal list if one is selected
        if (currentGoalList) {
          const selectedList = currentGoalList;
          
          // Load hard-coded goals for test group goal
          if (selectedList.id === 'hardcoded-group-goal') {
            // Get current user to mark own goals
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            
            const hardCodedGoals = [
              // Your own goal - not completed
    { 
                id: 'hardcoded-goal-own-1',
                title: 'Read 30 pages',
      checked: false, 
                viewers: [],
      type: 'goal', 
                validated: 0,
                totalViewers: 0,
                completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                color: '#2196F3',
                goal_list_type: 'group',
                created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                currentDayIndex: 20,
                hasProof: false,
                isOwnGoal: true,
                user_id: currentUser?.id || 'current-user',
              },
              // Other user's completed goal - Alex
    { 
                id: 'hardcoded-goal-other-1',
                title: 'Morning workout',
      checked: true, 
                viewers: ['😎', '🤠', '🥳'],
      type: 'goal', 
                validated: 0,
      totalViewers: 4,
                completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                color: '#4CAF50',
                goal_list_type: 'group',
                created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                currentDayIndex: 20,
                hasProof: true,
                isOwnGoal: false,
                user_id: 'other-user-1',
                user_name: 'Alex',
                user_avatar: '😎',
                user_username: '@alex',
                caption: 'Crushed my morning workout! 💪',
              },
              // Your own goal - completed
    { 
                id: 'hardcoded-goal-own-2',
                title: 'Meditate 10 minutes',
                checked: true,
                viewers: [],
      type: 'goal', 
                validated: 0,
                totalViewers: 0,
                completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                color: '#9C27B0',
                goal_list_type: 'group',
                created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                currentDayIndex: 20,
                hasProof: false,
                isOwnGoal: true,
                user_id: currentUser?.id || 'current-user',
              },
              // Other user's completed goal - Sam
    { 
                id: 'hardcoded-goal-other-2',
                title: 'Drink 8 glasses',
                checked: true,
                viewers: ['🤓', '😊'],
      type: 'goal', 
                validated: 0,
                totalViewers: 4,
                completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                color: '#FF9800',
                goal_list_type: 'group',
                created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                currentDayIndex: 20,
                hasProof: true,
                isOwnGoal: false,
                user_id: 'other-user-2',
                user_name: 'Sam',
                user_avatar: '🤠',
                user_username: '@sam',
                caption: 'Staying hydrated! 💧',
              },
              // Your own goal - completed with proof
    { 
                id: 'hardcoded-goal-own-3',
                title: 'Cook healthy meal',
      checked: true, 
                viewers: [],
      type: 'goal', 
                validated: 0,
                totalViewers: 0,
                completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                color: '#F44336',
                goal_list_type: 'group',
                created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                currentDayIndex: 20,
                hasProof: true,
                isOwnGoal: true,
                user_id: currentUser?.id || 'current-user',
              },
            ];
            setGoals(hardCodedGoals);
            setOwnerHasPaid(false); // Hard-coded goal requires payment
            setLoading(false);
            return;
          }
          
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

  const toggleValidation = (id) => {
    setGoals(goals.map(item => 
      item.id === id
        ? { ...item, validated: item.validated > 0 ? 0 : 1 } 
        : item
    ));
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

  // Get friends for current goal list (hard-coded for test group goal)
  const friends = currentGoalList?.id === 'hardcoded-group-goal' 
    ? [
        { id: '1', emoji: '😎', name: 'Alex', progress: 0.8 },
        { id: '2', emoji: '🤠', name: 'Sam', progress: 0.6 },
        { id: '3', emoji: '🥳', name: 'Jordan', progress: 0.9 },
        { id: '4', emoji: '🤓', name: 'Taylor', progress: 0.7 },
      ]
    : [];

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
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarEmoji}>{friend.emoji}</Text>
                    </View>
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
          {goals.length === 0 && currentGoalList?.id !== 'hardcoded-group-goal' ? (
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
                    <Text style={styles.goalTitleText}>{item.title}</Text>
                  </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.statusContainer}
                      onPress={() => toggleGoal(item.id)}
                    >
                      <Text style={[
                        styles.statusText,
                        item.checked && styles.statusTextCompleted
                      ]}>
                      {item.checked ? 'COMPLETED' : 'COMPLETE'}
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
                          const isCompleted = box.status === true;
                        
                        return (
                          <View 
                              key={box.originalIndex} 
                            style={[
                              styles.historySquare,
                              isFuture 
                                ? styles.historySquareFuture
                                : isCompleted 
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
                      <Text style={styles.otherUserAvatarEmoji}>{item.user_avatar || '👤'}</Text>
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
                        item.validated > 0 && styles.validateButtonTextOnlyTextActive
                    ]}>
                        {item.validated > 0 ? 'Validated' : 'Validate'}
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
                  onPress={async () => {
                      setDropdownVisible(false);
                    // Clear goals first
                    setGoals([]);
                    
                    // Set the new current goal list
                    setCurrentGoalList(list);
                    
                    // Load goals for the selected list
                    if (list.id === 'hardcoded-group-goal') {
                      // Load hard-coded goals for test group goal
                      // Get current user to mark own goals
                      const { data: { user: currentUser } } = await supabase.auth.getUser();
                      
                      const hardCodedGoals = [
                        // Your own goal - not completed
                        {
                          id: 'hardcoded-goal-own-1',
                          title: 'Read 30 pages',
                          checked: false,
                          viewers: [],
                          type: 'goal',
                          validated: 0,
                          totalViewers: 0,
                          completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                          color: '#2196F3',
                          goal_list_type: 'group',
                          created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                          currentDayIndex: 20,
                          hasProof: false,
                          isOwnGoal: true,
                          user_id: currentUser?.id || 'current-user',
                        },
                        // Other user's completed goal - Alex
                        {
                          id: 'hardcoded-goal-other-1',
                          title: 'Morning workout',
                          checked: true,
                          viewers: ['😎', '🤠', '🥳'],
                          type: 'goal',
                          validated: 0,
                          totalViewers: 4,
                          completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                          color: '#4CAF50',
                          goal_list_type: 'group',
                          created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                          currentDayIndex: 20,
                          hasProof: true,
                          isOwnGoal: false,
                          user_id: 'other-user-1',
                          user_name: 'Alex',
                          user_avatar: '😎',
                          user_username: '@alex',
                          caption: 'Crushed my morning workout! 💪',
                        },
                        // Your own goal - completed
                        {
                          id: 'hardcoded-goal-own-2',
                          title: 'Meditate 10 minutes',
                          checked: true,
                          viewers: [],
                          type: 'goal',
                          validated: 0,
                          totalViewers: 0,
                          completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                          color: '#9C27B0',
                          goal_list_type: 'group',
                          created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                          currentDayIndex: 20,
                          hasProof: false,
                          isOwnGoal: true,
                          user_id: currentUser?.id || 'current-user',
                        },
                        // Other user's completed goal - Sam
                        {
                          id: 'hardcoded-goal-other-2',
                          title: 'Drink 8 glasses',
                          checked: true,
                          viewers: ['🤓', '😊'],
                          type: 'goal',
                          validated: 0,
                          totalViewers: 4,
                          completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                          color: '#FF9800',
                          goal_list_type: 'group',
                          created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                          currentDayIndex: 20,
                          hasProof: true,
                          isOwnGoal: false,
                          user_id: 'other-user-2',
                          user_name: 'Sam',
                          user_avatar: '🤠',
                          user_username: '@sam',
                          caption: 'Staying hydrated! 💧',
                        },
                        // Your own goal - completed with proof
                        {
                          id: 'hardcoded-goal-own-3',
                          title: 'Cook healthy meal',
                          checked: true,
                          viewers: [],
                          type: 'goal',
                          validated: 0,
                          totalViewers: 0,
                          completionHistory: Array.from({ length: 28 }, (_, i) => i < 20 ? Math.random() > 0.3 : null),
                          color: '#F44336',
                          goal_list_type: 'group',
                          created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                          currentDayIndex: 20,
                          hasProof: true,
                          isOwnGoal: true,
                          user_id: currentUser?.id || 'current-user',
                        },
                      ];
                      setGoals(hardCodedGoals);
                      setOwnerHasPaid(false);
                    } else {
                      // Load goals from Supabase for this goal list
                      // Use the list parameter directly instead of waiting for state update
                      const { data: { user } } = await supabase.auth.getUser();
                      
                      if (user) {
                        // Check payment status
                        if (list.type === 'group' && list.payment_required) {
                          const { data: participant } = await supabase
                            .from('group_goal_participants')
                            .select('payment_status')
                            .eq('goal_list_id', list.id)
                            .eq('user_id', user.id)
                            .single();
                          
                          setOwnerHasPaid(participant?.payment_status === 'paid');
                        } else {
                          setOwnerHasPaid(true);
                        }
                        
                        // Load goals
                        const { data, error } = await supabase
                          .from('goals')
                          .select('*')
                          .eq('user_id', user.id)
                          .eq('goal_list_id', list.id)
                          .order('created_at', { ascending: true });

                        if (error) {
                          console.error('Error loading goals:', error);
                        } else {
                          const transformedGoals = (data || []).map(goal => {
                            const history = generateCompletionHistory(goal.created_at);
                            const currentDayIndex = getCurrentDayIndex(goal.created_at);
                            history[currentDayIndex] = goal.completed;
                            
                            return {
                              id: goal.id,
                              title: goal.title,
                              checked: goal.completed,
                              viewers: [],
                              type: 'goal',
                              validated: 0,
                              totalViewers: 0,
                              completionHistory: history,
                              color: getRandomColor(),
                              goal_list_type: list.type,
                              created_at: goal.created_at,
                              currentDayIndex: currentDayIndex,
                              isOwnGoal: true,
                              user_id: user.id,
                            };
                          });
                          
                          setGoals(transformedGoals);
                        }
                      }
                    }
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
      {currentGoalList?.type === 'group' && currentGoalList?.id !== 'hardcoded-group-goal' && currentUser && (() => {
        const otherParticipants = participants.filter(p => p.user_id !== currentUser?.id);
        const hasOtherParticipants = otherParticipants.length > 0;
        const showOverlay = !allParticipantsPaid || !hasOtherParticipants;
        
        if (!showOverlay) return null;
        
        // Get current user's participant data
        const currentUserParticipant = participants.find(p => p.user_id === currentUser?.id);
        const amountPerPerson = parseFloat(currentGoalList.amount || 0);
        const totalParticipants = participants.length;
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
              
              {/* For Punishment Goals: Match money overlay structure */}
              {currentGoalList.consequence_type === 'punishment' ? (
                <>
                  {/* Status Section */}
                  <View style={styles.statusSection}>
                    <Text style={styles.statusSectionTitle}>Status</Text>
                    
                    {/* You Section - No rectangle */}
                    <View style={styles.youStatusItemNoBox}>
                      <View style={styles.youStatusLeft}>
                        <View style={styles.youStatusAvatar}>
                          {displayProfile.avatar_url ? (
                            <Image 
                              source={{ uri: displayProfile.avatar_url }} 
                              style={styles.youStatusAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.youStatusAvatarEmoji}>👤</Text>
                          )}
                        </View>
                        <View style={styles.youStatusInfo}>
                          <Text style={styles.youStatusName}>
                            {displayProfile.name || 'User'}
                          </Text>
                          <Text style={styles.youStatusUsername}>
                            {displayProfile.username?.replace('@', '') || 'username'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.youStatusRight}>
                        {ownerHasPaid ? (
                          <TouchableOpacity 
                            onPress={async () => {
                              const { data: { user } } = await supabase.auth.getUser();
                              if (user) {
                                const { error } = await supabase
                                  .from('group_goal_participants')
                                  .upsert({
                                    goal_list_id: currentGoalList.id,
                                    user_id: user.id,
                                    payment_status: 'pending'
                                  }, {
                                    onConflict: 'goal_list_id,user_id'
                                  });
                                
                                if (!error) {
                                  await checkOwnerPaymentStatus();
                                } else {
                                  console.error('Error unaccepting punishment:', error);
                                }
                              }
                            }}
                          >
                            <Text style={styles.youStatusBadgeTextPaid}>
                              Accepted
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity 
                            onPress={async () => {
                              const { data: { user } } = await supabase.auth.getUser();
                              if (user) {
                                const { error } = await supabase
                                  .from('group_goal_participants')
                                  .upsert({
                                    goal_list_id: currentGoalList.id,
                                    user_id: user.id,
                                    payment_status: 'paid'
                                  }, {
                                    onConflict: 'goal_list_id,user_id'
                                  });
                                
                                if (!error) {
                                  await checkOwnerPaymentStatus();
                                } else {
                                  console.error('Error accepting punishment:', error);
                                }
                              }
                            }}
                          >
                            <Text style={styles.youStatusBadgeText}>
                              Accept
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                  
                  {/* Other Users or Add User Section */}
                  {hasOtherParticipants ? (
                    <View style={styles.otherUsersSection}>
                      <Text style={styles.otherUsersTitle}>Other Participants</Text>
                      <ScrollView style={styles.otherUsersList} showsVerticalScrollIndicator={false}>
                        {participants
                          .filter(p => p.user_id !== currentUser?.id)
                          .map((participant) => {
                            const profile = participant.profile || {};
                            const hasAccepted = participant.payment_status === 'paid';
                            
                            return (
                              <View key={participant.id} style={styles.otherUserItem}>
                                <View style={styles.otherUserLeft}>
                                  <View style={styles.otherUserAvatar}>
                                    {profile.avatar_url ? (
                                      <Image 
                                        source={{ uri: profile.avatar_url }} 
                                        style={styles.otherUserAvatarImage}
                                        resizeMode="cover"
                                      />
                                    ) : (
                                      <Text style={styles.otherUserAvatarEmoji}>👤</Text>
                                    )}
                                  </View>
                                  <View style={styles.otherUserInfo}>
                                    <Text style={styles.otherUserName}>
                                      {profile.name || 'User'}
                                    </Text>
                                    <Text style={styles.otherUserUsername}>
                                      {profile.username?.replace('@', '') || 'username'}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.otherUserRight}>
                                  <Text style={hasAccepted ? styles.otherUserBadgeTextPaid : styles.otherUserBadgeText}>
                                    {hasAccepted ? 'Accepted' : 'Not Accepted'}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                      </ScrollView>
                    </View>
                  ) : (
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
                            friendsSearchResults.map((friend) => (
                              <TouchableOpacity
                                key={friend.id}
                                style={styles.friendItem}
                                onPress={() => handleAddFriendToGoal(friend)}
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
                                <Ionicons name="add-circle" size={24} color="#4CAF50" />
                              </TouchableOpacity>
                            ))
                          ) : (
                            <View style={styles.friendsEmptyContainer}>
                              <Text style={styles.friendsEmptyText}>No users found</Text>
                            </View>
                          )
                        ) : (
                          // Show all available friends
                          availableFriends.length > 0 ? (
                            availableFriends.map((friend) => (
                              <TouchableOpacity
                                key={friend.id}
                                style={styles.friendItem}
                                onPress={() => handleAddFriendToGoal(friend)}
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
                                <Ionicons name="add-circle" size={24} color="#4CAF50" />
                              </TouchableOpacity>
                            ))
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
                    
                    {/* You Section - No rectangle */}
                    <View style={styles.youStatusItemNoBox}>
                      <View style={styles.youStatusLeft}>
                        <View style={styles.youStatusAvatar}>
                          {displayProfile.avatar_url ? (
                            <Image 
                              source={{ uri: displayProfile.avatar_url }} 
                              style={styles.youStatusAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.youStatusAvatarEmoji}>👤</Text>
                          )}
                        </View>
                        <View style={styles.youStatusInfo}>
                          <Text style={styles.youStatusName}>
                            {displayProfile.name || 'User'}
                          </Text>
                          <Text style={styles.youStatusUsername}>
                            {displayProfile.username?.replace('@', '') || 'username'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.youStatusRight}>
                        {ownerPaidViaStripe ? (
                          <Text style={styles.youStatusBadgeTextPaid}>
                            Paid
                          </Text>
                        ) : (
                          <TouchableOpacity 
                            onPress={() => {
                              navigation.navigate('GroupGoalPayment', {
                                goalListId: currentGoalList.id,
                                amount: currentGoalList.amount,
                                goalListName: currentGoalList.name,
                              });
                            }}
                          >
                            <Text style={styles.youStatusBadgeText}>
                              Not Paid
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                  
                  {/* Other Users or Add User Section */}
                  {hasOtherParticipants ? (
                    <View style={styles.otherUsersSection}>
                      <Text style={styles.otherUsersTitle}>Other Participants</Text>
                      <ScrollView style={styles.otherUsersList} showsVerticalScrollIndicator={false}>
                        {participants
                          .filter(p => p.user_id !== currentUser?.id)
                          .map((participant) => {
                            const profile = participant.profile || {};
                            const hasPaid = participant.payment_status === 'paid';
                            
                            return (
                              <View key={participant.id} style={styles.otherUserItem}>
                                <View style={styles.otherUserLeft}>
                                  <View style={styles.otherUserAvatar}>
                                    {profile.avatar_url ? (
                                      <Image 
                                        source={{ uri: profile.avatar_url }} 
                                        style={styles.otherUserAvatarImage}
                                        resizeMode="cover"
                                      />
                                    ) : (
                                      <Text style={styles.otherUserAvatarEmoji}>👤</Text>
                                    )}
                                  </View>
                                  <View style={styles.otherUserInfo}>
                                    <Text style={styles.otherUserName}>
                                      {profile.name || 'User'}
                                    </Text>
                                    <Text style={styles.otherUserUsername}>
                                      {profile.username?.replace('@', '') || 'username'}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.otherUserRight}>
                                  <Text style={hasPaid ? styles.otherUserBadgeTextPaid : styles.otherUserBadgeText}>
                                    {hasPaid ? 'Paid' : 'Not Paid'}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                      </ScrollView>
                    </View>
                  ) : (
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
                            friendsSearchResults.map((friend) => (
                              <TouchableOpacity
                                key={friend.id}
                                style={styles.friendItem}
                                onPress={() => handleAddFriendToGoal(friend)}
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
                                <Ionicons name="add-circle" size={24} color="#4CAF50" />
                              </TouchableOpacity>
                            ))
                          ) : (
                            <View style={styles.friendsEmptyContainer}>
                              <Text style={styles.friendsEmptyText}>No users found</Text>
                            </View>
                          )
                        ) : (
                          // Show all available friends
                          availableFriends.length > 0 ? (
                            availableFriends.map((friend) => (
                              <TouchableOpacity
                                key={friend.id}
                                style={styles.friendItem}
                                onPress={() => handleAddFriendToGoal(friend)}
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
                                <Ionicons name="add-circle" size={24} color="#4CAF50" />
                              </TouchableOpacity>
                            ))
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
              
              {/* Pay Button - Only show if current user hasn't paid and has other participants */}
              {hasOtherParticipants && !ownerHasPaid && currentGoalList.consequence_type === 'money' && (
                <TouchableOpacity 
                  style={styles.payNowButton}
                  onPress={() => {
                    navigation.navigate('GroupGoalPayment', {
                      goalListId: currentGoalList.id,
                      amount: currentGoalList.amount,
                      goalListName: currentGoalList.name,
                    });
                  }}
                >
                  <Text style={styles.payNowButtonText}>Pay Now</Text>
                </TouchableOpacity>
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
  },
  friendsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    gap: 40,
  },
  friendItem: {
    alignItems: 'center',
    width: 56,
  },
  avatarWithProgress: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressRing: {
    position: 'absolute',
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  friendName: {
    fontSize: 14,
    fontWeight: '400',
    color: '#ffffff',
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
    flex: 1,
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
  youStatusBadgeTextPaid: {
    color: '#4CAF50',
  },
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
});

