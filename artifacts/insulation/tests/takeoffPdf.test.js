import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createCompletedTakeoffPdf, prepareTakeoffFormData, prepareOriginalFormRows } from "../src/takeoffPdf.js";
import { parseTranscript } from "../src/parser.js";
import { resolveFormRow } from "../src/takeoffFormRows.js";

const template = new Uint8Array(await readFile(new URL("../public/takeoff-form.pdf", import.meta.url)));

test("reviewed values are prepared from parsed results without guessing missing quantities", () => {
  const data = prepareTakeoffFormData({
    date: new Date("2026-11-18T12:00:00.000Z"),
    job: { name: "Linden Ct", lot: "28", subdivision: "North Valley", address: "123 Linden Ct" },
    entries: [
      {
        section: "exterior walls",
        rawTranscript: "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center",
        status: "calculated",
        parsed: { bays: 20, framing: "2x6", height: 9, spacing: 16, squareFeet: 220 }
      },
      {
        section: "caulk",
        rawTranscript: "caulk around window",
        status: "needs_review",
        parsed: {}
      },
      {
        section: "foam",
        rawTranscript: "foam around opening",
        status: "needs_review",
        parsed: { manualQuantity: 12, manualUnit: "linear ft" }
      }
    ]
  });

  assert.deepEqual(data.headers, {
    date: "11/18/2026",
    lot: "28",
    customer: "",
    subdivision: "North Valley",
    address: "123 Linden Ct"
  });
  assert.deepEqual(data.entries, [
    { section: "exterior walls", measurements: "20 bays / 2x6 / 9 ft / 16 OC", quantity: "220 sq ft" },
    { section: "caulk", measurements: "caulk around window", quantity: "Not calculated" },
    { section: "foam", measurements: "foam around opening", quantity: "12 linear ft (manual)" }
  ]);
  assert.equal(data.uncalculatedCount, 1);
});

test("the completed output keeps the exact original two-page PDF template", async () => {
  const output = await createCompletedTakeoffPdf(template, {
    date: new Date("2026-11-18T12:00:00.000Z"),
    job: { name: "Linden Ct", lot: "28", subdivision: "North Valley", address: "123 Linden Ct" },
    entries: [{
      section: "exterior walls",
      rawTranscript: "Wall measurements 20 bays 2 x 6 9 foot wall 16 on center",
      status: "calculated",
      parsed: { bays: 20, framing: "2x6", height: 9, spacing: 16, squareFeet: 220, formMaterialId: "ext-r19-15k-9ft" }
    }]
  });
  const original = await PDFDocument.load(template);
  const completed = await PDFDocument.load(output);

  assert.equal(original.getPageCount(), 2);
  assert.equal(completed.getPageCount(), 2);
  assert.deepEqual(
    completed.getPages().map(page => [page.getWidth(), page.getHeight()]),
    original.getPages().map(page => [page.getWidth(), page.getHeight()])
  );
  assert.notEqual(
    Buffer.compare(Buffer.from(output), Buffer.from(template)),
    0,
    "the completed PDF contains new overlays while preserving the two source pages"
  );
  const contents = completed.context.enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFRawStream)
    .flatMap(([, object]) => {
      try { return [Buffer.from(decodePDFRawStream(object).decode()).toString()]; } catch { return []; }
    }).join("\n");
  assert.doesNotMatch(contents, /5245564945574544204[Dd]4541535552454[Dd]454[Ee]5453/, "no Reviewed Measurements report is appended");
  assert.match(contents, /314 .* Tm/, "measurements are written in the existing measurement column");
  assert.match(contents, /491 .* Tm/, "confirmed quantities are written in Total Footage");
  for (const [reference, object] of original.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const retained = completed.context.lookup(reference);
    assert.ok(retained instanceof PDFRawStream);
    assert.equal(Buffer.compare(Buffer.from(object.contents), Buffer.from(retained.contents)), 0, "the original printed content is unchanged");
  }
});

test("PDF generation rejects empty takeoffs and entries that cannot fit without omission", async () => {
  await assert.rejects(createCompletedTakeoffPdf(template, { entries: [] }), /at least one measurement/i);
  const tooMany = Array.from({ length: 33 }, () => ({
    section: "slopes", status: "calculated", parsed: {
      dimensionPairs: [[22,14]], squareFeet: 385, slopeFactors: [1.25], formMaterialId: "slopes-r38-16k"
    }
  }));
  await assert.rejects(createCompletedTakeoffPdf(template, { entries: tooMany }), /too long to fit on the original form/);
});

test("the bundled template is exactly the original upload", async () => {
  const upload = await readFile(new URL("../../../attached_assets/0_Insulation_Take_Off_Sheet_1794972701867.pdf", import.meta.url));
  assert.equal(Buffer.compare(Buffer.from(template), upload), 0);
});

test("confirmed slopes fill the printed slope row, retain factors, and sum only calculated results", () => {
  const entries = [
    "Slopes 22 by 14 with a 1.25 factor",
    "Slopes 16 by 11 with a 1.25 factor",
    "Slopes 18 by 12"
  ].map(text => {
    const entry = parseTranscript(text);
    entry.parsed.formMaterialId = "slopes-r38-16k";
    return entry;
  });
  const rows = prepareOriginalFormRows(entries);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row.page, 0);
  assert.equal(rows[0].row.top, 634.68);
  assert.equal(rows[0].quantity, 821);
  assert.match(rows[0].measurements[0], /x 1.25/);
  assert.match(rows[0].measurements[1], /x 1.25/);
  assert.doesNotMatch(rows[0].measurements[2], /1.25/);
});

test("unknown material and unconfirmed quantities never populate an arbitrary original row", async () => {
  const entry = parseTranscript("Slopes 18 by 12 R38");
  assert.equal(resolveFormRow(entry), null);
  await assert.rejects(createCompletedTakeoffPdf(template, {entries:[entry]}), /Choose the exact original form material row/);
  await assert.rejects(createCompletedTakeoffPdf(template, {entries:[{section:"caulk",parsed:{}}]}), /Review the quantity/);
});

test("attic split quantities require an explicit sprinkler material and fill the original two locations", () => {
  const entry = parseTranscript("Attic R38 with sprinklers 20 by 10");
  assert.throws(() => prepareOriginalFormRows([entry]), /Choose the sprinkler material/);
  entry.parsed.sprinklerFormMaterial = "R-49";
  const rows = prepareOriginalFormRows([entry]);
  assert.equal(rows.find(item => item.row.id === "blown-r38").quantity, 140);
  assert.equal(rows.find(item => item.row.id === "other-sprinkler-prep").quantity, 60);
  assert.deepEqual(rows.find(item => item.row.id === "other-sprinkler-prep").sprinklerQuantities, {"R-49":60});
});
