import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// How to show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Get projectId for Expo push token (required for getExpoPushTokenAsync).
 */
function getProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
}

/**
 * Register for push notifications and return the Expo push token, or null if not possible.
 * Call on a physical device when user is logged in and has notifications enabled.
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = getProjectId();
  if (!projectId) return null;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData?.data ?? null;
  } catch (e) {
    console.warn('Push token error:', e);
    return null;
  }
}

/**
 * Save Expo push token to the current user's profile.
 * Clears token if passed null (e.g. on logout or when user disables notifications).
 */
export async function savePushTokenToProfile(token) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', user.id);
  if (error) console.warn('Failed to save push token:', error);
}

/**
 * Hook: register for push, save token to Supabase when logged in and notifications enabled,
 * and clear token when notifications are disabled or user logs out.
 * @param {boolean} isLoggedIn - Whether the user is logged in (e.g. !!session)
 */
export function usePushNotifications(isLoggedIn) {
  const savedTokenRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn) {
      savePushTokenToProfile(null);
      savedTokenRef.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('notifications_enabled')
        .eq('id', (await supabase.auth.getUser()).data?.user?.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.notifications_enabled === false) {
        savePushTokenToProfile(null);
        savedTokenRef.current = false;
        return;
      }
      const token = await registerForPushNotificationsAsync();
      if (cancelled) return;
      if (token) {
        await savePushTokenToProfile(token);
        savedTokenRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);
}
