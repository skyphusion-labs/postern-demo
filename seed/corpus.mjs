// The demo seed corpus (postern#837). Every message is SYNTHETIC: the people, companies,
// orders, invoices and codes below are invented for the public demo and identify nobody.
// scripts/seed.mjs sends these, in order, through Cloudflare Email Sending to addresses on
// the demo domain, so each one arrives through the real inbound path (Email Routing, then
// the Worker email() handler, then ingest, FTS and Vectorize).
//
// Rules the validator in scripts/seed.mjs enforces:
// - `key` is unique, and a `parent` names an EARLIER key (a reply threads onto it).
// - every `from` and `to` address is on SEED_DOMAIN (Email Sending only sends from an
//   onboarded domain, and Email Routing only delivers to the demo zone).
// - (from address, subject) pairs may repeat only inside one thread; the seeder tells
//   copies apart by their order.
// - no em-dash or en-dash anywhere.

export const SEED_VERSION = "v1";
export const SEED_DOMAIN = "posternonline.com";
export const SEED_TO = `demo@${SEED_DOMAIN}`;

export const FOOTER =
  "\n\n--\nSynthetic message seeded into the public postern demo. The people and companies in it are invented.";

const ME = { address: SEED_TO, name: "Demo Mailbox" };
const RELAY = { address: `relay.agent@${SEED_DOMAIN}`, name: "Relay (ops agent)" };
const DIGEST = { address: `digest.agent@${SEED_DOMAIN}`, name: "Inbox Digest Agent" };
const RESEARCH = { address: `research.agent@${SEED_DOMAIN}`, name: "Research Agent" };
const ALEX = { address: `alex.example@${SEED_DOMAIN}`, name: "Alex Example" };
const JORDAN = { address: `jordan.example@${SEED_DOMAIN}`, name: "Jordan Example" };
const BILLING = { address: `billing.examplecloud@${SEED_DOMAIN}`, name: "Example Cloud Billing" };
const SUPPORT = { address: `support.examplenotes@${SEED_DOMAIN}`, name: "Example Notes Support" };
const ACCOUNTS = { address: `accounts.examplenotes@${SEED_DOMAIN}`, name: "Example Notes" };
const NEWS = { address: `weekly.examplepost@${SEED_DOMAIN}`, name: "The Example Weekly" };
const SHOP = { address: `orders.exampleshop@${SEED_DOMAIN}`, name: "Example Shop" };
const CAL = { address: `calendar.example@${SEED_DOMAIN}`, name: "Example Calendar" };

