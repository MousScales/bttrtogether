import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year, monthIndex) {
  if (monthIndex === 1) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[monthIndex] ?? 31;
}

export default function ProgressScreen() {
  const [currentYear] = useState(() => new Date().getFullYear());
  const [goals, setGoals] = useState([]);
  const [goalLists, setGoalLists] = useState([]);
  const [currentGoalList, setCurrentGoalList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completionData, setCompletionData] = useState({}); // Cache: { "2024-01-15": true }
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [goalListStatuses, setGoalListStatuses] = useState({}); // Track which goal lists have started
  const [goalListParticipants, setGoalListParticipants] = useState({}); // Track participants for each goal list
  const [currentUser, setCurrentUser] = useState(null);

  // Load goals from Supabase on mount
  useEffect(() => {
    loadGoals();
  }, []);

  // Check if group goal lists have started (all participants paid/accepted)
  useEffect(() => {
    const checkGoalListStatuses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUser(user);

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

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (currentGoalList) {
        loadGoalsForCurrentList();
      } else {
        loadGoals();
      }
    }, [currentGoalList])
  );

  // Load completion data when goals change or goal list changes
  useEffect(() => {
    if (goals.length > 0 && currentGoalList) {
      loadCompletionData();
    } else {
      setCompletionData({});
    }
  }, [goals, currentGoalList]);

  // Reload goals when current goal list changes
  useEffect(() => {
    if (currentGoalList) {
      loadGoalsForCurrentList();
    }
  }, [currentGoalList]);

  const loadGoalsForCurrentList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentGoalList) return;

      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('goal_list_id', currentGoalList.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading goals:', error);
      } else {
        setGoals(data || []);
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const loadGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Load goal lists first
      const { data: listsData, error: listsError } = await supabase
        .from('goal_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (listsError) {
        console.error('Error loading goal lists:', listsError);
      } else {
        setGoalLists(listsData || []);
        if (listsData && listsData.length > 0 && !currentGoalList) {
          setCurrentGoalList(listsData[0]);
        }
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

        if (error) {
          console.error('Error loading goals:', error);
        } else {
          setGoals(data || []);
        }
      } else {
        setGoals([]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading goals:', error);
      setLoading(false);
    }
  };

  const loadCompletionData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || goals.length === 0 || !currentGoalList) {
        setCompletionData({});
        return;
      }

      // Only check goals from the current goal list
      const goalIds = goals
        .filter(g => g.goal_list_id === currentGoalList.id)
        .map(g => g.id);
      
      if (goalIds.length === 0) {
        setCompletionData({});
        return;
      }
      
      // Load all completions for current year
      const startDate = new Date(currentYear, 0, 1).toISOString().split('T')[0];
      const endDate = new Date(currentYear, 11, 31).toISOString().split('T')[0];

      const { data: completions, error } = await supabase
        .from('goal_completions')
        .select('goal_id, completed_at')
        .in('goal_id', goalIds)
        .eq('user_id', user.id)
        .gte('completed_at', startDate)
        .lte('completed_at', endDate);

      if (error) {
        console.error('Error loading completions:', error);
        setCompletionData({});
        return;
      }

      // Group completions by date (YYYY-MM-DD format)
      const completionsByDate = {};
      completions?.forEach(c => {
        // Extract just the date part (YYYY-MM-DD)
        // Handle both date strings and timestamp strings
        let dateStr;
        if (typeof c.completed_at === 'string') {
          dateStr = c.completed_at.includes('T') ? c.completed_at.split('T')[0] : c.completed_at;
        } else {
          // If it's a Date object, convert to string
          dateStr = new Date(c.completed_at).toISOString().split('T')[0];
        }
        
        if (!completionsByDate[dateStr]) {
          completionsByDate[dateStr] = new Set();
        }
        completionsByDate[dateStr].add(c.goal_id);
      });

      // Check which dates have ALL goals from the current list completed
      const completionStatus = {};
      Object.keys(completionsByDate).forEach(dateStr => {
        const completedGoalIds = completionsByDate[dateStr];
        // A day is complete only if ALL goals from the current list were completed that day
        completionStatus[dateStr] = completedGoalIds.size === goalIds.length;
      });

      console.log('Completion data loaded:', {
        goalIds,
        completionsCount: completions?.length || 0,
        completionStatus,
        datesWithCompletions: Object.keys(completionStatus).filter(d => completionStatus[d])
      });

      setCompletionData(completionStatus);
    } catch (error) {
      console.error('Error loading completion data:', error);
      setCompletionData({});
    }
  };

  // Check if all goals from the current list were completed on a specific date
  const areAllGoalsCompleted = (year, month, day) => {
    if (goals.length === 0 || !currentGoalList) return false;

    // Only check goals from the current goal list
    const currentListGoalIds = goals
      .filter(g => g.goal_list_id === currentGoalList.id)
      .map(g => g.id);
    
    if (currentListGoalIds.length === 0) return false;

    const targetDate = new Date(year, month, day);
    targetDate.setHours(0, 0, 0, 0);
    const dateStr = targetDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Check if this date has all goals from the current list completed
    const isCompleted = completionData[dateStr] === true;
    
    // Debug log for today
    if (day === new Date().getDate() && month === new Date().getMonth()) {
      console.log('Checking completion for today:', {
        dateStr,
        isCompleted,
        completionDataForDate: completionData[dateStr],
        allCompletionData: completionData
      });
    }
    
    return isCompleted;
  };

  const months = useMemo(
    () =>
      MONTH_NAMES.map((name, index) => ({
        name,
        index,
      })),
    []
  );

  const renderMonth = (month) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    const dayCount = getDaysInMonth(currentYear, month.index);
    const isCurrentMonth = month.index === currentMonth;

    // Get first day of month to determine offset
    const firstDay = new Date(currentYear, month.index, 1).getDay();
    const offsetDays = firstDay; // 0 = Sunday, 1 = Monday, etc.

    // Create array of days with offset for proper calendar layout
    const days = [];
    
    // Add empty boxes for days before the first day of the month
    for (let i = 0; i < offsetDays; i++) {
      days.push(null);
    }
    
    // Add actual days
    for (let day = 1; day <= dayCount; day++) {
      days.push(day);
    }

    // Organize into rows of 7, padding last row if needed
    const rows = [];
    for (let i = 0; i < days.length; i += 7) {
      const row = days.slice(i, i + 7);
      // Pad last row to always have 7 items
      while (row.length < 7) {
        row.push(null);
      }
      rows.push(row);
    }

    return (
      <View key={month.name} style={styles.monthSection}>
        {/* Month Header */}
        <View style={styles.monthHeader}>
          <Text style={styles.monthHeaderText}>
            {month.name} {currentYear}
          </Text>
        </View>

        {/* Days Grid - 7 days per row */}
        <View style={styles.daysContainer}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.dayRow}>
              {row.map((day, dayIndex) => {
                if (day === null) {
                  return <View key={`empty-${dayIndex}`} style={styles.dayBoxEmpty} />;
                }

                const dayDate = new Date(currentYear, month.index, day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dayDate.setHours(0, 0, 0, 0);

                const isToday = isCurrentMonth && day === currentDay;
                const isFuture = dayDate > today;
                const allCompleted = areAllGoalsCompleted(currentYear, month.index, day);

                // Determine base style based on priority: future > completed > incomplete
                let baseStyle = styles.dayBoxIncomplete; // Default
                if (isFuture) {
                  baseStyle = styles.dayBoxFuture;
                } else if (allCompleted) {
                  baseStyle = styles.dayBoxCompleted;
                }

                return (
                  <View 
                    key={day} 
                    style={[
                      styles.dayBox,
                      baseStyle,
                      isToday && styles.dayBoxToday,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Overlay for current goal list if it's a group list that hasn't started */}
      {currentGoalList && currentGoalList.type === 'group' && goalListStatuses[currentGoalList.id] === false && (() => {
        const participants = (goalListParticipants && goalListParticipants[currentGoalList.id]) || [];
        const isOwner = currentGoalList.user_id === currentUser?.id;
        const hasMultipleParticipants = participants.length > 1;
        const allPaidAccepted = participants.length > 0 && participants.every(p => p.payment_status === 'paid');
        const consequenceType = currentGoalList.consequence_type || 'money';

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

        const showStartButton = isOwner && hasMultipleParticipants && allPaidAccepted;

        return (
          <View style={styles.progressOverlay}>
            <View style={styles.progressOverlayContent}>
              <Text style={styles.progressOverlayText}>{reasonText}</Text>
              {showStartButton && (
                <TouchableOpacity
                  style={styles.goalOverlayStartButton}
                  onPress={async () => {
                    const { error } = await supabase
                      .from('goal_lists')
                      .update({ all_paid: true })
                      .eq('id', currentGoalList.id)
                      .eq('user_id', currentUser.id);

                    if (!error) {
                      await loadGoals();
                    }
                  }}
                >
                  <Text style={styles.goalOverlayStartButtonText}>Start</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })()}
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
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {months.map(month => renderMonth(month))}
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
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 100,
  },
  monthSection: {
    marginBottom: 32,
    paddingTop: 20,
  },
  monthHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    alignItems: 'flex-start',
  },
  monthHeaderText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  daysContainer: {
    paddingHorizontal: 20,
  },
  dayRow: {
    flexDirection: 'row',
    marginBottom: 8,
    width: '100%',
    gap: 8,
    justifyContent: 'center',
  },
  dayBox: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  dayBoxEmpty: {
    width: 48,
    height: 48,
  },
  dayBoxCompleted: {
    backgroundColor: '#4CAF50',
  },
  dayBoxIncomplete: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
  },
  dayBoxFuture: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  dayBoxToday: {
    borderWidth: 2,
    borderColor: '#ffffff',
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
  pillText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dropdownMenuContainer: {
    position: 'absolute',
    top: 120,
    right: 20,
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
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 5,
  },
  progressOverlayContent: {
    alignItems: 'center',
  },
  progressOverlayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
});

