import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function AddGoalsScreen({ navigation, route }) {
  const { goalListId, goalListName, consequenceType } = route.params;
  const [loading, setLoading] = useState(false);
  const [groupGoals, setGroupGoals] = useState([]);
  const [personalGoals, setPersonalGoals] = useState([]);
  const [currentGoal, setCurrentGoal] = useState('');
  const [goalList, setGoalList] = useState(null);
  const [showPunishmentConfirm, setShowPunishmentConfirm] = useState(false);
  const addGoalButtonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadGoalListAndGoals();
  }, []);

  useEffect(() => {
    if (currentGoal.trim() !== '') {
      Animated.spring(addGoalButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(addGoalButtonAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [currentGoal]);

  const getSquareCount = () => {
    if (!goalList) return 60;
    if (goalList.is_unlimited) {
      return 60; // 20 boxes per row x 3 rows
    }
    return goalList.duration_days || 28;
  };

  const loadGoalListAndGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load goal list
      const { data: goalListData, error: listError } = await supabase
        .from('goal_lists')
        .select('*')
        .eq('id', goalListId)
        .single();

      if (listError) throw listError;
      setGoalList(goalListData);

      // Load group goals (goals with goal_type = 'group') - get unique titles from any user
      const { data: allGroupGoals, error: groupError } = await supabase
        .from('goals')
        .select('title, created_at')
        .eq('goal_list_id', goalListId)
        .eq('goal_type', 'group')
        .order('created_at', { ascending: true });

      if (groupError) {
        console.error('Error loading group goals:', groupError);
        setGroupGoals([]);
      } else {
        // Get unique group goal titles
        const seenTitles = new Set();
        const uniqueGroupGoals = [];
        allGroupGoals?.forEach(goal => {
          if (!seenTitles.has(goal.title)) {
            seenTitles.add(goal.title);
            uniqueGroupGoals.push({ id: goal.title, title: goal.title });
          }
        });
        setGroupGoals(uniqueGroupGoals);
      }

      // Load user's personal goals for this goal list
      const { data: personalGoalsData, error: personalError } = await supabase
        .from('goals')
        .select('*')
        .eq('goal_list_id', goalListId)
        .eq('user_id', user.id)
        .eq('goal_type', 'personal')
        .order('created_at', { ascending: true });

      if (personalError) throw personalError;
      setPersonalGoals(personalGoalsData || []);
    } catch (error) {
      console.error('Error loading goals:', error);
      Alert.alert('Error', 'Failed to load goals');
    }
  };

  const addPersonalGoal = async () => {
    if (!currentGoal.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // If this is the first personal goal being added, automatically create group goals for this user
      if (personalGoals.length === 0 && groupGoals.length > 0) {
        const groupGoalsToInsert = groupGoals.map(groupGoal => ({
          user_id: user.id,
          goal_list_id: goalListId,
          title: groupGoal.title,
          goal_type: 'group',
          completed: false,
        }));

        const { error: groupGoalsError } = await supabase
          .from('goals')
          .insert(groupGoalsToInsert);

        if (groupGoalsError) {
          console.error('Error adding group goals:', groupGoalsError);
          // Continue anyway - don't block personal goal addition
        }
      }

      const { data, error } = await supabase
        .from('goals')
        .insert({
          user_id: user.id,
          goal_list_id: goalListId,
          title: currentGoal.trim(),
          goal_type: 'personal',
          completed: false,
        })
        .select()
        .single();

      if (error) throw error;

      setPersonalGoals([...personalGoals, data]);
      setCurrentGoal('');
      
      // Reset animation
      addGoalButtonAnim.setValue(0);
      Animated.spring(addGoalButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } catch (error) {
      console.error('Error adding goal:', error);
      Alert.alert('Error', 'Failed to add goal');
    }
  };

  const removePersonalGoal = async (goalId) => {
    try {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', goalId);

      if (error) throw error;

      setPersonalGoals(personalGoals.filter(g => g.id !== goalId));
    } catch (error) {
      console.error('Error removing goal:', error);
      Alert.alert('Error', 'Failed to remove goal');
    }
  };

  const handleSkip = async () => {
    // If skipping, still need to create group goals if they exist
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (groupGoals.length > 0) {
        const groupGoalsToInsert = groupGoals.map(groupGoal => ({
          user_id: user.id,
          goal_list_id: goalListId,
          title: groupGoal.title,
          goal_type: 'group',
          completed: false,
        }));

        const { error: groupGoalsError } = await supabase
          .from('goals')
          .insert(groupGoalsToInsert);

        if (groupGoalsError) {
          console.error('Error adding group goals:', groupGoalsError);
        }
      }

      // Proceed to payment/acceptance
      handleProceed();
    } catch (error) {
      console.error('Error skipping:', error);
      Alert.alert('Error', 'Failed to proceed');
    }
  };

  const handleProceed = async () => {
    // Navigate to payment or show punishment confirmation based on consequence type
    if (consequenceType === 'money') {
      navigation.navigate('GroupGoalPayment', {
        goalListId: goalListId,
        amount: goalList?.amount,
        goalListName: goalListName,
      });
    } else {
      // For punishment, show confirmation screen
      setShowPunishmentConfirm(true);
    }
  };

  const handleAcceptPunishment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('group_goal_participants')
        .upsert({
          goal_list_id: goalListId,
          user_id: user.id,
          payment_status: 'paid'
        }, {
          onConflict: 'goal_list_id,user_id'
        });

      if (error) throw error;

      navigation.goBack();
    } catch (error) {
      console.error('Error accepting punishment:', error);
      Alert.alert('Error', 'Failed to accept. Please try again.');
    }
  };

  // Show punishment confirmation screen
  if (showPunishmentConfirm && goalList?.consequence) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowPunishmentConfirm(false)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Accept Punishment</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.stepContainer}>
          <Text style={[styles.stepTitle, styles.centeredTitle]}>Punishment</Text>
          
          <View style={styles.punishmentContainer}>
            <Text style={styles.punishmentText}>{goalList.consequence}</Text>
          </View>

          <Text style={styles.punishmentQuestion}>
            Do you want to accept this punishment?
          </Text>

          <View style={styles.punishmentButtonContainer}>
            <TouchableOpacity 
              style={styles.declineButton}
              onPress={() => setShowPunishmentConfirm(false)}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.acceptPunishmentButton}
              onPress={handleAcceptPunishment}
            >
              <Text style={styles.acceptPunishmentButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Your Goals</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, styles.centeredTitle]}>Add Your Goals</Text>
        
        {/* Goals List */}
        <ScrollView style={styles.goalsPreviewList} contentContainerStyle={styles.goalsPreviewContent}>
          {/* Group Goals Section - Always show if group goals exist */}
          <Text style={styles.goalSectionTitle}>Group Goals (All Members)</Text>
          {groupGoals.length > 0 ? (
            <View style={styles.groupGoalsListContainer}>
              {groupGoals.map((goal) => (
                <View key={goal.id} style={styles.groupGoalBulletItem}>
                  <Text style={styles.groupGoalBullet}>•</Text>
                  <Text style={styles.groupGoalBulletText}>{goal.title}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noGoalsText}>No group goals set</Text>
          )}

          {/* Personal Goals Section */}
          <Text style={styles.goalSectionTitle}>Personal Goals (Only You)</Text>
          {personalGoals.map((goal) => (
            <View key={goal.id} style={styles.goalPreviewItem}>
              <View style={styles.goalPreviewHeader}>
                <Text style={styles.goalPreviewTitle}>{goal.title}</Text>
                <TouchableOpacity onPress={() => removePersonalGoal(goal.id)}>
                  <Ionicons name="close-circle" size={20} color="#FF4444" />
                </TouchableOpacity>
              </View>
              
              {/* History Squares */}
              <View style={goalList?.is_unlimited ? styles.historyGridUnlimited : styles.historyGrid}>
                {Array.from({ length: getSquareCount() }).map((_, dayIndex) => (
                  <View
                    key={dayIndex}
                    style={[styles.historySquare, styles.historySquareFuture]}
                  />
                ))}
              </View>
            </View>
          ))}

          {/* Add New Goal Input */}
          <View style={styles.addGoalPreview}>
            <TextInput
              style={styles.goalNameInput}
              value={currentGoal}
              onChangeText={setCurrentGoal}
              onSubmitEditing={addPersonalGoal}
              placeholder="Add personal goal..."
              placeholderTextColor="#666666"
            />
            
            {/* History Squares for new goal */}
            <View style={goalList?.is_unlimited ? styles.historyGridUnlimited : styles.historyGrid}>
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
                  opacity: addGoalButtonAnim,
                  transform: [
                    {
                      translateY: addGoalButtonAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                  ],
                },
              ]}
              pointerEvents={currentGoal.trim() !== '' ? 'auto' : 'none'}
            >
              <TouchableOpacity style={styles.addGoalButton} onPress={addPersonalGoal}>
                <Text style={styles.addGoalButtonText}>ADD GOAL</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>

        {/* Buttons */}
        {(personalGoals.length > 0 || groupGoals.length > 0) && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.proceedButtonBottom}
              onPress={handleProceed}
            >
              <Text style={styles.proceedButtonText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  centeredTitle: {
    textAlign: 'center',
  },
  goalsPreviewList: {
    flex: 1,
  },
  goalsPreviewContent: {
    paddingBottom: 20,
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
  noGoalsText: {
    fontSize: 14,
    color: '#888888',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  goalPreviewItem: {
    gap: 12,
    marginBottom: 20,
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
    textDecorationLine: 'underline',
  },
  buttonContainer: {
    paddingBottom: 20,
    marginTop: 20,
  },
  proceedButtonBottom: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  proceedButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  groupGoalsListContainer: {
    marginBottom: 20,
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
  punishmentContainer: {
    backgroundColor: '#1a1a1a',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginVertical: 32,
    alignItems: 'center',
  },
  punishmentText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  punishmentQuestion: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 32,
  },
  punishmentButtonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888888',
  },
  acceptPunishmentButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptPunishmentButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
