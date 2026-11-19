import { findSectionMentions, normalizeNumbers, normalizeSectionContext, parseTranscript } from "./parser.js";
import { isCorrectionUtterance } from "./voiceSession.js";
import { findVoiceSectionMentions, findMeasurementBoundaries } from "./voiceBoundaries.js";
import { removeBareAnnouncements } from "./reviewAnnouncements.js";

// Interpret only explicit construction wording. All quantities come from parseTranscript.
const CORRECTION = /\b(?:correction|correct that|actually|make that|make it|scratch that|i mean|i meant|sorry|rather|change|replace|instead of|no(?=\s*[,;]?\s+(?:\d|make\b|use\b|the\b)))\b/ig;
const NEXT = /\b(?:add\s+another|another\s+(?:wall|measurement)|next\s+(?:area|section|room)|different\s+(?:area|section|room))\b/ig;
const NUMBER = "\\d+(?:\\.\\d+)?";
const BOUNDARY_VERSION = 2;
const FIELD_PATTERNS = [
  ["bays", new RegExp(`\\b(${NUMBER})\\s*bays?\\b`)],
  ["framing", /\b2\s*x\s*([46])\b/],
  ["spacing", /\b(16|24)\s*oc\b/],
  ["height", new RegExp(`\\b(${NUMBER})\\s*ft\\b`)],
  ["material", /\br\s*[- ]?\s*(11|13|15|19|20|21|30|38|49)\b/],
  ["quantity", new RegExp(`\\b(?:(${NUMBER})\\s*baffles?\\b|baffles?\\s*(${NUMBER})\\b)`)]
];

export function recalculateBatchItem(item) {
  delete item.validationMessage; // Explicit local editing revalidates through the deterministic parser.
  item.result = parseTranscript(item.text, item.section, item.material);
  if (isCorrectionUtterance(item.text)) {
    item.result.status = "needs_review";
    item.result.requiresReview = true;
    item.result.message = "Enter only the complete final measurement here; resolve correction wording separately.";
  }
  if (/\bbays?\b/i.test(item.text) && (normalizeNumbers(item.text).match(/\b\d+(?:\.\d+)?\s*bays?\b/g) || []).length > 1) {
    item.result.status = "needs_review";
    item.result.requiresReview = true;
    item.result.message = "This measurement has alternative bay counts. Choose the intended count before confirming this row.";
  }
  if (!item.result.section && item.area === item.section) item.area = null;
  item.section = item.result.section;
  return item;
}

export function changeBatchSection(item, section) {
  let text = item.text;
  for (const mention of findSectionMentions(text).reverse()) {
    text = text.slice(0, mention.start) + text.slice(mention.end);
  }
  item.text = text.trim();
  item.section = normalizeSectionContext(section);
  return recalculateBatchItem(item);
}

function matchingValues(item, field) {
  const value = item.result.parsed[field];
  if (field === "dimensionPairs") return (value || []).map(pair => pair.join(" x "));
  if (field === "measurements") return value || [];
  return value == null ? [] : [value];
}

