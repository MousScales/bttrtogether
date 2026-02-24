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
import { supabase, getAvatarDisplayUrl } from '../lib/supabase';

export default function GoalListSettingsScreen({ navigation, route }) {
  const { goalListId, goalListName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [goalList, setGoalList] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [groupGoals, setGroupGoals] = useState([]);
  const [personalGoals, setPersonalGoals] = useState([]);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [declaringWinner, setDeclaringWinner] = useState(null);

  const isOwner = goalList && currentUser && goalList.user_id === currentUser.id;

  const loadData = async () => {
    if (!goalListId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUser(user);

      const { data: listData, error: listError } = await supabase
        .from('goal_lists')
        .select('*')
        .eq('id', goalListId)
        .single();
      if (listError || !listData) {
        setGoalList(null);
        setLoading(false);
        return;
      }
      setGoalList(listData);

      const ownerId = listData.user_id;
      const participantIds = [ownerId];

      const { data: participantsData } = await supabase
        .from('group_goal_participants')
        .select('user_id')
        .eq('goal_list_id', goalListId);
      (participantsData || []).forEach(p => participantIds.push(p.user_id));
      const uniqueIds = [...new Set(participantIds)];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', uniqueIds);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
      setParticipants(uniqueIds.map(id => ({ id, ...profileMap[id] })).filter(p => p.name || p.username));

      if (ownerId === user.id) {
        const { data: groupGoalsData } = await supabase
          .from('goals')
          .select('id, title, created_at')
          .eq('goal_list_id', goalListId)
          .eq('user_id', ownerId)
          .eq('goal_type', 'group')
          .order('created_at', { ascending: true });
        setGroupGoals(groupGoalsData || []);
      }

      const { data: personalGoalsData } = await supabase
        .from('goals')
        .select('id, title, created_at')
        .eq('goal_list_id', goalListId)
        .eq('user_id', user.id)
        .eq('goal_type', 'personal')
        .order('created_at', { ascending: true });
      setPersonalGoals(personalGoalsData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [goalListId]);

  const addGroupGoal = async () => {
    if (!newGoalTitle.trim() || !isOwner || !goalList) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('goals')
        .insert({
          goal_list_id: goalListId,
          user_id: goalList.user_id,
          title: newGoalTitle.trim(),
          goal_type: 'group',
          completed: false,
        })
        .select()
        .single();
      if (error) throw error;
      setGroupGoals(prev => [...prev, { id: data.id, title: data.title, created_at: data.created_at }]);
      setNewGoalTitle('');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add group goal');
    } finally {
      setSaving(false);
    }
  };

  const removeGroupGoal = async (goalId) => {
    if (!isOwner) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('goals').delete().eq('id', goalId);
      if (error) throw error;
      setGroupGoals(prev => prev.filter(g => g.id !== goalId));
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to remove goal');
    } finally {
      setSaving(false);
    }
  };

  const addPersonalGoal = async () => {
    if (!newGoalTitle.trim() || !currentUser) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('goals')
        .insert({
          goal_list_id: goalListId,
          user_id: currentUser.id,
          title: newGoalTitle.trim(),
          goal_type: 'personal',
          completed: false,
        })
        .select()
        .single();
      if (error) throw error;
      setPersonalGoals(prev => [...prev, { id: data.id, title: data.title, created_at: data.created_at }]);
      setNewGoalTitle('');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add personal goal');
    } finally {
      setSaving(false);
    }
  };

  const removePersonalGoal = async (goalId) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('goals').delete().eq('id', goalId);
      if (error) throw error;
      setPersonalGoals(prev => prev.filter(g => g.id !== goalId));
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to remove goal');
    } finally {
      setSaving(false);
    }
  };

  const computeCompletedCounts = async () => {
    const { data: listGoals } = await supabase
      .from('goals')
      .select('id, user_id, goal_type')
      .eq('goal_list_id', goalListId);
    if (!listGoals?.length) return {};

    const goalIds = listGoals.map(g => g.id);
    const { data: completions } = await supabase
      .from('goal_completions')
      .select('id, goal_id, user_id, completed_at')
      .in('goal_id', goalIds);

    const groupGoalIds = new Set(listGoals.filter(g => g.goal_type === 'group').map(g => g.id));
    const { data: participantsData } = await supabase
      .from('group_goal_participants')
      .select('user_id')
      .eq('goal_list_id', goalListId);
    const participantIds = [goalList.user_id, ...(participantsData || []).map(p => p.user_id)];
    const totalValidators = [...new Set(participantIds)].length;

    const completionIds = (completions || []).map(c => c.id);
    let validationsByCompletion = {};
    if (completionIds.length > 0) {
      const { data: validations } = await supabase
        .from('goal_validations')
        .select('goal_completion_id')
        .in('goal_completion_id', completionIds);
      (validations || []).forEach(v => {
        validationsByCompletion[v.goal_completion_id] = (validationsByCompletion[v.goal_completion_id] || 0) + 1;
      });
    }

    const countByUser = {};
    (completions || []).forEach(c => {
      const goal = listGoals.find(g => g.id === c.goal_id);
      if (!goal) return;
      const isGroup = groupGoalIds.has(c.goal_id);
      const validated = isGroup
        ? (validationsByCompletion[c.id] || 0) >= totalValidators / 2
        : true;
      if (validated) {
        countByUser[c.user_id] = (countByUser[c.user_id] || 0) + 1;
      }
    });
    return countByUser;
  };

  const declareWinner = async (winnerId) => {
    if (!isOwner || !goalList || goalList.winner_id) return;
    setDeclaringWinner(winnerId);
    try {
      const { error } = await supabase
        .from('goal_lists')
        .update({ winner_id: winnerId, tie_winner_ids: null })
        .eq('id', goalListId)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      setGoalList(prev => prev ? { ...prev, winner_id: winnerId, tie_winner_ids: null } : null);
      Alert.alert('Winner declared', 'The winner has been set.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not declare winner. You may need to be the list owner.');
    } finally {
      setDeclaringWinner(null);
    }
  };

  const declareTie = async (winnerIds) => {
    if (!isOwner || !goalList) return;
    setDeclaringWinner('tie');
    try {
      const { error } = await supabase
        .from('goal_lists')
        .update({ winner_id: null, tie_winner_ids: winnerIds })
        .eq('id', goalListId)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      setGoalList(prev => prev ? { ...prev, winner_id: null, tie_winner_ids: winnerIds } : null);
      const names = winnerIds.map(id => participants.find(p => p.id === id)?.name || 'Someone').join(', ');
      Alert.alert('Tie declared', `${names} tied. Prize will be split evenly when each claims their share.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not declare tie.');
    } finally {
      setDeclaringWinner(null);
    }
  };

  const declareWinnerAutomatically = async () => {
    if (!isOwner || !goalList || goalList.winner_id || (goalList.tie_winner_ids && goalList.tie_winner_ids.length > 0)) return;
    setDeclaringWinner('auto');
    try {
      const countByUser = await computeCompletedCounts();
      const userIds = Object.keys(countByUser);
      if (userIds.length === 0) {
        Alert.alert('No completions', 'No validated completions yet. Cannot determine a winner.');
        setDeclaringWinner(null);
        return;
      }
      const maxCount = Math.max(...userIds.map(uid => countByUser[uid]));
      const winners = userIds.filter(uid => countByUser[uid] === maxCount);
      if (winners.length > 1) {
        await declareTie(winners);
        return;
      }
      await declareWinner(winners[0]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not compute winner.');
    } finally {
      setDeclaringWinner(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{goalList ? (goalListName || 'List settings') : 'Settings'}</Text>
      </View>

      {loading && !goalList ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : !goalList ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Goal list not found</Text>
        </View>
      ) : (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Add friends + participant names */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('AddFriendsToGoal', { goalListId, goalListName })}
          >
            <Ionicons name="person-add" size={20} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Add friends</Text>
          </TouchableOpacity>
          {participants.length > 0 && (
            <View style={styles.participantNamesWrap}>
              {participants.map((p) => (
                <Text key={p.id} style={styles.participantNameOnly}>
                  {p.name || p.username || 'User'}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Goals: owner = group goals; non-owner = personal goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isOwner ? 'Group goals (everyone does these)' : 'Your personal goals'}
          </Text>
          {isOwner ? (
            <>
              {groupGoals.map((g) => (
                <View key={g.id} style={styles.goalRow}>
                  <Text style={styles.goalTitle}>{g.title}</Text>
                  <TouchableOpacity
                    onPress={() => removeGroupGoal(g.id)}
                    disabled={saving}
                    hitSlop={12}
                  >
                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.addGoalRow}>
                <TextInput
                  style={styles.input}
                  placeholder="New group goal..."
                  placeholderTextColor="#666"
                  value={newGoalTitle}
                  onChangeText={setNewGoalTitle}
                />
                <TouchableOpacity
                  style={[styles.addButton, saving && styles.addButtonDisabled]}
                  onPress={addGroupGoal}
                  disabled={saving || !newGoalTitle.trim()}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {personalGoals.map((g) => (
                <View key={g.id} style={styles.goalRow}>
                  <Text style={styles.goalTitle}>{g.title}</Text>
                  <TouchableOpacity
                    onPress={() => removePersonalGoal(g.id)}
                    disabled={saving}
                    hitSlop={12}
                  >
                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.addGoalRow}>
                <TextInput
                  style={styles.input}
                  placeholder="New personal goal..."
                  placeholderTextColor="#666"
                  value={newGoalTitle}
                  onChangeText={setNewGoalTitle}
                />
                <TouchableOpacity
                  style={[styles.addButton, saving && styles.addButtonDisabled]}
                  onPress={addPersonalGoal}
                  disabled={saving || !newGoalTitle.trim()}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Declare winner - owner only, automatic only (most completed goals; ties split) */}
        {isOwner && goalList.type === 'group' && !goalList.winner_id && !(goalList.tie_winner_ids && goalList.tie_winner_ids.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Declare winner</Text>
            <Text style={styles.hint}>
              End the challenge. The winner is chosen automatically by who completed the most validated goals (ties split the prize).
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.autoButton]}
              onPress={declareWinnerAutomatically}
              disabled={!!declaringWinner}
            >
              {declaringWinner === 'auto' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="trophy" size={20} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Declare winner automatically</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {(goalList.winner_id || (goalList.tie_winner_ids && goalList.tie_winner_ids.length > 0)) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Winner{goalList.tie_winner_ids?.length > 1 ? 's (tie)' : ''}</Text>
            {goalList.tie_winner_ids?.length > 1 ? (
              <Text style={styles.winnerText}>
                Tie between: {goalList.tie_winner_ids.map(id => participants.find(p => p.id === id)?.name || 'Someone').join(', ')}. Prize split evenly.
              </Text>
            ) : (
              <Text style={styles.winnerText}>
                {participants.find(p => p.id === (goalList.winner_id || goalList.tie_winner_ids?.[0]))?.name || 'Winner'} has been declared.
              </Text>
            )}
            {goalList.consequence_type === 'money' && (goalList.prize_pool_amount > 0 || goalList.total_pot > 0) && (
              <>
                {(() => {
                  const tiedIds = goalList.tie_winner_ids || [];
                  const isTie = tiedIds.length > 1;
                  const isWinner = goalList.winner_id === currentUser?.id || (isTie && tiedIds.includes(currentUser?.id));
                  const shareAmount = isTie && tiedIds.length ? (goalList.prize_pool_amount || (goalList.total_pot || 0) * 0.9) / tiedIds.length : (goalList.prize_pool_amount || (goalList.total_pot || 0) * 0.9);
                  const canClaim = isWinner && goalList.payout_status !== 'completed';
                  if (canClaim) {
                    return (
                      <TouchableOpacity
                        style={[styles.primaryButton, styles.claimButton]}
                        onPress={() =>
                          navigation.navigate('Payout', {
                            goalListId,
                            goalListName: goalList.name || goalListName,
                            totalAmount: String(goalList.total_pot || 0),
                            isTieShare: isTie,
                            shareAmount: isTie ? shareAmount : undefined,
                          })
                        }
                      >
                        <Ionicons name="cash-outline" size={20} color="#ffffff" />
                        <Text style={styles.primaryButtonText}>
                          {isTie ? `Claim your share ($${shareAmount.toFixed(2)})` : `Claim your winnings ($${shareAmount.toFixed(2)})`}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  if (isWinner && (goalList.payout_status === 'completed' || goalList.payout_status === 'processing')) {
                    return <Text style={styles.winnerText}>Payout has been initiated. Money is on the way.</Text>;
                  }
                  if (!isWinner) {
                    return (
                      <Text style={styles.hint}>
                        {isTie ? 'Tied winners can claim their share in Profile → Wallet or on the Goals screen.' : 'The winner can claim the prize in Profile → Wallet or on the Goals screen.'}
                      </Text>
                    );
                  }
                  return null;
                })()}
              </>
            )}
            {goalList.consequence_type === 'punishment' && goalList.consequence && (
              <View style={styles.dareBox}>
                {currentUser?.id === goalList.winner_id ? (
                  <Text style={styles.dareLabel}>The dare (for the loser(s)):</Text>
                ) : (
                  <Text style={styles.dareLabel}>Your dare</Text>
                )}
                <Text style={styles.dareBody}>{goalList.consequence}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  autoButton: {
    marginBottom: 16,
  },
  claimButton: {
    marginTop: 12,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  addGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#ffffff',
  },
  addButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#333',
    borderRadius: 10,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  participantName: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
  },
  participantNamesWrap: {
    marginTop: 12,
  },
  participantNameOnly: {
    fontSize: 15,
    color: '#ffffff',
    marginBottom: 6,
  },
  declareLink: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  winnerText: {
    fontSize: 15,
    color: '#4CAF50',
  },
  dareBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#1a1508',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  dareLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF9800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dareBody: {
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
  },
});
