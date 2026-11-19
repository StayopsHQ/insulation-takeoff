import test from "node:test";
import assert from "node:assert/strict";
import { parseVoiceBatch, batchReadyItems, recalculateBatchItem } from "../src/voiceBatch.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";
import { renderVoiceBatchReview } from "../src/voiceBatchView.js";

const reported = "Exterior walls 24 bays, 2 by 4, 16 on center, 9-foot walls. Correction, make that 29 bays, not 24. Add another exterior wall, 12 bays, 2 by 6, 24 on center, 10-foot walls. Basement exterior walls 15 bays, 2 by 4, 16 on center, 8-foot walls. Correction, make that 13 bays.";
const wall = "Exterior walls 24 bays 2 by 4 16 on center 9 foot walls.";

test("continuous attic dimensions remain individual measurements under one section heading", () => {
  const batch = parseVoiceBatch("Attic 20 by 10 and 12 by 8. Add another 15 by 10. Another.");
  assert.equal(batch.items.length, 3);
  assert.deepEqual(batch.items.map(item => item.section), ["attic", "attic", "attic"]);
  assert.deepEqual(batch.items.map(item => item.result.parsed.area), [200, 96, 150]);
  const html = renderVoiceBatchReview(batch);
  assert.equal((html.match(/<h4>attic<\/h4>/g) || []).length, 1);
  assert.equal((html.match(/class="voice-measurement-row"/g) || []).length, 3);
  assert.doesNotMatch(html, /Ready to confirm|voice-batch-item/);
});

test("trailing section repetitions and material-only fragments do not create blank duplicate measurements", () => {
  const batch = parseVoiceBatch("Attic R-19. Attic 20 by 10. Add another attic. Another.");
  assert.equal(batch.items.length, 1);
  assert.equal(batch.items[0].result.parsed.area, 200);
  assert.equal(batch.items[0].result.parsed.material, "R-19");
  assert.match(batch.sourceText, /Add another attic/);
});

test("unfinished numeric dimensions are preserved for editing without inventing a width", () => {
  const batch = parseVoiceBatch("Attic 20 by 10 and 12 by. Another.");
  assert.equal(batch.items.length, 2);
  assert.equal(batch.items[0].result.parsed.area, 200);
  assert.equal(batch.items[1].result.status, "needs_review");
  assert.equal(batch.items[1].result.parsed.area, undefined);
  assert.match(batch.items[1].text, /12 x|12 by/);
  assert.equal(batchReadyItems(batch).length, 1);
});

test("explicit corrections still select the intended pair before consolidation into section rows", () => {
  const batch = parseVoiceBatch("Attic with sprinklers 20 by 10 and 12 by 8. Correction make that 25 by 10 not 20 by 10.");
  assert.equal(batch.issues.length, 0);
  assert.deepEqual(batch.items.map(item => item.result.parsed.area), [250, 96]);
  assert.deepEqual(batch.items.map(item => item.result.parsed.sprinklerInsulation), [75, 28.799999999999997]);
});

test("reported recording corrects two wall entries without replacing the added wall", () => {
  const batch = parseVoiceBatch(reported);
  assert.equal(batch.issues.length, 0);
  assert.deepEqual(batch.items.map(item => item.section), ["exterior walls", "exterior walls", "basement exterior"]);
  assert.deepEqual(batch.items.map(item => item.result.parsed.bays), [29, 12, 13]);
  assert.deepEqual(batch.items.map(item => item.result.parsed.squareFeet), [319, 240, 130]);
  assert.equal(batch.items[0].corrections.length, 1);
  assert.match(batch.items[0].originalText, /24 bays/);
  assert.equal(batch.sourceText, reported);
});

