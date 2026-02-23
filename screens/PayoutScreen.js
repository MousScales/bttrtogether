/**
 * PayoutScreen
 *
 * Two-step winner payout flow:
 *   Step 1 — "Connect Your Bank"
 *     • Calls the `process-payout` Supabase function (action: "create_account")
 *     • Opens Stripe Express onboarding URL in the device browser
 *     • Winner adds their bank account on Stripe's hosted page
 *
 *   Step 2 — "Claim Winnings"
 *     • Calls `process-payout` (action: "check_status") to verify onboarding
 *     • If complete, calls (action: "transfer") to send prize pool to their account
 *     • Stripe then pays out to their bank (usually 2 business days)
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

// ─── Supabase project config ────────────────────────────────────────────────
const SUPABASE_URL      = 'https://xwkgmewbzohylnjirxaw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3a2dtZXdiem9oeWxuamlyeGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTMzMDQsImV4cCI6MjA4NjMyOTMwNH0.hq4yiRGeCaJThwbFtULhUete6mZHnOkSLKzMHCpJvL4';

const PLATFORM_FEE_PERCENT = 0.10; // 10 %

// ─── Helper: call the process-payout edge function ──────────────────────────
async function callProcessPayout(payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-payout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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

  const [user, setUser]                         = useState(null);
  const [loading, setLoading]                   = useState(false);
  const [checkingStatus, setCheckingStatus]     = useState(true);
  const [step, setStep]                         = useState('loading'); // 'loading' | 'connect_bank' | 'claim' | 'done'
  const [prizeAmount, setPrizeAmount]           = useState(0);
  const [platformFee, setPlatformFee]           = useState(0);

  // Fetch user + check existing Connect status when screen loads or regains focus
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

      // Fetch goal list prize amounts
      const { data: goalList } = await supabase
        .from('goal_lists')
        .select('prize_pool_amount, platform_fee_amount, total_pot, payout_status')
        .eq('id', goalListId)
        .single();

      if (goalList) {
        const total     = goalList.total_pot || parseFloat(totalAmount) || 0;
        const fee       = goalList.platform_fee_amount || Math.round(total * PLATFORM_FEE_PERCENT * 100) / 100;
        const prize     = goalList.prize_pool_amount   || Math.round((total - fee) * 100) / 100;
        setPlatformFee(fee);
        setPrizeAmount(prize);

        if (goalList.payout_status === 'completed' || goalList.payout_status === 'processing') {
          setStep('done');
          setCheckingStatus(false);
          return;
        }
      } else {
        // Fallback calculation from the route param
        const total = parseFloat(totalAmount) || 0;
        const fee   = Math.round(total * PLATFORM_FEE_PERCENT * 100) / 100;
        setPlatformFee(fee);
        setPrizeAmount(Math.round((total - fee) * 100) / 100);
      }

      // Check Stripe Connect status for this user
      const statusData = await callProcessPayout({
        action:       'check_status',
        user_id:      currentUser.id,
        goal_list_id: goalListId,
      });

      if (statusData.onboarding_completed) {
        setStep('claim');
      } else {
        setStep('connect_bank');
      }
    } catch (err) {
      // If function call fails (e.g. user not winner), still show connect_bank
      setStep('connect_bank');
    } finally {
      setCheckingStatus(false);
    }
  };

  // ── Step 1: Open Stripe Connect Express onboarding ──────────────────────
  const handleConnectBank = async () => {
    setLoading(true);
    try {
      const data = await callProcessPayout({
        action:       'create_account',
        user_id:      user.id,
        goal_list_id: goalListId,
        return_url:   'bttrtogetherapp://payout',
      });

      if (data.already_connected) {
        // Already onboarded — move straight to claim
        setStep('claim');
        return;
      }

      if (data.onboarding_url) {
        await Linking.openURL(data.onboarding_url);
        // The user will return to the app after onboarding.
        // When the screen regains focus, useFocusEffect re-checks status.
        Alert.alert(
          'Bank Connected!',
          'After finishing setup in your browser, come back here and tap "Check Status" to verify your bank was connected.',
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start bank onboarding');
    } finally {
      setLoading(false);
    }
  };

  // ── Check status after returning from browser ────────────────────────────
  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const data = await callProcessPayout({
        action:       'check_status',
        user_id:      user.id,
        goal_list_id: goalListId,
      });

      if (data.onboarding_completed) {
        setStep('claim');
        Alert.alert('Bank Connected!', 'Your bank account is verified. Tap "Claim Winnings" to receive your prize.');
      } else {
        Alert.alert(
          'Not Yet Verified',
          'Stripe hasn\'t finished verifying your bank account. Please complete all steps in the browser and try again.',
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not check account status');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Transfer prize pool to connected account ────────────────────
  const handleClaimWinnings = async () => {
    Alert.alert(
      'Confirm Claim',
      `Transfer $${prizeAmount.toFixed(2)} to your connected bank account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              await callProcessPayout({
                action:       'transfer',
                user_id:      user.id,
                goal_list_id: goalListId,
              });
              setStep('done');
              Alert.alert(
                '🎉 Payout Initiated!',
                `$${prizeAmount.toFixed(2)} is on its way to your bank account. This usually arrives within 2 business days.`,
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

        {/* ── STEP 1: Connect Bank ── */}
        {step === 'connect_bank' && (
          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 1 of 2</Text>
              </View>
              <Text style={styles.stepTitle}>Connect Your Bank</Text>
              <Text style={styles.stepSubtext}>
                Link your bank account via Stripe so we can send your winnings securely. Takes about 2 minutes.
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#4CAF50" />
              <Text style={styles.infoText}>Bank-level security powered by Stripe</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color="#888888" />
              <Text style={styles.infoText}>Funds arrive within 2 business days</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#888888" />
              <Text style={styles.infoText}>Your banking details are never stored in our app</Text>
            </View>
          </View>
        )}

        {/* ── STEP 2: Claim ── */}
        {step === 'claim' && (
          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, styles.stepBadgeGreen]}>
                <Text style={styles.stepBadgeText}>Step 2 of 2</Text>
              </View>
              <Text style={styles.stepTitle}>Bank Account Connected</Text>
              <Text style={styles.stepSubtext}>
                Your bank account is verified. Tap below to transfer your winnings.
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
              <Text style={[styles.infoText, { color: '#4CAF50' }]}>Bank account verified</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="flash-outline" size={18} color="#888888" />
              <Text style={styles.infoText}>Transfer happens instantly — bank arrival in ~2 days</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      {step === 'connect_bank' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleConnectBank}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <>
                  <Ionicons name="link-outline" size={20} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Connect Bank Account</Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCheckStatus}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>I've already connected → Check Status</Text>
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
                  <Text style={styles.primaryButtonText}>Claim ${prizeAmount.toFixed(2)}</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
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
