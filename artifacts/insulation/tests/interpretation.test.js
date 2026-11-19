import test from "node:test";
import assert from "node:assert/strict";
import { interpretedVoiceBatch } from "../src/interpretedBatch.js";
import { validateShape } from "../src/interpretationContract.js";
import { batchReadyItems, recalculateBatchItem } from "../src/voiceBatch.js";
import { takeoffTotals } from "../src/calculations.js";
import { interpretRecording, interpretationUsage } from "../worker/interpretation.js";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";
import { INTERPRETATION_FIXTURE, MULTI_AREA_TRANSCRIPT, MOCK_USAGE } from "./fixtures/interpretationFixture.js";
import { MULTI_AREA_EXPECTED } from "./fixtures/multiAreaTranscript.js";
import { ACCEPTANCE_TRANSCRIPT } from "./fixtures/acceptanceTranscript.js";
import { emptyFields } from "./fixtures/interpretationFixture.js";
import worker from "../worker/index.js";

const copy = () => structuredClone(INTERPRETATION_FIXTURE);
test("structured complete recording preserves twelve records, source ownership, corrections and deterministic totals", () => {
  const batch = interpretedVoiceBatch(MULTI_AREA_TRANSCRIPT, copy());
  assert.deepEqual(batch.items.map(i=>[i.section,i.result.parsed.squareFeet ?? i.result.parsed.area]), MULTI_AREA_EXPECTED);
  assert.equal(batch.metadata.jobNumber,"247");
  assert.equal(batch.issues.length,0);
  assert.equal(batchReadyItems(batch).length,12);
  assert.deepEqual(batch.items[0].result.parsed.measurements,[12,16,20]);
  assert.doesNotMatch(batch.items[0].originalText,/floor|basement/);
  assert.equal(batch.items[3].corrections[0].targetId,"unfinished");
  assert.equal(batch.items[7].corrections[0].targetId,"ext2");
  assert.deepEqual(takeoffTotals(batch.items.map(i=>i.result)), {
    totalMeasuredArea:4252,bafflesLF:50,exteriorWallSF:691,caulkTubes:13.82,foamUnits:3.455,sprinklerArea:403.2,blownArea:1372.8
  });
  const changed = recalculateBatchItem({...batch.items[10],text:"Slopes 18 by 12 no factor"});
  assert.equal(changed.result.parsed.squareFeet,216);
});

test("strict schema excludes model arithmetic, invalid values and unknown keys", () => {
  for (const mutate of [
    d=>d.events[0].fields.squareFeet=999,
    d=>d.events[0].fields.lengths=[Infinity],
    d=>d.events[0].fields.bays=-1,
    d=>delete d.events[0].fields.width,
    d=>d.events[0].section="imagined section"
  ]) {
    const data=copy(); mutate(data); assert.throws(()=>validateShape(data));
  }
});

test("wrong correction scope, hallucinated inputs, missing values and ambiguity affect only their rows", () => {
  const data=copy();
  data.events[4].targetId="floor";
  data.events[6].fields.width=999;
  data.events[10].fields.width=null;
  data.events[12].clarification="Which slope factor did you intend?";
  const batch=interpretedVoiceBatch(MULTI_AREA_TRANSCRIPT,data);
  assert.equal(batch.items.length,12);
  assert.equal(batch.items[1].result.parsed.bays,26);
  assert.equal(batch.items[3].result.parsed.bays,14);
  assert.equal(batch.issues.length,1);
  assert.equal(batch.items[5].result.status,"needs_review");
  assert.equal(batch.items[8].result.status,"needs_review");
  assert.equal(batch.items[10].result.requiresReview,true);
  assert.equal(batchReadyItems(batch).length,0,"unresolved GPT review cannot partially save");
  assert.equal(batch.items[0].result.parsed.squareFeet,240);
});

test("nonliteral, overlapping, reversed sources and duplicate IDs are rejected", () => {
  for (const mutate of [
    d=>d.events[1].sourceText="imagined words",
    d=>d.events[1].id=d.events[0].id,
    d=>d.events.reverse(),
    d=>d.events.splice(1,0,structuredClone(d.events[0]))
  ]) {
    const data=copy(); mutate(data);
    assert.throws(()=>interpretedVoiceBatch(MULTI_AREA_TRANSCRIPT,data));
  }
  const data=copy(); data.events.splice(6,1);
  const batch=interpretedVoiceBatch(MULTI_AREA_TRANSCRIPT,data);
  assert.match(batch.issues.at(-1).reason,/not assigned/);
  assert.equal(batchReadyItems(batch).length,0);
});

