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
import { supabase } from '../lib/supabase';
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

  // Load profile and goals data
  const loadProfileData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

      setLoading(false);
    } catch (error) {
      console.error('Error loading profile data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadProfileData();
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

  // Add friend
  const handleAddFriend = async (friendId) => {
    setAddingFriend(friendId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // For now, we'll just show an alert since we need to create a friends table
      // TODO: Create friends table in Supabase and implement friend requests
      Alert.alert(
        'Friend Request',
        'Friend request functionality will be available soon!',
        [{ text: 'OK' }]
      );

      // Future implementation:
      // const { error } = await supabase
      //   .from('friends')
      //   .insert({
      //     user_id: user.id,
      //     friend_id: friendId,
      //     status: 'pending'
      //   });
      
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to add friend');
    } finally {
      setAddingFriend(null);
    }
  };

  const goalCategories = useMemo(() => {
    return goalLists.map(list => ({
      id: list.id,
      name: list.name,
      color: list.type === 'personal' ? '#4CAF50' : '#2196F3',
      icon: list.type === 'personal' ? 'person' : 'people',
      members: [],
      countdown: null,
      type: list.type,
    }));
  }, [goalLists]);

  // Generate completion history helper
  const generateHistory = (goalCreatedAt) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const createdDate = new Date(goalCreatedAt);
    createdDate.setHours(0, 0, 0, 0);
    const daysSinceCreation = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
    const totalDays = 28;
    
    return Array.from({ length: totalDays }, (_, index) => {
      if (index < daysSinceCreation) return false;
      if (index === daysSinceCreation) return null;
      return null;
    });
  };

  const getCurrentDayIndex = (goalCreatedAt) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const createdDate = new Date(goalCreatedAt);
    createdDate.setHours(0, 0, 0, 0);
    return Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
  };

  const getRandomColor = () => {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const myGoals = useMemo(() => {
    return goals.map(goal => {
      const history = generateHistory(goal.created_at);
      const currentDayIndex = getCurrentDayIndex(goal.created_at);
      history[currentDayIndex] = goal.completed;
      
      return {
        id: goal.id,
        title: goal.title,
        checked: goal.completed,
        completionHistory: history,
        color: goal.color || getRandomColor(),
        currentDayIndex: currentDayIndex,
      };
    });
  }, [goals]);

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
        {/* Header Section */}
        <View style={styles.headerSection}>
          {/* Top Icons */}
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
              <TouchableOpacity 
                style={styles.iconButton}
                onPress={() => navigation.navigate('Settings')}
              >
                <Ionicons name="settings-outline" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile Avatar */}
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color="#666666" />
              </View>
            )}
          </View>

          {/* Name and Handle */}
          <Text style={styles.name}>{profile?.name || 'User'}</Text>
          <Text style={styles.handle}>@{profile?.username || 'username'}</Text>

          {/* Stats Badges */}
          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Ionicons name="calendar-outline" size={16} color="#ffffff" />
              <Text style={styles.badgeText}>Feb 10</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="flame" size={16} color="#FF6B35" />
              <Text style={styles.badgeText}>5 Day Streak</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="trophy-outline" size={16} color="#FFD700" />
              <Text style={styles.badgeText}>Level 3</Text>
            </View>
          </View>
        </View>

        {/* Goal Categories Section */}
        {goalCategories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Goal Lists</Text>
            <View style={styles.groupsList}>
              {goalCategories.map((category) => (
                <TouchableOpacity key={category.id} style={styles.groupCard}>
                  <View style={styles.groupLeft}>
                    <View style={[styles.groupIcon, { backgroundColor: category.color }]}>
                      <Ionicons name={category.icon} size={24} color="#ffffff" />
                    </View>
                    <View style={styles.groupInfo}>
                      <Text style={styles.groupTitle}>{category.name}</Text>
                    </View>
                  </View>
                  {category.countdown && (
                    <View style={styles.countdownBadge}>
                      <Text style={styles.countdownText}>{category.countdown}</Text>
                    </View>
                  )}
                </TouchableOpacity>
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
                    <Text style={styles.friendCardEmoji}>{friend.avatar}</Text>
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
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: '#0a0a0a',
  },
  topIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 20,
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
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    borderWidth: 3,
    borderColor: '#333333',
    marginBottom: 12,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  handle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#888888',
    marginBottom: 20,
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
    paddingHorizontal: 16,
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
    borderWidth: 2,
    borderColor: '#333333',
    marginBottom: 12,
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
});
