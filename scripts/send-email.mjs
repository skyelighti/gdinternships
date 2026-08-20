const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || "gdinternships <onboarding@resend.dev>";

function rowsFor(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${escapeHtml(item.program)}</strong><br/>
            <span style="color:#666;font-size:13px;">${escapeHtml(item.category)}</span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <a href="${item.primaryUrl}">${escapeHtml(item.primaryUrl)}</a></td>
        </tr>`
    )
    .join("");
}

async function sendViaResend({ subject, html }) {
  if (!RESEND_API_KEY || !TO_EMAIL) {
    console.log("Skipping email: RESEND_API_KEY or TO_EMAIL not set.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}

export async function sendDigestEmail(newlyOpened) {
  if (newlyOpened.length === 0) return;

  const html = `
    <h2>🎮 New internship listings detected</h2>
    <p>${newlyOpened.length} listing(s) just flipped from "watching" to "open" on your gdinternships tracker.</p>
    <table style="border-collapse:collapse;width:100%;">${rowsFor(newlyOpened)}</table>
    <p style="margin-top:16px;color:#666;font-size:13px;">
      Detection is a best-effort heuristic based on scanning each careers page — always confirm on the
      company site before assuming applications are live.
    </p>`;

  await sendViaResend({
    subject: `🎮 ${newlyOpened.length} new game internship listing${newlyOpened.length > 1 ? "s" : ""} open`,
    html,
  });
  console.log(`Email sent for ${newlyOpened.length} new listing(s).`);
}

export async function sendDiscoveryEmail(newlyDiscovered) {
  if (newlyDiscovered.length === 0) return;

  const bySource = {
    "ats-scan": newlyDiscovered.filter((i) => i.discoveredBy === "ats-scan"),
    "claude-web-search": newlyDiscovered.filter((i) => i.discoveredBy === "claude-web-search"),
  };

  const sections = [
    bySource["ats-scan"].length
      ? `<h3>Live postings found via employer job boards (${bySource["ats-scan"].length})</h3>
         <table style="border-collapse:collapse;width:100%;">${rowsFor(bySource["ats-scan"])}</table>`
      : "",
    bySource["claude-web-search"].length
      ? `<h3>New programs found via web search (${bySource["claude-web-search"].length})</h3>
         <table style="border-collapse:collapse;width:100%;">${rowsFor(bySource["claude-web-search"])}</table>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `
    <h2>🔎 New internship listings discovered</h2>
    <p>${newlyDiscovered.length} listing(s) not previously in your tracker were found this week and added as
       "watching" (or "open" for confirmed live postings).</p>
    ${sections}
    <p style="margin-top:16px;color:#666;font-size:13px;">
      Review these on the site and remove any that don't look credible — discovery is best-effort.
    </p>`;

  await sendViaResend({
    subject: `🔎 ${newlyDiscovered.length} new internship listing${newlyDiscovered.length > 1 ? "s" : ""} discovered`,
    html,
  });
  console.log(`Discovery email sent for ${newlyDiscovered.length} new listing(s).`);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
