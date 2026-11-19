import { api } from "./api.js";
import { parseTranscript, detectSection, normalizeSectionContext } from "./parser.js";
import { appendConfirmedSegments, appendPendingVoiceText, pendingVoiceSegments, removeConfirmedInterim, replaceRunUnconfirmedSegments, shouldSaveVoiceResult, recordingTranscript, formatRecordingElapsed } from "./voiceSession.js";
import { isNativePlatform, isWhisperKitAvailable, WhisperVoice } from "./voiceTranscription.js";
import { createNativeVoiceRecorder, NATIVE_VOICE_REQUIRED } from "./nativeVoiceRecorder.js";
import { createBrowserVoiceRecorder, isBrowserAudioAvailable } from "./browserVoiceRecorder.js";
import { renderVoiceTakeoff } from "./voiceTakeoffView.js";
import { createCompletedTakeoffPdf } from "./takeoffPdf.js";
import { parseVoiceBatch, recalculateBatchItem, changeBatchSection, batchReadyItems, upgradeVoiceBatch } from "./voiceBatch.js";
import { renderVoiceBatchReview } from "./voiceBatchView.js";
import { interpretedVoiceBatch } from "./interpretedBatch.js";
import { formRowChoices, resolveFormRow } from "./takeoffFormRows.js";

const app = document.querySelector("#app");
const state = {
  user: null, jobs: [], activeJob: null, entries: [], section: null, material: null,
  voiceReady: false, voiceRecording: false, voicePaused: false, voiceBusy: false,
  voiceSegments: [], voiceUnconfirmed: [], voiceRunId: null, voiceCurrentText: "", voiceTranscript: "", voicePendingText: "",
  pendingVoiceCorrection: null, voiceQueue: Promise.resolve(),
  voiceStarting: false, voiceReviewOpen: false, voiceReviewText: "", voiceReviewProcessed: false,
  voiceContext: null, voiceElapsedMs: 0, voiceTickStartedAt: null, manualDraft: "",
  voiceSaveProgress: 0, voiceSaveProgressText: "",
  voiceBatch: null,
  browserTranscriptionAvailable: false, transcriptionStatusChecked: false, transcriptionStatusLoading: false,
  browserAudioBlob: null,
  busy: false, takeoffPdfUrl: null, takeoffPdfBusy: false
};
let recordingTimer = null;
const nativeRecorder = createNativeVoiceRecorder({
  plugin: WhisperVoice,
  isAvailable: isWhisperKitAvailable,
  onUpdate: queueVoiceUpdate,
  onStatus: updateModelStatus,
  onError: handleRecordingError
});
const browserRecorder = createBrowserVoiceRecorder({
  onError: error => {
    state.voiceRecording = false;
    state.voicePaused = false;
    state.voiceBusy = false;
    freezeRecordingClock();
    setMessage(`Browser recording stopped: ${error.message}`, "error");
    updateRecordingControls();
  },
  onLimit: () => {
    if (state.voiceRecording) {
      pauseVoiceTranscription();
      setMessage("Recording paused at the upload size limit. Tap Stop when you are ready to transcribe this recording.");
    }
  }
});

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const formatDate = value => value ? new Date(value).toLocaleString() : "";
const setMessage = (message, type = "info") => {
  const node = document.querySelector("#flash");
  if (node) {
    node.textContent = message;
    node.dataset.type = type;
  }
};
const button = (label, id, klass = "") => `<button id="${id}" class="${klass}">${label}</button>`;

function renderShell(content, { jobsLanding = false } = {}) {
  app.innerHTML = `
    ${jobsLanding ? `
      <header class="jobs-topbar">
        <button id="jobsMenuToggle" class="jobs-menu-toggle" type="button" aria-label="Open navigation menu" aria-controls="jobsNavigation" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div class="jobs-brand">
          <span class="jobs-logo-wrap"><img src="/fulcher-logo.png" alt="Fulcher #1" class="jobs-brand-logo"></span>
          <span class="jobs-brand-copy"><strong>INSULATION TAKEOFF</strong><small>JOB CALCULATOR</small></span>
        </div>
        ${state.user ? `
          <details class="jobs-profile">
            <summary aria-label="Open profile menu">
              <svg class="jobs-profile-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-3.2 3.1-5 7-5s6.5 1.8 7 5"/></svg>
              <span>${escapeHtml(state.user.displayName)}</span>
              <svg class="jobs-profile-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
            </summary>
            <div class="jobs-profile-menu"><button id="logout" type="button">Sign Out</button></div>
          </details>` : ""}
        <nav id="jobsNavigation" class="jobs-nav-menu" aria-label="Main navigation" hidden>
          <button type="button" data-jobs-destination="jobs">Your Jobs</button>
          <button type="button" data-jobs-destination="new">New Job</button>
        </nav>
      </header>` : `
      <header class="topbar ${state.activeJob ? "topbar-job" : ""}">
        ${state.activeJob ? `<button id="back" class="topbar-back" aria-label="Back to saved jobs">←</button>` : ""}
        <div class="app-brand">
          <img src="/fulcher-logo.png" alt="Fulcher #1" class="brand-logo">
          <span><strong>INSULATION TAKEOFF</strong><small>Voice-first job calculator</small></span>
        </div>
        ${state.user ? `<div class="account"><span>${escapeHtml(state.user.displayName)}</span><button id="logout" class="subtle">Sign out</button></div>` : ""}
      </header>`}
    <main class="${jobsLanding ? "jobs-main" : ""}">${content}</main>
    <div id="flash" class="flash" role="status" aria-live="polite"></div>`;
  document.querySelector("#logout")?.addEventListener("click", logout);
  if (jobsLanding) {
    const menu = document.querySelector("#jobsNavigation");
    const toggle = document.querySelector("#jobsMenuToggle");
    toggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
      toggle.setAttribute("aria-label", menu.hidden ? "Open navigation menu" : "Close navigation menu");
    });
    document.querySelectorAll("[data-jobs-destination]").forEach(node => node.addEventListener("click", () => {
      if (node.dataset.jobsDestination === "new") renderNewJob();
      else renderDashboard();
    }));
  }
}

function renderAuth(setup = false) {
  renderShell(`
    <section class="auth-card card">
      <h1>${setup ? "Create the first account" : "Sign in"}</h1>
      <p>${setup ? "Use the one-time setup token configured for this environment to create the administrator account." : "Sign in to access shared jobs."}</p>
      ${setup ? `<label>Setup token<input id="setupToken" type="password" autocomplete="off" required></label>` : ""}
      <label>Email<input id="email" type="email" autocomplete="username" required></label>
      ${setup ? `<label>Your name<input id="displayName" autocomplete="name" required></label>` : ""}
      <label>Password<input id="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}" minlength="12" required></label>
      ${button(setup ? "Create administrator" : "Sign in", "authSubmit", "primary block")}
      <p id="authError" class="error" role="alert"></p>
    </section>`);
  document.querySelector("#authSubmit").addEventListener("click", async () => {
    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;
    try {
      if (setup) {
        await api.setup({
          setupToken: document.querySelector("#setupToken").value,
          email,
          password,
          displayName: document.querySelector("#displayName").value.trim()
        });
      } else {
        await api.login({ email, password });
      }
      await bootstrap();
    } catch (error) {
      document.querySelector("#authError").textContent = error.message;
    }
  });
}

async function logout() {
  if (state.voiceBusy || state.voiceStarting || state.busy) {
    return setMessage("Wait for the current recording action to finish before signing out.", "info");
  }
  await stopVoiceTranscription();
  try { await api.logout(); } catch {}
  state.user = null;
  state.jobs = [];
  state.activeJob = null;
  renderAuth();
}

async function bootstrap() {
  try {
    const result = await api.me();
    state.user = result.user;
    await loadJobs();
    renderDashboard();
  } catch (error) {
    if (error.message.includes("SETUP_REQUIRED")) renderAuth(true);
    else renderAuth();
  }
}

async function loadJobs() {
  const result = await api.listJobs();
  state.jobs = result.jobs || [];
}

