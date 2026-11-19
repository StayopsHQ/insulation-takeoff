export const ACCEPTANCE_TRANSCRIPT = "Start job 247. Exterior walls: 24 bays, two-by-four, sixteen-inch centers, nine-foot walls. Correction, make that 29 bays, not 24. Add another exterior wall section, 12 bays, two-by-six, twenty-four-inch centers, ten-foot walls. Basement exterior walls: 15 bays, two-by-four, sixteen-inch centers, eight-foot walls. Correction, make that 13 bays. Attic: 32 by 42, with sprinklers. Another attic measurement: 18 by 24, no sprinklers. Slopes: 22 by 14 with a one-point-two-five factor. Another slope, 18 by 12, no factor. Another slope, 16 by 11 with a one-point-two-five factor. Band joists: 12, 16, and 20. Calculate baffles from the first dimension of each attic measurement. Use the confirmed caulk and foam rules. Do not include attic, slopes, or party walls in caulk calculations. Review all corrections before calculating the final totals.";

// Deliberate TEST selections, not products inferred from the dictated transcript.
export const ACCEPTANCE_FORM_MATERIALS = [
  "ext-r13-15-2x9-fb", "ext-r19-23k", "basement-r13-15k",
  "blown-r38", "blown-r38",
  "slopes-r38-16k", "slopes-r38-16k", "slopes-r38-16k",
  "bj-r19-15-25-unfaced"
];
