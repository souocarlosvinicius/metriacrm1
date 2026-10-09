import { createClient } from "@supabase/supabase-js";

const env = (typeof import.meta !== "undefined" && (import.meta as any).env) || (typeof process !== "undefined" && process.env) || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

const isDev = (env as any).DEV || (env as any).MODE !== "production";

if (!supabaseUrl || !supabaseAnonKey) {
  const errMsg = "CRITICAL ERROR: Supabase environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing!";
  if (isDev) {
    console.warn(
      `${errMsg}\nRunning in DEVELOPMENT mode. The application will use a dummy client, but actual Supabase operations will fail until you configure them in the Settings menu.`
    );
  } else {
    console.error(errMsg);
    throw new Error(errMsg);
  }
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder-project.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
