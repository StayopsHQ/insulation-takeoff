import test from "node:test";
import assert from "node:assert/strict";
import { parseTranscript } from "../src/parser.js";
import { parseVoiceBatch, recalculateBatchItem } from "../src/voiceBatch.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";

for (const [text, quantity, factor] of [
  ["Slopes 22 x 14 with a 1.25 factor", 385, 1.25],
  ["Slopes 16 x 11 with a 1.25 factor", 220, 1.25],
  ["Slopes 18 x 12", 216, null],
  ["Slopes 22 by 14 by 1.25", 385, 1.25],
  ["Slopes 16 times 11 times 1.25", 220, 1.25]
]) test(`${text} calculates ${quantity} sq ft`, () => {
  const result = parseTranscript(text);
  assert.equal(result.status, "calculated");
  assert.equal(result.parsed.squareFeet, quantity);
  assert.deepEqual(result.parsed.slopeFactors, [factor]);
  assert.equal(result.rawTranscript, text);
});

test("one recording keeps each slope factor local and editable in its section row", () => {
  const batch = parseVoiceBatch("Slopes 22 by 14 with a 1.25 factor and 16 by 11 with a 1.25 factor and 18 by 12.");
  assert.equal(batch.items.length, 3);
  assert.deepEqual(batch.items.map(item => item.result.parsed.squareFeet), [385, 220, 216]);
  assert.match(batch.items[0].text, /1\.25 factor/);
  assert.match(batch.items[1].text, /1\.25 factor/);
  assert.doesNotMatch(batch.items[2].text, /1\.25 factor/);
  const edited = recalculateBatchItem({ ...batch.items[0], text: "Slopes 16 by 11 with a 1.25 factor" });
  assert.equal(edited.result.parsed.squareFeet, 220);
});

test("spoken slope dimension corrections preserve the explicit factor", () => {
  const batch = parseVoiceBatch("Slopes 22 by 14 with a 1.25 factor. Correction make that 16 by 11 not 22 by 14.");
  assert.equal(batch.issues.length, 0);
  assert.equal(batch.items[0].result.parsed.squareFeet, 220);
  assert.match(batch.items[0].text, /1\.25 factor/);
});

test("saved slope edits recalculate and visibly retain the explicit factor", async () => {
  const app = await voiceAppHarness(false, { browserTranscriptionAvailable: true });
  await app.click("start");
  app.api.transcript = "Slopes 22 by 14 with a 1.25 factor";
  await app.click("stop");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 385);
  assert.match(app.read('renderInterpretedFields(state.entries[0].parsed)'), /1.25 factor/);
  app.evaluate('window.prompt = () => "Slopes 16 by 11 with a 1.25 factor"');
  await app.evaluate('editEntry("entry-1")');
  assert.equal(app.read("state.entries[0].parsed.squareFeet"), 220);
});
