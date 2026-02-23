import { getStripePublishableKey } from './config';

export const STRIPE_PUBLISHABLE_KEY = getStripePublishableKey();

// For server-side operations, use environment variables
// Example backend usage (Node.js):
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

