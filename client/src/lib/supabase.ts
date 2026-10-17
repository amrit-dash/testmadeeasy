import { createClient } from "@supabase/supabase-js";

const getEnvUrl = () => {
    if (typeof window !== 'undefined' && (window as any).ENV && (window as any).ENV.VITE_SUPABASE_URL) {
        return (window as any).ENV.VITE_SUPABASE_URL;
    }
    return import.meta.env.VITE_SUPABASE_URL || "https://your-supabase-url.supabase.co";
};

const getEnvKey = () => {
    if (typeof window !== 'undefined' && (window as any).ENV && (window as any).ENV.VITE_SUPABASE_ANON_KEY) {
        return (window as any).ENV.VITE_SUPABASE_ANON_KEY;
    }
    return import.meta.env.VITE_SUPABASE_ANON_KEY || "your-supabase-anon-key";
};

const supabaseUrl = getEnvUrl();
const supabaseAnonKey = getEnvKey();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});
