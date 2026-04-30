#!/usr/bin/env node

const path = require("path");

const DEFAULT_ENV_ID = "yezai-3gr73wd48057512e-10f17b581";
const DEFAULT_CREATOR_MESSAGE = "这段路线想带你用更贴近在地的方式慢慢走进去。";
const QUERY_BATCH_SIZE = 100;

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/backfill-service-creator-message.js [--write] [--limit 10] [--slugs ridge-journal,wuyi-ink-trail]",
      "",
      "Environment variables:",
      "  TCB_ENV_ID / TCB_ENV     CloudBase env id, defaults to yezai-3gr73wd48057512e-10f17b581",
      "  TCB_SECRET_ID            Tencent Cloud SecretId",
      "  TCB_SECRET_KEY           Tencent Cloud SecretKey",
      "  TCB_SESSIONTOKEN         Tencent Cloud session token for temporary credentials",
      "",
      "Options:",
      "  --write                  Persist generated creatorMessage back to the services collection",
      "  --overwrite              Overwrite existing creatorMessage values as well",
      "  --limit <number>         Limit queried service count for a trial run",
      "  --slugs <slugs>          Only process the specified comma-separated service slugs",
      "  --env <envId>            Override the target CloudBase env id",
      "  --help                   Show this help message"
    ].join("\n")
  );
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
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
    envId: process.env.TCB_ENV_ID || process.env.TCB_ENV || DEFAULT_ENV_ID,
    help: false,
    limit: 0,
    overwrite: false,
    secretId: process.env.TCB_SECRET_ID || process.env.SECRET_ID || "",
    secretKey: process.env.TCB_SECRET_KEY || process.env.SECRET_KEY || "",
    sessionToken:
      process.env.TCB_SESSIONTOKEN ||
      process.env.TCB_SESSION_TOKEN ||
      process.env.TENCENTCLOUD_SESSIONTOKEN ||
      "",
    slugs: [],
    write: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Math.max(0, parseInt(argv[index + 1] || "0", 10) || 0);
      index += 1;
      continue;
    }

    if (arg === "--slugs") {
      options.slugs = String(argv[index + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
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

function getOverviewWhyJoinText(service) {
  const travelDetail = isPlainObject(service && service.travelDetail) ? service.travelDetail : {};
  const overview = isPlainObject(travelDetail.overview) ? travelDetail.overview : {};
  return normalizeText(overview.whyJoinText);
}

function deriveCreatorMessage(service) {
  const whyJoinText = getOverviewWhyJoinText(service);
  const firstParagraph = whyJoinText ? whyJoinText.split(/\n\s*\n/)[0].trim() : "";
  return firstParagraph || normalizeText(service && service.summary) || DEFAULT_CREATOR_MESSAGE;
}

function buildServiceUpdatePlan(services, options = {}) {
  const slugFilter = new Set(uniqueStrings(options.slugs));
  const overwrite = Boolean(options.overwrite);

  return (Array.isArray(services) ? services : [])
    .filter((service) => {
      const slug = normalizeText(service && service.slug);
      return !slugFilter.size || slugFilter.has(slug);
    })
    .map((service) => {
      const previousMessage = normalizeText(service && service.creatorMessage);
      const nextMessage = deriveCreatorMessage(service);

      return {
        _id: normalizeText(service && service._id),
        slug: normalizeText(service && service.slug),
        name: normalizeText(service && service.name),
        nextMessage,
        previousMessage
      };
    })
    .filter((item) => {
      if (!item._id || !item.slug) {
        return false;
      }

      if (!overwrite && item.previousMessage) {
        return false;
      }

      return item.previousMessage !== item.nextMessage;
    });
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

async function listServices(db, limit) {
  const rows = [];
  let offset = 0;

  while (true) {
    const size = limit ? Math.min(QUERY_BATCH_SIZE, Math.max(limit - rows.length, 0)) : QUERY_BATCH_SIZE;
    if (!size) {
      break;
    }

    const result = await db.collection("services").skip(offset).limit(size).get();
    const batch = Array.isArray(result.data) ? result.data : [];
    rows.push(...batch);

    if (batch.length < size || (limit && rows.length >= limit)) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

async function applyUpdatePlan(db, plan) {
  let updated = 0;

  for (const item of plan) {
    await db.collection("services").doc(item._id).update({
      data: {
        creatorMessage: item.nextMessage,
        updatedAt: Date.now(),
        updatedBy: "script:backfill-service-creator-message"
      }
    });
    updated += 1;
  }

  return updated;
}

function printPlan(plan, options) {
  process.stdout.write(
    [
      `Backfill creatorMessage in env ${options.envId}`,
      `Mode: ${options.write ? "write" : "dry-run"}`,
      options.overwrite ? "Overwrite: enabled" : "Overwrite: disabled",
      options.slugs.length ? `Slug filter: ${options.slugs.join(", ")}` : "Slug filter: all services",
      `Planned updates: ${plan.length}`
    ].join("\n") + "\n"
  );

  const preview = plan.slice(0, 20).map((item) => ({
    _id: item._id,
    slug: item.slug,
    name: item.name,
    nextMessage: item.nextMessage,
    previousMessage: item.previousMessage
  }));

  process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);

  if (plan.length > preview.length) {
    process.stdout.write(`... and ${plan.length - preview.length} more\n`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  assertCanonicalEnvId(options.envId);

  if (!options.secretId || !options.secretKey) {
    throw new Error("TCB_SECRET_ID and TCB_SECRET_KEY are required");
  }

  const cloudbase = requireNodeSdk();
  const app = cloudbase.init({
    env: options.envId,
    secretId: options.secretId,
    secretKey: options.secretKey,
    sessionToken: options.sessionToken || undefined
  });
  const db = app.database();
  const services = await listServices(db, options.limit);
  const plan = buildServiceUpdatePlan(services, options);

  printPlan(plan, options);

  if (!options.write || !plan.length) {
    return;
  }

  const updatedCount = await applyUpdatePlan(db, plan);
  process.stdout.write(`Updated ${updatedCount} service documents.\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_CREATOR_MESSAGE,
  buildServiceUpdatePlan,
  deriveCreatorMessage,
  parseArgs
};
