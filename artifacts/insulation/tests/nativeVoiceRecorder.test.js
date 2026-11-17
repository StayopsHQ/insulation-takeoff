import test from "node:test";
import assert from "node:assert/strict";
import { createNativeVoiceRecorder, NATIVE_VOICE_REQUIRED } from "../src/nativeVoiceRecorder.js";
import { recordingTranscript, formatRecordingElapsed } from "../src/voiceSession.js";
import { renderVoiceTakeoff } from "../src/voiceTakeoffView.js";

function fixture(available = true) {
  const calls = [];
  const handlers = {};
  let run = 0;
  const plugin = {
    async addListener(name, callback) {
      calls.push(name);
      handlers[name] = callback;
      return { async remove() { delete handlers[name]; } };
    },
    async prepareModel() { calls.push("prepare"); },
    async start() { calls.push("start"); return { streamId: `run-${++run}` }; },
    async pause() { calls.push("pause"); return { streamId: `run-${run}`, isRecording: false }; },
    async stop() { calls.push("stop"); return { streamId: `run-${run}`, isRecording: false }; }
  };
  const updates = [];
  const errors = [];
  const recorder = createNativeVoiceRecorder({
    plugin, isAvailable: () => available, onUpdate: event => updates.push(event),
    onError: error => errors.push(error), onStatus() {}
  });
  return { plugin, recorder, calls, handlers, updates, errors };
}

test("unavailable native recording rejects without contacting any plugin method", async () => {
  const { recorder, calls } = fixture(false);
  for (const method of ["start", "pause", "stop"]) {
    await assert.rejects(recorder[method](), { message: NATIVE_VOICE_REQUIRED });
  }
  assert.deepEqual(calls, []);
});

test("start subscribes before model preparation and never fabricates a listening event", async () => {
  const f = fixture();
  await f.recorder.start();
  assert.deepEqual(f.calls, ["transcriptionUpdate", "modelStatus", "transcriptionError", "prepare", "start"]);
  assert.equal(f.updates.length, 0);
  f.handlers.transcriptionUpdate({ streamId: "run-1", isRecording: true });
  assert.equal(f.updates[0].isRecording, true);
});

test("pause and resume use native methods and do not redownload the prepared model", async () => {
  const f = fixture();
  await f.recorder.start();
  assert.equal((await f.recorder.pause()).isRecording, false);
  await f.recorder.start();
  f.handlers.transcriptionUpdate({ streamId: "run-1", isRecording: true });
  assert.equal(f.updates.length, 0, "stale callbacks from the paused run are ignored");
  f.handlers.transcriptionUpdate({ streamId: "run-2", isRecording: true });
  assert.equal(f.updates.length, 1);
  await f.recorder.stop();
  assert.deepEqual(f.calls.slice(-4), ["start", "pause", "start", "stop"]);
  assert.equal(f.calls.filter(call => call === "prepare").length, 1);
});

test("early native events are matched to the returned stream, not an older recording", async () => {
  const f = fixture();
  f.plugin.start = async () => {
    f.handlers.transcriptionUpdate({ streamId: "old", isRecording: true });
    f.handlers.transcriptionUpdate({ streamId: "new", isRecording: true });
    return { streamId: "new" };
  };
  await f.recorder.start();
  assert.deepEqual(f.updates.map(event => event.streamId), ["new"]);
});

test("model and microphone failures reject instead of pretending recording started", async () => {
  const f = fixture();
  f.plugin.prepareModel = async () => { throw new Error("Download unavailable"); };
  await assert.rejects(f.recorder.start(), /Download unavailable/);
  assert.equal(f.recorder.prepared, false);
  assert.equal(f.calls.includes("start"), false);
  f.plugin.prepareModel = async () => {};
  f.plugin.start = async () => { throw new Error("Microphone permission denied"); };
  await assert.rejects(f.recorder.start(), /permission denied/);
  assert.equal(f.updates.length, 0);
});

test("listener failure cleans up partial subscriptions and does not start the microphone", async () => {
  const f = fixture();
  const add = f.plugin.addListener;
  f.plugin.addListener = async (name, handler) => {
    if (name === "modelStatus") throw new Error("Plugin registration missing");
    return add(name, handler);
  };
  await assert.rejects(f.recorder.start(), /registration missing/);
  assert.equal(f.calls.includes("start"), false);
  assert.deepEqual(Object.keys(f.handlers), []);
});

test("a native startup error event cannot be overwritten by a successful start promise", async () => {
  const f = fixture();
  f.plugin.start = async () => {
    f.handlers.transcriptionError({ message: "Microphone unavailable" });
    return { streamId: "failed" };
  };
  await assert.rejects(f.recorder.start(), /Microphone unavailable/);
  assert.equal(f.errors.length, 1);
  assert.equal(f.updates.length, 0);
});

test("review text combines confirmed speech with the latest interim window only once", () => {
  const interim = [{ runId: "run-1", start: 1, end: 2, text: "20 bays" }];
  assert.equal(recordingTranscript("Exterior walls", interim, "20 bays 2 by 6", "run-1"), "Exterior walls 20 bays 2 by 6");
  assert.equal(formatRecordingElapsed(125900), "02:05");
  assert.equal(formatRecordingElapsed(0), "00:00");
});

test("the branded record controls and four separate tiles exist on both platforms", () => {
  for (const nativeAvailable of [false, true]) {
    const html = renderVoiceTakeoff({ nativeAvailable });
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ["start", "stop", "pause", "resume", "finish", "recordElapsed",
      "voiceLiveText", "voiceReviewText", "processVoiceReview", "discardVoiceReview",
      "tileManual", "tileJobs", "tileResults", "tileSettings"]) assert.ok(ids.includes(id), id);
    assert.match(html, /LET’S<br>TAKEOFF!/);
    assert.doesNotMatch(html, /onclick=|IPHONE KEYBOARD DICTATION/);
    if (!nativeAvailable) assert.match(html, /This browser never starts recording and does not capture or upload audio/);
  }
});
