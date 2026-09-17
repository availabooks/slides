/* eslint-disable no-console */
import { unzipSync } from 'fflate';
import { lookup as lookupMime } from 'mime-types';

type EmailAddress = { email: string; name?: string };

type SendEmailBinding = {
  send(message: {
    to: string;
    from: string | EmailAddress;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId: string }>;
};

export interface Env {
  DECKS: R2Bucket;
  ASSETS: Fetcher;
  EMAIL?: SendEmailBinding;
  WORKOS_API_KEY?: string;
  WORKOS_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  EMAIL_FROM?: string;
  EMAIL_LOGO_URL?: string;
}

type Session = {
  userId: string;
  email: string;
  iat: number;
  exp: number;
};

const SESSION_COOKIE = 'ai_slides_session';
const SESSION_DAYS = 30;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // ~10MB
const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const RESERVED_SLUGS = new Set(['api', 'd', 'upload', 'sign-in', 'decks', 'pricing', 'assets', 'www']);
const AGENT_DOCS: Record<string, string> = {
  '/llms.txt': 'text/plain; charset=UTF-8'
};

function contentTypeForAgentDoc(pathname: string): string | null {
  if (AGENT_DOCS[pathname]) return AGENT_DOCS[pathname];
  if (pathname === '/skills/slides.zip') return 'application/zip';
  if (/^\/slides-host\/[A-Za-z0-9._-]+$/.test(pathname)) {
    if (pathname.endsWith('.js')) return 'text/javascript; charset=UTF-8';
    if (pathname.endsWith('.css')) return 'text/css; charset=UTF-8';
    return null;
  }
  const m = pathname.match(/^\/skills\/slides\/([A-Za-z0-9._-]+)$/);
  if (!m) return null;
  const file = m[1];
  if (file.endsWith('.md')) return 'text/markdown; charset=UTF-8';
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript; charset=UTF-8';
  if (file.endsWith('.json')) return 'application/json; charset=UTF-8';
  if (file.endsWith('.txt')) return 'text/plain; charset=UTF-8';
  if (file.endsWith('.zip')) return 'application/zip';
  return null;
}

const AGENT_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
  'Access-Control-Max-Age': '86400'
};

function isAgentCorsPath(pathname: string): boolean {
  return (
    pathname === '/api/upload' ||
    pathname === '/api/auth/magic/start' ||
    pathname === '/api/auth/magic/verify' ||
    pathname === '/api/me' ||
    /^\/api\/decks\/[^/]+$/.test(pathname)
  );
}

type DeckMeta = {
  id: string;
  ownerUserId: string | null;
  createdAt: string;
  title: string | null;
  entry: string;
  slug: string | null;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Worker-first: handle API and dynamic deck serving; otherwise fall back to assets.
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }
    if (url.pathname === '/' || url.pathname.startsWith('/d/')) {
      const deckResp = await maybeServeDeck(request, env);
      if (deckResp) return deckResp;
    }
    const agentDoc = await maybeServeAgentDoc(request, env);
    if (agentDoc) return agentDoc;
    // Fallback to static assets (SPA)
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try {
    if (method === 'GET' && url.pathname === '/api/me') {
      const sess = await getSessionFromRequest(request, env);
      return withAgentCors(
        json({ authenticated: !!sess, user: sess ? { id: sess.userId, email: sess.email } : null })
      );
    }
    if (isAgentCorsPath(url.pathname) && method === 'OPTIONS') {
      return withAgentCors(new Response(null, { status: 204 }));
    }
    if (url.pathname === '/api/upload') {
      if (method === 'POST') {
        return withAgentCors(await handleUpload(request, env));
      }
    }
    if (method === 'POST' && url.pathname === '/api/auth/magic/start') {
      return withAgentCors(await handleMagicStart(request, env));
    }
    if (method === 'POST' && url.pathname === '/api/auth/magic/verify') {
      return withAgentCors(await handleMagicVerify(request, env));
    }
    if (method === 'POST' && url.pathname === '/api/auth/logout') {
      return await handleLogout();
    }
    if (method === 'GET' && url.pathname === '/api/decks') {
      return await handleListDecks(request, env);
    }
    const deckMatch = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch) {
      const id = deckMatch[1];
      if (method === 'DELETE') return await handleDeleteDeck(request, env, id);
      if (method === 'PATCH') return withAgentCors(await handlePatchDeck(request, env, id));
    }
    return json({ error: 'Not found' }, 404);
  } catch (err: unknown) {
    const path = new URL(request.url).pathname;
    if (err instanceof HttpError) {
      const res = json({ error: err.message }, err.status);
      return isAgentCorsPath(path) ? withAgentCors(res) : res;
    }
    console.error('API error', err);
    const res = json({ error: 'Internal Server Error' }, 500);
    return isAgentCorsPath(path) ? withAgentCors(res) : res;
  }
}

