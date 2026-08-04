/*
 * Supabase connection settings.
 *
 * Fill these two values in from your project:
 *   Supabase dashboard -> Project Settings -> API
 *     SUPABASE_URL      = "Project URL"
 *     SUPABASE_ANON_KEY = "anon public" key   (NOT the service_role key)
 *
 * The anon key is meant to be public — it ships in every Supabase web app.
 * What actually protects your data is Row Level Security, which the policies in
 * supabase-schema.sql switch on for both tables. Never put the service_role key
 * here; that one bypasses RLS.
 *
 * Until these are filled in the app runs in offline mode: the tracker still
 * works and progress is kept in this browser, but there are no accounts and
 * nothing syncs between devices.
 */
window.SUPABASE_URL = "https://whddpmsofaborfadiyss.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoZGRwbXNvZmFib3JmYWRpeXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjEyOTksImV4cCI6MjEwMTQzNzI5OX0.3aG-pcmZRFmg4MkTZ3DCNMTT0mTNjmdisP3lBtmWAF8";
