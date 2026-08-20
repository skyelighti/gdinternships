# gdinternships

A tracker for **game design and game programming internships** (Summer 2027 cycle),
built for a single person's job search. It:

- Displays every tracked internship/program as a filterable card grid on a static site
  (GitHub Pages).
- Runs a scheduled [GitHub Action](.github/workflows/check-internships.yml) once a day
  that re-checks each listing's application/careers page and flips its status from
  **Watching** to **Open** when it detects the role has likely gone live.
- Emails a digest via [Resend](https://resend.com) whenever a listing newly flips to
  **Open**.

The seed data (`data/internships.json`) combines a manually curated Trello board with
additional research into credible US game studios (AAA, indie, and nonprofit/community
programs).

## How "open" detection works (and its limits)

There's no universal API for "is this internship open right now," so the checker uses a
heuristic: it fetches each listing's primary URL and looks for the word "intern" alongside
a season/year token (e.g. "2027"), while checking for negative phrases like "no longer
accepting applications" or "no open positions." This is **best-effort, not authoritative**.
Always confirm directly on the company's site before treating a role as open or closed.
Generic "careers" landing pages (as opposed to a specific job posting URL) are especially
prone to false negatives/positives — swap in a direct job-posting URL for `primaryUrl` in
`data/internships.json` whenever one becomes available for more accurate tracking.

## Project layout

```
data/internships.json      # single source of truth for all tracked listings
index.html / styles.css / app.js   # static site (GitHub Pages) that reads the JSON
scripts/check-internships.mjs      # the scheduled checker
scripts/send-email.mjs             # Resend email sending
.github/workflows/check-internships.yml  # daily cron + manual trigger
```

## One-time setup

### 1. Enable GitHub Pages
Repo Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.
The site will be live at `https://skyelighti.github.io/gdinternships/`.

### 2. Create a Resend account and API key
1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month).
2. Create an API key under **API Keys**.
3. (Optional but recommended) verify a sending domain under **Domains** so email doesn't
   land in spam. Without a verified domain, the default `onboarding@resend.dev` sender
   works but is rate-limited and less deliverable.

### 3. Add GitHub Actions secrets
Repo Settings → Secrets and variables → Actions → **New repository secret**:

| Secret name       | Value                                                  |
|--------------------|--------------------------------------------------------|
| `RESEND_API_KEY`   | the API key from Resend                                 |
| `TO_EMAIL`         | the email address that should receive alerts            |
| `FROM_EMAIL`       | *(optional)* e.g. `gdinternships <alerts@yourdomain.com>` — defaults to `onboarding@resend.dev` |

### 4. Test it
Actions tab → "Check internship listings" → **Run workflow** to trigger it manually
instead of waiting for the daily 13:00 UTC schedule.

## Adding or editing listings

Edit `data/internships.json` directly (or add entries) — each item looks like:

```json
{
  "id": "unique-slug",
  "program": "Display name",
  "category": "aaa | indie | design | game-tech | first-year | general-swe | research",
  "target": "Summer 2027",
  "primaryUrl": "https://.../careers-or-job-posting",
  "links": ["https://...", "..."],
  "trackingStatus": "watching",
  "lastChecked": null,
  "lastChanged": null
}
```

New entries should start with `"trackingStatus": "watching"` and `"lastChecked": null` —
the next scheduled run will pick them up.

## Local development

```bash
# serve the static site locally
npx serve .

# run the checker locally (won't send email unless RESEND_API_KEY / TO_EMAIL are set)
node scripts/check-internships.mjs
```
