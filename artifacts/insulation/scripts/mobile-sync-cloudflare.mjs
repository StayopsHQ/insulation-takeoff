import { spawnSync } from "node:child_process";

const apiBaseUrl = "https://insulation-takeoff.mleo0705.workers.dev";

async function main() {
  let response;
  let responseText;
  let health;
  try {
    response = await fetch(`${apiBaseUrl}/api/health`);
    responseText = await response.text();
  } catch {
    throw new Error("Could not verify the Cloudflare takeoff API. Deploy the existing Worker source before building the iPhone app.");
  }

  try { health = JSON.parse(responseText); } catch {}
  if (!response.ok || health?.ok !== true || health?.service !== "insulation-takeoff") {
    const bodyPreview = String(responseText || "").slice(0, 80);
    throw new Error(
      `The configured Worker is not serving the Insulation Takeoff API (HTTP ${response.status}; response: ${bodyPreview}). ` +
      "Deploy the existing Worker source, verify /api/health, then retry. No iOS assets were built."
    );
  }

  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["run", "mobile:sync"], {
    stdio: "inherit",
    env: { ...process.env, VITE_API_BASE_URL: apiBaseUrl }
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