function renderDashboard() {
  state.activeJob = null;
  renderShell(`
    <div class="jobs-page">
      <div class="jobs-heading">
        <div><h1>Your Jobs</h1><p>Jobs are shared between authorized team accounts.</p></div>
        ${button("+ New Job", "newJob", "jobs-new")}
      </div>
      <section id="jobList" class="jobs-list">
      ${state.jobs.length ? state.jobs.map(job => `
        <button class="jobs-card" data-job="${escapeHtml(job.id)}">
          <span class="jobs-card-copy">
            <strong>${escapeHtml(job.name || "Untitled job")}</strong>
            <span class="jobs-address">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg>
              ${escapeHtml(job.address || [job.builder, job.subdivision, job.lot].filter(Boolean).join(" · ") || "Location not added")}
            </span>
            <small class="jobs-updated">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v6M16 3v6M4 11h16"/></svg>
              ${job.updatedAt ? `Updated ${escapeHtml(formatDate(job.updatedAt))}` : "No update time"}
            </small>
          </span>
          <span class="jobs-card-side">
            ${job.status ? `<span class="jobs-status">${escapeHtml(job.status)}</span>` : ""}
            <svg class="jobs-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </button>`).join("") : `<p class="jobs-empty">No jobs yet. Create the first takeoff.</p>`}
      </section>
    </div>`, { jobsLanding: true });
  document.querySelector("#newJob").addEventListener("click", renderNewJob);
  document.querySelectorAll("[data-job]").forEach(node => node.addEventListener("click", () => openJob(node.dataset.job)));
}

function renderNewJob() {
  renderShell(`
    <button id="back" class="subtle">← Jobs</button>
    <section class="card form-card"><h1>New job</h1>
      <label>Job / customer name<input id="jobName" required></label>
      <label>Builder<input id="builder"></label>
      <label>Subdivision<input id="subdivision"></label>
      <label>Lot number<input id="lot"></label>
      <label>Street / address<input id="address"></label>
      ${button("Create job", "createJob", "primary block")}
    </section>`);
  document.querySelector("#back").addEventListener("click", renderDashboard);
  document.querySelector("#createJob").addEventListener("click", async () => {
    const name = document.querySelector("#jobName").value.trim();
    if (!name) return setMessage("Enter a job or customer name.", "error");
    try {
      const result = await api.createJob({
        name,
        builder: document.querySelector("#builder").value.trim(),
        subdivision: document.querySelector("#subdivision").value.trim(),
        lot: document.querySelector("#lot").value.trim(),
        address: document.querySelector("#address").value.trim()
      });
      await loadJobs();
      await openJob(result.job.id);
    } catch (error) { setMessage(error.message, "error"); }
  });
}

async function openJob(id) {
  try {
    if (state.takeoffPdfUrl) URL.revokeObjectURL(state.takeoffPdfUrl);
    state.takeoffPdfUrl = null;
    const job = state.jobs.find(item => item.id === id) || (await api.listJobs()).jobs.find(item => item.id === id);
    if (!job) throw new Error("Job not found.");
    state.activeJob = job;
    state.section = null;
    state.material = null;
    const result = await api.listMeasurements(id);
    state.entries = result.measurements || [];
    state.voiceSegments = [];
    state.voiceUnconfirmed = [];
    state.voiceRunId = null;
    state.voiceCurrentText = "";
    state.voicePaused = false;
    state.voiceTranscript = "";
    state.voicePendingText = "";
    state.pendingVoiceCorrection = null;
    state.voiceStarting = false;
    state.voiceReviewOpen = false;
    state.voiceReviewText = "";
    state.voiceReviewProcessed = false;
    state.voiceSaveProgress = 0;
    state.voiceSaveProgressText = "";
    state.voiceBatch = null;
    state.voiceContext = null;
    freezeRecordingClock();
    state.voiceElapsedMs = 0;
    state.manualDraft = "";
    restoreVoiceDraft(id);
    renderJob();
  } catch (error) { setMessage(error.message, "error"); }
}

function renderJob() {
  const job = state.activeJob;
  if (!job) return renderDashboard();
  if (state.takeoffPdfUrl) URL.revokeObjectURL(state.takeoffPdfUrl);
  state.takeoffPdfUrl = null;
  const nativeVoiceAvailable = isWhisperKitAvailable();
  const browserCaptureSupported = !isNativePlatform() && isBrowserAudioAvailable();
  renderShell(`
    <div class="job-page">
      <div class="brand-banner"><img src="/fulcher-logo.png" alt="Fulcher #1"></div>
      <div class="job-heading">
        <div>
          <p class="eyebrow">${escapeHtml([job.builder, job.lot && `Lot ${job.lot}`].filter(Boolean).join(" · ") || "INSULATION TAKEOFF")}</p>
          <h1>${escapeHtml(job.name)}</h1>
          <p class="job-location">${escapeHtml([job.subdivision, job.address].filter(Boolean).join(" · ") || "Takeoff in progress")}</p>
        </div>
        <span class="status">${escapeHtml(job.status)}</span>
      </div>

      ${renderVoiceTakeoff({
        nativeAvailable: nativeVoiceAvailable,
        browserTranscriptionAvailable: state.browserTranscriptionAvailable,
        browserCaptureSupported
      })}
      ${renderVoiceCorrection()}

      <section id="measurementsPanel" class="card measurements-card">
        <div class="measurements-heading">
          <div><p class="eyebrow">CURRENT SECTION</p><h2 id="currentSection">${escapeHtml(state.section || "Choose a section")}</h2></div>
          <span id="currentMaterial" class="material-pill">${escapeHtml(state.material || "Material not set")}</span>
        </div>
        <details id="takeoffSettings" class="collapsible-card section-settings">
          <summary>Change section or material</summary>
          <label>Section
            <select id="sectionSelect">
              <option value="">Choose section…</option>
              ${["exterior walls","basement exterior","party walls","band joists","attic","batt ceilings","slopes","garage ceiling","sill","caulk","foam"].map(name => `<option value="${name}" ${state.section === name ? "selected" : ""}>${name}</option>`).join("")}
            </select>
          </label>
        </details>
        <div class="measurements-title"><h2>Measurements</h2><span>${state.entries.length} ${state.entries.length === 1 ? "entry" : "entries"}</span></div>
        <div id="entries">${renderEntries()}</div>
        <section class="takeoff-finish" aria-label="Finish takeoff">
          ${button("Finish & save original form", "finishTakeoff", "primary block")}
          <p class="takeoff-finish-hint">Review or edit each measurement above, then create the original two-page takeoff form.</p>
          <div id="takeoffPdfOutput" class="takeoff-pdf-output" hidden>
            <p id="takeoffPdfStatus" role="status"></p>
            <a id="openTakeoffPdf" target="_blank" rel="noopener">Open / print completed form</a>
            <a id="downloadTakeoffPdf">Download PDF</a>
          </div>
        </section>
      </section>

        <details id="manualPanel" class="card collapsible-card">
          <summary>Manual Entry</summary>
          <p>Type a measurement note, or use keyboard dictation if available. This is separate from native voice recording.</p>
          <label>Transcript / measurements<textarea id="manualText" rows="7" placeholder="Example: exterior walls, 2 by 4, 16 inch centers, 8 foot, 12 bays">${escapeHtml(state.manualDraft)}</textarea></label>
          ${button("Process measurements", "saveManual", "primary block")}
        </details>

      <details class="card collapsible-card job-tools">
        <summary>Sharing and job tools</summary>
        <div class="job-tools-content">
          <section>
            <h3>Share this job</h3>
            <p>Give another registered team account access.</p>
            <label>Team member email<input id="shareEmail" type="email" placeholder="greg@example.com"></label>
            <label>Permission<select id="sharePermission"><option value="editor">Can edit</option><option value="viewer">View only</option></select></label>
            ${button("Share job", "shareJob", "secondary")}
          </section>
          <div class="action-row">
            ${button("Export CSV", "exportCsv", "secondary")}
            ${button("Print / Save PDF", "printJob", "secondary")}
            ${button(job.status === "Completed" ? "Reopen job" : "Mark completed", "toggleComplete", "primary")}
          </div>
        </div>
      </details>
    </div>`);
  document.querySelector("#back").addEventListener("click", leaveActiveJob);
  document.querySelector("#sectionSelect").addEventListener("change", event => {
    state.section = event.target.value || null;
    if (state.voiceContext?.jobId === state.activeJob.id && !state.voiceRecording && !state.voicePaused) {
      state.voiceContext.section = state.section;
      if (state.voiceBatch && !state.voiceBatch.interpretationAttempts && !state.voiceBatch.items.some(item => item.saved)) {
        state.voiceBatch = parseVoiceBatch(state.voiceReviewText, state.section, state.voiceContext.material || state.material);
        renderBatchReview();
        updateRecordingControls();
      }
    }
    persistVoiceDraft();
    document.querySelector("#currentSection").textContent = state.section || "Choose a section";
  });
  document.querySelector("#start")?.addEventListener("click", startVoiceTranscription);
  document.querySelector("#resume")?.addEventListener("click", startVoiceTranscription);
  document.querySelector("#pause")?.addEventListener("click", pauseVoiceTranscription);
  document.querySelector("#stop")?.addEventListener("click", finishVoiceTranscription);
  document.querySelector("#finish")?.addEventListener("click", finishVoiceTranscription);
  document.querySelector("#processVoiceReview").addEventListener("click", processVoiceReview);
  document.querySelector("#confirmVoiceBatch").addEventListener("click", confirmVoiceBatch);
  document.querySelector("#discardVoiceReview").addEventListener("click", discardVoiceReview);
  document.querySelector("#retryBrowserTranscription").addEventListener("click", transcribeBrowserRecording);
  document.querySelector("#discardBrowserAudio").addEventListener("click", discardBrowserAudio);
  document.querySelector("#voiceReviewText").addEventListener("input", event => {
    if (state.voiceBatch?.items.some(item => item.saved)) return;
    state.voiceReviewText = event.target.value;
    // Keep the per-recording attempt budget when editing the full transcript.
    // Individual measurement edits below are local and never invoke GPT.
    if (!state.voiceBatch?.interpretationAttempts) state.voiceBatch = null;
    renderBatchReview();
    persistVoiceDraft();
  });
  document.querySelector("#manualText").addEventListener("input", event => {
    state.manualDraft = event.target.value;
    persistVoiceDraft();
  });
  document.querySelector("#tileManual").addEventListener("click", () => revealJobPanel("#manualPanel", "#manualText"));
  document.querySelector("#tileJobs").addEventListener("click", leaveActiveJob);
  document.querySelector("#tileResults").addEventListener("click", () => revealJobPanel("#measurementsPanel"));
  document.querySelector("#tileSettings").addEventListener("click", () => revealJobPanel("#takeoffSettings", "#sectionSelect"));
  document.querySelector("#saveManual")?.addEventListener("click", saveManual);
  document.querySelector("#correctReplace")?.addEventListener("click", () => applyVoiceCorrection("replace"));
  document.querySelector("#correctNew")?.addEventListener("click", () => applyVoiceCorrection("new"));
  document.querySelector("#toggleComplete").addEventListener("click", toggleComplete);
  document.querySelector("#shareJob").addEventListener("click", shareJob);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#printJob").addEventListener("click", finishTakeoff);
  document.querySelector("#finishTakeoff").addEventListener("click", finishTakeoff);
  document.querySelectorAll("[data-edit]").forEach(node => node.addEventListener("click", () => editEntry(node.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(node => node.addEventListener("click", () => deleteEntry(node.dataset.delete)));
  document.querySelectorAll("[data-undo]").forEach(node => node.addEventListener("click", () => deleteEntry(node.dataset.undo)));
  document.querySelectorAll("[data-save-form-quantity]").forEach(node =>
    node.addEventListener("click", () => saveFormQuantity(node.dataset.saveFormQuantity))
  );
  document.querySelectorAll("[data-form-material]").forEach(node =>
    node.addEventListener("change", () => saveFormMaterial(node.dataset.formMaterial, node.value))
  );
  document.querySelectorAll("[data-sprinkler-form-material]").forEach(node =>
    node.addEventListener("change", () => saveFormMaterial(node.dataset.sprinklerFormMaterial, node.value, true))
  );
  renderBatchReview();
  updateRecordingControls();
  if (!nativeVoiceAvailable) loadBrowserTranscriptionStatus(job.id);
}

async function loadBrowserTranscriptionStatus(jobId) {
  if (state.transcriptionStatusChecked || state.transcriptionStatusLoading || !api.transcriptionStatus) return;
  state.transcriptionStatusLoading = true;
  try {
    const status = await api.transcriptionStatus();
    state.browserTranscriptionAvailable = status.available === true;
  } catch {
    state.browserTranscriptionAvailable = false;
  } finally {
    state.transcriptionStatusLoading = false;
    state.transcriptionStatusChecked = true;
  }
  if (state.activeJob?.id === jobId && !state.voiceRecording && !state.voiceBusy) renderJob();
}

function revealJobPanel(selector, focusSelector) {
  const node = document.querySelector(selector);
  if (!node) return;
  if (node.tagName === "DETAILS") node.open = true;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusSelector) document.querySelector(focusSelector)?.focus({ preventScroll: true });
}

async function leaveActiveJob() {
  if (state.voiceBusy || state.voiceStarting || state.busy) return;
  if ((state.voiceRecording || state.voicePaused) && !window.confirm("Stop recording and keep the transcript draft for this job?")) return;
  await stopVoiceTranscription();
  persistVoiceDraft();
  await loadJobs();
  renderDashboard();
}

function pendingVoiceText() {
  return pendingVoiceSegments(state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId)
    .map(segment => segment.text).filter(Boolean).join(" ").trim();
}

function renderVoiceCorrection() {
  const correction = state.pendingVoiceCorrection;
  if (!correction) return "";
  return `
    <section class="voice-correction" aria-live="polite">
      <h3>Correction needs your choice</h3>
      <p>No measurement was changed. The original correction phrase is preserved here:</p>
      <blockquote>${escapeHtml(correction.utterance)}</blockquote>
      <label>Final measurement text
        <textarea id="correctionFinalText" rows="2" placeholder="Enter only the final version, for example: 26 by 8"></textarea>
      </label>
      <label>Earlier entry to replace
        <select id="correctionTarget">
          <option value="">Choose an earlier measurement…</option>
          ${state.entries.map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(`${entry.section || "Unassigned"} — ${entry.rawTranscript || entry.message || entry.id}`)}</option>`).join("")}
        </select>
      </label>
      <div class="action-row">
        ${button("Replace selected entry", "correctReplace")}
        ${button("Add as a new entry", "correctNew", "primary")}
      </div>
      <p class="hint">Choose one action explicitly. The calculation engine will parse only the final text you enter.</p>
    </section>`;
}

function voiceDraftKey(jobId) {
  return `insulation-takeoff-voice-draft:${jobId}`;
}

function restoreVoiceDraft(jobId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(voiceDraftKey(jobId)) || "null");
    if (!saved) return;
    state.voiceTranscript = String(saved.transcript || "");
    state.voicePendingText = String(saved.pendingText || "");
    state.pendingVoiceCorrection = saved.pendingCorrection?.fromVoiceReview ? null : saved.pendingCorrection || null;
    state.voiceUnconfirmed = Array.isArray(saved.unconfirmedSegments) ? saved.unconfirmedSegments : [];
    state.voiceCurrentText = String(saved.currentText || "");
    state.voiceRunId = saved.runId || null;
    state.voiceContext = saved.context?.jobId === jobId ? saved.context : null;
    state.section = normalizeSectionContext(saved.section || state.voiceContext?.section);
    state.material = saved.material || state.voiceContext?.material || null;
    state.manualDraft = String(saved.manualDraft || "");
    state.voiceElapsedMs = Math.max(0, Number(saved.elapsedMs) || 0);
    state.voiceReviewProcessed = saved.reviewProcessed === true;
    state.voiceReviewText = String(saved.reviewText || "");
    state.voiceSaveProgress = Math.max(0, Number(saved.voiceSaveProgress) || 0);
    state.voiceSaveProgressText = String(saved.voiceSaveProgressText || "");
    state.voiceBatch = saved.voiceBatch?.sourceText === state.voiceReviewText ? saved.voiceBatch : null;
    if (!state.voiceReviewProcessed) {
      state.voiceBatch = upgradeVoiceBatch(state.voiceBatch, state.voiceContext?.section || state.section, state.material);
      if (state.voiceBatch?.items.length && state.voiceBatch.items.every(item => item.saved) &&
          state.voiceBatch.issues.every(issue => issue.resolved)) state.voiceReviewProcessed = true;
    }
    const interruptedTranscript = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, saved.runId);
    state.voiceReviewOpen = saved.reviewOpen === true;
    // Restoring an unfinished recording is not an instruction to finalize it.
    state.voicePaused = isWhisperKitAvailable() && !state.voiceReviewOpen && Boolean(interruptedTranscript);
    if (state.voiceReviewOpen && !state.voiceReviewText) state.voiceReviewText = interruptedTranscript;
    if (state.voiceReviewOpen && !state.voiceReviewProcessed && !state.voiceBatch) {
      state.voiceBatch = parseVoiceBatch(state.voiceReviewText, state.voiceContext?.section || state.section, state.material);
    }
  } catch {
    state.voiceTranscript = "";
    state.voicePendingText = "";
    state.pendingVoiceCorrection = null;
    state.voiceUnconfirmed = [];
    state.voiceCurrentText = "";
  }
}

