import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function AddFriendsStepScreen({ navigation, route }) {
  const { goalListData, onFriendsSelected, onSkip } = route.params;
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Search users
  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
        .neq('id', user.id)
        .limit(20);

      if (error) {
        console.error('Error searching users:', error);
      } else {
        setSearchResults(data || []);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  // Debounce search
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

  const toggleFriend = (user) => {
    const isSelected = selectedFriends.some(f => f.id === user.id);
    if (isSelected) {
      setSelectedFriends(selectedFriends.filter(f => f.id !== user.id));
    } else {
      setSelectedFriends([...selectedFriends, user]);
    }
  };

  const handleContinue = () => {
    if (onFriendsSelected) {
      onFriendsSelected(selectedFriends);
    }
    navigation.goBack();
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Add Friends</Text>
        <TouchableOpacity onPress={handleSkip} style={styles.skipHeaderButton}>
          <Text style={styles.skipHeaderText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username or name..."
            placeholderTextColor="#666666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searching && (
            <ActivityIndicator size="small" color="#ffffff" style={styles.searchLoader} />
          )}
        </View>

        {/* Selected Friends */}
        {selectedFriends.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.sectionTitle}>Selected ({selectedFriends.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedList}>
              {selectedFriends.map((friend) => (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.selectedFriendCard}
                  onPress={() => toggleFriend(friend)}
                >
                  <View style={styles.selectedFriendAvatar}>
                    {friend.avatar_url ? (
                      <Image
                        source={{ uri: friend.avatar_url }}
                        style={styles.selectedFriendAvatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={20} color="#666666" />
                    )}
                  </View>
                  <Text style={styles.selectedFriendName} numberOfLines={1}>
                    {friend.name || friend.username}
                  </Text>
                  <Ionicons name="close-circle" size={18} color="#ff4444" style={styles.removeIcon} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search Results */}
        <ScrollView style={styles.resultsContainer}>
          {!searchQuery.trim() && !searching ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={60} color="#444444" />
              <Text style={styles.emptyStateText}>Start typing to find friends</Text>
            </View>
          ) : searchResults.length === 0 && !searching ? (
            <View style={styles.emptyState}>
              <Ionicons name="sad-outline" size={60} color="#444444" />
              <Text style={styles.emptyStateText}>No users found</Text>
            </View>
          ) : (
            searchResults.map((user) => {
              const isSelected = selectedFriends.some(f => f.id === user.id);
              return (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.resultItem,
                    isSelected && styles.resultItemSelected
                  ]}
                  onPress={() => toggleFriend(user)}
                >
                  <View style={styles.resultAvatar}>
                    {user.avatar_url ? (
                      <Image
                        source={{ uri: user.avatar_url }}
                        style={styles.resultAvatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={24} color="#666666" />
                    )}
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{user.name || 'User'}</Text>
                    <Text style={styles.resultUsername}>@{user.username || 'username'}</Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                  ) : (
                    <Ionicons name="add-circle-outline" size={28} color="#666666" />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Continue Button */}
      {selectedFriends.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>
              Continue with {selectedFriends.length} {selectedFriends.length === 1 ? 'friend' : 'friends'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}
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
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerSpacer: {
    width: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  skipHeaderButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888888',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
  },
  searchLoader: {
    marginLeft: 12,
  },
  selectedSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 12,
  },
  selectedList: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  selectedFriendCard: {
    alignItems: 'center',
    marginRight: 12,
    width: 80,
  },
  selectedFriendAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  selectedFriendAvatarImage: {
    width: '100%',
    height: '100%',
  },
  selectedFriendName: {
    fontSize: 12,
    color: '#ffffff',
    textAlign: 'center',
    maxWidth: 80,
  },
  removeIcon: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  resultsContainer: {
    flex: 1,
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 16,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  resultItemSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2a1a',
  },
  resultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  resultAvatarImage: {
    width: '100%',
    height: '100%',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  resultUsername: {
    fontSize: 14,
    color: '#888888',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});






