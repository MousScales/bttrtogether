/**
 * Single source of truth for app config (Supabase, Stripe).
 * Reads from Expo extra (app.config.js) or process.env.
 * Use this everywhere instead of hardcoding URLs/keys.
 */
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

function trim(s) {
  return (s && typeof s === 'string') ? s.trim() : '';
}

/** Normalize URL: trim and strip trailing slash so it's valid for fetch/Supabase */
function normalizeUrl(url) {
  const u = trim(url);
  return u ? u.replace(/\/+$/, '') : u;
}

export function getSupabaseUrl() {
  return (
    normalizeUrl(extra.supabaseUrl) ||
    normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL) ||
    'https://xwkgmewbzohylnjirxaw.supabase.co'
  );
}

export function getSupabaseAnonKey() {
  return (
    trim(extra.supabaseAnonKey) ||
    trim(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3a2dtZXdiem9oeWxuamlyeGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTMzMDQsImV4cCI6MjA4NjMyOTMwNH0.hq4yiRGeCaJThwbFtULhUete6mZHnOkSLKzMHCpJvL4'
  );
}

/** Base URL for Supabase Edge Functions (e.g. super-handler, process-payout) */
export function getSupabaseFunctionsUrl() {
  const base = getSupabaseUrl();
  return base ? `${base.replace(/\/+$/, '')}/functions/v1` : '';
}

export function getStripePublishableKey() {
  return (
    trim(extra.stripePublishableKey) ||
    trim(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) ||
    trim(process.env.STRIPE_PUBLISHABLE_KEY) ||
    ''
  );
}

/** Base URL for invite links (e.g. https://bttrsite.vercel.app). When set, sharing uses this so iMessage shows a rich preview (image + title). */
const DEFAULT_INVITE_WEB_BASE_URL = 'https://bttrsite.vercel.app';

export function getInviteWebBaseUrl() {
  const url = normalizeUrl(
    extra.inviteWebBaseUrl ||
    process.env.EXPO_PUBLIC_INVITE_WEB_BASE_URL ||
    DEFAULT_INVITE_WEB_BASE_URL ||
    ''
  );
  return url || null;
}