test("numbers inside a valid source quote cannot be silently dropped from the extracted record", () => {
  const data=copy();
  data.events[0].fields.lengths=[12,16];
  const batch=interpretedVoiceBatch(MULTI_AREA_TRANSCRIPT,data);
  assert.equal(batch.items[0].result.status,"needs_review");
  assert.match(batch.items[0].result.message,/missing|omitted/);
  assert.equal(batchReadyItems(batch).length,0);
});

test("Worker makes one text-only strict-schema request, reports cost, and never logs credentials or transcript", async () => {
  let calls=0; const logs=[];
  const result=await interpretRecording({transcript:MULTI_AREA_TRANSCRIPT,section:null},{OPENAI_API_KEY:"test-only-key"},async(url,init)=>{
    calls++;
    assert.equal(url,"https://api.openai.com/v1/responses");
    const body=JSON.parse(init.body);
    assert.equal(body.text.format.strict,true);
    assert.equal(body.store,false);
    assert.equal(body.max_output_tokens,12000);
    assert.equal(JSON.parse(body.input).transcript,MULTI_AREA_TRANSCRIPT);
    assert.doesNotMatch(init.body,/input_audio|file_id/);
    return Response.json({status:"completed",usage:{input_tokens:2500,output_tokens:3000},output:[{content:[{type:"output_text",text:JSON.stringify(copy())}]}]});
  }, entry=>logs.push(entry));
  assert.equal(calls,1);
  assert.deepEqual(result.interpretation,copy());
  assert.equal(result.usage.estimatedCostUSD,0.00175);
  assert.doesNotMatch(JSON.stringify(logs),/test-only-key|Start job/);
  assert.equal(interpretationUsage("custom",{}).estimatedCostUSD,null);
});

test("provider failure/refusal/truncation/invalid schema never retries and returns no usable interpretation", async () => {
  for(const value of [
    {status:"incomplete",usage:{input_tokens:10,output_tokens:3}},
    {status:"completed",output:[{content:[{type:"refusal",refusal:"no"}]}]},
    {status:"completed",output:[{content:[{type:"output_text",text:'{"squareFeet":999}'}]}]}
  ]) {
    let calls=0;
    const result=await interpretRecording({transcript:"Attic 20 by 10"},{OPENAI_API_KEY:"test"},async()=>{
      calls++; return Response.json(value);
    },()=>{});
    assert.equal(calls,1); assert.ok(result.error); assert.equal(result.interpretation,undefined);
  }
});

test("actual Record Stop review makes one interpretation, zero pre-confirm saves and no repeat on review", async () => {
  const app=await voiceAppHarness(false,{browserTranscriptionAvailable:true,interpretationEnabled:true});
  app.api.transcript=MULTI_AREA_TRANSCRIPT;
  app.api.interpretationResponse={interpretation:copy(),usage:MOCK_USAGE};
  await app.click("start"); await app.click("stop");
  assert.equal(app.read("state.voiceBatch.interpreter"),"gpt");
  assert.equal(app.read("state.voiceBatch.items.length"),12);
  assert.equal(app.saved.length,0);
  assert.equal(app.calls.filter(c=>c==="interpret").length,1);
  await app.click("processVoiceReview"); await app.click("processVoiceReview");
  assert.equal(app.calls.filter(c=>c==="interpret").length,1);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,12);
  assert.deepEqual(app.saved.map(i=>[i.measurement.section,i.measurement.parsed.squareFeet ?? i.measurement.parsed.area]),MULTI_AREA_EXPECTED);
});

test("failed validation blocks local fallback saves, survives restoration, and allows only one explicit retry", async () => {
  const app=await voiceAppHarness(false,{browserTranscriptionAvailable:true,interpretationEnabled:true});
  app.api.transcript=MULTI_AREA_TRANSCRIPT;
  app.api.interpretationResponse={interpretation:{squareFeet:999},usage:MOCK_USAGE};
  await app.click("start"); await app.click("stop");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,0);
  assert.equal(app.calls.filter(c=>c==="interpret").length,1);
  app.evaluate("restoreVoiceDraft()");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length,0);
  await app.click("processVoiceReview"); await app.click("processVoiceReview");
  assert.equal(app.calls.filter(c=>c==="interpret").length,2);
  assert.equal(app.saved.length,0);
});

test("editing full transcript cannot reset the recording request budget", async () => {
  const app=await voiceAppHarness(false,{browserTranscriptionAvailable:true,interpretationEnabled:true});
  app.api.transcript=MULTI_AREA_TRANSCRIPT;
  app.api.failInterpretation=true;
  await app.click("start"); await app.click("stop");
  for (const suffix of [" Again.", " More.", " Finish."]) {
    const value=MULTI_AREA_TRANSCRIPT+suffix;
    app.node("#voiceReviewText").value=value;
    app.node("#voiceReviewText").events.input({target:{value}});
    await app.click("processVoiceReview");
    await app.click("confirmVoiceBatch");
  }
  assert.equal(app.calls.filter(c=>c==="interpret").length,2);
  assert.equal(app.saved.length,0);
});

