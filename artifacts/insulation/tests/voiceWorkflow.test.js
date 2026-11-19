import test from "node:test";
import assert from "node:assert/strict";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";

const phrase = "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center";

test("streaming segments, ordinary silence and pause never build review entries before explicit finish", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({streamId:"run-1",isRecording:true,currentText:"Attic 20 by",confirmedSegments:[],unconfirmedSegments:[]});
  assert.equal(app.read("state.voiceBatch"), null);
  await app.emit({streamId:"run-1",isRecording:true,currentText:"another",
    confirmedSegments:[{start:0,end:3,text:"Attic 20 by 10"}],unconfirmedSegments:[]});
  await app.emit({streamId:"run-1",isRecording:true,currentText:"another",
    confirmedSegments:[{start:0,end:3,text:"Attic 20 by 10"}],unconfirmedSegments:[]});
  assert.equal(app.read("state.voiceReviewOpen"), false);
  await app.click("pause");
  assert.equal(app.read("state.voiceReviewOpen"), false);
  assert.equal(app.read("state.voiceBatch"), null);
  await app.click("resume");
  await app.emit({streamId:"run-2",isRecording:true,currentText:"12 by 8",
    confirmedSegments:[],unconfirmedSegments:[]});
  await app.click("stop");
  assert.equal(app.read("state.voiceBatch.items.length"), 2);
  assert.deepEqual(app.read("state.voiceBatch.items.map(item=>item.result.parsed.area)"), [200,96]);
  assert.equal(app.saved.length, 0);
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 2);
});

test("restoring an unfinished dictation permits continuation rather than finalizing a partial review", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({streamId:"run-1",isRecording:true,currentText:"Attic 20 by",confirmedSegments:[],unconfirmedSegments:[]});
  app.evaluate('restoreVoiceDraft("job-1"); renderJob();');
  assert.equal(app.read("state.voiceReviewOpen"), false);
  assert.equal(app.read("state.voiceBatch"), null);
  assert.equal(app.read("state.voicePaused"), true);
  assert.equal(app.saved.length, 0);
});

test("browser record button does not call the plugin or claim to be listening", async () => {
  const app = await voiceAppHarness(false);
  await app.click("start");
  assert.deepEqual(app.calls, []);
  assert.deepEqual(app.browserCalls, []);
  assert.equal(app.read("state.voiceRecording"), false);
  assert.match(app.node("#flash").textContent, /OpenAI transcription is not configured/);
  assert.equal(app.node("#recordState").textContent, "Voice recording unavailable");
  await app.click("tileManual");
  assert.equal(app.node("#manualPanel").open, true);
});

test("browser Record captures audio, uploads only after Stop, then preserves review and job context", async () => {
  const app = await voiceAppHarness(false, { browserTranscriptionAvailable: true });
  await app.click("start");
  assert.deepEqual(app.browserCalls, ["getUserMedia"]);
  assert.equal(app.read("state.voiceRecording"), true);
  assert.equal(app.node("#recordState").textContent, "Recording in browser");
  assert.equal(app.calls.includes("transcribe"), false);

  await app.click("pause");
  assert.equal(app.read("state.voicePaused"), true);
  await app.click("resume");
  assert.equal(app.read("state.voiceRecording"), true);
  await app.click("stop");

  assert.equal(app.calls.includes("transcribe"), true);
  assert.equal(app.api.lastTranscription.jobId, "job-1");
  assert.equal(app.node("#voiceReviewText").value, phrase);
  assert.equal(app.read("state.voiceContext.section"), "exterior walls");
  assert.equal(app.saved.length, 0, "transcription does not bypass review or save measurements");

  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 1);
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220);
  assert.equal(app.saved[0].measurement.rawTranscript, phrase);
});

