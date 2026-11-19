import test from "node:test";
import assert from "node:assert/strict";
import { parseTranscript } from "../src/parser.js";
import { renderTakeoffTotals } from "../src/takeoffTotalsView.js";
import { renderVoiceBatchReview } from "../src/voiceBatchView.js";
import { batchReadyItems, upgradeVoiceBatch } from "../src/voiceBatch.js";
import { interpretedVoiceBatch } from "../src/interpretedBatch.js";
import { emptyFields } from "./fixtures/interpretationFixture.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";
import { prepareOriginalFormRows } from "../src/takeoffPdf.js";

const wall = () => parseTranscript("Exterior walls 24 bays 2x4 16 on center 9 foot walls");
const row = (id, result) => ({id,section:result.section,text:result.rawTranscript,
  originalText:result.rawTranscript,result,corrections:[],saved:false});
const mixed = () => ({
  interpreter:"gpt",boundaryVersion:2,sourceText:"Exterior walls 24 bays 2x4 16 on center 9 foot walls. Garage ceiling 20 by",
  items:[row("wall",wall()),row("garage",parseTranscript("Garage ceiling 20 by"))],issues:[]
});

test("wall-only review never presents zero baffles or asks for an absent attic", () => {
  const html=renderTakeoffTotals([wall()]);
  assert.match(html, /data-total="baffles">Not applicable</);
  assert.doesNotMatch(html,/0 LF|Pending attic|Baffles sum/);
  assert.match(html,/264 SF/);
  assert.match(html,/5.28 tubes/);
  assert.match(html,/1.32 units/);
});

test("derived displays require their own source sections, including pending review", () => {
  const garage=parseTranscript("Garage ceiling 20 by 25");
  const html=renderTakeoffTotals([garage]);
  for(const key of ["baffles","exterior-wall-area","caulk","foam"]) {
    assert.match(html,new RegExp(`data-total="${key}">Not applicable<`));
  }
  const pending=renderTakeoffTotals([parseTranscript("Attic 20 by")],false);
  assert.match(pending,/data-total="baffles">Pending attic review</);
  assert.doesNotMatch(pending,/0 LF/);
  assert.match(renderTakeoffTotals([]),/data-total="area">—</);
});

test("actual attic dimensions alone derive baffles, never garage or wall dimensions", () => {
  const html=renderTakeoffTotals([
    wall(),parseTranscript("Garage ceiling 100 by 100"),
    parseTranscript("Attic 32 by 42 with sprinklers"),
    parseTranscript("Attic 18 by 24 no sprinklers"),
    parseTranscript("Attic 90 by")
  ],false);
  assert.match(html,/data-total="baffles">50 LF</);
});

test("one incomplete GPT row blocks saving without mislabeling a valid wall", () => {
  const batch=mixed();
  assert.equal(batchReadyItems(batch).length,0);
  const html=renderVoiceBatchReview(batch);
  assert.equal((html.match(/data-batch-status="calculated"/g)||[]).length,1);
  assert.equal((html.match(/data-batch-status="needs-choice"/g)||[]).length,1);
  assert.match(html,/Confirmation is blocked by 1 measurement needing your choice and 0 unresolved clarifications/);
  assert.doesNotMatch(html,/0 measurements ready|stay here when you save the ready/);
  assert.match(html,/Garage ceiling|garage ceiling/);
});

test("ambiguous correction explains the specific affected row while unrelated rows remain calculated", () => {
  const batch=mixed();
  batch.items[1]=row("garage",parseTranscript("Garage ceiling 20 by 25"));
  batch.issues=[{id:"issue",section:"exterior walls",text:"Correction make that 26",
    reason:"Choose which exterior wall this correction refers to.",candidateIds:["wall"],resolved:false}];
  const html=renderVoiceBatchReview(batch);
  assert.match(html,/Pending clarification: Choose which exterior wall/);
  assert.equal((html.match(/data-batch-status="calculated"/g)||[]).length,1);
  assert.equal((html.match(/data-batch-status="needs-choice"/g)||[]).length,1);
  assert.equal(batchReadyItems(batch).length,0);
});