test("the original exact acceptance example still calculates 3526 SF from interpreted inputs", () => {
  const specs = [
    ["exterior walls","Exterior walls: 24 bays, two-by-four, sixteen-inch centers, nine-foot walls.",{bays:24,framing:"2x4",spacing:16,height:9}],
    ["exterior walls","Correction, make that 29 bays, not 24.",{bays:29},"m0"],
    ["exterior walls","Add another exterior wall section, 12 bays, two-by-six, twenty-four-inch centers, ten-foot walls.",{bays:12,framing:"2x6",spacing:24,height:10}],
    ["basement exterior","Basement exterior walls: 15 bays, two-by-four, sixteen-inch centers, eight-foot walls.",{bays:15,framing:"2x4",spacing:16,height:8}],
    ["basement exterior","Correction, make that 13 bays.",{bays:13},"m3"],
    ["attic","Attic: 32 by 42, with sprinklers.",{length:32,width:42,sprinklers:true}],
    ["attic","Another attic measurement: 18 by 24, no sprinklers.",{length:18,width:24,sprinklers:false}],
    ["slopes","Slopes: 22 by 14 with a one-point-two-five factor.",{length:22,width:14,slopeFactor:1.25}],
    ["slopes","Another slope, 18 by 12, no factor.",{length:18,width:12,slopeFactor:1}],
    ["slopes","Another slope, 16 by 11 with a one-point-two-five factor.",{length:16,width:11,slopeFactor:1.25}],
    ["band joists","Band joists: 12, 16, and 20.",{lengths:[12,16,20]}]
  ];
  const data={jobNumber:"247",events:specs.map(([section,sourceText,fields,targetId],index)=>({
    id:`m${index}`,kind:targetId?"correction":"measurement",section,area:section,sourceText,
    fields:{...emptyFields(),...fields},targetId:targetId||null,clarification:null
  }))};
  const batch=interpretedVoiceBatch(ACCEPTANCE_TRANSCRIPT,data);
  assert.equal(batch.issues.length,0);
  assert.equal(batchReadyItems(batch).length,9);
  assert.deepEqual(batch.items.map(i=>i.result.parsed.squareFeet ?? i.result.parsed.area),[319,240,130,1344,432,385,216,220,240]);
  assert.deepEqual(takeoffTotals(batch.items.map(i=>i.result)),{
    totalMeasuredArea:3526,bafflesLF:50,exteriorWallSF:559,caulkTubes:11.18,foamUnits:2.795,sprinklerArea:403.2,blownArea:1372.8
  });
});

test("native Stop interprets the complete text once, with no audio transcription upload", async () => {
  const app=await voiceAppHarness(true,{interpretationEnabled:true});
  app.api.interpretationResponse={interpretation:copy(),usage:MOCK_USAGE};
  await app.click("start");
  await app.emit({streamId:"run-1",isRecording:true,currentText:MULTI_AREA_TRANSCRIPT,confirmedSegments:[],unconfirmedSegments:[]});
  assert.equal(app.calls.filter(c=>c==="interpret").length,0);
  await app.click("stop");
  assert.equal(app.read("state.voiceBatch.items.length"),12);
  assert.equal(app.calls.filter(c=>c==="interpret").length,1);
  assert.equal(app.calls.includes("transcribe"),false);
  assert.equal(app.saved.length,0);
});

test("Worker interpretation enforces authentication and job write access before any provider call", async () => {
  const originalFetch=globalThis.fetch;
  let upstream=0;
  globalThis.fetch=async()=>{upstream++;throw new Error("must not call");};
  try {
    for(const permission of [null,"viewer"]) {
      const queries=[];
      const env={OPENAI_API_KEY:"test",DB:{prepare(sql){
        queries.push(sql);
        return {bind(){return {async first(){return sql.includes("FROM sessions") ? {id:"user"} : permission ? {permission} : null;}};}};
      }}};
      const response=await worker.fetch(new Request("https://takeoff.test/api/interpret",{
        method:"POST",headers:{"Content-Type":"application/json",Cookie:permission?"takeoff_session=test":""},
        body:JSON.stringify({jobId:"job",transcript:"Attic 20 by 10",section:"attic"})
      }),env);
      assert.equal(response.status,permission?403:401);
      assert.ok(queries.every(sql=>!/\b(?:INSERT|UPDATE|DELETE)\b/.test(sql)));
    }
    assert.equal(upstream,0);
  } finally { globalThis.fetch=originalFetch; }
});