// A minimal valid one-page PDF, built at load time, so the invoice carries a real file.
const pdf = (() => {
  const text = "Example Cloud Hosting  Invoice INV-2026-0117  Total due USD 48.00  (synthetic demo invoice)";
  const stream = `BT /F1 11 Tf 40 760 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
})();

const ics = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//postern-demo//seed//EN",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:design-review-seed-v1@posternonline.com",
  "DTSTAMP:20261110T150000Z",
  "DTSTART:20261112T200000Z",
  "DTEND:20261112T204500Z",
  "SUMMARY:Design review: webmail thread view",
  "ORGANIZER;CN=Jordan Example:mailto:jordan.example@posternonline.com",
  "ATTENDEE;CN=Demo Mailbox;RSVP=TRUE:mailto:demo@posternonline.com",
  "DESCRIPTION:Walk through the thread view and the search panel. Synthetic demo invite.",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const att = (filename, type, content) => ({ filename, type, content, disposition: "attachment" });

const LONG = "Moving the build cache to R2";
const TICKET = "Ticket 4821: CSV export times out on large notebooks";
const INVOICE = "Invoice INV-2026-0117 from Example Cloud Hosting";
const INVITE = "Invitation: Design review, Thu 12 Nov 15:00 ET";
const NOTES = "Notes from Tuesday planning";
const HANDOFF = "Handoff: research summary on retry queues";
const SHIPPED = "Your order EX-1042 has shipped";

export const MESSAGES = [
  // --- The long thread: a human and an ops agent plan a migration (8 messages). ---
  { key: "cache-1", from: ALEX, to: SEED_TO, subject: LONG,
    text: "Hi all,\n\nThe build cache on the old volume is at 91 percent and the nightly job failed twice this week. I want to move it to an R2 bucket before the next release.\n\nRelay, can you draft a plan: bucket name, lifecycle rule, and how we cut over without losing the warm cache?\n\nAlex" },
  { key: "cache-2", parent: "cache-1", from: RELAY, to: ALEX.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Draft plan:\n\n1. Create bucket build-cache-r2 with a 30 day lifecycle rule on objects under tmp/.\n2. Dual-write for one week: the builder writes to both stores, reads from the old one.\n3. Flip reads to R2 once the hit rate there matches the old store within 2 percent.\n4. Delete the old volume after a further 7 days with no reads.\n\nEstimated egress cost: zero, R2 has no egress fee. Storage at the current 180 GB is about USD 2.70 a month.\n\nRelay" },
  { key: "cache-3", parent: "cache-2", from: ALEX, to: RELAY.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Looks good. One change: keep the lifecycle rule at 14 days, not 30. Our builds rarely reuse anything older than a week.\n\nWho owns the dual-write flag?" },
  { key: "cache-4", parent: "cache-3", from: RELAY, to: ALEX.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Changed to 14 days. I will own the dual-write flag and report the hit rate daily in the digest. The flag is CACHE_DUAL_WRITE in the builder config, off by default." },
  { key: "cache-5", parent: "cache-4", from: JORDAN, to: ALEX.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Jumping in from the release side. Can we hold the read flip until after Thursday? The release candidate builds Wednesday night and I would rather not change the cache under it." },
  { key: "cache-6", parent: "cache-5", from: ALEX, to: JORDAN.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Agreed. Dual-write starts today, the read flip waits until Friday morning. Relay, please put the Friday flip on the calendar." },
  { key: "cache-7", parent: "cache-6", from: RELAY, to: ALEX.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Dual-write is on. First hour: 1,204 objects written to R2, 0 write errors. The Friday 09:00 read flip is booked. I will roll back by turning CACHE_DUAL_WRITE off if the error rate passes 0.5 percent." },
  { key: "cache-8", parent: "cache-7", from: JORDAN, to: RELAY.address, cc: SEED_TO, subject: `Re: ${LONG}`,
    text: "Release candidate built clean overnight with dual-write on. Thanks both. Go ahead with the flip on Friday." },

  // --- A support thread with replies (4). ---
  { key: "ticket-1", from: ME, to: SUPPORT.address, subject: TICKET,
    text: "Hello,\n\nExporting a notebook with about 3,000 pages to CSV times out after 60 seconds. Smaller notebooks export fine. Is there a size limit?\n\nThanks" },
  { key: "ticket-2", parent: "ticket-1", from: SUPPORT, to: SEED_TO, subject: `Re: ${TICKET}`,
    text: "Thanks for the report. Exports run in one request today, so a very large notebook can hit the 60 second limit. As a workaround, export by section (Export, then Choose sections). We are moving large exports to a background job." },
  { key: "ticket-3", parent: "ticket-2", from: ME, to: SUPPORT.address, subject: `Re: ${TICKET}`,
    text: "The per-section export works. Please let me know when the background job ships." },
  { key: "ticket-4", parent: "ticket-3", from: SUPPORT, to: SEED_TO, subject: `Re: ${TICKET}`,
    text: "Background exports are live. A large export now emails you a download link when it is ready. Closing this ticket; reply to reopen it." },

  // --- An agent's daily digests (3). ---
  { key: "digest-1", from: DIGEST, to: SEED_TO, subject: "Morning digest: 4 items need you",
    text: "Good morning. Since yesterday evening:\n\n- Needs a reply: Jordan asked to hold the cache read flip until after Thursday.\n- Bill: Example Cloud invoice INV-2026-0117, USD 48.00, due in 14 days.\n- Calendar: design review invite for Thursday 15:00 ET, not yet answered.\n- FYI: Example Notes support replied on the CSV export ticket.\n\nNothing urgent overnight." },
  { key: "digest-2", from: DIGEST, to: SEED_TO, subject: "Midday digest: 2 items",
    text: "Midday update:\n\n- The cache dual-write is on; Relay reports 0 write errors in the first hour.\n- A new sign-in to Example Notes from a new browser. If that was not you, reset your password.\n\nNo new bills." },
  { key: "digest-3", from: DIGEST, to: SEED_TO, subject: "End of day digest: all clear",
    text: "End of day:\n\n- Answered: the design review invite (accepted).\n- Shipped: order EX-1042, arriving Friday.\n- Open: the invoice is filed and scheduled for payment.\n\nAll clear. The next digest arrives at 07:00." },

  // --- A vendor invoice with a PDF attachment, and the agent filing it (2). ---
  { key: "invoice-1", from: BILLING, to: SEED_TO, subject: INVOICE,
    text: "Your invoice for October is attached.\n\nInvoice: INV-2026-0117\nPeriod: 1 to 31 October 2026\nTotal due: USD 48.00\nDue date: 24 November 2026\n\nThis is a synthetic demo invoice; there is nothing to pay.",
    attachments: [att("INV-2026-0117.pdf", "application/pdf", pdf)] },
  { key: "invoice-2", parent: "invoice-1", from: RELAY, to: SEED_TO, subject: `Re: ${INVOICE}`,
    text: "Filed under Bills/2026-10. The amount matches the October usage report (USD 48.00). Payment is scheduled for 20 November." },

  // --- A newsletter, two issues (2). ---
  { key: "news-41", from: NEWS, to: SEED_TO, subject: "The Example Weekly, issue 41: quiet inboxes",
    headers: { "List-Id": "The Example Weekly <weekly.examplepost.posternonline.com>", "Precedence": "list" },
    text: "This week: why an inbox an agent can read should still belong to a person. Three habits for quieter mail: batch your notifications, let filters file receipts, and keep one address for each purpose.",
    html: "<h1>The Example Weekly</h1><h2>Issue 41: quiet inboxes</h2><p>This week: why an inbox an agent can read should still belong to a person.</p><ul><li>Batch your notifications.</li><li>Let filters file receipts.</li><li>Keep one address for each purpose.</li></ul>" },
  { key: "news-42", from: NEWS, to: SEED_TO, subject: "The Example Weekly, issue 42: search that understands you",
    headers: { "List-Id": "The Example Weekly <weekly.examplepost.posternonline.com>", "Precedence": "list" },
    text: "This week: keyword search finds the word you typed; semantic search finds the idea you meant. A good mailbox offers both, and lets you see which one answered.",
    html: "<h1>The Example Weekly</h1><h2>Issue 42: search that understands you</h2><p>Keyword search finds the word you typed. Semantic search finds the idea you meant.</p><p>A good mailbox offers both, and lets you see which one answered.</p>" },

  // --- A calendar invite with an .ics file, and the acceptance (2). ---
  { key: "invite-1", from: JORDAN, to: SEED_TO, subject: INVITE,
    text: "You are invited: Design review, webmail thread view.\nThursday 12 November, 15:00 to 15:45 ET.\nThe invite is attached as an .ics file.",
    attachments: [att("invite.ics", "text/calendar", ics)] },
  { key: "invite-2", parent: "invite-1", from: ME, to: JORDAN.address, subject: `Accepted: ${INVITE}`,
    text: "Accepted. See you Thursday." },

  // --- Account notices (2). ---
  { key: "reset-1", from: ACCOUNTS, to: SEED_TO, subject: "Reset your Example Notes password",
    text: "Someone asked to reset the password for this Example Notes account.\n\nYour reset code is 000-000 (a synthetic demo code). It expires in 15 minutes.\n\nIf you did not ask for this, ignore this message; your password has not changed." },
  { key: "signin-1", from: ACCOUNTS, to: SEED_TO, subject: "New sign-in to your Example Notes account",
    text: "We noticed a new sign-in to your account.\n\nBrowser: Firefox on Linux\nLocation: approximate, not shown in the demo\nTime: today\n\nIf this was you, there is nothing to do. If not, reset your password." },

  // --- An agent-to-agent handoff with a Markdown attachment (2). ---
  { key: "handoff-1", from: RESEARCH, to: RELAY.address, cc: SEED_TO, subject: HANDOFF,
    text: "Relay, handing this to you for the builder work. Summary: use exponential backoff with full jitter, cap retries at 6, and send failures to a dead-letter queue after the last try. Details and sources are in the attached notes.",
    attachments: [att("retry-queues.md", "text/markdown",
      "# Retry queues: summary\n\n- Backoff: exponential with full jitter, base 1 s, cap 60 s.\n- Retries: at most 6, then dead-letter.\n- Idempotency: every job carries a key; a retry never repeats a side effect.\n- Alerting: page only when the dead-letter queue grows for 15 minutes.\n\nSynthetic demo notes.\n")] },
  { key: "handoff-2", parent: "handoff-1", from: RELAY, to: RESEARCH.address, cc: SEED_TO, subject: `Re: ${HANDOFF}`,
    text: "Received. I will apply the backoff settings to the cache uploader first, since it is the one that retries most. I will report the dead-letter count in tomorrow's digest." },

  // --- A shipping notice and a follow-up (2). ---
  { key: "ship-1", from: SHOP, to: SEED_TO, subject: SHIPPED,
    text: "Good news: order EX-1042 (1 x USB-C dock) has shipped.\nCarrier: Example Post. Tracking: EXP0000001042.\nEstimated delivery: Friday." },
  { key: "ship-2", parent: "ship-1", from: SHOP, to: SEED_TO, subject: `Re: ${SHIPPED}`,
    text: "Update: order EX-1042 is out for delivery today." },

  // --- Meeting notes, a short thread (3). ---
  { key: "notes-1", from: JORDAN, to: SEED_TO, cc: ALEX.address, subject: NOTES,
    text: "Notes from Tuesday:\n\n- Release candidate builds Wednesday night.\n- Cache read flip moves to Friday.\n- Design review on Thursday covers the thread view and the search panel.\n\nAction items: Alex owns the cache plan, Relay owns the dual-write flag, I own the release." },
  { key: "notes-2", parent: "notes-1", from: ALEX, to: JORDAN.address, cc: SEED_TO, subject: `Re: ${NOTES}`,
    text: "One addition: we agreed to keep the lifecycle rule at 14 days." },
  { key: "notes-3", parent: "notes-2", from: JORDAN, to: ALEX.address, cc: SEED_TO, subject: `Re: ${NOTES}`,
    text: "Added. Thanks." },
];