function correctionSpec(text, section) {
  let scopedText = text;
  for (const mention of findSectionMentions(scopedText).reverse()) {
    if (mention.section === "baffles" && /\d\s*$/.test(normalizeNumbers(scopedText.slice(0, mention.start)))) continue;
    scopedText = scopedText.slice(0, mention.start) + scopedText.slice(mention.end);
  }
  const normalized = normalizeNumbers(scopedText);
  const parts = normalized.split(/\bnot\b/);
  if (parts.length > 2) return null;
  const finalText = parts[0];
  const oldText = parts[1] || "";
  const fields = FIELD_PATTERNS.flatMap(([field, pattern]) => {
    const match = finalText.match(pattern);
    if (!match) return [];
    const value = field === "framing" ? `2x${match[1]}`
      : field === "material" ? `R-${match[1]}` : Number(match[1] || match[2]);
    return [{ field, value }];
  });
  const pair = finalText.match(new RegExp(`\\b(${NUMBER})\\s*(?:ft\\s*)?x\\s*(${NUMBER})\\b`));
  if (pair && !fields.some(spec => spec.field === "framing")) {
    fields.push({ field: "dimensionPairs", value: [Number(pair[1]), Number(pair[2])].join(" x ") });
  }
  // A bare number can be a bay correction only for a wall, or a band measurement.
  const cleaned = finalText
    .replace(CORRECTION, " ")
    .replace(/\b(?:please|use|instead|to|for|the|count|bay count)\b/g, " ")
    .trim().replace(/^[,;:!.\s]+|[,;:!.\s]+$/g, "");
  if (!fields.length && new RegExp(`^${NUMBER}$`).test(cleaned)) {
    if (["exterior walls", "basement exterior", "party walls"].includes(section)) fields.push({ field: "bays", value: Number(cleaned) });
    if (section === "band joists") fields.push({ field: "measurements", value: Number(cleaned) });
  }
  if (fields.length !== 1) return null;
  const spec = fields[0];
  if (oldText) {
    const oldPair = oldText.match(new RegExp(`(${NUMBER})\\s*(?:ft\\s*)?x\\s*(${NUMBER})`));
    const oldNumbers = oldText.match(new RegExp(NUMBER, "g"));
    if (spec.field === "dimensionPairs" && oldPair) spec.old = `${Number(oldPair[1])} x ${Number(oldPair[2])}`;
    else if (spec.field === "framing" && oldPair) spec.old = `2x${oldPair[2]}`;
    else if (oldNumbers?.length === 1) spec.old = spec.field === "material" ? `R-${oldNumbers[0]}` : Number(oldNumbers[0]);
    else return null;
  }
  return spec;
}

function correctedText(item, spec) {
  const normalized = normalizeNumbers(item.text);
  const pattern = FIELD_PATTERNS.find(([field]) => field === spec.field)?.[1];
  let replacement;
  if (spec.field === "bays") replacement = `${spec.value} bays`;
  if (spec.field === "framing" || spec.field === "material") replacement = spec.value;
  if (spec.field === "spacing") replacement = `${spec.value} oc`;
  if (spec.field === "height") replacement = `${spec.value} ft`;
  if (spec.field === "quantity") replacement = `${spec.value} baffles`;
  if (pattern) {
    // Repeated fields are not safe to replace by their first occurrence.
    const matches = [...normalized.matchAll(new RegExp(pattern.source, "g"))];
    if (matches.length !== 1) return null;
    return normalized.replace(pattern, replacement);
  }
  const values = matchingValues(item, spec.field);
  const selected = spec.old == null ? (values.length === 1 ? values[0] : null) : spec.old;
  if (selected == null || values.filter(value => String(value) === String(selected)).length !== 1) return null;
  if (spec.field === "dimensionPairs") {
    const [a, b] = String(selected).split(" x ");
    return normalized.replace(new RegExp(`\\b${a.replace(".", "\\.")}\\s*(?:ft\\s*)?x\\s*${b.replace(".", "\\.")}\\b`), spec.value);
  }
  if (spec.field === "measurements") {
    const measurements = values.map(value => value === selected ? spec.value : value);
    return `${item.section} ${item.result.parsed.material || ""} ${measurements.join(" and ")}`.trim();
  }
  return null;
}

