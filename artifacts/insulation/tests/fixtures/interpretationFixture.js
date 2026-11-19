import { MULTI_AREA_TRANSCRIPT } from "./multiAreaTranscript.js";
export const emptyFields = () => ({
  bays: null, framing: null, spacing: null, height: null, length: null, width: null,
  lengths: [], slopeFactor: null, sprinklers: null, quantity: null, material: null
});
const event = (id, section, sourceText, fields, area = section, targetId = null) => ({
  id, kind: targetId ? "correction" : "measurement", section, area, sourceText,
  targetId, fields: { ...emptyFields(), ...fields }, clarification: null
});
const wall = (bays, framing = "2x4", spacing = 16, height = 9) => ({ bays, framing, spacing, height });
export const INTERPRETATION_FIXTURE = {
  jobNumber: "247",
  events: [
    event("band", "band joists", "Band joists 12, 16, and 20", { lengths: [12,16,20] }),
    event("floor", "exterior walls", "first floor walls 26 bays, two-by-four, sixteen-inch centers, nine-foot walls.", wall(26), "first floor walls"),
    event("basement", "basement exterior", "in the basement 30 bays, two-by-four, sixteen-inch centers, eight-foot walls.", wall(30,"2x4",16,8)),
    event("unfinished", "basement exterior", "Unfinished area 14 bays, two-by-six, twenty-four-inch centers, ten-foot walls.", wall(14,"2x6",24,10), "unfinished area"),
    event("fix1", "basement exterior", "Correction, make that 12 bays, not 14.", { bays:12 }, "unfinished area", "unfinished"),
    event("garage1", "garage ceiling", "garage ceiling 20 by 22", { length:20,width:22 }),
    event("garage2", "garage ceiling", "18 by 10.", { length:18,width:10 }),
    event("ext1", "exterior walls", "Another exterior wall section 12 bays, two-by-six, twenty-four-inch centers, ten-foot walls,", wall(12,"2x6",24,10)),
    event("ext2", "exterior walls", "8 bays, two-by-four, sixteen-inch centers, nine-foot walls.", wall(8)),
    event("fix2", "exterior walls", "Correction, make that 9 bays, not 8.", { bays:9 }, "exterior walls", "ext2"),
    event("attic1", "attic", "Attic 32 by 42 with sprinklers", { length:32,width:42,sprinklers:true }),
    event("attic2", "attic", "18 by 24 no sprinklers.", { length:18,width:24,sprinklers:false }),
    event("slope", "slopes", "Slopes 22 by 14 with a one-point-two-five factor.", { length:22,width:14,slopeFactor:1.25 }),
    event("floor2", "exterior walls", "First floor walls 6 bays, two-by-four, sixteen-inch centers, nine-foot walls.", wall(6), "first floor walls")
  ]
};
export { MULTI_AREA_TRANSCRIPT };
export const MOCK_USAGE = { model:"gpt-6-luna", inputTokens:2500, outputTokens:3000, estimatedCostUSD:0.00175, estimateBasis:"Standard uncached token rates; excludes audio transcription and taxes" };
