import {
  wallSquareFeet,
  atticTotals,
  bandJoistTotal
} from "./calculations.js";

const NUMBER_WORDS = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, "twenty four": 24,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100
});

const SECTION_PATTERNS = [
  ["basement exterior", /\b(?:basement\s+exterior|exterior\s+basement)(?:\s+walls?)?\b/i],
  ["exterior walls", /\bexterior\s+walls?\b/i],
  ["party walls", /\bparty\s+walls?\b/i],
  ["band joists", /\b(?:band\s+joists?|b\s*j)\b/i],
  ["attic", /\b(?:attic|sprinkler\s+insulation)\b/i],
  ["batt ceilings", /\b(?:batt\s+ceilings?|ca\s*flat)\b/i],
  ["baffles", /\bbaffles?\b/i],
  ["slopes", /\bslopes?\b/i],
  ["garage ceiling", /\bgarage\s+ceiling\b/i],
  ["sill", /\bsills?\b/i],
  ["caulk", /\bcaulk\b/i],
  ["foam", /\bfoam\b/i]
];

const MATERIAL_PATTERN = /\bR\s*[- ]?\s*(11|13|15|19|20|21|30|38|49)\b/i;
const WALL_SECTIONS = ["exterior walls", "basement exterior", "party walls"];

// A selected section must be a complete known label, not a substring in arbitrary text.
export function normalizeSectionContext(value) {
  const label = String(value ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  return SECTION_PATTERNS.find(([, pattern]) => pattern.exec(label)?.[0] === label)?.[0] ?? null;
}

function cleanMaterial(value) {
  const match = String(value || "").match(MATERIAL_PATTERN);
  return match ? `R-${match[1]}` : null;
}

export function normalizeNumbers(input) {
  let text = String(input ?? "").toLowerCase();
  text = text
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-‑](one|two|three|four|five|six|seven|eight|nine)\b/g, "$1 $2")
    .replace(/\b(\d+)\s+(\d+)\s*\/\s*(\d+)\b/g, (_, whole, numerator, denominator) => {
      const divisor = Number(denominator);
      return divisor ? String(Number(whole) + Number(numerator) / divisor) : `${whole} ${numerator}/${denominator}`;
    })
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_, numerator, denominator) => {
      const divisor = Number(denominator);
      return divisor ? String(Number(numerator) / divisor) : `${numerator}/${denominator}`;
    })
    .replace(/\b(\d+(?:\.\d+)?)\s+and\s+(?:a\s+)?half\b/g, (_, whole) => String(Number(whole) + 0.5))
    .replace(/\b(?:a|one)\s+half\b/g, "0.5");
  const tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  text = text.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, ten, unit) => String(tens[ten] + NUMBER_WORDS[unit]));
  for (const [word, number] of Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), String(number));
  }
  return text
    .replace(/\b(\d+(?:\.\d+)?)\s+and\s+0\.5\b/g, (_, whole) => String(Number(whole) + 0.5))
    .replace(/\b(\d+(?:\.\d+)?)\s+and\s+(?:a\s+)?half\b/g, (_, whole) => String(Number(whole) + 0.5))
    .replace(/\b(\d+(?:\.\d+)?)\s*[-‑–]\s*(foot|feet|ft|inches?|in)\b/g, "$1 $2")
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:by|x|×|times)\s*(\d+(?:\.\d+)?)\b/g, "$1 x $2")
    .replace(/\b(16|24)\s*(?:inch(?:es)?|in\.?)?\s+or\s+(16|24)\s*(?:inch(?:es)?|in\.?)?\s*(?:on\s+center|at\s+center|centers?|o\.?c\.?)\b/g, "$1 oc or $2 oc")
    .replace(/\b(16|24)\s*[- ]?(?:inch(?:es)?|in\.?)?\s*(?:on\s+center|at\s+center|centers?|o\.?c\.?)\b/g, "$1 oc")
    .replace(/\b(on|at)\s+center\b/g, "oc")
    .replace(/\bfeet\b|\bfoot\b|\bft\.\b/g, "ft")
    .replace(/(\d+(?:\.\d+)?)\s*['’]/g, "$1 ft");
}

export function detectSection(input) {
  const text = String(input ?? "");
  return SECTION_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function extractDimensionPairs(text) {
  const pairPattern = /(\d+(?:\.\d+)?)\s*(?:ft\s*)?x\s*(\d+(?:\.\d+)?)(?:\s*ft)?/gi;
  const pairs = [];
  let match;
  while ((match = pairPattern.exec(text)) !== null) {
    pairs.push([Number(match[1]), Number(match[2])]);
  }
  return pairs;
}

function sumPairAreas(pairs) {
  return pairs.reduce((sum, [length, width]) => sum + length * width, 0);
}


function sectionScopedText(text, section) {
  const selectedPattern = SECTION_PATTERNS.find(([name]) => name === section)?.[1];
  if (!selectedPattern) return text;
  const selectedMatch = selectedPattern.exec(text);
  if (!selectedMatch) return text;
  const start = selectedMatch.index;
  const contentStart = start + selectedMatch[0].length;
  let end = text.length;
  for (const [name, pattern] of SECTION_PATTERNS) {
    if (name === section) continue;
    const next = pattern.exec(text.slice(contentStart));
    if (next) end = Math.min(end, contentStart + next.index);
  }
  return text.slice(start, end);
}

function parseWall(text, section, result) {
  const framingMatches = [...text.matchAll(/\b2\s*x\s*(4|6)\b/g)];
  const spacingMatches = [...text.matchAll(/\b(16|24)\s*(?:oc|o\.c\.)\b/g)];
  if (
    new Set(framingMatches.map(match => match[1])).size > 1 ||
    new Set(spacingMatches.map(match => match[1])).size > 1
  ) {
    result.requiresReview = true;
    result.message = "Conflicting framing or spacing details. Review the wall measurement before calculating.";
    return;
  }
  const framing = framingMatches[0];
  const spacing = spacingMatches[0];
  const height = text.match(/\b(8|9|10)\s*ft\b/);
  const bays = text.match(/\b(\d+(?:\.\d+)?)\s*bays?\b/)
    || text.match(/\b(?:bay\s+count|bays?)\s*(?:of\s*)?(\d+(?:\.\d+)?)\b/);

  if (framing && spacing && height && bays) {
    const values = {
      framing: `2x${framing[1]}`,
      spacing: Number(spacing[1]),
      height: Number(height[1]),
      bays: Number(bays[1])
    };
    result.parsed = { ...result.parsed, ...values, squareFeet: wallSquareFeet(values) };
    result.status = "calculated";
    result.message = `${result.parsed.squareFeet} sq ft calculated for ${section}.`;
    return;
  }

  const measurementText = framing ? text.replace(/\b2\s*x\s*(?:4|6)\b/, " ") : text;
  const pairs = extractDimensionPairs(measurementText);
  if (pairs.length) {
    const area = sumPairAreas(pairs);
    result.parsed = { ...result.parsed, dimensionPairs: pairs, squareFeet: area };
    result.status = "calculated";
    result.message = `${area} sq ft calculated.`;
    return;
  }

  result.status = "needs_review";
  result.message = "Section and material saved. Waiting for measurements, or review the entry.";
}

export function parseTranscript(rawTranscript, currentSection = null, currentMaterial = null) {
  const normalizedTranscript = normalizeNumbers(rawTranscript);
  const detectedSection = detectSection(normalizedTranscript);
  const wallMeasurement = /\bwalls?\b|\bbays?\b/.test(normalizedTranscript);
  const selectedSection = normalizeSectionContext(currentSection);
  // Generic wall wording cannot distinguish exterior, basement or party walls.
  // An incompatible current section is not reliable context for a wall takeoff.
  const section = detectedSection || (
    wallMeasurement && !WALL_SECTIONS.includes(selectedSection) ? null : selectedSection
  );
  const material = cleanMaterial(normalizedTranscript) || currentMaterial || null;
  const result = {
    rawTranscript: String(rawTranscript ?? ""),
    normalizedTranscript,
    section,
    status: "needs_review",
    requiresReview: false,
    parsed: material ? { material } : {},
    message: "Waiting for the section and measurements."
  };

  if (!section) {
    result.message = wallMeasurement
      ? "Choose the wall section: Exterior Walls, Basement Exterior, or Party Walls, then process this transcript again."
      : "Section not recognized. Choose a section before accepting this entry.";
    return result;
  }

  if (section === "baffles") {
    const baffleMatch = normalizedTranscript.match(/\b(\d+(?:\.\d+)?)\s*baffles?\b/i)
      || normalizedTranscript.match(/\bbaffles?\s*(\d+(?:\.\d+)?)\b/i);
    if (!baffleMatch) {
      result.message = "Baffle entry needs a piece count, for example: 16 baffles.";
      return result;
    }
    const quantity = Number(baffleMatch[1]);
    result.parsed = { material: "Baffles", quantity, unit: "pieces" };
    result.status = "calculated";
    result.message = `${quantity} baffles recorded as pieces.`;
    return result;
  }

  if (WALL_SECTIONS.includes(section)) {
    parseWall(sectionScopedText(normalizedTranscript, section), section, result);
    return result;
  }

  if (section === "band joists") {
    const measurementText = normalizedTranscript.replace(/\bR\s*[- ]?\s*(11|13|15|19|20|21|30|38|49)\b/ig, " ");
    const numbers = (measurementText.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const measurements = numbers;
    if (!measurements.length) {
      result.message = "Section and material saved. Waiting for band-joist measurements.";
      return result;
    }
    result.parsed = { ...result.parsed, measurements, squareFeet: bandJoistTotal(measurements) };
    result.status = "calculated";
    result.message = `${result.parsed.squareFeet} sq ft calculated.`;
    return result;
  }

  if (section === "attic") {
    const hasSprinklers = (
      /\b(?:with|has)\s+sprinklers?\b/.test(normalizedTranscript) ||
      /\bsprinkler\s+insulation\b/.test(normalizedTranscript)
    ) && !/\b(?:without|no)\s+sprinklers?\b/.test(normalizedTranscript);
    const pairs = extractDimensionPairs(normalizedTranscript);
    if (!pairs.length) {
      result.message = "Attic section saved. Waiting for length-by-width measurements.";
      return result;
    }
    const totals = atticTotals(pairs, hasSprinklers);
    result.parsed = { ...result.parsed, dimensionPairs: pairs, hasSprinklers, ...totals };
    result.status = "calculated";
    result.message = `${totals.area} sq ft attic area calculated.`;
    return result;
  }

  const pairs = extractDimensionPairs(normalizedTranscript);
  if (pairs.length) {
    const area = sumPairAreas(pairs);
    result.parsed = { ...result.parsed, dimensionPairs: pairs, squareFeet: area };
    result.status = "calculated";
    result.message = `${area} sq ft calculated.`;
    return result;
  }

  result.message = `Entry saved under ${section}; waiting for measurements or a configured quantity rule.`;
  return result;
}