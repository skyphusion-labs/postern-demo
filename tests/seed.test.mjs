// Decision-path tests for scripts/seed.mjs against an in-memory fake of the demo read API and
// of Email Sending. The fake models postern's thread rule (in_reply_to matches a stored
// message_id: inherit its thread; else a new thread). A fake encodes our own assumption, so
// these prove the seeder's logic only; the live run's `verify` is the proof on the artifact.
// Usage: node tests/seed.test.mjs <case>. Exit 0 = pass.
import { MESSAGES, SEED_FROM } from "../seed/corpus.mjs";
import { validate, seed, verify, sendBody, presence } from "../scripts/seed.mjs";

function fakeDemo({ semantic = true } = {}) {
  const rows = [];
  let n = 0;
  const sends = [];
  const send = async (body) => {
    sends.push(body);
    n++;
    const id = `fake-${n}@cf.example`;
    const irt = body.headers?.["In-Reply-To"]?.replace(/[<>]/g, "");
    const parent = irt && rows.find((r) => r.messageId === irt);
    rows.push({
      uid: n, messageId: id, threadId: parent ? parent.threadId : id,
      from: `"${body.from.name}" <${body.from.address}>`, subject: body.subject,
      date: new Date(Date.UTC(2026, 10, 10, 0, 0, n)).toISOString(), text: body.text,
    });
  };
  const get = async (path) => {
    const u = new URL(`https://x${path}`);
    if (u.pathname === "/api/messages") return { ok: true, items: rows.map(({ text, ...r }) => r), cursor: null };
    if (u.pathname === "/api/search") {
      const q = u.searchParams.get("q");
      if (u.searchParams.get("mode") === "semantic") return { ok: true, items: semantic && rows.length ? [rows[0]] : [] };
      return { ok: true, items: rows.filter((r) => r.text.includes(q)) };
    }
    throw new Error(`fake: no route ${path}`);
  };
  return { rows, sends, send, get };
}
const quiet = { sleep: async () => {}, log: () => {}, pollMs: 0 };
const threadsOk = (rows) => {
  const found = presence(MESSAGES, rows);
  const idx = new Map(MESSAGES.map((m, i) => [m.key, i]));
  return MESSAGES.every((m, i) => !m.parent || found[i].threadId === found[idx.get(m.parent)].threadId);
};

const cases = {
  "corpus-valid": async () => validate(MESSAGES).length === 0,
  "validator-catches-bad-corpus": async () => {
    const base = MESSAGES.slice();
    const fwd = [{ ...base[0], key: "x", parent: "later" }, ...base.slice(1)];
    const off = [{ ...base[0], to: "someone@example.com" }, ...base.slice(1)];
    const dash = [{ ...base[0], text: "a \u2014 b" }, ...base.slice(1)];
    const dup = [...base, { ...base[1] }];
    const small = base.slice(0, 5);
    return [fwd, off, dash, dup, small].every((c) => validate(c).length > 0);
  },
  "seeds-empty-mailbox-and-threads": async () => {
    const f = fakeDemo();
    const out = await seed({ messages: MESSAGES, get: f.get, send: f.send, ...quiet });
    return out.sent === MESSAGES.length && out.present === 0 && threadsOk(f.rows)
      && await verify({ messages: MESSAGES, get: f.get, ...quiet, tries: 1, waitMs: 0 });
  },
  "rerun-sends-nothing": async () => {
    const f = fakeDemo();
    await seed({ messages: MESSAGES, get: f.get, send: f.send, ...quiet });
    const before = f.sends.length;
    const out = await seed({ messages: MESSAGES, get: f.get, send: f.send, ...quiet });
    return out.sent === 0 && out.present === MESSAGES.length && f.sends.length === before;
  },
  "restores-only-missing-and-rethreads": async () => {
    const f = fakeDemo();
    await seed({ messages: MESSAGES, get: f.get, send: f.send, ...quiet });
    // Remove a thread root and two others, as an operator wipe of part of the box would.
    for (const subj of [MESSAGES[0].subject, MESSAGES.find((m) => m.key === "invoice-1").subject]) {
      const i = f.rows.findIndex((r) => r.subject === subj);
      f.rows.splice(i, 1);
    }
    f.rows.splice(f.rows.findIndex((r) => r.subject.startsWith("Reset")), 1);
    const out = await seed({ messages: MESSAGES, get: f.get, send: f.send, ...quiet });
    // cache-1 restored; its old children still point at the deleted root's thread id, so only
    // the restored root is new. The seeder must send exactly the 3 missing messages.
    return out.sent === 3 && presence(MESSAGES, f.rows).every(Boolean);
  },
  "reply-carries-parent-id-and-attachment": async () => {
    const reply = sendBody(MESSAGES.find((m) => m.key === "cache-2"), "abc@cf.example");
    const inv = sendBody(MESSAGES.find((m) => m.key === "invoice-1"));
    const pdf = Buffer.from(inv.attachments[0].content, "base64").toString("utf8");
    return reply.headers["In-Reply-To"] === "<abc@cf.example>" && !("In-Reply-To" in inv.headers)
      && reply.from.address === SEED_FROM && reply.from.name === "Relay (ops agent)"
      && reply.reply_to === "relay.agent@posternonline.com"
      && pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF") && reply.text.includes("Synthetic message");
  },
  "verify-fails-without-vectors": async () => {
    const f = fakeDemo({ semantic: false });
    await seed({ messages: MESSAGES, get: f.get, send: f.send, ...quiet });
    return (await verify({ messages: MESSAGES, get: f.get, ...quiet, tries: 1, waitMs: 0 })) === false;
  },
  "seed-refuses-reply-without-parent-id": async () => {
    const f = fakeDemo();
    const msgs = [MESSAGES[0], MESSAGES[1]];
    // Parent "sends" but never lands: the seeder must time out, not send an unthreaded reply.
    const send = async () => {};
    try { await seed({ messages: msgs, get: f.get, send, ...quiet, timeoutMs: 0 }); return false; }
    catch (e) { return /not readable/.test(e.message) && f.sends.length === 0; }
  },
};

const name = process.argv[2];
if (!cases[name]) { console.error(`unknown case ${name}`); process.exit(2); }
cases[name]().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e); process.exit(1); });
