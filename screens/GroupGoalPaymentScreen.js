import React, { useState, useEffect } from 'react';
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
import { getSupabaseFunctionsUrl, getSupabaseAnonKey } from '../lib/config';

export default function GroupGoalPaymentScreen({ navigation, route }) {
  const { goalListId, amount, goalListName } = route.params;
  const { confirmPayment } = useStripe();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null); // 'card', 'apple', 'cashapp'
  const [cardComplete, setCardComplete] = useState(false);

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

      const response = await fetch(`${getSupabaseFunctionsUrl()}/super-handler`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
            'Authorization': `Bearer ${getSupabaseAnonKey()}`,
          },
          body: JSON.stringify({
            goal_list_id: goalListId,
            amount: parseFloat(amount),
            user_id: user.id,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
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
          Alert.alert('Payment Failed', error.message);
        }
        setLoading(false);
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      }
    } catch (error) {
      console.error('Error processing card payment:', error);
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handleApplePay = async () => {
    if (!clientSecret) {
      Alert.alert('Error', 'Payment not ready');
      return;
    }

    setSelectedMethod('apple');
    setLoading(true);
    try {
      // Confirm payment with Apple Pay - this will show the Apple Pay sheet
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'ApplePay',
      });

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Payment Failed', error.message);
        }
        setLoading(false);
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      }
    } catch (error) {
      console.error('Error processing Apple Pay:', error);
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handleCashApp = async () => {
    if (!clientSecret) {
      Alert.alert('Error', 'Payment not ready');
      return;
    }

    setLoading(true);
    try {
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'CashApp',
      });

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Payment Failed', error.message);
        }
        setLoading(false);
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        await processPaymentSuccess();
      }
    } catch (error) {
      console.error('Error processing Cash App:', error);
      Alert.alert('Error', error.message || 'Failed to process payment');
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

            {/* Apple Pay Button - Show on iOS, triggers payment immediately */}
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

            {/* Card Payment Option */}
            <TouchableOpacity
              style={[
                styles.paymentMethodButton,
                selectedMethod === 'card' && styles.paymentMethodButtonSelected,
              ]}
              onPress={() => setSelectedMethod('card')}
            >
              <View style={styles.paymentMethodContent}>
                <Ionicons name="card" size={24} color="#ffffff" />
                <Text style={styles.paymentMethodText}>Credit or Debit Card</Text>
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
