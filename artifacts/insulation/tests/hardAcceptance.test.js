import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { normalizeNumbers, parseTranscript } from "../src/parser.js";
import { parseVoiceBatch, batchReadyItems, recalculateBatchItem } from "../src/voiceBatch.js";
import { takeoffTotals } from "../src/calculations.js";
import { renderVoiceBatchReview } from "../src/voiceBatchView.js";
import { prepareOriginalFormRows } from "../src/takeoffPdf.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";
import { ACCEPTANCE_TRANSCRIPT, ACCEPTANCE_FORM_MATERIALS } from "./fixtures/acceptanceTranscript.js";

test("framing and decimal normalization accepts each reported spelling without consuming adjacent numbers", () => {
  for (const text of ["two-by-four", "2-by-4", "two by four"]) assert.equal(normalizeNumbers(text), "2 x 4");
  for (const text of ["two-by-six", "2-by-6", "two by six"]) assert.equal(normalizeNumbers(text), "2 x 6");
  for (const text of ["one-point-two-five", "1-point-2-5", "one point two five", "1.25"]) assert.equal(normalizeNumbers(text), "1.25");
  assert.equal(normalizeNumbers("one-point-two-five 1-point-2-5"), "1.25 1.25");
});

test("exact acceptance recording yields nine completed measurements and two scoped replacements", () => {
  const batch = parseVoiceBatch(ACCEPTANCE_TRANSCRIPT);
  assert.equal(batch.sourceText, ACCEPTANCE_TRANSCRIPT);
  assert.equal(batch.metadata.jobNumber, "247");
  assert.equal(batch.items.length, 9);
  assert.equal(batch.issues.length, 0);
  assert.equal(batchReadyItems(batch).length, 9);
  assert.ok(batch.items.every(item => item.section && item.result.status === "calculated" && !item.result.requiresReview));
  assert.deepEqual(batch.items.map(item => item.result.parsed.squareFeet ?? item.result.parsed.area), [319,240,130,1344,432,385,216,220,240]);
  assert.deepEqual(batch.items.slice(0,3).map(item => item.result.parsed.bays), [29,12,13]);
  assert.deepEqual(batch.items.slice(0,3).map(item => item.result.parsed.framing), ["2x4","2x6","2x4"]);
  assert.deepEqual(batch.items[3].result.parsed, {
    dimensionPairs:[[32,42]],hasSprinklers:true,area:1344,baffles:32,sprinklerInsulation:403.2,blownInsulation:940.8
  });
  assert.equal(batch.items[4].result.parsed.sprinklerInsulation, 0);
  assert.deepEqual(batch.items.slice(5,8).map(item=>item.result.parsed.slopeFactors), [[1.25],[1],[1.25]]);
  const corrected = batch.items.filter(item=>item.corrections.length);
  assert.equal(corrected.length, 2);
  for (const item of corrected) {
    assert.equal(item.corrections[0].targetId, item.id);
    assert.equal(item.corrections[0].section, item.section);
  }
  assert.match(corrected[0].originalText, /24 bays/);
  assert.match(corrected[1].originalText, /15 bays/);
  const html = renderVoiceBatchReview(batch);
  assert.equal((html.match(/class="voice-batch-section"/g) || []).length, 5);
  assert.equal((html.match(/class="voice-measurement-row"/g) || []).length, 9);
  for (const value of ["3526 SF","50 LF","559 SF","11.18 tubes","2.795 units"]) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /Needs your choice|Provisional|Resolve this correction/);
});

test("partial wall corrections have real targets without borrowing a different section's measurements", () => {
  const batch = parseVoiceBatch("Exterior walls 24 bays. Correction make that 29 bays not 24. Basement exterior walls 15 bays. Correction make that 13 bays.");
  assert.equal(batch.items.length, 2);
  assert.equal(batch.issues.length, 0);
  assert.deepEqual(batch.items.map(item=>item.result.parsed.bays), [29,13]);
  assert.ok(batch.items.every(item=>item.result.status === "needs_review" && item.corrections[0].targetId === item.id));
  assert.equal(takeoffTotals(batch.items.map(item=>item.result)).totalMeasuredArea, 0);
});

