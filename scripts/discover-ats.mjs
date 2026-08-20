import { readFile } from "node:fs/promises";
import { classifyDegreeLevel } from "./lib/degree-level.mjs";
import { classifyRegion } from "./lib/location.mjs";

const WATCHLIST_PATH = new URL("../data/ats-watchlist.json", import.meta.url);
const EXCEPTIONS_PATH = new URL("../data/location-exceptions.json", import.meta.url);
const TIMEOUT_MS = 15_000;
const INTERN_WORD_RE = /\bintern(?:ship)?s?\b/i;

// These studios' boards list every department's interns, not just game
// design/programming ones — filter out clearly unrelated tracks so the
// tracker doesn't fill up with e.g. "Tax Intern" or "Brand Intern" postings.
const IRRELEVANT_TITLE_RE =
  /\b(tax|brand|creative strategy|social media|marketing|human resources|hr\b|recruiting|talent acquisition|legal|finance|accounting|payroll|sales|business development|communications|public relations)\b/i;

function slugifyId(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGreenhouseJobs(slug) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  return (data.jobs || []).map((j) => ({
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name || null,
    content: j.content || null,
  }));
}

async function fetchLeverJobs(slug) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return (data || []).map((j) => ({
    title: j.text,
    url: j.hostedUrl,
    location: j.categories?.location || null,
    content: j.descriptionPlain || j.description || null,
  }));
}

async function fetchAshbyJobs(slug) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return (data.jobs || []).map((j) => ({
    title: j.title,
    url: j.jobUrl || j.applyUrl,
    location: j.location || j.locationName || null,
    content: j.descriptionPlain || null,
  }));
}

const FETCHERS = {
  greenhouse: fetchGreenhouseJobs,
  lever: fetchLeverJobs,
  ashby: fetchAshbyJobs,
};

// Scans a fixed watchlist of studios' public ATS job-board APIs (Greenhouse,
// Lever, Ashby — no auth required) for live internship postings. Anything
// found here is an authoritative, currently-open listing straight from the
// employer's own job board, not a heuristic guess.
export async function discoverAts(existingInternships) {
  const watchlist = JSON.parse(await readFile(WATCHLIST_PATH, "utf8"));
  const exceptions = await readFile(EXCEPTIONS_PATH, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => []);
  const exceptionsLower = new Set(exceptions.map((c) => c.toLowerCase()));

  const existingUrls = new Set(existingInternships.flatMap((i) => i.links || []));
  const existingIds = new Set(existingInternships.map((i) => i.id));

  const found = [];
  for (const entry of watchlist) {
    const fetcher = FETCHERS[entry.provider];
    if (!fetcher) {
      console.error(`Unknown ATS provider "${entry.provider}" for ${entry.company}`);
      continue;
    }
    try {
      const jobs = await fetcher(entry.slug);
      const internJobs = jobs.filter(
        (j) => j.title && j.url && INTERN_WORD_RE.test(j.title) && !IRRELEVANT_TITLE_RE.test(j.title)
      );
      for (const job of internJobs) {
        if (existingUrls.has(job.url)) continue;
        const id = slugifyId(`${entry.company}-${job.title}`);
        if (existingIds.has(id)) continue;
        existingIds.add(id);

        const region = classifyRegion({ company: entry.company, title: job.title, locationText: job.location });
        const isException = exceptionsLower.has(entry.company.toLowerCase());
        if (region === "international" && !isException) continue;

        const degreeLevel = classifyDegreeLevel([job.title, job.content].filter(Boolean).join(" "));

        found.push({
          id,
          company: entry.company,
          program: job.title,
          tag: "ATS BOARD • LIVE POSTING",
          category: entry.category || "aaa",
          focusType: "game-programming",
          target: "Summer 2027",
          postingWindow: "live posting found via employer job board API.",
          eligibility: null,
          focus: job.location ? `Location: ${job.location}` : null,
          statusNote: null,
          fit: `Discovered via ${entry.company}'s public ${entry.provider} job board.`,
          links: [job.url],
          primaryUrl: job.url,
          trackingStatus: "open",
          lastChecked: new Date().toISOString(),
          lastChanged: new Date().toISOString(),
          addedAt: new Date().toISOString().slice(0, 10),
          discoveredBy: "ats-scan",
          degreeLevel,
          region,
        });
      }
    } catch (err) {
      console.error(`ATS scan failed for ${entry.company} (${entry.provider}/${entry.slug}): ${err.message}`);
    }
  }
  return found;
}