function persistVoiceDraft() {
  if (!state.activeJob) return;
  try {
    sessionStorage.setItem(voiceDraftKey(state.activeJob.id), JSON.stringify({
      transcript: state.voiceTranscript,
      pendingText: state.voicePendingText,
      pendingCorrection: state.pendingVoiceCorrection,
      unconfirmedSegments: state.voiceUnconfirmed,
      currentText: state.voiceCurrentText,
      reviewVersion: 1,
      reviewOpen: state.voiceReviewOpen,
      reviewText: state.voiceReviewText,
      reviewProcessed: state.voiceReviewProcessed,
      voiceSaveProgress: state.voiceSaveProgress,
      voiceSaveProgressText: state.voiceSaveProgressText,
      voiceBatch: state.voiceBatch,
      context: state.voiceContext,
      section: state.section,
      material: state.material,
      manualDraft: state.manualDraft,
      elapsedMs: recordingElapsed(),
      runId: state.voiceRunId
    }));
  } catch {}
}

function renderEntries() {
  if (!state.entries.length) return `<p class="empty">No measurements recorded yet.</p>`;
  return state.entries.map(entry => {
    const parsed = entry.parsed || {};
    const quantity = parsed.manualQuantity ?? parsed.quantity ?? parsed.squareFeet ?? parsed.area ?? parsed.blownInsulation;
    const unit = parsed.manualQuantity != null ? parsed.manualUnit || "units" : parsed.unit || "sq ft";
    const calculated = entry.status === "calculated";
    const id = escapeHtml(entry.id);
    return `<article class="entry">
      <div class="entry-head"><strong>${escapeHtml(entry.section || "Unassigned")}${parsed.material ? ` · ${escapeHtml(parsed.material)}` : ""}</strong><span class="pill ${calculated ? "good" : "review"}">${calculated ? "Added" : "Needs attention"}</span></div>
      <p>${escapeHtml(entry.rawTranscript || entry.message || "")}</p>
      ${renderInterpretedFields(parsed)}
      ${quantity != null ? `<p class="quantity">${parsed.manualQuantity != null ? "Form quantity (manual): " : ""}${escapeHtml(quantity)} ${escapeHtml(unit)}</p>` : ""}
      ${parsed.sprinklerInsulation != null ? `<small>Sprinkler insulation: ${escapeHtml(parsed.sprinklerInsulation)} sq ft · Blown: ${escapeHtml(parsed.blownInsulation)} sq ft</small>` : ""}
      ${!calculated && entry.message ? `<small class="entry-message">${escapeHtml(entry.message)}</small>` : ""}
      <label>Original form material row
        <select data-form-material="${id}">
          <option value="">Choose the exact printed material…</option>
          ${formRowChoices(entry).map(row => `<option value="${escapeHtml(row.id)}"${resolveFormRow(entry)?.id === row.id ? " selected" : ""}>${escapeHtml(`${row.section} · ${row.material}`)}</option>`).join("")}
        </select>
      </label>
      ${parsed.sprinklerInsulation > 0 ? `<label>Sprinkler material on original form
        <select data-sprinkler-form-material="${id}">
          <option value="">Choose R-38 or R-49…</option>
          ${["R-38", "R-49"].map(material => `<option${parsed.sprinklerFormMaterial === material ? " selected" : ""}>${material}</option>`).join("")}
        </select>
      </label>` : ""}
      <details class="entry-form-override">
        <summary>Adjust quantity for form (optional)</summary>
        <label>Quantity
          <input data-form-quantity="${id}" type="number" min="0" step="any" inputmode="decimal" value="${parsed.manualQuantity == null ? "" : escapeHtml(parsed.manualQuantity)}" placeholder="Leave blank to use the existing result">
        </label>
        <label>Unit
          <input data-form-unit="${id}" maxlength="16" value="${escapeHtml(parsed.manualUnit || parsed.unit || "sq ft")}" placeholder="sq ft, pieces, linear ft">
        </label>
        <button type="button" data-save-form-quantity="${id}">Save form quantity</button>
        <small>Uses the value you enter. The app does not apply a formula.</small>
      </details>
      <div class="entry-actions"><button data-edit="${id}">Edit</button><button data-delete="${id}" class="danger-outline">Delete</button></div>
    </article>`;
  }).join("");
}

