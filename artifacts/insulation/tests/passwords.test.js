import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { passwordHash, verifyPassword, PASSWORD_ITERATIONS } from "../worker/passwords.js";

const salt = Buffer.from("test-only-salt!!").toString("base64url");
const password = "test-only-strong-password";

test("new passwords use an explicitly versioned Workers-compatible cost", async () => {
  assert.equal(PASSWORD_ITERATIONS, 100000);
  const hash = await passwordHash(password, salt);
  const expected = pbkdf2Sync(password, Buffer.from(salt, "base64url"), 100000, 32, "sha256").toString("base64url");
  assert.equal(hash, `pbkdf2-sha256$100000$${expected}`);
  assert.equal(await verifyPassword(password, salt, hash), true);
  assert.equal(await verifyPassword("wrong-password", salt, hash), false);
  assert.equal(await verifyPassword(password, Buffer.from("different-salt").toString("base64url"), hash), false);
});

test("existing unversioned 310000-iteration accounts still verify without data changes", async () => {
  const legacy = pbkdf2Sync(password, Buffer.from(salt, "base64url"), 310000, 32, "sha256").toString("base64url");
  assert.equal(await verifyPassword(password, salt, legacy), true);
  assert.equal(await verifyPassword("wrong-password", salt, legacy), false);
});

test("unknown hash formats and malformed hashes fail closed", async () => {
  for (const hash of [null, "", "pbkdf2-sha256$999999999$abc", "pbkdf2-sha256$100000$bad", "other$100000$abc"]) {
    assert.equal(await verifyPassword(password, salt, hash), false);
  }
});
