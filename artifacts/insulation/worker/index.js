const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const SESSION_COOKIE = "takeoff_session";
const NATIVE_APP_ORIGIN = "capacitor://localhost";
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function nowIso() { return new Date().toISOString(); }
function makeId() { return crypto.randomUUID(); }
function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function requestIp(request) { return request.headers.get("CF-Connecting-IP") || "unknown"; }
async function rateLimitKeys(request, email) {
  return {
    ip: await sha256(`login-ip:${requestIp(request)}`),
    email: await sha256(`login-email:${normalizeEmail(email)}`)
  };
}
async function enforceSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return;
  let parsed;
  try { parsed = new URL(origin); } catch { throw new HttpError(403, "Invalid request origin."); }
  if (parsed.origin !== new URL(request.url).origin && parsed.origin !== NATIVE_APP_ORIGIN) {
    throw new HttpError(403, "Cross-origin request blocked.");
  }
}
function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && origin !== NATIVE_APP_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  };
}
function withCors(request, response) {
  const headers = corsHeaders(request);
  if (!Object.keys(headers).length) return response;
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function parseCookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "").split(";").map(part => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}
async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
// Store the PBKDF2 work factor with each new hash so sign-in uses the
// exact parameters used at account creation. Legacy hashes keep their old factor.
const PASSWORD_HASH_ITERATIONS = 100000;
const LEGACY_PASSWORD_HASH_ITERATIONS = 310000;

async function passwordHash(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromBase64url(salt), iterations, hash: "SHA-256" }, material, 256);
  return base64url(new Uint8Array(bits));
}

function storedPasswordHash(hash, iterations = PASSWORD_HASH_ITERATIONS) {
  return `pbkdf2-sha256:${iterations}:${hash}`;
}

function parseStoredPasswordHash(value) {
  const match = /^pbkdf2-sha256:(\d+):([A-Za-z0-9_-]+)$/.exec(value || "");
  if (match) return { iterations: Number(match[1]), hash: match[2] };
  return { iterations: LEGACY_PASSWORD_HASH_ITERATIONS, hash: value };
}
function secureCookie(request, token, maxAge) {
  const nativeOrigin = request.headers.get("Origin") === NATIVE_APP_ORIGIN;
  const secure = new URL(request.url).protocol === "https:" || nativeOrigin ? "; Secure" : "";
  const sameSite = nativeOrigin ? "None" : "Lax";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}