function renderInterpretedFields(parsed) {
  const fields = [];
  if (parsed.bays != null) fields.push(`${parsed.bays} bays`);
  if (parsed.framing) fields.push(parsed.framing);
  if (parsed.height != null) fields.push(`${parsed.height} ft`);
  if (parsed.spacing != null) fields.push(`${parsed.spacing} in. on center`);
  if (Array.isArray(parsed.dimensionPairs)) {
    fields.push(...parsed.dimensionPairs.map((pair, index) => `${pair[0]} × ${pair[1]} ft${parsed.slopeFactors?.[index] != null ? ` × ${parsed.slopeFactors[index]} factor` : ""}`));
  }
  if (Array.isArray(parsed.measurements)) fields.push(`Measurements: ${parsed.measurements.join(", ")}`);
  if (parsed.area != null) fields.push(`Area ${parsed.area} sq ft`);
  if (parsed.blownInsulation != null) fields.push(`Blown ${parsed.blownInsulation} sq ft`);
  if (parsed.sprinklerInsulation != null) fields.push(`Sprinkler ${parsed.sprinklerInsulation} sq ft`);
  if (parsed.quantity != null) fields.push(`${parsed.quantity} ${parsed.unit || ""}`.trim());
  return fields.length
    ? `<p class="entry-interpreted"><span>Interpreted:</span> ${escapeHtml(fields.join(" · "))}</p>`
    : "";
}

async function finishTakeoff() {
  if (!state.activeJob) return setMessage("Open a saved job before finishing its takeoff.", "error");
  if (state.voiceRecording || state.voicePaused || state.voiceStarting || state.voiceBusy || state.busy) {
    return setMessage("Stop and review the current recording before finishing the takeoff.", "info");
  }
  if (state.voiceReviewOpen && !state.voiceReviewProcessed && state.voiceReviewText.trim()) {
    return setMessage("Process or discard the reviewed transcript before finishing the takeoff.", "info");
  }
  if (!state.entries.length) return setMessage("Add at least one measurement before finishing the takeoff.", "info");
  if (state.takeoffPdfBusy) return;
  const job = state.activeJob;
  const entries = [...state.entries];
  const buttonNode = document.querySelector("#finishTakeoff");
  const printButton = document.querySelector("#printJob");
  const output = document.querySelector("#takeoffPdfOutput");
  const status = document.querySelector("#takeoffPdfStatus");
  const openLink = document.querySelector("#openTakeoffPdf");
  const downloadLink = document.querySelector("#downloadTakeoffPdf");
  if (state.takeoffPdfUrl) URL.revokeObjectURL(state.takeoffPdfUrl);
  state.takeoffPdfUrl = null;
  output.hidden = true;
  state.takeoffPdfBusy = true;
  if (buttonNode) buttonNode.disabled = true;
  if (printButton) printButton.disabled = true;
  if (status) status.textContent = "Preparing the original takeoff form…";
  try {
    const response = await fetch("/takeoff-form.pdf", { cache: "no-store" });
    if (!response.ok) throw new Error("The original takeoff form could not be loaded.");
    const templateBytes = await response.arrayBuffer();
    const pdfBytes = await createCompletedTakeoffPdf(templateBytes, {
      job,
      entries,
      date: new Date()
    });
    if (state.activeJob?.id !== job.id) throw new Error("The active job changed while the form was being prepared. Reopen it and try again.");
    if (state.takeoffPdfUrl) URL.revokeObjectURL(state.takeoffPdfUrl);
    state.takeoffPdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
    const filename = `${safeFilename(job.name)}-takeoff.pdf`;
    openLink.href = state.takeoffPdfUrl;
    downloadLink.href = state.takeoffPdfUrl;
    downloadLink.download = filename;
    output.hidden = false;
    status.textContent = "Completed original form is ready. Open it to print or save it to Files.";
    setMessage("Takeoff finished. The original two-page form is ready to open or download.", "success");
  } catch (error) {
    setMessage(error.message || "Could not create the completed takeoff form.", "error");
  } finally {
    state.takeoffPdfBusy = false;
    if (buttonNode) buttonNode.disabled = false;
    if (printButton) printButton.disabled = false;
  }
}

async function saveMeasurement(parsed, onSaved) {
  const result = await api.createMeasurement(state.activeJob.id, parsed);
  state.entries.push(result.measurement);
  onSaved?.();
  renderJob();
}

function currentSectionContext() {
  return normalizeSectionContext(state.section)
    || normalizeSectionContext(document.querySelector("#sectionSelect")?.value);
}

async function saveManual() {
  if (state.voiceRecording || state.voicePaused || state.voiceStarting || state.voiceBusy || state.busy) return;
  const text = document.querySelector("#manualText")?.value.trim();
  if (!text) return setMessage("Enter text before saving.", "error");
  const reviewedVoiceText = pendingVoiceText();
  const pendingVoiceWasIncluded = Boolean(state.voicePendingText && text.includes(state.voicePendingText));
  const detected = detectSection(text);
  if (detected) state.section = detected;
  const parsed = parseTranscript(text, currentSectionContext(), state.material);
  if (!parsed.section) return setMessage(parsed.message, "info");
  if (parsed.section) state.section = parsed.section;
  if (parsed.parsed?.material) state.material = parsed.parsed.material;
  const previousPendingText = state.voicePendingText;
  const previousUnconfirmed = state.voiceUnconfirmed;
  const previousCurrentText = state.voiceCurrentText;
  if (pendingVoiceWasIncluded) state.voicePendingText = "";
  if (reviewedVoiceText && text.includes(reviewedVoiceText)) {
    state.voiceUnconfirmed = [];
    state.voiceCurrentText = "";
  }
  persistVoiceDraft();
  try {
    await saveMeasurement(parsed, () => { state.manualDraft = ""; persistVoiceDraft(); });
    setMessage(parsed.message);
  } catch (error) {
    state.voicePendingText = previousPendingText;
    state.voiceUnconfirmed = previousUnconfirmed;
    state.voiceCurrentText = previousCurrentText;
    persistVoiceDraft();
    setMessage(error.message, "error");
  }
}

