/**
 * Single source of truth for app config (Supabase, Stripe).
 * Reads from Expo extra (app.config.js) or process.env.
 * Use this everywhere instead of hardcoding URLs/keys.
 */
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export function getSupabaseUrl() {
  return (
    extra.supabaseUrl ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    'https://xwkgmewbzohylnjirxaw.supabase.co'
  );
}

export function getSupabaseAnonKey() {
  return (
    extra.supabaseAnonKey ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3a2dtZXdiem9oeWxuamlyeGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTMzMDQsImV4cCI6MjA4NjMyOTMwNH0.hq4yiRGeCaJThwbFtULhUete6mZHnOkSLKzMHCpJvL4'
  );
}

/** Base URL for Supabase Edge Functions (e.g. super-handler, process-payout) */
export function getSupabaseFunctionsUrl() {
  return `${getSupabaseUrl()}/functions/v1`;
}

export function getStripePublishableKey() {
  return (
    extra.stripePublishableKey ||
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    ''
  );
}
