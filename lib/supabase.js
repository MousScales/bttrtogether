import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';

export const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const AVATARS_PREFIX = 'avatars/';

/** Resolve avatar_url for display: if it's a storage path (no http), return public URL; else return as-is. */
export function getAvatarDisplayUrl(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const { data } = supabase.storage.from('avatars').getPublicUrl(trimmed);
  return data?.publicUrl || trimmed;
}

/** Get a display URL for avatar that works for private buckets (signed URL). Use this when the public URL fails to load. */
export async function getAvatarDisplayUrlAsync(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  let path = null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const i = trimmed.indexOf(AVATARS_PREFIX);
    if (i !== -1) path = trimmed.slice(i + AVATARS_PREFIX.length).split('?')[0];
    if (!path) return trimmed;
  } else {
    path = trimmed;
  }
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) return data.signedUrl;
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return pub?.publicUrl || trimmed;
}

/** Resolve goal proof image URL for display: full URL as-is, or storage path → goal-proofs public URL. */
export function getProofDisplayUrl(proofUrl) {
  if (!proofUrl || typeof proofUrl !== 'string') return null;
  const trimmed = proofUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const { data } = supabase.storage.from('goal-proofs').getPublicUrl(trimmed);
  return data?.publicUrl || trimmed;
}

const GOAL_PROOFS_PREFIX = 'goal-proofs/';

/** Get display URL for proof media. Tries signed URL first (works for private buckets), then public. */
export async function getProofDisplayUrlAsync(proofUrl) {
  if (!proofUrl || typeof proofUrl !== 'string') return null;
  const trimmed = proofUrl.trim();
  let path = null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const i = trimmed.indexOf(GOAL_PROOFS_PREFIX);
    if (i !== -1) path = trimmed.slice(i + GOAL_PROOFS_PREFIX.length).split('?')[0];
    if (!path) return trimmed; // already a full URL, use as-is
  } else {
    path = trimmed;
  }
  const { data, error } = await supabase.storage.from('goal-proofs').createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) return data.signedUrl;
  const { data: pub } = supabase.storage.from('goal-proofs').getPublicUrl(path);
  return pub?.publicUrl || trimmed;
}