async function maybeServeDeck(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/d\/([A-Za-z0-9_-]{2,48})(?:\/(.*))?$/);
  if (!m) {
    return null;
  }
  const name = m[1];
  let rest = m[2] ?? '';
  if (rest === '' || rest === '/') {
    rest = 'index.html';
  }
  if (rest === '_meta.json' || rest.includes('..')) {
    return json({ error: 'Not found' }, 404);
  }
  const storageId = await resolveDeckStorageId(env, name);
  if (!storageId) {
    return json({ error: 'Not found' }, 404);
  }
  const key = `d/${storageId}/${rest}`;
  const obj = await env.DECKS.get(key);
  if (!obj) {
    return json({ error: 'Not found' }, 404);
  }
  const ct = (obj.httpMetadata && (obj.httpMetadata as any).contentType) || contentTypeFor(rest);
  const headers = new Headers();
  if (ct) headers.set('Content-Type', ct);
  if (rest.endsWith('.html')) {
    headers.set('Cache-Control', 'no-cache');
    const bytes = await obj.arrayBuffer();
    const html = enhanceDeckHtml(new TextDecoder().decode(bytes));
    return new Response(html, { status: 200, headers });
  }
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { status: 200, headers });
}

function formValueAsText(value: FormDataEntryValue | null): Promise<string> | string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.text();
}

/** Critical host CSS inlined so slideshow chrome works before external CSS arrives. */
const SLIDES_HOST_CRITICAL_CSS =
  'html.slides-host-on,html.slides-host-on body{height:100%;margin:0;overflow:hidden}' +
  'html.slides-host-on .slides-host-root{position:relative;height:100%;height:100dvh;overflow:hidden}' +
  'html.slides-host-on .slides-host-root>[data-slides-host-slide]:not(.slides-host-active){display:none!important}' +
  'html.slides-host-on .slides-host-root>[data-slides-host-slide].slides-host-active{display:flex!important;flex-direction:column;position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box}' +
  '.slides-host-nav{position:fixed;bottom:max(1.15rem,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;gap:.45rem;z-index:40;background:rgba(15,23,42,.88);padding:.35rem;border-radius:999px}' +
  '.slides-host-nav button{border:0;background:transparent;color:#f8fafc;font:inherit;font-weight:600;min-width:2.75rem;min-height:2.5rem;padding:.4rem .85rem;border-radius:999px;cursor:pointer}' +
  '.slides-host-hint{position:fixed;bottom:max(1.35rem,env(safe-area-inset-bottom));left:max(1.1rem,env(safe-area-inset-left));z-index:39;margin:0;font:.78rem/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:rgba(100,116,139,.95);pointer-events:none}' +
  '.slides-host-num{position:fixed;bottom:max(1.3rem,env(safe-area-inset-bottom));right:max(1.1rem,env(safe-area-inset-right));z-index:41;border:0;background:rgba(248,250,252,.88);font:600 .85rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;color:#334155;cursor:pointer;min-height:2.5rem;padding:.4rem .7rem;border-radius:8px}' +
  '.slides-host-picker{position:fixed;inset:0;z-index:50;display:none}' +
  '.slides-host-picker.open{display:flex}';

