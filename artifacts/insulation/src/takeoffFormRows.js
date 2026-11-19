import { MATERIAL_CATALOG } from "./materialCatalog.js";
import { normalizeSectionContext } from "./parser.js";

// Coordinates from the uploaded original, in PDF points measured from page top.
const GROUPS = [
  ["Blown", 0, [177.18, 189.93, 202.68, 215.43]],
  ["Exterior Walls", 0, [231.93, 244.68, 257.43, 270.18, 282.93, 295.68, 308.43, 321.18, 333.18, 345.93, 358.68, 371.43, 384.18, 396.93]],
  ["BJ", 0, [414.18, 426.93, 438.93]],
  ["Basement Ext. Walls", 0, [456.18, 468.93, 481.68, 494.43]],
  ["Party Walls", 0, [511.68, 524.43, 537.18]],
  ["Batt Ceilings (CAFLAT)", 0, [553.68, 566.43, 579.18, 591.93, 604.68, 617.43]],
  ["Slopes", 0, [634.68, 647.43, 659.43, 672.18]],
  ["Garage Ceiling (GACA)", 1, [195.18, 207.93, 220.68, 233.43, 245.43, 258.18, 270.93]],
  ["Other", 1, [288.18, 300.93, 313.68, 326.43, 339.18, 351.18, 363.93]]
];
export const TAKEOFF_FORM_ROWS = GROUPS.flatMap(([section, page, tops]) => {
  const materials = MATERIAL_CATALOG.filter(row => row.section === section);
  if (materials.length !== tops.length) throw new Error(`Original PDF row mapping mismatch: ${section}`);
  return materials.map((row, index) => ({ ...row, page, top: tops[index] }));
});
const SECTION_GROUPS = {
  attic: "Blown", "exterior walls": "Exterior Walls", "basement exterior": "Basement Ext. Walls",
  "party walls": "Party Walls", "band joists": "BJ", "batt ceilings": "Batt Ceilings (CAFLAT)",
  slopes: "Slopes", "garage ceiling": "Garage Ceiling (GACA)"
};
export function formRowChoices(entry) {
  const section = normalizeSectionContext(entry.section);
  if (section === "baffles") return TAKEOFF_FORM_ROWS.filter(row => row.id === "batt-baffles");
  if (section === "caulk") return TAKEOFF_FORM_ROWS.filter(row => row.id === "other-caulk");
  if (section === "foam") return TAKEOFF_FORM_ROWS.filter(row => row.id === "other-foam-sealant");
  const group = SECTION_GROUPS[section];
  return TAKEOFF_FORM_ROWS.filter(row => !group || row.section === group);
}
const normalizedLabel = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function resolveFormRow(entry) {
  const choices = formRowChoices(entry);
  const id = entry.parsed?.formMaterialId;
  if (id) return choices.find(row => row.id === id) || null;
  if (choices.length === 1) return choices[0];
  const material = entry.parsed?.material;
  if (!material) return null;
  const exact = choices.filter(row => normalizedLabel(row.material) === normalizedLabel(material));
  if (exact.length === 1) return exact[0];
  const rValue = /^R-?(\d+)$/i.exec(material)?.[1];
  const matching = rValue ? choices.filter(row => new RegExp(`^R-?${rValue}(?:\\D|$)`, "i").test(row.material)) : [];
  return matching.length === 1 ? matching[0] : null;
}
