/**
 * PayoutMethodsScreen
 *
 * Settings → Payout methods: list saved banks and cards (up to 2 each),
 * add bank, add debit card. Used for choosing payout destination at claim time.
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

async function callSuperHandler(payload) {
  const baseUrl = getSupabaseFunctionsUrl();
  if (!baseUrl || !baseUrl.startsWith('http')) {
    throw new Error('Invalid Supabase URL');
  }
  const response = await fetch(`${baseUrl}/super-handler`, {
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

export default function PayoutMethodsScreen({ navigation }) {
  const { createToken, createPaymentMethod } = useStripe();
  const [loading, setLoading] = useState(false);
  const [methods, setMethods] = useState({ banks: [], cards: [] });
  const [refreshing, setRefreshing] = useState(true);
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [accountHolderName, setAccountHolderName] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [cardComplete, setCardComplete] = useState(false);

  const loadMethods = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setRefreshing(true);
    try {
      const data = await callProcessPayout({
        action: 'list_payout_methods',
        user_id: user.id,
      });
      setMethods({ banks: data.banks || [], cards: data.cards || [] });
    } catch (err) {
      setMethods({ banks: [], cards: [] });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMethods();
    }, [loadMethods])
  );

  const canAddBank = methods.banks.length < 2;
  const canAddCard = methods.cards.length < 2;

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoading(true);
    try {
      await callProcessPayout({
        action: 'add_bank',
        user_id: user.id,
        account_holder_name: name,
        routing_number: routing,
        account_number: account,
      });
      Alert.alert('Bank added', 'This account can be used for payouts (typically 2 business days).');
      setShowAddBank(false);
      setAccountHolderName('');
      setRoutingNumber('');
      setAccountNumber('');
      loadMethods();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoading(true);
    try {
      const [{ token }, { paymentMethod }] = await Promise.all([
        createToken({ type: 'Card', currency: 'usd' }),
        createPaymentMethod({ paymentMethodType: 'Card' }),
      ]);
      if (!token?.id) throw new Error('Could not create card token');
      await callProcessPayout({
        action: 'add_card',
        user_id: user.id,
        card_token: token.id,
      });
      if (paymentMethod?.id) {
        try {
          await callSuperHandler({
            action: 'attach_payment_method',
            user_id: user.id,
            payment_method_id: paymentMethod.id,
          });
        } catch (e) {
          console.warn('Attach payment method for in-app payments failed:', e);
        }
      }
      Alert.alert('Card added', 'Use this card for instant payouts and when paying for challenges.');
      setShowAddCard(false);
      setCardComplete(false);
      loadMethods();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payout methods</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          refreshControl={null}
        >
          <Text style={styles.subtitle}>
            Add up to 2 bank accounts and 2 debit cards. Use them when you claim winnings and when paying for challenges. Cards support instant payouts.
          </Text>

          {refreshing ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </View>
          ) : (
            <>
              {/* Banks */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bank accounts</Text>
                {methods.banks.length === 0 && !showAddBank && (
                  <Text style={styles.emptyText}>No bank accounts added</Text>
                )}
                {methods.banks.map((b) => (
                  <View key={b.id} style={styles.methodRow}>
                    <Ionicons name="business-outline" size={22} color="#888888" />
                    <Text style={styles.methodLabel}>•••• {b.last4}</Text>
                    {b.default_for_currency && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                ))}
                {showAddBank && (
                  <View style={styles.addForm}>
                    <TextInput
                      style={styles.input}
                      value={accountHolderName}
                      onChangeText={setAccountHolderName}
                      placeholder="Name on account"
                      placeholderTextColor="#666666"
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.input}
                      value={routingNumber}
                      onChangeText={(t) => setRoutingNumber(t.replace(/\D/g, '').slice(0, 9))}
                      placeholder="Routing number (9 digits)"
                      placeholderTextColor="#666666"
                      keyboardType="number-pad"
                    />
                    <TextInput
                      style={styles.input}
                      value={accountNumber}
                      onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 17))}
                      placeholder="Account number"
                      placeholderTextColor="#666666"
                      keyboardType="number-pad"
                    />
                    <View style={styles.addFormButtons}>
                      <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddBank(false)}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                        onPress={handleAddBank}
                        disabled={loading}
                      >
                        {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Add bank</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {!showAddBank && canAddBank && (
                  <TouchableOpacity style={styles.addLink} onPress={() => setShowAddBank(true)}>
                    <Ionicons name="add-circle-outline" size={20} color="#4CAF50" />
                    <Text style={styles.addLinkText}>Add bank account</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Cards */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Debit cards (instant payouts)</Text>
                {methods.cards.length === 0 && !showAddCard && (
                  <Text style={styles.emptyText}>No debit cards added</Text>
                )}
                {methods.cards.map((c) => (
                  <View key={c.id} style={styles.methodRow}>
                    <Ionicons name="card-outline" size={22} color="#888888" />
                    <Text style={styles.methodLabel}>{c.brand} •••• {c.last4}</Text>
                    {c.default_for_currency && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                ))}
                {showAddCard && (
                  <View style={styles.addForm}>
                    <View style={styles.cardFieldWrap}>
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
                    </View>
                    <View style={styles.addFormButtons}>
                      <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddCard(false)}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryButton, (loading || !cardComplete) && styles.primaryButtonDisabled]}
                        onPress={handleAddCard}
                        disabled={loading || !cardComplete}
                      >
                        {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Add card</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {!showAddCard && canAddCard && (
                  <TouchableOpacity style={styles.addLink} onPress={() => setShowAddCard(true)}>
                    <Ionicons name="add-circle-outline" size={20} color="#4CAF50" />
                    <Text style={styles.addLinkText}>Add debit card</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  centered: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 8,
    gap: 10,
  },
  methodLabel: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
  },
  defaultBadge: {
    backgroundColor: '#1a2a1a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  defaultBadgeText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  addForm: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 12,
  },
  cardFieldWrap: {
    marginBottom: 12,
  },
  cardField: {
    width: '100%',
    height: 50,
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#888888',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  addLinkText: {
    fontSize: 15,
    color: '#4CAF50',
    fontWeight: '500',
  },
});
