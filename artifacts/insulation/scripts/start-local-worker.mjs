import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const setupToken = process.env.INSULATION_LOCAL_SETUP_TOKEN;
const openAiKey = process.env.OPENAI_API_KEY;
const port = process.env.PORT || "19324";
let temporaryDirectory;
let envFile;
const args = [
  "exec",
  "wrangler",
  "dev",
  "--local",
  "--ip",
  "0.0.0.0",
  "--port",
  port,
];

const localVars = [];
if (setupToken) localVars.push(["SETUP_TOKEN", setupToken]);
if (openAiKey) localVars.push(["OPENAI_API_KEY", openAiKey]);
for (const [name, value] of localVars) {
  if (/[\r\n]/.test(value)) throw new Error(`${name} must be a single-line value.`);
}
if (localVars.length) {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "insulation-wrangler-"));
  envFile = join(temporaryDirectory, ".dev.vars");
  await writeFile(envFile, localVars.map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", {
    mode: 0o600,
  });

  process.env.INSULATION_LOCAL_SETUP_TOKEN = "";
  process.env.OPENAI_API_KEY = "";
  args.push("--env-file", envFile);
}

const child = spawn("pnpm", args, {
  stdio: "inherit",
  env: process.env,
});

const cleanup = () =>
  temporaryDirectory
    ? rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {})
    : Promise.resolve();

process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));

child.once("error", async (error) => {
  await cleanup();
  console.error("Could not start the local Cloudflare Worker:", error.message);
  process.exitCode = 1;
});

child.once("exit", async (code, signal) => {
  await cleanup();
  process.exitCode = code ?? (signal ? 1 : 0);
});
