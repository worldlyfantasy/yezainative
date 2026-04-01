const cloud = require("wx-server-sdk");
const COS = require("cos-nodejs-sdk-v5");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const QUERY_BATCH_SIZE = 100;
const DEFAULT_COLLECTIONS = ["services", "creators", "destinations", "ideas", "app_configs"];
const DEFAULT_PREFIX = "content/services/draft/";
const DEFAULT_REGION = "ap-shanghai";
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_DELETE_LIMIT = 50;
const DELETE_BATCH_SIZE = 50;

function normalizeText(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function normalizePositiveInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeArray(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function buildCdnHosts(bucket, region) {
  const normalizedBucket = normalizeText(bucket);
  const normalizedRegion = normalizeText(region) || DEFAULT_REGION;
  const hosts = [
    `${normalizedBucket}.tcb.qcloud.la`,
    `${normalizedBucket}.cos.${normalizedRegion}.myqcloud.com`
  ];
  return hosts.filter(Boolean);
}

function extractStorageKey(input, cdnHosts) {
  const value = normalizeText(input);
  if (!value) {
    return "";
  }

  if (value.startsWith("cloud://")) {
    const slashIndex = value.indexOf("/", "cloud://".length);
    return slashIndex >= 0 ? value.slice(slashIndex + 1) : "";
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsedUrl = new URL(value);
      if (cdnHosts.has(parsedUrl.host)) {
        return String(parsedUrl.pathname || "").replace(/^\/+/, "");
      }
    } catch (error) {
      return "";
    }
  }

  return "";
}

function collectStorageKeys(value, referencedKeys, cdnHosts, prefix) {
  if (typeof value === "string" || typeof value === "number") {
    const key = extractStorageKey(value, cdnHosts);
    if (key && key.startsWith(prefix)) {
      referencedKeys.add(key);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStorageKeys(item, referencedKeys, cdnHosts, prefix));
    return;
  }

  if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
    return;
  }

  Object.values(value).forEach((item) => collectStorageKeys(item, referencedKeys, cdnHosts, prefix));
}

