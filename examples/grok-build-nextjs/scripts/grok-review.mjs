import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const prompt = readFileSync(new URL("../PROMPT.md", import.meta.url), "utf8");
const result = spawnSync("grok", ["--no-auto-update", "-p", prompt, "--output-format", "json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error("Grok Build is not available. Install it from https://docs.x.ai/build/overview and run grok login.");
  process.exit(1);
}

process.exit(result.status ?? 1);
