// src/auth/apple.ts

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../supabaseClient';

WebBrowser.maybeCompleteAuthSession();

/**
 * Performs Sign in with Apple:
 * - On iOS: uses the native AppleAuthentication API.
 * - On Android: falls back to a browser-based OAuth via Supabase.
 */
export async function signInWithApple(): Promise<void> {
  const appOwnership = (Constants as any)?.appOwnership as string | null;
  const isNativeClient = appOwnership === 'standalone' || appOwnership === 'guest';
  const appleAvailable = Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());

  if (isNativeClient && appleAvailable) {
    // 1) Native Apple sheet
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });

    // 2) Grab the identity token
    const { identityToken } = credential;
    if (!identityToken) {
      throw new Error('Apple Sign-In failed: no identity token returned');
    }

    // 3) Hand it to Supabase to log in / sign up
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
    });
    if (error) {
      console.error('Supabase Apple sign-in error:', error);
      throw error;
    }
  } else {
    // 1) Browser fallback (Expo Go, Android, Simulator, or when Apple auth not available)
    const redirectUri = AuthSession.getRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: redirectUri },
    });
    if (error) {
      console.error('Apple OAuth error:', error);
      throw error;
    }
    // 2) Open the system browser for consent
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    if (result.type !== 'success' && result.type !== 'dismiss') {
      console.warn('Unexpected auth session result:', result);
    }
  }
}
