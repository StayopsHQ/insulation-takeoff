import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const readProjectFile = path => readFile(new URL(path, projectRoot), "utf8");

test("the iOS app starts the custom Capacitor bridge with WhisperKit registered", async () => {
  const [storyboard, bridge, project, plugin] = await Promise.all([
    readProjectFile("ios/App/App/Base.lproj/Main.storyboard"),
    readProjectFile("ios/App/App/InsulationBridgeViewController.swift"),
    readProjectFile("ios/App/App.xcodeproj/project.pbxproj"),
    readProjectFile("ios/App/App/WhisperVoicePlugin.swift")
  ]);

  assert.match(storyboard, /customClass="InsulationBridgeViewController" customModule="App"/);
  assert.match(bridge, /registerPluginInstance\(WhisperVoicePlugin\(\)\)/);
  assert.match(project, /WhisperVoicePlugin\.swift in Sources/);
  assert.match(project, /productName = WhisperKit/);
  assert.match(plugin, /import WhisperKit/);
});

test("the browser app has no remote or browser-based audio transcription fallback", async () => {
  const [main, api] = await Promise.all([
    readProjectFile("src/main.js"),
    readProjectFile("src/api.js")
  ]);

  assert.doesNotMatch(main, /SpeechRecognition|MediaRecorder|getUserMedia|api\.transcribe/);
  assert.doesNotMatch(api, /transcribe\s*:/);
});

test("native recording is primary and manual entry remains a separate browser option", async () => {
  const main = await readProjectFile("src/main.js");
  const view = await readProjectFile("src/voiceTakeoffView.js");
  const bridge = await readProjectFile("src/voiceTranscription.js");

  assert.match(main, /renderVoiceTakeoff\(\{ nativeAvailable: nativeVoiceAvailable \}\)/);
  assert.match(main, /id="manualText" rows="7"/);
  assert.match(main, /document\.querySelector\("#saveManual"\)\?\.addEventListener\("click", saveManual\)/);
  assert.match(main, /function saveManual\(\)[\s\S]*?parseTranscript\(text, currentSectionContext\(\), state\.material\)/);
  assert.match(view, /Recording needs the installed iPhone app/);
  assert.match(bridge, /Capacitor\.isPluginAvailable\("WhisperVoice"\)/);
  assert.doesNotMatch(main, /IPHONE KEYBOARD DICTATION/);
  assert.match(main, /document\.querySelector\("#start"\)\?\.addEventListener\("click", startVoiceTranscription\)/);
  assert.match(main, /document\.querySelector\("#stop"\)\?\.addEventListener\("click", finishVoiceTranscription\)/);
});

test("measurement submission resolves the selected section and asks before saving unassigned text", async () => {
  const main = await readProjectFile("src/main.js");
  assert.match(main, /function currentSectionContext\(\)[\s\S]*?normalizeSectionContext\(state\.section\)[\s\S]*?normalizeSectionContext\(document\.querySelector\("#sectionSelect"\)\?\.value\)/);
  assert.match(main, /function saveManual\(\)[\s\S]*?if \(!parsed\.section\) return setMessage\(parsed\.message, "info"\);[\s\S]*?await saveMeasurement\(parsed,/);
  assert.match(main, /if \(!parsed\.section \|\| !shouldSaveVoiceResult\(parsed\)\) return setMessage\(parsed\.message, "info"\)/);
});

test("the iPhone UI describes first-download progress and offline behavior", async () => {
  const main = await readProjectFile("src/main.js");
  const view = await readProjectFile("src/voiceTakeoffView.js");

  assert.match(view, /id="modelProgress"/);
  assert.match(main, /After caching, transcription works offline/);
  assert.match(main, /Saving to shared jobs needs an internet connection/);
});

test("the Cloudflare iOS sync helper verifies the live API before bundling its URL", async () => {
  const [packageJson, helper] = await Promise.all([
    readProjectFile("package.json").then(JSON.parse),
    readProjectFile("scripts/mobile-sync-cloudflare.mjs")
  ]);

  assert.equal(packageJson.scripts["mobile:sync:cloudflare"], "node ./scripts/mobile-sync-cloudflare.mjs");
  assert.match(helper, /https:\/\/insulation-takeoff\.mleo0705\.workers\.dev/);
  assert.match(helper, /\/api\/health/);
  assert.match(helper, /health\?\.service !== "insulation-takeoff"/);
  assert.match(helper, /VITE_API_BASE_URL: apiBaseUrl/);
  assert.doesNotMatch(helper, /wrangler deploy|migrations apply/);
});

test("WhisperKit is pinned and uses the audited initializer argument order", async () => {
  const [project, plugin] = await Promise.all([
    readProjectFile("ios/App/App.xcodeproj/project.pbxproj"),
    readProjectFile("ios/App/App/WhisperVoicePlugin.swift")
  ]);
  assert.match(project, /kind = exactVersion;\s+version = 1\.1\.1;/);
  assert.match(plugin, /load: true,\s+download: false,/);
  assert.match(plugin, /await streamTask\?\.value/);
});

test("model and tokenizer have persistent local paths with download progress", async () => {
  const plugin = await readProjectFile("ios/App/App/WhisperVoicePlugin.swift");
  assert.match(plugin, /\.applicationSupportDirectory/);
  assert.match(plugin, /ready-model\.txt/);
  assert.match(plugin, /modelFolder: modelFolder\.path/);
  assert.match(plugin, /tokenizerFolder: modelDirectory/);
  assert.match(plugin, /progress\.fractionCompleted/);
  assert.match(plugin, /isExcludedFromBackup = true/);
  assert.match(plugin, /try relativeFolder\.write[\s\S]*whisperKit = preparedKit/);
});