test("record, pause, resume, stop and review keep job/section and save only on Process", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  assert.deepEqual(app.calls, ["prepare", "start"]);
  assert.equal(app.read("state.voiceRecording"), false, "start promise does not fake microphone state");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: "Wall measurements",
    confirmedSegments: [], unconfirmedSegments: [] });
  assert.equal(app.read("state.voiceRecording"), true);
  assert.equal(app.node("#stop").hidden, false);
  await app.click("pause");
  assert.equal(app.read("state.voicePaused"), true);
  await app.click("resume");
  await app.emit({ streamId: "run-2", isRecording: true, currentText: "",
    confirmedSegments: [{ start: 0, end: 3, text: phrase }], unconfirmedSegments: [] });
  assert.equal(app.saved.length, 0, "native segments must not auto-save");
  await app.click("stop");
  assert.equal(app.node("#voiceReviewPanel").hidden, false);
  assert.equal(app.node("#voiceReviewText").value, `Wall measurements ${phrase}`);
  // Greg can edit the assembled recording before interpreting it.
  app.node("#voiceReviewText").value = phrase;
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 1);
  assert.equal(app.saved[0].jobId, "job-1");
  assert.equal(app.saved[0].measurement.rawTranscript, phrase);
  assert.equal(app.saved[0].measurement.section, "exterior walls");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220);
  assert.equal(app.saved[0].measurement.parsed.originalVoiceTranscript, `Wall measurements ${phrase}`);
  assert.equal(app.read("state.voiceContext.section"), "exterior walls");
  assert.match(app.node("#app").innerHTML, /Finish & save original form/);
  assert.match(app.node("#app").innerHTML, /Share this job/);
  assert.match(app.node("#app").innerHTML, /Share job/);
  assert.match(app.node("#app").innerHTML, /Interpreted:.*20 bays.*2x6.*9 ft.*16 in\. on center/);
  app.node('[data-form-quantity="entry-1"]').value = "240";
  app.node('[data-form-unit="entry-1"]').value = "sq ft";
  await app.node('[data-save-form-quantity="entry-1"]').events.click();
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220, "the deterministic result remains unchanged");
  assert.equal(app.saved[0].measurement.parsed.manualQuantity, 240);
  assert.equal(app.saved[0].measurement.parsed.manualUnit, "sq ft");
  await app.click("processVoiceReview");
  assert.equal(app.saved.length, 1, "already processed recording cannot be added twice");
  await app.click("finishTakeoff");
  assert.equal(app.node("#takeoffPdfOutput").hidden, true, "ambiguous material is never put on a guessed row");
  const material = app.node('[data-form-material="entry-1"]');
  material.value = "ext-r19-15k-9ft";
  await material.events.change();
  assert.equal(app.saved[0].measurement.parsed.formMaterialId, "ext-r19-15k-9ft");
  assert.equal(app.saved[0].measurement.parsed.manualQuantity, 240);
  await app.click("finishTakeoff");
  assert.equal(app.node("#takeoffPdfOutput").hidden, false);
  assert.equal(app.node("#openTakeoffPdf").href, "blob:takeoff-test");
  assert.equal(app.node("#downloadTakeoffPdf").download, "linden-ct-takeoff.pdf");
  assert.match(app.node("#takeoffPdfStatus").textContent, /original form is ready/);
});

test("one reviewed recording saves separately labeled attic and wall entries", async () => {
  const app = await voiceAppHarness();
  const transcript = "Attic 20 by 10, exterior walls 20 bays 2 x 6 9 foot wall 16 on center";
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: transcript,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");

  assert.equal(app.saved.length, 0, "areas are not saved before review");
  app.node("#voiceReviewText").value = transcript;
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");

  assert.equal(app.saved.length, 2);
  assert.equal(app.saved[0].measurement.section, "attic");
  assert.equal(app.saved[0].measurement.parsed.area, 200);
  assert.equal(app.saved[1].measurement.section, "exterior walls");
  assert.equal(app.saved[1].measurement.parsed.squareFeet, 220);
  assert.equal(app.saved[0].measurement.parsed.originalVoiceTranscript, transcript);
  assert.equal(app.saved[1].measurement.parsed.originalVoiceTranscript, transcript);
  assert.equal(app.read("state.voiceReviewProcessed"), true);
});

test("the selected section applies only before a clearly named spoken change", async () => {
  const app = await voiceAppHarness();
  const transcript = "24 by 8, next area attic 20 by 10";
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: transcript,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.node("#voiceReviewText").value = transcript;
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");

  assert.equal(app.saved.length, 2);
  assert.equal(app.saved[0].measurement.section, "exterior walls");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 192);
  assert.equal(app.saved[1].measurement.section, "attic");
  assert.equal(app.saved[1].measurement.parsed.area, 200);
});

test("ambiguous area changes stay editable and save nothing until clarified", async () => {
  const app = await voiceAppHarness();
  const ambiguous = "Exterior walls 20 bays 2 x 6 9 foot wall 16 on center, next area 24 by 8";
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: ambiguous,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.node("#voiceReviewText").value = ambiguous;
  await app.click("processVoiceReview");

  assert.equal(app.saved.length, 0);
  assert.equal(app.node("#voiceReviewText").readOnly, false);
  assert.equal(app.node("#voiceReviewText").value, ambiguous);
  assert.match(app.node("#voiceBatchReview").innerHTML, /Choose a section/);

  app.node("#voiceReviewText").value = "Exterior walls 20 bays 2 x 6 9 foot wall 16 on center, attic 24 by 8";
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 2);
  assert.equal(app.saved[0].measurement.section, "exterior walls");
  assert.equal(app.saved[1].measurement.section, "attic");
});

