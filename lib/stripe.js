// IMPORTANT: Use environment variables for all Stripe keys
// Never commit actual keys to version control
import Constants from 'expo-constants';

export const STRIPE_PUBLISHABLE_KEY = Constants.expoConfig?.extra?.stripePublishableKey || process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// For server-side operations, use environment variables
// Example backend usage (Node.js):
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

