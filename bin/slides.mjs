#!/usr/bin/env node
/**
 * Slides CLI — publish HTML decks to https://slides.availabooks.com
 *
 *   npx slides upload deck.html
 *   npx slides login --email you@example.com
 *   npx slides upload deck.html --slug my-talk
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { dirname, resolve, basename, extname } from "node:path";
import { existsSync } from "node:fs";

const DEFAULT_HOST = "https://slides.availabooks.com";
const SESSION_PATH = process.env.SLIDES_SESSION_FILE || `${homedir()}/.slides/session`;

function usage() {
  return `Slides — publish HTML decks (free)

Usage:
  slides upload <file> [--slug NAME] [--email EMAIL] [--code CODE] [--host URL]
  slides login --email EMAIL [--code CODE] [--host URL]
  slides slug <deck-id> --slug NAME [--host URL]
  slides logout
  slides whoami [--host URL]

Custom URLs (/d/<name>/) require a signed-in session. Guest uploads get a
random /d/<id>/ and must omit --slug.

Environment:
  SLIDES_HOST          Default ${DEFAULT_HOST}
  SLIDES_SESSION       Session token (overrides the saved file)
  SLIDES_SESSION_FILE  Session file (default ~/.slides/session)
`;
}

function host() {
  return (process.env.SLIDES_HOST || DEFAULT_HOST).replace(/\/$/, "");
}

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function api(base, path, init) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text || `HTTP ${res.status}` };
  }
  return { res, json };
}

async function loadSession() {
  if (process.env.SLIDES_SESSION) return process.env.SLIDES_SESSION;
  try {
    const raw = await readFile(SESSION_PATH, "utf8");
    return raw.trim() || null;
  } catch {
    return null;
  }
}

async function saveSession(token) {
  await mkdir(dirname(SESSION_PATH), { recursive: true });
  await writeFile(SESSION_PATH, `${token}\n`, { mode: 0o600 });
  try {
    await chmod(SESSION_PATH, 0o600);
  } catch {
    /* ignore */
  }
}

async function clearSession() {
  try {
    await unlink(SESSION_PATH);
  } catch {
    /* ignore */
  }
}

async function prompt(question) {
  if (!input.isTTY) return null;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function startMagic(base, email) {
  const { res, json } = await api(base, "/api/auth/magic/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    die(json?.error || `Could not send a sign-in code (${res.status}).`);
  }
}

async function verifyMagic(base, email, code) {
  const { res, json } = await api(base, "/api/auth/magic/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok || !json?.session) {
    die(json?.error || "That code did not work. Request a new one.");
  }
  await saveSession(json.session);
  return json;
}

async function ensureSession(base, args, { required }) {
  let token = await loadSession();
  if (token) return token;

  const email = typeof args.email === "string" ? args.email : null;
  if (!email) {
    if (!required) return null;
    die(
      "Custom URLs need a signed-in session.\nRun: slides login --email you@example.com\nOr pass --email (and --code) with this upload.",
    );
  }

  let code = typeof args.code === "string" ? args.code : null;
  if (!code) {
    await startMagic(base, email);
    if (!input.isTTY) {
      console.error(
        `Sign-in code sent to ${email}. Re-run with --code <6-digit code> to finish.`,
      );
      process.exit(2);
    }
    code = await prompt(`Code sent to ${email}. Enter it: `);
    if (!code) die("No code entered.");
  }

  const verified = await verifyMagic(base, email, code);
  console.error(`Signed in as ${verified.user?.email || email}.`);
  return verified.session;
}

async function cmdLogin(base, args) {
  const email = typeof args.email === "string" ? args.email : null;
  if (!email) die("Usage: slides login --email you@example.com [--code 123456]");

  let code = typeof args.code === "string" ? args.code : null;
  if (!code) {
    await startMagic(base, email);
    if (!input.isTTY) {
      console.error(
        `Sign-in code sent to ${email}. Re-run: slides login --email ${email} --code <code>`,
      );
      process.exit(2);
    }
    code = await prompt(`Code sent to ${email}. Enter it: `);
    if (!code) die("No code entered.");
  }

  const verified = await verifyMagic(base, email, code);
  console.log(`Signed in as ${verified.user?.email || email}.`);
}

async function cmdWhoami(base) {
  const token = await loadSession();
  if (!token) die("Not signed in. Run: slides login --email you@example.com");
  const { res, json } = await api(base, "/api/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok || !json?.authenticated) {
    die(json?.error || "Session expired. Run: slides login --email you@example.com");
  }
  console.log(json.user?.email || "signed in");
}

async function cmdLogout() {
  await clearSession();
  console.log("Signed out.");
}

async function cmdUpload(base, args) {
  const fileArg = args._[1];
  if (!fileArg) die("Usage: slides upload <file> [--slug NAME]");

  const filePath = resolve(fileArg);
  if (!existsSync(filePath)) die(`File not found: ${filePath}`);

  const slug = typeof args.slug === "string" ? args.slug : null;
  const token = await ensureSession(base, args, { required: Boolean(slug) });

  const buf = await readFile(filePath);
  const name = basename(filePath);
  const ext = extname(name).toLowerCase();
  const form = new FormData();

  if (ext === ".zip") {
    form.set("mode", "zip");
    form.set("zip", new Blob([new Uint8Array(buf)], { type: "application/zip" }), name);
  } else if (ext === ".html" || ext === ".htm") {
    form.set("mode", "paste");
    form.set("html", buf.toString("utf8"));
  } else {
    die("Upload a .html file or a .zip of the deck (must include index.html).");
  }

  if (slug) form.set("slug", slug);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const { res, json } = await api(base, "/api/upload", {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    die(json?.error || `Upload failed (${res.status}).`);
  }

  console.log(publicUrl(base, json));
}

async function cmdSlug(base, args) {
  const deckId = args._[1];
  const slug = typeof args.slug === "string" ? args.slug : args._[2];
  if (!deckId || !slug) die("Usage: slides slug <deck-id> --slug NAME");

  const token = await ensureSession(base, args, { required: true });
  const { res, json } = await api(base, `/api/decks/${encodeURIComponent(deckId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) {
    die(json?.error || `Could not set URL (${res.status}).`);
  }
  console.log(publicUrl(base, json));
}

function publicUrl(base, json) {
  const raw = json?.url;
  if (typeof raw === "string" && raw.startsWith("http")) return raw;
  if (typeof raw === "string" && raw.startsWith("/")) return `${base}${raw}`;
  const name = json?.slug || json?.id;
  if (!name) die("Upload succeeded but the host did not return a URL.");
  return `${base}/d/${name}/`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    console.log(usage());
    process.exit(args.help || args._.length === 0 ? 0 : 1);
  }

  const base = typeof args.host === "string" ? args.host.replace(/\/$/, "") : host();
  const cmd = args._[0];

  switch (cmd) {
    case "upload":
      await cmdUpload(base, args);
      break;
    case "login":
      await cmdLogin(base, args);
      break;
    case "logout":
      await cmdLogout();
      break;
    case "whoami":
      await cmdWhoami(base);
      break;
    case "slug":
      await cmdSlug(base, args);
      break;
    default:
      die(`Unknown command: ${cmd}\n\n${usage()}`);
  }
}

main().catch((err) => {
  die(err instanceof Error ? err.message : String(err));
});
