import test from "node:test";
import assert from "node:assert/strict";
import {
  wallSquareFeet, partyWallTotals, bandJoistTotal, atticTotals,
  rectangleArea, layeredMaterialCoverage
} from "../src/calculations.js";

test("wall multipliers match the documented table", () => {
  assert.equal(wallSquareFeet({ bays: 10, height: 8, spacing: 16 }), 100);
  assert.equal(wallSquareFeet({ bays: 10, height: 9, spacing: 24 }), 180);
  assert.equal(wallSquareFeet({ bays: 10, height: 10, spacing: 24 }), 200);
});

test("unsupported wall combinations are rejected", () => {
  assert.throws(() => wallSquareFeet({ bays: 3, height: 11, spacing: 16 }));
});

test("party walls roll up by height", () => {
  assert.deepEqual(partyWallTotals([
    { bays: 2, height: 8, spacing: 16 },
    { bays: 3, height: 9, spacing: 24 }
  ]), { 8: 20, 9: 54, 10: 0 });
});

test("band joist formula is sum times four times 1.25", () => {
  assert.equal(bandJoistTotal([10, 20]), 150);
});

test("attic sprinkler split is 30/70", () => {
  assert.deepEqual(atticTotals([[10, 20], [5, 10]], true), {
    area: 250, baffles: 15, sprinklerInsulation: 75, blownInsulation: 175
  });
});

test("attic without sprinklers assigns all area to blown insulation", () => {
  assert.equal(atticTotals([[10, 20]], false).blownInsulation, 200);
});

test("rectangle and layered coverage", () => {
  assert.equal(rectangleArea([10, 20]), 200);
  assert.equal(layeredMaterialCoverage(200, 2), 400);
});

test("negative or non-finite dimensions are rejected", () => {
  assert.throws(() => rectangleArea([10, -2]));
  assert.throws(() => bandJoistTotal([NaN]));
});