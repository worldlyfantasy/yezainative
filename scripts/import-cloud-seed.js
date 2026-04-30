#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_ENV_ID = "yezai-3gr73wd48057512e-10f17b581";
const DEFAULT_SEED_DIR = path.join(__dirname, "..", "docs", "cloud-seed");
const DEFAULT_COLLECTIONS = [
  "app_configs",
  "creators",
  "destinations",
  "ideas",
  "services",
  "users",
  "favorites"
];
const IDENTITY_FIELDS = {
  app_configs: ["key"],
  creators: ["slug"],
  destinations: ["slug"],
  ideas: ["slug"],
  services: ["slug"],
  users: ["openid"],
  favorites: ["openid", "targetType", "targetSlug"]
};

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/import-cloud-seed.js [--collections services,creators] [--reset] [--dry-run]",
      "",
      "Environment variables:",
      "  TCB_ENV_ID / TCB_ENV     CloudBase env id, defaults to yezai-3gr73wd48057512e-10f17b581",
      "  TCB_SECRET_ID            Tencent Cloud SecretId",
      "  TCB_SECRET_KEY           Tencent Cloud SecretKey",
      "",
      "Options:",
      "  --collections <names>   Comma-separated NoSQL collections to import",
      "  --seed-dir <path>       Seed JSON directory, defaults to docs/cloud-seed",
      "  --reset                 Clear target collections before importing",
      "  --dry-run               Validate files and show the import plan without writing",
      "  --help                  Show this help message"
    ].join("\n")
  );
}

function isCanonicalCloudbaseEnvId(envId) {
  const normalized = String(envId || "").trim();

  if (!normalized) {
    return false;
  }

  const parts = normalized.split("-").filter(Boolean);
  const suffix = parts[parts.length - 1] || "";
  return parts.length >= 3 && /^[0-9a-z]+$/i.test(suffix) && suffix.length >= 8;
}

function assertCanonicalEnvId(envId) {
  if (!isCanonicalCloudbaseEnvId(envId)) {
    throw new Error(
      `CloudBase envId 必须使用完整环境 ID，当前收到 \`${envId}\`。请改成类似 \`${DEFAULT_ENV_ID}\` 的完整值。`
    );
  }
}