async function listCollection(collectionName) {
  const rows = [];
  let offset = 0;

  while (true) {
    const result = await db.collection(collectionName).skip(offset).limit(QUERY_BATCH_SIZE).get();
    const batch = result.data || [];
    rows.push(...batch);

    if (batch.length < QUERY_BATCH_SIZE) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

function createCosClient() {
  const SecretId = normalizeText(process.env.TENCENTCLOUD_SECRETID);
  const SecretKey = normalizeText(process.env.TENCENTCLOUD_SECRETKEY);
  const SecurityToken = normalizeText(process.env.TENCENTCLOUD_SESSIONTOKEN);

  if (!SecretId || !SecretKey) {
    throw new Error("SCF temporary credentials are unavailable");
  }

  return new COS({
    SecretId,
    SecretKey,
    SecurityToken
  });
}

async function listDraftObjects(cos, bucket, region, prefix) {
  const items = [];
  let marker = "";

  while (true) {
    const result = await new Promise((resolve, reject) => {
      cos.getBucket(
        {
          Bucket: bucket,
          Region: region,
          Prefix: prefix,
          MaxKeys: 1000,
          Marker: marker
        },
        (error, data) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(data || {});
        }
      );
    });

    const contents = Array.isArray(result.Contents) ? result.Contents : [];
    contents.forEach((item) => {
      const key = normalizeText(item && item.Key);
      if (!key || key.endsWith("/")) {
        return;
      }

      items.push({
        key,
        lastModified: normalizeText(item && item.LastModified),
        size: Number(item && item.Size) || 0
      });
    });

    if (!result.IsTruncated || !contents.length) {
      break;
    }

    const nextMarker = normalizeText(result.NextMarker);
    marker = nextMarker || normalizeText(contents[contents.length - 1] && contents[contents.length - 1].Key);
    if (!marker) {
      break;
    }
  }

  return items;
}

async function deleteKeys(fileKeys, envId, bucket) {
  const deletedKeys = [];

  for (let index = 0; index < fileKeys.length; index += DELETE_BATCH_SIZE) {
    const batch = fileKeys.slice(index, index + DELETE_BATCH_SIZE);
    if (!batch.length) {
      continue;
    }

    const fileList = batch.map((key) => `cloud://${envId}.${bucket}/${key}`);
    const result = await cloud.deleteFile({ fileList });
    const entries = normalizeArray(result && result.fileList, []);

    entries.forEach((entry, entryIndex) => {
      if (normalizeText(entry && entry.code) === "SUCCESS") {
        deletedKeys.push(batch[entryIndex]);
      }
    });
  }

  return deletedKeys;
}

function resolveCleanupOptions(payload) {
  const envId = normalizeText(process.env.TCB_ENV || process.env.ENV_ID);
  const bucket = normalizeText(process.env.STORAGE_BUCKET);
  const region = normalizeText(process.env.STORAGE_REGION) || DEFAULT_REGION;
  const prefix = normalizeText(payload && payload.prefix) || normalizeText(process.env.DRAFT_ASSET_PREFIX) || DEFAULT_PREFIX;
  const retentionDays = normalizePositiveInteger(
    payload && payload.retentionDays,
    normalizePositiveInteger(process.env.DRAFT_RETENTION_DAYS, DEFAULT_RETENTION_DAYS)
  );
  const deleteLimit = normalizePositiveInteger(
    payload && payload.deleteLimit,
    normalizePositiveInteger(process.env.DRAFT_DELETE_LIMIT, DEFAULT_DELETE_LIMIT)
  );
  const collections = normalizeArray(payload && payload.collections, [])
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const dryRun = Boolean(payload && payload.dryRun);

  if (!envId) {
    throw new Error("TCB_ENV is unavailable");
  }

  if (!bucket) {
    throw new Error("STORAGE_BUCKET is required");
  }

  return {
    envId,
    bucket,
    region,
    prefix,
    retentionDays,
    deleteLimit,
    dryRun,
    collections: collections.length ? collections : DEFAULT_COLLECTIONS
  };
}

async function cleanupDraftAssets(payload) {
  const options = resolveCleanupOptions(payload);
  const cos = createCosClient();
  const cdnHosts = new Set(buildCdnHosts(options.bucket, options.region));
  const cutoffTime = Date.now() - options.retentionDays * 24 * 60 * 60 * 1000;
  const referencedKeys = new Set();
  const scannedCollections = {};

  for (const collectionName of options.collections) {
    const docs = await listCollection(collectionName);
    scannedCollections[collectionName] = docs.length;
    docs.forEach((doc) => collectStorageKeys(doc, referencedKeys, cdnHosts, options.prefix));
  }

  const draftObjects = await listDraftObjects(cos, options.bucket, options.region, options.prefix);
  const referencedUnderPrefix = Array.from(referencedKeys).filter((key) => key.startsWith(options.prefix));
  const candidates = draftObjects
    .filter((item) => {
      if (referencedKeys.has(item.key)) {
        return false;
      }

      const timestamp = Date.parse(item.lastModified || "");
      return Number.isFinite(timestamp) && timestamp < cutoffTime;
    })
    .sort((left, right) => Date.parse(left.lastModified || "") - Date.parse(right.lastModified || ""));

  const keysToDelete = options.dryRun ? [] : candidates.slice(0, options.deleteLimit).map((item) => item.key);
  const deletedKeys = keysToDelete.length
    ? await deleteKeys(keysToDelete, options.envId, options.bucket)
    : [];

  return {
    dryRun: options.dryRun,
    prefix: options.prefix,
    retentionDays: options.retentionDays,
    cutoffAt: new Date(cutoffTime).toISOString(),
    scannedCollections,
    referencedCount: referencedUnderPrefix.length,
    scannedDraftObjectCount: draftObjects.length,
    candidateCount: candidates.length,
    deletedCount: deletedKeys.length,
    remainingCandidateCount: Math.max(0, candidates.length - deletedKeys.length),
    deletedKeys,
    candidateSamples: candidates.slice(0, 20).map((item) => ({
      key: item.key,
      lastModified: item.lastModified,
      size: item.size
    }))
  };
}

const handlers = {
  cleanupDraftAssets: (payload) => cleanupDraftAssets(payload)
};

exports.main = async (event) => {
  const action =
    normalizeText(event && event.action) ||
    (normalizeText(event && event.Type) === "Timer" ? "cleanupDraftAssets" : "");
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler(payload, event);
    return {
      ok: true,
      data
    };
  } catch (error) {
    console.error("maintenanceGateway failed", {
      action,
      error
    });
    return {
      ok: false,
      error: error && error.message ? error.message : "maintenanceGateway failed"
    };
  }
};