async function editEntry(id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;
  const corrected = window.prompt("Correct the spoken text. The entry will be recalculated.", entry.parsed?.interpretedTranscript || entry.rawTranscript || "");
  if (corrected === null) return;
  const parsed = parseTranscript(corrected, normalizeSectionContext(entry.section) || currentSectionContext(), entry.parsed?.material || state.material);
  if (!parsed.section) return setMessage(parsed.message, "info");
  if (entry.parsed?.formMaterialId && formRowChoices(parsed).some(row => row.id === entry.parsed.formMaterialId)) {
    parsed.parsed.formMaterialId = entry.parsed.formMaterialId;
  }
  if (entry.parsed?.originalVoiceTranscript) {
    Object.assign(parsed.parsed, {
      originalVoiceTranscript: entry.parsed.originalVoiceTranscript,
      reviewedTranscript: entry.parsed.reviewedTranscript,
      voiceJobNumber: entry.parsed.voiceJobNumber,
      voiceArea: entry.parsed.voiceArea || null,
      interpretedTranscript: corrected,
      correctionHistory: [...(entry.parsed.correctionHistory || []), {
        utterance: "Edited after confirmation", targetId: id,
        previousText: entry.parsed.interpretedTranscript || entry.rawTranscript, finalText: corrected
      }]
    });
  }
  if (parsed.parsed.sprinklerInsulation > 0 && entry.parsed?.sprinklerFormMaterial) {
    parsed.parsed.sprinklerFormMaterial = entry.parsed.sprinklerFormMaterial;
  }
  try {
    const result = await api.updateMeasurement(id, parsed);
    state.entries = state.entries.map(item => item.id === id ? result.measurement : item);
    syncSavedBatchEntry(result.measurement, corrected);
    renderJob();
    setMessage("Entry corrected. Review the recalculated result.");
  } catch (error) { setMessage(error.message, "error"); }
}

function syncSavedBatchEntry(measurement, text) {
  const item = state.voiceBatch?.items.find(item => item.savedMeasurementId === measurement.id);
  if (!item) return;
  item.result = measurement;
  if (text != null) item.text = text;
  state.voiceReviewProcessed = state.voiceBatch.items.every(item =>
    item.saved && item.result.status === "calculated" && !item.result.requiresReview) &&
    state.voiceBatch.issues.every(issue => issue.resolved);
  persistVoiceDraft();
}

async function deleteEntry(id) {
  if (!window.confirm("Delete this measurement entry?")) return;
  try {
    await api.deleteMeasurement(id);
    state.entries = state.entries.filter(item => item.id !== id);
    renderJob();
    setMessage("Measurement deleted.");
  } catch (error) { setMessage(error.message, "error"); }
}

async function saveFormQuantity(id) {
  if (state.busy || state.voiceBusy || state.voiceRecording || state.voicePaused) {
    return setMessage("Stop the current recording before editing form quantities.", "info");
  }
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;
  const quantityText = document.querySelector(`[data-form-quantity="${id}"]`)?.value.trim() || "";
  const unitText = document.querySelector(`[data-form-unit="${id}"]`)?.value.trim() || "";
  const parsed = { ...(entry.parsed || {}) };
  if (!quantityText) {
    delete parsed.manualQuantity;
    delete parsed.manualUnit;
  } else {
    const quantity = Number(quantityText);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return setMessage("Enter a non-negative quantity, or leave it blank to use the existing result.", "error");
    }
    if (!unitText || unitText.length > 16) return setMessage("Enter a unit of 16 characters or fewer.", "error");
    parsed.manualQuantity = quantity;
    parsed.manualUnit = unitText;
  }
  try {
    const result = await api.updateMeasurement(id, { parsed });
    state.entries = state.entries.map(item => item.id === id ? result.measurement : item);
    renderJob();
    setMessage(quantityText ? "Manual form quantity saved; no formula was applied." : "Manual form quantity cleared.");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function saveFormMaterial(id, materialId, sprinkler = false) {
  if (state.busy || state.voiceBusy || state.voiceRecording || state.voicePaused) return;
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;
  if (materialId && !(sprinkler ? ["R-38", "R-49"].includes(materialId) : formRowChoices(entry).some(row => row.id === materialId))) return setMessage("Choose a row from the original form for this section.", "error");
  const parsed = { ...entry.parsed };
  const key = sprinkler ? "sprinklerFormMaterial" : "formMaterialId";
  if (materialId) parsed[key] = materialId;
  else delete parsed[key];
  try {
    const result = await api.updateMeasurement(id, { parsed });
    state.entries = state.entries.map(item => item.id === id ? result.measurement : item);
    renderJob();
    setMessage("Original form material selection saved. Calculated quantity is unchanged.");
  } catch (error) { setMessage(error.message, "error"); }
}

async function shareJob() {
  const email = document.querySelector("#shareEmail").value.trim();
  const permission = document.querySelector("#sharePermission").value;
  if (!email) return setMessage("Enter the registered team member's email.", "error");
  try {
    await api.shareJob(state.activeJob.id, { email, permission });
    document.querySelector("#shareEmail").value = "";
    setMessage(`Job shared with ${email}.`);
  } catch (error) { setMessage(error.message, "error"); }
}

async function toggleComplete() {
  const status = state.activeJob.status === "Completed" ? "In progress" : "Completed";
  try {
    const result = await api.updateJob(state.activeJob.id, { status });
    state.activeJob = result.job;
    state.jobs = state.jobs.map(job => job.id === result.job.id ? result.job : job);
    renderJob();
  } catch (error) { setMessage(error.message, "error"); }
}

function exportCsv() {
  const rows = [["Section", "Transcript", "Status", "Parsed data", "Message"]];
  for (const entry of state.entries) {
    rows.push([entry.section, entry.rawTranscript, entry.status, JSON.stringify(entry.parsed || {}), entry.message]);
  }
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download(`${safeFilename(state.activeJob.name)}-takeoff.csv`, "text/csv;charset=utf-8", csv);
}

function safeFilename(value) {
  return String(value || "takeoff").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "takeoff";
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function updateModelStatus(event) {
  const node = document.querySelector("#voiceStatus");
  if (node) node.textContent = event.message || "Preparing the on-device model.";
  const progress = document.querySelector("#modelProgress");
  if (progress) progress.hidden = event.isPreparing !== true;
}

function recordingElapsed() {
  return state.voiceElapsedMs + (state.voiceTickStartedAt == null ? 0 : Date.now() - state.voiceTickStartedAt);
}

function freezeRecordingClock() {
  state.voiceElapsedMs = recordingElapsed();
  state.voiceTickStartedAt = null;
  clearInterval(recordingTimer);
  recordingTimer = null;
}

function beginRecordingClock() {
  if (state.voiceTickStartedAt == null) state.voiceTickStartedAt = Date.now();
  if (!recordingTimer) recordingTimer = setInterval(() => {
    const node = document.querySelector("#recordElapsed");
    if (node) node.textContent = formatRecordingElapsed(recordingElapsed());
  }, 250);
}

async function openVoiceReview() {
  freezeRecordingClock();
  state.voiceReviewOpen = true;
  state.voiceReviewText = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId);
  state.pendingVoiceCorrection = null;
  state.voiceBatch = parseVoiceBatch(state.voiceReviewText, state.voiceContext?.section || currentSectionContext(), state.voiceContext?.material || state.material);
  await interpretVoiceReview();
  persistVoiceDraft();
}

async function interpretVoiceReview(explicitRetry = false) {
  const text = state.voiceReviewText;
  const context = state.voiceContext;
  if (!text.trim() || !context || context.jobId !== state.activeJob?.id) return;
  const prior = state.voiceBatch;
  const attempts = prior?.interpretationAttempts || 0;
  if (attempts && !explicitRetry) return;
  if (attempts >= 2) return setMessage("Interpretation retry limit reached. Your transcript is preserved; use Manual Entry for further corrections.", "info");
  state.voiceBusy = true;
  // Persist the attempt BEFORE the network call: reloads must not trigger spending.
  prior.interpretationAttempts = attempts + 1;
  prior.validationBlocked = true;
  prior.interpretationError = "Interpreting the complete recording…";
  persistVoiceDraft();
  updateRecordingControls();
  try {
    const response = await api.interpretTranscript(context.jobId, text, context.section);
    if (context.jobId !== state.activeJob?.id || text !== state.voiceReviewText) return;
    prior.usage = response.usage;
    if (response.error) {
      prior.usage = response.usage;
      throw new Error(response.error);
    }
    const batch = interpretedVoiceBatch(text, response.interpretation, context.material || state.material, response.usage);
    batch.interpretationAttempts = attempts + 1;
    state.voiceBatch = batch;
  } catch (error) {
    prior.interpretationError = error.message || "Interpretation failed validation.";
    // Legacy parser remains a clearly labeled, UNSAVABLE comparison on failure.
    prior.validationBlocked = true;
    state.voiceBatch = prior;
  } finally {
    state.voiceBusy = false;
    persistVoiceDraft();
    renderBatchReview();
    updateRecordingControls();
  }
}

function handleRecordingError(error) {
  state.voiceRecording = false;
  state.voicePaused = false;
  state.voiceStarting = false;
  state.voiceBusy = false;
  freezeRecordingClock();
  state.voiceQueue = state.voiceQueue.then(() => {
    state.voiceRecording = false;
    if (state.voiceContext?.jobId === state.activeJob?.id) {
      state.voicePaused = true;
      persistVoiceDraft();
      renderJob();
    }
    setMessage(`On-device recording interrupted: ${error.message} Your words are kept. Resume dictating or tap Stop to finish.`, "error");
  });
}

function queueVoiceUpdate(event) {
  state.voiceQueue = state.voiceQueue
    .then(() => handleVoiceUpdate(event))
    .catch(error => setMessage(error.message, "error"));
}

async function handleVoiceUpdate(event = {}) {
  if (!state.voiceContext || state.voiceContext.jobId !== state.activeJob?.id) return;
  const unexpectedStop = state.voiceRecording && event.isRecording === false && !state.voiceBusy;
  state.voiceRecording = Boolean(event.isRecording);
  if (state.voiceRecording) {
    state.voiceStarting = false;
    beginRecordingClock();
  } else {
    freezeRecordingClock();
  }
  const runId = event.streamId || state.voiceRunId || "";
  state.voiceRunId = runId;
  state.voiceCurrentText = String(event.currentText || "");
  state.voiceUnconfirmed = replaceRunUnconfirmedSegments(
    state.voiceUnconfirmed,
    Array.isArray(event.unconfirmedSegments) ? event.unconfirmedSegments : [],
    runId
  );

  const liveNode = document.querySelector("#voiceLiveText");
  if (liveNode) liveNode.textContent = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, runId) || "Waiting for speech…";

  const incoming = (Array.isArray(event.confirmedSegments) ? event.confirmedSegments : [])
    .map(segment => ({ ...segment, runId: event.streamId || state.voiceRunId }));
  const previousLength = state.voiceSegments.length;
  state.voiceSegments = appendConfirmedSegments(state.voiceSegments, incoming);
  const newlyConfirmed = state.voiceSegments.slice(previousLength);
  state.voiceUnconfirmed = removeConfirmedInterim(state.voiceUnconfirmed, state.voiceSegments, runId);

  for (const segment of newlyConfirmed) {
    const transcript = String(segment.text || "").trim();
    if (!transcript) continue;
    state.voiceTranscript = [state.voiceTranscript, transcript].filter(Boolean).join(" ");
    persistVoiceDraft();

    // Capture only. Parsing/persistence happen after Stop and explicit review.
  }

  if (liveNode) liveNode.textContent = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, runId) || "Waiting for speech…";
  persistVoiceDraft();
  if (unexpectedStop) {
    state.voicePaused = true;
    persistVoiceDraft();
    renderJob();
    setMessage("Recording interrupted. Your dictation is kept. Tap Resume to continue or Stop to finish.", "info");
  }
  updateRecordingControls();
}

