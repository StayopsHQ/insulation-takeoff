import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as parser from "../../src/parser.js";
import * as session from "../../src/voiceSession.js";
import * as native from "../../src/nativeVoiceRecorder.js";
import { createBrowserVoiceRecorder } from "../../src/browserVoiceRecorder.js";
import { renderVoiceTakeoff } from "../../src/voiceTakeoffView.js";
import { createCompletedTakeoffPdf } from "../../src/takeoffPdf.js";
import * as batch from "../../src/voiceBatch.js";
import { renderVoiceBatchReview } from "../../src/voiceBatchView.js";
import { formRowChoices, resolveFormRow } from "../../src/takeoffFormRows.js";
import { interpretedVoiceBatch } from "../../src/interpretedBatch.js";

// Exercises actual main.js click handlers without network, microphone, Apple SDK
// or real storage. This is not a substitute for an iPhone hardware test.
export async function voiceAppHarness(available = true, {
  browserTranscriptionAvailable = false,
  browserCaptureSupported = true,
  interpretationEnabled = false
} = {}) {
  const formBytes = new Uint8Array(await readFile(new URL("../../public/takeoff-form.pdf", import.meta.url)));
  const nodes = new Map();
  const handlers = {};
  const calls = [];
  const browserCalls = [];
  const saved = [];
  const blobs = [];
  const storage = new Map();
  let run = 0;
  let snapshot = {};
  let context;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: "", textContent: "", dataset: {}, hidden: false, disabled: false,
      tagName: selector.includes("Panel") || selector.includes("Settings") ? "DETAILS" : "DIV",
      events: {}, addEventListener(name, callback) { this.events[name] = callback; },
      setAttribute() {}, scrollIntoView() {}, focus() {}
    });
    return nodes.get(selector);
  };
  const plugin = {
    async addListener(name, callback) { handlers[name] = callback; return { async remove() {} }; },
    async prepareModel() { calls.push("prepare"); },
    async start() { calls.push("start"); return { streamId: `run-${++run}` }; },
    async pause() { calls.push("pause"); return { ...snapshot, isRecording: false }; },
    async stop() { calls.push("stop"); return { ...snapshot, isRecording: false }; }
  };
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
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["fake audio"], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  const mediaDevices = {
    async getUserMedia() {
      browserCalls.push("getUserMedia");
      return { getTracks: () => [{ stop() { browserCalls.push("release"); } }] };
    }
  };
  const api = {
    async interpretTranscript(jobId, transcript, section) {
      calls.push("interpret");
      api.lastInterpretation = { jobId, transcript, section };
      if (api.failInterpretation) throw new Error("Interpretation unavailable");
      return structuredClone(api.interpretationResponse);
    },
    async transcriptionStatus() { return { available: browserTranscriptionAvailable }; },
    async transcribeAudio(jobId, audioBlob) {
      calls.push("transcribe");
      if (api.failTranscription) throw new Error("OpenAI temporarily unavailable.");
      api.lastTranscription = { jobId, size: audioBlob.size, type: audioBlob.type };
      return { transcript: api.transcript || "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center" };
    },
    async createMeasurement(jobId, measurement) {
      calls.push("save");
      if (api.failSave) throw new Error("Offline");
      const storedMeasurement = { id: `entry-${saved.length + 1}`, ...measurement };
      saved.push({ jobId, measurement: storedMeasurement });
      return { measurement: storedMeasurement };
    },
    async updateMeasurement(id, data) {
      calls.push("update");
      const record = saved.find(item => item.measurement.id === id);
      if (!record) throw new Error("Measurement not found.");
      record.measurement = { ...record.measurement, ...data };
      return { measurement: record.measurement };
    }
  };
  context = vm.createContext({
    ...parser, ...session, ...native, ...batch, interpretedVoiceBatch, renderVoiceBatchReview, formRowChoices, resolveFormRow, renderVoiceTakeoff, api,
    createBrowserVoiceRecorder: options => createBrowserVoiceRecorder({
      ...options,
      mediaDevices: browserCaptureSupported ? mediaDevices : {},
      Recorder: browserCaptureSupported ? FakeMediaRecorder : undefined
    }),
    isBrowserAudioAvailable: () => browserCaptureSupported,
    isNativePlatform: () => false,
    createCompletedTakeoffPdf,
    WhisperVoice: plugin, isWhisperKitAvailable: () => available,
    document: {
      querySelector: node,
      querySelectorAll: selector => selector === "[data-save-form-quantity]"
        ? vm.runInContext("state.entries.map(entry => entry.id)", context).map(id => {
          const item = node(`[data-save-form-quantity="${id}"]`);
          item.dataset.saveFormQuantity = id;
          return item;
        })
        : (selector.startsWith("[data-batch-") || selector === "[data-form-material]" || selector === "[data-sprinkler-form-material]") ? (() => {
          const attribute = selector.slice(1, -1);
          const key = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          const html = [...nodes.values()].map(item => item.innerHTML || "").join("");
          return [...new Set([...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map(match => match[1]))].map(id => {
            const item = node(`[${attribute}="${id}"]`);
            item.dataset[key] = id;
            return item;
          });
        })() : [],
      activeElement: null
    },
    window: { addEventListener() {}, confirm: () => true },
    navigator: {}, sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    fetch: async path => ({
      ok: path === "/takeoff-form.pdf",
      async arrayBuffer() { return formBytes; }
    }),
    Blob,
    URL: { createObjectURL: blob => { blobs.push(blob); return "blob:takeoff-test"; }, revokeObjectURL() {} },
    setInterval: () => 1, clearInterval() {}, console, Date
  });
  const source = (await readFile(new URL("../../src/main.js", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "").replace(/bootstrap\(\);\s*$/, "");
  vm.runInContext(source, context);
  // Existing legacy-parser tests retain their original scope. New interpreter
  // integration tests explicitly enable the actual async handler with mock API.
  if (!interpretationEnabled) vm.runInContext("interpretVoiceReview = async () => {};", context);
  const evaluate = code => vm.runInContext(code, context);
  evaluate(`state.user = {displayName:"Greg"}; state.activeJob = {id:"job-1",name:"Linden Ct",status:"In progress"}; state.section = "exterior walls"; renderJob();`);
  await new Promise(resolve => setTimeout(resolve, 0));
  return {
    node, calls, browserCalls, saved, blobs, api, plugin, evaluate, storage,
    async click(id) { await node(`#${id}`).events.click(); await evaluate("state.voiceQueue"); },
    async emit(event) {
      snapshot = event;
      handlers.transcriptionUpdate(event);
      await evaluate("state.voiceQueue");
    },
    read(expression) { return JSON.parse(JSON.stringify(evaluate(expression))); }
  };
}
