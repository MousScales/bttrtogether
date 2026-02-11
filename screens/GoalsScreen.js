import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Animated, TextInput } from 'react-native';
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
  
  // Deadline - set to February 15, 2026 for example
  const deadline = new Date('2026-02-15T23:59:59');

  // Load goals from Supabase
  useEffect(() => {
    loadGoals();
  }, []);

  // Reload goals when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadGoals();
    }, [])
  );

  // Reload goals when current goal list changes
  useEffect(() => {
    if (currentGoalList) {
      loadGoalsForCurrentList();
    }
  }, [currentGoalList]);

  const loadGoalsForCurrentList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && currentGoalList) {
        const { data, error } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('goal_list_id', currentGoalList.id)
          .order('created_at', { ascending: true });

        if (error) throw error;

        const transformedGoals = data.map(goal => {
          const history = generateCompletionHistory(goal.created_at);
          const currentDayIndex = getCurrentDayIndex(goal.created_at);
          // Set today's completion status
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
            goal_list_type: currentGoalList.type, // Store goal list type
            created_at: goal.created_at, // Store creation date
            currentDayIndex: currentDayIndex, // Store current day index for this goal
          };
        });

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

        setGoalLists(listsData || []);
        
        // Set current goal list to the first one if not set
        if (listsData && listsData.length > 0 && !currentGoalList) {
          setCurrentGoalList(listsData[0]);
        }

        // Load goals for current goal list
        if (currentGoalList || (listsData && listsData.length > 0)) {
          const selectedList = currentGoalList || listsData[0];
          
          const { data, error } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_list_id', selectedList.id)
            .order('created_at', { ascending: true });

          if (error) throw error;

          // Transform data to match existing format
          const transformedGoals = data.map(goal => {
            const history = generateCompletionHistory(goal.created_at);
            const currentDayIndex = getCurrentDayIndex(goal.created_at);
            // Set today's completion status
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
              goal_list_type: selectedList.type, // Store goal list type
              created_at: goal.created_at, // Store creation date
              currentDayIndex: currentDayIndex, // Store current day index for this goal
            };
          });

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
      item.id === id && item.type === 'validation' 
        ? { ...item, validated: !item.validated } 
        : item
    ));
  };

  const toggleGoal = async (id) => {
    const goal = goals.find(g => g.id === id && g.type === 'goal');
    if (!goal) return;

    // For personal goals, directly toggle without navigation
    if (goal.goal_list_type === 'personal') {
      const newChecked = !goal.checked;
      
      // Update in Supabase
      const { error } = await supabase
        .from('goals')
        .update({ completed: newChecked })
        .eq('id', id);

      if (!error) {
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
          .eq('id', id);

        if (!error) {
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

  // Placeholder for friends - will implement later
  const friends = [];

  // Create animated values for each friend
  const floatAnims = useRef(friends.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Create floating animation for each avatar
    const animations = floatAnims.map((anim, index) => {
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
    });

    animations.forEach(animation => animation.start());

    return () => animations.forEach(animation => animation.stop());
  }, []);

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
        {/* Countdown Timer - Only show if there are goals */}
        {goals.length > 0 && (
          <View style={styles.countdownContainerOuter}>
            <Text style={styles.countdownLabel}>Time left in day</Text>
            <Text style={styles.countdownText}>{timeRemainingDay}</Text>
          </View>
        )}

        {/* Personal Goals */}
        <View style={styles.personalGoalsContainer}>
          {/* Show placeholder if no goals */}
          {goals.length === 0 ? (
            <View style={styles.placeholderContainer}>
              <TouchableOpacity onPress={() => navigation.navigate('CreateGoalList')}>
                <Text style={styles.placeholderText}>START YOUR ADVENTURE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Goals List */
            goals.filter(item => item.type === 'goal').map((item) => (
            <View key={item.id} style={styles.personalGoalItem}>
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
              
              {/* Completion History Grid - Carousel with 3 rows */}
              {item.completionHistory && (() => {
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
            </View>
          ))
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
                    setCurrentGoalList(list);
                    setDropdownVisible(false);
                    loadGoals();
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
                      // Update in Supabase
                      const { error } = await supabase
                        .from('goals')
                        .update({ title: newGoalName.trim() })
                        .eq('id', editingGoalId);

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
    zIndex: 10,
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
    zIndex: 10,
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
  },
  dropdownMenuContainer: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    width: 200,
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
});

