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
- `VITE_ADMIN_ACCESS_CODE`

These are already present in `.env`.

## Supabase Setup

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. Optionally run `supabase/sample-data.sql` to create a first demo dawra and exam.
4. Start the app and enter the admin area using `VITE_ADMIN_ACCESS_CODE`.

For an existing Supabase project, run `supabase/migrations.sql` to add the profile table, course attachment columns, result visibility setting, and the public `shmoury-assets` storage bucket used by admin uploads.

The current setup intentionally uses a simple predefined admin code in the browser. The SQL policies are permissive so the anon key can create exams and questions. Before using this on a public production site, replace this with Supabase Auth or an Edge Function that validates admin actions server-side.
