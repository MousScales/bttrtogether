/**
 * PayoutMethodsScreen — Rapyd bank account for payouts
 *
 * States:
 *   not_set_up  → show "Add bank account" form (Rapyd)
 *   ready       → show "Bank account connected" + Rapyd branding
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
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null); // { has_account, onboarding_completed, payouts_enabled, rapyd_beneficiary_id? }
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');

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

  const handleAddBankAccount = async () => {
    const fname = (firstName || '').trim();
    const lname = (lastName || '').trim();
    const acct = (accountNumber || '').trim();
    const routing = (routingNumber || '').trim().replace(/\D/g, '');
    if (!fname || !lname || !acct || !routing) {
      Alert.alert('Missing fields', 'Please enter first name, last name, account number, and routing number.');
      return;
    }
    setLoading(true);
    try {
      await callProcessPayout({
        action:         'create_beneficiary',
        user_id:        user.id,
        first_name:     fname,
        last_name:      lname,
        account_number: acct,
        routing_number: routing,
        address:        (address || 'N/A').trim() || 'N/A',
        city:           (city || 'N/A').trim() || 'N/A',
        state:          (state || 'N/A').trim() || 'N/A',
        postcode:       (postcode || '00000').trim() || '00000',
      });
      await loadStatus();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add bank account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isReady = status?.payouts_enabled;
  const isNew   = status && !status.has_account;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payout methods</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

        <View style={styles.heroRow}>
          <Ionicons name="card-outline" size={32} color="#4CAF50" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>How payouts work</Text>
            <Text style={styles.heroSubtext}>
              Add your US bank account. When you win a challenge, your prize is sent to your account via Rapyd — usually within 1–3 business days.
            </Text>
          </View>
        </View>

        {status === null && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Checking your payout status…</Text>
          </View>
        )}

        {isNew && (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, styles.dotGrey]} />
              <Text style={styles.statusLabel}>No payout method connected</Text>
            </View>
            <Text style={styles.cardBody}>
              Add your US bank account below. Payouts are sent via Rapyd.
            </Text>
            <Text style={styles.inputLabel}>First name *</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#666666" autoCapitalize="words" />
            <Text style={styles.inputLabel}>Last name *</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#666666" autoCapitalize="words" />
            <Text style={styles.inputLabel}>Account number *</Text>
            <TextInput style={styles.input} value={accountNumber} onChangeText={setAccountNumber} placeholder="Bank account number" placeholderTextColor="#666666" keyboardType="number-pad" />
            <Text style={styles.inputLabel}>Routing number *</Text>
            <TextInput style={styles.input} value={routingNumber} onChangeText={setRoutingNumber} placeholder="9-digit routing" placeholderTextColor="#666666" keyboardType="number-pad" />
            <Text style={styles.inputLabel}>Address (optional)</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street address" placeholderTextColor="#666666" />
            <Text style={styles.inputLabel}>City / State / ZIP</Text>
            <View style={styles.row3}>
              <TextInput style={[styles.input, styles.inputThird]} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#666666" />
              <TextInput style={[styles.input, styles.inputThird]} value={state} onChangeText={setState} placeholder="State" placeholderTextColor="#666666" />
              <TextInput style={[styles.input, styles.inputThird]} value={postcode} onChangeText={setPostcode} placeholder="ZIP" placeholderTextColor="#666666" keyboardType="number-pad" />
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleAddBankAccount}
              disabled={loading}
            >
              {loading ? <ActivityIndicator size="small" color="#ffffff" /> : (
                <>
                  <Ionicons name="card-outline" size={20} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Add bank account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isReady && (
          <View style={[styles.card, styles.cardGreen]}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, styles.dotGreen]} />
              <Text style={[styles.statusLabel, { color: '#4CAF50' }]}>Bank account connected ✓</Text>
            </View>
            <Text style={styles.cardBody}>
              When you win a challenge, your prize is sent to your bank account via Rapyd — usually within 1–3 business days.
            </Text>
            <TouchableOpacity style={styles.recheckButton} onPress={loadStatus} disabled={loading}>
              <Ionicons name="refresh-outline" size={16} color="#888888" />
              <Text style={styles.recheckText}>Refresh status</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.poweredBy}>Payouts powered by Rapyd</Text>
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
  inputLabel:   { fontSize: 12, color: '#888888', marginBottom: 4, marginTop: 8 },
  input:        { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#ffffff' },
  row3:         { flexDirection: 'row', gap: 8 },
  inputThird:   { flex: 1 },

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