async function startVoiceTranscription() {
  const native = isWhisperKitAvailable();
  const browserAvailable = !isNativePlatform() && state.browserTranscriptionAvailable && browserRecorder.isAvailable();
  if (!native && !browserAvailable) {
    const message = isNativePlatform()
      ? NATIVE_VOICE_REQUIRED
      : browserRecorder.isAvailable()
        ? "OpenAI transcription is not configured on this Worker. Use Manual Entry until the API credential is set."
        : "This browser cannot record audio. Try a current browser or use Manual Entry.";
    setMessage(message, "info");
    document.querySelector("#nativeVoiceNotice")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (state.voiceBusy || state.voiceRecording || state.voiceStarting || state.busy) return;
  if (!state.activeJob) return;
  if (state.browserAudioBlob) return setMessage("Retry or discard the saved recording before starting another one.", "info");
  if (state.voicePaused && !native) {
    try {
      browserRecorder.resume();
      state.voicePaused = false;
      state.voiceRecording = true;
      beginRecordingClock();
      updateRecordingControls();
      setMessage("Recording resumed. Audio will be sent to OpenAI after Stop.");
    } catch (error) { setMessage(error.message, "error"); }
    return;
  }
  if (!state.voicePaused && state.voiceReviewOpen && !state.voiceReviewProcessed && state.voiceReviewText.trim()) {
    revealJobPanel("#voiceReviewPanel", "#voiceReviewText");
    return setMessage("Process or explicitly discard this transcript before starting another recording.", "info");
  }

  if (state.voicePaused) {
    // The next native run starts at timestamp zero. Preserve the paused run's
    // unfinished words in chronological order before collecting the next run.
    state.voiceTranscript = appendPendingVoiceText(state.voiceTranscript, pendingVoiceText());
    state.voiceUnconfirmed = [];
    state.voiceCurrentText = "";
  } else {
    state.voiceSegments = [];
    state.voiceUnconfirmed = [];
    state.voiceTranscript = "";
    state.voiceCurrentText = "";
    state.voiceRunId = null;
    state.voiceReviewText = "";
    state.voiceReviewOpen = false;
    state.voiceReviewProcessed = false;
    state.voiceSaveProgress = 0;
    state.voiceSaveProgressText = "";
    state.voiceBatch = null;
    state.voiceElapsedMs = 0;
    state.browserAudioBlob = null;
    state.voiceContext = { jobId: state.activeJob.id, section: currentSectionContext(), material: state.material };
  }
  state.voiceStarting = true;
  state.voiceBusy = true;
  updateRecordingControls();
  try {
    if (native && !nativeRecorder.prepared) {
      const status = document.querySelector("#voiceStatus");
      const progress = document.querySelector("#modelProgress");
      if (status) status.textContent = "Downloading or loading the selected large model on this iPhone…";
      if (progress) progress.hidden = false;
    }
    if (!native) {
      const session = await browserRecorder.start();
      state.voiceRunId = session.streamId;
      state.voiceRecording = true;
      state.voiceStarting = false;
      state.voicePaused = false;
      beginRecordingClock();
      setMessage("Recording in this browser. Audio is sent to OpenAI after Stop.");
      return;
    }
    const session = await nativeRecorder.start();
    state.voiceRunId = session.streamId;
    state.voiceReady = nativeRecorder.prepared;
    state.voicePaused = false;
    // Wait for the native isRecording event; a start promise alone is not proof.
    setMessage(state.voiceRecording ? "Listening on this iPhone. Audio stays on the device." : "Starting the iPhone microphone…");
  } catch (error) {
    state.voiceRecording = false;
    state.voiceStarting = false;
    const progress = document.querySelector("#modelProgress");
    if (progress) progress.hidden = true;
    setMessage(error.message, "error");
  } finally {
    state.voiceBusy = false;
    updateRecordingControls();
  }
}

async function pauseVoiceTranscription() {
  if (!state.voiceRecording) return;
  if (!isWhisperKitAvailable()) {
    try {
      browserRecorder.pause();
      state.voiceRecording = false;
      state.voicePaused = true;
      freezeRecordingClock();
      setMessage("Recording paused. Resume to continue, or stop to transcribe.");
    } catch (error) { setMessage(error.message, "error"); }
    updateRecordingControls();
    return;
  }
  state.voiceBusy = true;
  updateRecordingControls();
  try {
    const result = await nativeRecorder.pause();
    await state.voiceQueue;
    await handleVoiceUpdate(result);
    preserveUnconfirmedTail(result);
    state.voiceRecording = false;
    state.voicePaused = true;
    freezeRecordingClock();
    persistVoiceDraft();
    renderJob();
    setMessage("Recording paused. Resume to continue, or stop to review. No measurements have been added.");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    state.voiceBusy = false;
    updateRecordingControls();
  }
}

async function finishVoiceTranscription() {
  if (state.voiceBusy) return;
  if (!state.voiceRecording && !state.voicePaused) return;
  if (!isWhisperKitAvailable()) {
    state.voiceBusy = true;
    updateRecordingControls();
    try {
      state.browserAudioBlob = await browserRecorder.stop();
      state.voiceRecording = false;
      state.voicePaused = false;
      freezeRecordingClock();
      state.voiceBusy = false;
      await transcribeBrowserRecording();
    } catch (error) {
      state.voiceRecording = false;
      state.voicePaused = false;
      freezeRecordingClock();
      setMessage(error.message, "error");
    } finally {
      state.voiceBusy = false;
      updateRecordingControls();
    }
    return;
  }
  state.voiceBusy = true;
  updateRecordingControls();
  try {
    const result = await nativeRecorder.stop();
    await state.voiceQueue;
    await handleVoiceUpdate(result);
    preserveUnconfirmedTail(result);
    state.voiceRecording = false;
    state.voicePaused = false;
    state.voiceStarting = false;
    await openVoiceReview();
    renderJob();
    revealJobPanel("#voiceReviewPanel", "#voiceReviewText");
    setMessage("Recording stopped. Review or edit the transcript, then tap Process measurements.");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    state.voiceBusy = false;
    updateRecordingControls();
  }
}

async function stopVoiceTranscription() {
  if (!isWhisperKitAvailable()) {
    if (!state.voiceRecording && !state.voicePaused) return;
    try {
      state.browserAudioBlob = await browserRecorder.stop();
      state.voiceRecording = false;
      state.voicePaused = false;
      freezeRecordingClock();
      await transcribeBrowserRecording();
    } catch (error) { setMessage(error.message, "error"); }
    return;
  }
  if (!state.voiceRecording && !state.voicePaused) return;
  try {
    const result = await nativeRecorder.stop();
    await state.voiceQueue;
    await handleVoiceUpdate(result);
    preserveUnconfirmedTail(result);
  } catch (error) {
    setMessage(error.message, "error");
  }
  state.voiceRecording = false;
  state.voicePaused = false;
  state.voiceStarting = false;
  await openVoiceReview();
}

async function transcribeBrowserRecording() {
  if (!state.browserAudioBlob || !state.activeJob) return;
  const context = state.voiceContext;
  if (!context || context.jobId !== state.activeJob.id) {
    return setMessage("This recording belongs to a different job. Reopen its saved job to transcribe it.", "error");
  }
  state.voiceBusy = true;
  updateRecordingControls();
  const status = document.querySelector("#voiceStatus");
  if (status) status.textContent = "Sending audio to OpenAI for transcription. The app does not save the audio.";
  try {
    const result = await api.transcribeAudio(context.jobId, state.browserAudioBlob);
    const transcript = String(result.transcript || "").trim();
    if (!transcript) throw new Error("OpenAI returned an empty transcript.");
    state.voiceTranscript = transcript;
    state.voiceUnconfirmed = [];
    state.voiceCurrentText = "";
    state.voiceReviewProcessed = false;
    state.browserAudioBlob = null;
    await openVoiceReview();
    renderJob();
    revealJobPanel("#voiceReviewPanel", "#voiceReviewText");
    setMessage("Transcription ready. Review or edit the text, then process measurements.");
  } catch (error) {
    setMessage(`${error.message} The audio remains in memory; retry or discard it.`, "error");
  } finally {
    state.voiceBusy = false;
    updateRecordingControls();
  }
}

function discardBrowserAudio() {
  state.browserAudioBlob = null;
  browserRecorder.discard();
  setMessage("Untranscribed audio discarded.");
  updateRecordingControls();
}

async function processVoiceReview() {
  if (state.voiceRecording || state.voicePaused || state.voiceBusy || state.voiceStarting || state.busy || state.voiceReviewProcessed) return;
  const text = document.querySelector("#voiceReviewText")?.value.trim() || "";
  if (!text) return setMessage("There is no recognized text yet. Record again or use Manual Entry.", "info");
  const context = state.voiceContext;
  if (!context || context.jobId !== state.activeJob?.id) {
    return setMessage("This transcript belongs to a different job. Reopen its saved job to process it.", "error");
  }
  if (state.voiceBatch?.items.some(item => item.saved) && state.voiceBatch.sourceText !== text) {
    return setMessage("Some measurements are already saved. Resolve the remaining draft items below, or discard the draft to start another recording.", "info");
  }
  state.voiceReviewText = text;
  state.pendingVoiceCorrection = null;
  if (!state.voiceBatch || state.voiceBatch.sourceText !== text) {
    const attempts = state.voiceBatch?.interpretationAttempts || 0;
    if (attempts >= 2) return setMessage("Interpretation retry limit reached. Use the editable measurement rows or Manual Entry; no further API request was made.", "info");
    state.voiceBatch = parseVoiceBatch(text, context.section || currentSectionContext(), context.material || state.material);
    state.voiceBatch.interpretationAttempts = attempts;
    await interpretVoiceReview(attempts > 0);
  } else if (state.voiceBatch.validationBlocked) {
    await interpretVoiceReview(true);
  }
  persistVoiceDraft();
  renderBatchReview();
  updateRecordingControls();
  setMessage("Review every measurement below. Nothing is saved until you tap Confirm & save measurements.");
}

function renderBatchReview() {
  const container = document.querySelector("#voiceBatchReview");
  if (!container) return;
  container.innerHTML = renderVoiceBatchReview(state.voiceBatch);
  document.querySelectorAll("[data-batch-edit]").forEach(node => node.addEventListener("change", () => editBatchItem(node.dataset.batchEdit, { text: node.value })));
  document.querySelectorAll("[data-batch-section]").forEach(node => node.addEventListener("change", () => editBatchItem(node.dataset.batchSection, { section: node.value, replaceSection: true })));
  document.querySelectorAll("[data-batch-resolve]").forEach(node => node.addEventListener("click", () => resolveBatchIssue(node.dataset.batchResolve)));
  document.querySelectorAll("[data-batch-ignore]").forEach(node => node.addEventListener("click", () => resolveBatchIssue(node.dataset.batchIgnore, true)));
}

function editBatchItem(id, changes) {
  if (state.busy || state.voiceReviewProcessed) return;
  const item = state.voiceBatch?.items.find(item => item.id === id);
  if (!item || item.saved) return;
  const previousText = item.text;
  // A manually selected section must not be overridden by the old spoken label.
  if (changes.replaceSection) {
    changeBatchSection(item, changes.section);
  } else {
    item.text = changes.text.trim();
    recalculateBatchItem(item);
  }
  item.corrections.push({ utterance: "Edited during review", previousText, finalText: item.text });
  persistVoiceDraft();
  renderBatchReview();
  updateRecordingControls();
}

function resolveBatchIssue(id, keepOriginal = false) {
  if (state.busy) return;
  const issue = state.voiceBatch?.issues.find(issue => issue.id === id && !issue.resolved);
  if (!issue) return;
  if (keepOriginal) {
    if (!window.confirm("Ignore only this correction and keep its original measurement?")) return;
    issue.resolved = true;
    issue.resolution = "Kept original measurement";
  } else {
    const targetId = document.querySelector(`#batchTarget-${id}`)?.value;
    const item = state.voiceBatch.items.find(item => item.id === targetId && !item.saved && (!issue.section || item.section === issue.section));
    const text = document.querySelector(`#batchFinal-${id}`)?.value.trim();
    if (!item || !text) return setMessage("Choose a draft measurement and enter its complete final text.", "info");
    const result = parseTranscript(text, item.section, item.material);
    if (result.section !== item.section || result.status !== "calculated" || result.requiresReview) {
      return setMessage("Enter one complete final measurement in the selected item's section.", "info");
    }
    const previousText = item.text;
    item.text = text;
    recalculateBatchItem(item);
    item.corrections.push({ utterance: issue.text, previousText, finalText: text });
    issue.resolved = true;
    issue.targetId = item.id;
  }
  state.voiceReviewProcessed = state.voiceBatch.items.length > 0 &&
    state.voiceBatch.items.every(item => item.saved) && state.voiceBatch.issues.every(issue => issue.resolved);
  persistVoiceDraft();
  renderBatchReview();
  updateRecordingControls();
}

async function confirmVoiceBatch() {
  if (state.voiceRecording || state.voicePaused || state.voiceBusy || state.voiceStarting || state.busy || state.voiceReviewProcessed) return;
  if (state.voiceContext?.jobId !== state.activeJob?.id) return setMessage("This transcript belongs to a different job.", "error");
  const batch = state.voiceBatch;
  if (!batch || batch.sourceText !== state.voiceReviewText) return setMessage("Review measurements before confirming.", "info");
  const ready = batchReadyItems(batch);
  if (!ready.length) return setMessage("Resolve or edit the remaining draft measurements before saving them.", "info");
  const originalVoiceTranscript = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId) || batch.sourceText;
  state.busy = true;
  updateRecordingControls();
  try {
    for (const item of ready) {
      const parsed = item.result;
      const result = await api.createMeasurement(state.activeJob.id, {
        ...parsed,
        rawTranscript: item.originalText,
        parsed: {
          ...parsed.parsed, originalVoiceTranscript, reviewedTranscript: batch.sourceText,
          interpretedTranscript: item.text, correctionHistory: item.corrections,
          voiceArea: item.area || null,
          interpretationUsage: batch.usage || null,
          voiceJobNumber: batch.metadata?.jobNumber || null
        }
      });
      state.entries.push(result.measurement);
      item.saved = true;
      item.savedMeasurementId = result.measurement.id;
      state.voiceSaveProgress = batch.items.filter(item => item.saved).length;
      state.section = parsed.section;
      if (parsed.parsed?.material) state.material = parsed.parsed.material;
      persistVoiceDraft();
    }
    state.voiceReviewProcessed = batch.items.every(item => item.saved) && batch.issues.every(issue => issue.resolved);
    persistVoiceDraft();
    renderJob();
    setMessage(`${ready.length} measurement${ready.length === 1 ? "" : "s"} saved.${state.voiceReviewProcessed ? "" : " Remaining draft items and corrections are still here to resolve."}`);
  } catch (error) {
    persistVoiceDraft();
    renderJob();
    setMessage(`${error.message} ${state.voiceSaveProgress} of ${batch.items.length} area entries were saved. The transcript is still here; retry when connected to continue.`, "error");
  } finally {
    state.busy = false;
    updateRecordingControls();
  }
}