test("derived totals use only eligible areas and do not add attic allocations twice", () => {
  const entries = parseVoiceBatch(ACCEPTANCE_TRANSCRIPT).items.map(item=>item.result);
  assert.deepEqual(takeoffTotals(entries), {
    totalMeasuredArea:3526,bafflesLF:50,exteriorWallSF:559,caulkTubes:11.18,foamUnits:2.795,
    sprinklerArea:403.2,blownArea:1372.8
  });
  const party = parseTranscript("Party walls 10 bays two-by-four sixteen-inch centers nine-foot walls");
  assert.equal(takeoffTotals([...entries,party]).totalMeasuredArea, 3636);
  assert.equal(takeoffTotals([...entries,party]).exteriorWallSF, 559);
  const incomplete = {...entries[0],status:"needs_review"};
  assert.equal(takeoffTotals([incomplete]).exteriorWallSF, 0);
});

test("editing slopes or wall bays recalculates review totals using the same rules", () => {
  const batch = parseVoiceBatch(ACCEPTANCE_TRANSCRIPT);
  recalculateBatchItem({...batch.items[0], text:"Exterior walls 30 bays two-by-four sixteen-inch centers nine-foot walls"});
  const slope = recalculateBatchItem({...batch.items[5],text:"Slope 18 by 12 no factor"});
  assert.equal(slope.result.parsed.squareFeet,216);
  const wall = recalculateBatchItem({...batch.items[0],text:"Exterior walls 30 bays two-by-four sixteen-inch centers nine-foot walls"});
  const totals = takeoffTotals([wall.result,...batch.items.slice(1).map(item=>item.result)]);
  assert.equal(totals.exteriorWallSF, 570);
  assert.equal(totals.caulkTubes, 11.4);
});

test("Record to confirmed original PDF works for the exact acceptance transcript without network or real saves", async () => {
  const app = await voiceAppHarness(false,{browserTranscriptionAvailable:true});
  app.evaluate('state.section=null;renderJob();');
  app.api.transcript = ACCEPTANCE_TRANSCRIPT;
  await app.click("start");
  assert.equal(app.read("state.voiceReviewOpen"),false);
  await app.click("stop");
  assert.equal(app.read("state.voiceBatch.items.length"),9);
  assert.equal(app.read("state.voiceBatch.issues.length"),0);
  assert.equal(app.saved.length,0);
  await app.click("processVoiceReview");
  assert.equal(app.saved.length,0);
  await app.click("finishTakeoff");
  assert.equal(app.read("state.takeoffPdfUrl"),null);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,9);
  assert.equal(app.read("state.voiceReviewProcessed"),true);
  assert.equal(app.read("state.activeJob.id"),"job-1");
  assert.ok(app.saved.every(record=>record.measurement.parsed.voiceJobNumber === "247"));
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,9);
  // No R-values were dictated. The normal UI must still require explicit choices.
  await app.click("finishTakeoff");
  assert.equal(app.read("state.takeoffPdfUrl"),null);
  assert.match(app.node("#flash").textContent,/Choose the exact original form material row/);
  for (let index=0;index<ACCEPTANCE_FORM_MATERIALS.length;index+=1) {
    const input=app.node(`[data-form-material="entry-${index+1}"]`);
    input.value=ACCEPTANCE_FORM_MATERIALS[index];
    await input.events.change();
  }
  const sprinkler=app.node('[data-sprinkler-form-material="entry-4"]');
  sprinkler.value="R-49";
  await sprinkler.events.change();
  await app.click("finishTakeoff");
  assert.equal(app.read("state.takeoffPdfUrl"),"blob:takeoff-test");
  assert.match(app.node("#takeoffPdfStatus").textContent,/Completed original form/);
  const pdf = await PDFDocument.load(await app.blobs.at(-1).arrayBuffer());
  assert.equal(pdf.getPageCount(),2);
  const rows=prepareOriginalFormRows(app.read("state.entries"));
  const quantities=Object.fromEntries(rows.map(row=>[row.row.id,row.quantity]));
  assert.deepEqual(quantities,{
    "ext-r13-15-2x9-fb":319,"ext-r19-23k":240,"basement-r13-15k":130,
    "other-sprinkler-prep":403.2,"blown-r38":1372.8,"slopes-r38-16k":821,
    "bj-r19-15-25-unfaced":240,"batt-baffles":50,"other-caulk":11.18,"other-foam-sealant":2.795
  });
  assert.equal(app.calls.filter(call=>call==="transcribe").length,1);
  assert.equal(app.saved.length,9);
});
