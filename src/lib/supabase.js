import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ivsyfxqonaezvbiwrkds.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2c3lmeHFvbmFlenZiaXdya2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjcxMTYsImV4cCI6MjA5NzcwMzExNn0.cVYc54qisF3ef-1HbZNd-rAhZD8Ub9NbpfPKCmJvKoo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
