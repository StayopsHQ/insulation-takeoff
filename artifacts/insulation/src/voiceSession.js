const CORRECTION_CUE = /\b(?:actually|scratch that|correction|correct that|make (?:that|it)|change (?:it|that|the measurement)?\s*to|replace (?:it|that) with|instead of|i mean|i meant|sorry|rather|use \d+(?:\.\d+)?\s+(?:by|x)\s+\d+(?:\.\d+)?\s+instead)\b|\bno[,;]?\s+(?:\d|make\b|use\b|the\b)|\bnot\s+\d+(?:\.\d+)?\s+(?:by|x|feet|foot|ft|inches?|but)\b/i;
const STANDALONE_CORRECTION_CUE = /^\s*(?:no|wait|hold on|scratch|actually|not)\s*[,;.!]?\s*$/i;

export function isCorrectionUtterance(text) {
  const value = String(text ?? "");
  return CORRECTION_CUE.test(value) || STANDALONE_CORRECTION_CUE.test(value);
}

export function appendPendingVoiceText(pending, incoming) {
  return [String(pending ?? "").trim(), String(incoming ?? "").trim()]
    .filter(Boolean)
    .join(" ");
}

export function shouldSaveVoiceResult(result) {
  return result?.status === "calculated" || result?.requiresReview === true;
}

export function confirmedSegmentKey(segment) {
  if (segment?.key) return String(segment.key);
  const runId = String(segment?.runId ?? "");
  const id = segment?.id == null ? "" : String(segment.id);
  const start = Number.isFinite(Number(segment?.start)) ? Number(segment.start).toFixed(2) : "";
  const end = Number.isFinite(Number(segment?.end)) ? Number(segment.end).toFixed(2) : "";
  // Stable timing identity also covers revised punctuation/text in repeated snapshots.
  return `${runId}:${start}:${end}:${start || end ? "" : id + ":" + String(segment?.text ?? "").trim()}`;
}

export function appendConfirmedSegments(current = [], incoming = []) {
  const result = [...current];
  const seen = new Set(result.map(confirmedSegmentKey));
  for (const segment of incoming) {
    const key = confirmedSegmentKey(segment);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...segment, key });
  }
  return result;
}

export function replaceRunUnconfirmedSegments(current = [], incoming = [], runId = "") {
  const preservedRuns = current.filter(segment => segment.runId !== runId);
  const latestByBoundary = new Map();
  for (const segment of incoming) {
    const start = Number.isFinite(Number(segment.start)) ? Number(segment.start).toFixed(2) : "";
    const end = Number.isFinite(Number(segment.end)) ? Number(segment.end).toFixed(2) : "";
    const key = `${runId}:${start}:${end}`;
    latestByBoundary.set(key, { ...segment, runId, key });
  }
  return [...preservedRuns, ...latestByBoundary.values()];
}

// currentText is a replacement decode of the active window, not extra speech to
// append to that window's previous unconfirmed segments. Keep paused runs intact.
export function pendingVoiceSegments(unconfirmed = [], currentText = "", runId = "") {
  const text = String(currentText).trim();
  if (!text || text === "Waiting for speech...") return unconfirmed;
  return replaceRunUnconfirmedSegments(unconfirmed, [
    { id: "tail", start: -1, end: -1, text }
  ], runId);
}

export function removeConfirmedInterim(segments = [], confirmed = [], runId = "") {
  const end = Math.max(-Infinity, ...confirmed
    .filter(segment => segment.runId === runId)
    .map(segment => Number(segment.end))
    .filter(Number.isFinite));
  return segments.filter(segment => segment.runId !== runId || Number(segment.end) > end);
}

export function recordingTranscript(confirmedText, unconfirmed, currentText, runId) {
  return [
    String(confirmedText || "").trim(),
    ...pendingVoiceSegments(unconfirmed, currentText, runId).map(segment => segment.text)
  ].filter(Boolean).join(" ").trim();
}

export function formatRecordingElapsed(milliseconds) {
  const seconds = Math.floor(Math.max(0, Number(milliseconds) || 0) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
