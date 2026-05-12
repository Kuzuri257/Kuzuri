// ═══════════════════════════════════════════════════════════════════════
// kuzuri-whoop · v3 (multi-user)
// ═══════════════════════════════════════════════════════════════════════

const WHOOP_AUTH_URL  = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE  = 'https://api.prod.whoop.com';
const WHOOP_SCOPES    = 'offline read:sleep read:recovery read:cycles read:workout read:body_measurement read:profile';

const OURA_AUTH_URL   = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL  = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE   = 'https://api.ouraring.com';
const OURA_SCOPES     = 'daily readiness sleep workout personal session heartrate spo2Daily';

const SESSION_COOKIE  = 'kz_sess';
const SESSION_TTL_MS  = 90 * 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS    = 15 * 60 * 1000;
const RESEND_API_URL  = 'https://api.resend.com/emails';

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'http://localhost:8000') return true;
  if (origin === 'http://localhost:3000') return true;
  try {
    const u = new URL(origin);
    return u.hostname.endsWith('.pages.dev') || u.hostname === 'kuzuri.app' || u.hostname.endsWith('.kuzuri.app');
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  const allow = isAllowedOrigin(origin) ? origin : 'https://kuzuri-oeu.pages.dev';
  return {
    'Access-Control-Allow-Origin':       allow,
    'Access-Control-Allow-Credentials':  'true',
    'Access-Control-Allow-Methods':      'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':      'Content-Type',
    'Access-Control-Max-Age':            '86400',
  };
}

function jsonResponse(data, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encryptForUser(plaintext, encKeyB64) {
  const keyBytes = Uint8Array.from(atob(encKeyB64), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptForUser(ciphertextB64, encKeyB64) {
  const keyBytes = Uint8Array.from(atob(encKeyB64), c => c.charCodeAt(0));
  const combined = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct);
  return new TextDecoder().decode(pt);
}

function generateEncKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

function readSessionCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

function setSessionCookieHeader(sessionId) {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=None`;
}

function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

async function getSessionUser(request, env) {
  const sid = readSessionCookie(request);
  if (!sid) return null;
  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.user_id, s.expires_at, u.email, u.name, u.enc_key
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > ?`
  ).bind(sid, Date.now()).first();
  if (!row) return null;
  env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
    .bind(Date.now(), sid).run().catch(() => {});
  return {
    sid: row.sid,
    user_id: row.user_id,
    email: row.email,
    name: row.name,
    enc_key: row.enc_key,
  };
}

async function logAudit(env, request, user, endpoint, status) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';
    const ipHash = ip ? await sha256Hex(ip) : null;
    const uaHash = ua ? (await sha256Hex(ua)).slice(0, 16) : null;
    await env.DB.prepare(
      `INSERT INTO audit_log (ts, user_id, endpoint, status, ip_hash, ua_hash) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(Date.now(), user?.user_id || null, endpoint, status, ipHash, uaHash).run();
  } catch (_) {}
}

// v3.1.1: OTP — generate a 6-digit code, store its SHA-256 hash
function generateOTP() {
  const digits = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(digits).map(b => b % 10).join('');
}

async function sendOTPEmail(env, email, code) {
  const fromAddress = 'Kuzuri <onboarding@resend.dev>';
  const r = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: `${code} — your Kuzuri code`,
      text: `Your Kuzuri sign-in code is:\n\n${code}\n\nEnter this in the app. Good for 15 minutes.\nIf you didn't request it, ignore this email.`,
      html: `<div style="font-family:Georgia,serif;color:#2A2520;max-width:480px;padding:32px 24px;">
        <p style="font-size:15px;line-height:1.6;margin:0 0 28px 0;font-style:italic;color:#6B5E4A;">Your Kuzuri sign-in code:</p>
        <p style="font-family:monospace;font-size:42px;font-weight:500;letter-spacing:0.18em;color:#1F4A33;margin:0 0 28px 0;">${code}</p>
        <p style="font-size:14px;line-height:1.6;color:#A39778;font-style:italic;margin:0;">Good for 15 minutes.<br>If you didn&rsquo;t request this, you can ignore it.</p>
      </div>`,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`RESEND_FAILED: ${r.status} ${err}`);
  }
  return await r.json();
}

async function saveProviderTokens(env, userId, encKey, provider, tokens) {
  const accessEnc  = await encryptForUser(tokens.access_token, encKey);
  const refreshEnc = tokens.refresh_token ? await encryptForUser(tokens.refresh_token, encKey) : null;
  const expiresAt  = Date.now() + (tokens.expires_in * 1000);
  await env.DB.prepare(
    `INSERT INTO provider_tokens (user_id, provider, access_token, refresh_token, expires_at, scope, connected_at, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       connected_at = excluded.connected_at`
  ).bind(userId, provider, accessEnc, refreshEnc, expiresAt, tokens.scope || null, Date.now()).run();
}

