import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import Svg, { Circle } from 'react-native-svg';

export default function UserGoalsScreen({ route, navigation }) {
  const { user } = route.params;
  
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  
  // Generate random completion history
  const generateHistory = () => {
    const today = 20;
    return Array.from({ length: 28 }, (_, index) => {
      if (index > today) return null;
      return Math.random() > 0.3;
    });
  };

  const CURRENT_DAY_INDEX = 20;

  const [goals, setGoals] = useState([
    { 
      id: 1, 
      title: 'Morning workout', 
      completed: true, 
      hasProof: true, 
      date: 'Today',
      viewers: ['😎', '🤠', '🥳'],
      validatedCount: 2,
      totalViewers: 4,
      completionHistory: generateHistory(),
      color: '#4CAF50'
    },
    { 
      id: 2, 
      title: 'Read 30 pages', 
      completed: false,
      completionHistory: generateHistory(),
      color: '#2196F3'
    },
    { 
      id: 3, 
      title: 'Drink 8 glasses', 
      completed: true, 
      hasProof: true, 
      date: 'Yesterday',
      viewers: ['🤓', '😊'],
      validatedCount: 1,
      totalViewers: 4,
      completionHistory: generateHistory(),
      color: '#FF9800'
    },
    { 
      id: 4, 
      title: 'Meditate 10 minutes', 
      completed: false,
      completionHistory: generateHistory(),
      color: '#9C27B0'
    },
    { 
      id: 5, 
      title: 'Cook healthy meal', 
      completed: true, 
      hasProof: true, 
      date: 'Feb 9',
      viewers: ['🥳', '😎', '🤠', '🤓'],
      validatedCount: 3,
      totalViewers: 4,
      completionHistory: generateHistory(),
      color: '#F44336'
    },
  ]);

  const handleValidate = (goalId) => {
    // TODO: Send validation to backend
    console.log('Validated goal:', goalId);
    alert('Goal validated! ✅');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{currentDate}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* User Info */}
      <View style={styles.userInfo}>
        <View style={styles.avatarWithProgress}>
          <Svg width={88} height={88} style={styles.progressRing}>
            {/* Background circle */}
            <Circle
              cx={44}
              cy={44}
              r={40}
              stroke="#2a2a2a"
              strokeWidth={3}
              fill="none"
            />
            {/* Progress circle */}
            <Circle
              cx={44}
              cy={44}
              r={40}
              stroke="#4CAF50"
              strokeWidth={3}
              fill="none"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - (user.progress || 0))}
              strokeLinecap="round"
              rotation="-90"
              origin="44, 44"
            />
          </Svg>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarEmoji}>{user.emoji}</Text>
          </View>
        </View>
        <View style={styles.userStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{goals.filter(g => g.completed).length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{goals.length}</Text>
            <Text style={styles.statLabel}>Total Goals</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user.progress ? Math.round(user.progress * 100) : 0}%</Text>
            <Text style={styles.statLabel}>Progress</Text>
          </View>
        </View>
      </View>

      {/* Goals List */}
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.goalsContainer}>
        {goals.map((goal) => (
          <View key={goal.id} style={styles.goalItem}>
            {/* Goal Title with Status */}
            <View style={styles.goalPillWrapper}>
              <Text style={styles.goalTitleText}>{goal.title}</Text>
              {goal.completed && (
                <View style={styles.statusContainer}>
                  <Text style={[
                    styles.statusText,
                    (goal.validatedCount / goal.totalViewers) >= 0.5 && styles.statusTextCompleted
                  ]}>
                    {(goal.validatedCount / goal.totalViewers) >= 0.5 
                      ? 'COMPLETED' 
                      : 'WAITING FOR VERIFICATION'}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Completion History Grid */}
            {goal.completionHistory && (
              <View style={styles.historyGrid}>
                {goal.completionHistory.map((status, index) => {
                  const isToday = index === CURRENT_DAY_INDEX;
                  const isFuture = index > CURRENT_DAY_INDEX;
                  // If goal is completed and it's today, make sure it's colored
                  const isCompleted = isToday && goal.completed ? true : status === true;
                  
                  return (
                    <View 
                      key={index} 
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
            )}

            {/* Image Placeholder and Validate - Only show if completed and has proof */}
            {goal.completed && goal.hasProof && (
              <>
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={48} color="#666666" />
                </View>
                
                {/* Viewers and Validation Count */}
                <View style={styles.viewersSection}>
                  <View style={styles.viewersRow}>
                    {goal.viewers && goal.viewers.slice(0, 4).map((emoji, index) => (
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
                    {goal.validatedCount}/{goal.totalViewers} have validated
                  </Text>
                </View>

                <View style={styles.postInfo}>
                  <Text style={styles.postDate}>{goal.date}</Text>
                  <TouchableOpacity 
                    style={styles.validateButton}
                    onPress={() => handleValidate(goal.id)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                    <Text style={styles.validateButtonText}>Validate</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 20,
  },
  avatarWithProgress: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    position: 'absolute',
  },
  userAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarEmoji: {
    fontSize: 40,
  },
  userStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888888',
  },
  scrollContainer: {
    flex: 1,
  },
  goalsContainer: {
    padding: 20,
    gap: 16,
  },
  goalItem: {
    gap: 12,
  },
  goalPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalTitleText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  statusContainer: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF9800',
    letterSpacing: 0.5,
  },
  statusTextCompleted: {
    color: '#4CAF50',
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 4,
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
  viewersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerEmoji: {
    fontSize: 16,
  },
  validationCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888888',
  },
  postInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#444444',
  },
  validateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