function parseArgs(argv) {
  const options = {
    collections: [],
    dryRun: false,
    envId: process.env.TCB_ENV_ID || process.env.TCB_ENV || DEFAULT_ENV_ID,
    help: false,
    reset: false,
    seedDir: DEFAULT_SEED_DIR,
    secretId: process.env.TCB_SECRET_ID || process.env.SECRET_ID || "",
    secretKey: process.env.TCB_SECRET_KEY || process.env.SECRET_KEY || ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--reset") {
      options.reset = true;
      continue;
    }

    if (arg === "--collections") {
      options.collections = String(argv[index + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--seed-dir") {
      options.seedDir = path.resolve(argv[index + 1] || DEFAULT_SEED_DIR);
      index += 1;
      continue;
    }

    if (arg === "--env") {
      options.envId = String(argv[index + 1] || "").trim() || options.envId;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return options;
}

function requireNodeSdk() {
  const candidates = [
    path.join(
      __dirname,
      "..",
      "cloudfunctions",
      "adminGateway",
      "node_modules",
      "@cloudbase",
      "node-sdk"
    ),
    "@cloudbase/node-sdk"
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      // Try the next candidate.
    }
  }

  throw new Error(
    "Cannot resolve @cloudbase/node-sdk. Run `node scripts/install-cloudfunctions-deps.js` first."
  );
}

function ensureArraySeed(filePath, rawValue) {
  if (!Array.isArray(rawValue)) {
    throw new Error(`Seed file must contain a JSON array: ${filePath}`);
  }

  return rawValue;
}

function loadSeedFile(seedDir, collectionName) {
  const filePath = path.join(seedDir, `${collectionName}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Seed file not found: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

  return {
    collectionName,
    filePath,
    rows: ensureArraySeed(filePath, parsed)
  };
}

function resolveCollections(options) {
  const collections = options.collections.length ? options.collections : DEFAULT_COLLECTIONS;

  collections.forEach((collectionName) => {
    if (!IDENTITY_FIELDS[collectionName]) {
      throw new Error(`Unsupported collection for seed import: ${collectionName}`);
    }
  });

  return collections;
}

function buildIdentityFilter(collectionName, row) {
  const fields = IDENTITY_FIELDS[collectionName] || [];
  const filter = {};

  fields.forEach((field) => {
    const value = row[field];
    if (typeof value === "string" && value.trim()) {
      filter[field] = value.trim();
      return;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      filter[field] = value;
    }
  });

  return filter;
}

function validateSeedRow(collectionName, row, rowIndex) {
  if (!row || Object.prototype.toString.call(row) !== "[object Object]") {
    throw new Error(`${collectionName}[${rowIndex}] must be a JSON object`);
  }

  const filter = buildIdentityFilter(collectionName, row);
  const requiredKeys = IDENTITY_FIELDS[collectionName];
  const missingKeys = requiredKeys.filter((field) => !(field in filter));

  if (missingKeys.length) {
    throw new Error(
      `${collectionName}[${rowIndex}] is missing identity field(s): ${missingKeys.join(", ")}`
    );
  }

  return filter;
}

async function ensureCollection(db, collectionName) {
  try {
    await db.createCollection(collectionName);
    process.stdout.write(`Created collection: ${collectionName}\n`);
  } catch (error) {
    const message = String((error && error.message) || (error && error.errMsg) || "");
    if (
      message.includes("already exists")
      || message.includes("CollectionExists")
      || message.includes("已存在")
    ) {
      return;
    }

    throw error;
  }
}

async function clearCollection(db, collectionName) {
  let removed = 0;

  while (true) {
    const batch = await db.collection(collectionName).limit(100).get();
    const rows = Array.isArray(batch.data) ? batch.data : [];

    if (!rows.length) {
      break;
    }

    await Promise.all(
      rows.map((row) => db.collection(collectionName).doc(row._id).remove())
    );
    removed += rows.length;
  }

  return removed;
}

async function upsertCollection(db, collectionName, rows, options) {
  let inserted = 0;
  let updated = 0;

  await ensureCollection(db, collectionName);

  if (options.reset) {
    const removed = await clearCollection(db, collectionName);
    process.stdout.write(`Cleared ${collectionName}: removed ${removed} document(s)\n`);
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const filter = validateSeedRow(collectionName, row, index);

    if (options.reset) {
      await db.collection(collectionName).add({ data: row });
      inserted += 1;
      continue;
    }

    const existing = await db.collection(collectionName).where(filter).limit(1).get();
    const matched = Array.isArray(existing.data) && existing.data.length ? existing.data[0] : null;

    if (!matched) {
      await db.collection(collectionName).add({ data: row });
      inserted += 1;
      continue;
    }

    await db.collection(collectionName).doc(matched._id).remove();
    await db.collection(collectionName).add({ data: row });
    updated += 1;
  }

  return {
    collectionName,
    inserted,
    updated,
    total: rows.length
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  assertCanonicalEnvId(options.envId);

  const collections = resolveCollections(options);
  const seedPayloads = collections.map((collectionName) =>
    loadSeedFile(options.seedDir, collectionName)
  );

  seedPayloads.forEach(({ collectionName, rows }) => {
    rows.forEach((row, index) => {
      validateSeedRow(collectionName, row, index);
    });
  });

  if (options.dryRun) {
    process.stdout.write("Dry run import plan:\n");
    seedPayloads.forEach(({ collectionName, filePath, rows }) => {
      process.stdout.write(
        `- ${collectionName}: ${rows.length} row(s) from ${path.relative(process.cwd(), filePath)}\n`
      );
    });
    process.stdout.write(`Mode: ${options.reset ? "reset + import" : "upsert"}\n`);
    return;
  }

  if (!options.secretId || !options.secretKey) {
    throw new Error("TCB_SECRET_ID and TCB_SECRET_KEY are required unless --dry-run is used");
  }

  const cloudbase = requireNodeSdk();
  const app = cloudbase.init({
    env: options.envId,
    secretId: options.secretId,
    secretKey: options.secretKey
  });
  const db = app.database();
  const summary = [];

  for (const { collectionName, rows } of seedPayloads) {
    process.stdout.write(`Importing ${collectionName} (${rows.length} row(s))...\n`);
    summary.push(await upsertCollection(db, collectionName, rows, options));
  }

  process.stdout.write("Seed import completed:\n");
  summary.forEach((item) => {
    process.stdout.write(
      `- ${item.collectionName}: inserted ${item.inserted}, updated ${item.updated}, total ${item.total}\n`
    );
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