test("stopping after a bare unfinished-area announcement neither fabricates a row nor blocks existing drafts", () => {
  const source="Exterior walls 24 bays 2x4 16 on center 9 foot walls. Unfinished area.";
  const valid={
    id:"wall",kind:"measurement",section:"exterior walls",area:"first floor",
    sourceText:"Exterior walls 24 bays 2x4 16 on center 9 foot walls.",targetId:null,
    fields:{...emptyFields(),bays:24,framing:"2x4",spacing:16,height:9},clarification:null
  };
  for(const kind of ["measurement","clarification"]) {
    const data={jobNumber:null,events:[valid,{
      id:"tail",kind,section:"basement exterior",area:"unfinished area",sourceText:"Unfinished area.",
      targetId:null,fields:emptyFields(),clarification:"What are the unfinished-area dimensions?"
    }]};
    const batch=interpretedVoiceBatch(source,data);
    assert.equal(batch.sourceText,source);
    assert.equal(batch.items.length,1);
    assert.equal(batch.issues.length,0);
    assert.equal(batchReadyItems(batch).length,1);
    assert.deepEqual(batch.ignoredAnnouncements,["Unfinished area."]);
  }
  const savedDraft=mixed();
  savedDraft.items.push(row("tail",parseTranscript("Unfinished area","basement exterior")));
  savedDraft.issues.push({id:"tail-issue",text:"Unfinished area.",resolved:false,candidateIds:[]});
  upgradeVoiceBatch(savedDraft);
  assert.equal(savedDraft.items.length,2);
  assert.equal(savedDraft.issues.length,0);
  const edited=mixed();
  const tail=row("tail",parseTranscript("Unfinished area","basement exterior"));
  tail.corrections.push({utterance:"Edited during review"});
  edited.items.push(tail);
  upgradeVoiceBatch(edited);
  assert.equal(edited.items.length,3,"never remove manual edits");
  const onlyHeading=interpretedVoiceBatch("Unfinished area.",{jobNumber:null,events:[{
    ...valid,id:"tail",kind:"clarification",sourceText:"Unfinished area.",fields:emptyFields(),
    clarification:"What are the dimensions?"
  }]});
  assert.equal(onlyHeading.items.length,0);
  assert.equal(onlyHeading.issues.length,0);
  assert.match(renderVoiceBatchReview(onlyHeading),/No measurements were dictated. Nothing to save/);
});

test("real confirmation handlers keep valid rows unsaved until missing values are locally resolved and confirmed", async () => {
  const app=await voiceAppHarness(false,{browserTranscriptionAvailable:true});
  app.evaluate(`state.voiceContext={jobId:"job-1",section:"exterior walls"};state.voiceReviewOpen=true;`);
  app.evaluate(`state.voiceBatch=${JSON.stringify(mixed())};state.voiceReviewText=state.voiceBatch.sourceText;renderJob();`);
  assert.equal(app.node("#confirmVoiceBatch").disabled,true);
  assert.equal(app.node("#confirmVoiceBatch").textContent,"Resolve highlighted items to confirm");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,0);
  app.evaluate(`editBatchItem("garage",{text:"Garage ceiling 20 by 25"})`);
  assert.equal(app.saved.length,0);
  assert.equal(app.node("#confirmVoiceBatch").disabled,false);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,2);
  assert.equal(app.calls.includes("interpret"),false);
  assert.equal(app.calls.includes("transcribe"),false);
});

test("wall-only original PDF rows omit baffles without demanding attic input", () => {
  const entry=wall();
  entry.parsed.formMaterialId="ext-r13-15-2x9-fb";
  const rows=prepareOriginalFormRows([entry]);
  assert.ok(rows.some(item=>item.row.id==="ext-r13-15-2x9-fb"));
  assert.ok(rows.every(item=>item.row.id!=="batt-baffles"));
});
