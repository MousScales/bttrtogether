/**
 * PayoutMethodsScreen — Stripe Connect Express
 *
 * Stripe handles EVERYTHING: bank account, debit card, KYC, identity.
 * We never touch raw account numbers or card tokens.
 *
 * States:
 *   not_set_up  → show "Set Up Payouts" button → Stripe Express onboarding
 *   pending     → onboarding started but not complete → "Continue Setup"
 *   ready       → payouts enabled → show connected info + "Manage in Stripe"
 */

import React, { useState, useCallback, useRef } from 'react';
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

// ─── Edge-function helper ──────────────────────────────────────────────────
async function callProcessPayout(payload) {
  const baseUrl = getSupabaseFunctionsUrl();
  if (!baseUrl || !baseUrl.startsWith('http')) {
    throw new Error('Invalid Supabase URL. Check EXPO_PUBLIC_SUPABASE_URL in .env');
  }
  const response = await fetch(`${baseUrl}/process-payout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function PayoutMethodsScreen({ navigation }) {
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState(null); // null = loading
  // status shape: { has_account, onboarding_completed, payouts_enabled,
  //                 charges_enabled, stripe_account_id }

  const appStateRef       = useRef(AppState.currentState);
  const waitingForStripe  = useRef(false);

  // Re-check when user returns from Stripe browser
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active' && waitingForStripe.current) {
        waitingForStripe.current = false;
        loadStatus();
      }
      appStateRef.current = nextState;
    });
    return () => sub?.remove();
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      setUser(currentUser);

      const data = await callProcessPayout({
        action:  'check_status',
        user_id: currentUser.id,
      });
      setStatus(data);
    } catch {
      setStatus({ has_account: false });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setStatus(null);
      loadStatus();
    }, [loadStatus])
  );

  // Open Stripe-hosted onboarding (collects bank, card, ID — everything)
  const handleSetup = async () => {
    setLoading(true);
    try {
      const data = await callProcessPayout({
        action:     'create_account',
        user_id:    user.id,
        return_url: 'https://bttrtogetheraccount.app/payout-return',
      });

      if (data.already_completed) {
        await loadStatus();
        return;
      }

      if (data.onboarding_url) {
        waitingForStripe.current = true;
        await Linking.openURL(data.onboarding_url);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start Stripe setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Open Stripe Express dashboard so the user can manage bank/card details
  const handleManage = async () => {
    setLoading(true);
    try {
      const data = await callProcessPayout({
        action:  'create_login_link',
        user_id: user.id,
      });
      if (data.url) {
        await Linking.openURL(data.url);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open Stripe dashboard.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const isReady   = status?.payouts_enabled;
  const isPending = status?.has_account && !isReady;
  const isNew     = status && !status.has_account;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payout methods</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

        {/* Hero */}
        <View style={styles.heroRow}>
          <Ionicons name="card-outline" size={32} color="#4CAF50" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>How payouts work</Text>
            <Text style={styles.heroSubtext}>
              Connect your bank account or debit card through Stripe. When you win a challenge, your prize is transferred automatically — usually within 2 business days.
            </Text>
          </View>
        </View>

        {/* Loading */}
        {status === null && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Checking your payout status…</Text>
          </View>
        )}

        {/* ── NOT SET UP ── */}
        {isNew && (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, styles.dotGrey]} />
              <Text style={styles.statusLabel}>No payout method connected</Text>
            </View>

            <Text style={styles.cardBody}>
              Stripe will guide you through adding your bank account or debit card.
              They also handle identity verification — you'll only need to do this once.
            </Text>

            <View style={styles.featureList}>
              {[
                { icon: 'shield-checkmark-outline', text: 'Identity verification handled by Stripe' },
                { icon: 'lock-closed-outline',       text: 'Your bank details are never stored by us' },
                { icon: 'card-outline',              text: 'Connect a bank account or debit card' },
                { icon: 'flash-outline',             text: 'Instant payouts available with debit cards' },
              ].map(({ icon, text }) => (
                <View key={text} style={styles.featureRow}>
                  <Ionicons name={icon} size={18} color="#4CAF50" />
                  <Text style={styles.featureText}>{text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleSetup}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <>
                    <Ionicons name="arrow-forward-circle-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Set Up Payouts with Stripe</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── PENDING (started but not complete) ── */}
        {isPending && (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, styles.dotYellow]} />
              <Text style={styles.statusLabel}>Setup in progress</Text>
            </View>

            <Text style={styles.cardBody}>
              Your Stripe account was created but setup isn't complete yet.
              Tap the button below to finish — it only takes a couple of minutes.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleSetup}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <>
                    <Ionicons name="arrow-forward-circle-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Continue Stripe Setup</Text>
                  </>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.recheckButton} onPress={loadStatus} disabled={loading}>
              <Ionicons name="refresh-outline" size={16} color="#888888" />
              <Text style={styles.recheckText}>I finished — check again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── READY ── */}
        {isReady && (
          <>
            <View style={[styles.card, styles.cardGreen]}>
              <View style={styles.statusRow}>
                <View style={[styles.dot, styles.dotGreen]} />
                <Text style={[styles.statusLabel, { color: '#4CAF50' }]}>Payouts enabled ✓</Text>
              </View>
              <Text style={styles.cardBody}>
                Your bank account is connected. When you win a challenge, your prize
                will be transferred to your Stripe account and deposited to your bank
                automatically.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Manage your account</Text>
              <Text style={styles.cardBody}>
                Add or change your bank account or debit card, update your payout schedule,
                and view your balance — all inside your secure Stripe dashboard.
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleManage}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <>
                      <Ionicons name="open-outline" size={20} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>Manage in Stripe</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity style={styles.recheckButton} onPress={loadStatus} disabled={loading}>
                <Ionicons name="refresh-outline" size={16} color="#888888" />
                <Text style={styles.recheckText}>Refresh status</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Stripe branding note */}
        <Text style={styles.poweredBy}>Payouts powered by Stripe</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff' },

  content: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 48, gap: 16 },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#0d1a0d',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a3a1a',
  },
  heroTitle:   { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  heroSubtext: { fontSize: 13, color: '#888888', lineHeight: 18 },

  centered: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: '#888888' },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 14,
  },
  cardGreen: { borderColor: '#2a4a2a', backgroundColor: '#0d1a0d' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:        { width: 10, height: 10, borderRadius: 5 },
  dotGrey:    { backgroundColor: '#555555' },
  dotYellow:  { backgroundColor: '#f5a623' },
  dotGreen:   { backgroundColor: '#4CAF50' },
  statusLabel: { fontSize: 14, fontWeight: '600', color: '#ffffff' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  cardBody:     { fontSize: 14, color: '#888888', lineHeight: 20 },

  featureList: { gap: 10 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, color: '#cccccc', flex: 1 },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },

  recheckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  recheckText: { fontSize: 13, color: '#888888' },

  poweredBy: {
    fontSize: 12,
    color: '#444444',
    textAlign: 'center',
    marginTop: 8,
  },
});
