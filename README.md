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
- Runs a second scheduled [GitHub Action](.github/workflows/discover-internships.yml)
  weekly that looks for internships/programs *not yet in the tracker* — via a free scan
  of known studios' public job-board APIs, and (optionally) a Claude web-search pass that
  searches the open web for new credible programs — and emails a separate digest when it
  finds any.

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

## How discovery works (and its limits)

Two independent, free-to-run mechanisms look for internships not already in the tracker,
combined in `scripts/discover.mjs` and run weekly:

- **ATS job-board scan** (`scripts/discover-ats.mjs`, no API key needed): a fixed
  watchlist in `data/ats-watchlist.json` of studios known to use Greenhouse, Lever, or
  Ashby lists their public job-board API for live "intern" postings. Anything found this
  way is added with `"trackingStatus": "open"` immediately, since it's a live posting
  straight from the employer's own board — not a heuristic. This only ever finds openings
  at studios already on the watchlist; add more `{company, provider, slug}` entries to
  `data/ats-watchlist.json` as you learn them.
- **Claude web search** (`scripts/discover-claude.mjs`, requires `ANTHROPIC_API_KEY`):
  calls the Anthropic API with the web search tool to search the open web for new credible
  studios/programs, given the existing tracked list so it can avoid duplicates. This is
  the only mechanism that can find a genuinely new studio you haven't heard of, but it
  costs a small amount of API usage per run and its picks are model judgment, not a
  guarantee — added as `"trackingStatus": "watching"` for you to sanity-check. If
  `ANTHROPIC_API_KEY` isn't set, this step is skipped and only the free ATS scan runs.

## Project layout

```
data/internships.json      # single source of truth for all tracked listings
data/ats-watchlist.json    # studios scanned by the free ATS discovery mechanism
index.html / styles.css / app.js   # static site (GitHub Pages) that reads the JSON
scripts/check-internships.mjs      # the daily status checker
scripts/discover.mjs               # the weekly discovery orchestrator
scripts/discover-ats.mjs           # free Greenhouse/Lever/Ashby job-board scan
scripts/discover-claude.mjs        # Claude API web-search discovery
scripts/send-email.mjs             # Resend email sending
.github/workflows/check-internships.yml     # daily cron + manual trigger
.github/workflows/discover-internships.yml  # weekly cron + manual trigger
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
| `ANTHROPIC_API_KEY` | *(optional)* an API key from [console.anthropic.com](https://console.anthropic.com) — enables the Claude web-search half of weekly discovery. Without it, the free ATS job-board scan still runs on its own. |

### 4. Test it
Actions tab → pick a workflow ("Check internship listings" or "Discover new internship
listings") → **Run workflow** to trigger it manually instead of waiting for its schedule
(daily 13:00 UTC for the checker, weekly Monday 12:00 UTC for discovery).

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