function discardVoiceReview() {
  if (state.voiceRecording || state.voicePaused || state.voiceBusy || state.busy) return;
  if (!window.confirm("Discard this recording's transcript? Saved measurements will not be deleted.")) return;
  state.voiceReviewText = "";
  state.voiceReviewOpen = false;
  state.voiceReviewProcessed = false;
  state.voiceSaveProgress = 0;
  state.voiceSaveProgressText = "";
  state.voiceBatch = null;
  state.voiceTranscript = "";
  state.browserAudioBlob = null;
  browserRecorder.discard();
  state.voiceUnconfirmed = [];
  state.voiceCurrentText = "";
  state.voiceSegments = [];
  state.pendingVoiceCorrection = null;
  state.voiceElapsedMs = 0;
  persistVoiceDraft();
  renderJob();
}

function preserveUnconfirmedTail(event = {}) {
  const text = String(event.currentText || "").trim();
  if (!text || text === "Waiting for speech...") return;
  const runId = event.streamId || state.voiceRunId || "";
  state.voiceUnconfirmed = pendingVoiceSegments(
    state.voiceUnconfirmed,
    text,
    runId
  );
  state.voiceCurrentText = "";
  persistVoiceDraft();
}

async function applyVoiceCorrection(action) {
  if (state.busy || state.voiceBusy || state.voiceRecording || state.voicePaused) return;
  const correction = state.pendingVoiceCorrection;
  const finalText = document.querySelector("#correctionFinalText")?.value.trim();
  if (!correction) return;
  if (!finalText) return setMessage("Enter the final measurement text before applying this correction.", "error");

  const targetId = action === "replace" ? document.querySelector("#correctionTarget")?.value : null;
  const target = targetId ? state.entries.find(entry => entry.id === targetId) : null;
  if (action === "replace" && !target) return setMessage("Choose the earlier entry to replace.", "error");

  const section = target?.section || state.section;
  const material = target?.parsed?.material || state.material;
  const parsed = parseTranscript(finalText, section, material);
  if (!parsed.section || !shouldSaveVoiceResult(parsed)) return setMessage(parsed.message, "info");
  const transcriptHistory = [
    ...(target?.parsed?.transcriptHistory || []),
    {
      previousTranscript: target?.rawTranscript || null,
      correctionUtterance: correction.utterance,
      confirmedFinalText: finalText,
      action,
      recordedAt: new Date().toISOString()
    }
  ];
  const payload = {
    ...parsed,
    parsed: { ...parsed.parsed, transcriptHistory }
  };

  state.busy = true;
  updateRecordingControls();
  try {
    let successMessage;
    if (action === "replace") {
      const result = await api.updateMeasurement(target.id, payload);
      state.entries = state.entries.map(entry => entry.id === target.id ? result.measurement : entry);
      successMessage = "Correction applied to the selected entry. The previous transcript is retained in its history.";
    } else {
      const result = await api.createMeasurement(state.activeJob.id, payload);
      state.entries.push(result.measurement);
      successMessage = "Correction saved as a new entry. The spoken correction is retained in its history.";
    }
    if (parsed.section) state.section = parsed.section;
    if (parsed.parsed?.material) state.material = parsed.parsed.material;
    if (correction.fromVoiceReview) state.voiceReviewProcessed = true;
    state.pendingVoiceCorrection = null;
    persistVoiceDraft();
    renderJob();
    setMessage(successMessage);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    state.busy = false;
    updateRecordingControls();
  }
}

