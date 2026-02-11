import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function GroupGoalPaymentScreen({ navigation, route }) {
  const { goalListId, amount, goalListName } = route.params;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  useEffect(() => {
    initializePaymentSheet();
  }, []);

  const initializePaymentSheet = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please log in to make a payment');
        navigation.goBack();
        return;
      }

      // Call Supabase Edge Function to create payment intent
      const { data, error } = await supabase.functions.invoke('super-handler', {
        body: {
          goal_list_id: goalListId,
          amount: parseFloat(amount),
          user_id: user.id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create payment');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const { clientSecret, paymentIntentId: intentId } = data;

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Bttr Together',
      });

      if (initError) {
        throw initError;
      }

      setPaymentIntentId(intentId);
      setPaymentReady(true);
    } catch (error) {
      console.error('Error initializing payment:', error);
      Alert.alert('Error', error.message || 'Failed to initialize payment');
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentReady) {
      Alert.alert('Error', 'Payment is not ready yet');
      return;
    }

    setLoading(true);

    try {
      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Payment Failed', error.message);
        }
        setLoading(false);
        return;
      }

      // Payment succeeded - update database directly
      const { data: { user } } = await supabase.auth.getUser();
      
      // Save payment to database
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          goal_list_id: goalListId,
          user_id: user.id,
          amount: parseFloat(amount),
          stripe_payment_intent_id: paymentIntentId,
          status: 'succeeded',
        });

      if (paymentError) {
        console.error('Error saving payment:', paymentError);
        // Don't fail - payment already succeeded with Stripe
      }

      // Update participant payment status
      const { error: participantError } = await supabase
        .from('group_goal_participants')
        .update({ payment_status: 'paid' })
        .eq('goal_list_id', goalListId)
        .eq('user_id', user.id);

      if (participantError) {
        console.error('Error updating participant:', participantError);
      }

      // Verify user has access to this goal list (either owner or participant)
      const { data: goalListCheck } = await supabase
        .from('goal_lists')
        .select('user_id, total_pot')
        .eq('id', goalListId)
        .single();

      if (!goalListCheck) {
        console.error('Goal list not found or access denied');
        return;
      }

      // Check if user is owner or participant
      const isOwner = goalListCheck.user_id === user.id;
      const { data: participantCheck } = await supabase
        .from('group_goal_participants')
        .select('id')
        .eq('goal_list_id', goalListId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isOwner && !participantCheck) {
        console.error('User does not have access to this goal list');
        return;
      }

      // Update total pot
      const newTotal = (goalListCheck.total_pot || 0) + parseFloat(amount);
      await supabase
        .from('goal_lists')
        .update({ total_pot: newTotal })
        .eq('id', goalListId);

      // Check if all participants have paid
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

      Alert.alert('Success', 'Payment successful! You\'ve joined the challenge.', [
        {
          text: 'OK',
          onPress: () => {
            // Navigate back and refresh
            navigation.navigate('GoalsHome');
            // The screen will reload via useFocusEffect
          },
        },
      ]);
    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              You must pay this amount to join the challenge
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="trophy-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              The winner will receive the total pot
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              Your payment is secure and protected
            </Text>
          </View>
        </View>

        {!paymentReady && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Preparing payment...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.payButton, (!paymentReady || loading) && styles.payButtonDisabled]}
          onPress={handlePayment}
          disabled={!paymentReady || loading}
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
      </View>
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
  infoSection: {
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
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888888',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
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
});

