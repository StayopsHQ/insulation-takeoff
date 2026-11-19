import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

function authenticatedEnv({ key = "test-openai-key" } = {}) {
  const queries = [];
  return {
    queries,
    env: {
      OPENAI_API_KEY: key,
      DB: {
        prepare(sql) {
          queries.push(sql);
          return {
            bind() {
              return {
                async first() {
                  if (sql.includes("FROM sessions")) {
                    return { id: "user-1", email: "greg@example.com", displayName: "Greg", role: "admin" };
                  }
                  if (sql.includes("FROM job_members")) return { permission: "owner" };
                  return null;
                }
              };
            }
          };
        }
      }
    }
  };
}

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

test("browser transcription status reports setup state without exposing credentials", async () => {
  const { env } = authenticatedEnv();
  const request = new Request("https://takeoff.test/api/transcription-status", {
    headers: { Cookie: "takeoff_session=test-session" }
  });
  const response = await worker.fetch(request, env);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(result, { available: true, provider: "OpenAI", model: "gpt-transcribe" });
  assert.equal(JSON.stringify(result).includes("test-openai-key"), false);
});

test("Worker uses the OpenAI secret without logging or returning it", async () => {
  const secret = "test-secret-that-must-not-leak";
  const { env } = authenticatedEnv({ key: secret });
  const originalFetch = globalThis.fetch;
  const originalConsole = Object.fromEntries(
    ["debug", "error", "info", "log", "warn"].map(name => [name, console[name]])
  );
  const capturedLogs = [];
  for (const name of Object.keys(originalConsole)) {
    console[name] = (...args) => capturedLogs.push(args.map(String).join(" "));
  }
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    return new Response(JSON.stringify({ error: { message: `Rejected credential: ${secret}` } }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const statusResponse = await worker.fetch(new Request("https://takeoff.test/api/transcription-status", {
      headers: { Cookie: "takeoff_session=test-session" }
    }), env);
    const statusBody = await statusResponse.text();

    const form = new FormData();
    form.set("jobId", "job-1");
    form.set("audio", new Blob(["recorded audio"], { type: "audio/webm" }), "voice.webm");
    const transcriptionResponse = await worker.fetch(new Request("https://takeoff.test/api/transcribe", {
      method: "POST",
      headers: { Origin: "https://takeoff.test", Cookie: "takeoff_session=test-session" },
      body: form
    }), env);
    const transcriptionBody = await transcriptionResponse.text();

    assert.equal(statusResponse.status, 200);
    assert.deepEqual(JSON.parse(statusBody), { available: true, provider: "OpenAI", model: "gpt-transcribe" });
    assert.equal(transcriptionResponse.status, 502);
    assert.match(transcriptionBody, /configured API credential/i);
    assert.equal(`${statusBody}\n${transcriptionBody}`.includes(secret), false);
    assert.equal(capturedLogs.join("\n").includes(secret), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, original] of Object.entries(originalConsole)) console[name] = original;
  }
});

test("browser transcription requires an authenticated job and configured OpenAI secret", async () => {
  const { env } = authenticatedEnv({ key: undefined });
  delete env.OPENAI_API_KEY;
  const form = new FormData();
  form.set("jobId", "job-1");
  form.set("audio", new Blob(["voice"], { type: "audio/webm" }), "voice.webm");
  const request = new Request("https://takeoff.test/api/transcribe", {
    method: "POST",
    headers: { Origin: "https://takeoff.test", Cookie: "takeoff_session=test-session" },
    body: form
  });
  const response = await worker.fetch(request, env);

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test("browser transcription rejects anonymous uploads before contacting OpenAI", async () => {
  const { env } = authenticatedEnv();
  const form = new FormData();
  form.set("jobId", "job-1");
  form.set("audio", new Blob(["voice"], { type: "audio/webm" }), "voice.webm");
  const request = new Request("https://takeoff.test/api/transcribe", {
    method: "POST",
    headers: { Origin: "https://takeoff.test" },
    body: form
  });
  const response = await worker.fetch(request, env);

  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /sign in/i);
});

test("browser transcription forwards one completed audio file to OpenAI and returns only text", async () => {
  const { env, queries } = authenticatedEnv();
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (url, init) => {
    upstreamCalls += 1;
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(init.headers.Authorization, "Bearer test-openai-key");
    assert.equal(init.body.get("model"), "gpt-transcribe");
    assert.match(init.body.get("prompt"), /construction takeoff/i);
    assert.equal(init.body.get("file").type, "audio/webm");
    return new Response(JSON.stringify({ text: "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const form = new FormData();
    form.set("jobId", "job-1");
    form.set("audio", new Blob(["recorded audio"], { type: "audio/webm" }), "voice.webm");
    const request = new Request("https://takeoff.test/api/transcribe", {
      method: "POST",
      headers: { Origin: "https://takeoff.test", Cookie: "takeoff_session=test-session" },
      body: form
    });
    const response = await worker.fetch(request, env);
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result, {
      transcript: "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center",
      model: "gpt-transcribe"
    });
    assert.equal(upstreamCalls, 1);
    assert.equal(queries.some(sql => /INSERT|UPDATE|DELETE/i.test(sql)), false, "audio is never stored in D1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
