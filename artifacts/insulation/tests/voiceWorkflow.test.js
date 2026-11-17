import test from "node:test";
import assert from "node:assert/strict";
import { voiceAppHarness } from "./helpers/voiceAppHarness.js";

const phrase = "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center";

test("browser record button does not call the plugin or claim to be listening", async () => {
  const app = await voiceAppHarness(false);
  await app.click("start");
  assert.deepEqual(app.calls, []);
  assert.equal(app.read("state.voiceRecording"), false);
  assert.match(app.node("#flash").textContent, /installed iPhone app/);
  assert.equal(app.node("#recordState").textContent, "Installed iPhone app required");
  await app.click("tileManual");
  assert.equal(app.node("#manualPanel").open, true);
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
  assert.equal(app.saved.length, 1);
  assert.equal(app.saved[0].jobId, "job-1");
  assert.equal(app.saved[0].measurement.rawTranscript, phrase);
  assert.equal(app.saved[0].measurement.section, "exterior walls");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220);
  assert.equal(app.saved[0].measurement.parsed.originalVoiceTranscript, `Wall measurements ${phrase}`);
  assert.equal(app.read("state.voiceContext.section"), "exterior walls");
  await app.click("processVoiceReview");
  assert.equal(app.saved.length, 1, "already processed recording cannot be added twice");
});

test("offline submission keeps the review draft for retry and never crosses jobs", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.click("stop");
  app.api.failSave = true;
  await app.click("processVoiceReview");
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
  assert.match(app.node("#flash").textContent, /Choose the wall section/);
  app.node("#sectionSelect").events.change({ target: { value: "exterior walls" } });
  await app.click("processVoiceReview");
  assert.equal(app.saved[0].measurement.parsed.squareFeet, 220);
});

test("an unexpected native stop opens review instead of allowing recognized text to be overwritten", async () => {
  const app = await voiceAppHarness();
  await app.click("start");
  await app.emit({ streamId: "run-1", isRecording: true, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  await app.emit({ streamId: "run-1", isRecording: false, currentText: phrase,
    confirmedSegments: [], unconfirmedSegments: [] });
  assert.equal(app.read("state.voiceReviewOpen"), true);
  assert.equal(app.node("#voiceReviewText").value, phrase);
  await app.click("start");
  assert.equal(app.calls.filter(call => call === "start").length, 1);
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
