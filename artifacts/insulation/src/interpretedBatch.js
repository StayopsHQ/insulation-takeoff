import { validateShape } from "./interpretationContract.js";
import { normalizeNumbers, parseTranscript } from "./parser.js";
import { findVoiceSectionMentions } from "./voiceBoundaries.js";
import { isBareSectionAnnouncement, removeBareAnnouncements } from "./reviewAnnouncements.js";

const wallSections = ["exterior walls", "basement exterior", "party walls"];
const numberTokens = text => (normalizeNumbers(text).match(/\d+(?:\.\d+)?/g) || []).map(Number);

export function measurementText(section, f) {
  const words = [section || ""];
  // Material is passed separately; Band Joists must never count R-values as lengths.
  if (f.bays != null) words.push(`${f.bays} bays`);
  if (f.framing) words.push(f.framing);
  if (f.spacing != null) words.push(`${f.spacing} oc`);
  if (f.height != null) words.push(`${f.height} ft`);
  if (f.length != null && f.width != null) words.push(`${f.length} by ${f.width}`);
  if (f.lengths.length) words.push(f.lengths.join(" and "));
  if (f.slopeFactor != null) words.push(f.slopeFactor === 1 ? "no factor" : `with a ${f.slopeFactor} factor`);
  if (f.sprinklers != null) words.push(f.sprinklers ? "with sprinklers" : "no sprinklers");
  if (f.quantity != null) words.push(`${f.quantity} baffles`);
  return words.join(" ");
}

function fieldProblem(event, source) {
  const f = event.fields;
  const numbers = numberTokens(source);
  if ([f.bays, f.spacing, f.height, f.length, f.width, f.quantity, ...f.lengths].some(v => v != null && v <= 0)) return "Review the zero or negative measurement; no positive value was guessed.";
  const values = [f.bays, f.spacing, f.height, f.length, f.width, f.quantity, ...f.lengths,
    ...(f.framing ? f.framing.split("x").map(Number) : []),
    ...(f.material ? numberTokens(f.material) : [])].filter(v => v != null);
  if (values.some(value => !numbers.includes(value))) return "An extracted value is not supported by this item's original words. Check this item.";
  if (event.kind === "measurement") {
    const extracted = [...values, ...(f.slopeFactor == null ? [] : [f.slopeFactor])];
    if (numbers.some(value => !extracted.includes(value))) return "Some spoken numbers are missing from this measurement's extracted inputs. Review this item.";
    if (event.section === "band joists") {
      const lengths = [...f.lengths];
      const spoken = numberTokens(f.material ? source.replace(/\bR\s*[- ]?\s*\d+\b/i, "") : source);
      if (spoken.length !== lengths.length) return "Some band-joist lengths were combined or omitted. Review this item.";
    }
    const pairs = normalizeNumbers(source).match(/\d+(?:\.\d+)?\s*(?:ft\s*)?x\s*\d+(?:\.\d+)?/g) || [];
    if (!wallSections.includes(event.section) && event.section !== "band joists" && pairs.length > 1) return "Separate dimensions were combined into this item. Retry interpretation before confirming.";
  }
  if (f.slopeFactor != null && !(f.slopeFactor === 1 && /\b(?:no|without)\b/i.test(source)) && !numbers.includes(f.slopeFactor)) return "The slope factor was not explicitly heard.";
  if (f.sprinklers != null && !/\bsprinklers?\b/i.test(source)) return "Sprinkler status was not explicitly heard.";
  const noSprinklers = /\b(?:no|without)\s+sprinklers?\b/i.test(source);
  if (f.sprinklers === true && noSprinklers || f.sprinklers === false && !noSprinklers) return "Review the stated sprinkler status.";
  if (f.material && !/^R-(11|13|15|19|20|21|30|38|49)$/i.test(f.material)) return "Choose the material; the extracted material is unsupported.";
  if (f.slopeFactor != null && event.section !== "slopes") return "A slope factor belongs only to a slope.";
  if (f.lengths.length && event.section !== "band joists") return "Listed lengths require the correct measurement section.";
  if (f.quantity != null && event.section !== "baffles") return "This quantity has no confirmed calculation rule.";
  if ((f.bays != null || f.framing || f.spacing != null || f.height != null) && !wallSections.includes(event.section)) return "Wall inputs were assigned to a different section.";
  const mentions = findVoiceSectionMentions(source).filter(m => !m.contextualWallArea && m.section);
  if (mentions.some(m => m.section !== event.section)) return "This item's source includes another area. Review this boundary.";
  if (event.kind === "measurement" && (normalizeNumbers(source).match(/\b\d+(?:\.\d+)?\s*bays?\b/g) || []).length > 1) return "More than one wall count was returned in this item. Retry interpretation or correct this row.";
  return null;
}

