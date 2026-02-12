import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Image,
  Animated,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function CreateGoalListScreen({ navigation, route }) {
  const isOnboarding = route?.params?.isOnboarding || false;
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [goalListData, setGoalListData] = useState({
    type: '', // 'personal' or 'group'
    name: '',
    goals: [], // Will be split into groupGoals and personalGoals
    groupGoals: [], // Goals all members must do
    personalGoals: [], // Goals only creator does
    deadline: '',
    consequenceType: '', // 'money' or 'punishment'
    consequence: '',
    amount: '',
    friends: [], // Selected friends for group goals
  });

  const [currentGroupGoal, setCurrentGroupGoal] = useState('');
  const [currentPersonalGoal, setCurrentPersonalGoal] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(28);
  const [isUnlimited, setIsUnlimited] = useState(true); // Default to lifetime
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [endDate, setEndDate] = useState('');
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [availableFriends, setAvailableFriends] = useState([]); // All available friends to add
  const proceedAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const addFriendsButtonAnim = useRef(new Animated.Value(0)).current;
  const proceedFriendsAnim = useRef(new Animated.Value(0)).current;
  const addGroupGoalButtonAnim = useRef(new Animated.Value(0)).current;
  const addPersonalGoalButtonAnim = useRef(new Animated.Value(0)).current;

  const getSquareCount = () => {
    if (isUnlimited) {
      return 60; // 20 boxes per row x 3 rows
    }
    return selectedDuration;
  };

  useEffect(() => {
    if (goalListData.name.trim() !== '') {
      Animated.spring(proceedAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(proceedAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [goalListData.name]);

  // Animate add friends button when amount is entered
  useEffect(() => {
    if (goalListData.amount && goalListData.amount.trim() !== '') {
      Animated.spring(addFriendsButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(addFriendsButtonAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [goalListData.amount]);

  // Animate proceed button on step 6 when friends are selected
  useEffect(() => {
    if (step === 6) {
      if (goalListData.friends && goalListData.friends.length > 0) {
        Animated.spring(proceedFriendsAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }).start();
      } else {
        Animated.timing(proceedFriendsAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [step, goalListData.friends]);

  // Load available friends (include all friends, mark selected as "already added")
  const loadAvailableFriends = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get selected friend IDs
      const selectedFriendIds = (goalListData.friends || []).map(f => f.id);

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
        // Mark friends who are already selected
        const friendsWithStatus = (friendsData || []).map(friend => ({
          ...friend,
          isAlreadyAdded: selectedFriendIds.includes(friend.id),
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
      setFriendSearchResults([]);
      return;
    }

    setSearchingFriends(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get selected friend IDs
      const selectedFriendIds = (goalListData.friends || []).map(f => f.id);
      const allExcludedIds = [...selectedFriendIds, user.id];

      // First search all users
      const { data: allUsers, error: searchError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
        .neq('id', user.id)
        .limit(50);

      if (searchError) {
        console.error('Error searching users:', searchError);
        setFriendSearchResults([]);
        return;
      }

      // Filter to only show accepted friends (bidirectional)
      const { data: friendships } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      const friendIds = friendships?.map(f => f.user_id === user.id ? f.friend_id : f.user_id) || [];
      
      // Filter results to only include friends (include selected but mark them)
      const filtered = (allUsers || []).filter(user => 
        friendIds.includes(user.id)
      ).map(friend => ({
        ...friend,
        isAlreadyAdded: allExcludedIds.includes(friend.id),
      }));
      
      setFriendSearchResults(filtered);
    } catch (error) {
      console.error('Error searching friends:', error);
    } finally {
      setSearchingFriends(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (friendSearchQuery.trim()) {
        searchFriends(friendSearchQuery);
      } else {
        setFriendSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [friendSearchQuery]);

  // Send friend request or add friend if already friends
  const toggleFriendSelection = async (user) => {
    const isSelected = goalListData.friends?.some(f => f.id === user.id);
    if (isSelected) {
      // Remove friend from selection
      const updatedFriends = goalListData.friends.filter(f => f.id !== user.id);
      setGoalListData({ ...goalListData, friends: updatedFriends });
      setTimeout(() => loadAvailableFriends(), 100);
      return;
    }

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Check if already friends
      const { data: friendshipCheck } = await supabase
        .from('friends')
        .select('id, user_id, friend_id')
        .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${currentUser.id})`)
        .limit(1);

      const isFriend = friendshipCheck && friendshipCheck.length > 0;

      if (isFriend) {
        // Already friends, add to selection
        setGoalListData({ 
          ...goalListData, 
          friends: [...(goalListData.friends || []), user] 
        });
        setTimeout(() => loadAvailableFriends(), 100);
      } else {
        // Check if friend request already exists
        const { data: existingRequests } = await supabase
          .from('friend_requests')
          .select('id, status, requester_id, recipient_id')
          .or(`and(requester_id.eq.${currentUser.id},recipient_id.eq.${user.id}),and(requester_id.eq.${user.id},recipient_id.eq.${currentUser.id})`)
          .limit(1);

        const existingRequest = existingRequests && existingRequests.length > 0 ? existingRequests[0] : null;

        if (existingRequest) {
          if (existingRequest.status === 'pending') {
            Alert.alert('Friend Request', 'Friend request already sent!');
          } else if (existingRequest.status === 'accepted') {
            // Shouldn't happen if friendship check worked, but handle it
            setGoalListData({ 
              ...goalListData, 
              friends: [...(goalListData.friends || []), user] 
            });
            setTimeout(() => loadAvailableFriends(), 100);
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
              setTimeout(() => loadAvailableFriends(), 100);
            }
          }
        } else {
          // Send new friend request
          const { error } = await supabase
            .from('friend_requests')
            .insert({
              requester_id: currentUser.id,
              recipient_id: user.id,
              status: 'pending',
            });

          if (error) {
            console.error('Error sending friend request:', error);
            Alert.alert('Error', 'Failed to send friend request');
          } else {
            Alert.alert('Success', 'Friend request sent! They will see it in their profile.');
            setTimeout(() => loadAvailableFriends(), 100);
          }
        }
      }
    } catch (error) {
      console.error('Error in toggleFriendSelection:', error);
      Alert.alert('Error', 'Failed to process friend request');
    }
  };

  // Load available friends when on step 6
  useEffect(() => {
    if (step === 6) {
      loadAvailableFriends();
    }
  }, [step]);

  useEffect(() => {
    if (step > 1) {
      Animated.spring(progressAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      progressAnim.setValue(0);
    }
  }, [step]);

  const handleNext = () => {
    // Skip consequence steps if personal goal
    if (step === 3 && goalListData.type === 'personal') {
      handleComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const addGroupGoal = () => {
    if (currentGroupGoal.trim()) {
      setGoalListData({
        ...goalListData,
        groupGoals: [...goalListData.groupGoals, currentGroupGoal.trim()],
        goals: [...goalListData.goals, { title: currentGroupGoal.trim(), type: 'group' }],
      });
      setCurrentGroupGoal('');
      
      // Reset and re-trigger animation
      addGroupGoalButtonAnim.setValue(0);
      Animated.spring(addGroupGoalButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }
  };

  const addPersonalGoal = () => {
    if (currentPersonalGoal.trim()) {
      setGoalListData({
        ...goalListData,
        personalGoals: [...goalListData.personalGoals, currentPersonalGoal.trim()],
        goals: [...goalListData.goals, { title: currentPersonalGoal.trim(), type: 'personal' }],
      });
      setCurrentPersonalGoal('');
      
      // Reset and re-trigger animation
      addPersonalGoalButtonAnim.setValue(0);
      Animated.spring(addPersonalGoalButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }
  };

  useEffect(() => {
    if (currentGroupGoal.trim() !== '') {
      Animated.spring(addGroupGoalButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(addGroupGoalButtonAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [currentGroupGoal]);

  useEffect(() => {
    if (currentPersonalGoal.trim() !== '') {
      Animated.spring(addPersonalGoalButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(addPersonalGoalButtonAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [currentPersonalGoal]);

  const removeGoal = (index, goalType) => {
    if (goalType === 'group') {
      const newGroupGoals = goalListData.groupGoals.filter((_, i) => i !== index);
      const newGoals = goalListData.goals.filter((g, i) => {
        if (typeof g === 'string') {
          return goalListData.groupGoals.indexOf(g) !== index;
        }
        return !(g.type === 'group' && goalListData.groupGoals.indexOf(g.title) === index);
      });
      setGoalListData({ ...goalListData, groupGoals: newGroupGoals, goals: newGoals });
    } else {
      const newPersonalGoals = goalListData.personalGoals.filter((_, i) => i !== index);
      const newGoals = goalListData.goals.filter((g, i) => {
        if (typeof g === 'string') {
          return goalListData.personalGoals.indexOf(g) !== index;
        }
        return !(g.type === 'personal' && goalListData.personalGoals.indexOf(g.title) === index);
      });
      setGoalListData({ ...goalListData, personalGoals: newPersonalGoals, goals: newGoals });
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        Alert.alert('Error', 'No user found');
        setLoading(false);
        return;
      }

      // Create goal list
      const { data: goalList, error: listError } = await supabase
        .from('goal_lists')
        .insert({
          user_id: user.id,
          name: goalListData.name,
          type: goalListData.type,
          deadline: goalListData.deadline || null,
          consequence_type: goalListData.consequenceType || null,
          consequence: goalListData.consequence || null,
          amount: goalListData.amount || null,
          duration_days: isUnlimited ? null : selectedDuration,
          is_unlimited: isUnlimited,
        })
        .select()
        .single();

      if (listError) {
        throw listError;
      }

      // Create individual goals with goal_type
      const groupGoalsToInsert = goalListData.groupGoals.map(goalTitle => ({
        user_id: user.id,
        goal_list_id: goalList.id,
        title: goalTitle,
        goal_type: 'group',
        completed: false,
      }));
      
      const personalGoalsToInsert = goalListData.personalGoals.map(goalTitle => ({
        user_id: user.id,
        goal_list_id: goalList.id,
        title: goalTitle,
        goal_type: 'personal',
        completed: false,
      }));
      
      const goalsToInsert = [...groupGoalsToInsert, ...personalGoalsToInsert];

      const { error: goalsError } = await supabase
        .from('goals')
        .insert(goalsToInsert);

      if (goalsError) {
        throw goalsError;
      }

      // For group goals, add participants (if any friends were added)
      if (goalListData.type === 'group') {
        // Add creator as participant (they need to pay too, but payment_status starts as 'pending')
        const participants = [
          { 
            goal_list_id: goalList.id, 
            user_id: user.id,
            payment_status: 'pending' // Owner hasn't paid yet, just setting up
          },
        ];

        // Add friends as participants if any were selected
        if (goalListData.friends && goalListData.friends.length > 0) {
          participants.push(
            ...goalListData.friends.map(friend => ({
              goal_list_id: goalList.id,
              user_id: friend.id,
              payment_status: 'pending'
            }))
          );
        }

        const { error: participantsError } = await supabase
          .from('group_goal_participants')
          .insert(participants);

        if (participantsError) {
          console.error('Error adding participants:', participantsError);
          // Show error but don't block - goal list is already created
          Alert.alert('Warning', 'Goal list created but some participants could not be added. You can add them later.');
        } else {
          // Create group goals for all participants (including creator)
          if (goalListData.groupGoals && goalListData.groupGoals.length > 0) {
            const allParticipantIds = participants.map(p => p.user_id);
            const groupGoalsToInsert = [];
            
            allParticipantIds.forEach(participantId => {
              goalListData.groupGoals.forEach(goalTitle => {
                groupGoalsToInsert.push({
                  user_id: participantId,
                  goal_list_id: goalList.id,
                  title: goalTitle,
                  goal_type: 'group',
                  completed: false,
                });
              });
            });

            if (groupGoalsToInsert.length > 0) {
              const { error: groupGoalsError } = await supabase
                .from('goals')
                .insert(groupGoalsToInsert);

              if (groupGoalsError) {
                console.error('Error creating group goals for participants:', groupGoalsError);
                // Don't block - goal list is already created
              }
            }
          }
        }

        // Update goal list to require payment if consequence type is money
        if (goalListData.consequenceType === 'money') {
          await supabase
            .from('goal_lists')
            .update({ payment_required: true })
            .eq('id', goalList.id)
            .eq('user_id', user.id);
        }
      }

      setLoading(false);
      
      if (isOnboarding) {
        // Navigate to main app after onboarding
        Alert.alert('Success!', 'Your first goal list has been created!', [
          { text: 'OK', onPress: () => {
            // Navigation will be handled by App.js when hasGoals becomes true
          }}
        ]);
      } else {
        Alert.alert('Success', 'Goal list created successfully!', [
          { text: 'OK', onPress: () => {
            navigation.goBack();
          }}
        ]);
      }
    } catch (error) {
      console.error('Error creating goal list:', error);
      setLoading(false);
      Alert.alert('Error', error.message || 'Failed to create goal list. Please try again.');
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return goalListData.type !== '';
      case 2:
        return goalListData.name.trim() !== '';
      case 3:
        return goalListData.goals.length > 0;
      case 4:
        return goalListData.consequenceType !== '';
      case 5:
        if (goalListData.consequenceType === 'money') {
          return goalListData.amount !== '';
        }
        return goalListData.consequence.trim() !== '';
      case 6:
        // Step 6 is for adding friends - can always proceed (skip is available)
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (step) {
       case 1:
        return (
          <View style={[styles.stepContainer, styles.choiceStepContainer]}>
            <TouchableOpacity
              style={styles.choiceOption}
              onPress={() => {
                setGoalListData({ ...goalListData, type: 'personal' });
                setStep(2);
              }}
            >
              <View style={styles.choiceAvatar}>
                <Image source={require('../assets/solo.png')} style={styles.choiceImage} />
              </View>
              <Text style={styles.choiceLabel}>do it alone</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>or</Text>

            <TouchableOpacity
              style={styles.choiceOption}
              onPress={() => {
                setGoalListData({ ...goalListData, type: 'group' });
                setStep(2);
              }}
            >
              <View style={styles.choiceAvatar}>
                <Image source={require('../assets/fsf.png')} style={styles.choiceImage} />
              </View>
              <Text style={styles.choiceLabel}>do it better together</Text>
            </TouchableOpacity>
          </View>
        );

       case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, styles.centeredTitle]}>Name Your Adventure</Text>
            
            <View>
              <TextInput
                style={[styles.input, styles.centeredInput]}
                value={goalListData.name}
                onChangeText={(text) => setGoalListData({ ...goalListData, name: text })}
                textAlign="center"
              />
              <Animated.View
                style={[
                  styles.proceedButton,
                  {
                    opacity: proceedAnim,
                    transform: [
                      {
                        translateY: proceedAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents={goalListData.name.trim() !== '' ? 'auto' : 'none'}
              >
                <TouchableOpacity 
                  style={styles.proceedButtonInner}
                  onPress={handleNext}
                >
                  <Text style={styles.proceedButtonText}>Proceed</Text>
                  <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, styles.centeredTitle]}>Add Your Goals</Text>
            
            {/* Duration Selector */}
            <View style={styles.durationSection}>
              <Text style={styles.durationLabel}>Duration:</Text>
              
              <TouchableOpacity 
                style={styles.dropdownTrigger}
                onPress={() => setShowDurationDropdown(!showDurationDropdown)}
              >
                <Text style={styles.dropdownText}>
                  {isUnlimited ? 'Lifetime' : endDate || 'Select Date'}
                </Text>
                <Ionicons 
                  name={showDurationDropdown ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="#ffffff" 
                />
              </TouchableOpacity>

              {showDurationDropdown && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity 
                    style={styles.dropdownOption}
                    onPress={() => {
                      setShowDurationDropdown(false);
                      setShowDatePicker(true);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>Select Date</Text>
                  </TouchableOpacity>
                  <View style={styles.dropdownDivider} />
                  <TouchableOpacity 
                    style={styles.dropdownOption}
                    onPress={() => {
                      setIsUnlimited(true);
                      setEndDate('');
                      setShowDurationDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>Lifetime</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Native Date Picker */}
            {showDatePicker && Platform.OS === 'ios' && (
              <Modal
                transparent={true}
                animationType="slide"
                visible={showDatePicker}
                onRequestClose={() => setShowDatePicker(false)}
              >
                <View style={styles.datePickerModalOverlay}>
                  <View style={styles.datePickerContainer}>
                    <View style={styles.datePickerHeader}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.datePickerDoneButton}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(event, date) => {
                        if (date) {
                          setSelectedDate(date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          date.setHours(0, 0, 0, 0);
                          const diffTime = date - today;
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          
                          setSelectedDuration(diffDays);
                          setIsUnlimited(false);
                          setEndDate(date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }));
                        }
                      }}
                      themeVariant="dark"
                      textColor="#ffffff"
                    />
                  </View>
                </View>
              </Modal>
            )}
            
            {showDatePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  
                  if (date && event.type === 'set') {
                    setSelectedDate(date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    date.setHours(0, 0, 0, 0);
                    const diffTime = date - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    setSelectedDuration(diffDays);
                    setIsUnlimited(false);
                    setEndDate(date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }));
                  }
                }}
                themeVariant="dark"
              />
            )}

            {/* Goals List */}
            <ScrollView style={styles.goalsPreviewList} contentContainerStyle={styles.goalsPreviewContent}>
              {/* Group Goals Section - Only for group goal lists */}
              {goalListData.type === 'group' && (
                <>
                  <Text style={styles.goalSectionTitle}>Group Goals (All Members)</Text>
                  {goalListData.groupGoals.map((goal, index) => (
                    <View key={`group-${index}`} style={styles.goalPreviewItem}>
                      <View style={styles.goalPreviewHeader}>
                        <Text style={styles.goalPreviewTitle}>{goal}</Text>
                        <TouchableOpacity onPress={() => removeGoal(index, 'group')}>
                          <Ionicons name="close-circle" size={20} color="#FF4444" />
                        </TouchableOpacity>
                      </View>
                      
                      {/* History Squares */}
                      <View style={isUnlimited ? styles.historyGridUnlimited : styles.historyGrid}>
                        {Array.from({ length: getSquareCount() }).map((_, dayIndex) => (
                          <View
                            key={dayIndex}
                            style={[styles.historySquare, styles.historySquareFuture]}
                          />
                        ))}
                      </View>
                    </View>
                  ))}

                  {/* Add Group Goal Input */}
                  <View style={styles.addGoalPreview}>
                    <TextInput
                      style={styles.goalNameInput}
                      value={currentGroupGoal}
                      onChangeText={setCurrentGroupGoal}
                      onSubmitEditing={addGroupGoal}
                      placeholder="Add group goal..."
                      placeholderTextColor="#666666"
                    />
                    
                    {/* History Squares for new goal */}
                    <View style={isUnlimited ? styles.historyGridUnlimited : styles.historyGrid}>
                      {Array.from({ length: getSquareCount() }).map((_, dayIndex) => (
                        <View
                          key={dayIndex}
                          style={[styles.historySquare, styles.historySquareFuture]}
                        />
                      ))}
                    </View>

                    <Animated.View
                      style={[
                        styles.addGoalButtonContainer,
                        {
                          opacity: addGroupGoalButtonAnim,
                          transform: [
                            {
                              translateY: addGroupGoalButtonAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [20, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                      pointerEvents={currentGroupGoal.trim() !== '' ? 'auto' : 'none'}
                    >
                      <TouchableOpacity style={styles.addGoalButton} onPress={addGroupGoal}>
                        <Text style={styles.addGoalButtonText}>ADD GOAL</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  </View>
                </>
              )}

              {/* Personal Goals Section */}
              <Text style={styles.goalSectionTitle}>
                {goalListData.type === 'group' ? 'Personal Goals (Only You)' : 'Your Goals'}
              </Text>
              {goalListData.personalGoals.map((goal, index) => (
                <View key={`personal-${index}`} style={styles.goalPreviewItem}>
                  <View style={styles.goalPreviewHeader}>
                    <Text style={styles.goalPreviewTitle}>{goal}</Text>
                    <TouchableOpacity onPress={() => removeGoal(index, 'personal')}>
                      <Ionicons name="close-circle" size={20} color="#FF4444" />
                    </TouchableOpacity>
                  </View>
                  
                  {/* History Squares */}
                  <View style={isUnlimited ? styles.historyGridUnlimited : styles.historyGrid}>
                    {Array.from({ length: getSquareCount() }).map((_, dayIndex) => (
                      <View
                        key={dayIndex}
                        style={[styles.historySquare, styles.historySquareFuture]}
                      />
                    ))}
                  </View>
                </View>
              ))}

              {/* Add Personal Goal Input */}
              <View style={styles.addGoalPreview}>
                <TextInput
                  style={styles.goalNameInput}
                  value={currentPersonalGoal}
                  onChangeText={setCurrentPersonalGoal}
                  onSubmitEditing={addPersonalGoal}
                  placeholder="Add personal goal..."
                  placeholderTextColor="#666666"
                />
                
                {/* History Squares for new goal */}
                <View style={isUnlimited ? styles.historyGridUnlimited : styles.historyGrid}>
                  {Array.from({ length: getSquareCount() }).map((_, dayIndex) => (
                    <View
                      key={dayIndex}
                      style={[styles.historySquare, styles.historySquareFuture]}
                    />
                  ))}
                </View>

                <Animated.View
                  style={[
                    styles.addGoalButtonContainer,
                    {
                      opacity: addPersonalGoalButtonAnim,
                      transform: [
                        {
                          translateY: addPersonalGoalButtonAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                  pointerEvents={currentPersonalGoal.trim() !== '' ? 'auto' : 'none'}
                >
                  <TouchableOpacity style={styles.addGoalButton} onPress={addPersonalGoal}>
                    <Text style={styles.addGoalButtonText}>ADD GOAL</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </ScrollView>

            {(goalListData.groupGoals.length > 0 || goalListData.personalGoals.length > 0) && (
              <TouchableOpacity 
                style={styles.proceedButtonBottom}
                onPress={handleNext}
              >
                <Text style={styles.proceedButtonText}>
                  {goalListData.type === 'personal' ? 'Create' : 'Proceed'}
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        );

      case 4:
        return (
          <View style={[styles.stepContainer, styles.choiceStepContainer]}>
            <TouchableOpacity
              style={styles.choiceOption}
              onPress={() => {
                setGoalListData({ ...goalListData, consequenceType: 'money' });
                setStep(5);
              }}
            >
              <View style={styles.choiceAvatar}>
                <Image source={require('../assets/money.png')} style={styles.choiceImage} />
              </View>
              <Text style={styles.choiceLabel}>Money</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>or</Text>

            <TouchableOpacity
              style={styles.choiceOption}
              onPress={() => {
                setGoalListData({ ...goalListData, consequenceType: 'punishment' });
                setStep(5);
              }}
            >
              <View style={styles.choiceAvatar}>
                <Image source={require('../assets/dare.png')} style={styles.choiceImage} />
              </View>
              <Text style={styles.choiceLabel}>Punishment</Text>
            </TouchableOpacity>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContainer}>
            {goalListData.consequenceType === 'money' ? (
              <>
                <View style={styles.centeredContent}>
                <Text style={[styles.stepTitle, styles.centeredTitle]}>Set Bet Amount</Text>
                
                <View style={styles.amountPerUserSection}>
                  <Text style={styles.amountLabel}>Amount per person:</Text>
                  <View style={styles.amountInputWrapper}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      keyboardType="numeric"
                      value={goalListData.amount}
                      onChangeText={(text) => setGoalListData({ ...goalListData, amount: text })}
                      textAlign="center"
                        placeholder="0.00"
                        placeholderTextColor="#666666"
                    />
                  </View>
                </View>
                  </View>

                {goalListData.amount && goalListData.amount.trim() !== '' && (
                  <View style={styles.buttonWrapper}>
                    <Animated.View
                      style={[
                        styles.proceedButtonBottom,
                        {
                          opacity: addFriendsButtonAnim,
                          transform: [
                            {
                              translateY: addFriendsButtonAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [20, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                    <TouchableOpacity 
                        style={styles.proceedButtonInner}
                        onPress={handleNext}
                    >
                        <Text style={styles.proceedButtonText}>Proceed</Text>
                        <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                    </TouchableOpacity>
                    </Animated.View>
                </View>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.stepTitle, styles.centeredTitle]}>Define Punishment</Text>
                
                <TextInput
                  style={styles.punishmentInput}
                  placeholder="What will you have to do if you fail?"
                  placeholderTextColor="#666666"
                  multiline
                  value={goalListData.consequence}
                  onChangeText={(text) => setGoalListData({ ...goalListData, consequence: text })}
                  textAlign="center"
                />

                {goalListData.consequence.trim() !== '' && (
                  <View style={styles.buttonWrapper}>
                  <TouchableOpacity 
                      style={styles.proceedButtonBottom}
                      onPress={handleNext}
                  >
                      <Text style={styles.proceedButtonText}>Proceed</Text>
                      <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                  </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        );

      case 6:
        // Add Friends Step - Only for group goals
        return (
          <View style={styles.stepContainer}>
            <View style={styles.centeredContent}>
              <Text style={[styles.stepTitle, styles.centeredTitle]}>Add Friends</Text>
              <Text style={styles.stepSubtitle}>
                Add friends to join your challenge
              </Text>
            </View>

            {/* Search Bar */}
            <View style={styles.friendSearchContainer}>
              <Ionicons name="search" size={20} color="#666666" style={styles.friendSearchIcon} />
              <TextInput
                style={styles.friendSearchInput}
                placeholder="Search friends by name..."
                placeholderTextColor="#666666"
                value={friendSearchQuery}
                onChangeText={setFriendSearchQuery}
              />
              {friendSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setFriendSearchQuery('');
                    setFriendSearchResults([]);
                  }}
                  style={styles.clearSearchButton}
                >
                  <Ionicons name="close-circle" size={20} color="#888888" />
                </TouchableOpacity>
              )}
              {searchingFriends && (
                <ActivityIndicator size="small" color="#ffffff" style={styles.friendSearchLoader} />
              )}
            </View>

            {/* Friends List - Show all friends or search results */}
            <ScrollView style={styles.friendSearchResults} showsVerticalScrollIndicator={false}>
              {searchingFriends ? (
                <View style={styles.friendsLoadingContainer}>
                  <Text style={styles.friendsLoadingText}>Searching...</Text>
                </View>
              ) : friendSearchQuery.trim() ? (
                // Show search results
                friendSearchResults.length > 0 ? (
                  friendSearchResults.map((user) => {
                    const isSelected = goalListData.friends?.some(f => f.id === user.id);
                    const isAlreadyAdded = user.isAlreadyAdded || isSelected;
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.friendSearchResultItem,
                          isSelected && styles.friendSearchResultItemSelected,
                          isAlreadyAdded && styles.friendItemAdded
                        ]}
                        onPress={() => !isAlreadyAdded && toggleFriendSelection(user)}
                        disabled={isAlreadyAdded && !isSelected}
                      >
                        <View style={styles.friendSearchResultAvatar}>
                          {user.avatar_url ? (
                            <Image
                              source={{ uri: user.avatar_url }}
                              style={styles.friendSearchResultAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons name="person" size={24} color="#666666" />
                          )}
                        </View>
                        <View style={styles.friendSearchResultInfo}>
                          <Text style={styles.friendSearchResultName}>{user.name || 'User'}</Text>
                          <Text style={styles.friendSearchResultUsername}>@{user.username || 'username'}</Text>
                        </View>
                        {isSelected ? (
                          <View style={styles.alreadyAddedContainer}>
                            <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                            <Text style={styles.alreadyAddedText}>Added</Text>
                          </View>
                        ) : (
                          <Ionicons name="add-circle-outline" size={28} color="#666666" />
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
                  availableFriends.map((user) => {
                    const isSelected = goalListData.friends?.some(f => f.id === user.id);
                    const isAlreadyAdded = user.isAlreadyAdded || isSelected;
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.friendSearchResultItem,
                          isSelected && styles.friendSearchResultItemSelected,
                          isAlreadyAdded && styles.friendItemAdded
                        ]}
                        onPress={() => !isAlreadyAdded && toggleFriendSelection(user)}
                        disabled={isAlreadyAdded && !isSelected}
                      >
                        <View style={styles.friendSearchResultAvatar}>
                          {user.avatar_url ? (
                            <Image
                              source={{ uri: user.avatar_url }}
                              style={styles.friendSearchResultAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons name="person" size={24} color="#666666" />
                          )}
                        </View>
                        <View style={styles.friendSearchResultInfo}>
                          <Text style={styles.friendSearchResultName}>{user.name || 'User'}</Text>
                          <Text style={styles.friendSearchResultUsername}>@{user.username || 'username'}</Text>
                        </View>
                        {isSelected ? (
                          <View style={styles.alreadyAddedContainer}>
                            <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                            <Text style={styles.alreadyAddedText}>Added</Text>
                          </View>
                        ) : (
                          <Ionicons name="add-circle-outline" size={28} color="#666666" />
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

            {/* Friends List */}
            <View style={styles.friendsListContainer}>
              {goalListData.friends && goalListData.friends.length > 0 ? (
                <ScrollView style={styles.friendsList} showsVerticalScrollIndicator={false}>
                  {goalListData.friends.map((friend) => (
                    <View key={friend.id} style={styles.friendListItem}>
                      <View style={styles.friendListAvatar}>
                        {friend.avatar_url ? (
                          <Image
                            source={{ uri: friend.avatar_url }}
                            style={styles.friendListAvatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={20} color="#666666" />
                        )}
                      </View>
                      <View style={styles.friendListInfo}>
                        <Text style={styles.friendListName}>{friend.name || 'User'}</Text>
                        <Text style={styles.friendListUsername}>@{friend.username || 'username'}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          const updatedFriends = goalListData.friends.filter(f => f.id !== friend.id);
                          setGoalListData({ ...goalListData, friends: updatedFriends });
                        }}
                        style={styles.removeFriendButton}
                      >
                        <Ionicons name="close-circle" size={24} color="#ff4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.noFriendsContainer}>
                  <Ionicons name="people-outline" size={48} color="#444444" />
                  <Text style={styles.noFriendsText}>No friends</Text>
                </View>
              )}
            </View>
            
            {/* Skip or Proceed Button */}
            <View style={styles.buttonWrapper}>
              {goalListData.friends && goalListData.friends.length > 0 ? (
                <Animated.View
                  style={[
                    styles.proceedButtonBottom,
                    {
                      opacity: proceedFriendsAnim,
                      transform: [
                        {
                          translateY: proceedFriendsAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity 
                    style={styles.proceedButtonInner}
                    onPress={() => {
                      // Proceed to complete
                      handleComplete();
                    }}
                  >
                    <Text style={styles.proceedButtonText}>Proceed</Text>
                    <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <View style={styles.proceedButtonBottom}>
                  <TouchableOpacity 
                    style={styles.proceedButtonInner}
                    onPress={() => {
                      // Skip adding friends - can add later
                      setGoalListData({ ...goalListData, friends: goalListData.friends || [] });
                      handleComplete();
                    }}
                  >
                    <Text style={styles.proceedButtonText}>Add Friends Later</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>CREATE A NEW ADVENTURE</Text>
        </View>
      </View>

      {/* Progress Indicator */}
      {step > 1 && (
        <Animated.View 
          style={[
            styles.progressContainer,
            {
              opacity: progressAnim,
              transform: [
                {
                  translateY: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {(goalListData.type === 'personal' ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]).map((num) => (
            <View
              key={num}
              style={[
                styles.progressSquare,
                num < step && styles.progressSquareCompleted,
                num === step && styles.progressSquareCurrent,
                num > step && styles.progressSquareFuture,
              ]}
            />
          ))}
        </Animated.View>
      )}

      {/* Step Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {renderStep()}
      </ScrollView>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Creating goal list...</Text>
          </View>
        </View>
      )}

      {/* Navigation Buttons - Hidden */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 6,
  },
  progressSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  progressSquareCompleted: {
    backgroundColor: '#4CAF50',
  },
  progressSquareCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  progressSquareFuture: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#444444',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  choiceStepContainer: {
    paddingTop: 80,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  centeredTitle: {
    textAlign: 'center',
    marginBottom: 32,
  },
  stepSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#888888',
    marginBottom: 32,
    textAlign: 'center',
  },
  friendsListContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 20,
  },
  friendsList: {
    flexGrow: 1,
  },
  friendListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendListAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  friendListAvatarImage: {
    width: '100%',
    height: '100%',
  },
  friendListInfo: {
    flex: 1,
  },
  friendListName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  friendListUsername: {
    fontSize: 14,
    color: '#888888',
  },
  removeFriendButton: {
    padding: 4,
  },
  noFriendsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  noFriendsText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#666666',
    marginTop: 16,
  },
  friendSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendSearchIcon: {
    marginRight: 12,
  },
  friendSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
  },
  clearSearchButton: {
    marginLeft: 8,
    padding: 4,
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
  friendSearchLoader: {
    marginLeft: 12,
  },
  friendSearchResults: {
    maxHeight: 200,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  friendSearchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendSearchResultItemSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2a1a',
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
  friendSearchResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  friendSearchResultAvatarImage: {
    width: '100%',
    height: '100%',
  },
  friendSearchResultInfo: {
    flex: 1,
  },
  friendSearchResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  friendSearchResultUsername: {
    fontSize: 13,
    color: '#888888',
  },
  centeredInput: {
    textAlign: 'center',
  },
  proceedButton: {
    position: 'absolute',
    bottom: -50,
    right: 0,
  },
  proceedButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  proceedButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  durationSection: {
    marginBottom: 32,
    position: 'relative',
  },
  durationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    zIndex: 1000,
  },
  dropdownOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  goalsPreviewList: {
    flex: 1,
  },
  goalsPreviewContent: {
    gap: 24,
    paddingBottom: 80,
  },
  goalPreviewItem: {
    gap: 12,
  },
  goalPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalPreviewTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  historyGridUnlimited: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    width: '100%',
  },
  historySquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  historySquareFuture: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  addGoalPreview: {
    gap: 12,
    marginBottom: 20,
  },
  goalNameInput: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#2a2a2a',
  },
  addGoalButtonContainer: {
    marginTop: 8,
  },
  addGoalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  addGoalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  proceedButtonBottom: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  buttonWrapper: {
    position: 'absolute',
    bottom: -100,
    right: 20,
  },
  personalButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  datePickerModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  datePickerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingBottom: 20,
    width: '85%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  datePickerDoneButton: {
    fontSize: 17,
    fontWeight: '600',
    color: '#4CAF50',
  },
  choiceOption: {
    alignItems: 'center',
  },
  choiceAvatar: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1a1a1a',
    borderWidth: 4,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  choiceAvatarSelected: {
    borderColor: '#4CAF50',
    borderWidth: 5,
  },
  choiceImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  choiceLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  orText: {
    fontSize: 28,
    fontWeight: '300',
    color: '#666666',
    textAlign: 'center',
    marginVertical: 30,
  },
  consequenceIconContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 100,
  },
  centeredContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 40,
  },
  amountPerUserSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
    color: '#4CAF50',
    marginRight: 8,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
    minWidth: 120,
    borderBottomWidth: 2,
    borderBottomColor: '#2a2a2a',
    paddingVertical: 8,
  },
  paymentInfoSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  paymentInfoLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  paymentInfoSubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: '#888888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  paymentMethodGrid: {
    flexDirection: 'column',
    gap: 12,
    width: '100%',
  },
  paymentMethodButton: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
  },
  applePayButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  cashAppButton: {
    backgroundColor: '#00D64F',
    borderColor: '#00D64F',
  },
  paypalButton: {
    backgroundColor: '#0070BA',
    borderColor: '#0070BA',
  },
  cardButton: {
    backgroundColor: '#1a1a1a',
    borderColor: '#5865F2',
  },
  cashAppIcon: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  punishmentInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    fontSize: 18,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 150,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  finalizeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
  },
  skipButton: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  finalizeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  optionCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#0a1a0a',
  },
  optionText: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#888888',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  addGoalContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  goalInput: {
    flex: 1,
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalsList: {
    gap: 8,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  goalItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    flex: 1,
  },
  deadlineOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  deadlineOption: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  deadlineOptionSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  deadlineOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },
  deadlineOptionTextSelected: {
    color: '#ffffff',
  },
  goalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 16,
  },
  goalTypeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  goalTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  goalTypeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  goalTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },
  goalTypeButtonTextActive: {
    color: '#ffffff',
  },
  orText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginVertical: 16,
  },
  moneyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginRight: 8,
  },
  moneyInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    fontSize: 24,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888888',
    marginBottom: 8,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  button: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    backgroundColor: '#4CAF50',
  },
  buttonDisabled: {
    backgroundColor: '#2a2a2a',
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

