const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || "gdinternships <onboarding@resend.dev>";

export async function sendDigestEmail(newlyOpened) {
  if (!RESEND_API_KEY || !TO_EMAIL) {
    console.log("Skipping email: RESEND_API_KEY or TO_EMAIL not set.");
    return;
  }
  if (newlyOpened.length === 0) return;

  const rows = newlyOpened
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

  const html = `
    <h2>🎮 New internship listings detected</h2>
    <p>${newlyOpened.length} listing(s) just flipped from "watching" to "open" on your gdinternships tracker.</p>
    <table style="border-collapse:collapse;width:100%;">${rows}</table>
    <p style="margin-top:16px;color:#666;font-size:13px;">
      Detection is a best-effort heuristic based on scanning each careers page — always confirm on the
      company site before assuming applications are live.
    </p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `🎮 ${newlyOpened.length} new game internship listing${newlyOpened.length > 1 ? "s" : ""} open`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
  console.log(`Email sent for ${newlyOpened.length} new listing(s).`);
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
