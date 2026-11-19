// Presentation metadata only; quantities remain owned by takeoffTotals.
import { isExteriorWallMeasurement } from "./calculations.js";
export function derivedApplicability(entries = []) {
  const valid = entry => entry.status === "calculated" && !entry.requiresReview;
  const attic = entries.filter(entry => entry.section === "attic");
  const caulk = entries.filter(isExteriorWallMeasurement);
  return {
    hasArea: entries.some(entry => valid(entry) && !["caulk", "foam", "baffles"].includes(entry.section)),
    hasAttic: attic.length > 0,
    hasCalculatedAttic: attic.some(entry => valid(entry) && entry.parsed?.dimensionPairs?.length),
    hasCaulkSource: caulk.length > 0,
    hasCalculatedCaulkSource: caulk.some(valid)
  };
}
