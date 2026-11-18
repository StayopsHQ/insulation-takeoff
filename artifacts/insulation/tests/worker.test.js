import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

test("native iOS preflight allows only the Capacitor app origin with credentials", async () => {
  const request = new Request("https://takeoff.test/api/jobs", {
    method: "OPTIONS",
    headers: {
      Origin: "capacitor://localhost",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  const response = await worker.fetch(request, {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("unapproved native origins are rejected", async () => {
  const request = new Request("https://takeoff.test/api/jobs", {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.example" }
  });
  const response = await worker.fetch(request, {});

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("the former remote audio transcription route no longer exists", async () => {
  const request = new Request("https://takeoff.test/api/transcribe", {
    method: "POST",
    headers: { Origin: "https://takeoff.test" }
  });
  const response = await worker.fetch(request, {});

  assert.equal(response.status, 404);
  assert.match(await response.text(), /API route not found/);
});


test("first admin setup succeeds and creates a usable login session", async () => {
  const state = { users: [], sessions: [] };
  const db = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values=args; return statement; },
        async run() {
          if (sql.includes("INSERT INTO users")) {
            if (state.users.length) return { meta: { changes: 0 } };
            const [id,email,displayName,passwordHash,passwordSalt,createdAt] = values;
            state.users.push({id,email,display_name:displayName,password_hash:passwordHash,password_salt:passwordSalt,role:"admin",created_at:createdAt});
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO sessions")) { state.sessions.push(values); return { meta: { changes: 1 } }; }
          throw new Error("Unexpected DB write");
        },
        async first() {
          if (sql.includes("SELECT COUNT(*) AS count FROM users")) return { count: state.users.length };
          if (sql.includes("FROM sessions s JOIN users u")) {
            const cookieTokenHash=values[0];
            const row=state.sessions[0];
            if (!row || row[2] !== cookieTokenHash || row[3] <= values[1]) return null;
            return {id:state.users[0].id,email:state.users[0].email,displayName:state.users[0].display_name,role:"admin",expiresAt:row[3]};
          }
          if (sql.includes("FROM users WHERE email = ?")) return state.users.find(u=>u.email===values[0]) || null;
          if (sql.includes("SUM(CASE WHEN ip_key")) return {ip_count:0,email_count:0};
          throw new Error("Unexpected DB read");
        }
      };
      return statement;
    }
  };
  const env={DB:db,SETUP_TOKEN:"test-setup-token",SESSION_DAYS:"14"};
  const response=await worker.fetch(new Request("https://takeoff.test/api/setup",{
    method:"POST",headers:{Origin:"https://takeoff.test","Content-Type":"application/json"},
    body:JSON.stringify({setupToken:"test-setup-token",email:"greg@example.com",displayName:"Greg",password:"a-very-long-test-password"})
  }),env);
  assert.equal(response.status,201);
  assert.match(state.users[0].password_hash,/^pbkdf2-sha256:100000:/);
  assert.equal(state.sessions.length,1);
  const cookie=response.headers.get("Set-Cookie");
  assert.match(cookie,/takeoff_session=/);
  const me=await worker.fetch(new Request("https://takeoff.test/api/me",{headers:{Cookie:cookie.split(";")[0]}}),env);
  assert.equal(me.status,200);
  assert.equal((await me.json()).user.role,"admin");
});

test("second setup attempt is rejected without replacing the first admin", async () => {
  const state={users:[{id:"first",email:"first@example.com",display_name:"First",password_hash:"x",password_salt:"x",role:"admin"}]};
  const db={prepare(sql){let values=[];const s={bind(...a){values=a;return s;},async run(){return {meta:{changes:0}};},async first(){if(sql.includes("SELECT COUNT(*) AS count FROM users"))return {count:state.users.length};return null;}};return s;}};
  const response=await worker.fetch(new Request("https://takeoff.test/api/setup",{method:"POST",headers:{Origin:"https://takeoff.test","Content-Type":"application/json"},body:JSON.stringify({setupToken:"test-setup-token",email:"new@example.com",displayName:"New",password:"a-very-long-test-password"})}),{DB:db,SETUP_TOKEN:"test-setup-token"});
  assert.equal(response.status,409);
});
