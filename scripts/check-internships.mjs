import { readFile, writeFile } from "node:fs/promises";
import { sendDigestEmail } from "./send-email.mjs";

const DATA_PATH = new URL("../data/internships.json", import.meta.url);
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; gdinternships-tracker/1.0; +https://github.com/skyelighti/gdinternships)";

const NEGATIVE_SIGNALS = [
  "no longer accepting applications",
  "position has been filled",
  "no open positions",
  "no current openings",
  "currently no openings",
  "no results found",
  "0 jobs found",
  "no jobs found",
  "no matching jobs",
  "job not found",
  "posting has expired",
  "this job is no longer",
];

function seasonTokens(target) {
  // "Summer 2027" -> ["2027", "summer 2027"]
  const year = (target.match(/\d{4}/) || [])[0];
  const tokens = [];
  if (year) tokens.push(year.toLowerCase());
  tokens.push(target.toLowerCase());
  return tokens;
}

// Very rough tag/script/style stripping so word-proximity checks operate on
// roughly what a human would read, not raw markup where unrelated words can
// sit adjacent in the source but far apart visually (or vice versa).
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

const INTERN_WORD_RE = /\bintern(?:ship)?s?\b/gi;
const PROXIMITY_WINDOW = 300; // chars on each side of an "intern" match

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

// Requires a real word-boundary "intern(ship)?" occurrence with a season/year
// token — and an optional program-specific matchTerm — nearby in the visible
// text, not just anywhere on the page. This avoids matching unrelated words
// like "international"/"internal"/"internet", and avoids treating a page that
// merely mentions interns somewhere unrelated (e.g. a footer link to a
// different program) as evidence *this* program is open.
function detectOpen(html, target, matchTerm) {
  const lower = html.toLowerCase();
  if (NEGATIVE_SIGNALS.some((s) => lower.includes(s))) return false;

  const text = stripHtml(html).toLowerCase();
  const tokens = seasonTokens(target);
  // matchTerm may be "term1|term2|..." — any alternative counts as a match.
  const matchTermAlternatives = matchTerm
    ? matchTerm.toLowerCase().split("|").map((t) => t.trim())
    : null;

  let match;
  INTERN_WORD_RE.lastIndex = 0;
  while ((match = INTERN_WORD_RE.exec(text)) !== null) {
    const start = Math.max(0, match.index - PROXIMITY_WINDOW);
    const end = Math.min(text.length, match.index + PROXIMITY_WINDOW);
    const window = text.slice(start, end);

    const hasSeason = tokens.some((t) => window.includes(t));
    if (!hasSeason) continue;
    if (matchTermAlternatives && !matchTermAlternatives.some((t) => window.includes(t))) continue;
    return true;
  }
  return false;
}

async function checkOne(item) {
  const url = item.primaryUrl;
  const now = new Date().toISOString();
  if (!url) return { ...item, lastChecked: now };

  try {
    const { ok, status, text } = await fetchWithTimeout(url);
    const nowChecked = { ...item, lastChecked: now };

    if (!ok && (status === 404 || status === 410)) {
      // Page gone — leave status as-is, just record the check.
      return nowChecked;
    }

    const isOpenNow = detectOpen(text, item.target || "Summer 2027", item.matchTerm);
    if (isOpenNow && item.trackingStatus !== "open") {
      return { ...nowChecked, trackingStatus: "open", lastChanged: now };
    }
    if (!isOpenNow && item.trackingStatus === "open") {
      // Heuristic no longer matches — likely closed again. Don't email, just revert.
      return { ...nowChecked, trackingStatus: "watching", lastChanged: now };
    }
    return nowChecked;
  } catch (err) {
    console.error(`Check failed for ${item.program} (${url}): ${err.message}`);
    return { ...item, lastChecked: now };
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let index = 0;
  async function next() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

async function main() {
  const raw = await readFile(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  const updated = await runPool(data.internships, checkOne, CONCURRENCY);

  const newlyOpened = updated.filter(
    (item, i) => item.trackingStatus === "open" && data.internships[i].trackingStatus !== "open"
  );

  const out = {
    updatedAt: new Date().toISOString(),
    source: data.source,
    internships: updated,
  };

  await writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Checked ${updated.length} internships. ${newlyOpened.length} newly open.`);

  if (newlyOpened.length > 0) {
    try {
      await sendDigestEmail(newlyOpened);
    } catch (err) {
      // Don't let an email failure discard the data update above — log and exit 0.
      console.error(`Email send failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
