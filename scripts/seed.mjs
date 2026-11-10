#!/usr/bin/env node
// Seeds the public demo mailbox through the REAL inbound path (postern#837).
//
// Each message in seed/corpus.mjs is sent with the Cloudflare Email Sending REST API to an
// address on the demo domain. Email Routing delivers it to the demo Worker's email() handler,
// which runs ingest, threading, FTS and Vectorize the same way it does for any sender. Nothing
// here writes to D1.
//
// The REST API does not return the Message-ID it generates, so the seeder reads every message
// back through the demo's own read API after sending it. That readback does two jobs: it is the
// proof that ingest stored the message, and it supplies the stored Message-ID that a reply
// needs for In-Reply-To, so threads are built by postern's real thread resolution.
//
// Idempotent: a message already in the mailbox (same sender address and subject, counted in
// order) is skipped, so a re-run or the weekly guard sends only what is missing.
//
// Usage: node scripts/seed.mjs <dry-run|check|send|verify>
//   dry-run  validate the corpus and print the plan; no network.
//   check    read the mailbox and report which messages are present; sends nothing.
//   send     send every missing message, in order, waiting for each to land.
//   verify   assert the whole set is present, FTS finds a seeded word, semantic search hits.
// Env: CF_EMAIL_SEND_TOKEN (send only), POSTERN_DEMO_READ_TOKEN (check, send, verify),
//      DEMO_URL (default https://demo.posternonline.com). Account id comes from wrangler.jsonc.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MESSAGES, SEED_DOMAIN, SEED_VERSION, FOOTER } from "../seed/corpus.mjs";

const DASHES = /[\u2013\u2014]/;

export const bare = (addr) => {
  const s = String(addr ?? "");
  const m = s.match(/<([^<>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
};
const addrOf = (p) => (typeof p === "string" ? p : p.address);

/** Corpus rules. Returns a list of error strings; empty means valid. */
export function validate(messages, domain = SEED_DOMAIN) {
  const errs = [];
  const seen = new Set();
  const threadOf = new Map();
  const pairThread = new Map();
  if (messages.length < 20 || messages.length > 40) errs.push(`corpus has ${messages.length} messages; want 20 to 40`);
  for (const m of messages) {
    if (!m.key) { errs.push("message without a key"); continue; }
    if (seen.has(m.key)) errs.push(`duplicate key ${m.key}`);
    if (m.parent && !seen.has(m.parent)) errs.push(`${m.key}: parent ${m.parent} is not an earlier key`);
    seen.add(m.key);
    threadOf.set(m.key, m.parent ? threadOf.get(m.parent) ?? m.parent : m.key);
    for (const a of [addrOf(m.from), ...[m.to, m.cc].flat().filter(Boolean).map(addrOf)]) {
      if (!a || !a.toLowerCase().endsWith(`@${domain}`)) errs.push(`${m.key}: address ${a} is not on ${domain}`);
    }
    if (!m.subject || !m.text) errs.push(`${m.key}: subject and text are required`);
    const pair = `${addrOf(m.from).toLowerCase()}\n${m.subject}`;
    const t = threadOf.get(m.key);
    if (pairThread.has(pair) && pairThread.get(pair) !== t) errs.push(`${m.key}: sender+subject repeats outside its thread`);
    pairThread.set(pair, t);
    if (DASHES.test(JSON.stringify(m))) errs.push(`${m.key}: contains an em-dash or en-dash`);
  }
  return errs;
}

/** Occurrence-indexed identity: the nth message from this sender with this subject. */
export function identities(messages) {
  const n = new Map();
  return messages.map((m) => {
    const pair = `${addrOf(m.from).toLowerCase()}\n${m.subject}`;
    const i = n.get(pair) ?? 0;
    n.set(pair, i + 1);
    return { pair, nth: i };
  });
}

/** Group stored mailbox items by sender+subject, oldest first. */
export function indexMailbox(items) {
  const by = new Map();
  for (const it of items) {
    const pair = `${bare(it.from)}\n${it.subject ?? ""}`;
    if (!by.has(pair)) by.set(pair, []);
    by.get(pair).push(it);
  }
  for (const list of by.values()) list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.uid ?? 0) - (b.uid ?? 0));
  return by;
}

/** The present stored item for each corpus message, or null. */
export function presence(messages, items) {
  const by = indexMailbox(items);
  return identities(messages).map(({ pair, nth }) => (by.get(pair) ?? [])[nth] ?? null);
}

/** The Email Sending REST body for one message. */
export function sendBody(m, parentId) {
  const body = {
    from: { address: m.from.address, name: m.from.name },
    to: m.to,
    subject: m.subject,
    text: m.text + FOOTER,
    headers: { ...(m.headers ?? {}), "X-Postern-Demo-Seed": `${SEED_VERSION}/${m.key}` },
  };
  if (m.cc) body.cc = m.cc;
  if (m.html) body.html = `${m.html}<hr><p><small>${FOOTER.replace(/^\s*--\s*/, "").trim()}</small></p>`;
  if (parentId) { body.headers["In-Reply-To"] = `<${parentId}>`; body.headers["References"] = `<${parentId}>`; }
  if (m.attachments) {
    body.attachments = m.attachments.map((a) => ({
      filename: a.filename, type: a.type, disposition: a.disposition,
      content: Buffer.from(a.content, "utf8").toString("base64"),
    }));
  }
  return body;
}

function api(fetchImpl, base, token) {
  return async (path) => {
    const r = await fetchImpl(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(`GET ${path.split("?")[0]} -> ${r.status} ${j.error ?? ""}`);
    return j;
  };
}

/** Every stored message, all folders, paged. */
export async function listAll(get) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ mailbox: "all", limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const j = await get(`/api/messages?${q}`);
    out.push(...(j.items ?? []));
    cursor = j.cursor;
    if (!cursor) return out;
  }
  throw new Error("mailbox listing did not end within 50 pages");
}

