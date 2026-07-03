/**
 * Runtime environment variable validation.
 * Called once at app boot — throws a clear error if required vars are missing
 * so developers get an actionable message instead of a cryptic Supabase error.
 */

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

const RECOMMENDED_VARS = [
  'VITE_VAPID_PUBLIC_KEY',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = import.meta.env[key] as string | undefined;
    if (!value || value.includes('your-project-id') || value === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const msg = [
      '❌ StayTrue: Missing required environment variables:',
      ...missing.map((k) => `  • ${k}`),
      '',
      'Copy .env.example to .env and fill in the values.',
      'See README.md → Local Setup for instructions.',
    ].join('\n');

    // In development throw to surface the error overlay
    if (import.meta.env.DEV) {
      throw new Error(msg);
    }
    // In production log clearly but don't crash (Supabase calls will fail gracefully)
    console.error(msg);
  }

  // Warn about optional but recommended vars
  for (const key of RECOMMENDED_VARS) {
    const value = import.meta.env[key] as string | undefined;
    if (!value) {
      console.warn(`⚠️ StayTrue: Optional env var ${key} is not set. Push notifications will be disabled.`);
    }
  }
}
