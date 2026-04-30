#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const {
  normalizeDestinationRegionCode,
  resolveDestinationRegionCode
} = require("../shared/destination-regions");

const DEFAULT_SOURCE = path.join(__dirname, "..", "docs", "cloud-seed", "services.json");

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    write: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg === "--source") {
      options.source = path.resolve(argv[index + 1] || DEFAULT_SOURCE);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node scripts/backfill-service-region-codes.js [--write] [--source /path/to/services.json]",
          "",
          "Options:",
          "  --write   Persist inferred regionCodes back to the source JSON file.",
          "  --source  Override the services JSON file path."
        ].join("\n")
      );
      process.exit(0);
    }
  }

  return options;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function inferRegionCodes(service) {
  const explicitRegionCodes = uniqueStrings(
    Array.isArray(service.regionCodes) ? service.regionCodes : []
  )
    .map((item) => normalizeDestinationRegionCode(item))
    .filter(Boolean);

  if (explicitRegionCodes.length) {
    return explicitRegionCodes;
  }

  return uniqueStrings(
    (Array.isArray(service.destinationSlugs) ? service.destinationSlugs : [])
      .map((slug) => resolveDestinationRegionCode("", slug))
      .filter(Boolean)
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceText = fs.readFileSync(options.source, "utf8");
  const services = JSON.parse(sourceText);
  let updatedCount = 0;
  const missing = [];

  services.forEach((service) => {
    const regionCodes = inferRegionCodes(service);
    if (!regionCodes.length) {
      missing.push(service.slug || service.id || service.name || "unknown-service");
      return;
    }

    if (JSON.stringify(service.regionCodes || []) !== JSON.stringify(regionCodes)) {
      service.regionCodes = regionCodes;
      updatedCount += 1;
    }
  });

  if (options.write) {
    fs.writeFileSync(options.source, `${JSON.stringify(services, null, 2)}\n`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        source: options.source,
        dryRun: !options.write,
        scannedServices: services.length,
        updatedCount,
        missingRegionCodeServices: missing
      },
      null,
      2
    )
  );
}

main();