test("all supported sections use their existing deterministic formulas in one pass", () => {
  const batch = parseVoiceBatch(`${reported} Attic with sprinklers 20 by 10. Correction make that 25 by 10 not 20 by 10. Slopes 12 by 8. Band joists 19 and 24. Correction make that 21 not 19. Batt ceilings 8 by 10. Party walls 10 bays 2 by 4 16 on center 8 foot. Garage ceiling 10 by 20. Baffles 16. Correction make that 18 baffles. Sill 10 by 2. Caulk 2 by 3. Foam 3 by 4.`);
  assert.equal(batch.issues.length, 0);
  assert.equal(batchReadyItems(batch).length, 13);
  const attic = batch.items.find(item => item.section === "attic").result.parsed;
  assert.equal(attic.area, 250);
  assert.equal(attic.sprinklerInsulation, 75);
  assert.equal(attic.blownInsulation, 175);
  assert.equal(batch.items.find(item => item.section === "band joists").result.parsed.squareFeet, 225);
  assert.equal(batch.items.find(item => item.section === "baffles").result.parsed.quantity, 18);
});

test("correction old values never select a target across sections", () => {
  const batch = parseVoiceBatch(`${wall} Basement exterior walls 15 bays 2 by 4 16 on center 8 foot. Correction make that 29 bays not 24. Attic 20 by 10.`);
  assert.equal(batch.issues.length, 1);
  assert.deepEqual(batch.items.map(item => item.result.parsed.bays).slice(0, 2), [24, 15]);
  assert.deepEqual(batchReadyItems(batch).map(item => item.section), ["exterior walls", "attic"]);
  assert.equal(batch.issues[0].section, "basement exterior");
});

test("repeated same-section measurements stay separate and implicit corrections target the latest", () => {
  const batch = parseVoiceBatch(`${wall} Add another exterior wall 12 bays 2 by 6 24 on center 10 foot. Correction make that 14 bays.`);
  assert.deepEqual(batch.items.map(item => item.result.parsed.bays), [24, 14]);
  assert.deepEqual(batch.items.map(item => item.result.parsed.squareFeet), [264, 280]);
});

test("explicit section with multiple eligible earlier entries needs a choice", () => {
  const batch = parseVoiceBatch(`${wall} Add another exterior wall 24 bays 2 by 4 16 on center 8 foot. Attic 20 by 10. Correction exterior walls make that 29 bays not 24. Slopes 12 by 8.`);
  assert.equal(batch.issues.length, 1);
  assert.deepEqual(batch.issues[0].candidateIds, ["draft-0", "draft-1"]);
  assert.deepEqual(batchReadyItems(batch).map(item => item.section), ["attic", "slopes"]);
});

test("unresolved corrections and unnamed areas do not stop clear unrelated entries", () => {
  const batch = parseVoiceBatch(`${wall} Correction make that bigger. Attic 20 by 10. Next area 24 by 8. Slopes 10 by 8.`);
  assert.equal(batch.issues.length, 1);
  assert.equal(batch.items.length, 4);
  assert.equal(batch.items[2].section, null);
  assert.deepEqual(batchReadyItems(batch).map(item => item.section), ["attic", "slopes"]);
});

test("word numbers, fractional values, repeated corrections and edits recalculate through the parser", () => {
  const batch = parseVoiceBatch("Exterior walls twenty four bays two by four sixteen on center nine foot. Correction make that twenty nine bays not twenty four. Correction make that thirty bays. Attic 20 by 10. Actually make that 25 by 10.");
  assert.equal(batch.issues.length, 0);
  assert.equal(batch.items[0].result.parsed.bays, 30);
  assert.equal(batch.items[0].corrections.length, 2);
  assert.equal(batch.items[1].result.parsed.area, 250);
  batch.items[0].text = "31 bays 2 by 4 16 on center 9 foot";
  recalculateBatchItem(batch.items[0]);
  assert.equal(batch.items[0].result.parsed.squareFeet, 341);
});

test("field corrections retain all other confirmed wall values", () => {
  const batch = parseVoiceBatch(`${wall} Correction make that 24 on center not 16. Correction make that 10 foot not 9. Correction make that 2 by 6 not 2 by 4.`);
  assert.equal(batch.issues.length, 0);
  assert.deepEqual(batch.items[0].result.parsed, { bays: 24, framing: "2x6", spacing: 24, height: 10, squareFeet: 480 });
});

