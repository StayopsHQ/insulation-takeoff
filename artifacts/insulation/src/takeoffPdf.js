import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { resolveFormRow, TAKEOFF_FORM_ROWS } from "./takeoffFormRows.js";
import { takeoffTotals } from "./calculations.js";


function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayNumber(value) {
  const number = asNumber(value);
  return number == null ? "" : String(Number(number.toFixed(6)));
}

function formatMeasurements(entry) {
  const parsed = entry.parsed || {};
  const parts = [];

  if (parsed.bays != null) parts.push(`${displayNumber(parsed.bays)} bays`);
  if (parsed.framing) parts.push(String(parsed.framing));
  if (parsed.height != null) parts.push(`${displayNumber(parsed.height)} ft`);
  if (parsed.spacing != null) parts.push(`${displayNumber(parsed.spacing)} OC`);
  if (Array.isArray(parsed.dimensionPairs) && parsed.dimensionPairs.length) {
    parts.push(parsed.dimensionPairs
      .map((pair, index) => `${displayNumber(pair?.[0])} x ${displayNumber(pair?.[1])} ft${parsed.slopeFactors?.[index] != null ? ` x ${displayNumber(parsed.slopeFactors[index])} factor` : ""}`)
      .join("; "));
  }
  if (Array.isArray(parsed.measurements) && parsed.measurements.length) {
    parts.push(`Measurements: ${parsed.measurements.map(displayNumber).join(", ")}`);
  }
  if (parsed.area != null) parts.push(`Area ${displayNumber(parsed.area)} sq ft`);
  if (parsed.blownInsulation != null) parts.push(`Blown ${displayNumber(parsed.blownInsulation)} sq ft`);
  if (parsed.sprinklerInsulation != null) parts.push(`Sprinkler ${displayNumber(parsed.sprinklerInsulation)} sq ft`);
  if (parts.length) return parts.join(" / ");

  return String(entry.rawTranscript || entry.message || "No measurement details entered").replace(/\s+/g, " ").trim();
}

function formatQuantity(entry) {
  const parsed = entry.parsed || {};
  if (parsed.manualQuantity != null) {
    return `${displayNumber(parsed.manualQuantity)} ${parsed.manualUnit || "units"} (manual)`;
  }
  if (parsed.blownInsulation != null || parsed.sprinklerInsulation != null) {
    return `${displayNumber(parsed.blownInsulation || 0)} + ${displayNumber(parsed.sprinklerInsulation || 0)} sq ft`;
  }
  if (parsed.squareFeet != null) return `${displayNumber(parsed.squareFeet)} sq ft`;
  if (parsed.area != null) return `${displayNumber(parsed.area)} sq ft`;
  if (parsed.quantity != null) return `${displayNumber(parsed.quantity)} ${parsed.unit || ""}`.trim();
  return entry.status === "calculated" ? "Review quantity" : "Not calculated";
}

export function prepareTakeoffFormData({ job = {}, entries = [], date = new Date() } = {}) {
  return {
    headers: {
      date: date instanceof Date ? date.toLocaleDateString("en-US") : String(date || ""),
      lot: job.lot || "",
      customer: job.customerName || job.customer || "",
      subdivision: job.subdivision || "",
      address: job.address || ""
    },
    entries: entries.map(entry => ({
      section: String(entry.section || "Unassigned"),
      measurements: formatMeasurements(entry),
      quantity: formatQuantity(entry)
    })),
    uncalculatedCount: entries.filter(entry => {
      const parsed = entry.parsed || {};
      return parsed.squareFeet == null && parsed.area == null
        && parsed.quantity == null && parsed.blownInsulation == null
        && parsed.sprinklerInsulation == null && parsed.manualQuantity == null;
    }).length
  };
}

