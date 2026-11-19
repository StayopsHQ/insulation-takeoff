export const MAX_BROWSER_RECORDING_BYTES = 22 * 1024 * 1024;

export function isBrowserAudioAvailable(
  mediaDevices = globalThis.navigator?.mediaDevices,
  Recorder = globalThis.MediaRecorder
) {
  return Boolean(mediaDevices?.getUserMedia && Recorder);
}

function supportedMimeType(Recorder) {
  return [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm"
  ].find(type => Recorder.isTypeSupported?.(type)) || "";
}

export function createBrowserVoiceRecorder({
  mediaDevices = globalThis.navigator?.mediaDevices,
  Recorder = globalThis.MediaRecorder,
  onError = () => {},
  onLimit = () => {}
} = {}) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let totalBytes = 0;
  let stopWaiter = null;
  let limitRequested = false;
  let nextRun = 0;
  let runId = null;

  function stopTracks() {
    for (const track of stream?.getTracks?.() || []) track.stop();
    stream = null;
  }

  function finish(error = null) {
    const activeRecorder = recorder;
    if (!activeRecorder) return;
    const result = new Blob(chunks, { type: activeRecorder.mimeType || chunks[0]?.type || "audio/webm" });
    chunks = [];
    recorder = null;
    stopTracks();
    runId = null;
    const waiter = stopWaiter;
    stopWaiter = null;
    if (error) waiter?.reject(error);
    else if (!result.size) waiter?.reject(new Error("No audio was captured. Check microphone permission and try again."));
    else waiter?.resolve(result);
  }

  return {
    isAvailable: () => isBrowserAudioAvailable(mediaDevices, Recorder),
    get isRecording() { return recorder?.state === "recording"; },
    get isPaused() { return recorder?.state === "paused"; },

    async start() {
      if (!isBrowserAudioAvailable(mediaDevices, Recorder)) {
        throw new Error("This browser cannot record audio. Try a current iPhone Safari or desktop browser, or use Manual Entry.");
      }
      if (recorder) throw new Error("A browser recording is already active.");

      stream = await mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      totalBytes = 0;
      limitRequested = false;
      const mimeType = supportedMimeType(Recorder);
      try {
        recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
      } catch (error) {
        stopTracks();
        throw new Error(`Could not start browser recording: ${error.message}`);
      }
      runId = `browser-${++nextRun}`;
      recorder.ondataavailable = event => {
        if (!event.data?.size) return;
        chunks.push(event.data);
        totalBytes += event.data.size;
        if (totalBytes >= MAX_BROWSER_RECORDING_BYTES && !limitRequested) {
          limitRequested = true;
          queueMicrotask(() => onLimit());
        }
      };
      recorder.onerror = event => {
        const error = event.error || new Error("Browser audio recording failed.");
        finish(error);
        onError(error);
      };
      recorder.onstop = () => finish();
      try {
        recorder.start(1000);
      } catch (error) {
        recorder = null;
        stopTracks();
        throw new Error(`Could not start browser recording: ${error.message}`);
      }
      return { streamId: runId, mimeType: recorder.mimeType || mimeType };
    },

    pause() {
      if (recorder?.state !== "recording") throw new Error("There is no active browser recording to pause.");
      recorder.pause();
    },

    resume() {
      if (recorder?.state !== "paused") throw new Error("There is no paused browser recording to resume.");
      recorder.resume();
    },

    stop() {
      if (!recorder || recorder.state === "inactive") {
        throw new Error("There is no active browser recording to stop.");
      }
      return new Promise((resolve, reject) => {
        stopWaiter = { resolve, reject };
        recorder.stop();
      });
    },

    discard() {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorder = null;
      chunks = [];
      runId = null;
      stopWaiter = null;
      stopTracks();
    }
  };
}