export function parseVoiceBatch(transcript, selectedSection = null, material = null) {
  const batch = { sourceText: String(transcript), boundaryVersion: BOUNDARY_VERSION, items: [], issues: [] };
  const jobs = [...batch.sourceText.matchAll(/\bstart\s+(?:a\s+)?job\s*(?:(?:number|no\.?|#)\s*)?(\d+)\b[.!?]?/ig)];
  const jobNumbers = [...new Set(jobs.map(match => match[1]))];
  batch.metadata = { jobNumbers, ...(jobNumbers.length === 1 ? { jobNumber: jobNumbers[0] } : {}) };
  const sections = findVoiceSectionMentions(batch.sourceText);
  const corrections = [...batch.sourceText.matchAll(CORRECTION)].map(match => ({ type: "correction", start: match.index, end: match.index + match[0].length }));
  // "Correction, make that..." is one cue, not two corrections.
  const cues = corrections.filter((cue, index) => !index ||
    /\d/.test(normalizeNumbers(batch.sourceText.slice(corrections[index - 1].end, cue.start))));
  const events = [
    ...jobs.map(match => ({ type: "metadata", start: match.index, end: match.index + match[0].length })),
    ...sections.flatMap((mention, index) => {
      if (mention.section !== "baffles") return [{ ...mention, type: "section" }];
      const prefix = batch.sourceText.slice(0, mention.start);
      const count = prefix.match(/\b\d+(?:\.\d+)?\s*$/);
      if (!count) return [{ ...mention, type: "section" }];
      const lastCorrection = cues.filter(cue => cue.start < mention.start).at(-1);
      if (lastCorrection && lastCorrection.start > (sections[index - 1]?.start ?? -1)) return [];
      return [{ ...mention, start: count.index, type: "section" }];
    }),
    ...cues,
    ...[...batch.sourceText.matchAll(NEXT)].filter(match => !sections.some(mention =>
      mention.start < match.index + match[0].length && mention.end > match.index))
      .map(match => ({ type: "next", start: match.index, end: match.index + match[0].length })),
    ...[...batch.sourceText.matchAll(/\b(?:and|plus|then)\s+(?=\d+(?:\.\d+)?\s+bays?\b)/ig)].map(match => ({ type: "continuation", start: match.index, end: match.index + match[0].length }))
  ].sort((a, b) => a.start - b.start);
  // Explicit section names immediately following a correction identify its scope.
  for (let i = 0; i < events.length - 1; i += 1) {
    if (events[i].type !== "correction" || events[i + 1].type !== "section") continue;
    const prefix = batch.sourceText.slice(events[i].end, events[i + 1].start);
    const suffix = batch.sourceText.slice(events[i + 1].end, events[i + 2]?.start ?? batch.sourceText.length);
    const suffixScope = /\b(?:for|under|on)\s+(?:the\s+)?$/i.test(prefix) ||
      (!/[.!?]/.test(prefix) && !/[\p{L}\d]/u.test(suffix));
    if ((!/\d/.test(normalizeNumbers(prefix)) && !/[.!?]/.test(prefix)) || suffixScope) {
      events[i].section = events[i + 1].section;
      events[i].area = events[i + 1].area;
      events.splice(i + 1, 1);
    }
  }
  events.push(...findMeasurementBoundaries(batch.sourceText, events));
  events.sort((a, b) => a.start - b.start);
  let section = normalizeSectionContext(selectedSection);
  let area = section;
  let activeItem = null;
  let pending = null;
  const flushPending = () => {
    if (pending && /\d/.test(normalizeNumbers(pending.text).replace(/\br\s*[- ]?\s*\d+\b/gi, ""))) {
      batch.items.push(pending);
      activeItem = pending;
    }
    pending = null;
  };
  const addIssue = (text, reason, candidates = [], scopedSection = section) => {
    batch.issues.push({ id: `issue-${batch.issues.length}`, text: text.trim(), reason, section: scopedSection, candidateIds: candidates.map(item => item.id), resolved: false });
  };
  const addMeasurement = text => {
    let original = text.trim();
    // Trailing conversation is retained in sourceText, not promoted into an entry.
    text = original.replace(/(?:[,.;]\s*)?\b(?:and\s+)?(?:add\s+)?another(?:\s+(?:attic|wall|measurement|section))?[\s,.!?]*$/i, "")
      .replace(/\b(?:and\s+then|and|then|plus)\s*[,;:]?\s*$/i, "").trim();
    if (!/\d/.test(normalizeNumbers(text))) return;
    if (pending && pending.section === section) {
      text = `${pending.text} ${text}`;
      original = `${pending.originalText} ${original}`;
      pending = null;
    } else if (pending) {
      flushPending();
    }
    const item = recalculateBatchItem({
      id: `draft-${batch.items.length}`, section, area, material, text: text.trim(),
      originalText: original, corrections: [], saved: false
    });
    if (item.result.status !== "calculated" && !item.result.requiresReview) {
      pending = item;
      return;
    }
    batch.items.push(item);
    activeItem = item;
    section = item.section;
  };
  const applyCorrection = (text, explicitSection, explicitArea) => {
    flushPending();
    const scope = explicitSection || section;
    const scopedArea = explicitArea || (!explicitSection ? area : null);
    const scoped = batch.items.filter(item => scope && item.section === scope &&
      (!scopedArea || (item.area || item.section) === scopedArea));
    const spec = correctionSpec(text.replace(/^[\s\S]*?\b(?:correction|actually)\b/i, ""), scope);
    let candidates = scoped.filter(item => spec && matchingValues(item, spec.field).length);
    if (spec?.old != null) {
      candidates = candidates.filter(item => matchingValues(item, spec.field).some(value => String(value) === String(spec.old)));
    } else if (!explicitSection && activeItem?.section === scope) {
      candidates = candidates.filter(item => item.id === activeItem.id);
    }
    const selectionWords = explicitArea
      ? text.replace(/\b(?:first|second|third|1st|2nd|3rd)[ -]+floor\s+(?:exterior\s+)?walls?\b/ig, "")
      : text;
    if (!spec || candidates.length !== 1 || /\b(?:first|second|third|earlier|previous|both|all|other)\b/i.test(selectionWords)) {
      addIssue(text, "Choose the intended measurement and enter its complete final text.", candidates.length ? candidates : scoped, scope);
      return;
    }
    const item = candidates[0];
    const finalText = correctedText(item, spec);
    if (!finalText) {
      addIssue(text, "This correction does not identify a single value. Enter the complete final measurement.", [item], scope);
      return;
    }
    const before = item.text;
    item.text = finalText;
    recalculateBatchItem(item);
    item.corrections.push({ utterance: text.trim(), previousText: before, finalText, targetId: item.id, section: scope, field: spec.field, value: spec.value });
  };
  let cursor = 0;
  let mode = "measurement";
  let explicitCorrectionSection = null;
  let explicitCorrectionArea = null;
  for (let i = 0; i <= events.length; i += 1) {
    const event = events[i];
    const end = event?.start ?? batch.sourceText.length;
    const text = batch.sourceText.slice(cursor, end);
    if (mode === "correction") applyCorrection(text, explicitCorrectionSection, explicitCorrectionArea);
    else addMeasurement(text);
    if (!event) break;
    if (event.type === "metadata") {
      mode = "measurement";
      cursor = event.end;
    } else if (event.type === "correction") {
      mode = "correction";
      explicitCorrectionSection = event.section || null;
      explicitCorrectionArea = event.area || null;
      cursor = event.start;
    } else if (event.type === "section") {
      const nextSection = event.contextualWallArea
        ? (["exterior walls", "basement exterior", "party walls"].includes(section) ? section : null)
        : event.section;
      const nextArea = event.area || (section === nextSection ? area : nextSection);
      const startsNewWall = pending?.result.parsed.bays != null &&
        /\bbays?\b/i.test(batch.sourceText.slice(event.end, events[i + 1]?.start ?? batch.sourceText.length));
      if (section !== nextSection || area !== nextArea || startsNewWall) {
        flushPending();
        activeItem = null;
      }
      section = nextSection;
      area = nextArea;
      mode = "measurement";
      cursor = event.start;
    } else {
      if (pending) {
        flushPending();
      }
      mode = "measurement";
      cursor = event.end;
      // Unnamed changes of area cannot silently inherit the previous section.
      const followingSection = events[i + 1]?.type === "section" &&
        !/\d/.test(normalizeNumbers(batch.sourceText.slice(event.end, events[i + 1].start)));
      const sameSectionAddition = /^(?:add\s+another|another\s+(?:wall|measurement))$/i.test(batch.sourceText.slice(event.start, event.end));
      if (event.type !== "continuation" && !followingSection && !sameSectionAddition) {
        section = null;
        area = null;
        activeItem = null;
      }
    }
  }
  flushPending();
  // Review complete dimension pairs individually, while keeping one section group.
  // Split only after correction matching so a correction cannot alter two pairs.
  const expanded = [];
  for (const item of batch.items) {
    const pairs = item.result.parsed.dimensionPairs;
    const rectangleSection = !["exterior walls", "basement exterior", "party walls"].includes(item.section);
    if (!pairs?.length || !rectangleSection) {
      expanded.push(item);
      continue;
    }
    const normalized = normalizeNumbers(item.text);
    const withoutPairs = normalized.replace(/\b\d+(?:\.\d+)?\s*(?:ft\s*)?x\s*\d+(?:\.\d+)?(?:\s*ft)?\b/g, " ")
      .replace(item.section === "slopes" ? /(?:\s*(?:x|by|times)\s*(?:1\.25|1(?:\.0+)?)\b)|(?:\b(?:with\s+(?:a\s+)?)?(?:1\.25|1(?:\.0+)?)\s+factor\b)|(?:\bfactor\s*(?:of\s*)?(?:1\.25|1(?:\.0+)?)\b)/gi : /$^/g, " ")
      .replace(/\br\s*[- ]?\s*\d+\b/gi, " ");
    const hasIncomplete = /\d/.test(withoutPairs);
    if (pairs.length === 1 && !hasIncomplete) {
      expanded.push(item);
      continue;
    }
    const prefix = `${item.section || ""} ${item.result.parsed.material || ""} ${item.result.parsed.hasSprinklers ? "with sprinklers" : ""}`.trim();
    const children = pairs.map((pair, index) => recalculateBatchItem({
      ...item, id: `${item.id}-pair-${index}`, text: `${prefix} ${pair[0]} by ${pair[1]}${item.result.parsed.slopeFactors?.[index] === 1 ? " no factor" : item.result.parsed.slopeFactors?.[index] != null ? ` with a ${item.result.parsed.slopeFactors[index]} factor` : ""}`,
      corrections: [...item.corrections]
    }));
    if (hasIncomplete) children.push(recalculateBatchItem({
      ...item, id: `${item.id}-incomplete`, text: withoutPairs.trim(),
      corrections: [], originalText: withoutPairs.trim()
    }));
    for (const issue of batch.issues) {
      if (issue.candidateIds.includes(item.id)) issue.candidateIds = issue.candidateIds.flatMap(id =>
        id === item.id ? children.map(child => child.id) : [id]);
    }
    expanded.push(...children);
  }
  batch.items = expanded;
  return batch;
}

// Old session-storage drafts can outlive a frontend rebuild. Reinterpret only
// untouched, wholly unsaved drafts; never replace manual choices or saved IDs.
export function upgradeVoiceBatch(batch, selectedSection, material) {
  removeBareAnnouncements(batch);
  if (!batch || batch.interpreter || batch.boundaryVersion === BOUNDARY_VERSION ||
      batch.items.some(item => item.saved || item.corrections?.some(correction =>
        correction.utterance === "Edited during review")) ||
      batch.issues.some(issue => issue.resolved)) return batch;
  return parseVoiceBatch(batch.sourceText, selectedSection, material);
}

export function batchReadyItems(batch) {
  if (batch.validationBlocked || (batch.interpreter === "gpt" &&
      (batch.issues.some(issue => !issue.resolved) || batch.items.some(item => item.result.status !== "calculated" || item.result.requiresReview)))) return [];
  return batchIndividuallyReadyItems(batch);
}

// Separate row validity from the recording-wide confirmation gate.
export function batchIndividuallyReadyItems(batch) {
  const blocked = new Set(batch.issues.filter(issue => !issue.resolved).flatMap(issue => issue.candidateIds));
  return batch.items.filter(item => !item.saved && !blocked.has(item.id) &&
    item.result.section && item.result.status === "calculated" && !item.result.requiresReview);
}
