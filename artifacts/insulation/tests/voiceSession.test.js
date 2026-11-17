import test from "node:test";
import assert from "node:assert/strict";
import { appendConfirmedSegments, appendPendingVoiceText, isCorrectionUtterance, pendingVoiceSegments, removeConfirmedInterim, replaceRunUnconfirmedSegments, shouldSaveVoiceResult } from "../src/voiceSession.js";

test("confirmed segment events are idempotent without deleting repeated spoken words", () => {
  const first = [
    { runId: "run-1", id: 1, start: 0, end: 1.2, text: "24 by 8" },
    { runId: "run-1", id: 2, start: 1.2, end: 2.4, text: "24 by 8" }
  ];
  const initial = appendConfirmedSegments([], first);
  const repeatedSnapshot = appendConfirmedSegments(initial, first);

  assert.equal(initial.length, 2);
  assert.equal(repeatedSnapshot.length, 2);
  assert.equal(repeatedSnapshot[0].text, repeatedSnapshot[1].text);
});

test("segments from separate recording runs stay distinct", () => {
  const beforePause = [{ runId: "run-1", id: 1, start: 0, end: 1, text: "exterior walls" }];
  const afterResume = [{ runId: "run-2", id: 1, start: 0, end: 1, text: "exterior walls" }];

  assert.equal(appendConfirmedSegments(beforePause, afterResume).length, 2);
});

test("unconfirmed speech from a paused run survives resume without stale duplicates", () => {
  const paused = [{ start: 1, end: 2, text: "twenty four", runId: "run-1" }];
  const resumed = [{ start: 0, end: 1, text: "by eight", runId: "run-2" }];
  const combined = replaceRunUnconfirmedSegments(paused, resumed, "run-2");
  const refreshed = replaceRunUnconfirmedSegments(combined, [{ start: 0, end: 1, text: "by 8" }], "run-2");

  assert.equal(refreshed.length, 2);
  assert.equal(refreshed[0].text, "twenty four");
  assert.equal(refreshed[1].text, "by 8");
});

test("correction phrases are flagged for explicit review", () => {
  assert.equal(isCorrectionUtterance("Actually, make that 26 by 8"), true);
  assert.equal(isCorrectionUtterance("No"), true);
  assert.equal(isCorrectionUtterance("No, use 26 by 8 instead"), true);
  assert.equal(isCorrectionUtterance("attic with no sprinklers 20 by 10"), false);
});

test("partial dictated phrases combine until the parser has an actionable result", () => {
  const partial = appendPendingVoiceText("Exterior walls. R-19.", "24 by 8");
  assert.equal(partial, "Exterior walls. R-19. 24 by 8");
  assert.equal(shouldSaveVoiceResult({ status: "needs_review", requiresReview: false }), false);
  assert.equal(shouldSaveVoiceResult({ status: "calculated", requiresReview: false }), true);
  assert.equal(shouldSaveVoiceResult({ status: "needs_review", requiresReview: true }), true);
});

test("a replacement decode does not append duplicate interim words", () => {
  const segments = [
    { runId: "paused", start: 0, end: 1, text: "exterior walls" },
    { runId: "active", start: 0, end: 1, text: "24 by" }
  ];
  const pending = pendingVoiceSegments(segments, "24 by 8", "active");
  assert.equal(pending.map(segment => segment.text).join(" "), "exterior walls 24 by 8");
  assert.deepEqual(pendingVoiceSegments(segments, "Waiting for speech...", "active"), segments);
  assert.deepEqual(pendingVoiceSegments(pending, "24 by 8", "active"), pending);
});

test("confirmation removes only overlapping interim segments from the same run", () => {
  const interim = [
    { runId: "old", start: 0, end: 1, text: "prior unfinished words" },
    { runId: "active", start: 0, end: 1, text: "24 by 8" },
    { runId: "active", start: 1, end: 2, text: "attic" }
  ];
  const confirmed = [{ runId: "active", start: 0, end: 1, text: "24 by 8." }];
  assert.deepEqual(removeConfirmedInterim(interim, confirmed, "active"), [interim[0], interim[2]]);
});

test("a confirmed timing boundary is not saved again when punctuation changes", () => {
  const original = [{ runId: "active", start: 0, end: 1, text: "24 by 8" }];
  const revised = [{ runId: "active", start: 0, end: 1, text: "24 by 8." }];
  assert.equal(appendConfirmedSegments(original, revised).length, 1);
});