async function getProviderTokens(env, userId, encKey, provider) {
  const row = await env.DB.prepare(
    `SELECT access_token, refresh_token, expires_at, scope FROM provider_tokens WHERE user_id = ? AND provider = ?`
  ).bind(userId, provider).first();
  if (!row) return null;
  const access  = await decryptForUser(row.access_token, encKey);
  const refresh = row.refresh_token ? await decryptForUser(row.refresh_token, encKey) : null;
  return { access_token: access, refresh_token: refresh, expires_at: row.expires_at, scope: row.scope };
}

async function deleteProviderTokens(env, userId, provider) {
  await env.DB.prepare(`DELETE FROM provider_tokens WHERE user_id = ? AND provider = ?`)
    .bind(userId, provider).run();
}

async function ensureFreshWhoopToken(env, userId, encKey) {
  // v3.3.9: removed tokens:default legacy fallback — strictly per-user tokens only.
  // A user with no personal Whoop token gets NOT_CONNECTED immediately.
  const tokens = await getProviderTokens(env, userId, encKey, 'whoop');
  if (!tokens) throw new Error('NOT_CONNECTED');
  if (tokens.expires_at - Date.now() > 60_000) return tokens;
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id:     env.WHOOP_CLIENT_ID,
    client_secret: env.WHOOP_CLIENT_SECRET,
    scope:         'offline',
  });
  const r = await fetch(WHOOP_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!r.ok) throw new Error(`WHOOP_REFRESH_FAILED: ${r.status} ${await r.text()}`);
  const data = await r.json();
  await saveProviderTokens(env, userId, encKey, 'whoop', data);
  return await getProviderTokens(env, userId, encKey, 'whoop');
}

async function whoopFetch(env, userId, encKey, path, params = {}) {
  const tokens = await ensureFreshWhoopToken(env, userId, encKey);
  const url = new URL(WHOOP_API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const r = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  });
  if (!r.ok) throw new Error(`WHOOP_API_ERROR (${path}): ${r.status} ${await r.text()}`);
  return await r.json();
}

async function safeWhoopFetch(env, userId, encKey, path, params = {}) {
  try { return { data: await whoopFetch(env, userId, encKey, path, params), error: null }; }
  catch (e) { return { data: null, error: e.message || String(e) }; }
}

