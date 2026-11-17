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
