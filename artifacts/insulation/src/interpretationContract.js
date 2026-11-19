// Shared wire contract: extracted inputs only. Calculated outputs are forbidden.
export const INTERPRETATION_MODEL = "gpt-6-luna";
export const SECTIONS = ["exterior walls", "basement exterior", "party walls", "attic", "slopes", "band joists", "batt ceilings", "garage ceiling", "baffles", "sill", "caulk", "foam"];
const nullableNumber = { type: ["number", "null"], minimum: 0, maximum: 100000 };
const nullableString = { type: ["string", "null"], maxLength: 200 };
const object = properties => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
export const INPUT_FIELDS = object({
  bays: nullableNumber,
  framing: { type: ["string", "null"], enum: ["2x4", "2x6", null] },
  spacing: { type: ["number", "null"], enum: [16, 24, null] },
  height: nullableNumber,
  length: nullableNumber,
  width: nullableNumber,
  lengths: { type: "array", items: { type: "number", minimum: 0, maximum: 100000 }, maxItems: 100 },
  slopeFactor: nullableNumber,
  sprinklers: { type: ["boolean", "null"] },
  quantity: nullableNumber,
  material: nullableString
});
export const INTERPRETATION_SCHEMA = object({
  jobNumber: nullableString,
  events: { type: "array", maxItems: 150, items: object({
    id: { type: "string", maxLength: 80 },
    kind: { type: "string", enum: ["measurement", "correction", "clarification"] },
    section: { type: ["string", "null"], enum: [...SECTIONS, null] },
    area: nullableString,
    sourceText: { type: "string", minLength: 1, maxLength: 10000 },
    targetId: nullableString,
    fields: INPUT_FIELDS,
    clarification: { type: ["string", "null"], maxLength: 500 }
  }) }
});

// Validate the same strict schema locally, on BOTH sides of the network boundary.
export function validateShape(value, schema = INTERPRETATION_SCHEMA, path = "interpretation") {
  const types = [].concat(schema.type);
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (!types.includes(type)) throw new Error(`${path}: expected ${types.join("/")}.`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: unsupported value.`);
  if (type === "object") {
    if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw new Error(`${path}: unexpected field.`);
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key}: missing field.`);
      validateShape(value[key], schema.properties[key], `${path}.${key}`);
    }
  }
  if (type === "array") {
    if (value.length > schema.maxItems) throw new Error(`${path}: too many items.`);
    value.forEach((item, i) => validateShape(item, schema.items, `${path}[${i}]`));
  }
  if (type === "number" && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) throw new Error(`${path}: invalid number.`);
  if (type === "string" && (value.length > schema.maxLength || value.length < (schema.minLength || 0))) throw new Error(`${path}: invalid text length.`);
  return value;
}
