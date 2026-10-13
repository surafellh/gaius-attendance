# Gaius Gerji Center – Attendance Follow-up

React (Vite) + Supabase web app replacing the Google Sheet.

- **Attendance** – pick a Sunday (Ethiopian calendar), tap P / A per person, grouped by category; register new comers on the spot.
- **Follow-up** – present last week → absent this week (consistent attenders flagged), absent 2 weeks, absent 3+ weeks, with call buttons.
- **Dashboard** – weekly totals by category, monthly averages, top/bottom rankings, 6-month score for new comers.
- **People** – master list with status per semester (admin edits).
- **Users** – admin approves leaders. The first account created becomes admin.

Setup: run `supabase/schema.sql`, then `supabase/import/import.sql`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
