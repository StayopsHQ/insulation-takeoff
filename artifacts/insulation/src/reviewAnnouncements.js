// A bare section announcement is not a measurement or a missing-input request.
// Keep this narrow: partial numbers, corrections and sprinkler details must stay.
export function isBareSectionAnnouncement(text) {
  const label = String(text || "").toLowerCase().trim()
    .replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "")
    .replace(/^(?:and\s+then|and\s+|then\s+|next\s+|another\s+|in\s+the\s+)/, "")
    .trim();
  return /^(?:(?:unfinished|finished)\s+(?:area|space)|(?:first|second|third|main)\s+floor\s+walls?|exterior\s+walls?|basement(?:\s+exterior)?(?:\s+walls?)?|party\s+walls?|attic|slopes?|band\s+joists?|garage\s+ceiling|batt\s+ceilings?|baffles|caulk|foam|sill)(?:\s+(?:area|section|measurements?))?$/.test(label);
}

export function removeBareAnnouncements(batch) {
  if (!batch) return batch;
  const removed = batch.items.filter(item => !item.saved && !item.corrections?.length &&
    isBareSectionAnnouncement(item.originalText ?? item.text));
  const removedIssues = batch.issues.filter(issue => !issue.resolved && isBareSectionAnnouncement(issue.text));
  if (!removed.length && !removedIssues.length) return batch;
  batch.ignoredAnnouncements = [...(batch.ignoredAnnouncements || []),
    ...removed.map(item => item.originalText ?? item.text), ...removedIssues.map(issue => issue.text)];
  const ids = new Set(removed.map(item => item.id));
  batch.items = batch.items.filter(item => !ids.has(item.id));
  batch.issues = batch.issues.filter(issue => !removedIssues.includes(issue));
  return batch;
}
