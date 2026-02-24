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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStripe, CardField } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSupabaseFunctionsUrl, getSupabaseAnonKey, getStripePublishableKey } from '../lib/config';

const superHandler = async (payload) => {
  const baseUrl = getSupabaseFunctionsUrl();
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
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
};

export default function GroupGoalPaymentScreen({ navigation, route }) {
  const { goalListId, amount, goalListName } = route.params;
  const { confirmPayment, confirmPlatformPayPayment, isPlatformPaySupported } = useStripe();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState([]);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null); // 'saved_0', 'apple', 'cashapp', 'card'
  const [cardComplete, setCardComplete] = useState(false);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const applePayInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof isPlatformPaySupported === 'function') {
          const supported = await isPlatformPaySupported({ applePay: true });
          if (!cancelled) setApplePaySupported(!!supported);
        }
      } catch (_) {
        if (!cancelled) setApplePaySupported(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isPlatformPaySupported]);

  useEffect(() => {
    createPaymentIntent();
  }, []);

  const createPaymentIntent = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please log in to make a payment');
        navigation.goBack();
        return;
      }

      let customerId = null;
      try {
        const listData = await superHandler({ action: 'list_payment_methods', user_id: user.id });
        setSavedPaymentMethods(listData.payment_methods || []);
        setStripeCustomerId(listData.stripe_customer_id || null);
        customerId = listData.stripe_customer_id;
      } catch (e) {
        console.warn('List payment methods failed:', e);
      }

      const data = await superHandler({
        goal_list_id: goalListId,
        amount: parseFloat(amount),
        user_id: user.id,
        stripe_customer_id: customerId || undefined,
      });

      if (data.error || !data.clientSecret) {
        throw new Error(data.error || 'Failed to create payment intent');
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
    } catch (error) {
      console.error('Error creating payment intent:', error);
      Alert.alert('Error', error.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  // Platform fee is 10%; winner receives the remaining 90%.
  const PLATFORM_FEE_PERCENT = 0.10;

  const processPaymentSuccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const paidAmount = parseFloat(amount);

    // Calculate the fee split for this participant's contribution
    const platformFeeContribution = Math.round(paidAmount * PLATFORM_FEE_PERCENT * 100) / 100;
    const prizePoolContribution   = Math.round((paidAmount - platformFeeContribution) * 100) / 100;

    // Save payment record with fee breakdown
    await supabase
      .from('payments')
      .insert({
        goal_list_id:              goalListId,
        user_id:                   user.id,
        amount:                    paidAmount,
        stripe_payment_intent_id:  paymentIntentId,
        status:                    'succeeded',
        prize_pool_contribution:   prizePoolContribution,
        platform_fee_contribution: platformFeeContribution,
      });

    // Update participant payment status
    await supabase
      .from('group_goal_participants')
      .update({ payment_status: 'paid' })
      .eq('goal_list_id', goalListId)
      .eq('user_id', user.id);

    // Update total pot and the two running sub-totals on the goal list
    const { data: goalListCheck } = await supabase
      .from('goal_lists')
      .select('user_id, total_pot, prize_pool_amount, platform_fee_amount')
      .eq('id', goalListId)
      .single();

    if (goalListCheck) {
      const newTotal          = (goalListCheck.total_pot          || 0) + paidAmount;
      const newPrizePool      = (goalListCheck.prize_pool_amount   || 0) + prizePoolContribution;
      const newPlatformFee    = (goalListCheck.platform_fee_amount || 0) + platformFeeContribution;

      await supabase
        .from('goal_lists')
        .update({
          total_pot:           newTotal,
          prize_pool_amount:   newPrizePool,
          platform_fee_amount: newPlatformFee,
        })
        .eq('id', goalListId);

      // Check if all participants have paid → set all_paid flag
      const { data: participants } = await supabase
        .from('group_goal_participants')
        .select('payment_status')
        .eq('goal_list_id', goalListId);

      const allPaid = participants?.every(p => p.payment_status === 'paid');
      if (allPaid) {
        await supabase
          .from('goal_lists')
          .update({ all_paid: true })
          .eq('id', goalListId);
      }
    }

    Alert.alert('Success', 'Payment successful! You\'ve joined the challenge.', [
      {
        text: 'OK',
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const showPaymentError = (title, message) => {
    const raw = message || 'Unknown error';
    const fromBackend = /Stripe is not configured|STRIPE_SECRET_KEY|not configured/i.test(raw);
    const isKeyMismatch = !fromBackend && /no such payment_intent|No such payment_intent/i.test(raw);
    let hint = '';
    if (fromBackend) {
      hint = '\n\nFix: Supabase → Edge Functions → Secrets → set STRIPE_SECRET_KEY to your live secret key (sk_live_...). Then run: npx supabase functions deploy super-handler';
    } else if (isKeyMismatch) {
      const pk = getStripePublishableKey() || '';
      const keyPreview = pk.length >= 12 ? pk.slice(0, 12) + '…' : (pk ? pk.slice(0, 8) + '…' : 'not set');
      hint = '\n\n1) Stripe Dashboard → Developers → API keys: use the two LIVE keys from the same account.\n2) .env: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...\n3) Supabase → Edge Functions → Secrets: STRIPE_SECRET_KEY=sk_live_...\n4) Fully quit the app, run: npx expo start --clear then open the app again.\n\nApp key: ' + keyPreview;
    }
    Alert.alert(title, raw + hint);
  };

  const handleSavedCardPayment = async (paymentMethodId) => {
    if (!clientSecret) {
      Alert.alert('Error', 'Payment not ready');
      return;
    }
    setLoading(true);
    try {
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
        paymentMethodId,
      });
      if (error) {
        if (error.code !== 'Canceled') showPaymentError('Payment Failed', error.message);
        setLoading(false);
        return;
      }
      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      } else {
        showPaymentError('Payment', paymentIntent?.status ? `Unexpected status: ${paymentIntent.status}` : 'Payment did not complete.');
      }
    } catch (error) {
      console.error('Error processing saved card payment:', error);
      showPaymentError('Error', error?.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handleCardPayment = async () => {
    if (!cardComplete) {
      Alert.alert('Error', 'Please enter a valid card');
      return;
    }

    if (!clientSecret) {
      Alert.alert('Error', 'Payment not ready');
      return;
    }

    setLoading(true);
    try {
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        if (error.code !== 'Canceled') {
          showPaymentError('Payment Failed', error.message);
        }
        setLoading(false);
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      } else {
        showPaymentError('Payment', paymentIntent?.status ? `Unexpected status: ${paymentIntent.status}` : 'Payment did not complete.');
      }
    } catch (error) {
      console.error('Error processing card payment:', error);
      showPaymentError('Error', error?.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handleApplePay = async () => {
    if (!clientSecret) {
      Alert.alert('Error', 'Payment not ready');
      return;
    }
    if (typeof confirmPlatformPayPayment !== 'function') {
      Alert.alert('Not Supported', 'Apple Pay is not available in this build. Use a card or Cash App.');
      return;
    }
    if (applePayInProgress.current) {
      return;
    }
    applePayInProgress.current = true;
    setSelectedMethod('apple');
    setLoading(true);
    console.log('[Apple Pay] Tapped, opening sheet...');
    try {
      // Match backend rounding: dollars for display, same as super-handler (amount * 100 → cents)
      const amountDollars = Math.round(parseFloat(amount) * 100) / 100;
      const amountStr = amountDollars.toFixed(2);
      const result = await confirmPlatformPayPayment(clientSecret, {
        applePay: {
          merchantCountryCode: 'US',
          currencyCode: 'USD',
          merchantCapabilities: ['supports3DS'],
          shippingMethods: [],
          cartItems: [
            {
              paymentType: 'Immediate',
              label: goalListName ? String(goalListName).slice(0, 64) : 'Bttr Together',
              amount: amountStr,
            },
          ],
        },
      });

      const { error, paymentIntent } = result || {};
      console.log('[Apple Pay] Result:', error ? { error: error.message } : { status: paymentIntent?.status });

      if (error) {
        if (error.code !== 'Canceled') {
          showPaymentError('Apple Pay Failed', error.message);
        } else {
          // User dismissed sheet; if they didn't, they may need to add a card in Wallet or check merchant setup
          console.log('[Apple Pay] User canceled or sheet dismissed');
        }
        setLoading(false);
        applePayInProgress.current = false;
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      } else {
        showPaymentError('Apple Pay', paymentIntent?.status ? `Unexpected status: ${paymentIntent.status}` : 'Payment did not complete.');
      }
    } catch (error) {
      console.error('[Apple Pay] Error:', error);
      const msg = error?.message || String(error) || 'Failed to process payment';
      showPaymentError('Apple Pay Failed', msg);
    } finally {
      setLoading(false);
      applePayInProgress.current = false;
    }
  };

  const handleCashApp = async () => {
    if (!clientSecret) {
      Alert.alert('Error', 'Payment not ready');
      return;
    }

    setLoading(true);
    console.log('[Cash App] Confirming payment...');
    try {
      // Cash App needs return_url for redirect; urlScheme in StripeProvider is bttrtogether so use bttrtogether://safepay
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'CashApp',
        returnURL: 'bttrtogether://safepay',
      });

      if (error) {
        if (error.code !== 'Canceled') {
          showPaymentError('Cash App Failed', error.message);
        }
        setLoading(false);
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      } else {
        showPaymentError('Cash App', paymentIntent?.status ? `Unexpected status: ${paymentIntent.status}` : 'Payment did not complete.');
      }
    } catch (error) {
      console.error('[Cash App] Error:', error);
      showPaymentError('Cash App Failed', error?.message || 'Failed to process payment');
    } finally {
      setLoading(false);
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

        {loading && !clientSecret && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Preparing payment...</Text>
          </View>
        )}

        {clientSecret && (
          <>
            <Text style={styles.sectionTitle}>Choose Payment Method</Text>

            {/* Saved cards (from Settings / Payout methods) */}
            {savedPaymentMethods.length > 0 && (
              <>
                <Text style={styles.savedCardsLabel}>Saved cards</Text>
                {savedPaymentMethods.map((pm, idx) => (
                  <TouchableOpacity
                    key={pm.id}
                    style={[
                      styles.paymentMethodButton,
                      selectedMethod === `saved_${idx}` && styles.paymentMethodButtonSelected,
                    ]}
                    onPress={() => setSelectedMethod(`saved_${idx}`)}
                  >
                    <View style={styles.paymentMethodContent}>
                      <Ionicons name="card" size={24} color="#ffffff" />
                      <Text style={styles.paymentMethodText}>{pm.brand} •••• {pm.last4}</Text>
                    </View>
                    {selectedMethod === `saved_${idx}` && (
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                    )}
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Apple Pay - Show on all iOS devices */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.paymentMethodButton}
                onPress={() => {
                  if (clientSecret) {
                    handleApplePay();
                  }
                }}
                disabled={!clientSecret || loading}
              >
                <View style={styles.paymentMethodContent}>
                  <Ionicons name="logo-apple" size={24} color="#ffffff" />
                  <Text style={styles.paymentMethodText}>Apple Pay</Text>
                </View>
                {loading && selectedMethod === 'apple' ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color="#888888" />
                )}
              </TouchableOpacity>
            )}

            {/* Cash App Button */}
            <TouchableOpacity
              style={[
                styles.paymentMethodButton,
                selectedMethod === 'cashapp' && styles.paymentMethodButtonSelected,
              ]}
              onPress={() => setSelectedMethod('cashapp')}
            >
              <View style={styles.paymentMethodContent}>
                <Text style={styles.cashAppIcon}>$</Text>
                <Text style={styles.paymentMethodText}>Cash App Pay</Text>
              </View>
              {selectedMethod === 'cashapp' && (
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              )}
            </TouchableOpacity>

            {/* New card */}
            <TouchableOpacity
              style={[
                styles.paymentMethodButton,
                selectedMethod === 'card' && styles.paymentMethodButtonSelected,
              ]}
              onPress={() => setSelectedMethod('card')}
            >
              <View style={styles.paymentMethodContent}>
                <Ionicons name="card-outline" size={24} color="#ffffff" />
                <Text style={styles.paymentMethodText}>New card</Text>
              </View>
              {selectedMethod === 'card' && (
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              )}
            </TouchableOpacity>

            {/* Card Field (shown when card is selected) */}
            {selectedMethod === 'card' && (
              <View style={styles.cardFieldContainer}>
                <CardField
                  postalCodeEnabled={false}
                  placeholders={{
                    number: '4242 4242 4242 4242',
                  }}
                  cardStyle={{
                    backgroundColor: '#1a1a1a',
                    borderColor: '#2a2a2a',
                    borderWidth: 1,
                    textColor: '#ffffff',
                    fontSize: 16,
                  }}
                  style={styles.cardField}
                  onCardChange={(cardDetails) => {
                    setCardComplete(cardDetails.complete);
                  }}
                />
              </View>
            )}

            {/* Pay Button */}
            {selectedMethod && (
              <TouchableOpacity
                style={[styles.payButton, loading && styles.payButtonDisabled]}
                onPress={() => {
                  if (selectedMethod === 'card') {
                    handleCardPayment();
                  } else if (typeof selectedMethod === 'string' && selectedMethod.startsWith('saved_')) {
                    const idx = parseInt(selectedMethod.replace('saved_', ''), 10);
                    const pm = savedPaymentMethods[idx];
                    if (pm?.id) handleSavedCardPayment(pm.id);
                  } else if (selectedMethod === 'apple') {
                    handleApplePay();
                  } else if (selectedMethod === 'cashapp') {
                    handleCashApp();
                  }
                }}
                disabled={loading || (selectedMethod === 'card' && !cardComplete)}
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
            )}
          </>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              Your payment is secure and protected
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
  savedCardsLabel: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
    marginTop: 4,
  },
  paymentMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  paymentMethodButtonSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2a1a',
  },
  paymentMethodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentMethodText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  cashAppIcon: {
    fontSize: 24,
    fontWeight: '900',
    color: '#00D632',
  },
  cardFieldContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  cardField: {
    width: '100%',
    height: 50,
    marginVertical: 10,
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
