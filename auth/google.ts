// src/auth/google.ts

import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import { crashLogger } from '../utils/crashLogger';

WebBrowser.maybeCompleteAuthSession();

/**
 * Launches the Google OAuth flow via Supabase.
 * Processes the tokens to complete the sign-in.
 */
export async function signInWithGoogle(): Promise<void> {
  crashLogger.log('🚀 [GoogleAuth] === STARTING GOOGLE AUTH PROCESS ===');
  crashLogger.log('🔍 [GoogleAuth] Process started at:', new Date().toISOString());
  
  try {
    crashLogger.log('🚀 [GoogleAuth] Starting Google Sign-In process...');
    crashLogger.log('🔍 [GoogleAuth] Timestamp:', new Date().toISOString());
    
    // Detect environment and set appropriate redirect URI
    const appOwnership = Constants.appOwnership;
    const isDevelopment = appOwnership === 'expo';
    
    let redirectUri: string;
    
    if (isDevelopment) {
      // Development: use expo scheme
      redirectUri = makeRedirectUri({
        scheme: 'exp',
        path: 'auth/callback'
      });
    } else {
      // Production: use custom scheme
      redirectUri = 'grocerygo://auth/callback';
    }
    
    console.log('🔍 [GoogleAuth] Environment:', isDevelopment ? 'Development' : 'Production');
    console.log('🔍 [GoogleAuth] App Ownership:', appOwnership);
    console.log('🔍 [GoogleAuth] Redirect URI:', redirectUri);
    console.log('🔍 [GoogleAuth] Redirect URI type:', typeof redirectUri);

    // 2) Ask Supabase for the OAuth URL
    console.log('🔍 [GoogleAuth] Calling supabase.auth.signInWithOAuth...');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { 
        redirectTo: redirectUri,
        skipBrowserRedirect: true 
      },
    });
    
    if (error) {
      console.error('❌ [GoogleAuth] OAuth error:', error);
      console.error('❌ [GoogleAuth] OAuth error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('🔍 [GoogleAuth] Supabase OAuth response received');
    console.log('🔍 [GoogleAuth] OAuth data:', JSON.stringify(data, null, 2));
    console.log('🔍 [GoogleAuth] Opening OAuth URL:', data.url);

    // 3) Validate URL before opening WebBrowser
    console.log('🔍 [GoogleAuth] Validating OAuth URL...');
    if (!data.url || typeof data.url !== 'string') {
      console.error('❌ [GoogleAuth] Invalid OAuth URL:', data.url);
      throw new Error('Invalid OAuth URL received from Supabase');
    }
    
    console.log('🔍 [GoogleAuth] OAuth URL is valid, length:', data.url.length);
    console.log('🔍 [GoogleAuth] Opening WebBrowser with URL and redirectUri...');
    console.log('🔍 [GoogleAuth] WebBrowser URL:', data.url);
    console.log('🔍 [GoogleAuth] WebBrowser redirectUri:', redirectUri);
    
    // Check if WebBrowser is available
    console.log('🔍 [GoogleAuth] Checking WebBrowser availability...');
    if (!WebBrowser.openAuthSessionAsync) {
      console.error('❌ [GoogleAuth] WebBrowser.openAuthSessionAsync not available');
      throw new Error('WebBrowser is not available on this device');
    }
    
    let result;
    try {
      // Use the most basic WebBrowser call possible
      console.log('🔍 [GoogleAuth] Attempting basic WebBrowser call...');
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      
      console.log('🔍 [GoogleAuth] WebBrowser completed successfully');
      console.log('🔍 [GoogleAuth] WebBrowser result type:', result.type);
      console.log('🔍 [GoogleAuth] WebBrowser result:', JSON.stringify(result, null, 2));
    } catch (webBrowserError) {
      console.error('❌ [GoogleAuth] WebBrowser crashed:', webBrowserError);
      console.error('❌ [GoogleAuth] WebBrowser error type:', typeof webBrowserError);
      console.error('❌ [GoogleAuth] WebBrowser error message:', webBrowserError.message);
      console.error('❌ [GoogleAuth] WebBrowser error stack:', webBrowserError.stack);
      
      // Don't try fallback if it's a crash - just throw the error
      throw new Error(`WebBrowser crashed: ${webBrowserError.message || 'Unknown error'}`);
    }

    // 4) Process the authentication result
    if (result.type === 'success') {
      const { url } = result;
      console.log('✅ [GoogleAuth] Success! Processing URL:', url);
      console.log('🔍 [GoogleAuth] URL length:', url?.length);
      console.log('🔍 [GoogleAuth] URL type:', typeof url);
      
      if (!url) {
        console.error('❌ [GoogleAuth] No URL returned from WebBrowser');
        throw new Error('No URL returned from authentication');
      }
      
      // Parse the URL to extract tokens
      console.log('🔍 [GoogleAuth] Parsing URL with Linking.parse...');
      const parsedUrl = Linking.parse(url);
      console.log('🔍 [GoogleAuth] Parsed URL:', JSON.stringify(parsedUrl, null, 2));
      const { queryParams } = parsedUrl;
      
      if (queryParams) {
        // Extract tokens from URL fragments (they come after #)
        const urlParts = url.split('#');
        if (urlParts.length > 1) {
          const fragment = urlParts[1];
          const params = new URLSearchParams(fragment);
          
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          
          console.log('🔍 [GoogleAuth] Extracted tokens:', {
            accessToken: accessToken ? 'Present' : 'Missing',
            refreshToken: refreshToken ? 'Present' : 'Missing'
          });
          
          if (accessToken && refreshToken) {
            // Set the session in Supabase
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (sessionError) {
              console.error('❌ [GoogleAuth] Session error:', sessionError);
              throw sessionError;
            }
            
            console.log('✅ [GoogleAuth] Session set successfully!', sessionData.user?.email);
            
            // Force trigger auth state change by getting session again
            console.log('🔍 [GoogleAuth] Forcing auth state change detection...');
            const { data: { session: newSession } } = await supabase.auth.getSession();
            console.log('🔍 [GoogleAuth] New session check:', newSession?.user?.email || 'No session');
            
            // Import router dynamically to avoid circular dependencies
            const { router } = await import('expo-router');
            console.log('🔍 [GoogleAuth] Attempting direct navigation to SelectLocation...');
            
            try {
              await router.replace('/SelectLocation');
              console.log('✅ [GoogleAuth] Direct navigation successful!');
            } catch (navError) {
              console.error('❌ [GoogleAuth] Direct navigation failed:', navError);
            }
            
            // Small delay to ensure the session is fully established
            await new Promise(resolve => setTimeout(resolve, 1000));
            return;
          }
        }
        
        // Handle direct query params (fallback)
        if (queryParams.access_token && queryParams.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: queryParams.access_token as string,
            refresh_token: queryParams.refresh_token as string,
          });
          
          if (sessionError) {
            console.error('❌ [GoogleAuth] Session error:', sessionError);
            throw sessionError;
          }
          
          console.log('✅ [GoogleAuth] Session set via query params!');
          return;
        }
        
        // Handle OAuth errors
        if (queryParams.error) {
          const errorMessage = queryParams.error_description || queryParams.error;
          console.error('❌ [GoogleAuth] OAuth error:', errorMessage);
          throw new Error(`Authentication failed: ${errorMessage}`);
        }
      }
      
      throw new Error('No valid tokens found in the response');
      
    } else if (result.type === 'dismiss') {
      console.log('⚠️ [GoogleAuth] User dismissed the auth flow');
      throw new Error('Authentication was cancelled by the user');
    } else {
      console.warn('⚠️ [GoogleAuth] Unexpected result:', result);
      throw new Error('Authentication failed with unexpected result');
    }
  } catch (error) {
    console.error('❌ [GoogleAuth] === CRITICAL ERROR IN GOOGLE AUTH ===');
    console.error('❌ [GoogleAuth] Error type:', typeof error);
    console.error('❌ [GoogleAuth] Error message:', error?.message || 'No message');
    console.error('❌ [GoogleAuth] Error stack:', error?.stack || 'No stack');
    console.error('❌ [GoogleAuth] Full error object:', JSON.stringify(error, null, 2));
    console.error('❌ [GoogleAuth] Process failed at:', new Date().toISOString());
    throw error;
  }
}
