import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserVoiceRecorder, isBrowserAudioAvailable } from "../src/browserVoiceRecorder.js";

class FakeMediaRecorder {
  static isTypeSupported(type) { return type === "audio/webm"; }
  constructor(_stream, options = {}) {
    this.mimeType = options.mimeType || "audio/webm";
    this.state = "inactive";
  }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded voice"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

test("unsupported browsers are rejected without requesting microphone access", async () => {
  let requested = false;
  assert.equal(isBrowserAudioAvailable({}, FakeMediaRecorder), false);
  const recorder = createBrowserVoiceRecorder({
    mediaDevices: { async getUserMedia() { requested = true; } },
    Recorder: null
  });
  await assert.rejects(recorder.start(), /cannot record audio/i);
  assert.equal(requested, false);
});

test("browser recorder requests permission, pauses, resumes, returns audio and releases the mic", async () => {
  const calls = [];
  const stream = {
    getTracks: () => [{ stop() { calls.push("release-mic"); } }]
  };
  const recorder = createBrowserVoiceRecorder({
    mediaDevices: {
      async getUserMedia(options) {
        calls.push(options.audio ? "permission" : "bad-options");
        return stream;
      }
    },
    Recorder: FakeMediaRecorder
  });

  assert.equal(recorder.isAvailable(), true);
  const session = await recorder.start();
  assert.match(session.streamId, /^browser-/);
  assert.equal(recorder.isRecording, true);
  recorder.pause();
  assert.equal(recorder.isPaused, true);
  recorder.resume();
  assert.equal(recorder.isRecording, true);

  const audio = await recorder.stop();
  assert.equal(audio.type, "audio/webm");
  assert.equal(await audio.text(), "recorded voice");
  assert.equal(recorder.isRecording, false);
  assert.deepEqual(calls, ["permission", "release-mic"]);
});
