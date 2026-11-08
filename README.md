# دورات الشيخ محمد أحمد الشموري

React + TypeScript + Supabase site for publishing dawrat, running quizzes, and reviewing student submissions.

## Run Locally

```bash
npm install
npm run dev
```

The project reads:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are already present in `.env`.

## Supabase Setup

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. Optionally run `supabase/sample-data.sql` to create a first demo dawra and exam.
4. Start the app and enter the admin area using `VITE_ADMIN_ACCESS_CODE`.

For an existing Supabase project, run `supabase/migrations.sql` to add the profile table, course attachment columns, result visibility setting, and the public `shmoury-assets` storage bucket used by admin uploads.

## Ghawthani Ijazah and Certificate

The public form is available at `/ejazaGhawthani`. It stores attendance declarations and generates the gender-specific Ijazah and/or participation certificate on the server. Personalized PDFs and templates are kept in the private `ghawthani-private` bucket and are exposed only through short-lived signed URLs.

### Deploy the database and Edge Functions

1. Apply `supabase/migrations/202611080001_ghawthani_ijazah.sql` (or run `supabase db push` in a linked project).
2. Set the server-only secrets shown in `supabase/.env.example`. Use long random values for both token secrets. The admin code must also remain server-only and must not use a `VITE_` prefix. Set `GH_A_ALLOWED_ORIGINS` to the exact deployed site origin; comma-separate additional trusted origins such as a local admin environment.
3. Deploy the `ghawthani` and `ghawthani-admin` Edge Functions with Supabase CLI 2.7.0 or newer. Their JWT gateway check is disabled in `supabase/config.toml` because the public submission endpoint and the server-issued admin token perform their own authorization. The same config bundles the Arabic font as a static file; deploy through the normal CLI bundler (not the API-only deployment flag).
4. Export `SUPABASE_SERVICE_ROLE_KEY` only in the trusted deployment shell, then run `npm run seed:ghawthani`. This uploads the three supplied originals, records their exact page dimensions and placement settings, validates them, and activates one version of each purpose.
5. Deploy the Vite build. `public/_redirects` and `vercel.json` provide SPA fallbacks for direct visits to `/ejazaGhawthani` on Netlify-compatible and Vercel deployments.

Example commands for a linked Supabase project:

```bash
supabase db push
supabase secrets set GH_A_ADMIN_CODE='a-long-private-code' \
  GH_A_ADMIN_TOKEN_SECRET='at-least-32-random-characters' \
  GH_A_ACCESS_SECRET='at-least-32-other-random-characters' \
  GH_A_ALLOWED_ORIGINS='https://your-site.example'
supabase functions deploy ghawthani
supabase functions deploy ghawthani-admin
SUPABASE_URL='https://PROJECT.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='server-only-key' npm run seed:ghawthani
```

### Template workflow

Open **إجازات وشهادات دورة الغوثاني** in the existing dashboard. Under **إدارة القوالب**, select the purpose, upload a PDF, adjust the name box in PDF points, generate a sample with an Arabic test name, inspect the full-size PDF, approve the sample, then activate that version. Editing an active template creates a new version so earlier issued documents retain their original template reference.

### Security boundary

The Ghawthani tables have RLS enabled and grant no direct access to `anon` or `authenticated`. Eligibility is generated in PostgreSQL from the three attendance booleans; the browser cannot supply it. Submission access uses a per-attempt secret token whose hash is stored, while admin actions require a four-hour HMAC-signed server token. The service-role key is used only inside Edge Functions and the one-time seed command.

The legacy course/exam tables still retain their original permissive policies. The dashboard login is now checked by the server-side Ghawthani admin function, but a future migration should also move legacy course and exam mutations behind authenticated server endpoints.
