import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSupabaseFunctionsUrl, getSupabaseAnonKey } from '../lib/config';

const FUNC_TIMEOUT_MS = 25000;

const fetchWithTimeout = (url, options, ms = FUNC_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
};

const callRapydCheckout = async (payload) => {
  const baseUrl = getSupabaseFunctionsUrl();
  const headers = {
    'Content-Type': 'application/json',
    apikey: getSupabaseAnonKey(),
    Authorization: `Bearer ${getSupabaseAnonKey()}`,
  };
  const body = JSON.stringify(payload);
  const urls = [`${baseUrl}/process-payout`, `${baseUrl}/super-handler`];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { method: 'POST', headers, body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
      return data;
    } catch (e) {
      lastError = e.name === 'AbortError' ? new Error('Request timed out. Check your connection and try again.') : e;
    }
  }
  throw lastError || new Error('Could not reach server');
};

const superHandler = async (payload) => {
  const baseUrl = getSupabaseFunctionsUrl();
  const response = await fetchWithTimeout(
    `${baseUrl}/super-handler`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getSupabaseAnonKey(),
        Authorization: `Bearer ${getSupabaseAnonKey()}`,
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
};

export default function GroupGoalPaymentScreen({ navigation, route }) {
  const { goalListId, amount, goalListName } = route.params;
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState(null);
  const payingWithRapyd = useRef(false);

  useEffect(() => {
    createRapydCheckout();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (payingWithRapyd.current && nextState === 'active') {
        payingWithRapyd.current = false;
        checkRapydPaymentSuccess();
      }
    });
    return () => sub?.remove();
  }, [goalListId]);

  const createRapydCheckout = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please log in to make a payment');
        navigation.goBack();
        return;
      }

      const data = await callRapydCheckout({
        action: 'create_rapyd_checkout',
        goal_list_id: goalListId,
        amount: parseFloat(amount),
        user_id: user.id,
      });

      if (data.error || !data.redirect_url) {
        throw new Error(data.error || 'Failed to create payment');
      }

      setRedirectUrl(data.redirect_url);
      setReady(true);
    } catch (error) {
      console.error('Error creating Rapyd checkout:', error);
      Alert.alert('Error', error.message || 'Failed to prepare payment');
    } finally {
      setLoading(false);
    }
  };

  const checkRapydPaymentSuccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoading(true);
    try {
      const data = await superHandler({
        action: 'confirm_rapyd_payment',
        goal_list_id: goalListId,
        user_id: user.id,
      });
      if (data.success) {
        Alert.alert('Success', "Payment successful! You've joined the challenge.", [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      console.warn('Confirm Rapyd payment check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePayWithRapyd = async () => {
    if (!redirectUrl) {
      Alert.alert('Error', 'Payment not ready. Please wait or try again.');
      return;
    }
    payingWithRapyd.current = true;
    try {
      const canOpen = await Linking.canOpenURL(redirectUrl);
      if (canOpen) {
        await Linking.openURL(redirectUrl);
      } else {
        Alert.alert('Error', 'Could not open payment page. Please try again.');
        payingWithRapyd.current = false;
      }
    } catch (e) {
      console.error('Open Rapyd URL failed:', e);
      Alert.alert('Error', 'Could not open payment page.');
      payingWithRapyd.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join Challenge</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.challengeInfo}>
          <Text style={styles.challengeName}>{goalListName}</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Bet Amount</Text>
            <Text style={styles.amount}>${parseFloat(amount).toFixed(2)}</Text>
          </View>
        </View>

        {loading && !ready && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Preparing payment...</Text>
          </View>
        )}

        {ready && (
          <>
            <Text style={styles.sectionTitle}>Pay with Rapyd</Text>
            <Text style={styles.rapydDescription}>
              You'll be taken to a secure Rapyd checkout page to pay with card, e-wallet, or other methods. After payment, return to the app.
            </Text>
            <TouchableOpacity
              style={[styles.payButton, loading && styles.payButtonDisabled]}
              onPress={handlePayWithRapyd}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.payButtonText}>Pay ${parseFloat(amount).toFixed(2)}</Text>
                  <Ionicons name="lock-closed" size={20} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.recheckButton}
              onPress={checkRapydPaymentSuccess}
              disabled={loading}
            >
              <Text style={styles.recheckText}>I already paid — check again</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              Payments are secure and powered by Rapyd
            </Text>
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: Platform.OS === 'android' ? 40 : 20,
  },
  challengeInfo: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  challengeName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  amountContainer: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  amount: {
    fontSize: 36,
    fontWeight: '900',
    color: '#4CAF50',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  rapydDescription: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 24,
    lineHeight: 20,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  payButtonDisabled: {
    backgroundColor: '#2a2a2a',
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  recheckButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  recheckText: {
    fontSize: 14,
    color: '#4CAF50',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888888',
  },
  infoSection: {
    marginTop: 24,
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#888888',
    lineHeight: 20,
  },
});
