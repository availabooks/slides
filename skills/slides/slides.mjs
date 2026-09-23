#!/usr/bin/env node
/**
 * Slides CLI — bundled with the skill at skills/slides/
 *
 *   node slides.mjs login
 *   node slides.mjs login --email you@example.com
 *   node slides.mjs upload deck.html --slug my-talk
 *
 * Live: https://app.availabooks.com/slides/skills/slides/slides.mjs
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { dirname, resolve, basename, extname } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";

const DEFAULT_HOST = "https://app.availabooks.com";
/** Must match app `LEGACY_SESSION_COOKIE` in src/auth/session.ts. */
const LEGACY_SESSION_COOKIE = "availabooks-app-session";
/** Must match app `COURSE_COOKIE_PREFIX` in src/auth/session.ts. */
const COURSE_COOKIE_PREFIX = "availabook-course-";
const COURSE_COOKIE_NAME = /^availabook-course-[A-Za-z0-9_-]{1,128}$/;
const SESSION_PATH =
  process.env.SLIDES_SESSION_FILE || `${homedir()}/.slides/session`;
const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

function usage() {
  return `Slides — publish HTML decks (Availabooks account required)

Usage:
  slides login [--host URL]
  slides login --email EMAIL [--code CODE] [--host URL]
  slides upload <file> [--slug NAME] [--email EMAIL] [--code CODE] [--host URL]
  slides slug <deck-id> --slug NAME [--host URL]
  slides logout
  slides whoami [--host URL]

Default login opens your browser to Availabooks sign-in, then returns a
session to this CLI via http://127.0.0.1. Pass --email for Magic Auth instead.

Environment:
  SLIDES_HOST          Default ${DEFAULT_HOST}
  SLIDES_SESSION       Cookie name=value (or bare token) overriding the saved file
  SLIDES_SESSION_FILE  Session file (default ~/.slides/session)
`;
}

/**
 * True when `name` is a sealed Availabooks session cookie.
 * @param {string} name
 */
function isSessionCookieName(name) {
  return name === LEGACY_SESSION_COOKIE || COURSE_COOKIE_NAME.test(name);
}

function host() {
  return (process.env.SLIDES_HOST || DEFAULT_HOST).replace(/\/$/, "");
}

function originFor(base) {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
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

async function api(base, path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Origin")) {
    headers.set("Origin", originFor(base));
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text || `HTTP ${res.status}` };
  }
  return { res, json };
}

/**
 * Picks a live session cookie from Set-Cookie header(s).
 * Skips Max-Age=0 expirations. Prefers course-scoped cookies over the legacy
 * single-session cookie (matches what sign-in writes when an org is present).
 * @param {string | string[] | null | undefined} headerValue
 * @returns {{ name: string; value: string } | null}
 */
function sessionCookieFromSetCookie(headerValue) {
  if (!headerValue) return null;
  const parts = Array.isArray(headerValue) ? headerValue : [headerValue];
  /** @type {{ name: string; value: string } | null} */
  let legacy = null;
  /** @type {{ name: string; value: string } | null} */
  let course = null;

  for (const part of parts) {
    const str = String(part).trim();
    if (!str || /\bMax-Age=0\b/i.test(str)) continue;
    const first = str.split(";")[0];
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!value || !isSessionCookieName(name)) continue;
    if (name === LEGACY_SESSION_COOKIE) {
      legacy = { name, value };
    } else if (name.startsWith(COURSE_COOKIE_PREFIX)) {
      course = { name, value };
    }
  }

  return course || legacy;
}

/**
 * Parses a saved session (name=value) or a bare legacy token.
 * @param {string} raw
 * @returns {{ name: string; value: string } | null}
 */
function parseStoredSession(raw) {
  const line = raw.trim();
  if (!line) return null;
  const eq = line.indexOf("=");
  if (eq > 0) {
    const name = line.slice(0, eq);
    const value = line.slice(eq + 1);
    if (isSessionCookieName(name) && value) {
      return { name, value };
    }
  }
  return { name: LEGACY_SESSION_COOKIE, value: line };
}

/**
 * @param {{ name: string; value: string }} session
 */
function formatStoredSession(session) {
  return `${session.name}=${session.value}`;
}

async function loadSession() {
  if (process.env.SLIDES_SESSION) {
    return parseStoredSession(process.env.SLIDES_SESSION);
  }
  try {
    const raw = await readFile(SESSION_PATH, "utf8");
    return parseStoredSession(raw);
  } catch {
    return null;
  }
}

/**
 * @param {{ name: string; value: string }} session
 */
