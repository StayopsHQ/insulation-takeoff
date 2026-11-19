import test from "node:test";
import assert from "node:assert/strict";
import { parseVoiceBatch, batchReadyItems, upgradeVoiceBatch } from "../src/voiceBatch.js";
import { renderVoiceBatchReview } from "../src/voiceBatchView.js";
import { takeoffTotals } from "../src/calculations.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";
import { MULTI_AREA_TRANSCRIPT, MULTI_AREA_EXPECTED } from "./fixtures/multiAreaTranscript.js";

test("reported Band Joists/first-floor 26-bay/basement 30-bay leakage becomes scoped ordered rows", () => {
  const batch = parseVoiceBatch(MULTI_AREA_TRANSCRIPT);
  assert.equal(batch.sourceText, MULTI_AREA_TRANSCRIPT);
  assert.equal(batch.metadata.jobNumber, "247");
  assert.deepEqual(batch.items.map(item => [item.section, item.result.parsed.squareFeet ?? item.result.parsed.area]), MULTI_AREA_EXPECTED);
  assert.equal(batchReadyItems(batch).length, 12);
  assert.equal(batch.issues.length, 0);
  assert.equal(new Set(batch.items.map(item => item.id)).size, 12);
  assert.deepEqual(batch.items[0].result.parsed.measurements, [12, 16, 20]);
  assert.doesNotMatch(batch.items[0].text, /floor|basement|bays/i);
  assert.match(batch.items[1].text, /first floor walls 26 bays/i);
  assert.doesNotMatch(batch.items[1].text, /basement|band joists/i);
  assert.match(batch.items[2].text, /basement 30 bays/i);
  assert.doesNotMatch(batch.items[2].text, /floor|unfinished|garage/i);
  assert.equal(batch.items[3].area, "unfinished area");
  assert.equal(batch.items[3].result.parsed.bays, 12);
  assert.equal(batch.items[7].result.parsed.bays, 9);
  for (const index of [3, 7]) {
    assert.equal(batch.items[index].corrections[0].targetId, batch.items[index].id);
  }
  assert.equal(batch.items[8].result.parsed.sprinklerInsulation, 403.2);
  assert.equal(batch.items[9].result.parsed.hasSprinklers, false);
  assert.deepEqual(takeoffTotals(batch.items.map(item => item.result)), {
    totalMeasuredArea: 4252, bafflesLF: 50, exteriorWallSF: 691,
    caulkTubes: 13.82, foamUnits: 3.455, sprinklerArea: 403.2, blownArea: 1372.8
  });
  const html = renderVoiceBatchReview(batch);
  assert.equal((html.match(/class="voice-measurement-row"/g) || []).length, 12);
  assert.ok(html.indexOf("385 sq ft") < html.indexOf("66 sq ft"), "revisited first floor stays at its spoken position");
  assert.doesNotMatch(html, /more than one bay count|Separate the wall measurements|Choose a section|alternative bay counts/);
});

test("repeated bay counts and framing-first measurements split without special separator wording", () => {
  for (const transcript of [
    "Exterior walls 24 bays 2 by 4 16 on center 9 foot walls, 12 bays 2 by 6 24 on center 10 foot walls.",
    "Exterior walls twenty-four bays two-by-four sixteen-inch centers nine-foot walls twenty bays two-by-six twenty-four-inch centers ten-foot walls.",
    "Exterior walls two by four sixteen on center nine foot walls 24 bays and two by six twenty four on center ten foot walls 12 bays."
  ]) {
    const batch = parseVoiceBatch(transcript);
    assert.equal(batchReadyItems(batch).length, 2);
    assert.ok(batch.items.every(item => item.result.parsed.bays && !item.result.requiresReview));
    assert.ok(batch.items.every(item => (item.text.match(/\bbays\b/g) || []).length === 1));
  }
});

