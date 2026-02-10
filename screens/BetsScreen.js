import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';

export default function BetsScreen() {
  const [expandedDate, setExpandedDate] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const friends = [
    { id: 1, name: 'Sarah M.', avatar: '👩', goal: 'Marathon Training' },
    { id: 2, name: 'Mike R.', avatar: '👨', goal: 'Coding Bootcamp' },
    { id: 3, name: 'Emma L.', avatar: '👧', goal: 'Spanish Fluency' },
    { id: 4, name: 'James K.', avatar: '🧑', goal: 'Read 50 Books' },
  ];

  // Combined timeline of all activities from all friends
  const allActivities = [
    { id: 1, userId: 1, name: 'Sarah M.', avatar: '👩', date: 'Feb 10', time: '8:30 AM', activity: 'Ran 12km this morning', completed: true },
    { id: 2, userId: 3, name: 'Emma L.', avatar: '👧', date: 'Feb 10', time: '7:15 AM', activity: 'Completed Spanish lesson', completed: true },
    { id: 3, userId: 2, name: 'Mike R.', avatar: '👨', date: 'Feb 9', time: '10:45 PM', activity: 'Finished React project', completed: true },
    { id: 4, userId: 4, name: 'James K.', avatar: '🧑', date: 'Feb 9', time: '9:20 PM', activity: 'Read 60 pages', completed: true },
    { id: 5, userId: 1, name: 'Sarah M.', avatar: '👩', date: 'Feb 9', time: '6:00 AM', activity: 'Morning yoga session', completed: true },
    { id: 6, userId: 3, name: 'Emma L.', avatar: '👧', date: 'Feb 8', time: '3:30 PM', activity: 'Practiced vocabulary', completed: true },
    { id: 7, userId: 2, name: 'Mike R.', avatar: '👨', date: 'Feb 8', time: '11:00 AM', activity: 'Skipped study session', completed: false },
    { id: 8, userId: 4, name: 'James K.', avatar: '🧑', date: 'Feb 8', time: '8:45 PM', activity: 'Started new book', completed: true },
    { id: 9, userId: 1, name: 'Sarah M.', avatar: '👩', date: 'Feb 7', time: '7:00 AM', activity: 'Ran 10km', completed: true },
    { id: 10, userId: 3, name: 'Emma L.', avatar: '👧', date: 'Feb 7', time: '5:00 PM', activity: 'Watched Spanish movie', completed: true },
    { id: 11, userId: 2, name: 'Mike R.', avatar: '👨', date: 'Feb 7', time: '2:30 PM', activity: 'Code review session', completed: true },
    { id: 12, userId: 4, name: 'James K.', avatar: '🧑', date: 'Feb 6', time: '10:00 PM', activity: 'No reading today', completed: false },
    { id: 13, userId: 1, name: 'Sarah M.', avatar: '👩', date: 'Feb 6', time: '6:30 AM', activity: 'Cross training workout', completed: true },
    { id: 14, userId: 3, name: 'Emma L.', avatar: '👧', date: 'Feb 6', time: '12:00 PM', activity: 'Grammar exercises', completed: true },
    { id: 15, userId: 2, name: 'Mike R.', avatar: '👨', date: 'Feb 5', time: '9:15 PM', activity: 'Built REST API', completed: true },
    { id: 16, userId: 4, name: 'James K.', avatar: '🧑', date: 'Feb 5', time: '7:30 PM', activity: 'Read 45 pages', completed: true },
  ];

  // Group activities by date
  const groupedByDate = allActivities.reduce((acc, activity) => {
    if (!acc[activity.date]) {
      acc[activity.date] = [];
    }
    acc[activity.date].push(activity);
    return acc;
  }, {});

  const dates = Object.keys(groupedByDate);

  const handleDateClick = (date) => {
    if (expandedDate === date) {
      setExpandedDate(null);
      setSelectedUserId(null);
    } else {
      setExpandedDate(date);
      setSelectedUserId(null);
    }
  };

  const handleUserClick = (date, userId) => {
    setExpandedDate(date);
    setSelectedUserId(userId);
  };

  const getActivitiesToShow = (date) => {
    const dateActivities = groupedByDate[date];
    if (selectedUserId) {
      return dateActivities.filter(a => a.userId === selectedUserId);
    }
    return dateActivities;
  };

  const getUniqueUsersForDate = (date) => {
    const dateActivities = groupedByDate[date];
    const userIds = [...new Set(dateActivities.map(a => a.userId))];
    return userIds.map(id => friends.find(f => f.id === id));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity Trail</Text>
        <Text style={styles.headerSubtitle}>Tap a date or user to see details</Text>
      </View>

      {/* Timeline */}
      <ScrollView style={styles.timelineScroll}>
        {dates.map((date, index) => {
          const usersForDate = getUniqueUsersForDate(date);
          const isExpanded = expandedDate === date;

          return (
            <View key={date} style={styles.dateSection}>
              {/* Date Row */}
              <View style={styles.dateRow}>
                {/* Date Button */}
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => handleDateClick(date)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateText}>{date}</Text>
                  <Text style={styles.dateIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </TouchableOpacity>

                {/* User Avatars */}
                <View style={styles.userAvatars}>
                  {usersForDate.map((user) => (
                    <TouchableOpacity
                      key={user.id}
                      style={[
                        styles.avatarButton,
                        selectedUserId === user.id && isExpanded && styles.avatarButtonSelected
                      ]}
                      onPress={() => handleUserClick(date, user.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.avatarEmoji}>{user.avatar}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Expanded Activities */}
              {isExpanded && (
                <View style={styles.activitiesExpanded}>
                  {selectedUserId && (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterText}>
                        Showing: {friends.find(f => f.id === selectedUserId)?.name}
                      </Text>
                      <TouchableOpacity onPress={() => setSelectedUserId(null)}>
                        <Text style={styles.clearFilter}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  {getActivitiesToShow(date).map((activity) => (
                    <View key={activity.id} style={styles.activityItem}>
                      <View style={styles.activityLeft}>
                        <Text style={styles.activityAvatar}>{activity.avatar}</Text>
                      </View>
                      <View style={styles.activityRight}>
                        <View style={styles.activityTopRow}>
                          <Text style={styles.activityName}>{activity.name}</Text>
                          <Text style={styles.activityTime}>{activity.time}</Text>
                        </View>
                        <Text style={[styles.activityText, !activity.completed && styles.activityTextMissed]}>
                          {activity.activity}
                        </Text>
                        {activity.completed ? (
                          <View style={styles.completedBadge}>
                            <Text style={styles.completedText}>✓ Completed</Text>
                          </View>
                        ) : (
                          <View style={styles.missedBadge}>
                            <Text style={styles.missedText}>✕ Missed</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Connector Line */}
              {index < dates.length - 1 && <View style={styles.connectorLine} />}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  timelineScroll: {
    flex: 1,
  },
  dateSection: {
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
  },
  dateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  dateIcon: {
    color: '#fff',
    fontSize: 12,
  },
  userAvatars: {
    flexDirection: 'row',
    marginLeft: 12,
    flex: 1,
    flexWrap: 'wrap',
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  avatarButtonSelected: {
    borderColor: '#007AFF',
    borderWidth: 3,
    backgroundColor: '#e3f2fd',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  activitiesExpanded: {
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  filterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearFilter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  activityLeft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityAvatar: {
    fontSize: 24,
  },
  activityRight: {
    flex: 1,
  },
  activityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
  },
  activityText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 18,
  },
  activityTextMissed: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  completedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  completedText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
  },
  missedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  missedText: {
    color: '#FF5252',
    fontSize: 11,
    fontWeight: '600',
  },
  connectorLine: {
    width: 2,
    height: 8,
    backgroundColor: '#007AFF',
    marginLeft: 66,
  },
});

