import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { classifyDegreeLevel } from "./lib/degree-level.mjs";
import { classifyRegion } from "./lib/location.mjs";

const EXCEPTIONS_PATH = new URL("../data/location-exceptions.json", import.meta.url);

function slugifyId(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildPrompt(existingCompanies, locationExceptions) {
  return `You are helping maintain a tracker of credible game design and game programming internships for the Summer 2027 hiring cycle, for an undergraduate student in the US.

Already tracked (do NOT suggest these again): ${existingCompanies.join(", ")}.

Use web search to find NEW credible internship or structured early-career programs (game design and/or game programming specifically, not general unrelated SWE) that are not in the list above. Prioritize:
- Real studios/publishers with a verifiable track record (shipped titles, funding, or public-company status) — skip anything you can't verify has a real internship pathway.
- A mix of AAA, indie, and nonprofit/community programs if you find credible ones.
- Location/language: the candidate speaks English and (mainland) Chinese, not other languages. ONLY include opportunities based in (or remote-eligible from) an English-speaking region (US, UK, Canada, Australia, Ireland, Singapore) or mainland China. Do NOT include roles based in Taiwan, Hong Kong, Japan, Korea, continental Europe, or elsewhere where the working language would likely be neither English nor Chinese — even if the company itself is notable.${locationExceptions.length ? ` Manual exceptions that are always allowed regardless: ${locationExceptions.join(", ")}.` : ""}
- Degree level: ONLY include internships open to undergraduates (bachelor's students). Skip anything that requires being a current Master's or PhD student, unless it's explicitly open to undergrads too.

For each one you find, verify it currently has SOME evidence of an internship program (even if between cycles / seasonally closed right now) — don't include studios with no internship history at all.

Aim for 5-15 solid new entries — quality over quantity. It's fine to return fewer if you can't verify more.

When you're done searching, respond with ONLY a fenced json code block (no other prose after it) containing a JSON array. Each object must have these fields:
{
  "company": string,
  "program": string (display name, e.g. "Naughty Dog — Programming Internship"),
  "category": one of "aaa" | "indie" | "design" | "nonprofit" | "game-tech",
  "focusType": one of "game-programming" | "game-design" | "both",
  "target": "Summer 2027",
  "postingWindow": string or null (when postings typically appear),
  "eligibility": string or null,
  "focus": string or null (what the role/program covers),
  "fit": string (1 sentence credibility note — why this is a real, credible opportunity),
  "primaryUrl": string (the specific job posting or internship program page URL, not just a homepage),
  "links": [string] (primaryUrl plus any other relevant URLs),
  "degreeLevel": "undergrad" (only use "grad" if you genuinely could not avoid it — you should have already filtered these out),
  "region": "us" | "zh" | "international" (be honest — the language-region filter above is also re-checked in code, but tell the truth here; "us" covers any English-speaking region, "zh" covers Chinese-speaking regions)
}`;
}

// Calls the Anthropic API with the web search server tool to find NEW
// internship/program listings not already in the tracked dataset. Returns an
// array of raw candidate objects (not yet merged/deduped against existing data).
export async function discoverClaude(existingInternships) {
  const client = new Anthropic();
  const existingCompanies = [...new Set(existingInternships.map((i) => i.company))];
  const locationExceptions = await readFile(EXCEPTIONS_PATH, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => []);

  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 20 }],
    output_config: { effort: "high" },
    messages: [{ role: "user", content: buildPrompt(existingCompanies, locationExceptions) }],
  });

  const response = await stream.finalMessage();
  const textBlocks = response.content.filter((b) => b.type === "text");
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? "";

  const fenced = finalText.match(/```json\s*([\s\S]*?)```/);
  const bare = finalText.match(/\[[\s\S]*\]/);
  const jsonStr = fenced ? fenced[1] : bare ? bare[0] : null;

  if (!jsonStr) {
    console.error("Claude discovery: no JSON block found in response. Raw text:", finalText.slice(0, 500));
    return [];
  }

  let candidates;
  try {
    candidates = JSON.parse(jsonStr);
  } catch (err) {
    console.error(`Claude discovery: failed to parse JSON: ${err.message}`);
    return [];
  }

  const existingIds = new Set(existingInternships.map((i) => i.id));
  const existingCompanyNames = new Set(existingCompanies.map((c) => c.toLowerCase()));
  const exceptionsLower = new Set(locationExceptions.map((c) => c.toLowerCase()));
  const now = new Date().toISOString();

  const found = [];
  for (const c of candidates) {
    if (!c.company || !c.primaryUrl) continue;
    if (existingCompanyNames.has(c.company.toLowerCase())) continue;
    const id = slugifyId(c.company + "-" + (c.program || ""));
    if (existingIds.has(id)) continue;

    // Defense in depth: re-check region/degree in code rather than trusting
    // Claude's self-report alone, since the prompt instruction can slip.
    const region =
      c.region === "us" || c.region === "zh"
        ? c.region
        : classifyRegion({
            company: c.company,
            program: c.program,
            locationText: [c.eligibility, c.focus, c.postingWindow].filter(Boolean).join(" "),
          });
    const isException = exceptionsLower.has(c.company.toLowerCase());
    if (region === "international" && !isException) continue;

    const degreeLevel =
      c.degreeLevel === "grad"
        ? "grad"
        : classifyDegreeLevel([c.eligibility, c.focus].filter(Boolean).join(" "));
    if (degreeLevel === "grad") continue;

    existingIds.add(id);
    found.push({
      id,
      company: c.company,
      program: c.program || c.company,
      tag: "DISCOVERED • CLAUDE SEARCH",
      category: c.category || "indie",
      focusType: c.focusType || "both",
      target: c.target || "Summer 2027",
      postingWindow: c.postingWindow || null,
      eligibility: c.eligibility || null,
      focus: c.focus || null,
      statusNote: null,
      fit: c.fit || null,
      links: Array.isArray(c.links) && c.links.length ? c.links : [c.primaryUrl],
      primaryUrl: c.primaryUrl,
      trackingStatus: "watching",
      lastChecked: null,
      lastChanged: null,
      addedAt: now.slice(0, 10),
      discoveredBy: "claude-web-search",
      degreeLevel,
      region,
    });
  }
  return found;
}
