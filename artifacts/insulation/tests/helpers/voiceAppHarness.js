import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as parser from "../../src/parser.js";
import * as session from "../../src/voiceSession.js";
import * as native from "../../src/nativeVoiceRecorder.js";
import { renderVoiceTakeoff } from "../../src/voiceTakeoffView.js";

// Exercises actual main.js click handlers without network, microphone, Apple SDK
// or real storage. This is not a substitute for an iPhone hardware test.
export async function voiceAppHarness(available = true) {
  const nodes = new Map();
  const handlers = {};
  const calls = [];
  const saved = [];
  const storage = new Map();
  let run = 0;
  let snapshot = {};
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
  const api = {
    async createMeasurement(jobId, measurement) {
      calls.push("save");
      if (api.failSave) throw new Error("Offline");
      saved.push({ jobId, measurement });
      return { measurement: { id: `entry-${saved.length}`, ...measurement } };
    }
  };
  const context = vm.createContext({
    ...parser, ...session, ...native, renderVoiceTakeoff, api,
    WhisperVoice: plugin, isWhisperKitAvailable: () => available,
    document: { querySelector: node, querySelectorAll: () => [], activeElement: null },
    window: { addEventListener() {}, confirm: () => true },
    navigator: {}, sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setInterval: () => 1, clearInterval() {}, console, Date
  });
  const source = (await readFile(new URL("../../src/main.js", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "").replace(/bootstrap\(\);\s*$/, "");
  vm.runInContext(source, context);
  const evaluate = code => vm.runInContext(code, context);
  evaluate(`state.user = {displayName:"Greg"}; state.activeJob = {id:"job-1",name:"Linden Ct",status:"In progress"}; state.section = "exterior walls"; renderJob();`);
  return {
    node, calls, saved, api, plugin, evaluate, storage,
    async click(id) { await node(`#${id}`).events.click(); await evaluate("state.voiceQueue"); },
    async emit(event) {
      snapshot = event;
      handlers.transcriptionUpdate(event);
      await evaluate("state.voiceQueue");
    },
    read(expression) { return JSON.parse(JSON.stringify(evaluate(expression))); }
  };
}