function fitText(font, text, maxWidth, startingSize, minimumSize = 5.2) {
  let value = String(text ?? "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[·•]/g, "/")
    .replace(/[^\x20-\xFF]/g, " ");
  value = value.replace(/\s+/g, " ").trim();
  let size = startingSize;
  while (size > minimumSize && font.widthOfTextAtSize(value, size) > maxWidth) size -= 0.2;
  if (font.widthOfTextAtSize(value, size) > maxWidth) {
    throw new Error("A value is too long to fit on the original form. Shorten it or split the measurement into separate entries; nothing was omitted.");
  }
  return { text: value, size };
}

function drawTopText(page, font, text, x, top, maxWidth, size = 8, color = rgb(0.05, 0.13, 0.22)) {
  const fitted = fitText(font, text, maxWidth, size);
  if (!fitted.text) return;
  page.drawText(fitted.text, {
    x,
    y: page.getHeight() - top - fitted.size,
    size: fitted.size,
    font,
    color
  });
}

function writeHeader(page, font, headers, topOffset = 0) {
  drawTopText(page, font, headers.date, 75, 52.7 + topOffset, 190, 7.5);
  drawTopText(page, font, headers.lot, 320, 52.7 + topOffset, 110, 7.5);
  drawTopText(page, font, headers.subdivision, 330, 65.4 + topOffset, 215, 7.5);
  drawTopText(page, font, headers.customer, 103, 78.2 + topOffset, 170, 7.5);
  drawTopText(page, font, headers.address, 75, 90.9 + topOffset, 200, 7.5);
}

export function prepareOriginalFormRows(entries) {
  const totals = takeoffTotals(entries);
  const derived = [
    { section: "baffles", id: "batt-baffles", quantity: totals.bafflesLF, unit: "LF",
      text: `${entries.filter(entry => entry.section === "attic" && entry.status === "calculated" && !entry.requiresReview).flatMap(entry => entry.parsed?.dimensionPairs?.map(pair => displayNumber(pair[0])) || []).join(" + ")} LF` },
    { section: "caulk", id: "other-caulk", quantity: totals.caulkTubes, unit: "tubes",
      text: `Exterior walls ${displayNumber(totals.exteriorWallSF)} SF / 50 = ${displayNumber(totals.caulkTubes)} tubes` },
    { section: "foam", id: "other-foam-sealant", quantity: totals.foamUnits, unit: "units",
      text: `${displayNumber(totals.caulkTubes)} tubes x 25% = ${displayNumber(totals.foamUnits)} units` }
  ].filter(item => item.quantity > 0 && !entries.some(entry =>
    entry.section === item.section || resolveFormRow(entry)?.id === item.id))
    .map(item => ({ section: item.section, status: "calculated", parsed: {
      formMaterialId: item.id, quantity: item.quantity, unit: item.unit,
      derivedFormText: item.text
    } }));
  const groups = new Map();
  for (const entry of [...entries, ...derived]) {
    if ((entry.status !== "calculated" || entry.requiresReview) && entry.parsed?.manualQuantity == null) {
      throw new Error(`Review the quantity for ${entry.section || "this measurement"}. No unconfirmed quantity was placed on the form.`);
    }
    const row = resolveFormRow(entry);
    if (!row) throw new Error(`Choose the exact original form material row for ${entry.section || "this measurement"} before finishing. No material was guessed.`);
    const parsed = entry.parsed || {};
    const quantity = parsed.manualQuantity ?? parsed.squareFeet ?? parsed.area ?? parsed.quantity ?? parsed.blownInsulation;
    if (quantity == null || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) {
      throw new Error(`Review the quantity for ${entry.section}. No unconfirmed quantity was placed on the form.`);
    }
    if (parsed.sprinklerInsulation > 0) {
      if (!["R-38", "R-49"].includes(parsed.sprinklerFormMaterial)) {
        throw new Error("Choose the sprinkler material (R-38 or R-49) for the original form before finishing. No material was guessed.");
      }
      const prep = groups.get("other-sprinkler-prep") || {
        row: TAKEOFF_FORM_ROWS.find(row => row.id === "other-sprinkler-prep"),
        measurements: [], quantity: 0, unit: "sq ft", sprinklerQuantities: {}
      };
      prep.sprinklerQuantities[parsed.sprinklerFormMaterial] = (prep.sprinklerQuantities[parsed.sprinklerFormMaterial] || 0) + parsed.sprinklerInsulation;
      prep.quantity += parsed.sprinklerInsulation;
      groups.set(prep.row.id, prep);
    }
    const unit = parsed.manualQuantity != null ? parsed.manualUnit : parsed.unit || "sq ft";
    const group = groups.get(row.id) || { row, measurements: [], quantity: 0, unit };
    if (group.unit !== unit) throw new Error(`Measurements for ${row.material} use different units. Correct their form units before finishing.`);
    const dimensions = parsed.dimensionPairs?.map((pair, index) =>
      `${displayNumber(pair[0])} x ${displayNumber(pair[1])}${parsed.slopeFactors?.[index] != null ? ` x ${displayNumber(parsed.slopeFactors[index])}` : ""}`).join("; ");
    const wall = parsed.bays != null ? `${displayNumber(parsed.bays)} bays ${parsed.framing || ""} ${displayNumber(parsed.height)}ft ${displayNumber(parsed.spacing)}OC` : "";
    group.measurements.push(parsed.derivedFormText || dimensions || wall || (parsed.measurements?.length ? parsed.measurements.map(displayNumber).join(" + ") : formatMeasurements(entry)));
    group.quantity += Number(parsed.manualQuantity ?? (parsed.sprinklerInsulation > 0 ? parsed.blownInsulation : quantity));
    groups.set(row.id, group);
  }
  return [...groups.values()];
}

export async function createCompletedTakeoffPdf(templateBytes, options = {}) {
  const data = prepareTakeoffFormData(options);
  if (!data.entries.length) throw new Error("Add at least one measurement before finishing the takeoff.");
  const rows = prepareOriginalFormRows(options.entries);

  const document = await PDFDocument.load(templateBytes);
  if (document.getPageCount() !== 2) throw new Error("The uploaded takeoff form must contain exactly two pages.");
  const font = await document.embedFont(StandardFonts.Helvetica);
  const [firstPage, secondPage] = document.getPages();
  writeHeader(firstPage, font, data.headers);
  writeHeader(secondPage, font, data.headers, 18);

  for (const { row, measurements, quantity, sprinklerQuantities } of rows) {
    const page = document.getPages()[row.page];
    // Only the existing Measurements and Total Footage cells receive overlays.
    // Printed prices, labels, lines, and all unconfirmed fields remain untouched.
    if (sprinklerQuantities) {
      if (measurements.length) throw new Error("Separate the sprinkler preparation entry before finishing so its material quantities remain clear.");
      for (const [material, value] of Object.entries(sprinklerQuantities)) {
        drawTopText(page, font, `${displayNumber(value)} sq ft`, material === "R-38" ? 345 : 432, row.top, 47, 6.2);
      }
    } else {
      drawTopText(page, font, measurements.join("; "), 314, row.top, 170, 6.2);
    }
    drawTopText(page, font, displayNumber(quantity), 491, row.top, 29, 7);
  }

  return document.save();
}
