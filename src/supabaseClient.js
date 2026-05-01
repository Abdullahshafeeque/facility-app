import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://ulkvltoctpjydloonwcw.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsa3ZsdG9jdHBqeWRsb29ud2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDExNTEsImV4cCI6MjA5MzExNzE1MX0.mWoQUKYCozIA-rROhhCXVE6JoJZEBQTCh3AtqnztW-E"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)