test("one wall can span sentences but a second incomplete wall never borrows its missing fields", () => {
  let batch = parseVoiceBatch("First floor walls 26 bays. Two by four. Sixteen on center. Nine foot walls.");
  assert.equal(batchReadyItems(batch).length, 1);
  assert.equal(batch.items[0].result.parsed.squareFeet, 286);
  batch = parseVoiceBatch("First floor walls 26 bays 2 by 4 16 on center 9 foot. And then 12 bays. Garage ceiling 20 by 10.");
  assert.equal(batch.items.length, 3);
  assert.equal(batch.items[1].result.parsed.bays, 12);
  assert.equal(batch.items[1].result.parsed.squareFeet, undefined);
  assert.equal(batchReadyItems(batch).length, 2);
});

test("corrections with identical old counts stay within the specified floor", () => {
  const batch = parseVoiceBatch("First floor walls 26 bays 2 by 4 16 on center 9 foot. Second floor walls 26 bays 2 by 4 16 on center 9 foot. Correction first floor walls make that 28 bays not 26.");
  assert.equal(batch.issues.length, 0);
  assert.deepEqual(batch.items.map(item => item.result.parsed.bays), [28, 26]);
  assert.deepEqual(batch.items.map(item => item.area), ["first floor walls", "second floor walls"]);
});

test("an unknown unfinished area or alternative count flags only its own row", () => {
  const batch = parseVoiceBatch("Band joists 12 and 16. Unfinished area 20 by 10. Attic 32 by 10. Exterior walls 24 bays or 26 bays 2 by 4 16 on center 9 foot.");
  assert.equal(batch.items.length, 4);
  assert.equal(batch.items[1].section, null, "unfinished area cannot inherit Band Joists");
  assert.equal(batch.items[3].result.requiresReview, true);
  assert.deepEqual(batchReadyItems(batch).map(item => item.section), ["band joists", "attic"]);
  assert.equal(batch.items[0].result.parsed.squareFeet, 140);
});

test("actual browser-transcript ingestion keeps all twelve drafts unsaved until one confirmation", async () => {
  const app = await voiceAppHarness(false, { browserTranscriptionAvailable: true });
  app.api.transcript = MULTI_AREA_TRANSCRIPT;
  await app.click("start");
  await app.click("stop");
  assert.equal(app.saved.length, 0);
  assert.equal(app.read("state.voiceBatch.items.length"), 12);
  assert.equal((app.node("#voiceBatchReview").innerHTML.match(/class="voice-measurement-row"/g) || []).length, 12);
  await app.click("confirmVoiceBatch");
  assert.deepEqual(app.saved.map(entry => [entry.measurement.section, entry.measurement.parsed.squareFeet ?? entry.measurement.parsed.area]), MULTI_AREA_EXPECTED);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 12);
  assert.equal(app.calls.filter(call => call === "transcribe").length, 1);
});

test("reopening an untouched old draft fixes grouping without replacing edits or partial saves", async () => {
  const batch = parseVoiceBatch(MULTI_AREA_TRANSCRIPT);
  delete batch.boundaryVersion;
  batch.items = [{ ...batch.items[0], text: MULTI_AREA_TRANSCRIPT, originalText: MULTI_AREA_TRANSCRIPT }];
  assert.equal(upgradeVoiceBatch(batch).items.length, 12);
  const edited = structuredClone(batch);
  edited.items[0].corrections.push({ utterance: "Edited during review" });
  assert.equal(upgradeVoiceBatch(edited), edited);
  const partiallySaved = structuredClone(batch);
  partiallySaved.items[0].saved = true;
  assert.equal(upgradeVoiceBatch(partiallySaved), partiallySaved);
  const app = await voiceAppHarness(false, { browserTranscriptionAvailable: true });
  app.api.transcript = MULTI_AREA_TRANSCRIPT;
  await app.click("start");
  await app.click("stop");
  app.evaluate("delete state.voiceBatch.boundaryVersion; state.voiceBatch.items = [state.voiceBatch.items[0]]; persistVoiceDraft(); state.voiceBatch=null; restoreVoiceDraft('job-1'); renderJob();");
  assert.equal(app.read("state.voiceBatch.items.length"), 12);
  assert.equal(app.saved.length, 0);
});
