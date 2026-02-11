// IMPORTANT: Use environment variables for all Stripe keys
// Never commit actual keys to version control
import Constants from 'expo-constants';

// Get Stripe publishable key from environment or config
// Expo automatically loads .env variables into process.env
// Try multiple common variable name patterns
const getStripeKey = () => {
  // Try from expo config extra first (app.json or app.config.js)
  if (Constants.expoConfig?.extra?.stripePublishableKey) {
    return Constants.expoConfig.extra.stripePublishableKey;
  }
  
  // Try various environment variable name patterns
  // Expo requires EXPO_PUBLIC_ prefix for client-side variables
  const possibleKeys = [
    'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'REACT_APP_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_PUBLISHABLE',
    'STRIPE_KEY',
  ];
  
  for (const key of possibleKeys) {
    if (process.env[key]) {
      return process.env[key];
    }
  }
  
  // Fallback - you should set this in your .env file
  console.warn('Stripe publishable key not found. Please set one of these in your .env file:');
  console.warn('  - EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (recommended for Expo)');
  console.warn('  - STRIPE_PUBLISHABLE_KEY');
  return '';
};

export const STRIPE_PUBLISHABLE_KEY = getStripeKey();

// For server-side operations, use environment variables
// Example backend usage (Node.js):
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