function clearCookie(request) {
  const nativeOrigin = request.headers.get("Origin") === NATIVE_APP_ORIGIN;
  const secure = new URL(request.url).protocol === "https:" || nativeOrigin ? "; Secure" : "";
  const sameSite = nativeOrigin ? "None" : "Lax";
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=0${secure}`;
}
async function bodyJson(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, "Request body must be valid JSON."); }
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireString(value, label, max = 500) {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) throw new HttpError(400, `${label} is required and must be at most ${max} characters.`);
  return result;
}
async function currentUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, u.role, s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, nowIso()).first();
  return row || null;
}
async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}
async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new HttpError(403, "Administrator permission required.");
  return user;
}
async function hasJobAccess(env, jobId, userId, write = false) {
  const row = await env.DB.prepare(`
    SELECT jm.permission FROM job_members jm
    WHERE jm.job_id = ? AND jm.user_id = ?
  `).bind(jobId, userId).first();
  if (!row) throw new HttpError(404, "Job not found.");
  if (write && row.permission === "viewer") throw new HttpError(403, "This account has read-only access.");
  return row.permission;
}
async function createSession(request, env, userId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(tokenBytes);
  const tokenHash = await sha256(token);
  const days = Math.max(1, Math.min(30, Number(env.SESSION_DAYS || 14)));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)")
    .bind(makeId(), userId, tokenHash, expiresAt, nowIso()).run();
  return secureCookie(request, token, days * 86400);
}
async function createUser(env, { email, password, displayName, role = "member" }) {
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized)) throw new HttpError(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length < 12 || password.length > 200) {
    throw new HttpError(400, "Password must be between 12 and 200 characters.");
  }
  const name = requireString(displayName, "Display name", 100);
  const salt = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const hash = storedPasswordHash(await passwordHash(password, salt));
  const id = makeId();
  try {
    await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, normalized, name, hash, salt, role, nowIso()).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new HttpError(409, "An account with that email already exists.");
    throw error;
  }
  return { id, email: normalized, displayName: name, role };
}
function serializeJob(row) {
  return { id: row.id, name: row.name, builder: row.builder, subdivision: row.subdivision, lot: row.lot, address: row.address, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}
function serializeMeasurement(row) {
  let parsed = null;
  try { parsed = row.parsed_json ? JSON.parse(row.parsed_json) : null; } catch {}
  return { id: row.id, section: row.section, rawTranscript: row.raw_transcript, parsed, status: row.status, message: row.message, createdAt: row.created_at, updatedAt: row.updated_at };
}
async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health" && method === "GET") return json({ ok: true, service: "insulation-takeoff" });

  if (path === "/api/setup" && method === "POST") {
    const body = await bodyJson(request);
    if (!env.SETUP_TOKEN || typeof body.setupToken !== "string" || body.setupToken !== env.SETUP_TOKEN) {
      throw new HttpError(403, "Invalid setup token.");
    }
    const normalized = normalizeEmail(body.email);
    if (!validEmail(normalized)) throw new HttpError(400, "Enter a valid email address.");
    if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 200) {
      throw new HttpError(400, "Password must be between 12 and 200 characters.");
    }
    const displayName = requireString(body.displayName, "Display name", 100);
    const salt = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const hash = storedPasswordHash(await passwordHash(body.password, salt));
    const id = makeId();
    // A single conditional INSERT makes first-admin creation atomic under concurrent requests.
    const inserted = await env.DB.prepare(`
      INSERT INTO users (id,email,display_name,password_hash,password_salt,role,created_at)
      SELECT ?,?,?,?,?, 'admin', ? WHERE NOT EXISTS (SELECT 1 FROM users)
    `).bind(id, normalized, displayName, hash, salt, nowIso()).run();
    if (!Number(inserted.meta?.changes || 0)) {
      throw new HttpError(409, "Initial setup has already been completed.");
    }
    const user = { id, email: normalized, displayName, role: "admin" };
    const cookie = await createSession(request, env, user.id);
    return json({ user }, 201, { "Set-Cookie": cookie });
  }

  if (path === "/api/login" && method === "POST") {
    const body = await bodyJson(request);
    const email = normalizeEmail(body.email);
    if (!validEmail(email) || typeof body.password !== "string" || body.password.length > 200) {
      throw new HttpError(401, "Email or password is incorrect.");
    }
    const keys = await rateLimitKeys(request, email);
    await env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(new Date(Date.now() - 86400000).toISOString()).run();
    const recent = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN ip_key = ? THEN 1 ELSE 0 END) AS ip_count,
        SUM(CASE WHEN email_key = ? THEN 1 ELSE 0 END) AS email_count
      FROM login_attempts WHERE attempted_at > ?
    `).bind(keys.ip, keys.email, new Date(Date.now() - 15 * 60000).toISOString()).first();
    if (Number(recent?.ip_count || 0) >= 20 || Number(recent?.email_count || 0) >= 8) {
      throw new HttpError(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
    }
    const row = await env.DB.prepare("SELECT id,email,display_name,password_hash,password_salt,role FROM users WHERE email = ?").bind(email).first();
    const stored = row ? parseStoredPasswordHash(row.password_hash) : null;
    const candidate = row ? await passwordHash(body.password, row.password_salt, stored.iterations) : "";
    if (!row || candidate !== stored.hash) {
      await env.DB.prepare("INSERT INTO login_attempts (ip_key,email_key,attempted_at) VALUES (?,?,?)")
        .bind(keys.ip, keys.email, nowIso()).run();
      throw new HttpError(401, "Email or password is incorrect.");
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE ip_key = ? OR email_key = ?").bind(keys.ip, keys.email).run();
    const cookie = await createSession(request, env, row.id);
    return json({ user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role } }, 200, { "Set-Cookie": cookie });
  }

  if (path === "/api/logout" && method === "POST") {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie(request) });
  }

  if (path === "/api/me" && method === "GET") {
    const user = await currentUser(request, env);
    if (!user) {
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
      if (!Number(count?.count || 0)) throw new HttpError(428, "SETUP_REQUIRED");
      throw new HttpError(401, "Please sign in.");
    }
    return json({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
  }

  if (path === "/api/users" && method === "POST") {
    await requireAdmin(request, env);
    const body = await bodyJson(request);
    const user = await createUser(env, body);
    return json({ user }, 201);
  }

  if (path === "/api/jobs" && method === "GET") {
    const user = await requireUser(request, env);
    const result = await env.DB.prepare(`
      SELECT j.* FROM jobs j JOIN job_members jm ON jm.job_id = j.id
      WHERE jm.user_id = ? ORDER BY j.updated_at DESC
    `).bind(user.id).all();
    return json({ jobs: (result.results || []).map(serializeJob) });
  }

  if (path === "/api/jobs" && method === "POST") {
    const user = await requireUser(request, env);
    const body = await bodyJson(request);
    const id = makeId(), now = nowIso();
    const name = requireString(body.name, "Job name");
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO jobs (id,name,builder,subdivision,lot,address,status,created_by,created_at,updated_at)
        VALUES (?,?,?,?,? ,?,'In progress',?,?,?)`).bind(id, name, body.builder || "", body.subdivision || "", body.lot || "", body.address || "", user.id, now, now),
      env.DB.prepare("INSERT INTO job_members (job_id,user_id,permission) VALUES (?,?,?)").bind(id, user.id, "owner")
    ]);
    const row = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first();
    return json({ job: serializeJob(row) }, 201);
  }

  const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch && method === "PATCH") {
    const user = await requireUser(request, env);
    const id = decodeURIComponent(jobMatch[1]);
    await hasJobAccess(env, id, user.id, true);
    const body = await bodyJson(request);
    const allowed = ["name", "builder", "subdivision", "lot", "address", "status"];
    const assignments = [];
    const values = [];
    for (const key of allowed) {
      if (Object.hasOwn(body, key)) {
        if (key === "status" && !["In progress", "Completed"].includes(body[key])) throw new HttpError(400, "Invalid job status.");
        if (key === "name") requireString(body[key], "Job name");
        assignments.push(`${key} = ?`);
        values.push(key === "name" ? String(body[key]).trim() : String(body[key] ?? ""));
      }
    }
    if (!assignments.length) throw new HttpError(400, "No supported fields provided.");
    assignments.push("updated_at = ?");
    values.push(nowIso(), id);
    await env.DB.prepare(`UPDATE jobs SET ${assignments.join(", ")} WHERE id = ?`).bind(...values).run();
    const row = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first();
    return json({ job: serializeJob(row) });
  }

  const shareMatch = path.match(/^\/api\/jobs\/([^/]+)\/members$/);
  if (shareMatch && method === "POST") {
    const user = await requireUser(request, env);
    const jobId = decodeURIComponent(shareMatch[1]);
    const permission = await hasJobAccess(env, jobId, user.id, true);
    if (permission !== "owner" && user.role !== "admin") throw new HttpError(403, "Only the job owner or an administrator can share this job.");
    const body = await bodyJson(request);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) throw new HttpError(400, "Enter a valid team member email.");
    const member = await env.DB.prepare("SELECT id,email,display_name FROM users WHERE email = ?").bind(email).first();
    if (!member) throw new HttpError(404, "No registered account uses that email. Create the team account first.");
    const memberPermission = body.permission === "viewer" ? "viewer" : "editor";
    await env.DB.prepare(`INSERT INTO job_members (job_id,user_id,permission) VALUES (?,?,?)
      ON CONFLICT(job_id,user_id) DO UPDATE SET permission=excluded.permission`)
      .bind(jobId, member.id, memberPermission).run();
    return json({ ok: true, member: { email: member.email, displayName: member.display_name, permission: memberPermission } });
  }

  const measurementsMatch = path.match(/^\/api\/jobs\/([^/]+)\/measurements$/);
  if (measurementsMatch) {
    const user = await requireUser(request, env);
    const jobId = decodeURIComponent(measurementsMatch[1]);
    await hasJobAccess(env, jobId, user.id, method !== "GET");
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM measurements WHERE job_id = ? ORDER BY created_at ASC").bind(jobId).all();
      return json({ measurements: (result.results || []).map(serializeMeasurement) });
    }
    if (method === "POST") {
      const body = await bodyJson(request);
      const id = makeId(), now = nowIso();
      const transcript = String(body.rawTranscript ?? "").slice(0, 5000);
      const section = body.section ? String(body.section).slice(0, 100) : null;
      const parsedJson = body.parsed == null ? null : JSON.stringify(body.parsed).slice(0, 20000);
      const status = String(body.status || "needs_review").slice(0, 40);
      const message = String(body.message || "").slice(0, 1000);
      await env.DB.prepare(`INSERT INTO measurements (id,job_id,section,raw_transcript,parsed_json,status,message,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, jobId, section, transcript, parsedJson, status, message, user.id, now, now).run();
      await env.DB.prepare("UPDATE jobs SET updated_at = ? WHERE id = ?").bind(now, jobId).run();
      const row = await env.DB.prepare("SELECT * FROM measurements WHERE id = ?").bind(id).first();
      return json({ measurement: serializeMeasurement(row) }, 201);
    }
  }

  const measurementMatch = path.match(/^\/api\/measurements\/([^/]+)$/);
  if (measurementMatch) {
    const user = await requireUser(request, env);
    const id = decodeURIComponent(measurementMatch[1]);
    const row = await env.DB.prepare("SELECT * FROM measurements WHERE id = ?").bind(id).first();
    if (!row) throw new HttpError(404, "Measurement not found.");
    await hasJobAccess(env, row.job_id, user.id, true);
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM measurements WHERE id = ?").bind(id).run();
      await env.DB.prepare("UPDATE jobs SET updated_at = ? WHERE id = ?").bind(nowIso(), row.job_id).run();
      return json({ ok: true });
    }
    if (method === "PATCH") {
      const body = await bodyJson(request);
      const section = body.section == null ? row.section : String(body.section).slice(0, 100);
      const transcript = body.rawTranscript == null ? row.raw_transcript : String(body.rawTranscript).slice(0, 5000);
      const parsedJson = body.parsed === undefined ? row.parsed_json : body.parsed == null ? null : JSON.stringify(body.parsed).slice(0, 20000);
      const status = body.status == null ? row.status : String(body.status).slice(0, 40);
      const message = body.message == null ? row.message : String(body.message).slice(0, 1000);
      const now = nowIso();
      await env.DB.prepare(`UPDATE measurements SET section=?,raw_transcript=?,parsed_json=?,status=?,message=?,updated_at=? WHERE id=?`)
        .bind(section, transcript, parsedJson, status, message, now, id).run();
      await env.DB.prepare("UPDATE jobs SET updated_at = ? WHERE id = ?").bind(now, row.job_id).run();
      const updated = await env.DB.prepare("SELECT * FROM measurements WHERE id = ?").bind(id).first();
      return json({ measurement: serializeMeasurement(updated) });
    }
  }

  return json({ error: "API route not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        const headers = corsHeaders(request);
        if (!headers["Access-Control-Allow-Origin"]) {
          return json({ error: "Cross-origin request blocked." }, 403);
        }
        return new Response(null, { status: 204, headers });
      }
      let response;
      try {
        if (!["GET", "HEAD"].includes(request.method)) await enforceSameOrigin(request);
        response = await handleApi(request, env, url);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        response = json({ error: status === 500 ? "Internal server error." : error.message }, status);
      }
      return withCors(request, response);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Application assets are not configured.", { status: 503 });
  }
};