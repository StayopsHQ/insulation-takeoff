export const WALL_MULTIPLIERS = Object.freeze({
  8: Object.freeze({ 16: 10, 24: 16 }),
  9: Object.freeze({ 16: 11, 24: 18 }),
  10: Object.freeze({ 16: 12, 24: 20 })
});

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a finite, non-negative number.`);
  }
  return number;
}

export function wallSquareFeet({ bays, height, spacing }) {
  const count = finiteNumber(bays, "Bay count");
  const multiplier = WALL_MULTIPLIERS[Number(height)]?.[Number(spacing)];
  if (!multiplier) throw new Error("Unsupported wall height or spacing.");
  return count * multiplier;
}

export function partyWallTotals(entries = []) {
  const totals = { 8: 0, 9: 0, 10: 0 };
  for (const entry of entries) {
    const height = Number(entry.height);
    if (!(height in totals)) throw new Error(`Unsupported party-wall height: ${height}`);
    totals[height] += wallSquareFeet(entry);
  }
  return totals;
}

export function bandJoistTotal(measurements = []) {
  return measurements.reduce((sum, value) => sum + finiteNumber(value, "Band-joist measurement"), 0) * 4 * 1.25;
}

export function atticTotals(dimensionPairs = [], hasSprinklers = false) {
  const area = dimensionPairs.reduce((sum, pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error("Each attic area needs two dimensions.");
    return sum + finiteNumber(pair[0], "Attic length") * finiteNumber(pair[1], "Attic width");
  }, 0);
  const baffles = dimensionPairs.reduce((sum, pair) => sum + finiteNumber(pair[0], "Baffle dimension"), 0);
  return {
    area,
    baffles,
    sprinklerInsulation: hasSprinklers ? area * 0.30 : 0,
    blownInsulation: hasSprinklers ? area * 0.70 : area
  };
}

export function rectangleArea(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2) {
    throw new Error("At least two dimensions are required.");
  }
  return dimensions.reduce((area, value) => area * finiteNumber(value, "Dimension"), 1);
}

export function layeredMaterialCoverage(area, layers = 1) {
  return finiteNumber(area, "Area") * finiteNumber(layers, "Layer count");
}