function enhanceDeckHtml(html: string): string {
  if (/\/slides-host\/slides-host\.js/i.test(html)) return html;
  const needsViewport = !/<meta[^>]+name=["']viewport["']/i.test(html);
  // Put host assets in <head> so CSS is discovered before the deck body paints.
  // Late </body> injection caused a first-load FOUC: all slides stacked, nav at page end.
  const hostTags =
    `<style data-slides-host-critical>${SLIDES_HOST_CRITICAL_CSS}</style>\n` +
    '<link rel="stylesheet" href="/slides-host/slides-host.css" />\n' +
    '<script src="/slides-host/slides-host.js" defer></script>\n';
  const headInject =
    (needsViewport ? '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' : '') +
    hostTags;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${headInject}`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${hostTags}</body>`);
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${hostTags}</html>`);
  }
  return `${html}\n${hostTags}`;
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const mode = String(form.get('mode') || '').toLowerCase();
  const sess = await getSessionFromRequest(request, env);
  const ownerUserId = sess?.userId ?? null;
  const requestedSlug = String(form.get('slug') || '').trim();
  if (requestedSlug && !sess) {
    return json({ error: 'Sign in to choose a custom URL' }, 401);
  }
  let slug: string | null = null;
  if (requestedSlug) {
    const parsed = parseSlug(requestedSlug);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    slug = parsed.slug;
  }
  const nowIso = new Date().toISOString();
  const deckId = generateId();
  if (slug && (await isSlugTaken(env, slug, deckId))) {
    return json({ error: 'That URL is already taken' }, 409);
  }
  const prefix = `d/${deckId}/`;
  const toPut: Array<{ key: string; body: ArrayBuffer | Uint8Array | string; contentType: string }> = [];

  let totalBytes = 0;
  const addFile = (keyRel: string, bytes: ArrayBuffer | Uint8Array | string, contentType: string) => {
    if (keyRel === '_meta.json') return; // never allow
    const key = prefix + keyRel;
    let size = 0;
    if (typeof bytes === 'string') {
      size = new TextEncoder().encode(bytes).byteLength;
    } else if (bytes instanceof ArrayBuffer) {
      size = bytes.byteLength;
    } else {
      size = bytes.byteLength;
    }
    totalBytes += size;
    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new HttpError(413, 'Upload too large (max ~10MB)');
    }
    toPut.push({ key, body: bytes, contentType });
  };

  if (mode === 'paste') {
    const html = await formValueAsText(form.get('html'));
    if (!html.trim()) return json({ error: 'Missing html' }, 400);
    addFile('index.html', html, 'text/html; charset=UTF-8');
  } else if (mode === 'files') {
    const files = form.getAll('files').filter(Boolean) as File[];
    if (files.length === 0) return json({ error: 'No files' }, 400);
    // Check for index.html; if exactly one .html file, rename to index.html
    let hasIndex = files.some((f) => f.name.toLowerCase() === 'index.html');
    if (!hasIndex && files.length === 1 && files[0].name.toLowerCase().endsWith('.html')) {
      const f = files[0];
      const buf = await f.arrayBuffer();
      addFile('index.html', buf, 'text/html; charset=UTF-8');
      hasIndex = true;
    } else {
      for (const f of files) {
        const name = sanitizeRelPath(f.name);
        if (!name) continue;
        const buf = await f.arrayBuffer();
        addFile(name, buf, contentTypeFor(name));
      }
    }
    if (!hasIndex) return json({ error: 'Missing index.html' }, 400);
  } else if (mode === 'zip') {
    const z = form.get('zip');
    if (!(z instanceof File)) return json({ error: 'Missing zip' }, 400);
    const zipBytes = new Uint8Array(await z.arrayBuffer());
    // Extract
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(zipBytes);
    } catch {
      return json({ error: 'Invalid zip' }, 400);
    }
    const rels: string[] = [];
    for (const [name, data] of Object.entries(files)) {
      // fflate returns also directory entries with empty data; skip them
      if (!data || data.byteLength === 0) continue;
      const rel = sanitizeRelPath(name);
      if (!rel) continue;
      addFile(rel, data, contentTypeFor(rel));
      rels.push(rel);
    }
    // Ensure index.html
    if (!rels.some((r) => r.toLowerCase() === 'index.html')) {
      // If exactly one html file, rename to index.html
      const htmls = rels.filter((r) => r.toLowerCase().endsWith('.html'));
      if (htmls.length === 1) {
        const only = htmls[0];
        const found = toPut.find((p) => p.key === prefix + only);
        if (found) {
          // duplicate as index.html
          addFile('index.html', found.body as Uint8Array, 'text/html; charset=UTF-8');
        }
      } else {
        return json({ error: 'Missing index.html' }, 400);
      }
    }
  } else {
    return json({ error: 'Invalid mode' }, 400);
  }

  // Write files to R2
  for (const f of toPut) {
    await env.DECKS.put(f.key, f.body as any, {
      httpMetadata: { contentType: f.contentType }
    });
  }

  // Compute title from index.html
  let title: string | null = null;
  const indexItem = toPut.find((p) => p.key.endsWith('/index.html'));
  if (indexItem) {
    const htmlStr =
      typeof indexItem.body === 'string'
        ? indexItem.body
        : new TextDecoder().decode(indexItem.body as ArrayBuffer | Uint8Array);
    title = extractTitle(htmlStr);
  }

  // Write metadata and user pointer
  const meta: DeckMeta = {
    id: deckId,
    ownerUserId,
    createdAt: nowIso,
    title: title ?? null,
    entry: 'index.html',
    slug
  };
  await env.DECKS.put(prefix + '_meta.json', JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json; charset=UTF-8' }
  });
  if (ownerUserId) {
    await env.DECKS.put(`users/${ownerUserId}/decks/${deckId}`, nowIso, {
      httpMetadata: { contentType: 'text/plain; charset=UTF-8' }
    });
  }
  if (slug) {
    await env.DECKS.put(`slugs/${slug}`, deckId, {
      httpMetadata: { contentType: 'text/plain; charset=UTF-8' }
    });
  }
  const url = shareUrlFor(request, slug || deckId);
  return json({ id: deckId, slug, url }, 201);
}

async function handleListDecks(request: Request, env: Env): Promise<Response> {
  const sess = await getSessionFromRequest(request, env);
  if (!sess) return json({ error: 'Unauthorized' }, 401);
  const prefix = `users/${sess.userId}/decks/`;
  const listed = await env.DECKS.list({ prefix });
  const deckIds = listed.objects.map((o) => o.key.substring(prefix.length));
  const decks: Array<{
    id: string;
    slug: string | null;
    url: string;
    title: string | null;
    createdAt: string;
  }> = [];
  for (const id of deckIds) {
    const meta = await readDeckMeta(env, id);
    const slug = meta?.slug ?? null;
    decks.push({
      id,
      slug,
      url: shareUrlFor(request, slug || id),
      title: meta?.title ?? null,
      createdAt: meta?.createdAt ?? ''
    });
  }
  return json(decks);
}

async function handleDeleteDeck(request: Request, env: Env, deckId: string): Promise<Response> {
  const sess = await getSessionFromRequest(request, env);
  if (!sess) return json({ error: 'Unauthorized' }, 401);
  const metaObj = await env.DECKS.get(`d/${deckId}/_meta.json`);
  if (!metaObj) return json({ error: 'Not found' }, 404);
  const meta = JSON.parse(await metaObj.text()) as DeckMeta;
  if (meta.ownerUserId !== sess.userId) return json({ error: 'Forbidden' }, 403);
  if (meta.slug) {
    await env.DECKS.delete(`slugs/${meta.slug}`);
  }
  // Delete all objects under the deck prefix
  let cursor: string | undefined;
  const prefix = `d/${deckId}/`;
  while (true) {
    const page = await env.DECKS.list({ prefix, cursor });
    if (page.objects.length > 0) {
      await env.DECKS.delete(page.objects.map((o) => o.key));
    }
    // @ts-ignore cursor is present when truncated in Workers runtime
    if (!page.truncated) break;
    // @ts-ignore cursor is present when truncated in Workers runtime
    cursor = page.cursor;
  }
  // Remove pointer
  await env.DECKS.delete(`users/${sess.userId}/decks/${deckId}`);
  return new Response(null, { status: 204 });
}

async function handlePatchDeck(request: Request, env: Env, deckId: string): Promise<Response> {
  const sess = await getSessionFromRequest(request, env);
  if (!sess) return json({ error: 'Unauthorized' }, 401);
  const meta = await readDeckMeta(env, deckId);
  if (!meta) return json({ error: 'Not found' }, 404);
  if (meta.ownerUserId !== sess.userId) return json({ error: 'Forbidden' }, 403);
  const body = (await request.json().catch(() => ({}))) as { slug?: string | null };
  const raw = body.slug;
  let nextSlug: string | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = parseSlug(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    nextSlug = parsed.slug;
    if (await isSlugTaken(env, nextSlug, deckId)) {
      return json({ error: 'That URL is already taken' }, 409);
    }
  }
  if (meta.slug && meta.slug !== nextSlug) {
    await env.DECKS.delete(`slugs/${meta.slug}`);
  }
  if (nextSlug) {
    await env.DECKS.put(`slugs/${nextSlug}`, deckId, {
      httpMetadata: { contentType: 'text/plain; charset=UTF-8' }
    });
  }
  const updated: DeckMeta = { ...meta, slug: nextSlug };
  await env.DECKS.put(`d/${deckId}/_meta.json`, JSON.stringify(updated), {
    httpMetadata: { contentType: 'application/json; charset=UTF-8' }
  });
  return json({
    id: deckId,
    slug: nextSlug,
    url: shareUrlFor(request, nextSlug || deckId),
    title: meta.title,
    createdAt: meta.createdAt
  });
}

async function handleMagicStart(request: Request, env: Env): Promise<Response> {
  if (!env.WORKOS_API_KEY) {
    return json({ error: 'Magic Auth unavailable' }, 503);
  }
  if (!env.EMAIL || !env.EMAIL_FROM) {
    return json({ error: 'Email service unavailable' }, 503);
  }
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  if (!email) return json({ error: 'Email required' }, 400);
  try {
    // 1) Ask WorkOS to create a Magic Auth code (do NOT send email)
    const payload = await workosPost(env, '/user_management/magic_auth', {
      email
    });
    if (!payload.ok) {
      return json({ error: payload.error || 'Failed to create Magic Auth code' }, 502);
    }
    const code: string | undefined = payload.data?.code;
    if (!code) {
      return json({ error: 'Magic Auth code missing in response' }, 502);
    }
    // 2) Send custom email via Cloudflare Email Service
    const { subject, html, text } = renderMagicEmail(email, code, env.EMAIL_LOGO_URL || '');
    try {
      await env.EMAIL.send({
        to: email,
        from: parseFromAddress(env.EMAIL_FROM),
        subject,
        html,
        text
      });
    } catch (err: any) {
      const detail = err?.message || 'Failed to send email';
      return json({ error: detail }, 502);
    }
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return json({ error: 'Failed to start Magic Auth' }, 502);
  }
}

async function handleMagicVerify(request: Request, env: Env): Promise<Response> {
  if (!env.WORKOS_API_KEY || !env.WORKOS_CLIENT_ID) {
    return json({ error: 'Magic Auth unavailable' }, 503);
  }
  const { email, code } = (await request.json().catch(() => ({}))) as { email?: string; code?: string };
  if (!email || !code) return json({ error: 'Email and code required' }, 400);
  try {
    // WorkOS authenticateWithMagicAuth → POST /user_management/authenticate
    const payload = await workosPost(env, '/user_management/authenticate', {
      grant_type: 'urn:workos:oauth:grant-type:magic-auth:code',
      client_id: env.WORKOS_CLIENT_ID,
      client_secret: env.WORKOS_API_KEY,
      email,
      code
    });
    if (!payload.ok) {
      return json({ error: payload.error || 'Invalid code' }, 401);
    }
    const out = payload.data || {};
    const userId: string =
      out?.user?.id || out?.user_id || out?.id || `email:${await sha256Hex(email.toLowerCase())}`;
    const session = await createSession(
      { userId, email: (out?.user?.email || email).toLowerCase() },
      env.SESSION_SECRET || (await defaultDevSecret(env))
    );
    return json(
      { session: session.token, user: { email: (out?.user?.email || email).toLowerCase() } },
      200,
      { 'Set-Cookie': session.cookie }
    );
  } catch (err: any) {
    return json({ error: 'Verification failed' }, 502);
  }
}

async function handleLogout(): Promise<Response> {
  const expired = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
  return new Response(null, { status: 204, headers: { 'Set-Cookie': expired } });
}

async function getSessionFromRequest(request: Request, env: Env): Promise<Session | null> {
  const secret = env.SESSION_SECRET || (await defaultDevSecret(env));
  const raw = sessionTokenFromRequest(request);
  if (!raw) return null;
  try {
    return await verifySessionCookie(raw, secret);
  } catch {
    return null;
  }
}

function sessionTokenFromRequest(request: Request): string | null {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer?.[1]) return bearer[1].trim();
  const cookie = request.headers.get('Cookie') || '';
  return parseCookie(cookie)[SESSION_COOKIE] || null;
}

function json(body: any, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  if (!h.has('Content-Type')) h.set('Content-Type', 'application/json; charset=UTF-8');
  return new Response(JSON.stringify(body, null, 2), { status, headers: h });
}

function withAgentCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(AGENT_CORS)) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function maybeServeAgentDoc(request: Request, env: Env): Promise<Response | null> {
  if (request.method.toUpperCase() !== 'GET') return null;
  const pathname = new URL(request.url).pathname;
  const contentType = contentTypeForAgentDoc(pathname);
  if (!contentType) return null;
  const asset = await env.ASSETS.fetch(request);
  const assetType = asset.headers.get('content-type') || '';
  if (!asset.ok || assetType.includes('text/html')) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const headers = new Headers(asset.headers);
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set('Access-Control-Allow-Origin', '*');
  if (contentType === 'application/zip') {
    headers.set('Content-Disposition', 'attachment; filename="slides.zip"');
  }
  return new Response(asset.body, { status: 200, headers });
}

async function workosPost(
  env: Env,
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: any; error: string }> {
  const res = await fetch(`https://api.workos.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WORKOS_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const error =
    (data && (typeof data.message === 'string' ? data.message : data.error)) ||
    text ||
    `WorkOS error ${res.status}`;
  return { ok: res.ok, status: res.status, data, error };
}