export function interpretedVoiceBatch(transcript, data, material = null, usage = null) {
  validateShape(data);
  const batch = { sourceText: transcript, boundaryVersion: 2, interpreter: "gpt", items: [], issues: [], metadata: {}, usage };
  const jobs = [...transcript.matchAll(/\b(?:start\s+)?job\s*(?:number\s*|#\s*)?(\d+)\b/ig)].map(m => m[1]);
  batch.metadata = { jobNumbers: [...new Set(jobs)], ...(jobs.length === 1 ? { jobNumber: jobs[0] } : {}) };
  if (data.jobNumber && !jobs.includes(data.jobNumber)) throw new Error("Unverified job metadata.");
  let cursor = 0;
  const seen = new Set();
  const addIssue = (event, reason, ids = []) => batch.issues.push({
    id: `issue-${batch.issues.length}`, text: event.sourceText, reason,
    section: event.section, candidateIds: ids, resolved: false
  });
  for (const event of data.events) {
    const start = transcript.indexOf(event.sourceText, cursor);
    if (start < 0 || !event.id || seen.has(event.id)) throw new Error("Invalid event source, order, or ID.");
    cursor = start + event.sourceText.length;
    seen.add(event.id);
    if (event.kind !== "correction" && isBareSectionAnnouncement(event.sourceText)) {
      (batch.ignoredAnnouncements ||= []).push(event.sourceText);
      continue;
    }
    const problem = fieldProblem(event, event.sourceText);
    if (event.kind === "clarification") {
      addIssue(event, event.clarification || "Clarify this part of the recording.");
      continue;
    }
    if (event.kind === "correction") {
      const target = batch.items.find(item => item.id === event.targetId);
      const scopeMatches = target && target.section === event.section && (target.area || target.section) === (event.area || event.section);
      const changed = Object.entries(event.fields).filter(([, value]) => value != null && (!Array.isArray(value) || value.length));
      if (problem || event.clarification || !scopeMatches || !changed.length) {
        addIssue(event, problem || event.clarification || "Choose the earlier measurement this correction belongs to.", target ? [target.id] : []);
        continue;
      }
      const previousText = target.text;
      const fields = { ...target.fields, ...Object.fromEntries(changed) };
      target.fields = fields;
      target.text = measurementText(target.section, fields);
      target.result = parseTranscript(target.text, target.section, fields.material || target.material);
      if (target.validationMessage) {
        target.result.status = "needs_review";
        target.result.requiresReview = true;
        target.result.message = target.validationMessage;
      }
      target.corrections.push({ utterance: event.sourceText, previousText, finalText: target.text, targetId: target.id, section: target.section });
      continue;
    }
    if (event.targetId) throw new Error("A measurement cannot overwrite a target.");
    const text = measurementText(event.section, event.fields);
    const item = {
      id: event.id, section: event.section, area: event.area, fields: event.fields,
      material: event.fields.material || material, text, originalText: event.sourceText,
      corrections: [], saved: false, result: parseTranscript(text, event.section, event.fields.material || material)
    };
    if (problem || event.clarification || !event.section) {
      item.validationMessage = problem || event.clarification || "Choose the section for this measurement.";
      item.result.status = "needs_review";
      item.result.requiresReview = true;
      item.result.message = problem || event.clarification || "Choose the section for this measurement.";
    }
    batch.items.push(item);
  }
  // Catch silent omissions: numeric measurement speech may not disappear from review.
  let consumed = transcript;
  for (const event of data.events) consumed = consumed.replace(event.sourceText, " ");
  consumed = consumed.replace(/\b(?:start\s+)?job\s*(?:number\s*|#\s*)?\d+\b/ig, " ");
  if (/\d/.test(normalizeNumbers(consumed))) {
    addIssue({ sourceText: consumed.trim(), section: null }, "Some numeric speech was not assigned. Review these words before confirming.");
  }
  return removeBareAnnouncements(batch);
}