async function saveSession(session) {
  await mkdir(dirname(SESSION_PATH), { recursive: true });
  await writeFile(SESSION_PATH, `${formatStoredSession(session)}\n`, {
    mode: 0o600,
  });
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
  const { res, json } = await api(base, "/api/auth/magic/send", {
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
  if (!res.ok || json?.status !== "authenticated") {
    die(json?.error || "That code did not work. Request a new one.");
  }
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie");
  const session = sessionCookieFromSetCookie(setCookie);
  if (!session) {
    die("Signed in, but the host did not return a session cookie.");
  }
  await saveSession(session);
  return { email };
}

async function ensureSession(base, args) {
  let session = await loadSession();
  if (session) return session;

  const email = typeof args.email === "string" ? args.email : null;
  if (email) {
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
    await verifyMagic(base, email, code);
    console.error(`Signed in as ${email}.`);
  } else {
    await browserLogin(base);
  }

  session = await loadSession();
  if (!session) {
    die("Signed in, but no session was saved. Try login again.");
  }
  return session;
}

/**
 * @param {{ name: string; value: string }} session
 */
function sessionHeaders(session) {
  return {
    Cookie: `${session.name}=${session.value}`,
  };
}

/**
 * Opens `url` in the system browser when possible.
 * @param {string} url
 */
function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [url], () => {});
    return;
  }
  if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], () => {});
    return;
  }
  execFile("xdg-open", [url], () => {});
}

/**
 * Browser login: local callback + Availabooks `/login` UI.
 * @param {string} base
 */
async function browserLogin(base) {
  const state = randomBytes(24).toString("base64url");

  /** @type {(value: { code: string; state: string }) => void} */
  let resolveCallback = () => {};
  const gotCallback = new Promise((resolve) => {
    resolveCallback = resolve;
  });

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
      const code = url.searchParams.get("code") || "";
      const returnedState = url.searchParams.get("state") || "";
      if (!code || returnedState !== state) {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("Invalid callback. You can close this window.");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><title>Signed in</title><p>Signed in to Availabooks Slides CLI. You can close this window.</p>",
      );
      resolveCallback({ code, state: returnedState });
    } catch {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Callback error");
    }
  });

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not bind local login callback."));
        return;
      }
      resolve(address.port);
    });
  });

  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const loginUrl = `${base}/api/auth/cli/login?${new URLSearchParams({
    redirect_uri: redirectUri,
    state,
  }).toString()}`;

  console.error("Opening browser to sign in…");
  console.error(`If nothing opens, visit:\n  ${loginUrl}`);
  openBrowser(loginUrl);

  const timeout = setTimeout(() => {
    server.close();
    die("Timed out waiting for browser sign-in. Run slides login again.");
  }, BROWSER_LOGIN_TIMEOUT_MS);

  try {
    const callback = await gotCallback;
    clearTimeout(timeout);
    server.close();

    const { res, json } = await api(base, "/api/auth/cli/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: callback.code,
        state: callback.state,
      }),
    });
    if (!res.ok || !json?.cookie?.name || !json?.cookie?.value) {
      die(json?.error || "Could not finish browser sign-in.");
    }
    await saveSession({
      name: String(json.cookie.name),
      value: String(json.cookie.value),
    });
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}

async function cmdLogin(base, args) {
  const email = typeof args.email === "string" ? args.email : null;
  if (email) {
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
    await verifyMagic(base, email, code);
    console.log(`Signed in as ${email}.`);
    return;
  }

  await browserLogin(base);
  const session = await loadSession();
  if (!session) die("Signed in, but no session was saved.");
  const { res, json } = await api(base, "/api/auth/me", {
    headers: sessionHeaders(session),
  });
  if (res.ok && json?.user?.email) {
    console.log(`Signed in as ${json.user.email}.`);
    return;
  }
  console.log("Signed in.");
}

async function cmdWhoami(base) {
  const session = await loadSession();
  if (!session) die("Not signed in. Run: slides login");
  const { res, json } = await api(base, "/api/auth/me", {
    headers: sessionHeaders(session),
  });
  if (!res.ok || !json?.user) {
    die(json?.error || "Session expired. Run: slides login");
  }
  console.log(json.user.email || "signed in");
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
  const session = await ensureSession(base, args);

  const buf = await readFile(filePath);
  const name = basename(filePath);
  const ext = extname(name).toLowerCase();
  const form = new FormData();

  if (ext === ".zip") {
    form.set("mode", "zip");
    form.set(
      "zip",
      new Blob([new Uint8Array(buf)], { type: "application/zip" }),
      name,
    );
  } else if (ext === ".html" || ext === ".htm") {
    form.set("mode", "paste");
    form.set("html", buf.toString("utf8"));
  } else {
    die("Upload a .html file or a .zip of the deck (must include index.html).");
  }

  if (slug) form.set("slug", slug);

  const { res, json } = await api(base, "/slides/api/upload", {
    method: "POST",
    headers: sessionHeaders(session),
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

  const session = await ensureSession(base, args);
  const { res, json } = await api(
    base,
    `/slides/api/decks/${encodeURIComponent(deckId)}`,
    {
      method: "PATCH",
      headers: {
        ...sessionHeaders(session),
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug }),
    },
  );
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
  return `${base}/slides/d/${name}/`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    console.log(usage());
    process.exit(args.help || args._.length === 0 ? 0 : 1);
  }

  const base =
    typeof args.host === "string" ? args.host.replace(/\/$/, "") : host();
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