test("retrying a partially saved multi-area recording does not duplicate its first entry", async () => {
  const app = await voiceAppHarness();
  const transcript = "Attic 20 by 10, exterior walls 20 bays 2 x 6 9 foot wall 16 on center";
  const createMeasurement = app.api.createMeasurement.bind(app.api);
  let attempts = 0;
  app.api.createMeasurement = async (...args) => {
    attempts += 1;
    if (attempts === 2) throw new Error("Offline");
    return createMeasurement(...args);
  };
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: transcript,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.node("#voiceReviewText").value = transcript;
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");

  assert.equal(app.saved.length, 1);
  assert.equal(app.read("state.voiceSaveProgress"), 1);
  assert.match(app.node("#flash").textContent, /1 of 2 area entries were saved/);

  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved.length, 2);
  assert.equal(app.saved[0].measurement.section, "attic");
  assert.equal(app.saved[1].measurement.section, "exterior walls");
  assert.equal(app.read("state.voiceReviewProcessed"), true);
});

test("offline submission keeps the review draft for retry and never crosses jobs", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.api.failSave = true;
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");
  assert.equal(app.read("state.voiceReviewProcessed"), false);
  assert.equal(app.read("state.voiceReviewText"), phrase);
  assert.match(app.node("#flash").textContent, /retry when connected/);
  app.api.failSave = false;
  app.evaluate('state.activeJob = {id:"different-job",name:"Other job"}');
  await app.click("processVoiceReview");
  assert.equal(app.saved.length, 0);
  assert.match(app.node("#flash").textContent, /different job/);
});

test("the transcript stays available when the current wall section needs clarification", async () => {
  const app = await voiceAppHarness();
  app.evaluate("state.section = null");
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  await app.click("processVoiceReview");
  assert.equal(app.saved.length, 0);
  assert.equal(app.read("state.voiceReviewText"), phrase);
  assert.match(app.node("#voiceBatchReview").innerHTML, /Choose the wall section/);
  app.node("#sectionSelect").events.change({ target: { value: "exterior walls" } });
  await app.click("processVoiceReview");
  await app.click("confirmVoiceBatch");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220);
});

test("an interrupted native run stays one unfinished dictation until explicit Stop", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.emit({ streamId: "run-1", isRecording: false, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  assert.equal(app.read("state.voiceReviewOpen"), false);
  assert.equal(app.read("state.voicePaused"), true);
  assert.equal(app.read("state.voiceBatch"), null);
  await app.click("resume");
  assert.equal(app.calls.filter(call => call === "start").length, 2);
  await app.emit({ streamId: "run-2", isRecording: true, currentText: "Attic 20 by 10",
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  assert.equal(app.read("state.voiceReviewOpen"), true);
  assert.match(app.node("#voiceReviewText").value, /Wall measurements.*Attic 20 by 10/);
  assert.equal(app.saved.length, 0);
});

test("a stopped transcript and its section survive restoring the per-job draft", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.evaluate('state.voiceReviewText = ""; state.voiceContext = null; state.section = null; restoreVoiceDraft("job-1"); renderJob();');
  assert.equal(app.node("#voiceReviewText").value, phrase);
  assert.equal(app.read("state.voiceContext.jobId"), "job-1");
  assert.equal(app.read("state.section"), "exterior walls");
});

test("discard requires confirmation and never deletes saved measurements", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.evaluate("window.confirm = () => false");
  await app.click("discardVoiceReview");
  assert.equal(app.read("state.voiceReviewText"), phrase);
  app.evaluate("window.confirm = () => true");
  await app.click("discardVoiceReview");
  assert.equal(app.read("state.voiceReviewText"), "");
  assert.equal(app.calls.includes("save"), false);
  await app.click("start");
  assert.equal(app.calls.filter(call => call === "start").length, 2);
});

test("separate Manual Entry still calculates in the browser without touching the plugin", async () => {
  const app = await voiceAppHarness(false);
  await app.click("tileManual");
  app.node("#manualText").value = phrase;
  await app.click("saveManual");
  assert.equal(app.saved.length, 1);
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220);
  assert.deepEqual(app.calls, ["save"]);
});
