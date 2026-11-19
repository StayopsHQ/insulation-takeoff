// Reproduces the supplied screenshot description: Band Joists must not swallow
// "first floor walls ... 26 bays ... in the basement ... 30 bays".
// The screenshot's complete verbatim transcript was not attached to the request.
export const MULTI_AREA_TRANSCRIPT = `Start job 247. Band joists 12, 16, and 20, and then first floor walls 26 bays, two-by-four, sixteen-inch centers, nine-foot walls. And then in the basement 30 bays, two-by-four, sixteen-inch centers, eight-foot walls. Unfinished area 14 bays, two-by-six, twenty-four-inch centers, ten-foot walls. Correction, make that 12 bays, not 14. And then garage ceiling 20 by 22 and then 18 by 10. Another exterior wall section 12 bays, two-by-six, twenty-four-inch centers, ten-foot walls, 8 bays, two-by-four, sixteen-inch centers, nine-foot walls. Correction, make that 9 bays, not 8. Attic 32 by 42 with sprinklers and then 18 by 24 no sprinklers. Slopes 22 by 14 with a one-point-two-five factor. First floor walls 6 bays, two-by-four, sixteen-inch centers, nine-foot walls. Another.`;

export const MULTI_AREA_EXPECTED = [
  ["band joists", 240], ["exterior walls", 286], ["basement exterior", 300],
  ["basement exterior", 240], ["garage ceiling", 440], ["garage ceiling", 180],
  ["exterior walls", 240], ["exterior walls", 99], ["attic", 1344], ["attic", 432],
  ["slopes", 385], ["exterior walls", 66]
];
