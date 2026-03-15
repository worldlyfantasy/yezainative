const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const cloudfunctionsDir = path.join(__dirname, "..", "cloudfunctions");

function getCloudfunctionDirs() {
  return fs
    .readdirSync(cloudfunctionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(cloudfunctionsDir, name, "package.json")));
}

function installForCloudfunction(name) {
  const cwd = path.join(cloudfunctionsDir, name);
  process.stdout.write(`Installing dependencies for ${name}...\n`);

  const result = spawnSync("npm", ["install"], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    throw new Error(`npm install failed for ${name}`);
  }
}

function main() {
  const targets = getCloudfunctionDirs();

  if (!targets.length) {
    process.stdout.write("No cloud functions with package.json were found.\n");
    return;
  }

  targets.forEach(installForCloudfunction);
  process.stdout.write(`Installed dependencies for ${targets.length} cloud functions.\n`);
}

main();