/**
 * Send what is missing, in order. Each send waits until the message is readable through the
 * demo API, so a reply always has its parent's stored Message-ID. Returns counts.
 */
export async function seed({ messages, get, send, sleep, log, pollMs = 3000, timeoutMs = 180000 }) {
  let items = await listAll(get);
  const found = presence(messages, items);
  const idOf = new Map();
  let sent = 0;
  let present = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (found[i]) { idOf.set(m.key, found[i].messageId); present++; continue; }
    const parentId = m.parent ? idOf.get(m.parent) : undefined;
    if (m.parent && !parentId) throw new Error(`${m.key}: parent ${m.parent} has no stored Message-ID`);
    await send(sendBody(m, parentId));
    sent++;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(pollMs);
      items = await listAll(get);
      const hit = presence(messages, items)[i];
      if (hit) {
        idOf.set(m.key, hit.messageId);
        log(`@event seeded ${JSON.stringify({ key: m.key, threadId: hit.threadId, parent: m.parent ?? null })}`);
        break;
      }
      if (Date.now() > deadline) throw new Error(`${m.key}: sent but not readable through the demo API after ${timeoutMs / 1000}s`);
    }
  }
  return { cases: messages.length, present, sent };
}

/** Assert the set is present and threaded, FTS finds a seeded word, semantic search hits. */
export async function verify({ messages, get, sleep, log, tries = 10, waitMs = 6000 }) {
  const items = await listAll(get);
  const found = presence(messages, items);
  const missing = messages.filter((_, i) => !found[i]).map((m) => m.key);
  const keyIdx = new Map(messages.map((m, i) => [m.key, i]));
  const badThread = messages.filter((m, i) => m.parent && found[i] && found[keyIdx.get(m.parent)]
    && found[i].threadId !== found[keyIdx.get(m.parent)].threadId).map((m) => m.key);
  const fts = await get(`/api/search?${new URLSearchParams({ q: "lifecycle" })}`);
  let sem = { items: [] };
  for (let t = 0; t < tries; t++) {
    sem = await get(`/api/search?${new URLSearchParams({ q: "moving cached build artifacts into object storage", mode: "semantic" })}`);
    if ((sem.items ?? []).length) break;
    await sleep(waitMs);
  }
  const r = {
    corpus: messages.length, present: messages.length - missing.length, missing,
    misthreaded: badThread, mailboxTotal: items.length,
    ftsHits: (fts.items ?? []).length, semanticHits: (sem.items ?? []).length,
  };
  log(`@event verify ${JSON.stringify(r)}`);
  return r.missing.length === 0 && r.misthreaded.length === 0 && r.ftsHits > 0 && r.semanticHits > 0;
}

function accountId() {
  const s = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const m = s.match(/"account_id"\s*:\s*"([0-9a-f]{32})"/);
  if (!m) throw new Error("no account_id in wrangler.jsonc");
  return m[1];
}

async function main(mode) {
  const log = (s) => console.log(s);
  const errs = validate(MESSAGES);
  if (errs.length) { for (const e of errs) console.error(`corpus: ${e}`); process.exit(1); }
  if (mode === "dry-run") {
    for (const m of MESSAGES) log(`@event plan ${JSON.stringify({ key: m.key, parent: m.parent ?? null, attachments: (m.attachments ?? []).length })}`);
    log(`@event corpus ${JSON.stringify({ version: SEED_VERSION, messages: MESSAGES.length, threads: MESSAGES.filter((m) => !m.parent).length })}`);
    return;
  }
  const base = process.env.DEMO_URL || "https://demo.posternonline.com";
  const read = process.env.POSTERN_DEMO_READ_TOKEN;
  if (!read) throw new Error("POSTERN_DEMO_READ_TOKEN is not set");
  const get = api(fetch, base, read);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (mode === "check") {
    const found = presence(MESSAGES, await listAll(get));
    const missing = MESSAGES.filter((_, i) => !found[i]).map((m) => m.key);
    log(`@event check ${JSON.stringify({ corpus: MESSAGES.length, present: MESSAGES.length - missing.length, missing })}`);
    return;
  }
  if (mode === "verify") { if (!(await verify({ messages: MESSAGES, get, sleep, log }))) process.exit(1); return; }
  if (mode === "send") {
    const tok = process.env.CF_EMAIL_SEND_TOKEN;
    if (!tok) throw new Error("CF_EMAIL_SEND_TOKEN is not set");
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/email/sending/send`;
    const send = async (body) => {
      const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      const res = j.result ?? {};
      if (!r.ok || !j.success || (res.permanent_bounces ?? []).length) {
        throw new Error(`send "${body.subject}" -> ${r.status} ${JSON.stringify(j.errors ?? [])} bounces=${JSON.stringify(res.permanent_bounces ?? [])}`);
      }
    };
    const out = await seed({ messages: MESSAGES, get, send, sleep, log });
    log(`@event seed ${JSON.stringify(out)}`);
    return;
  }
  throw new Error(`unknown mode '${mode}'; want dry-run, check, send or verify`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
