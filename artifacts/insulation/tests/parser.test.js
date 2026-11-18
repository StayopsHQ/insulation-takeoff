import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNumbers, detectSection, parseTranscript } from "../src/parser.js";

test("number words normalize and measurements use feet", () => {
  assert.equal(normalizeNumbers("twenty four by eight feet"), "24 x 8 ft");
  assert.equal(normalizeNumbers("thirty two by twelve"), "32 x 12");
});

test("section recognition accepts exterior basement in either order", () => {
  assert.equal(detectSection("exterior basement"), "basement exterior");
  assert.equal(detectSection("basement exterior walls"), "basement exterior");
  assert.equal(detectSection("exterior walls"), "exterior walls");
});

test("spoken material is captured as R-value", () => {
  const result = parseTranscript("exterior basement R-19 24 by 8");
  assert.equal(result.section, "basement exterior");
  assert.equal(result.parsed.material, "R-19");
  assert.equal(result.parsed.squareFeet, 192);
  assert.equal(result.requiresReview, false);
  assert.equal(result.message, "192 sq ft calculated.");
});

test("multiple dimension pairs are added, not multiplied together", () => {
  const result = parseTranscript("exterior basement R19 24 by 8 and 32 by 8");
  assert.equal(result.parsed.squareFeet, 448);
  assert.deepEqual(result.parsed.dimensionPairs, [[24, 8], [32, 8]]);
});

test("section-only utterance stores context for following measurement utterance", () => {
  const section = parseTranscript("exterior basement R-19");
  assert.equal(section.status, "needs_review");
  assert.equal(section.requiresReview, false);
  const measurement = parseTranscript("24 by 8 and 32 by 8", section.section, section.parsed.material);
  assert.equal(measurement.section, "basement exterior");
  assert.equal(measurement.parsed.material, "R-19");
  assert.equal(measurement.parsed.squareFeet, 448);
});

test("measurement utterance can inherit section when material is not spoken again", () => {
  const result = parseTranscript("24 by 8", "basement exterior", "R-19");
  assert.equal(result.parsed.material, "R-19");
  assert.equal(result.parsed.squareFeet, 192);
});

test("wall bay rule remains available when full wall details are spoken", () => {
  const result = parseTranscript("exterior walls 2 by 4, 16 on center, 8 foot, 12 bays");
  assert.equal(result.parsed.squareFeet, 120);
});

const WALL_DICTATION = "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center";

test("the reported wall dictation inherits the selected exterior-wall section", () => {
  const result = parseTranscript(WALL_DICTATION, "exterior walls");
  assert.equal(result.rawTranscript, WALL_DICTATION);
  assert.equal(result.section, "exterior walls");
  assert.equal(result.status, "calculated");
  assert.equal(result.requiresReview, false);
  assert.deepEqual(result.parsed, { framing: "2x6", spacing: 16, height: 9, bays: 20, squareFeet: 220 });
});

test("selected section labels are canonicalized instead of treating framing as rectangle dimensions", () => {
  for (const section of ["Exterior Walls", " EXTERIOR   WALLS ", "exterior-walls", "Exterior Wall"]) {
    const result = parseTranscript(WALL_DICTATION, section, "R-19");
    assert.equal(result.section, "exterior walls", section);
    assert.equal(result.parsed.material, "R-19");
    assert.equal(result.parsed.squareFeet, 220);
    assert.equal(result.parsed.dimensionPairs, undefined);
  }
});

test("natural wall wording supports compact framing, hyphenated height and spoken numbers", () => {
  for (const phrase of [
    "Wall measurements, 20 bays, 2x6, 9-foot wall, 16 on center",
    "Wall measurements twenty bays two by six nine-foot wall sixteen inch centers",
    "20 bays, 2 × 6, 9 foot walls, 16 inch on center",
    "Wall measurements 20 bays 2 by 6 9 feet high 16 OC",
    "Wall measurements, bay count 20, 2 by 6, 9-foot wall, 16-inch centers",
    "Wall measurements, bays 20, 2x6, 9-foot wall, 16 on center"
  ]) {
    const result = parseTranscript(phrase, "Exterior Walls");
    assert.equal(result.rawTranscript, phrase);
    assert.equal(result.status, "calculated", phrase);
    assert.deepEqual(result.parsed, { framing: "2x6", spacing: 16, height: 9, bays: 20, squareFeet: 220 }, phrase);
  }
});

test("wall dictation never guesses exterior walls without reliable section context", () => {
  for (const section of [null, "", "Choose section…", "unknown", "not exterior walls", "attic"]) {
    const result = parseTranscript(WALL_DICTATION, section);
    assert.equal(result.section, null, String(section));
    assert.equal(result.status, "needs_review");
    assert.equal(result.parsed.squareFeet, undefined);
    assert.match(result.message, /choose.*wall section/i);
  }
  assert.equal(detectSection(WALL_DICTATION), null);
});

test("a spoken named section overrides selection and wall contexts retain their original rules", () => {
  for (const section of ["Basement Exterior", "Party Walls"]) {
    const result = parseTranscript(WALL_DICTATION, section);
    assert.equal(result.section, section.toLowerCase());
    assert.equal(result.parsed.squareFeet, 220);
  }
  const explicit = parseTranscript("Party walls 20 bays 2x6 9-foot wall 24 on center", "Exterior Walls");
  assert.equal(explicit.section, "party walls");
  assert.equal(explicit.parsed.squareFeet, 360);
  const spokenSpacing = parseTranscript("Wall measurements 20 bays 2x6 nine-foot wall twenty-four-inch centers", "Exterior Walls");
  assert.equal(spokenSpacing.parsed.spacing, 24);
  assert.equal(spokenSpacing.parsed.squareFeet, 360);
});

