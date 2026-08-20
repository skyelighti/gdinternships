import { readFile, writeFile } from "node:fs/promises";
import { discoverAts } from "./discover-ats.mjs";
import { discoverClaude } from "./discover-claude.mjs";
import { sendDiscoveryEmail } from "./send-email.mjs";

const DATA_PATH = new URL("../data/internships.json", import.meta.url);

async function main() {
  const raw = await readFile(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  const atsFound = await discoverAts(data.internships).catch((err) => {
    console.error(`ATS discovery failed: ${err.message}`);
    return [];
  });
  console.log(`ATS scan: ${atsFound.length} new listing(s).`);

  let claudeFound = [];
  if (process.env.ANTHROPIC_API_KEY) {
    claudeFound = await discoverClaude([...data.internships, ...atsFound]).catch((err) => {
      console.error(`Claude discovery failed: ${err.message}`);
      return [];
    });
    console.log(`Claude web search: ${claudeFound.length} new listing(s).`);
  } else {
    console.log("Skipping Claude web search discovery: ANTHROPIC_API_KEY not set.");
  }

  const allNew = [...atsFound, ...claudeFound];
  if (allNew.length === 0) {
    console.log("Discovery: no new listings found this run.");
    return;
  }

  data.internships.push(...allNew);
  data.updatedAt = new Date().toISOString();
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`Discovery: added ${allNew.length} new listing(s) total.`);

  try {
    await sendDiscoveryEmail(allNew);
  } catch (err) {
    console.error(`Discovery email failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
