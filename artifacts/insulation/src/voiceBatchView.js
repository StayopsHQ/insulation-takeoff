import { batchReadyItems, batchIndividuallyReadyItems } from "./voiceBatch.js";
import { renderTakeoffTotals } from "./takeoffTotalsView.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const BATCH_SECTIONS = ["exterior walls", "basement exterior", "party walls", "attic", "slopes", "band joists", "batt ceilings", "garage ceiling", "baffles", "sill", "caulk", "foam"];
const options = selected => `<option value="">Choose section…</option>${BATCH_SECTIONS.map(section => `<option value="${section}"${section === selected ? " selected" : ""}>${section}</option>`).join("")}`;

export function renderVoiceBatchReview(batch) {
  if (!batch) return "";
  const ready = new Set(batchReadyItems(batch).map(item => item.id));
  const individual = new Set(batchIndividuallyReadyItems(batch).map(item => item.id));
  const unresolved = batch.items.filter(item => !item.saved && !individual.has(item.id));
  const issues = batch.issues.filter(issue => !issue.resolved);
  const gated = batch.interpreter === "gpt" && (unresolved.length || issues.length);
  const summary = batch.validationBlocked
    ? `${individual.size} measurement${individual.size === 1 ? "" : "s"} calculated in the local comparison. Saving is blocked because interpretation has not passed validation.`
    : !batch.items.length && !issues.length
      ? "No measurements were dictated. Nothing to save."
    : gated
      ? `${individual.size} measurement${individual.size === 1 ? "" : "s"} ready for review. Confirmation is blocked by ${unresolved.length} measurement${unresolved.length === 1 ? "" : "s"} needing your choice and ${issues.length} unresolved clarification${issues.length === 1 ? "" : "s"} listed above. Correctly calculated rows do not need to be entered again.`
      : `${ready.size} measurement${ready.size === 1 ? "" : "s"} ready. ${batch.interpreter === "gpt" ? "Review the recording, then explicitly confirm to save." : "Items needing a choice stay here when you save the ready items."}`;
  const groups = [];
  for (const item of batch.items) {
    if (groups.at(-1)?.section !== item.section) groups.push({ section: item.section, items: [] });
    groups.at(-1).items.push(item);
  }
  return `<h3>Takeoff review</h3>
    ${batch.interpretationError ? `<p role="alert">${escape(batch.interpretationError)} Local parser comparison only — saving is blocked. Retry is manual and limited.</p>` : ""}
    ${batch.interpreter === "gpt" ? "<small>AI interpreted inputs · quantities calculated by the existing takeoff engine</small>" : ""}
    ${batch.usage ? `<details><summary>Interpretation usage / cost</summary><p>${escape(batch.usage.model)} · ${escape(batch.usage.inputTokens)} input / ${escape(batch.usage.outputTokens)} output tokens · ${batch.usage.estimatedCostUSD == null ? "cost unavailable" : `$${Number(batch.usage.estimatedCostUSD).toFixed(6)} estimated`}. ${escape(batch.usage.estimateBasis)}</p></details>` : ""}
    ${batch.metadata?.jobNumber ? `<p>Dictated job number: <strong>${escape(batch.metadata.jobNumber)}</strong>. Current saved job is unchanged.</p>` : ""}
    <p>Edit measurements below, then confirm the recording once. Nothing is saved until you confirm.</p>
    ${groups.map(({ section, items }) => `<section class="voice-batch-section"><h4>${escape(section || "Choose a section")}</h4><ol class="voice-measurement-list">
      ${items.map((item, index) => `<li class="voice-measurement-row">
        ${item.area && item.area !== item.section ? `<small>${escape(item.area)}</small>` : ""}
        <label>Measurement ${index + 1}<textarea aria-label="Final measurement ${escape(section || "unassigned")} ${index + 1}" data-batch-edit="${item.id}" rows="2"${item.saved ? " readonly" : ""}>${escape(item.text)}</textarea></label>
        ${item.saved ? "<small>Saved</small>" : individual.has(item.id)
          ? `<small data-batch-status="calculated">Calculated${batch.validationBlocked ? " · comparison only" : " · ready for review"}</small>`
          : '<small data-batch-status="needs-choice">Needs your choice before saving</small>'}
        ${issues.filter(issue => issue.candidateIds.includes(item.id)).map(issue => `<p class="voice-batch-issue-reason">Pending clarification: ${escape(issue.reason)}</p>`).join("")}
        <p class="voice-batch-result">${escape(item.result.message)}</p>
        ${item.corrections.map(correction => `<p class="voice-batch-applied"><strong>Correction applied:</strong> ${escape(correction.utterance)}</p>`).join("")}
        <details><summary>Section / original words</summary>
          <label>Section<select data-batch-section="${item.id}"${item.saved ? " disabled" : ""}>${options(item.section)}</select></label>
          <p>${escape(item.originalText)}</p>
        </details>
      </li>`).join("")}</ol></section>`).join("")}
    ${batch.issues.filter(issue => !issue.resolved).map(issue => `<section class="voice-batch-issue">
      <h4>${batch.interpreter === "gpt" ? "Clarify this item" : "Resolve this correction only"}</h4><blockquote>${escape(issue.text)}</blockquote><p>${escape(issue.reason)}</p>
      <label>Measurement to correct<select id="batchTarget-${issue.id}">
        <option value="">Choose measurement…</option>
        ${batch.items.filter(item => !item.saved && (!issue.section || item.section === issue.section)).map(item => `<option value="${item.id}">${escape(`${item.section || "Unassigned"} — ${item.text}`)}</option>`).join("")}
      </select></label>
      <label>Complete final measurement<textarea id="batchFinal-${issue.id}" rows="3" placeholder="Enter the complete final measurement, not just the correction"></textarea></label>
      <button type="button" data-batch-resolve="${issue.id}">Apply to draft</button>
      <button type="button" data-batch-ignore="${issue.id}">Keep original measurement</button>
    </section>`).join("")}
    ${renderTakeoffTotals(batch.items.map(item => ({ ...item.result, areaLabel: item.area })),
      !batch.validationBlocked && batch.items.length > 0 && batch.items.every(item => item.result.status === "calculated" && !item.result.requiresReview) && batch.issues.every(issue => issue.resolved))}
    <p role="status">${escape(summary)}</p>`;
}
