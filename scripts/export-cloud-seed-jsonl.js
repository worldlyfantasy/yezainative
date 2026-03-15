const fs = require("fs");
const path = require("path");

const seedDir = path.join(__dirname, "..", "docs", "cloud-seed");
const outputDir = path.join(seedDir, "jsonl");
const importableDir = path.join(seedDir, "importable");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toJsonLines(data) {
  if (!Array.isArray(data)) {
    throw new Error("Seed file must contain a top-level array");
  }

  return data.map((item) => JSON.stringify(item)).join("\n") + "\n";
}

function main() {
  ensureDir(outputDir);
  ensureDir(importableDir);

  const files = fs
    .readdirSync(seedDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  files.forEach((filename) => {
    const sourcePath = path.join(seedDir, filename);
    const raw = fs.readFileSync(sourcePath, "utf8");
    const data = JSON.parse(raw);
    const jsonl = toJsonLines(data);
    const targetPath = path.join(outputDir, filename.replace(/\.json$/, ".jsonl"));
    const importablePath = path.join(importableDir, filename);
    fs.writeFileSync(targetPath, jsonl, "utf8");
    fs.writeFileSync(importablePath, jsonl, "utf8");
  });

  process.stdout.write(`Cloud seed JSON Lines exported to ${outputDir} and ${importableDir}\n`);
}

main();
