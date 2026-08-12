import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { offlineFetch } from '@/offline/offlineFetch'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing credentials — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

// offlineFetch encola las escrituras cuando no hay señal y las reenvía
// al reconectar (ver src/offline/)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: offlineFetch }
})

export type SupabaseClient = typeof supabase
