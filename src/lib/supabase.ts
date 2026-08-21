import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { supabase } from '../services/supabase';

export { supabase };
export default supabase;
