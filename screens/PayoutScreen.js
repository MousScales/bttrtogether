import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function PayoutScreen({ navigation, route }) {
  const { goalListId, goalListName, totalAmount } = route.params;
  const [loading, setLoading] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState(null);

  const handlePayout = async () => {
    if (!payoutMethod) {
      Alert.alert('Error', 'Please select a payout method');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please log in');
        return;
      }

      // For now, just save payout record to database
      // In production, you'd call Stripe to actually transfer funds
      // This requires Stripe Connect or manual bank transfer setup
      
      const { error } = await supabase
        .from('payouts')
        .insert({
          goal_list_id: goalListId,
          winner_id: user.id,
          total_amount: parseFloat(totalAmount),
          status: 'pending',
        });

      if (error) {
        throw error;
      }

      Alert.alert(
        'Success',
        `Payout request of $${parseFloat(totalAmount).toFixed(2)} has been submitted! You will receive the funds within 2-3 business days.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error processing payout:', error);
      Alert.alert('Error', error.message || 'Failed to process payout');
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
        <Text style={styles.headerTitle}>Claim Winnings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.winnerBanner}>
          <Ionicons name="trophy" size={48} color="#FFD700" />
          <Text style={styles.winnerText}>Congratulations!</Text>
          <Text style={styles.winnerSubtext}>You won the challenge</Text>
        </View>

        <View style={styles.challengeInfo}>
          <Text style={styles.challengeName}>{goalListName}</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Total Winnings</Text>
            <Text style={styles.amount}>${parseFloat(totalAmount).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.payoutSection}>
          <Text style={styles.sectionTitle}>Select Payout Method</Text>

          <TouchableOpacity
            style={[
              styles.payoutMethod,
              payoutMethod === 'bank' && styles.payoutMethodSelected,
            ]}
            onPress={() => setPayoutMethod('bank')}
          >
            <View style={styles.payoutMethodLeft}>
              <Ionicons name="card" size={24} color="#ffffff" />
              <View style={styles.payoutMethodInfo}>
                <Text style={styles.payoutMethodName}>Bank Account</Text>
                <Text style={styles.payoutMethodSubtext}>Direct deposit (2-3 business days)</Text>
              </View>
            </View>
            {payoutMethod === 'bank' && (
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.payoutMethod,
              payoutMethod === 'stripe' && styles.payoutMethodSelected,
            ]}
            onPress={() => setPayoutMethod('stripe')}
          >
            <View style={styles.payoutMethodLeft}>
              <Ionicons name="wallet" size={24} color="#ffffff" />
              <View style={styles.payoutMethodInfo}>
                <Text style={styles.payoutMethodName}>Stripe Balance</Text>
                <Text style={styles.payoutMethodSubtext}>Instant transfer to Stripe</Text>
              </View>
            </View>
            {payoutMethod === 'stripe' && (
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.payoutMethod,
              payoutMethod === 'paypal' && styles.payoutMethodSelected,
            ]}
            onPress={() => setPayoutMethod('paypal')}
          >
            <View style={styles.payoutMethodLeft}>
              <Ionicons name="logo-paypal" size={24} color="#0070BA" />
              <View style={styles.payoutMethodInfo}>
                <Text style={styles.payoutMethodName}>PayPal</Text>
                <Text style={styles.payoutMethodSubtext}>Transfer to PayPal account</Text>
              </View>
            </View>
            {payoutMethod === 'paypal' && (
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              Payouts are processed securely through Stripe
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color="#888888" />
            <Text style={styles.infoText}>
              Processing time varies by method (instant to 3 business days)
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.payoutButton, (!payoutMethod || loading) && styles.payoutButtonDisabled]}
          onPress={handlePayout}
          disabled={!payoutMethod || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Text style={styles.payoutButtonText}>Claim ${parseFloat(totalAmount).toFixed(2)}</Text>
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
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
  winnerBanner: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  winnerText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 16,
  },
  winnerSubtext: {
    fontSize: 16,
    color: '#888888',
    marginTop: 8,
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
    fontSize: 18,
    fontWeight: '600',
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
  payoutSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  payoutMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  payoutMethodSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2a1a',
  },
  payoutMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  payoutMethodInfo: {
    flex: 1,
  },
  payoutMethodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  payoutMethodSubtext: {
    fontSize: 12,
    color: '#888888',
  },
  infoSection: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#888888',
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  payoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  payoutButtonDisabled: {
    backgroundColor: '#2a2a2a',
    opacity: 0.5,
  },
  payoutButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});

