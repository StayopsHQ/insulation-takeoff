// Voice takeoff card + four navigation tiles. Pure markup; main.js wires behaviour.
// All strings below are static; no user-provided values are interpolated.

const MIC_ICON = `
  <svg class="vt-oval-icon" viewBox="0 0 160 112" aria-hidden="true" focusable="false">
    <path d="M80 5a13 13 0 0 0-13 13v36a13 13 0 0 0 26 0V18A13 13 0 0 0 80 5Z" fill="currentColor"/>
    <path d="M54 48v7a26 26 0 0 0 52 0v-7M80 82v20M64 102h32" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M34 47v25M22 53v14M10 58v5M126 47v25M138 53v14M150 58v5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  </svg>`;

const STOP_ICON = `
  <svg class="vt-oval-icon vt-oval-icon-sm" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect x="12" y="12" width="24" height="24" rx="4" fill="currentColor"/>
  </svg>`;

function oval(id, title, subtitle, { hidden = false, icon = MIC_ICON, variant = "" } = {}) {
  return `
    <button id="${id}" type="button" class="vt-oval${variant ? ` vt-oval-${variant}` : ""}"${hidden ? " hidden" : ""} aria-label="${title.replace(/<br>/g, " ")}, ${subtitle.toLowerCase()}">
      ${icon}
      <span class="vt-oval-title">${title}</span>
      <span class="vt-oval-sub">${subtitle}</span>
      <span class="vt-swoosh" aria-hidden="true"></span>
    </button>`;
}

const TILE_ICONS = {
  manual: `<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10"/>`,
  jobs: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>`,
  results: `<path d="M6 20v-5M12 20V10M18 20V4"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`,
};

function tile(id, key, label, hint) {
  return `
    <button id="${id}" type="button" class="vt-tile" aria-label="${label}: ${hint}">
      <svg class="vt-tile-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TILE_ICONS[key]}</svg>
      <span class="vt-tile-label">${label}</span>
      <span class="vt-tile-rule" aria-hidden="true"></span>
    </button>`;
}

export function renderVoiceTakeoff({ nativeAvailable = false } = {}) {
  const native = Boolean(nativeAvailable);
  return `
    <section class="vt-card" aria-labelledby="vtHeading">
      <h2 id="vtHeading" class="vt-visually-hidden">Voice takeoff</h2>
      <div class="vt-statusbar">
        <span id="recordState" class="vt-state" role="status" data-state="${native ? "ready" : "unavailable"}">${native ? "Ready on iPhone" : "Installed iPhone app required"}</span>
        <span id="recordElapsed" class="vt-elapsed" aria-label="Elapsed recording time">00:00</span>
      </div>

      <div class="vt-stage">
        ${oval("start", "LET’S<br>TAKEOFF!", "TAP TO RECORD")}
        ${oval("stop", "STOP &amp;<br>REVIEW", "TAP TO FINISH", { hidden: true, icon: STOP_ICON, variant: "live" })}
        ${oval("resume", "RESUME<br>TAKEOFF", "TAP TO CONTINUE", { hidden: true })}
        <div class="vt-mini">
          <button id="pause" type="button" class="vt-mini-btn" hidden>Pause</button>
          <button id="finish" type="button" class="vt-mini-btn vt-mini-strong" hidden>Stop &amp; review</button>
        </div>
      </div>

      ${native ? "" : `
      <p id="nativeVoiceNotice" class="vt-notice">
        <strong>Recording needs the installed iPhone app.</strong>
        On-device WhisperKit runs only there. This browser never starts recording and does not capture or upload audio. Use Manual Entry below instead.
      </p>`}

      <p id="voiceStatus" class="vt-model-status">${native ? "First use downloads about 626 MB. Transcription runs on this iPhone; saving jobs needs internet." : "Speech model not available in the browser."}</p>
      <progress id="modelProgress" class="vt-progress" aria-label="Preparing on-device speech model" hidden></progress>

      <div class="vt-live" aria-live="polite">
        <span id="voiceLiveLabel" class="vt-live-label">Live transcript</span>
        <p id="voiceLiveText" class="vt-live-text" aria-labelledby="voiceLiveLabel">No recording yet.</p>
      </div>

      <div id="voiceReviewPanel" class="vt-review" hidden>
        <label for="voiceReviewText" class="vt-review-label">Review transcript</label>
        <textarea id="voiceReviewText" rows="7" spellcheck="true" autocapitalize="sentences"></textarea>
        <button id="processVoiceReview" type="button" class="vt-process">Process measurements</button>
        <button id="discardVoiceReview" type="button" class="vt-discard">Discard recording text</button>
        <p id="voiceReviewStatus" class="vt-review-status" role="status"></p>
      </div>
    </section>

    <nav class="vt-tiles" aria-label="Takeoff tools">
      ${tile("tileManual", "manual", "Manual Entry", "type a measurement")}
      ${tile("tileJobs", "jobs", "Saved Jobs", "open job list")}
      ${tile("tileResults", "results", "Results", "view measurements")}
      ${tile("tileSettings", "settings", "Settings", "choose the takeoff section")}
    </nav>`;
}
