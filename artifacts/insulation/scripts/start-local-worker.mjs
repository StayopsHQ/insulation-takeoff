import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const setupToken = process.env.INSULATION_LOCAL_SETUP_TOKEN;
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

if (setupToken) {
  if (/[\r\n]/.test(setupToken)) {
    throw new Error("INSULATION_LOCAL_SETUP_TOKEN must be a single-line value.");
  }

  temporaryDirectory = await mkdtemp(join(tmpdir(), "insulation-wrangler-"));
  envFile = join(temporaryDirectory, ".dev.vars");
  await writeFile(envFile, `SETUP_TOKEN=${JSON.stringify(setupToken)}\n`, {
    mode: 0o600,
  });

  process.env.INSULATION_LOCAL_SETUP_TOKEN = "";
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
