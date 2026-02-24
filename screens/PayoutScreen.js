/**
 * PayoutScreen
 *
 * Depop-style payout: add bank in-app, then claim.
 *   Step 1 — "Add bank account": in-app form (name, routing, account number).
 *   Step 2 — "Claim winnings": transfer prize to their bank (arrives in ~2 business days).
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe, CardField } from '@stripe/stripe-react-native';
import { supabase } from '../lib/supabase';
import { getSupabaseFunctionsUrl, getSupabaseAnonKey } from '../lib/config';
import { useFocusEffect } from '@react-navigation/native';

const PLATFORM_FEE_PERCENT = 0.10; // 10 %

async function callProcessPayout(payload) {
  const baseUrl = getSupabaseFunctionsUrl();
  if (!baseUrl || !baseUrl.startsWith('http')) {
    throw new Error('Invalid Supabase URL. Check EXPO_PUBLIC_SUPABASE_URL in .env');
  }
  const response = await fetch(`${baseUrl}/process-payout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': getSupabaseAnonKey(),
      'Authorization': `Bearer ${getSupabaseAnonKey()}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PayoutScreen({ navigation, route }) {
  const { goalListId, goalListName, totalAmount } = route.params;
  const { createToken } = useStripe();

  const [user, setUser]                         = useState(null);
  const [loading, setLoading]                   = useState(false);
  const [checkingStatus, setCheckingStatus]     = useState(true);
  const [step, setStep]                         = useState('loading'); // 'loading' | 'add_bank' | 'claim' | 'done'
  const [prizeAmount, setPrizeAmount]           = useState(0);
  const [platformFee, setPlatformFee]           = useState(0);
  const [accountHolderName, setAccountHolderName] = useState('');
  const [routingNumber, setRoutingNumber]      = useState('');
  const [accountNumber, setAccountNumber]       = useState('');
  const [payoutMethods, setPayoutMethods]       = useState({ banks: [], cards: [] });
  const [selectedMethodId, setSelectedMethodId] = useState(null);
  const [showAddCard, setShowAddCard]           = useState(false);
  const [cardComplete, setCardComplete]         = useState(false);

  // Fetch user + check if they already have a bank added for payouts
  useFocusEffect(
    useCallback(() => {
      initialise();
    }, [goalListId])
  );

  const initialise = async () => {
    setCheckingStatus(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { navigation.goBack(); return; }
      setUser(currentUser);

      // Fetch goal list prize amounts and tie info
      const { data: goalList } = await supabase
        .from('goal_lists')
        .select('prize_pool_amount, platform_fee_amount, total_pot, payout_status, winner_id, tie_winner_ids')
        .eq('id', goalListId)
        .single();

      if (goalList) {
        const total     = goalList.total_pot || parseFloat(totalAmount) || 0;
        const fee       = goalList.platform_fee_amount || Math.round(total * PLATFORM_FEE_PERCENT * 100) / 100;
        const fullPrize = goalList.prize_pool_amount   || Math.round((total - fee) * 100) / 100;
        const isTie     = Array.isArray(goalList.tie_winner_ids) && goalList.tie_winner_ids.length > 1;
        const isTiedWinner = isTie && goalList.tie_winner_ids.includes(currentUser.id);
        const prize     = isTiedWinner ? Math.round((fullPrize / goalList.tie_winner_ids.length) * 100) / 100 : fullPrize;
        setPlatformFee(fee);
        setPrizeAmount(prize);

        if (goalList.payout_status === 'completed') {
          setStep('done');
          setCheckingStatus(false);
          return;
        }
        if (goalList.payout_status === 'processing' && !isTie) {
          setStep('done');
          setCheckingStatus(false);
          return;
        }
        if (isTie && goalList.payout_status === 'processing') {
          const { data: myPayout } = await supabase
            .from('payouts')
            .select('id')
            .eq('goal_list_id', goalListId)
            .eq('winner_id', currentUser.id)
            .maybeSingle();
          if (myPayout) {
            setStep('done');
            setCheckingStatus(false);
            return;
          }
        }
      } else {
        // Fallback calculation from the route param
        const total = parseFloat(totalAmount) || 0;
        const fee   = Math.round(total * PLATFORM_FEE_PERCENT * 100) / 100;
        setPlatformFee(fee);
        setPrizeAmount(Math.round((total - fee) * 100) / 100);
      }

      // Check if user has payout methods (banks/cards)
      const statusData = await callProcessPayout({
        action:       'check_status',
        user_id:      currentUser.id,
        goal_list_id: goalListId,
      });

      const banks = statusData.banks || [];
      const cards = statusData.cards || [];
      setPayoutMethods({ banks, cards });

      if (statusData.onboarding_completed && (banks.length > 0 || cards.length > 0)) {
        setStep('claim');
        const defaultBank = banks.find((b) => b.default_for_currency);
        const defaultCard = cards.find((c) => c.default_for_currency);
        if (defaultBank) setSelectedMethodId(defaultBank.id);
        else if (defaultCard) setSelectedMethodId(defaultCard.id);
        else if (banks.length) setSelectedMethodId(banks[0].id);
        else if (cards.length) setSelectedMethodId(cards[0].id);
      } else {
        setStep('add_bank');
      }
    } catch (err) {
      setStep('add_bank');
    } finally {
      setCheckingStatus(false);
    }
  };

  // ── Step 1: Add bank in-app (Depop-style) ─────────────────────────────────
  const handleAddBank = async () => {
    const name = (accountHolderName || '').trim();
    const routing = (routingNumber || '').replace(/\D/g, '');
    const account = (accountNumber || '').replace(/\D/g, '');
    if (!name) {
      Alert.alert('Missing info', 'Please enter the name on your bank account.');
      return;
    }
    if (routing.length !== 9) {
      Alert.alert('Invalid routing number', 'Routing number must be 9 digits.');
      return;
    }
    if (account.length < 4 || account.length > 17) {
      Alert.alert('Invalid account number', 'Account number must be 4–17 digits.');
      return;
    }
    setLoading(true);
    try {
      const data = await callProcessPayout({
        action:             'add_bank',
        user_id:            user.id,
        goal_list_id:       goalListId,
        account_holder_name: name,
        routing_number:     routing,
        account_number:     account,
      });
      if (data.success) {
        const statusData = await callProcessPayout({ action: 'check_status', user_id: user.id, goal_list_id: goalListId });
        const banks = statusData.banks || [];
        const cards = statusData.cards || [];
        setPayoutMethods({ banks, cards });
        if (banks.length) setSelectedMethodId(banks[banks.length - 1].id);
        else if (cards.length) setSelectedMethodId(cards[0].id);
        setStep('claim');
        Alert.alert('Bank added', 'Tap "Claim" below to send your winnings to this account.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add bank account');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!cardComplete) {
      Alert.alert('Complete card', 'Please enter a valid debit card.');
      return;
    }
    setLoading(true);
    try {
      const { token } = await createToken({ type: 'Card', currency: 'usd' });
      if (!token?.id) throw new Error('Could not create card token');
      await callProcessPayout({
        action: 'add_card',
        user_id: user.id,
        goal_list_id: goalListId,
        card_token: token.id,
      });
      const statusData = await callProcessPayout({ action: 'check_status', user_id: user.id, goal_list_id: goalListId });
      const banks = statusData.banks || [];
      const cards = statusData.cards || [];
      setPayoutMethods({ banks, cards });
      if (cards.length) setSelectedMethodId(cards[cards.length - 1].id);
      else if (banks.length) setSelectedMethodId(banks[0].id);
      setStep('claim');
      setShowAddCard(false);
      setCardComplete(false);
      Alert.alert('Card added', 'Tap "Claim" below for an instant payout to this debit card.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add card');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Transfer prize pool to selected method ──────────────────────
  const allMethods = [
    ...payoutMethods.banks.map((b) => ({ ...b, type: 'bank' })),
    ...payoutMethods.cards.map((c) => ({ ...c, type: 'card' })),
  ];
  const selectedMethod = allMethods.find((m) => m.id === selectedMethodId);
  const isInstant = selectedMethod?.type === 'card';
  // Instant payout fee: $0.35 per $20 (same as backend)
  const INSTANT_FEE_PER_20 = 0.35;
  const instantFee = isInstant ? Math.round((prizeAmount / 20) * INSTANT_FEE_PER_20 * 100) / 100 : 0;
  const netAmount = prizeAmount - instantFee;

  const handleClaimWinnings = async () => {
    const destination = selectedMethod
      ? (selectedMethod.type === 'card' ? `${selectedMethod.brand} •••• ${selectedMethod.last4}` : `Bank •••• ${selectedMethod.last4}`)
      : 'your payout method';
    const timing = isInstant ? 'Funds usually arrive within 30 minutes (instant).' : 'This usually arrives within 2 business days.';
    const confirmAmount = isInstant ? netAmount : prizeAmount;
    const confirmMsg = isInstant
      ? `$${confirmAmount.toFixed(2)} will be sent to ${destination} (instant fee $${instantFee.toFixed(2)} applied).`
      : `Transfer $${confirmAmount.toFixed(2)} to ${destination}?`;
    Alert.alert(
      'Confirm Claim',
      confirmMsg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              const data = await callProcessPayout({
                action:               'transfer',
                user_id:              user.id,
                goal_list_id:         goalListId,
                external_account_id:  selectedMethodId || undefined,
              });
              setStep('done');
              const received = data.amount ?? confirmAmount;
              const feeNote = data.instant_fee ? ` (instant fee $${Number(data.instant_fee).toFixed(2)} applied)` : '';
              Alert.alert(
                '🎉 Payout Initiated!',
                `$${received.toFixed(2)} is on its way. ${timing}${feeNote}`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not process payout');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderPrizeBreakdown = () => (
    <View style={styles.breakdownCard}>
      <Text style={styles.breakdownTitle}>Prize Breakdown</Text>

      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownLabel}>Total Pot</Text>
        <Text style={styles.breakdownValue}>${parseFloat(totalAmount || 0).toFixed(2)}</Text>
      </View>

      <View style={styles.breakdownDivider} />

      <View style={styles.breakdownRow}>
        <View>
          <Text style={styles.breakdownLabel}>Platform Fee</Text>
          <Text style={styles.breakdownSubLabel}>(10% app service fee)</Text>
        </View>
        <Text style={styles.breakdownValueFee}>-${platformFee.toFixed(2)}</Text>
      </View>

      <View style={styles.breakdownDivider} />

      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownLabelBig}>You Receive</Text>
        <Text style={styles.breakdownValueBig}>${prizeAmount.toFixed(2)}</Text>
      </View>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  if (checkingStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading payout details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Claim Winnings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        {/* Trophy Banner */}
        <View style={styles.winnerBanner}>
          <Ionicons name="trophy" size={52} color="#FFD700" />
          <Text style={styles.winnerText}>Congratulations!</Text>
          <Text style={styles.winnerSubtext}>{goalListName}</Text>
        </View>

        {/* Prize Breakdown */}
        {renderPrizeBreakdown()}

        {/* ── DONE STATE ── */}
        {step === 'done' && (
          <View style={styles.doneCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.doneTitle}>Payout Processing</Text>
            <Text style={styles.doneSubtext}>
              Your winnings are on their way! Funds typically arrive within 2 business days.
            </Text>
          </View>
        )}

        {/* ── STEP 1: Add bank account (in-app form) ── */}
        {step === 'add_bank' && (
          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 1 of 2</Text>
              </View>
              <Text style={styles.stepTitle}>Add your bank account</Text>
              <Text style={styles.stepSubtext}>
                Enter your checking account details below. We'll send your winnings here—no separate signup.
              </Text>
            </View>

            <View style={styles.payoutRowsWrap}>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutRowLabel}>Name on account</Text>
                <TextInput
                  style={styles.payoutRowInput}
                  value={accountHolderName}
                  onChangeText={setAccountHolderName}
                  placeholder="e.g. Jane Smith"
                  placeholderTextColor="#666666"
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutRowLabel}>Routing number (9 digits)</Text>
                <TextInput
                  style={styles.payoutRowInput}
                  value={routingNumber}
                  onChangeText={(t) => setRoutingNumber(t.replace(/\D/g, '').slice(0, 9))}
                  placeholder="000000000"
                  placeholderTextColor="#666666"
                  keyboardType="number-pad"
                  maxLength={9}
                  editable={!loading}
                />
              </View>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutRowLabel}>Account number</Text>
                <TextInput
                  style={styles.payoutRowInput}
                  value={accountNumber}
                  onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 17))}
                  placeholder="Your account number"
                  placeholderTextColor="#666666"
                  keyboardType="number-pad"
                  maxLength={17}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#4CAF50" />
              <Text style={styles.infoText}>We don't store your full account number. Payouts are secure.</Text>
            </View>

            {!showAddCard ? (
              <TouchableOpacity style={styles.addCardLink} onPress={() => setShowAddCard(true)}>
                <Ionicons name="card-outline" size={18} color="#4CAF50" />
                <Text style={styles.addCardLinkText}>Or add debit card for instant payout</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.addCardForm}>
                <Text style={styles.addCardFormTitle}>Add debit card (instant payout)</Text>
                <CardField
                  postalCodeEnabled={false}
                  placeholders={{ number: '4242 4242 4242 4242' }}
                  cardStyle={{
                    backgroundColor: '#1a1a1a',
                    borderColor: '#2a2a2a',
                    borderWidth: 1,
                    textColor: '#ffffff',
                    fontSize: 16,
                  }}
                  style={styles.cardField}
                  onCardChange={(cardDetails) => setCardComplete(cardDetails.complete)}
                />
                <View style={styles.addCardFormButtons}>
                  <TouchableOpacity onPress={() => { setShowAddCard(false); setCardComplete(false); }}>
                    <Text style={styles.cancelLinkText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addCardButton, (loading || !cardComplete) && styles.primaryButtonDisabled]}
                    onPress={handleAddCard}
                    disabled={loading || !cardComplete}
                  >
                    {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Add card</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── STEP 2: Claim (choose method or use default) ── */}
        {step === 'claim' && (
          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, styles.stepBadgeGreen]}>
                <Text style={styles.stepBadgeText}>Step 2 of 2</Text>
              </View>
              <Text style={styles.stepTitle}>Choose payout method</Text>
              <Text style={styles.stepSubtext}>
                Send winnings to a saved bank (2 business days) or debit card (instant).
              </Text>
            </View>

            {allMethods.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.methodOption, selectedMethodId === m.id && styles.methodOptionSelected]}
                onPress={() => setSelectedMethodId(m.id)}
                activeOpacity={0.7}
              >
                <View style={styles.methodOptionLeft}>
                  <Ionicons name={m.type === 'card' ? 'card' : 'business'} size={22} color="#ffffff" />
                  <View>
                    <Text style={styles.methodOptionLabel}>
                      {m.type === 'card' ? `${m.brand} •••• ${m.last4}` : `Bank •••• ${m.last4}`}
                    </Text>
                    <Text style={styles.methodOptionSub}>
                      {m.type === 'card' ? 'Instant (≈30 min)' : 'Standard (2 business days)'}
                    </Text>
                  </View>
                </View>
                {selectedMethodId === m.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                )}
              </TouchableOpacity>
            ))}

            {isInstant && instantFee > 0 && (
              <View style={styles.instantFeeRow}>
                <Text style={styles.instantFeeLabel}>Instant payout fee ($0.35 per $20)</Text>
                <Text style={styles.instantFeeValue}>-${instantFee.toFixed(2)}</Text>
              </View>
            )}
            {isInstant && instantFee > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoText}>You'll receive <Text style={styles.netAmountText}>${netAmount.toFixed(2)}</Text></Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color="#888888" />
              <Text style={styles.infoText}>
                {isInstant ? 'Instant payouts usually arrive within 30 minutes.' : 'Bank payouts usually arrive within 2 business days.'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      {step === 'add_bank' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleAddBank}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <>
                  <Ionicons name="card-outline" size={20} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Add bank account</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {step === 'claim' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleClaimWinnings}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <>
                  <Ionicons name="cash-outline" size={20} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>
                    Claim ${(isInstant ? netAmount : prizeAmount).toFixed(2)}
                  </Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#888888',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },

  // ── Winner banner
  winnerBanner: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  winnerText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 14,
  },
  winnerSubtext: {
    fontSize: 15,
    color: '#888888',
    marginTop: 6,
    textAlign: 'center',
  },

  // ── Prize breakdown card
  breakdownCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 14,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 15,
    color: '#cccccc',
  },
  breakdownSubLabel: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  breakdownValue: {
    fontSize: 15,
    color: '#cccccc',
    fontWeight: '600',
  },
  breakdownValueFee: {
    fontSize: 15,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  breakdownLabelBig: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  breakdownValueBig: {
    fontSize: 28,
    fontWeight: '900',
    color: '#4CAF50',
  },

  // ── Step card
  stepCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 14,
  },
  stepHeader: {
    gap: 8,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepBadgeGreen: {
    backgroundColor: '#1a2a1a',
  },
  stepBadgeText: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  stepSubtext: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 20,
  },
  payoutRowsWrap: {
    marginTop: 8,
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  payoutRowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  payoutRowInput: {
    fontSize: 16,
    color: '#ffffff',
    padding: 0,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
    minWidth: 100,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#888888',
    lineHeight: 18,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#111111',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodOptionSelected: {
    borderColor: '#4CAF50',
  },
  methodOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  methodOptionSub: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  instantFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#111111',
    borderRadius: 10,
    marginBottom: 8,
  },
  instantFeeLabel: {
    fontSize: 14,
    color: '#888888',
  },
  instantFeeValue: {
    fontSize: 14,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  netAmountText: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  addCardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
  },
  addCardLinkText: {
    fontSize: 15,
    color: '#4CAF50',
    fontWeight: '500',
  },
  addCardForm: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  addCardFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cccccc',
    marginBottom: 10,
  },
  cardField: {
    width: '100%',
    height: 50,
    marginBottom: 12,
  },
  addCardFormButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cancelLinkText: {
    fontSize: 15,
    color: '#888888',
  },
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },

  // ── Done state
  doneCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a4a2a',
    gap: 12,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  doneSubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Footer buttons
  footer: {
    padding: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: '#2a2a2a',
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: '#4CAF50',
  },
});
