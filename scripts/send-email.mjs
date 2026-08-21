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

function rowsWithDayCount(items) {
  return items
    .map((item) => {
      const daysOpen = item.lastChanged
        ? Math.floor((Date.now() - new Date(item.lastChanged).getTime()) / (24 * 60 * 60 * 1000)) + 1
        : 1;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${escapeHtml(item.program)}</strong><br/>
            <span style="color:#666;font-size:13px;">${escapeHtml(item.category)}</span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <a href="${item.primaryUrl}">${escapeHtml(item.primaryUrl)}</a></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;">Day ${daysOpen} of 7</td>
        </tr>`;
    })
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

// items: everything currently "open" and opened within the last 7 days.
// newlyOpenedIds: the subset that just flipped open today (Set of ids) — used
// to split the email into a "new today" section and a "reminder" section.
// Anything whose lastChanged ages past 7 days simply won't be in `items` on a
// later run, so it stops appearing in the email on its own — the listing
// itself stays "open" on the site, only the reminder emails stop.
export async function sendDigestEmail(items, newlyOpenedIds = new Set()) {
  if (items.length === 0) return;

  const newToday = items.filter((i) => newlyOpenedIds.has(i.id));
  const reminders = items.filter((i) => !newlyOpenedIds.has(i.id));

  const sections = [
    newToday.length
      ? `<h3>🆕 New today (${newToday.length})</h3>
         <table style="border-collapse:collapse;width:100%;">${rowsFor(newToday)}</table>`
      : "",
    reminders.length
      ? `<h3>⏰ Still open — daily reminder for up to 7 days (${reminders.length})</h3>
         <table style="border-collapse:collapse;width:100%;">${rowsWithDayCount(reminders)}</table>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `
    <h2>🎮 Open internship listings</h2>
    ${sections}
    <p style="margin-top:16px;color:#666;font-size:13px;">
      Detection is a best-effort heuristic based on scanning each careers page — always confirm on the
      company site before assuming applications are live. Reminders stop automatically 7 days after a
      listing first opened; the site keeps tracking it as open regardless.
    </p>`;

  await sendViaResend({
    subject: newToday.length
      ? `🎮 ${newToday.length} new game internship listing${newToday.length > 1 ? "s" : ""} open`
      : `🎮 Reminder: ${reminders.length} internship listing${reminders.length > 1 ? "s" : ""} still open`,
    html,
  });
  console.log(`Email sent: ${newToday.length} new, ${reminders.length} reminder(s).`);
}

// Sent when a refresh finds no newly-opened listings, so the day doesn't go
// by silently. openItems: everything currently tracked as "open" (regardless
// of how long ago it opened). expiringItems: the subset that's about to age
// out of the 7-day "new/reminder" digest window (still open on the site, but
// this tracker will stop reminding about it soon).
export async function sendRecapEmail(openItems, expiringItems = []) {
  if (openItems.length === 0) return;

  const expiringIds = new Set(expiringItems.map((i) => i.id));
  const stillOpen = openItems.filter((i) => !expiringIds.has(i.id));

  const sections = [
    expiringItems.length
      ? `<h3>⌛ Expiring from reminders soon (${expiringItems.length})</h3>
         <table style="border-collapse:collapse;width:100%;">${rowsWithDayCount(expiringItems)}</table>`
      : "",
    stillOpen.length
      ? `<h3>✅ Currently open (${stillOpen.length})</h3>
         <table style="border-collapse:collapse;width:100%;">${rowsFor(stillOpen)}</table>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `
    <h2>🎮 No new listings this refresh — recap</h2>
    <p style="color:#666;font-size:13px;">Nothing new opened since the last check. Here's what's still open right now.</p>
    ${sections}
    <p style="margin-top:16px;color:#666;font-size:13px;">
      Detection is a best-effort heuristic based on scanning each careers page — always confirm on the
      company site before assuming applications are live. "Expiring from reminders soon" means this
      listing is about to fall out of the 7-day new/reminder digest, not that the posting itself is closing.
    </p>`;

  await sendViaResend({
    subject: `🎮 Recap: ${openItems.length} internship listing${openItems.length > 1 ? "s" : ""} open, nothing new`,
    html,
  });
  console.log(`Recap email sent: ${openItems.length} open, ${expiringItems.length} expiring soon.`);
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
