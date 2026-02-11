import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xwkgmewbzohylnjirxaw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3a2dtZXdiem9oeWxuamlyeGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTMzMDQsImV4cCI6MjA4NjMyOTMwNH0.hq4yiRGeCaJThwbFtULhUete6mZHnOkSLKzMHCpJvL4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

