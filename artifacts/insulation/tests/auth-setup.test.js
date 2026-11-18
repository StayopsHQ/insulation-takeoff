import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";

// An isolated, in-memory SQLite database using the real schema; never D1 or
// the user's local database. Adapt its statements to the Worker D1 interface.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0001_initial.sql", "0002_login_rate_limits.sql"]) {
    sqlite.exec(readFileSync(new URL(`../worker/migrations/${file}`, import.meta.url), "utf8"));
  }
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      const query = {
        bind(...args) { values = args; return query; },
        async first() { return statement.get(...values) || null; },
        async run() { return { meta: statement.run(...values) }; }
      };
      return query;
    }
  };
}

function request(path, body, cookie) {
  return new Request(`https://takeoff.test/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: "https://takeoff.test", ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test("first-admin setup, session, login and team creation work under the hosted PBKDF2 cap", async t => {
  const original = crypto.subtle.deriveBits.bind(crypto.subtle);
  let rejectedLegacyCost = false;
  t.mock.method(crypto.subtle, "deriveBits", async (algorithm, ...args) => {
    if (algorithm.name === "PBKDF2" && algorithm.iterations > 100000) {
      rejectedLegacyCost = true;
      throw new Error("Pbkdf2 failed: iteration counts above 100000 are not supported.");
    }
    return original(algorithm, ...args);
  });
  // Prove this test catches the original production-incompatible operation.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("test"), "PBKDF2", false, ["deriveBits"]);
  await assert.rejects(crypto.subtle.deriveBits({ name: "PBKDF2", salt: new Uint8Array(16), iterations: 310000, hash: "SHA-256" }, key, 256), /above 100000/);
  assert.equal(rejectedLegacyCost, true);

  const DB = database();
  t.after(() => DB.sqlite.close());
  const env = { DB, SETUP_TOKEN: "test-only-setup-token" };
  const account = { setupToken: env.SETUP_TOKEN, email: "admin@example.test", displayName: "Test admin", password: "test-only-long-password" };
  assert.equal((await worker.fetch(request("me"), env)).status, 428);
  assert.equal((await worker.fetch(request("setup", { ...account, setupToken: "wrong" }), env)).status, 403);
  assert.equal((await worker.fetch(request("setup", { ...account, password: "short" }), env)).status, 400);
  const setup = await worker.fetch(request("setup", account), env);
  assert.equal(setup.status, 201);
  const payload = await setup.json();
  assert.equal(payload.user.role, "admin");
  assert.equal(payload.user.password_hash, undefined);
  const stored = DB.sqlite.prepare("SELECT password_hash FROM users").get();
  assert.match(stored.password_hash, /^pbkdf2-sha256\$100000\$/);
  const cookie = setup.headers.get("Set-Cookie").split(";")[0];
  assert.equal((await worker.fetch(request("me", null, cookie), env)).status, 200);
  assert.equal((await worker.fetch(request("setup", account), env)).status, 409);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  assert.equal((await worker.fetch(request("logout", {}, cookie), env)).status, 200);
  assert.equal((await worker.fetch(request("me", null, cookie), env)).status, 401);
  assert.equal((await worker.fetch(request("login", { ...account, password: "wrong-password" }), env)).status, 401);
  const login = await worker.fetch(request("login", account), env);
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get("Set-Cookie").split(";")[0];
  assert.equal((await worker.fetch(request("me", null, loginCookie), env)).status, 200);
  const member = { email: "member@example.test", displayName: "Test member", password: "test-only-member-password" };
  assert.equal((await worker.fetch(request("users", member, loginCookie), env)).status, 201);
  assert.equal((await worker.fetch(request("login", member), env)).status, 200);
});
