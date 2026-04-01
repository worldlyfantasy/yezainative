const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const nativeRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(nativeRoot, "..");
const adminRoot = path.join(workspaceRoot, "yezaiadmin");
const nativeTestsDir = path.join(nativeRoot, "tests");

function listNativeTestFiles() {
  return fs
    .readdirSync(nativeTestsDir)
    .filter((fileName) => fileName.endsWith(".test.js"))
    .sort()
    .map((fileName) => path.join("tests", fileName));
}

function runStep(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.status}`);
  }
}

function main() {
  const nativeTestFiles = listNativeTestFiles();
  const steps = [
    {
      label: "Native and cloudfunction unit tests",
      command: process.execPath,
      args: ["--test", ...nativeTestFiles],
      cwd: nativeRoot
    },
    {
      label: "Admin service tests",
      command: "npm",
      args: ["test"],
      cwd: adminRoot
    },
    {
      label: "Admin production build",
      command: "npm",
      args: ["run", "build"],
      cwd: adminRoot
    }
  ];

  console.log("Running core self-check steps...");

  for (const step of steps) {
    console.log(`\n==> ${step.label}`);
    runStep(step);
  }

  console.log("\nCore self-check passed.");
}

try {
  main();
} catch (error) {
  console.error(`\nCore self-check failed: ${error.message}`);
  process.exit(1);
}
