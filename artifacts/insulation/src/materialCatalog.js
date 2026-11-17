export const MATERIAL_CATALOG = Object.freeze([
  { id:"blown-r19", section:"Blown", material:"R-19 Blown", bookPrice:0.82 },
  { id:"blown-r30", section:"Blown", material:"R-30 Blown", bookPrice:1.27 },
  { id:"blown-r38", section:"Blown", material:"R-38 Blown", bookPrice:1.62 },
  { id:"blown-r49", section:"Blown", material:"R-49 Blown", bookPrice:2.10 },

  { id:"ext-r13-15-2x8-fb", section:"Exterior Walls", material:"R-13-15 2x8 FT FB", bookPrice:0.96 },
  { id:"ext-r13-15-2x9-fb", section:"Exterior Walls", material:"R-13-15 2x9 FT FB", bookPrice:0.96 },
  { id:"ext-r13-23-kraft", section:"Exterior Walls", material:"R-13 (23 Kraft)", bookPrice:0.96 },
  { id:"ext-r15-23-khp", section:"Exterior Walls", material:"R-15-23 KHP", bookPrice:1.44 },
  { id:"ext-r15-1593-khp", section:"Exterior Walls", material:"R-15-1593 KHP", bookPrice:1.44 },
  { id:"ext-r15-15105-khp", section:"Exterior Walls", material:"R-15-15105 KHP", bookPrice:1.44 },
  { id:"ext-r19-11k", section:"Exterior Walls", material:"R-19-11K", bookPrice:1.13 },
  { id:"ext-r19-15k-8ft", section:"Exterior Walls", material:"R-19 15K 8 FT", bookPrice:1.13 },
  { id:"ext-r19-15k-9ft", section:"Exterior Walls", material:"R-19 15K 9 FT", bookPrice:1.13 },
  { id:"ext-r19-23k", section:"Exterior Walls", material:"R-19 23K", bookPrice:1.13 },
  { id:"ext-r20-15k", section:"Exterior Walls", material:"R-20 15K", bookPrice:1.36 },
  { id:"ext-r21-15k-8ft", section:"Exterior Walls", material:"R-21 15K 8 FT", bookPrice:1.71 },
  { id:"ext-r21-15k-9ft", section:"Exterior Walls", material:"R-21 15K 9 FT", bookPrice:1.71 },
  { id:"ext-r21-23k", section:"Exterior Walls", material:"R-21 23K", bookPrice:1.71 },

  { id:"bj-r13-15-25-unfaced", section:"BJ", material:"R-13 (15 25 Unfaced)", bookPrice:0.91 },
  { id:"bj-r19-15-25-unfaced", section:"BJ", material:"R-19 (15 25 Unfaced)", bookPrice:1.08 },
  { id:"bj-r21-15-unfaced", section:"BJ", material:"R-21 (15 Unfaced)", bookPrice:1.61 },

  { id:"basement-r13-15k", section:"Basement Ext. Walls", material:"R13-15K", bookPrice:0.96 },
  { id:"basement-r13-23k", section:"Basement Ext. Walls", material:"R13-23K", bookPrice:0.96 },
  { id:"basement-r19-15k", section:"Basement Ext. Walls", material:"R19-15K", bookPrice:1.13 },
  { id:"basement-1148fsk", section:"Basement Ext. Walls", material:"1148FSK", bookPrice:1.33 },

  { id:"party-r11-15-25-unfaced", section:"Party Walls", material:"R-11 (15 25 Unfaced)", bookPrice:0.73 },
  { id:"party-r11-23oc-unfaced", section:"Party Walls", material:"R-11 (23-OC Unfaced)", bookPrice:0.73 },
  { id:"party-r13-15-25u", section:"Party Walls", material:"R-13-15 25U", bookPrice:0.91 },

  { id:"batt-r38-16oc-kraft", section:"Batt Ceilings (CAFLAT)", material:"R-38 (16OC Kraft)", bookPrice:2.12 },
  { id:"batt-r38-24oc-kraft", section:"Batt Ceilings (CAFLAT)", material:"R-38 (24OC Kraft)", bookPrice:2.12 },
  { id:"batt-r49-24oc-kraft", section:"Batt Ceilings (CAFLAT)", material:"R-49 (24OC Kraft)", bookPrice:2.85 },
  { id:"batt-r49-16oc-kraft", section:"Batt Ceilings (CAFLAT)", material:"R-49 (16OC Kraft)", bookPrice:2.85 },
  { id:"batt-baffles", section:"Batt Ceilings (CAFLAT)", material:"Baffles", bookPrice:1.40 },
  { id:"batt-vents", section:"Batt Ceilings (CAFLAT)", material:"Vents", bookPrice:1.32 },

  { id:"slopes-r38-16k", section:"Slopes", material:"R-38-16K", bookPrice:2.12 },
  { id:"slopes-r38-24k", section:"Slopes", material:"R-38-24K", bookPrice:2.12 },
  { id:"slopes-r49-16k", section:"Slopes", material:"R-49-16K", bookPrice:2.85 },
  { id:"slopes-r49-24k", section:"Slopes", material:"R-49-24K", bookPrice:2.85 },

  { id:"garage-r19-15", section:"Garage Ceiling (GACA)", material:'R19 - 15"', bookPrice:1.13 },
  { id:"garage-r19-24", section:"Garage Ceiling (GACA)", material:"R19 - 24", bookPrice:1.13 },
  { id:"garage-r19-19", section:"Garage Ceiling (GACA)", material:'R19 - 19"', bookPrice:1.13 },
  { id:"garage-bibs-16", section:"Garage Ceiling (GACA)", material:'BIBS 16"', trip:"16″", bookPrice:3.40 },
  { id:"garage-r30-24k", section:"Garage Ceiling (GACA)", material:"R30-24K", bookPrice:1.75 },
  { id:"garage-r30-16k", section:"Garage Ceiling (GACA)", material:"R30-16K", bookPrice:1.75 },
  { id:"garage-r30-19-25k", section:"Garage Ceiling (GACA)", material:"R30-19 25K", bookPrice:1.75 },

  { id:"other-sprinkler-prep", section:"Other", material:"Sprinkler Pipes (PREP)", bookPrice:null, trip:"R-38 / R-49" },
  { id:"other-caulk", section:"Other", material:"Caulk", bookPrice:0.10 },
  { id:"other-windows-doors", section:"Other", material:"Windows/Doors?", bookPrice:null },
  { id:"other-foam-sealant", section:"Other", material:"Foam Sealant", bookPrice:0.06 },
  { id:"other-cantilever-3016", section:"Other", material:"Cantilever (CNL) R-3016", bookPrice:1.75 },
  { id:"other-cantilever-3019-25", section:"Other", material:"Cantilever (CNL) R-3019.25", bookPrice:1.75 },
  { id:"other-cantilever-3024", section:"Other", material:"Cantilever (CNL) R-3024", bookPrice:1.75 }
]);

export const FORM_SECTIONS = Object.freeze([
  "Blown", "Exterior Walls", "BJ", "Basement Ext. Walls", "Party Walls",
  "Batt Ceilings (CAFLAT)", "Slopes", "Garage Ceiling (GACA)", "Other"
]);

export function getMaterialsForSection(section) {
  return MATERIAL_CATALOG.filter(item => item.section === section);
}

export function getMaterialById(id) {
  return MATERIAL_CATALOG.find(item => item.id === id) || null;
}

export function extendedPrice(quantity, bookPrice) {
  const qty = Number(quantity);
  const price = Number(bookPrice);
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Quantity must be non-negative.");
  if (bookPrice == null || !Number.isFinite(price) || price < 0) return null;
  return Math.round(qty * price * 100) / 100;
}