async function ensureFreshLegacyWhoopToken(env) {
  const raw = await env.TOKENS.get('tokens:default');
  if (!raw) return null;
  const tokens = JSON.parse(raw);
  if (tokens.expires_at - Date.now() > 60_000) return tokens;
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id:     env.WHOOP_CLIENT_ID,
    client_secret: env.WHOOP_CLIENT_SECRET,
    scope:         'offline',
  });
  const r = await fetch(WHOOP_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!r.ok) throw new Error(`LEGACY_WHOOP_REFRESH_FAILED: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const updated = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + (data.expires_in * 1000),
    scope:         data.scope,
  };
  await env.TOKENS.put('tokens:default', JSON.stringify(updated));
  return updated;
}

async function ensureFreshOuraToken(env, userId, encKey) {
  const tokens = await getProviderTokens(env, userId, encKey, 'oura');
  if (!tokens) throw new Error('NOT_CONNECTED');
  if (tokens.expires_at - Date.now() > 60_000) return tokens;
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id:     env.OURA_CLIENT_ID,
    client_secret: env.OURA_CLIENT_SECRET,
  });
  const r = await fetch(OURA_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!r.ok) throw new Error(`OURA_REFRESH_FAILED: ${r.status} ${await r.text()}`);
  const data = await r.json();
  await saveProviderTokens(env, userId, encKey, 'oura', data);
  return await getProviderTokens(env, userId, encKey, 'oura');
}

async function ouraFetch(env, userId, encKey, path, params = {}) {
  const tokens = await ensureFreshOuraToken(env, userId, encKey);
  const url = new URL(OURA_API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const r = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  });
  if (!r.ok) throw new Error(`OURA_API_ERROR (${path}): ${r.status} ${await r.text()}`);
  return await r.json();
}

async function safeOuraFetch(env, userId, encKey, path, params = {}) {
  try { return { data: await ouraFetch(env, userId, encKey, path, params), error: null }; }
  catch (e) { return { data: null, error: e.message || String(e) }; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    let user = null;
    let auditStatus = 200;

    try {
      if (path === '/' && method === 'GET') {
        return new Response('kuzuri-whoop is alive · v3 (multi-user)', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // SHIMS
      if (path === '/auth/start' && method === 'GET') {
        const state = randomHex(8);
        await env.TOKENS.put(`oauth_state:${state}`, JSON.stringify({ user_id: 'default', provider: 'whoop', legacy: true }), { expirationTtl: 600 });
        const authUrl = new URL(WHOOP_AUTH_URL);
        authUrl.searchParams.set('client_id',     env.WHOOP_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri',  `${env.WORKER_URL}/auth/callback`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope',         WHOOP_SCOPES);
        authUrl.searchParams.set('state',         state);
        return Response.redirect(authUrl.toString(), 302);
      }

      if (path === '/auth/callback' && method === 'GET') {
        const code  = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        if (error) {
          return new Response(`<h1>Whoop auth declined</h1><p>${error}</p><p><a href="${env.APP_URL}">Return to Kuzuri</a></p>`, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }
        if (!code || !state) return new Response('Missing code or state', { status: 400 });
        const stateRaw = await env.TOKENS.get(`oauth_state:${state}`);
        if (!stateRaw) return new Response('Invalid or expired state', { status: 400 });
        await env.TOKENS.delete(`oauth_state:${state}`);
        const body = new URLSearchParams({
          grant_type:    'authorization_code',
          code:          code,
          redirect_uri:  `${env.WORKER_URL}/auth/callback`,
          client_id:     env.WHOOP_CLIENT_ID,
          client_secret: env.WHOOP_CLIENT_SECRET,
        });
        const r = await fetch(WHOOP_TOKEN_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    body.toString(),
        });
        if (!r.ok) return new Response(`<h1>Whoop token exchange failed</h1><pre>${r.status}\n${await r.text()}</pre>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
        const tokens = await r.json();
        await env.TOKENS.put('tokens:default', JSON.stringify({
          access_token:  tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at:    Date.now() + (tokens.expires_in * 1000),
          scope:         tokens.scope,
        }));
        return Response.redirect(`${env.APP_URL}/?whoop=connected`, 302);
      }

      if (path === '/auth/status' && method === 'GET') {
        const raw = await env.TOKENS.get('tokens:default');
        if (!raw) return jsonResponse({ connected: false }, 200, origin);
        const tokens = JSON.parse(raw);
        let profile = null;
        try {
          const fresh = await ensureFreshLegacyWhoopToken(env);
          if (fresh) {
            const pr = await fetch(`${WHOOP_API_BASE}/developer/v2/user/profile/basic`, {
              headers: { 'Authorization': `Bearer ${fresh.access_token}` },
            });
            if (pr.ok) profile = await pr.json();
          }
        } catch {}
        return jsonResponse({ connected: true, expires_at: tokens.expires_at, profile }, 200, origin);
      }

      if (path === '/auth/disconnect' && method === 'POST') {
        await env.TOKENS.delete('tokens:default');
        return jsonResponse({ disconnected: true }, 200, origin);
      }

      if (path === '/api/whoop/sync' && method === 'GET') {
        const since = url.searchParams.get('since')
          || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        try {
          const fresh = await ensureFreshLegacyWhoopToken(env);
          if (!fresh) return jsonResponse({ error: 'not_connected' }, 401, origin);
          const fetchOne = async (p, params = {}) => {
            try {
              const u = new URL(WHOOP_API_BASE + p);
              for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null) u.searchParams.set(k, v);
              }
              const r = await fetch(u.toString(), { headers: { 'Authorization': `Bearer ${fresh.access_token}` } });
              if (!r.ok) return { data: null, error: `${r.status} ${await r.text()}` };
              return { data: await r.json(), error: null };
            } catch (e) { return { data: null, error: e.message }; }
          };
          const [sleep, recovery, cycles, workouts, body, profile] = await Promise.all([
            fetchOne('/developer/v2/activity/sleep',     { start: since, limit: 25 }),
            fetchOne('/developer/v2/recovery',           { start: since, limit: 25 }),
            fetchOne('/developer/v2/cycle',              { start: since, limit: 25 }),
            fetchOne('/developer/v2/activity/workout',   { start: since, limit: 25 }),
            fetchOne('/developer/v2/user/measurement/body'),
            fetchOne('/developer/v2/user/profile/basic'),
          ]);
          return jsonResponse({
            since,
            synced_at:  new Date().toISOString(),
            sleep:      sleep.data?.records   || [],
            recovery:   recovery.data?.records || [],
            cycles:     cycles.data?.records   || [],
            workouts:   workouts.data?.records || [],
            body:       body.data || null,
            profile:    profile.data || null,
            errors: {
              sleep: sleep.error, recovery: recovery.error, cycles: cycles.error,
              workouts: workouts.error, body: body.error, profile: profile.error,
            },
          }, 200, origin);
        } catch (e) {
          return jsonResponse({ error: e.message }, 500, origin);
        }
      }

      // V3 AUTH
      if (path === '/auth/request' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = (body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
          auditStatus = 400;
          return jsonResponse({ error: 'invalid_email' }, 400, origin);
        }
        const recent = await env.DB.prepare(
          `SELECT created_at FROM auth_tokens WHERE email = ? ORDER BY created_at DESC LIMIT 1`
        ).bind(email).first();
        if (recent && (Date.now() - recent.created_at < 60_000)) {
          auditStatus = 429;
          return jsonResponse({ error: 'too_many_requests', retry_after: 60 }, 429, origin);
        }
        // v3.1.1: generate 6-digit OTP, store hash in token column
        const otp = generateOTP();
        const otpHash = await sha256Hex(otp);
        await env.DB.prepare(
          `INSERT INTO auth_tokens (token, email, created_at, expires_at, return_to) VALUES (?, ?, ?, ?, ?)`
        ).bind(otpHash, email, Date.now(), Date.now() + TOKEN_TTL_MS, '').run();
        await sendOTPEmail(env, email, otp);
        await logAudit(env, request, null, '/auth/request', 200);
        return jsonResponse({ ok: true, email }, 200, origin);
      }

      // v3.1.1: OTP verification — frontend POSTs {email, code}, no redirect needed
      if (path === '/auth/verify-code' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = (body.email || '').trim().toLowerCase();
        const code  = (body.code  || '').trim();
        if (!email || !code) {
          return jsonResponse({ error: 'missing_fields' }, 400, origin);
        }
        const codeHash = await sha256Hex(code);
        const row = await env.DB.prepare(
          `SELECT email, expires_at, used_at FROM auth_tokens WHERE token = ? AND email = ?`
        ).bind(codeHash, email).first();
        if (!row) {
          return jsonResponse({ error: 'invalid_code' }, 400, origin);
        }
        if (row.used_at) {
          return jsonResponse({ error: 'code_already_used' }, 400, origin);
        }
        if (row.expires_at < Date.now()) {
          return jsonResponse({ error: 'code_expired' }, 400, origin);
        }
        await env.DB.prepare(`UPDATE auth_tokens SET used_at = ? WHERE token = ?`).bind(Date.now(), codeHash).run();
        let userRow = await env.DB.prepare(`SELECT id, enc_key, name FROM users WHERE email = ?`).bind(email).first();
        if (!userRow) {
          const newUserId = crypto.randomUUID();
          const encKey = generateEncKey();
          await env.DB.prepare(
            `INSERT INTO users (id, email, created_at, last_sign_in_at, enc_key) VALUES (?, ?, ?, ?, ?)`
          ).bind(newUserId, email, Date.now(), Date.now(), encKey).run();
          userRow = { id: newUserId, enc_key: encKey, name: null };
        } else {
          await env.DB.prepare(`UPDATE users SET last_sign_in_at = ? WHERE id = ?`).bind(Date.now(), userRow.id).run();
        }
        const sid = randomHex(32);
        const ua = request.headers.get('User-Agent') || '';
        await env.DB.prepare(
          `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(sid, userRow.id, Date.now(), Date.now() + SESSION_TTL_MS, Date.now(), ua.slice(0, 200)).run();
        await logAudit(env, request, { user_id: userRow.id }, '/auth/verify-code', 200);
        return jsonResponse({
          ok: true,
          signed_in: true,
          user: { id: userRow.id, email, name: userRow.name || null },
        }, 200, origin, { 'Set-Cookie': setSessionCookieHeader(sid) });
      }

      // v3.1.1: /auth/verify kept for backwards compat (old magic links already sent)
      if (path === '/auth/verify' && method === 'GET') {
        const token = url.searchParams.get('token');
        if (!token) return new Response('Missing token.', { status: 400 });
        const row = await env.DB.prepare(
          `SELECT email, expires_at, used_at, return_to FROM auth_tokens WHERE token = ?`
        ).bind(token).first();
        if (!row) return new Response('Invalid or expired link.', { status: 400 });
        if (row.used_at) return new Response('This link has already been used.', { status: 400 });
        if (row.expires_at < Date.now()) return new Response('This link has expired. Please request a new one.', { status: 400 });
        await env.DB.prepare(`UPDATE auth_tokens SET used_at = ? WHERE token = ?`).bind(Date.now(), token).run();
        let userRow = await env.DB.prepare(`SELECT id, enc_key FROM users WHERE email = ?`).bind(row.email).first();
        if (!userRow) {
          const newUserId = crypto.randomUUID();
          const encKey = generateEncKey();
          await env.DB.prepare(
            `INSERT INTO users (id, email, created_at, last_sign_in_at, enc_key) VALUES (?, ?, ?, ?, ?)`
          ).bind(newUserId, row.email, Date.now(), Date.now(), encKey).run();
          userRow = { id: newUserId, enc_key: encKey };
        } else {
          await env.DB.prepare(`UPDATE users SET last_sign_in_at = ? WHERE id = ?`).bind(Date.now(), userRow.id).run();
        }
        const sid = randomHex(32);
        const ua = request.headers.get('User-Agent') || '';
        await env.DB.prepare(
          `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(sid, userRow.id, Date.now(), Date.now() + SESSION_TTL_MS, Date.now(), ua.slice(0, 200)).run();
        await logAudit(env, request, { user_id: userRow.id }, '/auth/verify', 200);
        const returnTo = (row.return_to && isAllowedOrigin(row.return_to)) ? row.return_to : env.APP_URL;
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `${returnTo}/?signed_in=1`,
            'Set-Cookie': setSessionCookieHeader(sid),
          },
        });
      }

      if (path === '/auth/logout' && method === 'POST') {
        user = await getSessionUser(request, env);
        if (user) {
          await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(user.sid).run();
        }
        return jsonResponse({ ok: true }, 200, origin, { 'Set-Cookie': clearSessionCookieHeader() });
      }

      if (path === '/auth/me' && method === 'GET') {
        user = await getSessionUser(request, env);
        if (!user) return jsonResponse({ signed_in: false }, 200, origin);
        // v3.2.1: re-issue the session cookie on every /auth/me response.
        // This is critical for iOS Safari ITP — cookies set on cross-origin
        // JSON responses are sometimes deferred; re-issuing on the follow-up
        // /auth/me call (which fires after user interaction) gives Safari a
        // second chance to commit the cookie.
        await env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
          .bind(Date.now(), user.sid).run();
        return jsonResponse({
          signed_in: true,
          user: { id: user.user_id, email: user.email, name: user.name },
        }, 200, origin, { 'Set-Cookie': setSessionCookieHeader(user.sid) });
      }

      // STATE / MIGRATION
      if (path === '/api/state' || path === '/api/migrate' || path === '/api/account/delete') {
        user = await getSessionUser(request, env);
        if (!user) {
          auditStatus = 401;
          return jsonResponse({ error: 'not_signed_in' }, 401, origin);
        }
      }

      // v3.2.0 — Examen tone analysis via Claude Haiku
      // Called async after examen save. Returns { tone, topics } for the given examen.
      if (path === '/api/examen-tone' && method === 'POST') {
        user = await getSessionUser(request, env);
        if (!user) return jsonResponse({ error: 'not_signed_in' }, 401, origin);
        const body = await request.json().catch(() => ({}));
        const { went_well = '', went_poorly = '', remains = '' } = body;
        const text = [went_well, went_poorly, remains].filter(Boolean).join('\n\n').trim();
        if (!text || text.length < 10) {
          return jsonResponse({ tone: null, topics: [] }, 200, origin);
        }
        if (!env.ANTHROPIC_API_KEY) {
          return jsonResponse({ error: 'no_api_key' }, 500, origin);
        }
        try {
          const prompt = `You are analyzing a private evening reflection. Read it and return ONLY valid JSON with two fields:
- "tone": a single lowercase word capturing the emotional tone (e.g. settled, restless, tired, open, grounded, scattered, tender, heavy, light, grateful, anxious, quiet)
- "topics": an array of 2-5 lowercase words or short phrases for what the person was thinking about (e.g. "work", "sleep", "family", "a difficult conversation")

The reflection:
---
${text.slice(0, 1200)}
---

Return ONLY the JSON object. No explanation, no markdown, no backticks.`;

          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'anthropic-version': '2023-06-01',
              'x-api-key': env.ANTHROPIC_API_KEY,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 120,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (!r.ok) {
            const err = await r.text();
            console.error('Anthropic error:', r.status, err);
            return jsonResponse({ tone: null, topics: [] }, 200, origin);
          }
          const data = await r.json();
          const raw = (data.content?.[0]?.text || '').trim();
          let parsed = {};
          try { parsed = JSON.parse(raw); } catch { /* malformed — return empty */ }
          const tone   = typeof parsed.tone === 'string' ? parsed.tone.toLowerCase().slice(0, 30) : null;
          const topics = Array.isArray(parsed.topics)
            ? parsed.topics.slice(0, 5).map(t => String(t).toLowerCase().slice(0, 40))
            : [];
          await logAudit(env, request, { user_id: user.user_id }, '/api/examen-tone', 200);
          return jsonResponse({ tone, topics }, 200, origin);
        } catch (e) {
          console.error('examen-tone error:', e);
          return jsonResponse({ tone: null, topics: [] }, 200, origin);
        }
      }

      if (path === '/api/state' && method === 'GET') {
        const row = await env.DB.prepare(
          `SELECT state_json, updated_at FROM user_state WHERE user_id = ?`
        ).bind(user.user_id).first();
        if (!row) return jsonResponse({ state: null, updated_at: null }, 200, origin);
        const decrypted = await decryptForUser(row.state_json, user.enc_key);
        return jsonResponse({ state: JSON.parse(decrypted), updated_at: row.updated_at }, 200, origin);
      }

      if (path === '/api/state' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.state) return jsonResponse({ error: 'missing_state' }, 400, origin);
        const enc = await encryptForUser(JSON.stringify(body.state), user.enc_key);
        await env.DB.prepare(
          `INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
        ).bind(user.user_id, enc, Date.now()).run();
        // v3.1.0: also persist the name to users.name if state has it
        // This makes /auth/me return the right name on next sign-in.
        const stateName = body.state.profile && body.state.profile.name;
        if (stateName && stateName !== 'there' && stateName.trim()) {
          await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
            .bind(stateName.trim().slice(0, 60), user.user_id).run();
        }
        return jsonResponse({ ok: true, updated_at: Date.now() }, 200, origin);
      }

      if (path === '/api/migrate' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.localStorage_json) return jsonResponse({ error: 'missing_data' }, 400, origin);
        let parsed;
        try { parsed = typeof body.localStorage_json === 'string' ? JSON.parse(body.localStorage_json) : body.localStorage_json; }
        catch { return jsonResponse({ error: 'invalid_json' }, 400, origin); }
        if (typeof parsed !== 'object' || parsed === null) {
          return jsonResponse({ error: 'invalid_state_shape' }, 400, origin);
        }
        const enc = await encryptForUser(JSON.stringify(parsed), user.enc_key);
        await env.DB.prepare(
          `INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
        ).bind(user.user_id, enc, Date.now()).run();
        // v3.1.0: persist the migrated name to users.name
        const migName = parsed.profile && parsed.profile.name;
        if (migName && migName !== 'there' && migName.trim()) {
          await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
            .bind(migName.trim().slice(0, 60), user.user_id).run();
        }
        const summary = {
          examens:  Array.isArray(parsed.examens)  ? parsed.examens.length  : 0,
          captures: Array.isArray(parsed.captures) ? parsed.captures.length : 0,
          chapters: Array.isArray(parsed.chapters) ? parsed.chapters.length : 0,
          people:   Array.isArray(parsed.people)   ? parsed.people.length   : 0,
          workouts: Array.isArray(parsed.workouts) ? parsed.workouts.length : 0,
        };
        return jsonResponse({ ok: true, summary }, 200, origin);
      }

      if (path === '/api/account/delete' && method === 'POST') {
        try {
          const wh = await getProviderTokens(env, user.user_id, user.enc_key, 'whoop');
          if (wh) {
            await fetch('https://api.prod.whoop.com/oauth/oauth2/revoke', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                token: wh.access_token,
                client_id: env.WHOOP_CLIENT_ID,
                client_secret: env.WHOOP_CLIENT_SECRET,
              }).toString(),
            }).catch(() => {});
          }
        } catch {}
        await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.user_id).run();
        return jsonResponse({ ok: true }, 200, origin, { 'Set-Cookie': clearSessionCookieHeader() });
      }

      // V3 WHOOP
      if (path.startsWith('/whoop/')) {
        user = await getSessionUser(request, env);
        if (!user) {
          if (path === '/whoop/auth/start') {
            return Response.redirect(`${env.APP_URL}/?error=not_signed_in`, 302);
          }
          auditStatus = 401;
          return jsonResponse({ error: 'not_signed_in' }, 401, origin);
        }
      }

      if (path === '/whoop/auth/start' && method === 'GET') {
        const state = randomHex(8);
        const returnTo = url.searchParams.get('return_to') || env.APP_URL;
        const safeReturn = isAllowedOrigin(returnTo) ? returnTo : env.APP_URL;
        await env.TOKENS.put(`oauth_state:${state}`, JSON.stringify({ user_id: user.user_id, provider: 'whoop', return_to: safeReturn }), { expirationTtl: 600 });
        const authUrl = new URL(WHOOP_AUTH_URL);
        authUrl.searchParams.set('client_id',     env.WHOOP_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri',  `${env.WORKER_URL}/whoop/auth/callback`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope',         WHOOP_SCOPES);
        authUrl.searchParams.set('state',         state);
        return Response.redirect(authUrl.toString(), 302);
      }

      if (path === '/whoop/auth/callback' && method === 'GET') {
        const code  = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        if (error) {
          return new Response(`<h1>Whoop auth declined</h1><p>${error}</p><p><a href="${env.APP_URL}">Return to Kuzuri</a></p>`, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }
        if (!code || !state) return new Response('Missing code or state', { status: 400 });
        const stateRaw = await env.TOKENS.get(`oauth_state:${state}`);
        if (!stateRaw) return new Response('Invalid or expired state', { status: 400 });
        await env.TOKENS.delete(`oauth_state:${state}`);
        const { user_id } = JSON.parse(stateRaw);
        const userRow = await env.DB.prepare(`SELECT enc_key FROM users WHERE id = ?`).bind(user_id).first();
        if (!userRow) return new Response('User not found', { status: 400 });
        const body = new URLSearchParams({
          grant_type:    'authorization_code',
          code:          code,
          redirect_uri:  `${env.WORKER_URL}/whoop/auth/callback`,
          client_id:     env.WHOOP_CLIENT_ID,
          client_secret: env.WHOOP_CLIENT_SECRET,
        });
        const r = await fetch(WHOOP_TOKEN_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    body.toString(),
        });
        if (!r.ok) return new Response(`<h1>Whoop token exchange failed</h1><pre>${r.status}\n${await r.text()}</pre>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
        const tokens = await r.json();
        await saveProviderTokens(env, user_id, userRow.enc_key, 'whoop', tokens);
        const stateData = JSON.parse(stateRaw);
        const returnTo = stateData.return_to || env.APP_URL;
        return Response.redirect(`${returnTo}/?whoop=connected`, 302);
      }

      if (path === '/whoop/status' && method === 'GET') {
        // v3.3.8: removed legacy tokens:default fallback — was showing Whoop as
        // Connected for all users if any global token existed. Now strictly per-user.
        const tokens = await getProviderTokens(env, user.user_id, user.enc_key, 'whoop').catch(() => null);
        if (!tokens) {
          return jsonResponse({ connected: false }, 200, origin);
        }
        let profile = null;
        try {
          const p = await safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/user/profile/basic');
          profile = p.data;
        } catch {}
        return jsonResponse({ connected: true, expires_at: tokens.expires_at, profile }, 200, origin);
      }

      if (path === '/whoop/disconnect' && method === 'POST') {
        await deleteProviderTokens(env, user.user_id, 'whoop');
        return jsonResponse({ disconnected: true }, 200, origin);
      }

      if (path === '/whoop/sync' && method === 'GET') {
        const since = url.searchParams.get('since')
          || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const [sleep, recovery, cycles, workouts, body, profile] = await Promise.all([
          safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/activity/sleep',     { start: since, limit: 25 }),
          safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/recovery',           { start: since, limit: 25 }),
          safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/cycle',              { start: since, limit: 25 }),
          safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/activity/workout',   { start: since, limit: 25 }),
          safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/user/measurement/body'),
          safeWhoopFetch(env, user.user_id, user.enc_key, '/developer/v2/user/profile/basic'),
        ]);
        await env.DB.prepare(`UPDATE provider_tokens SET last_synced_at = ? WHERE user_id = ? AND provider = 'whoop'`)
          .bind(Date.now(), user.user_id).run();
        return jsonResponse({
          since,
          synced_at:  new Date().toISOString(),
          sleep:      sleep.data?.records   || [],
          recovery:   recovery.data?.records || [],
          cycles:     cycles.data?.records   || [],
          workouts:   workouts.data?.records || [],
          body:       body.data || null,
          profile:    profile.data || null,
          errors: {
            sleep:    sleep.error,
            recovery: recovery.error,
            cycles:   cycles.error,
            workouts: workouts.error,
            body:     body.error,
            profile:  profile.error,
          },
        }, 200, origin);
      }

      // V3 OURA
      if (path.startsWith('/oura/')) {
        user = await getSessionUser(request, env);
        if (!user) {
          if (path === '/oura/auth/start') {
            return Response.redirect(`${env.APP_URL}/?error=not_signed_in`, 302);
          }
          return jsonResponse({ error: 'not_signed_in' }, 401, origin);
        }
      }

      if (path === '/oura/auth/start' && method === 'GET') {
        if (!env.OURA_CLIENT_ID) return jsonResponse({ error: 'oura_not_configured' }, 503, origin);
        const state = randomHex(8);
        const returnTo = url.searchParams.get('return_to') || env.APP_URL;
        const safeReturn = isAllowedOrigin(returnTo) ? returnTo : env.APP_URL;
        await env.TOKENS.put(`oauth_state:${state}`, JSON.stringify({ user_id: user.user_id, provider: 'oura', return_to: safeReturn }), { expirationTtl: 600 });
        const authUrl = new URL(OURA_AUTH_URL);
        authUrl.searchParams.set('client_id',     env.OURA_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri',  `${env.WORKER_URL}/oura/auth/callback`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope',         OURA_SCOPES);
        authUrl.searchParams.set('state',         state);
        return Response.redirect(authUrl.toString(), 302);
      }

      if (path === '/oura/auth/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) return new Response('Missing code or state', { status: 400 });
        const stateRaw = await env.TOKENS.get(`oauth_state:${state}`);
        if (!stateRaw) return new Response('Invalid or expired state', { status: 400 });
        await env.TOKENS.delete(`oauth_state:${state}`);
        const { user_id } = JSON.parse(stateRaw);
        const userRow = await env.DB.prepare(`SELECT enc_key FROM users WHERE id = ?`).bind(user_id).first();
        if (!userRow) return new Response('User not found', { status: 400 });
        const body = new URLSearchParams({
          grant_type:    'authorization_code',
          code:          code,
          redirect_uri:  `${env.WORKER_URL}/oura/auth/callback`,
          client_id:     env.OURA_CLIENT_ID,
          client_secret: env.OURA_CLIENT_SECRET,
        });
        const r = await fetch(OURA_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!r.ok) return new Response(`<h1>Oura token exchange failed</h1><pre>${r.status}\n${await r.text()}</pre>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
        const tokens = await r.json();
        await saveProviderTokens(env, user_id, userRow.enc_key, 'oura', tokens);
        const stateData = JSON.parse(stateRaw);
        const returnTo = stateData.return_to || env.APP_URL;
        return Response.redirect(`${returnTo}/?oura=connected`, 302);
      }

      if (path === '/oura/status' && method === 'GET') {
        const tokens = await getProviderTokens(env, user.user_id, user.enc_key, 'oura').catch(() => null);
        return jsonResponse({ connected: !!tokens, expires_at: tokens?.expires_at || null }, 200, origin);
      }

      if (path === '/oura/disconnect' && method === 'POST') {
        await deleteProviderTokens(env, user.user_id, 'oura');
        return jsonResponse({ disconnected: true }, 200, origin);
      }

      if (path === '/oura/sync' && method === 'GET') {
        const since = url.searchParams.get('since')
          || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const [sleep, daily, readiness, workouts] = await Promise.all([
          safeOuraFetch(env, user.user_id, user.enc_key, '/v2/usercollection/sleep',           { start_date: since }),
          safeOuraFetch(env, user.user_id, user.enc_key, '/v2/usercollection/daily_activity',  { start_date: since }),
          safeOuraFetch(env, user.user_id, user.enc_key, '/v2/usercollection/daily_readiness', { start_date: since }),
          safeOuraFetch(env, user.user_id, user.enc_key, '/v2/usercollection/workout',         { start_date: since }),
        ]);
        await env.DB.prepare(`UPDATE provider_tokens SET last_synced_at = ? WHERE user_id = ? AND provider = 'oura'`)
          .bind(Date.now(), user.user_id).run();
        return jsonResponse({
          since,
          synced_at: new Date().toISOString(),
          sleep:     sleep.data?.data     || [],
          daily:     daily.data?.data     || [],
          readiness: readiness.data?.data || [],
          workouts:  workouts.data?.data  || [],
          errors: { sleep: sleep.error, daily: daily.error, readiness: readiness.error, workouts: workouts.error },
        }, 200, origin);
      }

      return new Response('Not found', { status: 404 });

    } catch (e) {
      const msg = e?.message || String(e);
      auditStatus = 500;
      if (msg === 'NOT_CONNECTED') {
        auditStatus = 401;
        return jsonResponse({ error: 'not_connected' }, 401, origin);
      }
      return jsonResponse({ error: msg }, 500, origin);
    } finally {
      ctx.waitUntil(logAudit(env, request, user, path, auditStatus));
    }
  },
};
