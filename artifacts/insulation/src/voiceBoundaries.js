import { findSectionMentions } from "./parser.js";

const UNIT = "(?:one|two|three|four|five|six|seven|eight|nine)";
const TENS = "(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)";
const NUMBER = `(?:\\d+(?:\\.\\d+)?|${TENS}(?:[- ]${UNIT})?|${UNIT}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`;
const FLOOR = "(?:first|second|third|main|ground|upper|1st|2nd|3rd)[ -]+floor";
const WALL_AREAS = [
  ["exterior walls", new RegExp(`\\b(?:${FLOOR}\\s+(?:exterior\\s+)?walls?|(?:exterior\\s+)?walls?\\s+(?:on|of|for)\\s+(?:the\\s+)?${FLOOR})\\b`, "ig")],
  ["basement exterior", /\b(?:(?:in|down\s+in)\s+(?:the\s+)?)?basement(?:\s+(?:exterior|unfinished|finished))?(?:\s+walls?)?\b/ig],
  ["exterior walls", /\b(?:another|additional)\s+exterior(?:\s+(?:wall\s+)?section)?\b/ig]
];

// Offsets always refer to the original transcript, not its length-changing
// numeric normalization. This keeps unrelated speech out of each draft.
export function findVoiceSectionMentions(text) {
  const mentions = findSectionMentions(text).map(mention => ({ ...mention, area: mention.section }));
  for (const [section, pattern] of WALL_AREAS) {
    for (const match of text.matchAll(pattern)) {
      const floor = match[0].match(new RegExp(FLOOR, "i"))?.[0].toLowerCase().replace("-", " ")
        .replace(/^(1st|2nd|3rd)\b/, ordinal => ({ "1st": "first", "2nd": "second", "3rd": "third" }[ordinal]));
      const interior = /\binterior\s*$/i.test(text.slice(0, match.index));
      mentions.push({
        start: match.index, end: match.index + match[0].length,
        section: interior ? null : section, area: floor ? `${floor} walls` : section
      });
    }
  }
  for (const match of text.matchAll(/\b(?:unfinished|finished)\s+(?:area|space|portion)\b/ig)) {
    mentions.push({ start: match.index, end: match.index + match[0].length,
      section: null, contextualWallArea: true, area: match[0].toLowerCase() });
  }
  for (const match of text.matchAll(/\b(?:wall\s+measurements?|another\s+wall|walls?(?=\s*[:;]))\b/ig)) {
    mentions.push({ start: match.index, end: match.index + match[0].length,
      section: null, contextualWallArea: true, area: null });
  }
  mentions.sort((a, b) => a.start - b.start || b.end - a.end);
  return mentions.filter((mention, index) => !mentions.slice(0, index).some(other =>
    other.start <= mention.start && other.end > mention.start));
}

function boundaryStart(text, start) {
  const connector = text.slice(0, start).match(/(?:[,.;]\s*)?\b(?:and\s+then|and|then|plus|also)\s*[,;:]?\s*$/i);
  return connector ? connector.index : start;
}

// Sections/corrections are already tokenized. Split repeated bay fields only
// inside measurement spans; a "make that 29 bays, not 24 bays" span is never split.
export function findMeasurementBoundaries(text, events) {
  const boundaries = [];
  for (let index = -1; index < events.length; index += 1) {
    const event = events[index];
    if (event?.type === "correction" || event?.type === "metadata") continue;
    const start = event?.start ?? 0;
    const end = events[index + 1]?.start ?? text.length;
    const words = text.slice(start, end);
    const bays = [...words.matchAll(new RegExp(`\\b${NUMBER}\\s+bays?\\b`, "ig"))];
    const frames = [...words.matchAll(/\b(?:2|two)\s*[- ]*(?:by|x|×)\s*[- ]*(?:4|6|four|six)\b/ig)];
    for (let bayIndex = 1; bayIndex < bays.length; bayIndex += 1) {
      const previous = bays[bayIndex - 1];
      const current = bays[bayIndex];
      const between = words.slice(previous.index + previous[0].length, current.index);
      // Alternatives are not two confidently distinct measurements.
      if (/\b(?:or|maybe|perhaps)\s*[,;:]?\s*$/i.test(between)) continue;
      const repeatedFrame = frames.find((frame, frameIndex) => frameIndex >= bayIndex &&
        frame.index > previous.index && frame.index < current.index);
      const position = boundaryStart(words, repeatedFrame?.index ?? current.index);
      boundaries.push({ type: "continuation", start: start + position, end: start + position });
    }
    // "And then" can begin a new rectangle with different sprinkler/factor
    // attributes. Plain "and 12 by 8" keeps the established shared attributes.
    if (!bays.length) {
      const pair = `${NUMBER}\\s*(?:(?:feet|foot|ft)\\s*)?(?:by|x|×)\\s*${NUMBER}`;
      const pairs = [...words.matchAll(new RegExp(`\\b${pair}\\b`, "ig"))];
      for (let pairIndex = 1; pairIndex < pairs.length; pairIndex += 1) {
        const current = pairs[pairIndex];
        const position = boundaryStart(words, current.index);
        if (/\band\s+then\b/i.test(words.slice(position, current.index))) {
          boundaries.push({ type: "continuation", start: start + position, end: start + position });
        }
      }
    }
  }
  return boundaries;
}
