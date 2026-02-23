import { useMemo, useState, useEffect } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getAvatarDisplayUrl } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [goalLists, setGoalLists] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [friendSearchModalVisible, setFriendSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingFriend, setAddingFriend] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [streak, setStreak] = useState(0);
  const [dateJoined, setDateJoined] = useState(null);
  const [friendRequests, setFriendRequests] = useState([]); // Pending friend requests received
  const [loadingRequests, setLoadingRequests] = useState(false);
  // Wallet: winnings from money challenges
  const [walletPendingTotal, setWalletPendingTotal] = useState(0);
  const [walletPendingList, setWalletPendingList] = useState([]); // { id, name, prize_pool_amount }
  const [walletClaimedTotal, setWalletClaimedTotal] = useState(0);
  const [walletRecentPayouts, setWalletRecentPayouts] = useState([]);

  // Load profile and goals data
  const loadProfileData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUser(user);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error loading profile:', profileError);
      } else {
        setProfile(profileData || { name: '', username: '', avatar_url: null });
      }

      // Load goal lists
      const { data: listsData, error: listsError } = await supabase
        .from('goal_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (listsError) {
        console.error('Error loading goal lists:', listsError);
      } else {
        setGoalLists(listsData || []);
      }

      // Load all goals
      const { data: goalsData, error: goalsError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (goalsError) {
        console.error('Error loading goals:', goalsError);
      } else {
        setGoals(goalsData || []);
      }

      // Set date joined from user creation date
      if (user.created_at) {
        const joinedDate = new Date(user.created_at);
        setDateJoined(joinedDate);
      }

      // Calculate streak
      await calculateStreak(user.id);

      // Load friend requests
      await loadFriendRequests();

      // Load wallet (winnings from money challenges)
      await loadWalletData(user.id);

      setLoading(false);
    } catch (error) {
      console.error('Error loading profile data:', error);
      setLoading(false);
    }
  };

  // Calculate current streak based on completion data
  const calculateStreak = async (userId) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get all goal IDs for this user
      const { data: userGoals } = await supabase
        .from('goals')
        .select('id')
        .eq('user_id', userId);
      
      if (!userGoals || userGoals.length === 0) {
        setStreak(0);
        return;
      }
      
      const goalIds = userGoals.map(g => g.id);
      
      // Get all completions for the last 30 days (to find streak)
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      
      const { data: completions } = await supabase
        .from('goal_completions')
        .select('completed_at, goal_id')
        .in('goal_id', goalIds)
        .eq('user_id', userId)
        .gte('completed_at', startDate.toISOString().split('T')[0])
        .order('completed_at', { ascending: false });
      
      if (!completions || completions.length === 0) {
        setStreak(0);
        return;
      }
      
      // Group completions by date
      const completionsByDate = {};
      completions.forEach(c => {
        const dateStr = c.completed_at.includes('T') 
          ? c.completed_at.split('T')[0] 
          : c.completed_at;
        if (!completionsByDate[dateStr]) {
          completionsByDate[dateStr] = new Set();
        }
        completionsByDate[dateStr].add(c.goal_id);
      });

      // Check which dates have ALL goals completed
      const datesWithAllGoalsCompleted = Object.keys(completionsByDate).filter(dateStr => {
        const completedGoalIds = completionsByDate[dateStr];
        return completedGoalIds.size === goalIds.length;
      });
      
      // Calculate streak going backwards from today
      let currentStreak = 0;
      let checkDate = new Date(today);
      
      while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const hasAllCompleted = datesWithAllGoalsCompleted.includes(dateStr);
        
        if (hasAllCompleted) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      
      setStreak(currentStreak);
    } catch (error) {
      console.error('Error calculating streak:', error);
      setStreak(0);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadProfileData();
      // loadFriendRequests will be called inside loadProfileData
    }, [])
  );

  // Search for users
  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Search profiles by username or name
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
        .neq('id', user.id) // Exclude current user
        .limit(20);

      if (error) {
        console.error('Error searching users:', error);
        Alert.alert('Error', 'Failed to search users');
      } else {
        setSearchResults(data || []);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setSearching(false);
      }
    };

  // Handle search input change with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Load wallet: pending winnings (to claim) and total claimed
  const loadWalletData = async (userId) => {
    try {
      // Pending: goal lists where this user is winner and hasn't been paid out yet
      const { data: pendingLists } = await supabase
        .from('goal_lists')
        .select('id, name, prize_pool_amount, total_pot')
        .eq('winner_id', userId)
        .eq('payout_status', 'pending');

      const pending = pendingLists || [];
      const pendingTotal = pending.reduce((sum, g) => sum + parseFloat(g.prize_pool_amount || 0), 0);
      setWalletPendingList(pending);
      setWalletPendingTotal(pendingTotal);

      // Claimed: payouts for this user
      const { data: payouts } = await supabase
        .from('payouts')
        .select('id, goal_list_id, payout_amount, status, created_at')
        .eq('winner_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      const list = payouts || [];
      const claimedTotal = list.reduce((sum, p) => sum + parseFloat(p.payout_amount || 0), 0);
      setWalletRecentPayouts(list);
      setWalletClaimedTotal(claimedTotal);
    } catch (e) {
      console.error('Error loading wallet:', e);
    }
  };

  // Load friend requests (pending requests received by current user)
  const loadFriendRequests = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setLoadingRequests(true);
      // First, get the friend requests
      const { data: requests, error: requestsError } = await supabase
        .from('friend_requests')
        .select('id, requester_id, recipient_id, status, created_at')
        .eq('recipient_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (requestsError) {
        console.error('Error loading friend requests:', requestsError);
        setFriendRequests([]);
        return;
      }

      if (!requests || requests.length === 0) {
        setFriendRequests([]);
        return;
      }

      // Get all requester IDs
      const requesterIds = requests.map(r => r.requester_id);

      // Fetch profiles for all requesters
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', requesterIds);

      if (profilesError) {
        console.error('Error loading requester profiles:', profilesError);
        setFriendRequests([]);
        return;
      }

      // Combine requests with profiles
      const requestsWithProfiles = requests.map(request => {
        const requesterProfile = profiles?.find(p => p.id === request.requester_id);
        return {
          ...request,
          requester: requesterProfile || null,
        };
      });

      setFriendRequests(requestsWithProfiles);
    } catch (error) {
      console.error('Error loading friend requests:', error);
      setFriendRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Accept friend request
  const handleAcceptFriendRequest = async (requestId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update request status to accepted
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('recipient_id', user.id);

      if (error) {
        console.error('Error accepting friend request:', error);
        Alert.alert('Error', 'Failed to accept friend request');
      } else {
        // The trigger will automatically create the friendship
        Alert.alert('Success', 'Friend request accepted!');
        await loadFriendRequests();
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
    }
  };

  // Decline friend request
  const handleDeclineFriendRequest = async (requestId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update request status to declined
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'declined' })
        .eq('id', requestId)
        .eq('recipient_id', user.id);

      if (error) {
        console.error('Error declining friend request:', error);
        Alert.alert('Error', 'Failed to decline friend request');
      } else {
        Alert.alert('Success', 'Friend request declined');
        await loadFriendRequests();
      }
    } catch (error) {
      console.error('Error declining friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request');
    }
  };

  // Add friend (send friend request)
  const handleAddFriend = async (friendId) => {
    setAddingFriend(friendId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if already friends
      const { data: friendshipCheck } = await supabase
        .from('friends')
        .select('id, user_id, friend_id')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .limit(1);

      if (friendshipCheck && friendshipCheck.length > 0) {
        Alert.alert('Info', 'You are already friends!');
        setAddingFriend(null);
        return;
      }

      // Check if request already exists
      const { data: existingRequests } = await supabase
        .from('friend_requests')
        .select('id, status')
        .or(`and(requester_id.eq.${user.id},recipient_id.eq.${friendId}),and(requester_id.eq.${friendId},recipient_id.eq.${user.id})`)
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
            Alert.alert('Success', 'Friend request sent!');
          }
        }
      } else {
        // Send new friend request
        const { error } = await supabase
          .from('friend_requests')
          .insert({
            requester_id: user.id,
            recipient_id: friendId,
            status: 'pending',
          });

        if (error) {
          console.error('Error sending friend request:', error);
          Alert.alert('Error', 'Failed to send friend request');
        } else {
          Alert.alert('Success', 'Friend request sent!');
        }
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to send friend request');
    } finally {
      setAddingFriend(null);
    }
  };

  // Generate completion history helper
  const generateHistory = (goalCreatedAt, notStarted = false) => {
    const totalDays = 28;
    
    // If goal hasn't started, all boxes are future (null) except index 0 which is today
    if (notStarted) {
      return Array.from({ length: totalDays }, (_, index) => {
        if (index === 0) return null; // Today (index 0)
        return null; // All future days
      });
    }
    
    // Normal calculation for started goals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const createdDate = new Date(goalCreatedAt);
    createdDate.setHours(0, 0, 0, 0);
    const daysSinceCreation = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
    
    return Array.from({ length: totalDays }, (_, index) => {
      if (index < daysSinceCreation) return false;
      if (index === daysSinceCreation) return null;
      return null;
    });
  };

  const getCurrentDayIndex = (goalCreatedAt, goalListId) => {
    // If goal list hasn't started, current day is always index 0
    if (goalListId && goalListStatuses && goalListStatuses[goalListId] === false) {
      return 0;
    }
    
    if (!goalCreatedAt) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const createdDate = new Date(goalCreatedAt);
    if (isNaN(createdDate.getTime())) return 0;
    createdDate.setHours(0, 0, 0, 0);
    return Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
  };

  const goalCategories = useMemo(() => {
    if (!goalLists || goalLists.length === 0) return [];
    
    return goalLists.map(list => {
      if (!list || !list.id) return null;
      
      const isGroupGoal = list.type === 'group';
      const hasStarted = goalListStatuses && goalListStatuses[list.id] !== false; // Default to true if not checked yet
      
      // Generate completion history for the goal list
      const history = generateHistory(list.created_at || new Date().toISOString(), !hasStarted);
      const currentDayIndex = getCurrentDayIndex(list.created_at || new Date().toISOString(), list.id);
      
      // Get completion data for this goal list
      const completionData = (goalListCompletionData && goalListCompletionData[list.id]) || {};
      
      // Populate history with completion data
      const listGoals = (goals || []).filter(g => g && g.goal_list_id === list.id);
      if (listGoals.length > 0 && completionData && typeof completionData === 'object') {
        const createdDate = new Date(list.created_at || new Date().toISOString());
        if (!isNaN(createdDate.getTime())) {
          createdDate.setHours(0, 0, 0, 0);
          
          Object.keys(completionData).forEach(dateStr => {
            if (completionData[dateStr]) {
              const completionDate = new Date(dateStr);
              if (!isNaN(completionDate.getTime())) {
                completionDate.setHours(0, 0, 0, 0);
                
                const dayIndex = Math.floor((completionDate - createdDate) / (1000 * 60 * 60 * 24));
                if (dayIndex >= 0 && dayIndex < history.length && dayIndex < currentDayIndex) {
                  history[dayIndex] = true;
                }
              }
            }
          });
          
          // Check if all goals are completed today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = today.toISOString().split('T')[0];
          const allCompletedToday = completionData[todayStr] === true;
          if (currentDayIndex >= 0 && currentDayIndex < history.length) {
            history[currentDayIndex] = allCompletedToday;
          }
        }
      }
      
      return {
        id: list.id,
        name: list.name || 'Untitled',
        color: list.type === 'personal' ? '#4CAF50' : '#2196F3',
        icon: list.type === 'personal' ? 'person' : 'people',
        members: [],
        countdown: null,
        type: list.type,
        completionHistory: history,
        currentDayIndex: currentDayIndex,
        isGroupGoal: isGroupGoal,
        hasStarted: hasStarted,
        goalList: list,
      };
    }).filter(Boolean); // Remove any null entries
  }, [goalLists, goalListStatuses, goalListCompletionData, goals]);

  const getRandomColor = () => {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const [goalListStatuses, setGoalListStatuses] = useState({}); // Track which goal lists have started
  const [goalListParticipants, setGoalListParticipants] = useState({}); // Track participants for each goal list
  const [goalListCompletionData, setGoalListCompletionData] = useState({}); // Track completion data for each goal list

  // Check if group goal lists have started (all participants paid/accepted)
  useEffect(() => {
    const checkGoalListStatuses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const statuses = {};
      const participantsData = {};
      
      // Check each group goal list
      for (const goalList of goalLists) {
        if (goalList.type === 'group') {
          // Load all participants
          const { data: participantsDataRaw, error: participantsError } = await supabase
            .from('group_goal_participants')
            .select('*')
            .eq('goal_list_id', goalList.id);
          
          if (participantsError) {
            console.error('Error loading participants:', participantsError);
            participantsData[goalList.id] = [];
            statuses[goalList.id] = false;
          } else {
            // Always include the creator (owner) even if not in participants table
            const creatorId = goalList.user_id;
            const creatorInParticipants = participantsDataRaw?.find(p => p.user_id === creatorId);
            
            let allParticipantsList = [...(participantsDataRaw || [])];
            
            // If creator is not in participants, add them
            if (!creatorInParticipants) {
              // Load creator's profile
              const { data: creatorProfile } = await supabase
                .from('profiles')
                .select('id, name, username, avatar_url')
                .eq('id', creatorId)
                .single();
              
              allParticipantsList.unshift({
                id: `creator-${creatorId}`,
                user_id: creatorId,
                goal_list_id: goalList.id,
                payment_status: 'pending',
                profile: creatorProfile || null,
              });
            }
            
            if (allParticipantsList.length > 0) {
              // Load profiles for each participant (if not already loaded)
              const participantsWithProfiles = await Promise.all(
                allParticipantsList.map(async (participant) => {
                  // If profile already exists (for creator we just added), use it
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
              
              participantsData[goalList.id] = participantsWithProfiles;
              const allStarted = participantsWithProfiles.every(p => p.payment_status === 'paid');
              statuses[goalList.id] = allStarted;
            } else {
              // No participants yet, so not started
              participantsData[goalList.id] = [];
              statuses[goalList.id] = false;
            }
          }
        } else {
          // Personal goals are always "started"
          statuses[goalList.id] = true;
          participantsData[goalList.id] = [];
        }
      }
      
      setGoalListStatuses(statuses);
      setGoalListParticipants(participantsData);
    };

    if (goalLists.length > 0) {
      checkGoalListStatuses();
    }
  }, [goalLists]);

  const myGoals = useMemo(() => {
    return goals
      .map(goal => {
        // Find the goal list for this goal
        const goalList = goalLists.find(list => list.id === goal.goal_list_id);
        const isGroupGoal = goalList?.type === 'group';
        const hasStarted = (goalListStatuses && goalListStatuses[goal.goal_list_id]) !== false; // Default to true if not checked yet
        
        // For goals that haven't started, current day is always index 0
        const currentDayIndex = getCurrentDayIndex(goal.created_at, goal.goal_list_id);
        
        // Generate history - if not started, all boxes should be null/future except index 0
        const history = generateHistory(goal.created_at, !hasStarted);
        history[currentDayIndex] = goal.completed;
        
        return {
          id: goal.id,
          title: goal.title,
          checked: goal.completed,
          completionHistory: history,
          color: goal.color || getRandomColor(),
          currentDayIndex: currentDayIndex,
          goal_list_id: goal.goal_list_id,
          isGroupGoal: isGroupGoal,
          hasStarted: hasStarted,
          goalList: goalList, // Include the full goal list object
        };
      })
      .filter(goal => {
        // Filter out goals from goal lists that haven't started
        return goal.hasStarted !== false;
      });
  }, [goals, goalLists, goalListStatuses]);

  const friends = useMemo(() => [], []); // Empty for now

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header Section: Top icons */}
        <View style={styles.topIcons}>
          <View style={styles.spacer} />
          <View style={styles.topRight}>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="share-outline" size={24} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => {
                setFriendSearchModalVisible(true);
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              <Ionicons name="person-add-outline" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile row: big circle + name / username / email to the right */}
        <View style={styles.profileRow}>
          <View style={styles.profileAvatarWrap}>
            {getAvatarDisplayUrl(profile?.avatar_url) ? (
              <Image
                source={{ uri: getAvatarDisplayUrl(profile.avatar_url) }}
                style={styles.profileAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.profileAvatarPlaceholder}>
                <Ionicons name="person" size={56} color="#666666" />
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{profile?.name || 'User'}</Text>
            <Text style={styles.profileHandle} numberOfLines={1}>@{profile?.username || 'username'}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{currentUser?.email || ''}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.badgesRow}>
          {dateJoined && (
            <View style={styles.badge}>
              <Ionicons name="calendar-outline" size={16} color="#ffffff" />
              <Text style={styles.badgeText}>
                Joined {dateJoined.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          )}
          <View style={styles.badge}>
            <Ionicons name="flame" size={16} color="#FF6B35" />
            <Text style={styles.badgeText}>
              {streak} Day{streak !== 1 ? 's' : ''} Streak
            </Text>
          </View>
        </View>

        {/* Wallet / Balance Section */}
        <View style={styles.walletSection}>
          <View style={styles.walletHeader}>
            <Ionicons name="wallet" size={22} color="#4CAF50" />
            <Text style={styles.walletTitle}>Wallet</Text>
          </View>
          <View style={styles.walletCards}>
            <View style={styles.walletCard}>
              <Text style={styles.walletLabel}>Available to claim</Text>
              <Text style={styles.walletAmount}>${walletPendingTotal.toFixed(2)}</Text>
              {walletPendingList.length > 0 && (
                <View style={styles.walletPendingList}>
                  {walletPendingList.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={styles.walletPendingItem}
                      onPress={() =>
                        navigation.navigate('Payout', {
                          goalListId: g.id,
                          goalListName: g.name || 'Challenge',
                          totalAmount: String(g.total_pot || 0),
                        })
                      }
                    >
                      <Text style={styles.walletPendingName} numberOfLines={1}>{g.name || 'Challenge'}</Text>
                      <Text style={styles.walletPendingValue}>${parseFloat(g.prize_pool_amount || 0).toFixed(2)}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {walletPendingTotal === 0 && (
                <Text style={styles.walletSubtext}>Win a money challenge to see winnings here</Text>
              )}
            </View>
            <View style={styles.walletCard}>
              <Text style={styles.walletLabel}>Total received</Text>
              <Text style={styles.walletAmountSecondary}>${walletClaimedTotal.toFixed(2)}</Text>
              <Text style={styles.walletSubtext}>All-time winnings paid out</Text>
            </View>
          </View>
        </View>

        {/* Preferences & Log out */}
        <View style={styles.profileActions}>
          <TouchableOpacity
            style={styles.profileActionRow}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={22} color="#ffffff" />
            <Text style={styles.profileActionText}>Preferences</Text>
            <Ionicons name="chevron-forward" size={20} color="#888888" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.profileActionRow, styles.profileActionRowLogout]}
            onPress={() => {
              Alert.alert('Log out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log out', style: 'destructive', onPress: () => supabase.auth.signOut() },
              ]);
            }}
          >
            <Ionicons name="log-out-outline" size={22} color="#ff4444" />
            <Text style={styles.profileActionTextLogout}>Log out</Text>
          </TouchableOpacity>
        </View>

        {/* Friend Requests Section */}
        {friendRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friend Requests</Text>
            <View style={styles.friendRequestsList}>
              {friendRequests.map((request) => {
                const requester = request.requester || {};
                return (
                  <View key={request.id} style={styles.friendRequestItem}>
                    <View style={styles.friendRequestLeft}>
                      <View style={styles.friendRequestAvatar}>
                        {requester.avatar_url ? (
                          <Image
                            source={{ uri: requester.avatar_url }}
                            style={styles.friendRequestAvatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={24} color="#666666" />
                        )}
                      </View>
                      <View style={styles.friendRequestInfo}>
                        <Text style={styles.friendRequestName}>
                          {requester.name || 'User'}
                        </Text>
                        <Text style={styles.friendRequestUsername}>
                          @{requester.username || 'username'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.friendRequestActions}>
                      <TouchableOpacity
                        style={[styles.friendRequestButton, styles.acceptButton]}
                        onPress={() => handleAcceptFriendRequest(request.id)}
                      >
                        <Ionicons name="checkmark" size={20} color="#ffffff" />
                        <Text style={styles.friendRequestButtonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.friendRequestButton, styles.declineButton]}
                        onPress={() => handleDeclineFriendRequest(request.id)}
                      >
                        <Ionicons name="close" size={20} color="#ffffff" />
                        <Text style={styles.friendRequestButtonText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Goal Lists Section */}
        {goalCategories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Goal Lists</Text>
          <View style={styles.goalsList}>
            {goalCategories.map((category) => (
              <View key={category.id} style={styles.goalCard}>
                {/* Overlay for group goal lists that haven't started */}
                {category.isGroupGoal && !category.hasStarted && (() => {
                  const participants = (goalListParticipants && goalListParticipants[category.id]) || [];
                  const isOwner = category.goalList && category.goalList.user_id === currentUser?.id;
                  const hasMultipleParticipants = participants.length > 1;
                  const allPaidAccepted = participants.length > 0 && participants.every(p => p.payment_status === 'paid');
                  const showStartButton = isOwner && hasMultipleParticipants && allPaidAccepted;
                  const consequenceType = category.goalList?.consequence_type || 'money';
                  
                  // Determine the reason why it hasn't started
                  let reasonText = '';
                  if (participants.length <= 1) {
                    reasonText = 'Not enough participants';
                  } else if (consequenceType === 'money' && !allPaidAccepted) {
                    reasonText = 'Not everyone has paid';
                  } else if (consequenceType === 'punishment' && !allPaidAccepted) {
                    reasonText = 'Not everyone has accepted';
                  } else {
                    reasonText = 'Waiting to start';
                  }
                  
                  return (
                    <View style={styles.goalOverlay}>
                      <View style={styles.goalOverlayContent}>
                        <Text style={styles.goalOverlayText}>{reasonText}</Text>
                        
                        {/* Start Button - Only show if owner, multiple participants, and all paid/accepted */}
                        {(() => {
                          return showStartButton ? (
                            <TouchableOpacity 
                              style={styles.goalOverlayStartButton}
                              onPress={async () => {
                                // Mark goal list as started (update all_paid flag)
                                const { error } = await supabase
                                  .from('goal_lists')
                                  .update({ all_paid: true })
                                  .eq('id', category.id)
                                  .eq('user_id', currentUser.id);
                                
                                if (!error) {
                                  // Reload data to update status
                                  loadProfileData();
                                }
                              }}
                            >
                              <Text style={styles.goalOverlayStartButtonText}>Start</Text>
                            </TouchableOpacity>
                          ) : null;
                        })()}
                  </View>
                    </View>
                  );
                })()}
                
                <View style={styles.goalPillWrapper}>
                  <Text style={styles.goalTitleText}>{category.name}</Text>
                </View>
                    
                {/* Completion History Grid - Carousel with 3 rows */}
                {category.completionHistory && (() => {
                  const totalBoxes = category.completionHistory.length;
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
                          status: category.completionHistory[originalIndex],
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
                            const isToday = box.originalIndex === category.currentDayIndex;
                            const isFuture = box.originalIndex > category.currentDayIndex;
                            const isCompleted = box.status === true;
                  
                            return (
                          <View 
                                key={box.originalIndex} 
                            style={[
                                  styles.historySquare,
                                  isFuture 
                                    ? styles.historySquareFuture
                                    : isCompleted 
                                      ? { backgroundColor: category.color || '#4CAF50' }
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
                      </View>
            ))}
          </View>
        </View>
        )}

        {/* My Goals Section */}
        {myGoals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Goals</Text>
          
          <View style={styles.goalsList}>
            {myGoals.map((goal) => (
              <View key={goal.id} style={styles.goalCard}>
                {/* Overlay for group goals that haven't started */}
                {goal.isGroupGoal && !goal.hasStarted && (() => {
                  const participants = (goalListParticipants && goalListParticipants[goal.goal_list_id]) || [];
                  const isOwner = goal.goalList && goal.goalList.user_id === currentUser?.id;
                  const hasMultipleParticipants = participants.length > 1;
                  const allPaidAccepted = participants.length > 0 && participants.every(p => p.payment_status === 'paid');
                  const showStartButton = isOwner && hasMultipleParticipants && allPaidAccepted;
                  const consequenceType = goal.goalList?.consequence_type || 'money';
                  
                  return (
                    <View style={styles.goalOverlay}>
                      <View style={styles.goalOverlayContent}>
                        {/* Determine the reason why it hasn't started */}
                        {(() => {
                          let reasonText = '';
                          if (participants.length <= 1) {
                            reasonText = 'Not enough participants';
                          } else if (consequenceType === 'money' && !allPaidAccepted) {
                            reasonText = 'Not everyone has paid';
                          } else if (consequenceType === 'punishment' && !allPaidAccepted) {
                            reasonText = 'Not everyone has accepted';
                          } else {
                            reasonText = 'Waiting to start';
                          }
                          
                          return (
                            <>
                              <Text style={styles.goalOverlayText}>{reasonText}</Text>
                
                              {/* Start Button - Only show if owner, multiple participants, and all paid/accepted */}
                              {showStartButton && (
                                <TouchableOpacity 
                                  style={styles.goalOverlayStartButton}
                                  onPress={async () => {
                                    // Mark goal list as started (update all_paid flag)
                                    const { error } = await supabase
                                      .from('goal_lists')
                                      .update({ all_paid: true })
                                      .eq('id', goal.goal_list_id)
                                      .eq('user_id', currentUser.id);
                                    
                                    if (!error) {
                                      // Reload data to update status
                                      loadProfileData();
                                    }
                                  }}
                                >
                                  <Text style={styles.goalOverlayStartButtonText}>Start</Text>
                                </TouchableOpacity>
                              )}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  );
                })()}
                
                <View style={styles.goalPillWrapper}>
                  <Text style={styles.goalTitleText}>{goal.title}</Text>
                </View>
                
                  {/* Completion History Grid - Carousel with 3 rows */}
                  {goal.completionHistory && (() => {
                    const totalBoxes = goal.completionHistory.length;
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
                            status: goal.completionHistory[originalIndex],
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
                              const isToday = box.originalIndex === goal.currentDayIndex;
                              const isFuture = box.originalIndex > goal.currentDayIndex;
                              const isCompleted = box.status === true;
                    
                    return (
                      <View 
                                  key={box.originalIndex} 
                        style={[
                          styles.historySquare,
                          isFuture 
                            ? styles.historySquareFuture
                            : isCompleted 
                                        ? { backgroundColor: goal.color || '#4CAF50' }
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
              </View>
            ))}
          </View>
        </View>
        )}

        {/* Friends Section */}
        {friends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitleLarge}>Friends</Text>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendsScroll}
          >
            {friends.map((friend) => (
              <TouchableOpacity key={friend.id} style={styles.friendCard}>
                <View style={styles.friendCardAvatar}>
                  {(() => {
                    const avatarSrc = friend.avatar || friend.avatar_url;
                    const displayUrl = avatarSrc && (avatarSrc.startsWith('http://') || avatarSrc.startsWith('https://')) ? avatarSrc : getAvatarDisplayUrl(avatarSrc);
                    return displayUrl ? (
                      <Image source={{ uri: displayUrl }} style={styles.friendCardAvatarImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.friendCardEmoji}>{avatarSrc || '👤'}</Text>
                    );
                  })()}
                </View>
                <Text style={styles.friendCardName}>{friend.name}</Text>
                <Text style={styles.friendCardHandle}>{friend.handle}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        )}
      </ScrollView>

      {/* Friend Search Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={friendSearchModalVisible}
        onRequestClose={() => setFriendSearchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="people" size={24} color="#ffffff" style={styles.modalHeaderIcon} />
                <Text style={styles.modalTitle}>Find Friends</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setFriendSearchModalVisible(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Search Input - Prominent */}
            <View style={styles.searchContainerLarge}>
              <Ionicons name="search" size={22} color="#888888" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInputLarge}
                placeholder="Search by username or name..."
                placeholderTextColor="#666666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searching && (
                <ActivityIndicator size="small" color="#4CAF50" style={styles.searchLoader} />
              )}
              {searchQuery.trim() && !searching && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={20} color="#666666" />
                </TouchableOpacity>
              )}
            </View>

            {/* Search Results or Empty State */}
            <ScrollView style={styles.searchResultsContainer}>
              {!searchQuery.trim() && (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={64} color="#333333" />
                  <Text style={styles.emptySearchTitle}>Search for friends</Text>
                  <Text style={styles.emptySearchText}>
                    Enter a username or name to find people to connect with
                  </Text>
                </View>
              )}
              {searchResults.length === 0 && searchQuery.trim() && !searching && (
                <View style={styles.noResultsContainer}>
                  <Ionicons name="person-outline" size={48} color="#333333" />
                  <Text style={styles.noResultsText}>No users found</Text>
                  <Text style={styles.noResultsSubtext}>
                    Try searching with a different username or name
                  </Text>
                </View>
              )}
              {searchResults.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={styles.searchResultItem}
                  onPress={() => handleAddFriend(user.id)}
                  disabled={addingFriend === user.id}
                >
                  <View style={styles.searchResultAvatar}>
                    {user.avatar_url ? (
                      <Image
                        source={{ uri: user.avatar_url }}
                        style={styles.searchResultAvatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={24} color="#666666" />
                    )}
                  </View>
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultName}>{user.name || 'User'}</Text>
                    <Text style={styles.searchResultUsername}>@{user.username || 'username'}</Text>
                  </View>
                  {addingFriend === user.id ? (
                    <ActivityIndicator size="small" color="#4CAF50" />
                  ) : (
                    <TouchableOpacity
                      style={styles.addFriendButton}
                      onPress={() => handleAddFriend(user.id)}
                    >
                      <Ionicons name="person-add" size={22} color="#4CAF50" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    paddingBottom: 32,
    paddingTop: 56,
  },
  topIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  spacer: {
    width: 44,
  },
  topRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  profileAvatarWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    borderWidth: 3,
    borderColor: '#333333',
  },
  profileAvatar: {
    width: '100%',
    height: '100%',
  },
  profileAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 20,
    justifyContent: 'center',
    minWidth: 0,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  profileHandle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#888888',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666666',
  },
  profileActions: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  profileActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  profileActionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  profileActionRowLogout: {
    borderBottomWidth: 0,
  },
  profileActionTextLogout: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    width: '100%',
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#ffffff',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  secondaryButton: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  walletSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  walletCards: {
    gap: 12,
  },
  walletCard: {
    backgroundColor: '#0d0d0d',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  walletLabel: {
    fontSize: 12,
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  walletAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#4CAF50',
  },
  walletAmountSecondary: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  walletSubtext: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  walletPendingList: {
    marginTop: 10,
    gap: 6,
  },
  walletPendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  walletPendingName: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    marginRight: 8,
  },
  walletPendingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginRight: 6,
  },
  section: {
    marginTop: 8,
    paddingVertical: 16,
    borderBottomWidth: 8,
    borderBottomColor: '#0a0a0a',
  },
  groupsList: {
    gap: 8,
    paddingHorizontal: 16,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  groupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  groupSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#888888',
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberEmoji: {
    fontSize: 12,
  },
  countdownBadge: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  goalsList: {
    gap: 12,
    paddingHorizontal: 16,
  },
  goalCard: {
    paddingHorizontal: 0,
    paddingVertical: 12,
    position: 'relative',
  },
  goalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  goalOverlayContent: {
    alignItems: 'center',
  },
  goalOverlayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  goalOverlaySubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    fontWeight: '500',
  },
  goalOverlayParticipants: {
    marginTop: 20,
    width: '100%',
    gap: 12,
  },
  goalOverlayParticipant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goalOverlayParticipantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333333',
  },
  goalOverlayParticipantAvatarImage: {
    width: '100%',
    height: '100%',
  },
  goalOverlayParticipantAvatarEmoji: {
    fontSize: 20,
  },
  goalOverlayParticipantInfo: {
    flex: 1,
  },
  goalOverlayParticipantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  goalOverlayParticipantStatus: {
    fontSize: 12,
    color: '#ff4444',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  goalOverlayParticipantStatusPaid: {
    color: '#4CAF50',
  },
  goalOverlayStartButton: {
    marginTop: 20,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalOverlayStartButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  goalPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  goalTitleText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
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
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
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
  sectionTitleLarge: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  friendsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  friendCard: {
    width: 120,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendCardAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333333',
    marginBottom: 12,
  },
  friendCardAvatarImage: {
    width: '100%',
    height: '100%',
  },
  friendCardEmoji: {
    fontSize: 40,
  },
  friendCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  friendCardHandle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888888',
    textAlign: 'center',
  },
  viewMoreButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  viewMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '95%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalHeaderIcon: {
    opacity: 0.8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
  },
  searchContainerLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInputLarge: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  searchLoader: {
    marginLeft: 12,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  searchResultsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptySearchContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearchTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 24,
    marginBottom: 8,
  },
  emptySearchText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  noResultsContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchResultAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333333',
  },
  searchResultAvatarImage: {
    width: '100%',
    height: '100%',
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  searchResultUsername: {
    fontSize: 14,
    color: '#888888',
  },
  addFriendButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendRequestsList: {
    gap: 12,
  },
  friendRequestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendRequestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendRequestAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  friendRequestAvatarImage: {
    width: '100%',
    height: '100%',
  },
  friendRequestInfo: {
    flex: 1,
  },
  friendRequestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  friendRequestUsername: {
    fontSize: 14,
    color: '#888888',
  },
  friendRequestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  friendRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#ff4444',
  },
  friendRequestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