test("unknown section remains unassigned for review", () => {
  const result = parseTranscript("24 by 8");
  assert.equal(result.status, "needs_review");
  assert.equal(result.section, null);
  assert.equal(result.requiresReview, false);
});


test("baffles are counted as pieces, not square feet", () => {
  const result = parseTranscript("16 baffles");
  assert.equal(result.section, "baffles");
  assert.equal(result.status, "calculated");
  assert.deepEqual(result.parsed, { material: "Baffles", quantity: 16, unit: "pieces" });
});

test("baffle count can follow the section name", () => {
  const result = parseTranscript("baffles 12");
  assert.equal(result.status, "calculated");
  assert.equal(result.parsed.quantity, 12);
  assert.equal(result.parsed.unit, "pieces");
});

test("spoken material is retained for later measurements", () => {
  const section = parseTranscript("exterior basement R19");
  const measurement = parseTranscript("24 by 8 and 32 by 8", section.section, section.parsed.material);
  assert.equal(measurement.section, "basement exterior");
  assert.equal(measurement.parsed.material, "R-19");
  assert.equal(measurement.parsed.squareFeet, 448);
});

test("band-joist parsing keeps measurements that equal neither nor depend on the R-value", () => {
  const result = parseTranscript("band joists R-19 19 and 24");
  assert.equal(result.parsed.material, "R-19");
  assert.deepEqual(result.parsed.measurements, [19, 24]);
  assert.equal(result.parsed.squareFeet, (19 + 24) * 4 * 1.25);
});

test("construction spacing phrases normalize inch centers for wall parsing", () => {
  const result = parseTranscript("exterior walls 2 by 4, 16 inch centers, 8 foot, 12 bays");
  assert.equal(result.parsed.framing, "2x4");
  assert.equal(result.parsed.spacing, 16);
  assert.equal(result.parsed.squareFeet, 120);
});

test("fractional dimensions are normalized without changing area rules", () => {
  const result = parseTranscript("exterior basement 24 and a half by 8");
  assert.deepEqual(result.parsed.dimensionPairs, [[24.5, 8]]);
  assert.equal(result.parsed.squareFeet, 196);
  assert.equal(normalizeNumbers("twenty four and a half by eight"), "24.5 x 8");
});

test("twenty-four-inch centers and 2x6 framing use the existing wall formula", () => {
  const result = parseTranscript("exterior walls 2 by 6, 24 inch OC, 8 foot, 12 bays");
  assert.equal(result.parsed.framing, "2x6");
  assert.equal(result.parsed.spacing, 24);
  assert.equal(result.parsed.squareFeet, 192);
});

test("incomplete framing details are not mistaken for a 2x4 or 2x6 area", () => {
  const result = parseTranscript("exterior walls 2 by 6");
  assert.equal(result.status, "needs_review");
  assert.equal(result.parsed.squareFeet, undefined);
});

test("conflicting framing or center spacing is held for review", () => {
  const framing = parseTranscript("exterior walls 2 by 4 or 2 by 6, 16 on center, 8 foot, 12 bays");
  const spacing = parseTranscript("exterior walls 2 by 4, 16 or 24 inch centers, 8 foot, 12 bays");
  assert.equal(framing.status, "needs_review");
  assert.equal(framing.requiresReview, true);
  assert.equal(framing.parsed.squareFeet, undefined);
  assert.equal(spacing.status, "needs_review");
  assert.equal(spacing.requiresReview, true);
  assert.equal(spacing.parsed.squareFeet, undefined);
});

test("sprinkler insulation phrase uses the existing attic split", () => {
  const result = parseTranscript("sprinkler insulation 20 by 10");
  assert.equal(result.section, "attic");
  assert.equal(result.parsed.area, 200);
  assert.equal(result.parsed.sprinklerInsulation, 60);
  assert.equal(result.parsed.blownInsulation, 140);
});

test("construction section names remain detectable", () => {
  for (const [phrase, section] of [
    ["party walls", "party walls"],
    ["band joists", "band joists"],
    ["batt ceilings", "batt ceilings"],
    ["slopes", "slopes"],
    ["basement exterior walls", "basement exterior"]
  ]) {
    assert.equal(detectSection(phrase), section);
  }
});

test("basement wall calculation uses its own bays and height, not earlier exterior wall details", () => {
  const transcript = "Start a new job. Exterior walls, 24 bays, 2x4, 16 inches on center, 9-foot walls. Basement exterior walls, 12 bays, 2x4, 16 inches on center, 8-foot walls. Attic, 30 by 40, with sprinklers. Actually, correction on the exterior walls. I said 24 bays, but make that 28 bays. Keep everything else the same.";
  const result = parseTranscript(transcript);
  assert.equal(result.section, "basement exterior");
  assert.equal(result.parsed.bays, 12);
  assert.equal(result.parsed.height, 8);
  assert.equal(result.parsed.spacing, 16);
  assert.equal(result.parsed.squareFeet, 120);
});