test("natural no and sorry corrections do not confuse an attic without sprinklers", () => {
  const batch = parseVoiceBatch(`${wall} No, use 29 bays instead. Attic with no sprinklers 20 by 10. Sorry, make that 25 by 10.`);
  assert.equal(batch.issues.length, 0);
  assert.equal(batch.items[0].result.parsed.bays, 29);
  assert.equal(batch.items[1].result.parsed.area, 250);
  assert.equal(batch.items[1].result.parsed.sprinklerInsulation, 0);
});

test("band-joist corrections do not accidentally change an R-value with the same number", () => {
  const batch = parseVoiceBatch("Band joists R-19 19 and 24. Correction make that 21 not 19.");
  assert.equal(batch.issues.length, 0);
  assert.equal(batch.items[0].result.parsed.material, "R-19");
  assert.deepEqual(batch.items[0].result.parsed.measurements, [21, 24]);
  assert.equal(batch.items[0].result.parsed.squareFeet, 225);
});

test("a trailing named correction scope never changes the current unrelated section", () => {
  const batch = parseVoiceBatch(`${wall} Basement exterior walls 15 bays 2 by 4 16 on center 8 foot. Correction make that 29 bays for exterior walls.`);
  assert.equal(batch.issues.length, 0);
  assert.deepEqual(batch.items.map(item => item.result.parsed.bays), [29, 15]);
});

test("separate bay clauses stay separate and piece-count sections are not swallowed by an earlier area", () => {
  const batch = parseVoiceBatch(`${wall} And 12 bays 2 by 6 24 on center 10 foot. Attic 20 by 10. 16 baffles.`);
  assert.equal(batch.items.length, 4);
  assert.deepEqual(batch.items.map(item => item.section), ["exterior walls", "exterior walls", "attic", "baffles"]);
  assert.equal(batch.items[3].result.parsed.quantity, 16);
});

test("unqualified dimensions with multiple earlier pairs are flagged rather than all replaced", () => {
  const batch = parseVoiceBatch("Attic 20 by 10 and 12 by 8. Correction make that 25 by 10. Slopes 5 by 8.");
  assert.equal(batch.issues.length, 1);
  assert.deepEqual(batch.items.filter(item => item.section === "attic").map(item => item.result.parsed.area), [200, 96]);
  assert.deepEqual(batchReadyItems(batch).map(item => item.section), ["slopes"]);
});

async function reviewRecording(transcript = reported) {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: transcript, confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  return app;
}

test("review shows every corrected item; editing and reviewing never save before confirmation", async () => {
  const app = await reviewRecording();
  assert.equal(app.saved.length, 0);
  assert.match(app.node("#voiceBatchReview").innerHTML, /319 sq ft/);
  assert.match(app.node("#voiceBatchReview").innerHTML, /240 sq ft/);
  assert.match(app.node("#voiceBatchReview").innerHTML, /130 sq ft/);
  assert.match(app.node("#voiceBatchReview").innerHTML, /Correction applied/);
  assert.doesNotMatch(app.node("#app").innerHTML, /Correction needs your choice/);
  await app.click("processVoiceReview");
  assert.equal(app.saved.length, 0);
  const editor = app.node('[data-batch-edit="draft-1"]');
  editor.value = "Exterior wall 14 bays 2 by 6 24 on center 10 foot";
  await editor.events.change();
  assert.equal(app.saved.length, 0);
  assert.match(app.node("#voiceBatchReview").innerHTML, /280 sq ft/);
  await app.click("confirmVoiceBatch");
  assert.deepEqual(app.saved.map(entry => entry.measurement.parsed.squareFeet), [319, 280, 130]);
  assert.equal(app.saved[0].measurement.parsed.originalVoiceTranscript, reported);
  assert.match(app.saved[0].measurement.rawTranscript, /24 bays/);
  assert.equal(app.saved[0].measurement.parsed.correctionHistory.length, 1);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 3);
});

