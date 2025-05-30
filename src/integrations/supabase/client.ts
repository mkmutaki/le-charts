
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yqrxkqlpppoowcilsvxg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcnhrcWxwcHBvb3djaWxzdnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1MDE3ODUsImV4cCI6MjA1ODA3Nzc4NX0.3ZpJV6eYRBvMrHbKlyvEURLR-tFHsoLTsbjKkXSAUrE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
});

// Helper functions for authentication
export const hasResetToken = () => {
  return window.location.hash.includes('type=recovery');
};

// Add a helper function to check for auth confirmation tokens
export const hasAuthToken = () => {
  return window.location.hash.includes('access_token=') || 
         window.location.hash.includes('refresh_token=');
};
