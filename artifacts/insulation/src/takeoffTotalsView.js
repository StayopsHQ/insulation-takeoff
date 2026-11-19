import { takeoffTotals } from "./calculations.js";
import { derivedApplicability } from "./derivedApplicability.js";

export function renderTakeoffTotals(entries, complete = true) {
  const totals = takeoffTotals(entries);
  const applicable = derivedApplicability(entries);
  const number = value => String(Number(value.toFixed(6)));
  const baffles = applicable.hasCalculatedAttic ? `${number(totals.bafflesLF)} LF`
    : applicable.hasAttic ? "Pending attic review" : "Not applicable";
  const caulkValue = (value, unit) => applicable.hasCalculatedCaulkSource ? `${number(value)} ${unit}`
    : applicable.hasCaulkSource ? "Pending measurement review" : "Not applicable";
  return `<section class="takeoff-totals" aria-label="Calculated takeoff totals">
    <h4>${complete ? "Calculated takeoff totals" : "Provisional takeoff totals"}</h4>
    ${complete ? "" : "<p>Resolve remaining measurements and corrections before these totals are final.</p>"}
    <dl>
      <dt>Total measured area</dt><dd data-total="area">${applicable.hasArea ? `${number(totals.totalMeasuredArea)} SF` : "—"}</dd>
      <dt>Baffles</dt><dd data-total="baffles">${baffles}</dd>
      <dt>Exterior wall area</dt><dd data-total="exterior-wall-area">${caulkValue(totals.exteriorWallSF, "SF")}</dd>
      <dt>Caulk</dt><dd data-total="caulk">${caulkValue(totals.caulkTubes, "tubes")}</dd>
      <dt>Foam</dt><dd data-total="foam">${caulkValue(totals.foamUnits, "units")}</dd>
    </dl>
    <small>Derived quantities apply only to relevant measurements.
      ${applicable.hasCaulkSource ? "Caulk tubes = total exterior wall SF ÷ 50. Basement exterior walls, band joists, unfinished areas and all other sections are excluded. Foam = 25% of caulk tubes." : ""}
      ${applicable.hasAttic ? "Baffles sum the first attic dimensions. Sprinkler/blown allocations are already included in attic area." : ""}</small>
  </section>`;
}
