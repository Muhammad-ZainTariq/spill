import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

const supabaseUrl = "https://ccojzpzzcwhlvuhunyij.supabase.co";
const supabaseAnonKey = "sb_publishable_Xc7ADrF682Xvzct9eu0mjw_Nfyu9AFv"; // ✅ use publishable key here

// Build a deep link to the auth callback route handled in the app
const redirectTo = Linking.createURL("auth-callback");

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
    flowType: "implicit",
    redirectTo,
    autoRefreshToken: true,
    persistSession: true,
    // Use AsyncStorage only on native; let Supabase use browser storage on web
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    storageKey: "spill-auth",
    debug: false, // Disable debug mode to reduce warnings
  },
});
// xcrun simctl boot E730D064-FD2B-4FA2-9BB3-4D08827D9F43