function updateRecordingControls() {
  const native = isWhisperKitAvailable();
  const browserAvailable = !isNativePlatform() && state.browserTranscriptionAvailable && browserRecorder.isAvailable();
  const stateNode = document.querySelector("#recordState");
  if (!stateNode) return;
  const waiting = state.voiceBusy || state.voiceStarting || state.busy;
  const active = state.voiceRecording || state.voicePaused || state.voiceStarting;
  stateNode.textContent = state.voiceRecording ? native ? "Listening on this iPhone" : "Recording in browser"
    : state.voicePaused ? "Recording paused"
    : state.voiceBusy && state.browserAudioBlob ? "Transcribing with OpenAI…"
    : waiting ? "Preparing / finishing recording…"
    : !native && !browserAvailable ? "Voice recording unavailable"
    : !native ? "OpenAI transcription ready"
    : state.voiceReviewOpen ? "Recording stopped · review transcript" : "Ready on iPhone";
  stateNode.dataset.state = state.voiceRecording ? "recording" : state.voicePaused ? "paused" : native || browserAvailable ? "ready" : "unavailable";
  document.querySelector("#recordElapsed").textContent = formatRecordingElapsed(recordingElapsed());
  document.querySelector("#start").hidden = state.voiceRecording || state.voicePaused;
  document.querySelector("#start").disabled = waiting || (!native && !browserAvailable) || Boolean(state.browserAudioBlob);
  document.querySelector("#stop").hidden = !state.voiceRecording;
  document.querySelector("#stop").disabled = waiting;
  document.querySelector("#pause").hidden = !state.voiceRecording;
  document.querySelector("#pause").disabled = waiting;
  document.querySelector("#resume").hidden = !state.voicePaused;
  document.querySelector("#resume").disabled = waiting || (!native && !browserAvailable);
  document.querySelector("#finish").hidden = !state.voicePaused;
  document.querySelector("#finish").disabled = waiting || (!native && !browserAvailable);
  document.querySelector("#voiceLiveText").textContent = state.voiceBusy && state.browserAudioBlob
    ? "Transcribing recording with OpenAI…"
    : !native && state.voiceRecording ? "Recording audio. The transcript appears after Stop."
    : recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId) || "No recording yet.";
  document.querySelector("#voiceReviewPanel").hidden = !state.voiceReviewOpen;
  const review = document.querySelector("#voiceReviewText");
  if (document.activeElement !== review) review.value = state.voiceReviewText;
  review.readOnly = active || waiting || state.voiceReviewProcessed || Boolean(state.voiceBatch?.items.some(item => item.saved));
  document.querySelector("#processVoiceReview").disabled = active || waiting || state.voiceReviewProcessed;
  document.querySelector("#processVoiceReview").textContent = state.voiceReviewProcessed ? "Added to job"
    : state.voiceBatch?.validationBlocked ? "Retry interpretation (one retry maximum)"
    : state.voiceBatch ? "Update measurement preview" : "Review measurements";
  const confirmBatch = document.querySelector("#confirmVoiceBatch");
  const readyCount = state.voiceBatch ? batchReadyItems(state.voiceBatch).length : 0;
  confirmBatch.hidden = !state.voiceBatch || state.voiceReviewProcessed;
  confirmBatch.disabled = active || waiting || !readyCount || state.voiceBatch?.sourceText !== state.voiceReviewText;
  confirmBatch.textContent = state.voiceBatch?.validationBlocked ? "Interpretation needs review"
    : state.voiceBatch && !state.voiceBatch.items.length && !state.voiceBatch.issues.some(issue => !issue.resolved)
      ? "No measurements to confirm"
    : state.voiceBatch?.interpreter === "gpt" && !readyCount && !state.voiceReviewProcessed
      ? "Resolve highlighted items to confirm"
      : `Confirm & save ${readyCount} measurement${readyCount === 1 ? "" : "s"}`;
  document.querySelector("#discardVoiceReview").disabled = active || waiting;
  document.querySelector("#retryBrowserTranscription").hidden = !state.browserAudioBlob;
  document.querySelector("#retryBrowserTranscription").disabled = waiting || !state.browserAudioBlob;
  document.querySelector("#discardBrowserAudio").hidden = !state.browserAudioBlob;
  document.querySelector("#discardBrowserAudio").disabled = waiting || !state.browserAudioBlob;
  document.querySelector("#voiceReviewStatus").textContent = state.voiceReviewProcessed
    ? "Measurements saved. You can start a new recording."
    : `Review for ${state.activeJob?.name || "this job"} · ${state.voiceContext?.section || state.section || "choose a section in Settings"}. Nothing is added until you process it.`;
  document.querySelector("#sectionSelect").disabled = active || state.voiceBusy;
  document.querySelector("#saveManual").disabled = active || waiting;
  document.querySelector("#manualText").readOnly = active || waiting;
  document.querySelector("#tileManual").disabled = active || waiting;
  document.querySelector("#tileJobs").disabled = state.voiceBusy || state.voiceStarting || state.busy;
  if (state.voiceReady && !waiting) updateModelStatus({
    message: "Speech model ready. After caching, transcription works offline. Saving to shared jobs needs an internet connection.",
    isPreparing: false
  });
}

window.addEventListener("beforeunload", () => {
  if (state.voiceRecording && isWhisperKitAvailable()) WhisperVoice.stop().catch(() => {});
  if ((state.voiceRecording || state.voicePaused) && !isWhisperKitAvailable()) browserRecorder.discard();
  if (state.takeoffPdfUrl) URL.revokeObjectURL(state.takeoffPdfUrl);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

bootstrap();