test("clear items can be confirmed while only an ambiguous correction waits, then resolved locally", async () => {
  const transcript = `${wall} Correction make that bigger. Attic 20 by 10. Slopes 12 by 8.`;
  const app = await reviewRecording(transcript);
  assert.equal(app.saved.length, 0);
  await app.click("confirmVoiceBatch");
  assert.deepEqual(app.saved.map(entry => entry.measurement.section), ["attic", "slopes"]);
  assert.equal(app.read("state.voiceReviewProcessed"), false);
  app.node("#batchTarget-issue-0").value = "draft-0";
  app.node("#batchFinal-issue-0").value = "Exterior walls 29 bays 2 by 4 16 on center 9 foot";
  await app.node('[data-batch-resolve="issue-0"]').events.click();
  assert.equal(app.saved.length, 2, "resolving a correction still does not save");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 3);
  assert.equal(app.saved[2].measurement.parsed.squareFeet, 319);
  assert.equal(app.read("state.voiceReviewProcessed"), true);
});

test("draft edits, issues and partial-save progress survive reload and do not duplicate known saved items", async () => {
  const app = await reviewRecording();
  app.evaluate('editBatchItem("draft-1", {text:"Exterior wall 14 bays 2 by 6 24 on center 10 foot"})');
  const save = app.api.createMeasurement.bind(app.api);
  let calls = 0;
  app.api.createMeasurement = async (...args) => {
    if (++calls === 2) throw new Error("Offline");
    return save(...args);
  };
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 1);
  app.evaluate('state.voiceBatch = null; restoreVoiceDraft("job-1"); renderJob();');
  assert.equal(app.read("state.voiceBatch.items[0].saved"), true);
  assert.equal(app.read("state.voiceBatch.items[1].result.parsed.bays"), 14);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 3);
  assert.deepEqual(app.saved.map(entry => entry.measurement.parsed.bays), [29, 14, 13]);
});

test("browser transcription also enters batch review without another provider call or early save", async () => {
  const app = await voiceAppHarness(false, { browserTranscriptionAvailable: true });
  app.api.transcript = reported;
  await app.click("start");
  await app.click("stop");
  assert.equal(app.calls.filter(call => call === "transcribe").length, 1);
  assert.equal(app.saved.length, 0);
  assert.equal(app.read("state.voiceBatch.items.length"), 3);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 3);
  assert.equal(app.calls.filter(call => call === "transcribe").length, 1);
  assert.equal(app.calls.includes("update"), false);
});

test("changing a draft section and ignoring an unmatched correction require no network or early saves", async () => {
  const app = await reviewRecording("Attic 20 by 10. Correction make that bigger.");
  const selector = app.node('[data-batch-section="draft-0"]');
  selector.value = "slopes";
  await selector.events.change();
  assert.equal(app.read("state.voiceBatch.items[0].section"), "slopes");
  assert.equal(app.saved.length, 0);
  await app.node('[data-batch-ignore="issue-0"]').events.click();
  assert.equal(app.saved.length, 0);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved[0].measurement.section, "slopes");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 200);
});

test("a saved unrelated item is never a correction target and changing jobs cannot save the draft", async () => {
  const app = await reviewRecording(`${wall} Correction make that bigger. Attic 20 by 10.`);
  await app.click("confirmVoiceBatch");
  app.node("#batchTarget-issue-0").value = "draft-1";
  app.node("#batchFinal-issue-0").value = "Attic 50 by 20";
  await app.node('[data-batch-resolve="issue-0"]').events.click();
  assert.equal(app.saved.length, 1);
  assert.equal(app.saved[0].measurement.parsed.area, 200);
  assert.equal(app.read("state.voiceBatch.issues[0].resolved"), false);
  app.evaluate('state.activeJob = {id:"other-job",name:"Other"}');
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 1);
  assert.match(app.node("#flash").textContent, /different job/);
});