function contentTypeFor(name: string): string {
  const ct = lookupMime(name) || 'application/octet-stream';
  if (ct === 'text/html') return 'text/html; charset=UTF-8';
  if (ct.startsWith('text/')) return `${ct}; charset=UTF-8`;
  return ct;
}

function sanitizeRelPath(name: string): string {
  const clean = name.replace(/\\/g, '/');
  const parts = clean.split('/').filter((p) => p && p !== '.' && p !== '..');
  const rel = parts.join('/');
  if (!rel) return '';
  if (rel.startsWith('_meta.json')) return '';
  return rel;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].trim();
  return t || null;
}

function generateId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // @ts-ignore - btoa expects string; use from char codes
  const bin = String.fromCharCode(...b);
  const base64 = btoa(bin);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && v && !out[k]) out[k] = v;
  });
  // Also support multiple cookies in single header
  header.split(/,\s*/).forEach((c) => {
    const [k, v] = c.split('=');
    if (k && v) out[k.trim()] = v.trim();
  });
  return out;
}

async function createSession(
  user: { userId: string; email: string },
  secret: string
): Promise<{ token: string; cookie: string }> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_DAYS * 24 * 60 * 60;
  const payload: Session = { userId: user.userId, email: user.email, iat, exp };
  const payloadB64 = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256Base64Url(payloadB64, secret);
  const token = `${payloadB64}.${sig}`;
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    SESSION_DAYS * 24 * 60 * 60
  }; Secure`;
  return { token, cookie };
}

async function verifySessionCookie(raw: string, secret: string): Promise<Session> {
  const [payloadB64, sig] = raw.split('.');
  if (!payloadB64 || !sig) throw new Error('Bad cookie');
  const expected = await hmacSha256Base64Url(payloadB64, secret);
  if (!timingSafeEqual(sig, expected)) throw new Error('Bad sig');
  const jsonStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const sess = JSON.parse(jsonStr) as Session;
  if (!sess.exp || sess.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Expired');
  }
  return sess;
}

function base64UrlDecode(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(((b64url.length + 3) >> 2) << 2, '=');
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function hmacSha256Base64Url(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let out = 0;
  for (let i = 0; i < aBytes.length; i++) out |= aBytes[i] ^ bBytes[i];
  return out === 0;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const v = new Uint8Array(buf);
  return Array.from(v)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function defaultDevSecret(env: Env): Promise<string> {
  // Derive a stable secret for local dev only (not for production)
  return 'dev-secret-' + (await sha256Hex(env.WORKOS_CLIENT_ID || ''));
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseFromAddress(from: string): string | EmailAddress {
  const m = from.trim().match(/^(.*)<([^>]+)>\s*$/);
  if (!m) return from.trim();
  const name = m[1].trim().replace(/^["']|["']$/g, '');
  const addr = m[2].trim();
  return name ? { email: addr, name } : addr;
}

function renderMagicEmail(email: string, code: string, logoUrl?: string) {
  const subject = 'Your sign-in code';
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="light" />
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;color:#172033;font-family:Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.72;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #dbe3ee;border-radius:0.8rem;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
            <tr>
              <td style="padding-bottom:16px;font-family:Taviraj,Georgia,serif;font-weight:700;font-size:22px;color:#0f172a;">
                ${logoUrl ? `<img src="${logoUrl}" alt="Slides" style="max-height:32px;display:block;" />` : `Slides`}
              </td>
            </tr>
            <tr>
              <td style="color:#172033;padding-bottom:8px;">
                Your sign-in code
              </td>
            </tr>
            <tr>
              <td>
                <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size:28px; letter-spacing:6px; background:#dbeafe; border:1px solid #dbe3ee; border-radius:0.3rem; padding:12px 16px; display:inline-block; color:#1d4ed8; font-weight:600;">
                  ${escapeHtml(code)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-top:12px; color:#64748b;">
                Expires in 10 minutes. If you didn’t request this, you can ignore this email.
              </td>
            </tr>
          </table>
          <div style="color:#64748b;font-size:12px;padding-top:12px;">Sent to ${escapeHtml(email)}</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = `Slides\n\nYour sign-in code: ${code}\n\nExpires in 10 minutes. If you didn’t request this, ignore this email.\n`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

function shareUrlFor(request: Request, name: string): string {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host === 'slides.availabooks.com') {
    return `https://slides.availabooks.com/d/${name}/`;
  }
  return `/d/${name}/`;
}

