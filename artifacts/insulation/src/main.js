import { api } from "./api.js";
import { parseTranscript, detectSection, normalizeSectionContext } from "./parser.js";
import { appendConfirmedSegments, appendPendingVoiceText, isCorrectionUtterance, pendingVoiceSegments, removeConfirmedInterim, replaceRunUnconfirmedSegments, shouldSaveVoiceResult, recordingTranscript, formatRecordingElapsed } from "./voiceSession.js";
import { isWhisperKitAvailable, WhisperVoice } from "./voiceTranscription.js";
import { createNativeVoiceRecorder, NATIVE_VOICE_REQUIRED } from "./nativeVoiceRecorder.js";
import { renderVoiceTakeoff } from "./voiceTakeoffView.js";

const app = document.querySelector("#app");
const state = {
  user: null, jobs: [], activeJob: null, entries: [], section: null, material: null,
  voiceReady: false, voiceRecording: false, voicePaused: false, voiceBusy: false,
  voiceSegments: [], voiceUnconfirmed: [], voiceRunId: null, voiceCurrentText: "", voiceTranscript: "", voicePendingText: "",
  pendingVoiceCorrection: null, voiceQueue: Promise.resolve(),
  voiceStarting: false, voiceReviewOpen: false, voiceReviewText: "", voiceReviewProcessed: false,
  voiceContext: null, voiceElapsedMs: 0, voiceTickStartedAt: null, manualDraft: "",
  busy: false
};
let recordingTimer = null;
const nativeRecorder = createNativeVoiceRecorder({
  plugin: WhisperVoice,
  isAvailable: isWhisperKitAvailable,
  onUpdate: queueVoiceUpdate,
  onStatus: updateModelStatus,
  onError: handleRecordingError
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
  const nativeVoiceAvailable = isWhisperKitAvailable();
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

      ${renderVoiceTakeoff({ nativeAvailable: nativeVoiceAvailable })}
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
  document.querySelector("#discardVoiceReview").addEventListener("click", discardVoiceReview);
  document.querySelector("#voiceReviewText").addEventListener("input", event => {
    state.voiceReviewText = event.target.value;
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
  document.querySelector("#printJob").addEventListener("click", () => window.print());
  document.querySelectorAll("[data-edit]").forEach(node => node.addEventListener("click", () => editEntry(node.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(node => node.addEventListener("click", () => deleteEntry(node.dataset.delete)));
  document.querySelectorAll("[data-undo]").forEach(node => node.addEventListener("click", () => deleteEntry(node.dataset.undo)));
  updateRecordingControls();
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
    state.pendingVoiceCorrection = saved.pendingCorrection || null;
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
    const interruptedTranscript = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, saved.runId);
    state.voiceReviewOpen = Boolean(saved.reviewOpen || (saved.reviewVersion === 1 && interruptedTranscript && !state.voiceReviewProcessed));
    if (state.voiceReviewOpen && !state.voiceReviewText) state.voiceReviewText = interruptedTranscript;
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
    const quantity = parsed.quantity ?? parsed.squareFeet ?? parsed.area ?? parsed.blownInsulation;
    const unit = parsed.unit || "sq ft";
    const calculated = entry.status === "calculated";
    return `<article class="entry">
      <div class="entry-head"><strong>${escapeHtml(entry.section || "Unassigned")}${parsed.material ? ` · ${escapeHtml(parsed.material)}` : ""}</strong><span class="pill ${calculated ? "good" : "review"}">${calculated ? "Added" : "Needs attention"}</span></div>
      <p>${escapeHtml(entry.rawTranscript || entry.message || "")}</p>
      ${quantity != null ? `<p class="quantity">${escapeHtml(quantity)} ${escapeHtml(unit)}</p>` : ""}
      ${parsed.sprinklerInsulation != null ? `<small>Sprinkler insulation: ${escapeHtml(parsed.sprinklerInsulation)} sq ft · Blown: ${escapeHtml(parsed.blownInsulation)} sq ft</small>` : ""}
      ${!calculated && entry.message ? `<small class="entry-message">${escapeHtml(entry.message)}</small>` : ""}
      <div class="entry-actions"><button data-edit="${escapeHtml(entry.id)}">Edit</button><button data-delete="${escapeHtml(entry.id)}" class="danger-outline">Delete</button></div>
    </article>`;
  }).join("");
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
  const corrected = window.prompt("Correct the spoken text. The entry will be recalculated.", entry.rawTranscript || "");
  if (corrected === null) return;
  const parsed = parseTranscript(corrected, normalizeSectionContext(entry.section) || currentSectionContext(), entry.parsed?.material || state.material);
  if (!parsed.section) return setMessage(parsed.message, "info");
  try {
    const result = await api.updateMeasurement(id, parsed);
    state.entries = state.entries.map(item => item.id === id ? result.measurement : item);
    renderJob();
    setMessage("Entry corrected. Review the recalculated result.");
  } catch (error) { setMessage(error.message, "error"); }
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

function openVoiceReview() {
  freezeRecordingClock();
  state.voiceReviewOpen = true;
  state.voiceReviewText = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId);
  persistVoiceDraft();
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
      openVoiceReview();
      renderJob();
    }
    setMessage(`On-device recording stopped: ${error.message} Any recognized words are kept for review.`, "error");
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
    state.voicePaused = false;
    openVoiceReview();
    renderJob();
    setMessage("The native recording ended. Recognized words are kept here for review.", "info");
  }
  updateRecordingControls();
}

async function startVoiceTranscription() {
  if (!isWhisperKitAvailable()) {
    setMessage(NATIVE_VOICE_REQUIRED, "info");
    const notice = document.querySelector("#nativeVoiceNotice");
    notice?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (state.voiceBusy || state.voiceRecording || state.voiceStarting || state.busy) return;
  if (!state.activeJob) return;
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
    state.voiceElapsedMs = 0;
    state.voiceContext = { jobId: state.activeJob.id, section: currentSectionContext(), material: state.material };
  }
  state.voiceStarting = true;
  state.voiceBusy = true;
  updateRecordingControls();
  try {
    if (!nativeRecorder.prepared) {
      const status = document.querySelector("#voiceStatus");
      const progress = document.querySelector("#modelProgress");
      if (status) status.textContent = "Downloading or loading the selected large model on this iPhone…";
      if (progress) progress.hidden = false;
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
  if (!isWhisperKitAvailable() || !state.voiceRecording) return;
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
  if (!isWhisperKitAvailable() || (!state.voiceRecording && !state.voicePaused)) return;
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
    openVoiceReview();
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
  if (!isWhisperKitAvailable() || (!state.voiceRecording && !state.voicePaused)) return;
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
  openVoiceReview();
}

async function processVoiceReview() {
  if (state.voiceRecording || state.voicePaused || state.voiceBusy || state.voiceStarting || state.busy || state.voiceReviewProcessed) return;
  const text = document.querySelector("#voiceReviewText")?.value.trim() || "";
  if (!text) return setMessage("There is no recognized text yet. Record again or use Manual Entry.", "info");
  state.voiceReviewText = text;
  const context = state.voiceContext;
  if (!context || context.jobId !== state.activeJob?.id) {
    return setMessage("This transcript belongs to a different job. Reopen its saved job to process it.", "error");
  }
  persistVoiceDraft();
  if (isCorrectionUtterance(text)) {
    state.pendingVoiceCorrection = { utterance: text, fromVoiceReview: true };
    renderJob();
    return setMessage("Choose the final measurement and whether this correction replaces an entry or adds a new one.", "info");
  }
  const parsed = parseTranscript(text, context.section || currentSectionContext(), context.material || state.material);
  if (!parsed.section || !shouldSaveVoiceResult(parsed)) return setMessage(parsed.message, "info");
  parsed.parsed.originalVoiceTranscript = recordingTranscript(
    state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId
  );
  state.busy = true;
  updateRecordingControls();
  try {
    await saveMeasurement(parsed, () => {
      state.voiceReviewProcessed = true;
      state.section = parsed.section;
      if (parsed.parsed?.material) state.material = parsed.parsed.material;
      persistVoiceDraft();
    });
    setMessage(parsed.message, parsed.requiresReview ? "info" : "success");
  } catch (error) {
    setMessage(`${error.message} The transcript is still here; retry when connected.`, "error");
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
  state.voiceTranscript = "";
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
  const stateNode = document.querySelector("#recordState");
  if (!stateNode) return;
  const waiting = state.voiceBusy || state.voiceStarting || state.busy;
  const active = state.voiceRecording || state.voicePaused || state.voiceStarting;
  stateNode.textContent = !native ? "Installed iPhone app required"
    : state.voiceRecording ? "Listening on this iPhone"
    : state.voicePaused ? "Recording paused"
    : waiting ? "Preparing / finishing recording…"
    : state.voiceReviewOpen ? "Recording stopped · review transcript" : "Ready on iPhone";
  stateNode.dataset.state = state.voiceRecording ? "recording" : state.voicePaused ? "paused" : native ? "ready" : "unavailable";
  document.querySelector("#recordElapsed").textContent = formatRecordingElapsed(recordingElapsed());
  document.querySelector("#start").hidden = state.voiceRecording || state.voicePaused;
  document.querySelector("#start").disabled = waiting;
  document.querySelector("#stop").hidden = !state.voiceRecording;
  document.querySelector("#stop").disabled = waiting;
  document.querySelector("#pause").hidden = !state.voiceRecording;
  document.querySelector("#pause").disabled = waiting;
  document.querySelector("#resume").hidden = !state.voicePaused;
  document.querySelector("#resume").disabled = waiting || !native;
  document.querySelector("#finish").hidden = !state.voicePaused;
  document.querySelector("#finish").disabled = waiting || !native;
  document.querySelector("#voiceLiveText").textContent = recordingTranscript(state.voiceTranscript, state.voiceUnconfirmed, state.voiceCurrentText, state.voiceRunId) || "No recording yet.";
  document.querySelector("#voiceReviewPanel").hidden = !state.voiceReviewOpen;
  const review = document.querySelector("#voiceReviewText");
  if (document.activeElement !== review) review.value = state.voiceReviewText;
  review.readOnly = active || waiting || state.voiceReviewProcessed;
  document.querySelector("#processVoiceReview").disabled = active || waiting || state.voiceReviewProcessed || Boolean(state.pendingVoiceCorrection);
  document.querySelector("#processVoiceReview").textContent = state.voiceReviewProcessed ? "Added to job" : "Process measurements";
  document.querySelector("#discardVoiceReview").disabled = active || waiting;
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
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

bootstrap();
