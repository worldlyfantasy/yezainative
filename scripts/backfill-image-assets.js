#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const {
  dedupeImageValues,
  ensureImageAssetValue,
  looksLikeHttpUrl,
  normalizeImageAssetValue,
  normalizeText
} = require("../cloudfunctions/adminGateway/image-assets");

const DEFAULT_ENV_ID = "yezai-3gr73wd48057512e-10f17b581";
const DEFAULT_COLLECTIONS = ["services", "creators", "destinations", "ideas", "app_configs"];
const QUERY_BATCH_SIZE = 100;
const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 10000;

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function getLegacyNestedData(doc) {
  return isPlainObject(doc && doc.data) ? doc.data : null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value == null ? fallback : value));
  } catch (error) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/backfill-image-assets.js [--collections services,creators] [--limit 10] [--dry-run]",
      "",
      "Environment variables:",
      "  TCB_ENV_ID / TCB_ENV     CloudBase env id, defaults to yezai-3gr73wd48057512e-10f17b581",
      "  TCB_SECRET_ID            Tencent Cloud SecretId",
      "  TCB_SECRET_KEY           Tencent Cloud SecretKey",
      "  TCB_SESSIONTOKEN         Tencent Cloud session token for temporary credentials",
      "",
      "Options:",
      "  --collections <names>   Comma-separated collections to process",
      "  --limit <number>        Limit documents per collection for a trial run",
      "  --dry-run               Show the planned writes without updating data",
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
    limit: 0,
    secretId: process.env.TCB_SECRET_ID || process.env.SECRET_ID || "",
    secretKey: process.env.TCB_SECRET_KEY || process.env.SECRET_KEY || "",
    sessionToken:
      process.env.TCB_SESSIONTOKEN ||
      process.env.TCB_SESSION_TOKEN ||
      process.env.TENCENTCLOUD_SESSIONTOKEN ||
      ""
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

    if (arg === "--collections") {
      options.collections = String(argv[index + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Math.max(0, parseInt(argv[index + 1] || "0", 10) || 0);
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

function resolveCollections(options) {
  const collections = options.collections.length ? options.collections : DEFAULT_COLLECTIONS;
  const allowed = new Set(DEFAULT_COLLECTIONS);

  collections.forEach((collectionName) => {
    if (!allowed.has(collectionName)) {
      throw new Error(`Unsupported collection: ${collectionName}`);
    }
  });

  return collections;
}

async function listCollection(db, collectionName, limit) {
  const rows = [];
  let offset = 0;

  while (true) {
    const size = limit ? Math.min(QUERY_BATCH_SIZE, Math.max(limit - rows.length, 0)) : QUERY_BATCH_SIZE;
    if (!size) {
      break;
    }

    const result = await db.collection(collectionName).skip(offset).limit(size).get();
    const batch = result.data || [];
    rows.push(...batch);

    if (batch.length < size || (limit && rows.length >= limit)) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

async function downloadRemoteImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, (response) => {
      const statusCode = Number(response.statusCode || 0);

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(downloadRemoteImage(new URL(response.headers.location, url).toString()));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Failed to download image: HTTP ${statusCode}`));
        return;
      }

      const chunks = [];
      let total = 0;

      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_REMOTE_IMAGE_BYTES) {
          request.destroy(new Error("Image too large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks)
        });
      });

      response.on("error", reject);
    });

    request.setTimeout(REMOTE_IMAGE_TIMEOUT_MS, () => {
      request.destroy(new Error("Image download timeout"));
    });

    request.on("error", reject);
  });
}

function createImageAssetProcessingOptions(app, fallbackFolder) {
  return {
    fallbackFolder,
    downloadSource: async (sourceRef) => {
      if (looksLikeHttpUrl(sourceRef)) {
        return downloadRemoteImage(sourceRef);
      }

      const result = await app.downloadFile({
        fileID: sourceRef
      });

      const fileContent = result && result.fileContent;
      return {
        buffer: Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent || "")
      };
    },
    uploadBuffer: async ({ buffer, cloudPath }) => {
      const result = await app.uploadFile({
        cloudPath,
        fileContent: buffer
      });
      return normalizeText(result && result.fileID);
    }
  };
}

async function ensureImageAssetField(app, value, fallbackFolder) {
  const normalized = normalizeImageAssetValue(value);
  if (!normalized) {
    return "";
  }

  return ensureImageAssetValue(normalized, createImageAssetProcessingOptions(app, fallbackFolder));
}

async function ensureImageAssetList(app, values, fallbackFolder) {
  const items = dedupeImageValues(values);
  const nextList = [];

  for (let index = 0; index < items.length; index += 1) {
    const asset = await ensureImageAssetField(app, items[index], fallbackFolder);
    if (asset) {
      nextList.push(asset);
    }
  }

  return nextList;
}

async function buildServicePatch(app, doc) {
  const slug = normalizeText(doc && doc.slug) || "service";
  const assetRoot = `content/services/${slug}`;
  const nestedData = getLegacyNestedData(doc);
  const sourceTravelDetail =
    (nestedData && isPlainObject(nestedData.travelDetail) && nestedData.travelDetail) ||
    (isPlainObject(doc && doc.travelDetail) ? doc.travelDetail : {});
  const travelDetail = isPlainObject(sourceTravelDetail) ? cloneJson(sourceTravelDetail, {}) : {};
  const overview = isPlainObject(travelDetail.overview) ? cloneJson(travelDetail.overview, {}) : {};

  travelDetail.overview = overview;
  travelDetail.consultWeChatQr = await ensureImageAssetField(app, travelDetail.consultWeChatQr, `${assetRoot}/consult-wechat`);
  travelDetail.highlights = await Promise.all(
    normalizeArray(travelDetail.highlights).map(async (item, index) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        images: await ensureImageAssetList(app, item.images, `${assetRoot}/highlights/highlight-${index + 1}`)
      });
    })
  );
  overview.coverImage = await ensureImageAssetField(app, overview.coverImage, `${assetRoot}/overview`);

  return {
    cover: await ensureImageAssetField(
      app,
      (nestedData && nestedData.cover) || (doc && doc.cover),
      `${assetRoot}/cover`
    ),
    gallery: await ensureImageAssetList(
      app,
      (nestedData && nestedData.gallery) || (doc && doc.gallery),
      `${assetRoot}/gallery`
    ),
    galleryGroups: await Promise.all(
      normalizeArray((nestedData && nestedData.galleryGroups) || (doc && doc.galleryGroups)).map(
        async (item, index) => {
        if (!isPlainObject(item)) {
          return item;
        }

        return Object.assign({}, item, {
          images: await ensureImageAssetList(app, item.images, `${assetRoot}/gallery/group-${index + 1}`)
        });
        }
      )
    ),
    travelDetail
  };
}

async function buildCreatorPatch(app, doc) {
  const slug = normalizeText(doc && doc.slug) || "creator";
  const nestedData = getLegacyNestedData(doc);
  return {
    avatar: await ensureImageAssetField(
      app,
      (nestedData && nestedData.avatar) || (doc && doc.avatar),
      `content/creators/avatar/${slug}`
    )
  };
}

async function buildDestinationPatch(app, doc) {
  const slug = normalizeText(doc && doc.slug) || "destination";
  const nestedData = getLegacyNestedData(doc);
  return {
    cover: await ensureImageAssetField(
      app,
      (nestedData && nestedData.cover) || (doc && doc.cover),
      `content/destinations/cover/${slug}`
    )
  };
}

async function buildIdeaPatch(app, doc) {
  const slug = normalizeText(doc && doc.slug) || "idea";
  const nestedData = getLegacyNestedData(doc);
  return {
    cover: await ensureImageAssetField(
      app,
      (nestedData && nestedData.cover) || (doc && doc.cover),
      `content/ideas/cover/${slug}`
    )
  };
}

async function buildConfigPatch(app, doc) {
  const key = normalizeText(doc && doc.key);
  const nestedData = getLegacyNestedData(doc);
  const sourceValue =
    (nestedData && isPlainObject(nestedData.value) && nestedData.value) ||
    (isPlainObject(doc && doc.value) ? doc.value : {});
  const value = isPlainObject(sourceValue) ? cloneJson(sourceValue, {}) : {};

  if (key !== "homePage") {
    return null;
  }

  value.heroSlides = await Promise.all(
    normalizeArray(value.heroSlides).map(async (item, index) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        image: await ensureImageAssetField(app, item.image || item.cloudFileID, `config/homePage/hero-${index + 1}`),
        cloudFileID: ""
      });
    })
  );

  return {
    value
  };
}

function hasPatchChanged(doc, patch) {
  if (!patch) {
    return false;
  }

  return Object.keys(patch).some((key) => {
    return JSON.stringify(doc && doc[key]) !== JSON.stringify(patch[key]);
  });
}

async function processCollection(app, db, collectionName, options) {
  const docs = await listCollection(db, collectionName, options.limit);
  const summary = {
    collectionName,
    changed: 0,
    scanned: docs.length
  };

  process.stdout.write(`[${collectionName}] start: ${docs.length} docs\n`);

  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index];
    let patch = null;

    if (collectionName === "services") {
      patch = await buildServicePatch(app, doc);
    } else if (collectionName === "creators") {
      patch = await buildCreatorPatch(app, doc);
    } else if (collectionName === "destinations") {
      patch = await buildDestinationPatch(app, doc);
    } else if (collectionName === "ideas") {
      patch = await buildIdeaPatch(app, doc);
    } else if (collectionName === "app_configs") {
      patch = await buildConfigPatch(app, doc);
    }

    if (!hasPatchChanged(doc, patch)) {
      continue;
    }

    summary.changed += 1;

    if (!options.dryRun) {
      const nextDoc = cloneJson(doc, {});
      delete nextDoc._id;
      delete nextDoc.data;
      Object.assign(nextDoc, patch);
      await db.collection(collectionName).doc(doc._id).set(nextDoc);
    }

    if ((index + 1) % 10 === 0 || index === docs.length - 1) {
      process.stdout.write(
        `[${collectionName}] progress: ${index + 1}/${docs.length}, ${options.dryRun ? "would change" : "changed"} ${summary.changed}\n`
      );
    }
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  assertCanonicalEnvId(options.envId);

  const collections = resolveCollections(options);
  if (!options.secretId || !options.secretKey) {
    throw new Error("TCB_SECRET_ID and TCB_SECRET_KEY are required");
  }

  const cloudbase = requireNodeSdk();
  const app = cloudbase.init({
    env: options.envId,
    secretId: options.secretId,
    secretKey: options.secretKey,
    sessionToken: options.sessionToken
  });
  const db = app.database();

  process.stdout.write(`Backfilling image assets in env ${options.envId}\n`);
  process.stdout.write(`Mode: ${options.dryRun ? "dry-run" : "write"}\n`);

  for (const collectionName of collections) {
    const summary = await processCollection(app, db, collectionName, options);
    process.stdout.write(
      `- ${summary.collectionName}: scanned ${summary.scanned}, ${options.dryRun ? "would change" : "changed"} ${summary.changed}\n`
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
});