async function resolveDeckStorageId(env: Env, name: string): Promise<string | null> {
  const direct = await env.DECKS.head(`d/${name}/index.html`);
  if (direct) return name;
  const pointer = await env.DECKS.get(`slugs/${name.toLowerCase()}`);
  if (!pointer) return null;
  const id = (await pointer.text()).trim();
  return id || null;
}

async function readDeckMeta(env: Env, deckId: string): Promise<DeckMeta | null> {
  const obj = await env.DECKS.get(`d/${deckId}/_meta.json`);
  if (!obj) return null;
  try {
    const parsed = JSON.parse(await obj.text()) as DeckMeta;
    return {
      id: parsed.id || deckId,
      ownerUserId: parsed.ownerUserId ?? null,
      createdAt: parsed.createdAt ?? '',
      title: parsed.title ?? null,
      entry: parsed.entry || 'index.html',
      slug: parsed.slug ?? null
    };
  } catch {
    return null;
  }
}

function parseSlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: 'Use 2–32 characters: start with a letter, then letters, numbers, or hyphens'
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: 'That URL is reserved' };
  }
  return { ok: true, slug };
}

async function isSlugTaken(env: Env, slug: string, exceptDeckId: string): Promise<boolean> {
  const pointer = await env.DECKS.get(`slugs/${slug}`);
  if (pointer) {
    const owner = (await pointer.text()).trim();
    if (owner && owner !== exceptDeckId) return true;
  }
  if (slug !== exceptDeckId) {
    const existing = await env.DECKS.head(`d/${slug}/_meta.json`);
    if (existing) return true;
  }
  return false;
}
