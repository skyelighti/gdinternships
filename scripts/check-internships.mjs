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

function detectOpen(html, target) {
  const lower = html.toLowerCase();
  if (NEGATIVE_SIGNALS.some((s) => lower.includes(s))) return false;
  const hasIntern = lower.includes("intern");
  const tokens = seasonTokens(target);
  const hasSeason = tokens.some((t) => lower.includes(t));
  return hasIntern && hasSeason;
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

    const isOpenNow = detectOpen(text, item.target || "Summer 2027");
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
    await sendDigestEmail(newlyOpened);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
