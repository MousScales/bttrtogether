/**
 * PayoutScreen — Stripe Connect Express payout flow
 *
 * Step 1 (connect): User taps "Set Up Payouts" → Stripe hosts ALL bank/ID onboarding.
 *                   When they return to the app we re-check readiness.
 * Step 2 (claim):   User taps "Claim $X" → backend transfers prize to their account.
 *                   Stripe automatically pays out to their linked bank.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSupabaseFunctionsUrl, getSupabaseAnonKey } from '../lib/config';
import { useFocusEffect } from '@react-navigation/native';

const PLATFORM_FEE_PERCENT = 0.10;

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

  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [step, setStep]               = useState('loading'); // 'loading' | 'connect' | 'claim' | 'done'
  const [prizeAmount, setPrizeAmount] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);

  // Detect when the user returns to the app after completing Stripe onboarding
  const appStateRef      = useRef(AppState.currentState);
  const waitingForStripe = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active' && waitingForStripe.current) {
        waitingForStripe.current = false;
        initialise(); // re-check readiness after Stripe onboarding
      }
      appStateRef.current = nextState;
    });
    return () => subscription?.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      initialise();
    }, [goalListId])
  );

  const initialise = async () => {
    setInitialising(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { navigation.goBack(); return; }
      setUser(currentUser);

      // Load prize amounts
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
        const prize     = isTie
          ? Math.round((fullPrize / goalList.tie_winner_ids.length) * 100) / 100
          : fullPrize;
        setPlatformFee(fee);
        setPrizeAmount(prize);

        if (goalList.payout_status === 'completed') {
          setStep('done');
          return;
        }
      } else {
        const total = parseFloat(totalAmount) || 0;
        const fee   = Math.round(total * PLATFORM_FEE_PERCENT * 100) / 100;
        setPlatformFee(fee);
        setPrizeAmount(Math.round((total - fee) * 100) / 100);
      }

      // Check if the user's Stripe account is ready for payouts
      const status = await callProcessPayout({
        action:       'check_status',
        user_id:      currentUser.id,
        goal_list_id: goalListId,
      });

      if (status.onboarding_completed && status.payouts_enabled) {
        setStep('claim');
      } else {
        setStep('connect');
      }
    } catch (err) {
      console.error('PayoutScreen initialise error:', err);
      setStep('connect');
    } finally {
      setInitialising(false);
    }
  };

  // ── Step 1: Open Stripe-hosted onboarding ─────────────────────────────────
  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      const data = await callProcessPayout({
        action:       'create_account',
        user_id:      user.id,
        goal_list_id: goalListId,
        // Stripe will show this URL after onboarding completes;
        // AppState detection handles the return regardless.
        return_url: 'https://bttrtogetheraccount.app/payout-return',
      });

      if (data.already_completed) {
        setStep('claim');
        return;
      }

      if (data.onboarding_url) {
        waitingForStripe.current = true;
        await Linking.openURL(data.onboarding_url);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start Stripe setup. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Transfer prize pool ───────────────────────────────────────────
  const handleClaimWinnings = async () => {
    Alert.alert(
      'Confirm Claim',
      `Transfer $${prizeAmount.toFixed(2)} to your linked bank account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              const data = await callProcessPayout({
                action:       'transfer',
                user_id:      user.id,
                goal_list_id: goalListId,
              });
              setStep('done');
              Alert.alert(
                '🎉 Payout Initiated!',
                `$${Number(data.amount ?? prizeAmount).toFixed(2)} is on its way to your bank. Stripe typically pays out within 2 business days.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not process payout. Try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ─── Prize breakdown card ──────────────────────────────────────────────────
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
  if (initialising) {
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Claim Winnings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

        {/* Trophy Banner */}
        <View style={styles.winnerBanner}>
          <Ionicons name="trophy" size={52} color="#FFD700" />
          <Text style={styles.winnerText}>Congratulations!</Text>
          <Text style={styles.winnerSubtext}>{goalListName}</Text>
        </View>

        {/* Prize Breakdown */}
        {renderPrizeBreakdown()}

        {/* ── DONE ── */}
        {step === 'done' && (
          <View style={styles.doneCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.doneTitle}>Payout Processing</Text>
            <Text style={styles.doneSubtext}>
              Your winnings are on the way. Stripe typically deposits within 2 business days.
            </Text>
          </View>
        )}

        {/* ── STEP 1: Connect Stripe ── */}
        {step === 'connect' && (
          <View style={styles.stepCard}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>Step 1 of 2</Text>
            </View>
            <Text style={styles.stepTitle}>Set up your payout</Text>
            <Text style={styles.stepSubtext}>
              Connect your bank account securely through Stripe. Stripe handles all identity
              verification — you just follow their quick setup steps.
            </Text>

            <View style={styles.stripeFeatureList}>
              <View style={styles.stripeFeatureRow}>
                <Ionicons name="shield-checkmark" size={18} color="#4CAF50" />
                <Text style={styles.stripeFeatureText}>Stripe handles ID verification</Text>
              </View>
              <View style={styles.stripeFeatureRow}>
                <Ionicons name="lock-closed" size={18} color="#4CAF50" />
                <Text style={styles.stripeFeatureText}>Bank details stored securely by Stripe</Text>
              </View>
              <View style={styles.stripeFeatureRow}>
                <Ionicons name="card" size={18} color="#4CAF50" />
                <Text style={styles.stripeFeatureText}>Connect any bank account or debit card</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleConnectStripe}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <>
                    <Ionicons name="logo-google" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Set Up Payouts with Stripe</Text>
                  </>
              }
            </TouchableOpacity>

            <Text style={styles.stepNote}>
              After completing setup in Stripe, return here to claim your winnings.
            </Text>

            {/* Manual re-check in case AppState detection misses it */}
            <TouchableOpacity style={styles.recheckButton} onPress={initialise} disabled={loading}>
              <Ionicons name="refresh" size={16} color="#888888" />
              <Text style={styles.recheckText}>I finished Stripe setup — check again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Claim ── */}
        {step === 'claim' && (
          <View style={styles.stepCard}>
            <View style={[styles.stepBadge, styles.stepBadgeGreen]}>
              <Text style={styles.stepBadgeText}>Step 2 of 2</Text>
            </View>
            <Text style={styles.stepTitle}>Ready to receive your winnings</Text>
            <Text style={styles.stepSubtext}>
              Your Stripe account is connected. Tap Claim and we'll transfer the prize to
              your linked bank account.
            </Text>

            <View style={styles.stripeFeatureRow}>
              <Ionicons name="time-outline" size={18} color="#888888" />
              <Text style={[styles.stripeFeatureText, { color: '#888888' }]}>
                Stripe pays out within 2 business days after transfer.
              </Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Footer CTA */}
      {(step === 'claim' || step === 'connect') && (
        <View style={styles.footer}>
          {step === 'connect' ? (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleConnectStripe}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <>
                    <Ionicons name="card-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Set Up Payouts with Stripe</Text>
                  </>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleClaimWinnings}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <>
                    <Ionicons name="cash-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Claim ${prizeAmount.toFixed(2)}</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 14, color: '#888888' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  backButton: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff' },

  content: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 40, gap: 20 },

  winnerBanner: { alignItems: 'center', paddingVertical: 24 },
  winnerText: { fontSize: 28, fontWeight: '900', color: '#ffffff', marginTop: 14 },
  winnerSubtext: { fontSize: 15, color: '#888888', marginTop: 6, textAlign: 'center' },

  breakdownCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 14,
  },
  breakdownTitle: { fontSize: 14, fontWeight: '600', color: '#888888', textTransform: 'uppercase', letterSpacing: 0.8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { fontSize: 15, color: '#cccccc' },
  breakdownSubLabel: { fontSize: 11, color: '#666666', marginTop: 2 },
  breakdownValue: { fontSize: 15, color: '#cccccc', fontWeight: '600' },
  breakdownValueFee: { fontSize: 15, color: '#ff6b6b', fontWeight: '600' },
  breakdownDivider: { height: 1, backgroundColor: '#2a2a2a' },
  breakdownLabelBig: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  breakdownValueBig: { fontSize: 28, fontWeight: '900', color: '#4CAF50' },

  stepCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 14,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepBadgeGreen: { backgroundColor: '#1a2a1a' },
  stepBadgeText: { fontSize: 11, color: '#888888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  stepSubtext: { fontSize: 14, color: '#888888', lineHeight: 20 },
  stepNote: { fontSize: 12, color: '#666666', lineHeight: 18, textAlign: 'center' },

  stripeFeatureList: { gap: 10 },
  stripeFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stripeFeatureText: { fontSize: 14, color: '#cccccc', flex: 1 },

  recheckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  recheckText: { fontSize: 13, color: '#888888' },

  doneCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a4a2a',
    gap: 12,
  },
  doneTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  doneSubtext: { fontSize: 14, color: '#888888', textAlign: 'center', lineHeight: 20 },

  footer: {
    padding: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
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
  primaryButtonDisabled: { backgroundColor: '#2a2a2a', opacity: 0.5 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
});
