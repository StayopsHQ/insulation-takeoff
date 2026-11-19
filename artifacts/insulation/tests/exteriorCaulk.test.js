import test from "node:test";
import assert from "node:assert/strict";
import { takeoffTotals } from "../src/calculations.js";
import { parseTranscript } from "../src/parser.js";
import { parseVoiceBatch } from "../src/voiceBatch.js";
import { renderTakeoffTotals } from "../src/takeoffTotalsView.js";
import { renderVoiceBatchReview } from "../src/voiceBatchView.js";
import { prepareOriginalFormRows } from "../src/takeoffPdf.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";

const PRACTICE = "Exterior walls 26 bays two-by-four sixteen-inch centers eight-foot walls. Correction make that 28 bays not 26. Add another exterior wall section 18 bays two-by-six twenty-four-inch centers ten-foot walls. Basement exterior walls 30 bays two-by-four sixteen-inch centers eight-foot walls. Band joists 12, 16, and 20. Unfinished area.";
const practice = () => parseVoiceBatch(PRACTICE);
const results = () => practice().items.map(item=>item.result);

test("practice corrected exterior walls 280 + 360 SF derive 12.8 tubes and 3.2 foam only", () => {
  const batch=practice();
  assert.equal(batch.issues.length,0);
  assert.equal(batch.items.length,4);
  assert.deepEqual(batch.items.map(item=>item.result.parsed.squareFeet),[280,360,300,240]);
  assert.equal(batch.items[0].corrections[0].targetId,batch.items[0].id);
  const totals=takeoffTotals(results());
  assert.equal(totals.exteriorWallSF,640);
  assert.equal(totals.caulkTubes,12.8);
  assert.equal(totals.foamUnits,3.2);
  assert.equal(totals.totalMeasuredArea,1180,"excluded sections still count in measured area");
  assert.equal("caulkBase" in totals,false);
  const html=renderVoiceBatchReview(batch);
  for(const value of ["Exterior wall area","640 SF","12.8 tubes","3.2 units"]) assert.ok(html.includes(value));
  assert.doesNotMatch(html,/Caulk base|combined caulk/i);
});

test("every excluded section leaves exterior-only quantities unchanged", () => {
  const walls=results().slice(0,2);
  const excluded=[
    parseTranscript("Basement exterior walls 200 bays 2x4 16 on center 8 foot"),
    parseTranscript("Band joists 120, 160, and 200"),
    parseTranscript("Garage ceiling 100 by 100"),
    parseTranscript("Attic 100 by 100"),
    parseTranscript("Slopes 100 by 100 with a 1.25 factor"),
    parseTranscript("Party walls 200 bays 2x4 16 on center 8 foot"),
    {...parseTranscript("Exterior walls 200 bays 2x4 16 on center 8 foot"),areaLabel:"unfinished area"}
  ];
  for(const other of excluded) {
    const totals=takeoffTotals([...walls,other]);
    assert.equal(totals.exteriorWallSF,640);
    assert.equal(totals.caulkTubes,12.8);
    assert.equal(totals.foamUnits,3.2);
    const alone=renderTakeoffTotals([other]);
    assert.match(alone,/data-total="caulk">Not applicable</);
    assert.match(alone,/data-total="foam">Not applicable</);
  }
  const savedUnfinished={...excluded.at(-1),areaLabel:undefined,
    parsed:{...excluded.at(-1).parsed,voiceArea:"unfinished area"}};
  assert.equal(takeoffTotals([...walls,savedUnfinished]).caulkTubes,12.8);
});

test("original PDF consumes the same exterior-only derivation and retains basement/band rows", () => {
  const entries=results();
  const materials=["ext-r13-15-2x8-fb","ext-r19-23k","basement-r13-15k","bj-r19-15-25-unfaced"];
  entries.forEach((entry,index)=>entry.parsed.formMaterialId=materials[index]);
  const rows=prepareOriginalFormRows(entries);
  const caulk=rows.find(row=>row.row.id==="other-caulk");
  const foam=rows.find(row=>row.row.id==="other-foam-sealant");
  assert.equal(caulk.quantity,12.8);
  assert.equal(foam.quantity,3.2);
  assert.match(caulk.measurements.join(" "),/Exterior walls 640 SF \/ 50 = 12.8 tubes/);
  assert.equal(rows.find(row=>row.row.id==="basement-r13-15k").quantity,300);
  assert.equal(rows.find(row=>row.row.id==="bj-r19-15-25-unfaced").quantity,240);
});

test("local review edits recalculate the exterior-only engine without transcription, interpretation or early saves", async () => {
  const app=await voiceAppHarness(false,{browserTranscriptionAvailable:true});
  app.api.transcript=PRACTICE;
  await app.click("start");await app.click("stop");
  assert.match(app.node("#voiceBatchReview").innerHTML,/12.8 tubes/);
  assert.equal(app.saved.length,0);
  const basementId=app.read("state.voiceBatch.items[2].id");
  app.evaluate(`editBatchItem(${JSON.stringify(basementId)},{text:"Basement exterior walls 300 bays 2x4 16 on center 8 foot"})`);
  assert.match(app.node("#voiceBatchReview").innerHTML,/12.8 tubes/);
  const exteriorId=app.read("state.voiceBatch.items[0].id");
  app.evaluate(`editBatchItem(${JSON.stringify(exteriorId)},{text:"Exterior walls 30 bays 2x4 16 on center 8 foot"})`);
  assert.match(app.node("#voiceBatchReview").innerHTML,/13.2 tubes/);
  assert.match(app.node("#voiceBatchReview").innerHTML,/3.3 units/);
  assert.equal(app.saved.length,0);
  assert.equal(app.calls.filter(call=>call==="transcribe").length,1);
  assert.equal(app.calls.filter(call=>call==="interpret").length,0);
});
