const path = require("path");
const { URL } = require("url");

let sharpModule;
let sharpUnavailableLogged = false;

function getSharp() {
  if (sharpModule !== undefined) {
    return sharpModule;
  }

  try {
    sharpModule = require("sharp");
  } catch (error) {
    sharpModule = null;

    if (!sharpUnavailableLogged) {
      sharpUnavailableLogged = true;
      console.warn("sharp is unavailable, image variant generation will fall back to original assets", {
        message: error && error.message ? error.message : "unknown error"
      });
    }
  }

  return sharpModule;
}

const IMAGE_VARIANTS = {
  card: {
    quality: 80,
    width: 640
  },
  detail: {
    quality: 84,
    width: 1280
  }
};

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeText(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickFirstString(candidates) {
  for (let index = 0; index < candidates.length; index += 1) {
    const normalized = normalizeText(candidates[index]);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function isCloudFileId(value) {
  return /^cloud:\/\/[^/]+\/.+$/.test(normalizeText(value));
}

function getCloudFilePath(fileID) {
  const matched = normalizeText(fileID).match(/^cloud:\/\/[^/]+\/(.+)$/);
  return matched ? matched[1] : "";
}

function looksLikeHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function getImageAsset(value) {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = normalizeText(value);
    return normalized
      ? {
          original: normalized,
          card: "",
          detail: ""
        }
      : null;
  }

  if (Array.isArray(value)) {
    return getImageAsset(value[0]);
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const card = normalizeText(value.card);
  const detail = normalizeText(value.detail);
  const original = pickFirstString([
    value.original,
    value.fileID,
    value.cloudFileID,
    value.url,
    value.src,
    value.image,
    value.coverImage,
    value.cover,
    value.avatar,
    value.path,
    detail,
    card
  ]);

  if (!original && !card && !detail) {
    return null;
  }

  return {
    original,
    card,
    detail
  };
}

function normalizeImageAssetValue(value) {
  const asset = getImageAsset(value);
  if (!asset) {
    return "";
  }

  if (asset.original && asset.card && asset.detail) {
    return asset;
  }

  if (!asset.card && !asset.detail) {
    return asset.original;
  }

  return {
    original: asset.original || asset.detail || asset.card,
    card: asset.card || asset.original || asset.detail,
    detail: asset.detail || asset.original || asset.card
  };
}

function getImageAssetOriginal(value) {
  const asset = getImageAsset(value);
  return asset ? asset.original || asset.detail || asset.card : "";
}

function getImageAssetVariant(value, variant) {
  const asset = getImageAsset(value);
  if (!asset) {
    return "";
  }

  if (variant === "detail") {
    return asset.detail || asset.original || asset.card || "";
  }

  if (variant === "card") {
    return asset.card || asset.detail || asset.original || "";
  }

  return asset.original || asset.detail || asset.card || "";
}

function listImageAssetRefs(value) {
  const asset = getImageAsset(value);
  if (!asset) {
    return [];
  }

  return Array.from(new Set([asset.original, asset.card, asset.detail].map(normalizeText).filter(Boolean)));
}

function getImageAssetIdentity(value) {
  return getImageAssetOriginal(value) || getImageAssetVariant(value, "detail") || getImageAssetVariant(value, "card");
}

function buildImageAssetFallback(asset, sourceRef) {
  return {
    original: sourceRef,
    card: asset.card || sourceRef,
    detail: asset.detail || sourceRef
  };
}

function dedupeImageValues(values) {
  const seen = new Set();

  return normalizeArray(values).filter((item) => {
    const identity = getImageAssetIdentity(item);
    if (!identity || seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

function stripVariantSuffix(baseName) {
  return baseName.replace(/__(card|detail)$/i, "");
}

function getPathInfoFromSourceRef(sourceRef) {
  if (isCloudFileId(sourceRef)) {
    return {
      path: getCloudFilePath(sourceRef)
    };
  }

  if (looksLikeHttpUrl(sourceRef)) {
    try {
      const url = new URL(sourceRef);
      return {
        path: normalizeText(url.pathname).replace(/^\/+/, "")
      };
    } catch (error) {
      return {
        path: ""
      };
    }
  }

  return {
    path: ""
  };
}

function buildVariantCloudPath(sourceRef, variant, extension, fallbackFolder) {
  const sourcePath = getPathInfoFromSourceRef(sourceRef).path;
  const preferredFolder = normalizeText(fallbackFolder) || "content/image-assets";
  const normalizedExtension = normalizeText(extension) || ".jpg";
  const resolvedDir = sourcePath ? path.posix.dirname(sourcePath) : preferredFolder;
  const sourceBaseName = sourcePath ? path.posix.basename(sourcePath, path.posix.extname(sourcePath)) : "image";
  const baseName = stripVariantSuffix(sourceBaseName) || "image";
  return `${resolvedDir}/${baseName}__${variant}${normalizedExtension}`;
}

async function createVariantBuffers(sourceBuffer) {
  const sharp = getSharp();
  if (!sharp) {
    return null;
  }

  const metadata = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  const format = normalizeText(metadata && metadata.format).toLowerCase();

  if (format === "svg") {
    return null;
  }

  const usePng = Boolean(metadata && metadata.hasAlpha);
  const extension = usePng ? ".png" : ".jpg";

  const buildBuffer = async (width, quality) => {
    let pipeline = sharp(sourceBuffer, { animated: false, failOn: "none" })
      .rotate()
      .resize({
        width,
        fit: "inside",
        withoutEnlargement: true
      });

    if (usePng) {
      pipeline = pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
        quality
      });
    } else {
      pipeline = pipeline.jpeg({
        quality,
        progressive: true,
        mozjpeg: true
      });
    }

    return {
      buffer: await pipeline.toBuffer(),
      extension
    };
  };

  return {
    card: await buildBuffer(IMAGE_VARIANTS.card.width, IMAGE_VARIANTS.card.quality),
    detail: await buildBuffer(IMAGE_VARIANTS.detail.width, IMAGE_VARIANTS.detail.quality)
  };
}

async function ensureImageAssetValue(value, options) {
  const asset = getImageAsset(value);
  if (!asset) {
    return "";
  }

  if (asset.original && asset.card && asset.detail) {
    return asset;
  }

  const sourceRef = asset.original || asset.detail || asset.card;
  if (!sourceRef) {
    return "";
  }

  const fallbackAsset = buildImageAssetFallback(asset, sourceRef);
  if (!getSharp()) {
    return fallbackAsset;
  }

  const downloadSource = options && options.downloadSource;
  const uploadBuffer = options && options.uploadBuffer;
  if (typeof downloadSource !== "function" || typeof uploadBuffer !== "function") {
    throw new Error("Image asset processing callbacks are required");
  }

  const downloadResult = await downloadSource(sourceRef);
  const sourceBuffer = downloadResult && downloadResult.buffer;
  if (!sourceBuffer) {
    return fallbackAsset;
  }

  const variants = await createVariantBuffers(sourceBuffer);
  if (!variants) {
    return fallbackAsset;
  }

  const nextAsset = {
    original: sourceRef,
    card: asset.card,
    detail: asset.detail
  };

  const fallbackFolder = normalizeText(options && options.fallbackFolder);
  const uploadVariant = async (variantName) => {
    const variantData = variants[variantName];
    const cloudPath = buildVariantCloudPath(sourceRef, variantName, variantData.extension, fallbackFolder);
    return uploadBuffer({
      buffer: variantData.buffer,
      cloudPath,
      sourceRef,
      variant: variantName
    });
  };

  if (!nextAsset.card) {
    nextAsset.card = normalizeText(await uploadVariant("card")) || sourceRef;
  }

  if (!nextAsset.detail) {
    nextAsset.detail = normalizeText(await uploadVariant("detail")) || sourceRef;
  }

  return nextAsset;
}

module.exports = {
  buildVariantCloudPath,
  dedupeImageValues,
  ensureImageAssetValue,
  getCloudFilePath,
  getImageAsset,
  getImageAssetIdentity,
  getImageAssetOriginal,
  getImageAssetVariant,
  isCloudFileId,
  listImageAssetRefs,
  looksLikeHttpUrl,
  normalizeImageAssetValue,
  normalizeText
};
