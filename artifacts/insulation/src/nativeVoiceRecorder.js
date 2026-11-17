export const NATIVE_VOICE_REQUIRED =
  "WhisperKit recording requires the installed iPhone app. This browser does not record or upload audio. Use Manual Entry here.";

// Injectable bridge adapter: a resolved start() is NOT evidence that the mic is
// listening. Only native transcriptionUpdate events can report isRecording.
export function createNativeVoiceRecorder({ plugin, isAvailable, onUpdate, onStatus, onError }) {
  let prepared = false;
  let listeners = null;
  let operation = false;
  let starting = false;
  let runId = null;
  let earlyUpdates = [];
  let startError = null;

  function requireNative() {
    if (!isAvailable()) throw new Error(NATIVE_VOICE_REQUIRED);
  }

  async function connect() {
    if (listeners) return;
    const result = await Promise.allSettled([
      plugin.addListener("transcriptionUpdate", event => {
        if (starting) earlyUpdates.push(event);
        else if (runId && event.streamId === runId) {
          onUpdate(event);
          if (event.isRecording === false && !operation) runId = null;
        }
      }),
      plugin.addListener("modelStatus", event => onStatus?.(event)),
      plugin.addListener("transcriptionError", event => {
        runId = null;
        const error = new Error(event.message || "On-device transcription stopped.");
        if (starting) startError = error;
        onError?.(error);
      })
    ]);
    const failure = result.find(item => item.status === "rejected");
    if (failure) {
      await Promise.all(result.filter(item => item.status === "fulfilled").map(item => item.value.remove()));
      throw failure.reason;
    }
    listeners = result.map(item => item.value);
  }

  return {
    get prepared() { return prepared; },
    async start() {
      requireNative();
      if (operation || runId) throw new Error("A recording is already starting or active.");
      operation = true;
      try {
        await connect();
        if (!prepared) {
          await plugin.prepareModel();
          prepared = true;
        }
        starting = true;
        startError = null;
        earlyUpdates = [];
        const result = await plugin.start();
        if (startError) throw startError;
        if (!result?.streamId) throw new Error("The native recorder did not return a recording session.");
        runId = result.streamId;
        starting = false;
        for (const event of earlyUpdates) {
          if (event.streamId === runId) onUpdate(event);
        }
        earlyUpdates = [];
        return result;
      } finally {
        starting = false;
        operation = false;
      }
    },
    async pause() {
      requireNative();
      if (operation) throw new Error("Wait for the recorder to finish its current action.");
      operation = true;
      try {
        const result = await plugin.pause();
        runId = null;
        return result;
      } finally { operation = false; }
    },
    async stop() {
      requireNative();
      if (operation) throw new Error("Wait for the recorder to finish its current action.");
      operation = true;
      try {
        const result = await plugin.stop();
        runId = null;
        return result;
      } finally { operation = false; }
    }
  };
}
