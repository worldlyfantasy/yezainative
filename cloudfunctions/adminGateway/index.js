const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const http = require("http");
const https = require("https");
const { pinyin } = require("pinyin-pro");
const { URL } = require("url");
const {
  dedupeImageValues,
  ensureImageAssetValue,
  getCloudFilePath: getImageCloudFilePath,
  getImageAssetOriginal,
  getImageAssetVariant,
  isCloudFileId: isImageCloudFileId,
  listImageAssetRefs,
  looksLikeHttpUrl,
  normalizeImageAssetValue
} = require("./image-assets");

const DESTINATION_REGION_OPTIONS = [
  { label: "藏区", value: "cn_tibetan" },
  { label: "新疆", value: "cn_xinjiang" },
  { label: "西北", value: "cn_great_northwest" },
  { label: "江浙沪", value: "cn_jiang_zhe_hu" },
  { label: "华中山水", value: "cn_central_landscape" },
  { label: "云贵川", value: "cn_yun_gui_chuan" },
  { label: "华南海岛", value: "cn_south_islands" },
  { label: "京津冀", value: "cn_jing_jin_ji" },
  { label: "中原", value: "cn_central_plain" },
  { label: "东北", value: "cn_northeast_region" },
  { label: "内蒙古", value: "cn_inner_mongolia" },
  { label: "日韩", value: "intl_japan_korea" },
  { label: "东南亚", value: "intl_southeast_asia" },
  { label: "南亚", value: "intl_south_asia" },
  { label: "中东", value: "intl_middle_east" },
  { label: "欧洲", value: "intl_europe" },
  { label: "美洲", value: "intl_americas" },
  { label: "非洲", value: "intl_africa" },
  { label: "大洋洲", value: "intl_oceania" }
];

const LEGACY_DESTINATION_REGION_CODE_ALIASES = {
  "cn_north": "cn_jing_jin_ji",
  "cn_northeast": "cn_northeast_region",
  "cn_east": "cn_jiang_zhe_hu",
  "cn_central": "cn_central_landscape",
  "cn_south": "cn_south_islands",
  "cn_southwest": "cn_yun_gui_chuan",
  "cn_northwest": "cn_great_northwest",
  "greater_china_hmt": "",
  "asia_east": "intl_japan_korea",
  "asia_southeast": "intl_southeast_asia",
  "asia_south": "intl_south_asia",
  "asia_central": "",
  "asia_west_middle_east": "intl_middle_east",
  "europe": "intl_europe",
  "africa": "intl_africa",
  "north_america": "intl_americas",
  "latin_america": "intl_americas",
  "oceania": "intl_oceania"
};

const LEGACY_DESTINATION_REGION_BY_SLUG = {
  "aba-highlands": "cn_tibetan",
  "qiandong-valley": "cn_yun_gui_chuan",
  "minbei-creek": "cn_jiang_zhe_hu",
  "hexicorridor": "cn_great_northwest",
  "enxi-gorge": "cn_central_landscape",
  "nanjiang-dune": "cn_xinjiang",
  "songhua-river": "cn_northeast_region",
  "lancang-source": "cn_tibetan",
  "qiongbay-salt": "cn_south_islands",
  "yunnan-rainforest": "cn_yun_gui_chuan",
  "wuyi-ancient": "cn_jiang_zhe_hu",
  "qinghai-lake": "cn_tibetan"
};

const DESTINATION_REGION_LABEL_MAP = DESTINATION_REGION_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

function normalizeDestinationRegionCode(value, fallbackValue = "") {
  const code = String(value || fallbackValue || "").trim();
  const normalizedCode = Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, code)
    ? code
    : (LEGACY_DESTINATION_REGION_CODE_ALIASES[code] || "");
  return Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, normalizedCode) ? normalizedCode : "";
}

function inferDestinationRegionCodeBySlug(slug) {
  return normalizeDestinationRegionCode(LEGACY_DESTINATION_REGION_BY_SLUG[String(slug || "").trim()] || "");
}

function resolveDestinationRegionCode(value, slug, fallbackValue = "") {
  const explicitCode = Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, String(value || "").trim())
    ? String(value || "").trim()
    : "";
  const explicitFallbackCode = Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, String(fallbackValue || "").trim())
    ? String(fallbackValue || "").trim()
    : "";

  return (
    explicitCode
    || explicitFallbackCode
    || inferDestinationRegionCodeBySlug(slug)
    || normalizeDestinationRegionCode(value)
    || normalizeDestinationRegionCode(fallbackValue)
  );
}

function getDestinationRegionLabel(code) {
  const normalizedCode = normalizeDestinationRegionCode(code);
  return normalizedCode ? DESTINATION_REGION_LABEL_MAP[normalizedCode] : "";
}

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const app = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});
const auth = app.auth();
const models = app.models;
const runSQL = models.$runSQL || models.runSQL;
const rdb = app.rdb();
const QUERY_BATCH_SIZE = 100;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CONFIG_COLLECTION = "app_configs";
const ADMIN_COLLECTION = "admin_accounts";
const ORDER_EVENTS_COLLECTION = "order_events";
const COLLECTIONS = {
  services: "services",
  creators: "creators",
  destinations: "destinations",
  ideas: "ideas",
  users: "users"
};
const CONTENT_GATEWAY_FUNCTION_NAME = normalizeText(process.env.CONTENT_GATEWAY_FUNCTION) || "contentGateway";
const CACHE_INVALIDATE_ACTIONS = new Set([
  "saveService",
  "deleteService",
  "saveServicePeriod",
  "deleteServicePeriod",
  "saveCreator",
  "deleteCreator",
  "saveDestination",
  "deleteDestination",
  "saveIdea",
  "deleteIdea",
  "saveConfigDetail"
]);
const SERVICE_TYPE_OPTIONS = ["在地体验", "短途旅行", "长途旅行", "国际旅行"];
const LEGACY_SERVICE_TYPE_OPTIONS = ["带团旅行", "定制规划", "路线设计"];
const DEFAULT_SERVICE_TYPE = "短途旅行";
const ADMIN_ROLE_NAMES = ["admin", "super_admin", "yezai_admin", "ops_admin"];
const ADMIN_ACCOUNT_LEVELS = ["owner", "admin"];
const ADMIN_ACCOUNT_STATUSES = ["active", "inactive"];
const ADMIN_ACCOUNT_IDENTIFIER_FIELDS = ["uid", "customUserId", "username", "email", "phone"];
const SERVICE_STATUSES = ["active", "inactive"];
const SERVICE_PERIOD_STATUSES = ["available", "confirmed", "soldout", "closed", "inactive"];
const ROUTE_TAG_OPTIONS = [
  "城市漫游",
  "慢旅行",
  "徒步与自然",
  "度假放松",
  "亲子&逆向亲子",
  "人宠",
  "摄影创作",
  "瑜伽疗愈",
  "特殊节庆"
];
const CREATOR_TAG_OPTIONS = [
  "自然野行",
  "在地人文",
  "城市探索",
  "公路旅行",
  "影像记录",
  "身心疗愈",
  "研学观察",
  "风物美食",
  "亲子同行",
  "宠物同行"
];
const IDEA_THEME_OPTIONS = [
  { key: "hiking-nature", label: "徒步自然" },
  { key: "city-walk", label: "城市漫游" },
  { key: "local-life", label: "在地生活" },
  { key: "craft-labor", label: "劳动手艺" },
  { key: "reset-recovery", label: "疲惫重置" },
  { key: "sensory-notes", label: "感官采集" },
  { key: "inner-growth", label: "内在成长" }
];
const CUSTOM_IDEA_THEME_KEY = "custom";
const IDEA_SOURCE_TYPES = ["mini", "wechat", "hybrid"];
const DEFAULT_IDEA_SOURCE_TYPE = "mini";
const DEFAULT_IDEA_READ_MORE_TEXT = "阅读全文";
const IDEA_THEME_LABEL_MAP = IDEA_THEME_OPTIONS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});
const DEFAULT_SERVICE_SECTIONS = [
  { key: "overview", title: "概况", anchorId: "section_overview" },
  { key: "highlights", title: "亮点", anchorId: "section_highlights" },
  { key: "itinerary", title: "行程", anchorId: "section_itinerary" },
  { key: "notices", title: "须知", anchorId: "section_notices" }
];
const SERVICE_ASSET_ROOT = "content/services/";
const SERVICE_DRAFT_ASSET_PREFIX = `${SERVICE_ASSET_ROOT}draft/`;
const DASHBOARD_PREVIEW_LIMIT = 3;
const DASHBOARD_TREND_DAYS = 7;
const DASHBOARD_UPCOMING_DAYS = 14;
const DASHBOARD_STOCK_WARNING_THRESHOLD = 3;
const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REMOTE_IMAGE_REDIRECTS = 4;
const REMOTE_IMAGE_TIMEOUT_MS = 10000;
const IMAGE_MIME_EXTENSION_MAP = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif"
};
const DESTINATION_SLUG_NAME_OVERRIDES = {
  "阿坝高地": "aba-highlands",
  "黔东南山谷": "qiandong-valley",
  "闽北溪谷": "minbei-creek",
  "河西走廊": "hexicorridor",
  "鄂西峡谷": "enxi-gorge",
  "南疆沙丘带": "nanjiang-dune",
  "松花江畔": "songhua-river",
  "澜沧江源区": "lancang-source",
  "琼北盐田": "qiongbay-salt",
  "滇西南雨林": "yunnan-rainforest",
  "武夷古道": "wuyi-ancient",
  "青海湖畔": "qinghai-lake"
};
const SERVICE_SLUG_NAME_OVERRIDES = {
  "高原谷地徒步手帐": "ridge-journal",
  "河西走廊风声记录": "hexi-tracing",
  "澜沧江源水系小实验": "lancang-source-lab",
  "山谷夜步与寨子谈话": "miao-night-walk",
  "盐田潮汐观测日志": "salt-pan-diary",
  "松花江口码头漫步": "songhua-dock",
  "鄂西峡谷共居计划": "enxi-residency",
  "沙丘黄昏聆听": "dune-sunset",
  "湖岸环线体感": "qinghai-loop",
  "雨林晨雾观察": "rainforest-dawn",
  "武夷古道静心行": "wuyi-ink-trail",
  "溪谷水声研究": "minbei-creek-study"
};
const DESTINATION_SLUG_PHRASES = [
  ["河西走廊", "hexicorridor"],
  ["阿坝", "aba"],
  ["黔东南", "qiandong"],
  ["闽北", "minbei"],
  ["河西", "hexi"],
  ["鄂西", "enxi"],
  ["南疆", "nanjiang"],
  ["松花江", "songhua"],
  ["澜沧江", "lancang"],
  ["琼北", "qiongbay"],
  ["滇西南", "yunnan"],
  ["武夷", "wuyi"],
  ["青海", "qinghai"],
  ["高地", "highlands"],
  ["山谷", "valley"],
  ["溪谷", "creek"],
  ["峡谷", "gorge"],
  ["沙丘带", "dune"],
  ["沙丘", "dune"],
  ["江畔", "river"],
  ["源区", "source"],
  ["盐田", "salt"],
  ["雨林", "rainforest"],
  ["古道", "ancient"],
  ["湖畔", "lake"]
].sort((left, right) => right[0].length - left[0].length);
const SERVICE_SLUG_PHRASES = [
  ["高原谷地", "ridge"],
  ["苗寨", "miao"],
  ["盐田", "salt-pan"],
  ["松花江口", "songhua"],
  ["雨林", "rainforest"],
  ["沙丘", "dune"],
  ["湖岸", "qinghai"],
  ["徒步手帐", "journal"],
  ["风声记录", "tracing"],
  ["水系小实验", "lab"],
  ["夜步与寨子谈话", "night-walk"],
  ["潮汐观测日志", "diary"],
  ["码头漫步", "dock"],
  ["共居计划", "residency"],
  ["黄昏聆听", "sunset"],
  ["环线体感", "loop"],
  ["晨雾观察", "dawn"],
  ["静心行", "ink-trail"],
  ["水声研究", "study"]
].sort((left, right) => right[0].length - left[0].length);

function normalizeText(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function formatDateTime(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

function sanitizePathSegment(value) {
  return normalizeText(value)
    .replace(/[^0-9a-zA-Z/!_\-.*\u4e00-\u9fa5 ]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function getExtensionFromMimeType(contentType) {
  return IMAGE_MIME_EXTENSION_MAP[normalizeText(contentType).toLowerCase()] || "";
}

function getExtensionFromFileName(fileName) {
  const normalized = normalizeText(fileName);
  const matched = normalized.match(/(\.[a-zA-Z0-9]+)$/);
  return matched ? matched[1].toLowerCase() : "";
}

function getExtensionFromUrlPath(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    return getExtensionFromFileName(decodeURIComponent(parsedUrl.pathname || ""));
  } catch (error) {
    return "";
  }
}

function buildCloudPath(folder, fileName, fallbackExtension) {
  const safeFolder = sanitizePathSegment(folder || "uploads");
  const normalizedName = normalizeText(fileName) || "image";
  const detectedExtension = getExtensionFromFileName(normalizedName) || normalizeText(fallbackExtension);
  const baseName = detectedExtension ? normalizedName.slice(0, -detectedExtension.length) : normalizedName;
  const safeName = sanitizePathSegment(baseName || "image").replace(/\//g, "-");
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${safeFolder}/${Date.now()}-${nonce}-${safeName}${detectedExtension}`;
}

function resolveRemoteFileName(rawUrl, contentType) {
  try {
    const parsedUrl = new URL(rawUrl);
    const pathname = decodeURIComponent(parsedUrl.pathname || "");
    const rawName = pathname.split("/").filter(Boolean).pop() || "image";
    const extension = getExtensionFromFileName(rawName) || getExtensionFromMimeType(contentType) || ".jpg";

    if (getExtensionFromFileName(rawName)) {
      return rawName;
    }

    return `${rawName || "image"}${extension}`;
  } catch (error) {
    return `image${getExtensionFromMimeType(contentType) || ".jpg"}`;
  }
}

function normalizeUploadImageFileName(fileName, contentType) {
  const normalized = normalizeText(fileName);
  const providedExtension = getExtensionFromFileName(normalized);
  const fallbackExtension = getExtensionFromMimeType(contentType) || ".jpg";
  const extension = providedExtension || fallbackExtension;
  const baseName = providedExtension ? normalized.slice(0, -providedExtension.length) : normalized;
  return `${baseName || "image"}${extension}`;
}

function parseBase64ImagePayload(rawValue) {
  const normalized = normalizeText(rawValue);
  assertCondition(normalized, "缺少图片内容");

  const dataUrlMatch = normalized.match(/^data:([^;,]+)?;base64,(.+)$/i);
  const mimeType = normalizeText(dataUrlMatch && dataUrlMatch[1]).toLowerCase();
  const rawBase64 = dataUrlMatch && dataUrlMatch[2] ? dataUrlMatch[2] : normalized;
  const base64 = String(rawBase64 || "").replace(/\s+/g, "");
  assertCondition(base64, "图片内容为空");
  assertCondition(/^[A-Za-z0-9+/=]+$/.test(base64), "图片内容格式不正确");

  const buffer = Buffer.from(base64, "base64");
  assertCondition(buffer.length > 0, "图片内容解析失败");
  assertCondition(buffer.length <= MAX_REMOTE_IMAGE_BYTES, "图片体积过大，请控制在 15MB 以内");

  return {
    buffer,
    mimeType
  };
}

function downloadRemoteImage(rawUrl, redirectCount = 0) {
  const normalizedUrl = normalizeText(rawUrl);
  assertCondition(/^https?:\/\//i.test(normalizedUrl), "请填写有效的图片链接");
  assertCondition(redirectCount <= MAX_REMOTE_IMAGE_REDIRECTS, "图片链接跳转过多，请更换链接重试");

  return new Promise((resolve, reject) => {
    const requestClient = normalizedUrl.startsWith("https://") ? https : http;
    let settled = false;

    const succeed = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error instanceof Error ? error : new Error("图片链接下载失败，请稍后重试"));
    };

    const request = requestClient.get(normalizedUrl, (response) => {
      const statusCode = response.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        const nextUrl = new URL(response.headers.location, normalizedUrl).toString();
        response.resume();
        downloadRemoteImage(nextUrl, redirectCount + 1).then(succeed).catch(fail);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        fail(new Error("图片链接下载失败，请检查链接是否可访问"));
        return;
      }

      const contentType = normalizeText(response.headers["content-type"]).split(";")[0].toLowerCase();
      const derivedExtension = getExtensionFromMimeType(contentType) || getExtensionFromUrlPath(normalizedUrl);

      if (contentType && !contentType.startsWith("image/") && !derivedExtension) {
        response.resume();
        fail(new Error("链接内容不是图片，请更换链接后重试"));
        return;
      }

      const chunks = [];
      let totalSize = 0;

      response.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_REMOTE_IMAGE_BYTES) {
          response.destroy();
          fail(new Error("图片体积过大，请控制在 15MB 以内"));
          return;
        }

        chunks.push(chunk);
      });

      response.on("end", () => {
        if (!chunks.length) {
          fail(new Error("未下载到图片内容，请更换链接后重试"));
          return;
        }

        succeed({
          buffer: Buffer.concat(chunks),
          contentType,
          finalUrl: normalizedUrl
        });
      });

      response.on("error", () => {
        fail(new Error("图片链接下载失败，请稍后重试"));
      });
    });

    request.setTimeout(REMOTE_IMAGE_TIMEOUT_MS, () => {
      request.destroy(new Error("timeout"));
      fail(new Error("图片链接下载超时，请稍后重试"));
    });

    request.on("error", () => {
      fail(new Error("图片链接下载失败，请稍后重试"));
    });
  });
}

async function uploadImageFromUrl(payload) {
  const imageUrl = normalizeText(payload && payload.imageUrl);
  const folder = normalizeText(payload && payload.folder);
  assertCondition(imageUrl, "请填写图片链接");
  assertCondition(folder, "缺少图片存储目录");

  const downloadResult = await downloadRemoteImage(imageUrl);
  const fileName = resolveRemoteFileName(downloadResult.finalUrl, downloadResult.contentType);
  const cloudPath = buildCloudPath(folder, fileName, getExtensionFromMimeType(downloadResult.contentType));
  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: downloadResult.buffer
  });

  return {
    fileID: normalizeText(uploadResult && uploadResult.fileID),
    cloudPath
  };
}

async function uploadImageFile(payload) {
  const folder = normalizeText(payload && payload.folder);
  const fileName = normalizeText(payload && payload.fileName);
  const contentType = normalizeText(payload && payload.contentType).toLowerCase();
  const base64 = payload && (payload.base64 || payload.dataUrl);

  assertCondition(folder, "缺少图片存储目录");

  const parsed = parseBase64ImagePayload(base64);
  const effectiveContentType = parsed.mimeType || contentType;
  const normalizedFileName = normalizeUploadImageFileName(fileName, effectiveContentType);
  const cloudPath = buildCloudPath(
    folder,
    normalizedFileName,
    getExtensionFromMimeType(effectiveContentType) || getExtensionFromFileName(normalizedFileName)
  );
  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: parsed.buffer
  });

  return {
    fileID: normalizeText(uploadResult && uploadResult.fileID),
    cloudPath
  };
}

async function downloadImageAssetSource(sourceRef) {
  if (isCloudFileId(sourceRef)) {
    const result = await cloud.downloadFile({
      fileID: sourceRef
    });

    return {
      buffer: result && result.fileContent ? result.fileContent : null
    };
  }

  if (looksLikeHttpUrl(sourceRef)) {
    return downloadRemoteImage(sourceRef);
  }

  throw new Error("不支持的图片来源");
}

async function uploadImageVariantBuffer(options) {
  const result = await cloud.uploadFile({
    cloudPath: normalizeText(options && options.cloudPath),
    fileContent: options && options.buffer
  });

  return normalizeText(result && result.fileID);
}

async function cloneCloudFileToPath(sourceFileID, cloudPath) {
  const downloadResult = await cloud.downloadFile({
    fileID: normalizeText(sourceFileID)
  });

  const sourceBuffer = downloadResult && downloadResult.fileContent ? downloadResult.fileContent : null;
  assertCondition(sourceBuffer, "草稿图片源文件不存在，请重新上传后再试");

  const uploadResult = await cloud.uploadFile({
    cloudPath: normalizeText(cloudPath),
    fileContent: sourceBuffer
  });

  return normalizeText(uploadResult && uploadResult.fileID);
}

function createImageAssetProcessingOptions(fallbackFolder) {
  return {
    fallbackFolder,
    downloadSource: downloadImageAssetSource,
    uploadBuffer: uploadImageVariantBuffer
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTravelerSnapshot(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const documentNumber = normalizeText(source.documentNumber || source.idCard || source.idNo || source.i);
  const documentType = normalizeText(source.documentType || source.t);
  return {
    name: normalizeText(source.name || source.n),
    phone: normalizeText(source.phone || source.p),
    documentType,
    documentNumber,
    idCard: documentNumber,
    wechat: normalizeText(source.wechat || source.w),
    note: normalizeText(source.note || source.o)
  };
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInteger(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolvePeriodSoldCount(record, fallback = 0) {
  return Math.max(
    0,
    normalizePositiveInteger(
      record && (record.soldCount ?? record.soldSeats),
      fallback
    )
  );
}

function resolvePeriodTotalSeats(record, soldCount = 0) {
  const explicitTotalSeats = normalizePositiveInteger(record && record.totalSeats, -1);
  if (explicitTotalSeats >= 0) {
    return explicitTotalSeats;
  }

  const legacyRemainingSeats = normalizePositiveInteger(record && record.remainingSeats, 0);
  return legacyRemainingSeats + Math.max(0, soldCount);
}

function resolvePeriodRemainingSeats(record, soldCount = 0) {
  const explicitRemainingSeats = normalizePositiveInteger(record && record.remainingSeats, -1);
  if (explicitRemainingSeats >= 0) {
    return explicitRemainingSeats;
  }

  return Math.max(0, resolvePeriodTotalSeats(record, soldCount) - Math.max(0, soldCount));
}

function normalizeManualServicePeriodStatus(status) {
  return normalizeText(status) === "inactive" ? "inactive" : "available";
}

function isServicePeriodExpired(record, today = getShanghaiTodayDateString()) {
  const dateEnd = normalizeText(record && record.dateEnd);
  return Boolean(dateEnd && today && dateEnd < today);
}

function resolveDisplayServicePeriodStatus(record, soldCount = resolvePeriodSoldCount(record)) {
  const manualStatus = normalizeManualServicePeriodStatus(record && record.status);
  if (manualStatus === "inactive") {
    return "inactive";
  }

  const today = getShanghaiTodayDateString();
  if (isServicePeriodExpired(record, today)) {
    return "inactive";
  }

  const totalSeats = resolvePeriodTotalSeats(record, soldCount);
  const minGroup = Math.max(1, normalizePositiveInteger(record && record.minGroup, 1));
  const dateStart = normalizeText(record && record.dateStart);

  if (dateStart && today && dateStart <= today) {
    return "closed";
  }

  if (totalSeats <= 0 || soldCount >= totalSeats) {
    return "soldout";
  }

  if (soldCount >= minGroup) {
    return "confirmed";
  }

  return "available";
}

function getOrderUserId(user) {
  return normalizeText(user && (user._id || user.id));
}

function buildOrderUserMap(users) {
  return normalizeArray(users).reduce((map, user) => {
    const userKeyCandidates = [user && user.openid, user && user._openid]
      .map((item) => normalizeText(item))
      .filter(Boolean);

    userKeyCandidates.forEach((key) => {
      map[key] = {
        userId: getOrderUserId(user),
        userNickname: normalizeText(user && user.nickname) || "旅人"
      };
    });

    return map;
  }, {});
}

function resolveOrderUserSummary(userMap, userOpenid) {
  const normalizedOpenid = normalizeText(userOpenid);
  const matched = normalizedOpenid ? userMap[normalizedOpenid] : null;

  return {
    userId: normalizeText(matched && matched.userId) || normalizedOpenid || "--",
    userNickname: normalizeText(matched && matched.userNickname) || "旅人"
  };
}

function createOrderStatusLogEntry(entry) {
  const status = normalizeText(entry && entry.status);
  const occurredAtTs = normalizeNumber(entry && entry.occurredAtTs, 0);
  if (!status || occurredAtTs <= 0) {
    return null;
  }

  const source = normalizeText(entry && entry.source) || "status_change";
  return {
    key: normalizeText(entry && entry.key) || `${status}-${occurredAtTs}-${source}`,
    status,
    fromStatus: normalizeText(entry && entry.fromStatus),
    source,
    occurredAtTs,
    occurredAtText: normalizeText(entry && entry.occurredAtText) || formatDateTime(occurredAtTs)
  };
}

function buildSyntheticOrderStatusLogs(orderRecord) {
  const logs = [];
  const createdAtTs = normalizeNumber(orderRecord && (orderRecord.createdAtTs || orderRecord.createdAt), 0);
  const paidAtTs = normalizeNumber(orderRecord && orderRecord.paidAtTs, 0);
  const canceledAtTs = normalizeNumber(orderRecord && orderRecord.canceledAtTs, 0);
  const updatedAtTs = normalizeNumber(orderRecord && orderRecord.updatedAt, 0);
  const currentStatus = normalizeText(orderRecord && orderRecord.status);

  if (createdAtTs > 0) {
    logs.push(createOrderStatusLogEntry({
      key: `created-${createdAtTs}`,
      status: "pending",
      source: "create",
      occurredAtTs: createdAtTs,
      occurredAtText: normalizeText(orderRecord && orderRecord.createdAtText)
    }));
  }

  if (paidAtTs > 0) {
    logs.push(createOrderStatusLogEntry({
      key: `paid-${paidAtTs}`,
      status: "paid",
      fromStatus: "pending",
      source: "status_change",
      occurredAtTs: paidAtTs
    }));
  }

  if (canceledAtTs > 0) {
    logs.push(createOrderStatusLogEntry({
      key: `canceled-${canceledAtTs}`,
      status: "canceled",
      source: "status_change",
      occurredAtTs: canceledAtTs
    }));
  }

  const normalizedLogs = logs.filter(Boolean);
  const latestKnownTs = normalizedLogs.reduce(
    (maxValue, item) => Math.max(maxValue, normalizeNumber(item && item.occurredAtTs, 0)),
    0
  );
  const latestKnownStatus = normalizedLogs.length ? normalizeText(normalizedLogs[normalizedLogs.length - 1].status) : "";

  if (currentStatus && updatedAtTs > 0 && currentStatus !== latestKnownStatus) {
    normalizedLogs.push(createOrderStatusLogEntry({
      key: `current-${currentStatus}-${updatedAtTs}`,
      status: currentStatus,
      source: "current_state",
      occurredAtTs: updatedAtTs
    }));
  }

  return normalizedLogs.filter(Boolean);
}

function mapOrderEventDoc(doc) {
  return createOrderStatusLogEntry({
    key: normalizeText(doc && doc._id),
    status: doc && doc.status,
    fromStatus: doc && doc.fromStatus,
    source: doc && doc.source,
    occurredAtTs: doc && doc.occurredAtTs,
    occurredAtText: doc && doc.occurredAtText
  });
}

function buildOrderStatusLogs(orderRecord, eventDocs) {
  const merged = [];
  const seenKeys = new Set();

  buildSyntheticOrderStatusLogs(orderRecord)
    .concat(normalizeArray(eventDocs).map(mapOrderEventDoc).filter(Boolean))
    .forEach((item) => {
      const dedupeKey = `${normalizeText(item && item.status)}-${normalizeNumber(item && item.occurredAtTs, 0)}-${normalizeText(item && item.source)}`;
      if (!dedupeKey || seenKeys.has(dedupeKey)) {
        return;
      }

      seenKeys.add(dedupeKey);
      merged.push(item);
    });

  return merged.sort((left, right) => {
    const leftTs = normalizeNumber(left && left.occurredAtTs, 0);
    const rightTs = normalizeNumber(right && right.occurredAtTs, 0);
    if (leftTs !== rightTs) {
      return leftTs - rightTs;
    }

    return normalizeText(left && left.status).localeCompare(normalizeText(right && right.status), "zh-CN");
  });
}

function resolveLastOrderUpdateTs(orderRecord, statusLogs) {
  const latestLogTs = normalizeArray(statusLogs).reduce(
    (maxValue, item) => Math.max(maxValue, normalizeNumber(item && item.occurredAtTs, 0)),
    0
  );
  if (latestLogTs > 0) {
    return latestLogTs;
  }

  return Math.max(
    normalizeNumber(orderRecord && orderRecord.createdAtTs, 0),
    normalizeNumber(orderRecord && orderRecord.paidAtTs, 0),
    normalizeNumber(orderRecord && orderRecord.canceledAtTs, 0),
    normalizeNumber(orderRecord && orderRecord.updatedAt, 0)
  );
}

function clampLimit(limit, fallback = DEFAULT_LIMIT) {
  const parsed = parseInt(limit, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function getSQLRows(result) {
  const data = result && result.data ? result.data : {};
  return Array.isArray(data.executeResultList) ? data.executeResultList : [];
}

function matchesKeyword(values, keyword) {
  if (!keyword) {
    return true;
  }

  return values.some((value) => normalizeText(value).toLowerCase().includes(keyword));
}

function parseListEnv(name) {
  return normalizeText(process.env[name])
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function invalidateContentGatewayCache(triggerAction) {
  try {
    await cloud.callFunction({
      name: CONTENT_GATEWAY_FUNCTION_NAME,
      data: {
        action: "clearCache",
        payload: {
          source: "adminGateway",
          triggerAction: normalizeText(triggerAction)
        }
      }
    });
  } catch (error) {
    console.warn("Failed to invalidate content gateway cache", {
      triggerAction,
      functionName: CONTENT_GATEWAY_FUNCTION_NAME,
      error: error && error.message ? error.message : error
    });
  }
}

function normalizeRoleName(role) {
  return normalizeText(role).toLowerCase();
}

function normalizeIdentifier(value) {
  return normalizeText(value).toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value == null ? fallback : value));
  } catch (error) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      normalizeArray(values)
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  );
}

function normalizeRouteTags(value, fallbackValue) {
  const candidates = uniqueStrings(value && value.length ? value : fallbackValue);
  return candidates
    .filter((item) => ROUTE_TAG_OPTIONS.includes(item))
    .slice(0, 3);
}

function normalizeCreatorTags(value, fallbackValue) {
  const candidates = uniqueStrings(value && value.length ? value : fallbackValue);
  return candidates
    .filter((item) => CREATOR_TAG_OPTIONS.includes(item))
    .slice(0, 2);
}

function getServiceRouteTags(service) {
  return normalizeRouteTags(service && service.tags, service && service.styles);
}

function normalizeIdeaTheme(themeKeyValue, themeLabelValue, isCustomThemeValue) {
  const rawKey = normalizeText(themeKeyValue);
  const rawLabel = normalizeText(themeLabelValue);
  const matchedByKey = rawKey && IDEA_THEME_LABEL_MAP[rawKey]
    ? { key: rawKey, label: IDEA_THEME_LABEL_MAP[rawKey] }
    : null;
  const matchedByLabel = rawLabel
    ? IDEA_THEME_OPTIONS.find((item) => item.label === rawLabel) || null
    : null;
  const forceCustom = Boolean(isCustomThemeValue) || rawKey === CUSTOM_IDEA_THEME_KEY;

  if (!rawKey && !rawLabel) {
    return {
      themeKey: "",
      themeLabel: "",
      isCustomTheme: false
    };
  }

  if (!forceCustom && matchedByKey) {
    return {
      themeKey: matchedByKey.key,
      themeLabel: matchedByKey.label,
      isCustomTheme: false
    };
  }

  if (!forceCustom && matchedByLabel) {
    return {
      themeKey: matchedByLabel.key,
      themeLabel: matchedByLabel.label,
      isCustomTheme: false
    };
  }

  return {
    themeKey: CUSTOM_IDEA_THEME_KEY,
    themeLabel: rawLabel || (matchedByKey ? matchedByKey.label : ""),
    isCustomTheme: true
  };
}

function normalizeIdeaSourceType(value) {
  const normalized = normalizeText(value);
  if (IDEA_SOURCE_TYPES.includes(normalized)) {
    return normalized;
  }

  return DEFAULT_IDEA_SOURCE_TYPE;
}

function sanitizeExternalUrl(value) {
  const normalized = normalizeText(value);
  return /^https?:\/\//i.test(normalized) ? normalized : "";
}

function uniqueIdentifiers(values) {
  return Array.from(new Set(normalizeArray(values).map(normalizeIdentifier).filter(Boolean)));
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeStatus(value, allowedValues, fallback) {
  const normalized = normalizeText(value).toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function toDecimalString(value) {
  return normalizeNumber(value, 0).toFixed(2);
}

function sanitizeCodeFragment(value, fallback = "period") {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function padSequence(value) {
  return String(value).padStart(2, "0");
}

function normalizeSlugTokens(tokens) {
  return normalizeArray(tokens)
    .flatMap((token) => normalizeText(token).split("-"))
    .map((token) => sanitizeCodeFragment(token, ""))
    .filter(Boolean);
}

function transliterateToPinyinTokens(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  try {
    return normalizeSlugTokens(
      pinyin(normalized, {
        toneType: "none",
        type: "array",
        nonZh: "consecutive",
        v: false
      })
    );
  } catch (error) {
    return normalizeSlugTokens([normalized]);
  }
}

function replaceSlugPhrases(value, phraseRules) {
  return normalizeArray(phraseRules).reduce((result, rule) => {
    const source = normalizeText(rule && rule[0]);
    const target = sanitizeCodeFragment(rule && rule[1], "");
    if (!source || !target || !result.includes(source)) {
      return result;
    }

    return result.split(source).join(` ${target} `);
  }, normalizeText(value));
}

function buildSlugFromText(value, options = {}) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return sanitizeCodeFragment(options.fallback, "");
  }

  const exactOverrides = options.exactOverrides || {};
  const exactSlug = sanitizeCodeFragment(exactOverrides[normalized], "");
  if (exactSlug) {
    return exactSlug;
  }

  const mixedSource = replaceSlugPhrases(normalized, options.phraseRules);
  const mixedTokens = mixedSource
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((segment) => {
      const asciiTokens = normalizeSlugTokens([segment]);
      if (asciiTokens.length && /^[a-z0-9-]+$/i.test(segment.replace(/\s+/g, ""))) {
        return asciiTokens;
      }
      return transliterateToPinyinTokens(segment);
    });

  const slug = normalizeSlugTokens(mixedTokens).join(options.separator == null ? "-" : options.separator);
  return slug || sanitizeCodeFragment(options.fallback, "");
}

function buildCreatorSlugBase(name) {
  const tokens = transliterateToPinyinTokens(name);
  return tokens.join("") || "creator";
}

function buildDestinationSlugBase(name) {
  return buildSlugFromText(name, {
    exactOverrides: DESTINATION_SLUG_NAME_OVERRIDES,
    fallback: "destination",
    phraseRules: DESTINATION_SLUG_PHRASES,
    separator: "-"
  });
}

function buildServiceSlugBase(name) {
  return buildSlugFromText(name, {
    exactOverrides: SERVICE_SLUG_NAME_OVERRIDES,
    fallback: "service",
    phraseRules: SERVICE_SLUG_PHRASES,
    separator: "-"
  });
}

function buildIdeaSlugBase(title) {
  return buildSlugFromText(title, {
    fallback: "idea",
    phraseRules: DESTINATION_SLUG_PHRASES,
    separator: "-"
  });
}

function getNextSlugSequence(existingSlugs, baseSlug) {
  const pattern = new RegExp(`^${escapeRegExp(baseSlug)}-(\\d+)$`);
  return normalizeArray(existingSlugs).reduce((max, slug) => {
    if (slug === baseSlug || slug === `${baseSlug}-01`) {
      return Math.max(max, 1);
    }

    const match = normalizeText(slug).match(pattern);
    if (!match) {
      return max;
    }

    return Math.max(max, normalizePositiveInteger(match[1], 0));
  }, 0);
}

async function generateUniqueSlug(collectionName, baseSlug) {
  const normalizedBaseSlug = sanitizeCodeFragment(baseSlug, "");
  assertCondition(normalizedBaseSlug, "slug 生成失败，请稍后重试");

  const rows = await listCollection(collectionName);
  const existingSlugs = rows.map((item) => normalizeText(item && item.slug).toLowerCase()).filter(Boolean);
  const nextSequence = getNextSlugSequence(existingSlugs, normalizedBaseSlug);
  if (nextSequence <= 0) {
    return normalizedBaseSlug;
  }

  let sequence = nextSequence + 1;
  let candidate = `${normalizedBaseSlug}-${padSequence(sequence)}`;
  while (existingSlugs.includes(candidate)) {
    sequence += 1;
    candidate = `${normalizedBaseSlug}-${padSequence(sequence)}`;
  }

  return candidate;
}

async function generateServiceSlug(name) {
  return generateUniqueSlug(COLLECTIONS.services, buildServiceSlugBase(name));
}

async function generateIdeaSlug(title) {
  return generateUniqueSlug(COLLECTIONS.ideas, buildIdeaSlugBase(title));
}

async function generateCreatorSlug(name) {
  return generateUniqueSlug(COLLECTIONS.creators, buildCreatorSlugBase(name));
}

async function generateDestinationSlug(name) {
  return generateUniqueSlug(COLLECTIONS.destinations, buildDestinationSlugBase(name));
}

function createServiceLogicalId(slug) {
  return `svc-${slug}`;
}

function createTravelDetailId(slug) {
  return `travel-detail-${slug}`;
}

function createCreatorLogicalId(slug) {
  return `creator-${slug}`;
}

function createDestinationLogicalId(slug) {
  return `dest-${slug}`;
}

function createIdeaLogicalId(slug) {
  return `idea-${slug}`;
}

function parseServiceDurationDays(value) {
  const matches = normalizeText(value).match(/\d+/g);
  if (!matches || !matches.length) {
    return [];
  }

  return matches
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function inferServiceTypeByDuration(service) {
  const durationCandidates = parseServiceDurationDays(service && service.durationTag);
  const itineraryDays = normalizeArray(
    service && service.travelDetail && service.travelDetail.itinerary && service.travelDetail.itinerary.days
  ).length;
  const inferredDurationDays = durationCandidates.length
    ? Math.max(...durationCandidates)
    : Math.max(0, itineraryDays);

  if (inferredDurationDays >= 4) {
    return "长途旅行";
  }
  if (inferredDurationDays >= 2) {
    return "短途旅行";
  }
  if (inferredDurationDays === 1) {
    return "在地体验";
  }

  return DEFAULT_SERVICE_TYPE;
}

function normalizeServiceType(type, service) {
  const normalized = normalizeText(type);
  if (SERVICE_TYPE_OPTIONS.includes(normalized)) {
    return normalized;
  }
  if (LEGACY_SERVICE_TYPE_OPTIONS.includes(normalized)) {
    return inferServiceTypeByDuration(service);
  }
  return inferServiceTypeByDuration(service);
}

function getDefaultCreatorRoles(type) {
  const normalizedType = normalizeText(type);

  if (normalizedType === "带团旅行") {
    return ["创作者", "带领者"];
  }

  if (normalizedType === "定制规划") {
    return ["创作者", "策划者"];
  }

  if (SERVICE_TYPE_OPTIONS.includes(normalizedType)) {
    return ["创作者", "带领者"];
  }

  return ["创作者"];
}

function validateDateString(value, fieldLabel) {
  const normalized = normalizeText(value);
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  assertCondition(Boolean(matched), `${fieldLabel} 必须是 YYYY-MM-DD`);

  const year = normalizeNumber(matched && matched[1], NaN);
  const month = normalizeNumber(matched && matched[2], NaN);
  const day = normalizeNumber(matched && matched[3], NaN);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValidDate =
    Number.isFinite(year)
    && Number.isFinite(month)
    && Number.isFinite(day)
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;

  assertCondition(isValidDate, `${fieldLabel} 不是有效日期`);
  return normalized;
}

function addDaysToDateString(dateString, daysToAdd) {
  const normalized = validateDateString(dateString, "日期");
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = normalizeNumber(matched && matched[1], NaN);
  const month = normalizeNumber(matched && matched[2], NaN);
  const day = normalizeNumber(matched && matched[3], NaN);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + normalizeNumber(daysToAdd, 0));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function calcDurationDaysFromDates(dateStart, dateEnd) {
  const start = normalizeText(dateStart);
  const end = normalizeText(dateEnd);
  if (!start || !end) {
    return 0;
  }

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  const diff = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function collectRoles(userInfo) {
  const roleSources = [
    ...(Array.isArray(userInfo && userInfo.role) ? userInfo.role : []),
    ...(Array.isArray(userInfo && userInfo.roles) ? userInfo.roles : []),
    ...(Array.isArray(userInfo && userInfo.roleNames) ? userInfo.roleNames : []),
    ...(Array.isArray(userInfo && userInfo.app_metadata && userInfo.app_metadata.roles)
      ? userInfo.app_metadata.roles
      : []),
    ...(Array.isArray(userInfo && userInfo.user_metadata && userInfo.user_metadata.roles)
      ? userInfo.user_metadata.roles
      : [])
  ];
  const singleRoles = [
    userInfo ? userInfo.role : "",
    userInfo && userInfo.app_metadata ? userInfo.app_metadata.role : "",
    userInfo && userInfo.user_metadata ? userInfo.user_metadata.role : "",
    userInfo ? userInfo.roleName : "",
    userInfo ? userInfo.role_name : ""
  ];

  return Array.from(
    new Set(roleSources.concat(singleRoles).map(normalizeRoleName).filter(Boolean))
  );
}

function mapAdminUser(callerInfo, userInfo) {
  const userMetadata = userInfo && userInfo.user_metadata ? userInfo.user_metadata : {};
  const id =
    normalizeText(userInfo && userInfo.id)
    || normalizeText(userInfo && userInfo.uid)
    || normalizeText(callerInfo && callerInfo.uid)
    || normalizeText(callerInfo && callerInfo.customUserId)
    || normalizeText(callerInfo && callerInfo.openId);
  const username =
    normalizeText(userInfo && userInfo.username)
    || normalizeText(userInfo && userInfo.userName)
    || normalizeText(userMetadata.username)
    || normalizeText(userMetadata.userName)
    || normalizeText(userInfo && userInfo.email)
    || normalizeText(userInfo && userInfo.phone)
    || id;
  const displayName =
    normalizeText(userInfo && userInfo.nickname)
    || normalizeText(userInfo && userInfo.nickName)
    || normalizeText(userInfo && userInfo.name)
    || normalizeText(userMetadata.nickName)
    || normalizeText(userMetadata.name)
    || normalizeText(userMetadata.nickname)
    || username;

  return {
    id,
    uid: normalizeText(userInfo && userInfo.uid) || normalizeText(callerInfo && callerInfo.uid),
    customUserId:
      normalizeText(userInfo && userInfo.customUserId)
      || normalizeText(callerInfo && callerInfo.customUserId),
    username,
    displayName,
    email: normalizeText(userInfo && userInfo.email) || normalizeText(userInfo && userInfo.mail),
    phone:
      normalizeText(userInfo && userInfo.phone) || normalizeText(userInfo && userInfo.phoneNumber),
    roles: collectRoles(userInfo)
  };
}

function normalizeAdminLevel(value, fallback = "admin") {
  return normalizeStatus(value, ADMIN_ACCOUNT_LEVELS, fallback);
}

function normalizeAdminAccountStatus(value, fallback = "active") {
  return normalizeStatus(value, ADMIN_ACCOUNT_STATUSES, fallback);
}

function mapAdminAccountDoc(doc) {
  return {
    _id: normalizeText(doc && doc._id),
    uid: normalizeText(doc && doc.uid),
    customUserId: normalizeText(doc && doc.customUserId),
    username: normalizeText(doc && doc.username),
    displayName:
      normalizeText(doc && doc.displayName)
      || normalizeText(doc && doc.username)
      || normalizeText(doc && doc.uid)
      || "管理员",
    email: normalizeText(doc && doc.email),
    phone: normalizeText(doc && doc.phone),
    level: normalizeAdminLevel(doc && doc.level, "admin"),
    status: normalizeAdminAccountStatus(doc && doc.status, "active"),
    note: normalizeText(doc && doc.note),
    createdAt: normalizeNumber(doc && doc.createdAt),
    updatedAt: normalizeNumber(doc && doc.updatedAt),
    createdBy: normalizeText(doc && doc.createdBy),
    updatedBy: normalizeText(doc && doc.updatedBy)
  };
}

function getAdminAccountIdentifiers(account) {
  return uniqueIdentifiers(
    ADMIN_ACCOUNT_IDENTIFIER_FIELDS.map((field) => account && account[field]).concat(account && account._id)
  );
}

function findAdminAccountForUser(accounts, user) {
  const userIdentifiers = new Set(
    getAdminAccountIdentifiers({
      _id: user && user.id,
      uid: user && user.uid,
      customUserId: user && user.customUserId,
      username: user && user.username,
      email: user && user.email,
      phone: user && user.phone
    })
  );

  return normalizeArray(accounts).find((account) =>
    getAdminAccountIdentifiers(account).some((identifier) => userIdentifiers.has(identifier))
  ) || null;
}

function isMissingCollectionError(error) {
  const message = normalizeText(
    (error && error.errMsg) || (error && error.message) || ""
  ).toLowerCase();

  return Boolean(
    message
    && message.includes("collection")
    && (
      message.includes("not exist")
      || message.includes("does not exist")
      || message.includes("不存在")
      || message.includes("namespace")
    )
  );
}

function sortAdminAccounts(accounts) {
  return normalizeArray(accounts).sort((left, right) => {
    const leftOwnerRank = left.level === "owner" ? 0 : 1;
    const rightOwnerRank = right.level === "owner" ? 0 : 1;

    if (leftOwnerRank !== rightOwnerRank) {
      return leftOwnerRank - rightOwnerRank;
    }

    const leftStatusRank = left.status === "active" ? 0 : 1;
    const rightStatusRank = right.status === "active" ? 0 : 1;

    if (leftStatusRank !== rightStatusRank) {
      return leftStatusRank - rightStatusRank;
    }

    return normalizeNumber(right.updatedAt) - normalizeNumber(left.updatedAt);
  });
}

function buildAdminPermissions(context) {
  const canWriteAdmins = Boolean(
    context && (
      context.isAllowListed
      || (context.account && context.account.level === "owner")
      || (context.accountsCount === 0 && context.legacyAuthorized)
    )
  );

  const permissions = [
    "dashboard:read",
    "content:read",
    "content:write",
    "period:read",
    "period:write",
    "config:read",
    "config:write",
    "ops:read",
    "admins:read"
  ];

  if (canWriteAdmins) {
    permissions.push("admins:write");
  }

  return permissions;
}

function parseJsonText(value, fallback) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function summarizeAuthPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return {
    id: normalizeText(payload.id),
    uid: normalizeText(payload.uid),
    openId: normalizeText(payload.openId),
    customUserId: normalizeText(payload.customUserId),
    username: normalizeText(payload.username) || normalizeText(payload.userName),
    email: normalizeText(payload.email) || normalizeText(payload.mail),
    phone: normalizeText(payload.phone) || normalizeText(payload.phoneNumber),
    role: payload.role,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    roleName: normalizeText(payload.roleName) || normalizeText(payload.role_name),
    appMetadata: payload.app_metadata || null,
    userMetadata: payload.user_metadata || null
  };
}

function userMatchesAllowList(user) {
  const ids = parseListEnv("ADMIN_USER_IDS");
  const emails = parseListEnv("ADMIN_EMAILS");
  const usernames = parseListEnv("ADMIN_USERNAMES");

  return Boolean(
    (user.id && ids.includes(user.id.toLowerCase()))
    || (user.uid && ids.includes(user.uid.toLowerCase()))
    || (user.customUserId && ids.includes(user.customUserId.toLowerCase()))
    || (user.email && emails.includes(user.email.toLowerCase()))
    || (user.username && usernames.includes(user.username.toLowerCase()))
  );
}

async function listOptionalCollection(name) {
  try {
    return await listCollection(name);
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return [];
    }

    throw error;
  }
}

async function createBootstrapAdminAccount(user) {
  const now = Date.now();
  const fallbackIdentifier = normalizeText(user && (user.uid || user.id));
  const data = {
    uid: normalizeText(user && user.uid) || fallbackIdentifier,
    customUserId: normalizeText(user && user.customUserId),
    username: normalizeText(user && user.username),
    displayName:
      normalizeText(user && user.displayName)
      || normalizeText(user && user.username)
      || fallbackIdentifier
      || "管理员",
    email: normalizeText(user && user.email),
    phone: normalizeText(user && user.phone),
    level: "owner",
    status: "active",
    note: "Bootstrapped from legacy admin access",
    createdAt: now,
    updatedAt: now,
    createdBy: fallbackIdentifier,
    updatedBy: fallbackIdentifier,
    _openid: fallbackIdentifier
  };

  const result = await db.collection(ADMIN_COLLECTION).add({ data });
  return mapAdminAccountDoc(Object.assign({ _id: result && result._id }, data));
}

async function resolveAdminAccess() {
  let callerInfo = {};
  let userInfo = null;

  try {
    callerInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
  } catch (error) {
    callerInfo = {};
  }

  try {
    const result = await auth.getEndUserInfo();
    userInfo = result && result.userInfo ? result.userInfo : null;
  } catch (error) {
    console.error("Failed to read admin auth session", error);
  }

  const user = mapAdminUser(callerInfo, userInfo);
  const hasRole = user.roles.some((role) => ADMIN_ROLE_NAMES.includes(role));
  const isAllowListed = userMatchesAllowList(user);
  const legacyAuthorized = hasRole || isAllowListed;
  let accounts = sortAdminAccounts(
    normalizeArray(await listOptionalCollection(ADMIN_COLLECTION)).map(mapAdminAccountDoc)
  );
  let matchedAccount = findAdminAccountForUser(
    accounts.filter((account) => account.status === "active"),
    user
  );

  if (!matchedAccount && accounts.length === 0 && legacyAuthorized) {
    try {
      matchedAccount = await createBootstrapAdminAccount(user);
      accounts = [matchedAccount];
    } catch (error) {
      console.error("Failed to bootstrap admin account", { user, error });
    }
  }

  const directoryAuthorized = Boolean(matchedAccount && matchedAccount.status === "active");
  const allowLegacyFallback = accounts.length === 0 || isAllowListed;
  const isAuthorized = Boolean(user.id) && (directoryAuthorized || (legacyAuthorized && allowLegacyFallback));

  if (!isAuthorized) {
    console.warn("Admin access denied", {
      callerInfo: summarizeAuthPayload(callerInfo),
      userInfo: summarizeAuthPayload(userInfo),
      mappedUser: user,
      directoryCount: accounts.length
    });
    throw new Error(`admin access denied: uid=${normalizeText(user.uid || user.id) || "unknown"}`);
  }

  const permissions = buildAdminPermissions({
    account: matchedAccount,
    accountsCount: accounts.length,
    legacyAuthorized,
    isAllowListed
  });
  const authSource = matchedAccount ? "directory" : isAllowListed ? "allowlist" : "role";
  const resolvedProfile = matchedAccount
    ? {
        username: normalizeText(matchedAccount.username) || normalizeText(user.username),
        displayName:
          normalizeText(matchedAccount.displayName)
          || normalizeText(matchedAccount.username)
          || normalizeText(user.displayName)
          || normalizeText(user.username),
        email: normalizeText(matchedAccount.email) || normalizeText(user.email),
        phone: normalizeText(matchedAccount.phone) || normalizeText(user.phone)
      }
    : {
        username: normalizeText(user.username),
        displayName: normalizeText(user.displayName) || normalizeText(user.username),
        email: normalizeText(user.email),
        phone: normalizeText(user.phone)
      };

  return Object.assign({}, user, resolvedProfile, {
    adminAccountId: normalizeText(matchedAccount && matchedAccount._id),
    adminLevel: normalizeText(matchedAccount && matchedAccount.level) || "owner",
    authSource,
    permissions
  });
}

async function requireAdmin() {
  return resolveAdminAccess();
}

async function listCollection(name) {
  const rows = [];
  let offset = 0;

  while (true) {
    const result = await db.collection(name).skip(offset).limit(QUERY_BATCH_SIZE).get();
    const batch = result.data || [];
    rows.push(...batch);

    if (batch.length < QUERY_BATCH_SIZE) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

async function findCollectionDocByField(collectionName, fieldName, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const result = await db.collection(collectionName).where({ [fieldName]: normalized }).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function findServiceDocById(docId) {
  const normalized = normalizeText(docId);
  if (!normalized) {
    return null;
  }

  try {
    const result = await db.collection(COLLECTIONS.services).doc(normalized).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    return null;
  }
}

async function findServiceDocBySlug(slug) {
  return findCollectionDocByField(COLLECTIONS.services, "slug", slug);
}

async function findServiceDocByLogicalId(id) {
  return findCollectionDocByField(COLLECTIONS.services, "id", id);
}

async function findServiceDoc(payload) {
  const byDocId = await findServiceDocById(payload && payload._id);
  if (byDocId) {
    return byDocId;
  }

  const bySlug = await findServiceDocBySlug(payload && payload.slug);
  if (bySlug) {
    return bySlug;
  }

  return findServiceDocByLogicalId(payload && payload.id);
}

async function findContentDoc(collectionName, payload) {
  const byDocId = await findServiceDocById(payload && payload._id);
  if (byDocId && collectionName === COLLECTIONS.services) {
    return byDocId;
  }

  if (normalizeText(payload && payload._id)) {
    try {
      const result = await db.collection(collectionName).doc(normalizeText(payload._id)).get();
      if (result && result.data) {
        return result.data;
      }
    } catch (error) {
      // Ignore missing doc errors so the slug/id fallbacks can continue.
    }
  }

  const bySlug = await findCollectionDocByField(collectionName, "slug", payload && payload.slug);
  if (bySlug) {
    return bySlug;
  }

  return findCollectionDocByField(collectionName, "id", payload && payload.id);
}

async function readConfig(key) {
  const result = await db.collection(CONFIG_COLLECTION).where({ key }).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function getConfigDetail(payload) {
  const key = normalizeText(payload && payload.key);
  assertCondition(key, "缺少配置键");

  const doc = await readConfig(key);
  return {
    _id: normalizeText(doc && doc._id),
    key,
    value: isPlainObject(doc && doc.value) ? cloneJson(doc.value, {}) : {},
    createdAt: normalizeNumber(doc && doc.createdAt),
    updatedAt: normalizeNumber(doc && doc.updatedAt)
  };
}

async function saveConfigDetail(payload, adminUser) {
  const key = normalizeText(payload && payload.key);
  const value = payload && payload.value;
  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();

  assertCondition(key, "缺少配置键");
  assertCondition(isPlainObject(value), "配置内容必须是 JSON 对象");

  const existing = await readConfig(key);
  const normalizedValue = await normalizeConfigImagePayload(key, value);
  const nextDoc = {
    key,
    value: cloneJson(normalizedValue, {}),
    updatedAt: now,
    updatedBy: operatorId
  };

  if (!existing) {
    const createResult = await db.collection(CONFIG_COLLECTION).add({
      data: Object.assign({}, nextDoc, {
        createdAt: now,
        createdBy: operatorId
      })
    });
    return getConfigDetail({ key, _id: createResult && createResult._id });
  }

  await db.collection(CONFIG_COLLECTION).doc(existing._id).update({
    data: nextDoc
  });
  return getConfigDetail({ key, _id: existing._id });
}

async function queryRows(sql, params) {
  if (typeof runSQL !== "function") {
    throw new Error("后台 SQL 服务未就绪，请稍后重试");
  }

  try {
    return getSQLRows(await runSQL(sql, params || {}));
  } catch (error) {
    console.error("Admin SQL query failed", { sql, params, error });
    throw new Error("后台 SQL 查询失败，请稍后重试");
  }
}

async function queryCount(sql, params) {
  const rows = await queryRows(sql, params);
  const first = rows[0] || {};
  return normalizeNumber(first.total, 0);
}

function assertAdminPermission(adminUser, permission) {
  assertCondition(
    normalizeArray(adminUser && adminUser.permissions).includes(permission),
    "当前管理员没有对应操作权限"
  );
}

async function listAdminAccountsData() {
  return sortAdminAccounts(
    normalizeArray(await listOptionalCollection(ADMIN_COLLECTION)).map(mapAdminAccountDoc)
  );
}

function assertAdminAccountHasIdentifier(payload) {
  const identifiers = uniqueIdentifiers(
    ADMIN_ACCOUNT_IDENTIFIER_FIELDS.map((field) => payload && payload[field])
  );
  assertCondition(identifiers.length > 0, "至少需要填写一个身份标识，建议优先填写 UID");
}

function assertAdminAccountUnique(accounts, payload, existingId) {
  normalizeArray(accounts)
    .filter((account) => account._id !== existingId)
    .forEach((account) => {
      ADMIN_ACCOUNT_IDENTIFIER_FIELDS.forEach((field) => {
        const nextValue = normalizeIdentifier(payload && payload[field]);
        if (!nextValue) {
          return;
        }

        if (nextValue === normalizeIdentifier(account[field])) {
          throw new Error(`管理员标识冲突：${field} 已被 ${account.displayName} 使用`);
        }
      });
    });
}

function assertAdminOwnerRetention(accounts, existing, nextDoc) {
  const existingIsOwner = existing && existing.level === "owner" && existing.status === "active";
  const nextIsOwner = nextDoc.level === "owner" && nextDoc.status === "active";

  if (!existingIsOwner || nextIsOwner) {
    return;
  }

  const otherOwners = normalizeArray(accounts).filter(
    (account) => account._id !== existing._id && account.level === "owner" && account.status === "active"
  );
  assertCondition(otherOwners.length > 0, "至少需要保留一个启用中的 owner 管理员");
}

function buildAdminAccountData(payload, existing, adminUser) {
  const now = Date.now();
  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const fallbackIdentifier =
    normalizeText(payload && payload.uid)
    || normalizeText(payload && payload.username)
    || normalizeText(existing && existing.uid)
    || normalizeText(existing && existing.username)
    || operatorId;
  const nextDoc = {
    uid: normalizeText(payload && payload.uid) || normalizeText(existing && existing.uid),
    customUserId:
      normalizeText(payload && payload.customUserId) || normalizeText(existing && existing.customUserId),
    username: normalizeText(payload && payload.username) || normalizeText(existing && existing.username),
    displayName:
      normalizeText(payload && payload.displayName)
      || normalizeText(existing && existing.displayName)
      || normalizeText(payload && payload.username)
      || normalizeText(payload && payload.uid)
      || fallbackIdentifier
      || "管理员",
    email: normalizeText(payload && payload.email) || normalizeText(existing && existing.email),
    phone: normalizeText(payload && payload.phone) || normalizeText(existing && existing.phone),
    level: normalizeAdminLevel(payload && payload.level, normalizeText(existing && existing.level) || "admin"),
    status: normalizeAdminAccountStatus(payload && payload.status, normalizeText(existing && existing.status) || "active"),
    note: normalizeText(payload && payload.note) || normalizeText(existing && existing.note),
    updatedAt: now,
    updatedBy: operatorId
  };

  assertAdminAccountHasIdentifier(nextDoc);

  if (!existing) {
    return Object.assign({}, nextDoc, {
      createdAt: now,
      createdBy: operatorId,
      _openid: operatorId || fallbackIdentifier
    });
  }

  return Object.assign({}, nextDoc, {
    createdAt: normalizeNumber(existing.createdAt, now),
    createdBy: normalizeText(existing.createdBy) || operatorId,
    _openid: normalizeText(existing._openid) || operatorId || fallbackIdentifier
  });
}

async function listAdminAccounts() {
  return listAdminAccountsData();
}

async function saveAdminAccount(payload, adminUser) {
  assertAdminPermission(adminUser, "admins:write");

  const accounts = await listAdminAccountsData();
  const accountId = normalizeText(payload && payload._id);
  const existing = accounts.find((account) => account._id === accountId) || null;
  const nextDoc = buildAdminAccountData(payload, existing, adminUser);

  assertAdminAccountUnique(accounts, nextDoc, normalizeText(existing && existing._id));
  assertAdminOwnerRetention(accounts, existing, nextDoc);

  if (!existing) {
    const result = await db.collection(ADMIN_COLLECTION).add({ data: nextDoc });
    return mapAdminAccountDoc(Object.assign({ _id: result && result._id }, nextDoc));
  }

  await db.collection(ADMIN_COLLECTION).doc(existing._id).update({ data: nextDoc });
  return mapAdminAccountDoc(Object.assign({}, existing, nextDoc));
}

async function deactivateAdminAccount(payload, adminUser) {
  assertAdminPermission(adminUser, "admins:write");
  const accountId = normalizeText(payload && payload._id);
  assertCondition(accountId, "缺少管理员记录 ID");

  const accounts = await listAdminAccountsData();
  const existing = accounts.find((account) => account._id === accountId);
  assertCondition(existing, "未找到对应管理员记录");

  if (existing.status === "inactive") {
    return existing;
  }

  return saveAdminAccount(
    {
      _id: accountId,
      status: "inactive"
    },
    adminUser
  );
}

async function deleteAdminAccount(payload, adminUser) {
  assertAdminPermission(adminUser, "admins:write");
  const accountId = normalizeText(payload && payload._id);
  assertCondition(accountId, "缺少管理员记录 ID");

  const accounts = await listAdminAccountsData();
  const existing = accounts.find((account) => account._id === accountId);
  assertCondition(existing, "未找到对应管理员记录");

  const currentAccount = findAdminAccountForUser(accounts, adminUser);
  assertCondition(!currentAccount || currentAccount._id !== accountId, "不能删除当前登录账号");
  assertAdminOwnerRetention(accounts, existing, Object.assign({}, existing, { status: "inactive" }));

  await db.collection(ADMIN_COLLECTION).doc(accountId).remove();
  return {
    _id: accountId,
    removed: true
  };
}

async function findServicePeriodByCode(periodCode) {
  const normalized = normalizeText(periodCode);
  if (!normalized) {
    return null;
  }

  const rows = await queryRows(
    "SELECT * FROM `ServicePeriod` WHERE `periodCode` = {{periodCode}} LIMIT 1",
    { periodCode: normalized }
  );

  return rows.length ? rows[0] : null;
}

function resolveServicePeriodStatus(requestedStatus, service, remainingSeats, dateStart, dateEnd, soldCount = 0, minGroup = 1) {
  if (buildStatusTag(service) === "inactive") {
    return "inactive";
  }

  const manualStatus = normalizeManualServicePeriodStatus(
    normalizeStatus(requestedStatus, SERVICE_PERIOD_STATUSES, "available")
  );

  if (manualStatus === "inactive") {
    return "inactive";
  }

  return resolveDisplayServicePeriodStatus({
    status: manualStatus,
    dateStart,
    dateEnd,
    minGroup,
    totalSeats: Math.max(0, soldCount + remainingSeats),
    remainingSeats
  }, soldCount);
}

function createSqlRecordId(prefix) {
  const normalizedPrefix = normalizeText(prefix).replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() || "rec";
  return `${normalizedPrefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildServicePeriodCreateRecord(record, operatorId, now) {
  return Object.assign({}, record, {
    _id: createSqlRecordId("sp"),
    createdAt: now,
    createBy: operatorId,
    owner: operatorId,
    _openid: operatorId
  });
}

function shouldFallbackLegacyServicePeriodFields(error) {
  const message = normalizeText(error && error.message).toLowerCase();
  return message.includes("totalseats");
}

function stripOptionalTotalSeatFields(record) {
  const nextRecord = Object.assign({}, record);
  delete nextRecord.totalSeats;
  delete nextRecord.totalSeatsInt;
  return nextRecord;
}

async function deactivateServicePeriodsByServiceSlug(serviceSlug) {
  const normalizedServiceSlug = normalizeText(serviceSlug);
  if (!normalizedServiceSlug) {
    return;
  }

  const now = Date.now();
  const { error } = await rdb
    .from("ServicePeriod")
    .update({
      status: "inactive",
      updatedAt: now
    })
    .eq("serviceSlug", normalizedServiceSlug);

  if (error) {
    throw new Error(error.message || "同步路线关联团期状态失败");
  }
}

function sanitizeServiceSectionList(value) {
  const sections = normalizeArray(value)
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const key = normalizeText(item.key);
      const title = normalizeText(item.title);
      if (!key || !title) {
        return null;
      }

      return {
        key,
        title,
        anchorId: normalizeText(item.anchorId) || `section_${key}`
      };
    })
    .filter(Boolean);

  return sections.length ? sections : cloneJson(DEFAULT_SERVICE_SECTIONS, DEFAULT_SERVICE_SECTIONS);
}

function sanitizeServiceGalleryGroups(value, fallbackGallery) {
  const groups = normalizeArray(value)
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const label = normalizeText(item.label) || `图集 ${index + 1}`;
      const images = dedupeImageValues(item.images).map(normalizeImageAssetValue).filter(Boolean);
      if (!images.length) {
        return null;
      }

      return {
        label,
        images
      };
    })
    .filter(Boolean);

  if (groups.length) {
    return groups;
  }

  const images = dedupeImageValues(fallbackGallery).map(normalizeImageAssetValue).filter(Boolean);
  return images.length
    ? [
        {
          label: "图集",
          images
        }
      ]
    : [];
}

function flattenServiceGalleryGroups(value, fallbackGallery) {
  return dedupeImageValues(
    sanitizeServiceGalleryGroups(value, fallbackGallery).flatMap((item) => item.images || [])
  );
}

function isCloudFileId(value) {
  return isImageCloudFileId(value);
}

function getCloudFilePath(fileID) {
  return getImageCloudFilePath(fileID);
}

function replaceCloudFilePath(fileID, nextPath) {
  const matched = normalizeText(fileID).match(/^cloud:\/\/([^/]+)\/.+$/);
  return matched && nextPath ? `cloud://${matched[1]}/${nextPath}` : normalizeText(fileID);
}

function collectServiceAssetRefs(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  const detail = isPlainObject(source.travelDetail) ? source.travelDetail : {};
  const overview = isPlainObject(detail.overview) ? detail.overview : {};
  const highlightImages = normalizeArray(detail.highlights).flatMap((item) => {
    return isPlainObject(item)
      ? normalizeArray(item.images).flatMap((image) => listImageAssetRefs(image))
      : [];
  });

  return uniqueStrings([
    ...listImageAssetRefs(source.cover),
    ...flattenServiceGalleryGroups(source.galleryGroups, source.gallery).flatMap((image) => listImageAssetRefs(image)),
    ...listImageAssetRefs(detail.consultWeChatQr),
    ...listImageAssetRefs(overview.coverImage),
    ...highlightImages
  ]).filter(isCloudFileId);
}

function applyServiceAssetRefMap(source, refMap) {
  if (!isPlainObject(source) || !(refMap instanceof Map) || !refMap.size) {
    return source;
  }

  const nextSource = cloneJson(source, {});
  const mapRef = (value) => {
    if (!value) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = normalizeText(value);
      return refMap.get(normalized) || normalized;
    }

    if (Array.isArray(value)) {
      return value.map(mapRef).filter(Boolean);
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const asset = cloneJson(value, {});
    ["original", "card", "detail", "fileID", "cloudFileID", "url", "src", "image", "coverImage", "cover", "avatar", "path"].forEach((key) => {
      const normalized = normalizeText(asset[key]);
      if (normalized && refMap.has(normalized)) {
        asset[key] = refMap.get(normalized);
      }
    });
    return asset;
  };

  nextSource.cover = mapRef(nextSource.cover);

  if (Array.isArray(nextSource.gallery)) {
    nextSource.gallery = nextSource.gallery.map(mapRef).filter(Boolean);
  }

  if (Array.isArray(nextSource.galleryGroups)) {
    nextSource.galleryGroups = nextSource.galleryGroups.map((item) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        images: dedupeImageValues(item.images).map(mapRef).filter(Boolean)
      });
    });
  }

  const detail = isPlainObject(nextSource.travelDetail) ? nextSource.travelDetail : {};
  nextSource.travelDetail = detail;
  detail.consultWeChatQr = mapRef(detail.consultWeChatQr);

  const overview = isPlainObject(detail.overview) ? detail.overview : {};
  detail.overview = overview;
  overview.coverImage = mapRef(overview.coverImage);

  if (Array.isArray(detail.highlights)) {
    detail.highlights = detail.highlights.map((item) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        images: dedupeImageValues(item.images).map(mapRef).filter(Boolean)
      });
    });
  }

  return nextSource;
}

function isManagedServiceAssetFile(fileID, slug) {
  const path = getCloudFilePath(fileID);
  if (!path.startsWith(SERVICE_ASSET_ROOT)) {
    return false;
  }

  if (path.startsWith(SERVICE_DRAFT_ASSET_PREFIX)) {
    return true;
  }

  return Boolean(slug) && path.startsWith(`${SERVICE_ASSET_ROOT}${slug}/`);
}

async function copyDraftServiceAssetsForSave(payload, slug) {
  const assetRefs = collectServiceAssetRefs(payload).filter((fileID) => {
    return getCloudFilePath(fileID).startsWith(SERVICE_DRAFT_ASSET_PREFIX);
  });

  if (!assetRefs.length) {
    return {
      migratedSourceRefs: [],
      payload
    };
  }

  const copyOperations = [];
  const refMap = new Map();

  assetRefs.forEach((fileID) => {
    const srcPath = getCloudFilePath(fileID);
    const dstPath = srcPath.replace(SERVICE_DRAFT_ASSET_PREFIX, `${SERVICE_ASSET_ROOT}${slug}/`);

    if (!srcPath || !dstPath || srcPath === dstPath || refMap.has(fileID)) {
      return;
    }

    copyOperations.push({
      srcPath,
      dstPath,
      srcFileID: fileID
    });
    refMap.set(fileID, replaceCloudFilePath(fileID, dstPath));
  });

  if (!copyOperations.length) {
    return {
      migratedSourceRefs: [],
      payload
    };
  }

  const result = await app.copyFile({
    fileList: copyOperations.map((item) => ({
      srcPath: item.srcPath,
      dstPath: item.dstPath,
      overwrite: true
    }))
  });

  const resultFileList = normalizeArray(result && result.fileList);
  const failedIndices = resultFileList.reduce((indices, item, index) => {
    if (item && item.code && item.code !== "SUCCESS") {
      indices.push(index);
    }
    return indices;
  }, []);

  for (let index = 0; index < failedIndices.length; index += 1) {
    const failedIndex = failedIndices[index];
    const failedItem = resultFileList[failedIndex] || {};
    const failedOperation = copyOperations[failedIndex] || {};

    try {
      const uploadedFileID = await cloneCloudFileToPath(failedOperation.srcFileID, failedOperation.dstPath);
      if (uploadedFileID) {
        refMap.set(failedOperation.srcFileID, uploadedFileID);
      }
    } catch (fallbackError) {
      const failureCode = normalizeText(failedItem.code) || "UNKNOWN";
      const failureMessage = normalizeText(failedItem.message || failedItem.msg || failedItem.error);

      console.error("Route image copy failed", {
        failedItem,
        failedOperation,
        fallbackError
      });

      throw new Error(
        [
          "路线图片迁移失败",
          `code=${failureCode}`,
          failureMessage ? `message=${failureMessage}` : "",
          fallbackError instanceof Error && fallbackError.message ? `fallback=${fallbackError.message}` : "",
          failedOperation.srcPath ? `src=${failedOperation.srcPath}` : "",
          failedOperation.dstPath ? `dst=${failedOperation.dstPath}` : ""
        ].filter(Boolean).join(" | ")
      );
    }
  }

  const unresolvedFailedIndex = resultFileList.findIndex((item, index) => {
    return item && item.code && item.code !== "SUCCESS" && !refMap.get(copyOperations[index] && copyOperations[index].srcFileID);
  });
  if (unresolvedFailedIndex >= 0) {
    const failedItem = resultFileList[unresolvedFailedIndex] || {};
    const failedOperation = copyOperations[unresolvedFailedIndex] || {};
    throw new Error(
      [
        "路线图片迁移失败",
        `code=${normalizeText(failedItem.code) || "UNKNOWN"}`,
        normalizeText(failedItem.message || failedItem.msg || failedItem.error)
          ? `message=${normalizeText(failedItem.message || failedItem.msg || failedItem.error)}`
          : "",
        failedOperation.srcPath ? `src=${failedOperation.srcPath}` : "",
        failedOperation.dstPath ? `dst=${failedOperation.dstPath}` : ""
      ].filter(Boolean).join(" | ")
    );
  }

  return {
    migratedSourceRefs: copyOperations.map((item) => item.srcFileID),
    payload: applyServiceAssetRefMap(payload, refMap)
  };
}

function getRemovedServiceAssetRefs(existingDoc, nextDoc) {
  const existingSlug = normalizeText(existingDoc && existingDoc.slug).toLowerCase();
  const nextSlug = normalizeText(nextDoc && nextDoc.slug).toLowerCase();
  const nextRefs = new Set(collectServiceAssetRefs(nextDoc));

  return collectServiceAssetRefs(existingDoc).filter((fileID) => {
    return !nextRefs.has(fileID) && isManagedServiceAssetFile(fileID, existingSlug || nextSlug);
  });
}

async function deleteServiceAssetFiles(fileIDs) {
  const fileList = uniqueStrings(fileIDs).filter(isCloudFileId);
  if (!fileList.length) {
    return;
  }

  try {
    const result = await app.deleteFile({ fileList });
    const failedItems = normalizeArray(result && result.fileList).filter((item) => {
      return item && item.code && item.code !== "SUCCESS";
    });

    if (failedItems.length) {
      console.error("Failed to delete some service assets", {
        failedItems,
        fileList
      });
    }
  } catch (error) {
    console.error("Failed to delete service assets", {
      error,
      fileList
    });
  }
}

async function ensureImageAssetField(value, fallbackFolder) {
  const normalized = normalizeImageAssetValue(value);
  if (!normalized) {
    return "";
  }

  return ensureImageAssetValue(normalized, createImageAssetProcessingOptions(fallbackFolder));
}

async function ensureImageAssetList(values, fallbackFolder) {
  const items = dedupeImageValues(values);
  const nextList = [];

  for (let index = 0; index < items.length; index += 1) {
    const asset = await ensureImageAssetField(items[index], fallbackFolder);
    if (asset) {
      nextList.push(asset);
    }
  }

  return nextList;
}

async function normalizeServiceImagePayload(payload, slug) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const assetRoot = `${SERVICE_ASSET_ROOT}${slug}`;
  const nextPayload = cloneJson(payload, {});
  nextPayload.cover = await ensureImageAssetField(nextPayload.cover, `${assetRoot}/cover`);
  nextPayload.gallery = await ensureImageAssetList(nextPayload.gallery, `${assetRoot}/gallery`);
  nextPayload.galleryGroups = await Promise.all(
    normalizeArray(nextPayload.galleryGroups).map(async (item, index) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        images: await ensureImageAssetList(item.images, `${assetRoot}/gallery/group-${index + 1}`)
      });
    })
  );

  const detail = isPlainObject(nextPayload.travelDetail) ? nextPayload.travelDetail : {};
  nextPayload.travelDetail = detail;
  detail.consultWeChatQr = await ensureImageAssetField(detail.consultWeChatQr, `${assetRoot}/consult-wechat`);

  const overview = isPlainObject(detail.overview) ? detail.overview : {};
  detail.overview = overview;
  overview.coverImage = await ensureImageAssetField(overview.coverImage, `${assetRoot}/overview`);

  detail.highlights = await Promise.all(
    normalizeArray(detail.highlights).map(async (item, index) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        images: await ensureImageAssetList(item.images, `${assetRoot}/highlights/highlight-${index + 1}`)
      });
    })
  );

  return nextPayload;
}

async function normalizeCreatorImagePayload(payload, slug) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const nextPayload = cloneJson(payload, {});
  nextPayload.avatar = await ensureImageAssetField(nextPayload.avatar, `content/creators/avatar/${slug || "shared"}`);
  return nextPayload;
}

async function normalizeDestinationImagePayload(payload, slug) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const nextPayload = cloneJson(payload, {});
  nextPayload.cover = await ensureImageAssetField(nextPayload.cover, `content/destinations/cover/${slug || "shared"}`);
  return nextPayload;
}

async function normalizeIdeaImagePayload(payload, slug) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const nextPayload = cloneJson(payload, {});
  nextPayload.cover = await ensureImageAssetField(nextPayload.cover, `content/ideas/cover/${slug || "shared"}`);
  return nextPayload;
}

async function normalizeConfigImagePayload(key, value) {
  if (!isPlainObject(value)) {
    return value;
  }

  if (key === "homePage") {
    const nextValue = cloneJson(value, {});
    nextValue.heroSlides = await Promise.all(
      normalizeArray(nextValue.heroSlides).map(async (item, index) => {
        if (!isPlainObject(item)) {
          return item;
        }

        return Object.assign({}, item, {
          image: await ensureImageAssetField(item.image || item.cloudFileID, `config/homePage/hero-${index + 1}`),
          cloudFileID: ""
        });
      })
    );
    return nextValue;
  }

  return value;
}

function sanitizeServiceHighlights(value) {
  return normalizeArray(value)
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const title = normalizeText(item.title);
      const description = normalizeText(item.description);
      if (!title && !description) {
        return null;
      }

      return {
        id: normalizeText(item.id) || `highlight-${index + 1}`,
        title,
        description,
        images: dedupeImageValues(item.images).map(normalizeImageAssetValue).filter(Boolean)
      };
    })
    .filter(Boolean);
}

function sanitizeItineraryDays(value) {
  return normalizeArray(value)
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const modules = normalizeArray(item.modules)
        .map((moduleItem) => {
          if (!isPlainObject(moduleItem)) {
            return null;
          }

          const title = normalizeText(moduleItem.title);
          const content = normalizeText(moduleItem.content);
          if (!title && !content) {
            return null;
          }

          return {
            type: normalizeText(moduleItem.type) || "schedule",
            title,
            content
          };
        })
        .filter(Boolean);

      return {
        key: normalizeText(item.key) || `day-${index + 1}`,
        day: normalizePositiveInteger(item.day, index + 1) || (index + 1),
        title: normalizeText(item.title) || `第 ${index + 1} 天`,
        modules
      };
    })
    .filter(Boolean);
}

function sanitizeItineraryVersions(value) {
  return normalizeArray(value)
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const versionName = normalizeText(item.versionName);
      const days = sanitizeItineraryDays(
        normalizeArray(item.days).length ? item.days : item.itinerary && item.itinerary.days
      );
      if (!versionName && !days.length) {
        return null;
      }

      return {
        key: normalizeText(item.key) || `version-${index + 1}`,
        versionName,
        days
      };
    })
    .filter(Boolean);
}

function getDefaultServiceVersionName(value) {
  return normalizeText(value) || "标准版";
}

function sanitizeServiceCosts(value) {
  const input = isPlainObject(value) ? value : {};

  const mapCostItems = (items, keyA, keyB) =>
    normalizeArray(items)
      .map((item) => {
        if (!isPlainObject(item)) {
          return null;
        }

        const left = normalizeText(item[keyA]);
        const right = normalizeText(item[keyB]);
        if (!left && !right) {
          return null;
        }

        return {
          [keyA]: left,
          [keyB]: right
        };
      })
      .filter(Boolean);

  return {
    include: mapCostItems(input.include, "label", "content"),
    exclude: mapCostItems(input.exclude, "label", "content"),
    refundRules: mapCostItems(input.refundRules, "days", "percent")
  };
}

function sanitizeServiceNotices(value) {
  return normalizeArray(value)
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const title = normalizeText(item.title);
      const content = normalizeText(item.content);
      if (!title && !content) {
        return null;
      }

      return {
        key: normalizeText(item.key) || `notice-${index + 1}`,
        title,
        content
      };
    })
    .filter(Boolean);
}

function sanitizeTravelDetail(value, serviceMeta, existingDetail) {
  const input = isPlainObject(value) ? value : {};
  const existingOverview = existingDetail && isPlainObject(existingDetail.overview) ? existingDetail.overview : {};
  const existingItineraryVersions = sanitizeItineraryVersions(existingDetail && existingDetail.itineraryVersions);
  const inputItineraryVersions = sanitizeItineraryVersions(input.itineraryVersions);
  const hasInputItineraryVersions = Object.prototype.hasOwnProperty.call(input, "itineraryVersions");

  return {
    id: normalizeText(input.id) || normalizeText(existingDetail && existingDetail.id) || createTravelDetailId(serviceMeta.slug),
    title: normalizeText(input.title) || serviceMeta.name,
    defaultVersionName: getDefaultServiceVersionName(input.defaultVersionName || (existingDetail && existingDetail.defaultVersionName)),
    consultWeChatQr:
      normalizeImageAssetValue(input.consultWeChatQr)
      || normalizeImageAssetValue(existingDetail && existingDetail.consultWeChatQr)
      || "",
    sections: sanitizeServiceSectionList(input.sections),
    overview: {
      coverImage:
        normalizeImageAssetValue(input.overview && input.overview.coverImage)
        || normalizeImageAssetValue(existingOverview.coverImage)
        || normalizeImageAssetValue(serviceMeta.cover),
      whyJoinText:
        normalizeText(input.overview && input.overview.whyJoinText)
        || normalizeText(existingOverview.whyJoinText),
      suitableTitle:
        normalizeText(input.overview && input.overview.suitableTitle)
        || normalizeText(existingOverview.suitableTitle)
        || "这段旅程适合谁",
      suitableText:
        normalizeText(input.overview && input.overview.suitableText)
        || normalizeText(existingOverview.suitableText)
    },
    highlights: sanitizeServiceHighlights(input.highlights),
    itinerary: {
      days: sanitizeItineraryDays(input.itinerary && input.itinerary.days)
    },
    itineraryVersions: hasInputItineraryVersions ? inputItineraryVersions : existingItineraryVersions,
    costs: sanitizeServiceCosts(input.costs),
    notices: sanitizeServiceNotices(input.notices)
  };
}

function buildServiceVersionDefinitions(service) {
  const rawTravelDetail = isPlainObject(service && service.travelDetail) ? service.travelDetail : {};
  const travelDetail = sanitizeTravelDetail(
    rawTravelDetail,
      {
        cover: getImageAssetOriginal(service && service.cover),
        name: normalizeText(service && service.name),
        slug: normalizeText(service && service.slug)
      },
    rawTravelDetail
  );
  const definitions = [
    {
      durationDays: Math.max(1, normalizeArray(travelDetail.itinerary && travelDetail.itinerary.days).length),
      versionName: getDefaultServiceVersionName(travelDetail.defaultVersionName)
    }
  ];
  const seenVersionNames = new Set([definitions[0].versionName]);

  sanitizeItineraryVersions(travelDetail.itineraryVersions).forEach((item) => {
    const versionName = normalizeText(item && item.versionName);
    if (!versionName || seenVersionNames.has(versionName)) {
      return;
    }

    seenVersionNames.add(versionName);
    definitions.push({
      durationDays: Math.max(1, normalizeArray(item.days).length),
      versionName
    });
  });

  return definitions;
}

function findServiceVersionDefinition(service, versionName) {
  const definitions = buildServiceVersionDefinitions(service);
  const normalizedVersionName = normalizeText(versionName);

  if (!definitions.length) {
    return null;
  }

  if (!normalizedVersionName) {
    return definitions[0];
  }

  return definitions.find((item) => item.versionName === normalizedVersionName) || null;
}

function buildServiceSummary(service, creatorNameMap, periodStatsMap, orderStatsMap) {
  const serviceSlug = normalizeText(service.slug);
  const periodStats = periodStatsMap[serviceSlug] || {};
  const orderStats = orderStatsMap[serviceSlug] || {};
  const tags = getServiceRouteTags(service);
  const pendingSummary = summarizeServicePendingSections(service);

  return {
    id: normalizeText(service.id) || serviceSlug,
    slug: serviceSlug,
    name: normalizeText(service.name),
    type: normalizeServiceType(service && service.type, service),
    status: buildStatusTag(service),
    creatorId: normalizeText(service.creatorId),
    creatorName: creatorNameMap[normalizeText(service.creatorId)] || "",
    destinationSlugs: uniqueStrings(service.destinationSlugs),
    destinationCount: normalizeArray(service.destinationSlugs).length,
    tags,
    summary: normalizeText(service.summary),
    periodCount: normalizeNumber(periodStats.periodCount),
    soldSeats: normalizeNumber(orderStats.soldSeats),
    nextDepartureDate: normalizeText(periodStats.nextDate),
    remainingSeats: normalizeNumber(periodStats.remainingSeats),
    pendingSectionCount: pendingSummary.pendingSectionCount,
    createdAt: normalizeNumber(service && service.createdAt),
    updatedAt: normalizeNumber(service && service.updatedAt)
  };
}

function mapServiceDetailRecord(service, creatorNameMap) {
  const detail = isPlainObject(service && service.travelDetail) ? service.travelDetail : {};
  const tags = getServiceRouteTags(service);

  return {
    _id: normalizeText(service && service._id),
    id: normalizeText(service && service.id),
    slug: normalizeText(service && service.slug),
    name: normalizeText(service && service.name),
    type: normalizeServiceType(service && service.type, service),
    status: buildStatusTag(service),
    creatorId: normalizeText(service && service.creatorId),
    creatorName: creatorNameMap[normalizeText(service && service.creatorId)] || "",
    creatorRoles: uniqueStrings(service && service.creatorRoles),
    destinationSlugs: uniqueStrings(service && service.destinationSlugs),
    summary: normalizeText(service && service.summary),
    cover: getImageAssetOriginal(service && service.cover),
    gallery: flattenServiceGalleryGroups(service && service.galleryGroups, service && service.gallery)
      .map((item) => getImageAssetOriginal(item))
      .filter(Boolean),
    galleryGroups: sanitizeServiceGalleryGroups(service && service.galleryGroups, service && service.gallery).map((item) => ({
      label: item.label,
      images: normalizeArray(item.images).map((image) => getImageAssetOriginal(image)).filter(Boolean)
    })),
    tags,
    travelDetail: (() => {
      const travelDetail = sanitizeTravelDetail(
      detail,
      {
        slug: normalizeText(service && service.slug),
        name: normalizeText(service && service.name),
        cover: getImageAssetOriginal(service && service.cover)
      },
      detail
      );
      const overview = isPlainObject(travelDetail.overview) ? travelDetail.overview : {};
      travelDetail.consultWeChatQr = getImageAssetOriginal(travelDetail.consultWeChatQr);
      travelDetail.overview = Object.assign({}, overview, {
        coverImage: getImageAssetOriginal(overview.coverImage)
      });
      travelDetail.highlights = normalizeArray(travelDetail.highlights).map((item) => {
        if (!isPlainObject(item)) {
          return item;
        }

        return Object.assign({}, item, {
          images: normalizeArray(item.images).map((image) => getImageAssetOriginal(image)).filter(Boolean)
        });
      });
      return travelDetail;
    })(),
    createdAt: normalizeNumber(service && service.createdAt),
    updatedAt: normalizeNumber(service && service.updatedAt)
  };
}

function sanitizeReviewList(value) {
  return normalizeArray(value)
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const content = normalizeText(item.content);
      const audience = normalizeText(item.audience);
      if (!content && !audience) {
        return null;
      }

      return {
        content,
        audience
      };
    })
    .filter(Boolean);
}

function mapCreatorDetailRecord(creator) {
  return {
    _id: normalizeText(creator && creator._id),
    id: normalizeText(creator && creator.id),
    slug: normalizeText(creator && creator.slug),
    name: normalizeText(creator && creator.name),
    status: buildStatusTag(creator),
    avatar: getImageAssetOriginal(creator && creator.avatar),
    stance: normalizeText(creator && creator.stance),
    tags: normalizeCreatorTags(creator && creator.tags),
    destinationSlugs: uniqueStrings(creator && creator.destinationSlugs),
    about: normalizeArray(creator && creator.about).map((item) => normalizeText(item)).filter(Boolean),
    reviews: sanitizeReviewList(creator && creator.reviews),
    createdAt: normalizeNumber(creator && creator.createdAt),
    updatedAt: normalizeNumber(creator && creator.updatedAt)
  };
}

function mapDestinationDetailRecord(destination) {
  const regionCode = resolveDestinationRegionCode(destination && destination.regionCode, destination && destination.slug);
  return {
    _id: normalizeText(destination && destination._id),
    id: normalizeText(destination && destination.id),
    slug: normalizeText(destination && destination.slug),
    name: normalizeText(destination && destination.name),
    status: buildStatusTag(destination),
    regionCode,
    regionLabel: getDestinationRegionLabel(regionCode),
    cover: getImageAssetOriginal(destination && destination.cover),
    description: normalizeText(destination && destination.description),
    descriptionDetail: normalizeText(destination && destination.descriptionDetail),
    createdAt: normalizeNumber(destination && destination.createdAt),
    updatedAt: normalizeNumber(destination && destination.updatedAt)
  };
}

function mapIdeaDetailRecord(idea, authorNameMap) {
  const ideaTheme = normalizeIdeaTheme(
    idea && idea.themeKey,
    normalizeText(idea && idea.themeLabel) || normalizeText(idea && idea.theme),
    idea && idea.isCustomTheme
  );

  return {
    _id: normalizeText(idea && idea._id),
    id: normalizeText(idea && idea.id),
    slug: normalizeText(idea && idea.slug),
    title: normalizeText(idea && idea.title),
    theme: ideaTheme.themeLabel,
    themeKey: ideaTheme.themeKey,
    themeLabel: ideaTheme.themeLabel,
    isCustomTheme: ideaTheme.isCustomTheme,
    sourceType: normalizeIdeaSourceType(idea && idea.sourceType),
    status: buildStatusTag(idea),
    summary: normalizeText(idea && idea.summary),
    cover: getImageAssetOriginal(idea && idea.cover),
    authorId: normalizeText(idea && idea.authorId),
    authorName: authorNameMap[normalizeText(idea && idea.authorId)] || "",
    destinationSlugs: uniqueStrings(idea && idea.destinationSlugs),
    relatedServiceSlugs: uniqueStrings(idea && idea.relatedServiceSlugs),
    body: normalizeText(idea && idea.body),
    excerptBody: normalizeText(idea && idea.excerptBody),
    wechatArticleUrl: sanitizeExternalUrl(idea && idea.wechatArticleUrl),
    wechatArticleTitle: normalizeText(idea && idea.wechatArticleTitle),
    wechatCover: getImageAssetOriginal(idea && idea.wechatCover),
    publishedAt: normalizeNumber(idea && idea.publishedAt),
    readMoreText: normalizeText(idea && idea.readMoreText) || DEFAULT_IDEA_READ_MORE_TEXT,
    syncStatus: normalizeText(idea && idea.syncStatus) || "draft",
    createdAt: normalizeNumber(idea && idea.createdAt),
    updatedAt: normalizeNumber(idea && idea.updatedAt)
  };
}

function mapServicePeriodRecord(record, soldCount = resolvePeriodSoldCount(record)) {
  const normalizedSoldCount = Math.max(0, soldCount);
  const totalSeats = resolvePeriodTotalSeats(record, normalizedSoldCount);
  const remainingSeats = resolvePeriodRemainingSeats(record, normalizedSoldCount);
  const status = resolveDisplayServicePeriodStatus(record, normalizedSoldCount);

  return {
    _id: normalizeText(record && record._id),
    periodCode: normalizeText(record && record.periodCode),
    serviceId: normalizeText(record && record.serviceId),
    serviceSlug: normalizeText(record && record.serviceSlug),
    serviceName: normalizeText(record && record.serviceName),
    creatorId: normalizeText(record && record.creatorId),
    versionName: normalizeText(record && record.versionName),
    durationDays: Math.max(
      1,
      normalizePositiveInteger(record && record.durationDays, calcDurationDaysFromDates(record && record.dateStart, record && record.dateEnd))
    ),
    dateStart: normalizeText(record && record.dateStart),
    dateEnd: normalizeText(record && record.dateEnd),
    price: normalizeNumber(record && record.price),
    minGroup: normalizeNumber(record && record.minGroup, 1),
    totalSeats,
    soldCount: normalizedSoldCount,
    remainingSeats,
    status,
    createdAt: normalizeNumber(record && record.createdAt),
    updatedAt: normalizeNumber(record && record.updatedAt)
  };
}

async function getSoldCountByPeriodCode(periodCode) {
  const normalizedPeriodCode = normalizeText(periodCode);
  if (!normalizedPeriodCode) {
    return 0;
  }

  const rows = await queryRows(
    "SELECT SUM(COALESCE(`peopleCountInt`, `peopleCount`, 0)) AS `soldCount` FROM `TravelOrder` WHERE `servicePeriodCode` = {{periodCode}} AND COALESCE(`status`, '') <> 'canceled'",
    { periodCode: normalizedPeriodCode }
  );

  return resolvePeriodSoldCount(rows[0], 0);
}

async function getSoldCountByPeriodCodeMap() {
  const rows = await queryRows(
    "SELECT `servicePeriodCode`, SUM(COALESCE(`peopleCountInt`, `peopleCount`, 0)) AS `soldCount` FROM `TravelOrder` WHERE COALESCE(`status`, '') <> 'canceled' GROUP BY `servicePeriodCode`"
  );

  return rows.reduce((map, row) => {
    const periodCode = normalizeText(row.servicePeriodCode);
    if (!periodCode) {
      return map;
    }

    map[periodCode] = resolvePeriodSoldCount(row, 0);
    return map;
  }, {});
}

async function getPeriodStatsMap() {
  const rows = await queryRows(
    "SELECT `serviceSlug`, COUNT(*) AS `periodCount`, MIN(`dateStart`) AS `nextDate`, SUM(`remainingSeats`) AS `remainingSeats` FROM `ServicePeriod` GROUP BY `serviceSlug`"
  );

  return rows.reduce((map, row) => {
    const slug = normalizeText(row.serviceSlug);
    if (!slug) {
      return map;
    }

    map[slug] = {
      periodCount: normalizeNumber(row.periodCount),
      nextDate: normalizeText(row.nextDate),
      remainingSeats: normalizeNumber(row.remainingSeats)
    };
    return map;
  }, {});
}

async function getOrderStatsMap() {
  const rows = await queryRows(
    "SELECT `serviceSlug`, SUM(COALESCE(`peopleCountInt`, `peopleCount`, 0)) AS `soldSeats` FROM `TravelOrder` WHERE COALESCE(`status`, '') <> 'canceled' GROUP BY `serviceSlug`"
  );

  return rows.reduce((map, row) => {
    const slug = normalizeText(row.serviceSlug);
    if (!slug) {
      return map;
    }

    map[slug] = {
      soldSeats: normalizeNumber(row.soldSeats)
    };
    return map;
  }, {});
}

async function generateServicePeriodCode(serviceSlug, dateStart) {
  const normalizedServiceSlug = sanitizeCodeFragment(serviceSlug, "period");
  const normalizedDate = normalizeText(dateStart).replace(/\D/g, "");
  const prefix = `${normalizedServiceSlug}-${normalizedDate || "date"}`;
  const rows = await queryRows(
    "SELECT `periodCode` FROM `ServicePeriod` WHERE `serviceSlug` = {{serviceSlug}} AND `dateStart` = {{dateStart}}",
    { serviceSlug, dateStart }
  );
  const existingCodes = rows.map((row) => normalizeText(row.periodCode)).filter(Boolean);
  const nextSequence = getNextSlugSequence(existingCodes, prefix);
  if (nextSequence <= 0) {
    return prefix;
  }

  let sequence = nextSequence + 1;
  let nextCode = `${prefix}-${padSequence(sequence)}`;
  while (existingCodes.includes(nextCode)) {
    sequence += 1;
    nextCode = `${prefix}-${padSequence(sequence)}`;
  }

  return nextCode;
}

function buildStatusTag(record) {
  const status = normalizeText(record && record.status) || "active";
  return status === "inactive" ? "inactive" : status;
}

function formatDateInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function getShanghaiTodayDateString() {
  return formatDateInTimeZone(Date.now(), "Asia/Shanghai");
}

function formatShortDateLabel(dateString) {
  const normalized = normalizeText(dateString);
  if (!normalized) {
    return "";
  }

  return normalized.slice(5);
}

function formatDashboardStatusLabel(status) {
  switch (normalizeText(status)) {
    case "available":
      return "可报名";
    case "confirmed":
      return "确定成行";
    case "soldout":
      return "已报满";
    case "closed":
      return "已截止";
    case "inactive":
      return "下架";
    case "pending":
      return "待确认";
    case "paid":
      return "已支付";
    case "traveling":
      return "进行中";
    case "canceled":
      return "已取消";
    default:
      return normalizeText(status) || "--";
  }
}

function countFilledServiceHighlights(value) {
  return normalizeArray(value).filter((item) => {
    if (!isPlainObject(item)) {
      return false;
    }

    return Boolean(
      normalizeText(item.title)
      || normalizeText(item.description)
      || dedupeImageValues(item.images).length
    );
  }).length;
}

function countFilledServiceDays(value) {
  return normalizeArray(value).filter((item) => {
    if (!isPlainObject(item)) {
      return false;
    }

    return Boolean(
      normalizeText(item.title)
      || normalizeArray(item.modules).some((moduleItem) => {
        if (!isPlainObject(moduleItem)) {
          return false;
        }

        return Boolean(normalizeText(moduleItem.title) || normalizeText(moduleItem.content));
      })
    );
  }).length;
}

function countCompletedPairItems(value, leftKey, rightKey) {
  return normalizeArray(value).filter((item) => {
    if (!isPlainObject(item)) {
      return false;
    }

    return Boolean(normalizeText(item[leftKey]) && normalizeText(item[rightKey]));
  }).length;
}

function summarizeServicePendingSections(service) {
  const rawTravelDetail = isPlainObject(service && service.travelDetail) ? service.travelDetail : {};
  const rawOverview = isPlainObject(rawTravelDetail.overview) ? rawTravelDetail.overview : {};
  const rawCosts = isPlainObject(rawTravelDetail.costs) ? rawTravelDetail.costs : {};
  const tags = getServiceRouteTags(service);
  const cover = getImageAssetOriginal(service && service.cover);
  const galleryGroups = sanitizeServiceGalleryGroups(service && service.galleryGroups, service && service.gallery);
  const overviewCover = getImageAssetOriginal(rawOverview.coverImage) || cover;
  const missingSections = [];

  if (
    !normalizeText(service && service.name)
    || !normalizeText(service && service.creatorId)
    || !uniqueStrings(service && service.destinationSlugs).length
    || !tags.length
  ) {
    missingSections.push("路线信息");
  }

  if (!cover || !galleryGroups.length) {
    missingSections.push("封面与图集");
  }

  if (!overviewCover || !normalizeText(rawOverview.whyJoinText) || !normalizeText(rawOverview.suitableText)) {
    missingSections.push("概况区");
  }

  if (!countFilledServiceHighlights(rawTravelDetail.highlights)) {
    missingSections.push("亮点编辑");
  }

  if (!countFilledServiceDays(rawTravelDetail.itinerary && rawTravelDetail.itinerary.days)) {
    missingSections.push("行程编辑");
  }

  if (
    !countCompletedPairItems(rawCosts.include, "label", "content")
    || !countCompletedPairItems(rawCosts.exclude, "label", "content")
    || !countCompletedPairItems(rawCosts.refundRules, "days", "percent")
  ) {
    missingSections.push("费用与退款");
  }

  return {
    pendingSectionCount: missingSections.length,
    pendingSections: missingSections
  };
}

function isDashboardVisiblePeriodStatus(status) {
  const normalizedStatus = normalizeText(status);
  return normalizedStatus !== "inactive" && normalizedStatus !== "closed";
}

function buildDashboardTrend(rows, todayDateKey) {
  const dateKeys = Array.from({ length: DASHBOARD_TREND_DAYS }, (_, index) =>
    addDaysToDateString(todayDateKey, index - DASHBOARD_TREND_DAYS + 1)
  );
  const trendMap = dateKeys.reduce((map, dateKey) => {
    map[dateKey] = {
      dateKey,
      label: formatShortDateLabel(dateKey),
      orderAmount: 0,
      orderCount: 0
    };
    return map;
  }, {});

  normalizeArray(rows).forEach((row) => {
    const createdAtTs = normalizeNumber(row && row.createdAtTs, 0);
    const status = normalizeText(row && row.status);
    const dateKey = createdAtTs > 0 ? formatDateInTimeZone(createdAtTs, "Asia/Shanghai") : "";

    if (!dateKey || !trendMap[dateKey] || status === "canceled") {
      return;
    }

    trendMap[dateKey].orderCount += 1;
    trendMap[dateKey].orderAmount += normalizeNumber(
      row && (row.payableDec || row.payable || row.amountDec || row.amount),
      0
    );
  });

  return dateKeys.map((dateKey) => trendMap[dateKey]);
}

function listCreatorRefs(creator) {
  const id = normalizeText(creator && creator.id);
  const slug = normalizeText(creator && creator.slug);
  return [id, slug, slug ? `creator-${slug}` : ""].filter(Boolean);
}

function collectDestinationSlugsFromServicesForCreator(creator, services) {
  const refs = listCreatorRefs(creator);
  const collected = [];

  normalizeArray(services).forEach((service) => {
    if (refs.includes(normalizeText(service.creatorId))) {
      collected.push(...normalizeArray(service.destinationSlugs));
    }
  });

  return uniqueStrings(collected);
}

async function syncCreatorDestinationSlugsForServiceCreatorId(creatorIdField, adminUser) {
  const creatorId = normalizeText(creatorIdField);
  if (!creatorId) {
    return;
  }

  const [creators, services] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services)
  ]);

  const creator = creators.find((item) => listCreatorRefs(item).includes(creatorId));
  if (!creator || !creator._id) {
    return;
  }

  const destinationSlugs = collectDestinationSlugsFromServicesForCreator(creator, services);
  const now = Date.now();
  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));

  await db.collection(COLLECTIONS.creators).doc(creator._id).update({
    data: {
      destinationSlugs,
      updatedAt: now,
      ...(operatorId ? { updatedBy: operatorId } : {})
    }
  });
}

async function getDashboardSummary() {
  const todayDateKey = getShanghaiTodayDateString();
  const upcomingDateKey = addDaysToDateString(todayDateKey, DASHBOARD_UPCOMING_DAYS - 1);
  const [services, servicePeriodRows, orderRows] =
    await Promise.all([
      listCollection(COLLECTIONS.services),
      queryRows(
        "SELECT `serviceSlug`, `serviceName`, `periodCode`, `versionName`, `dateStart`, `remainingSeats`, `minGroup`, `status` FROM `ServicePeriod` ORDER BY `dateStart` ASC LIMIT 1000"
      ),
      queryRows(
        "SELECT `orderNo`, `serviceSlug`, `serviceName`, `travelDateStart`, `status`, `versionName`, `peopleCountInt`, `createdAtTs`, `paidAtTs`, `amount`, `amountDec`, `payable`, `payableDec`, `updatedAt` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT 1000"
      )
    ]);
  const activeServices = services.filter((item) => buildStatusTag(item) !== "inactive").length;
  const incompleteServices = services
    .map((service) => {
      const pendingSummary = summarizeServicePendingSections(service);
      return {
        key: normalizeText(service && service.slug) || normalizeText(service && service.id),
        title: normalizeText(service && service.name) || normalizeText(service && service.slug) || "未命名路线",
        description: pendingSummary.pendingSections.length
          ? `缺：${pendingSummary.pendingSections.join("、")}`
          : "必填模块已补齐",
        pendingSectionCount: pendingSummary.pendingSectionCount
      };
    })
    .filter((item) => item.pendingSectionCount > 0)
    .sort((left, right) => right.pendingSectionCount - left.pendingSectionCount || left.title.localeCompare(right.title, "zh-CN"));
  const upcomingPeriods = normalizeArray(servicePeriodRows)
    .map((row) => ({
      key: normalizeText(row && row.periodCode),
      title: normalizeText(row && row.serviceName) || normalizeText(row && row.serviceSlug) || normalizeText(row && row.periodCode),
      description: `${normalizeText(row && row.dateStart)} · ${normalizeText(row && row.versionName) || "标准版"} · ${formatDashboardStatusLabel(row && row.status)}`,
      dateStart: normalizeText(row && row.dateStart),
      status: normalizeText(row && row.status)
    }))
    .filter((item) => item.dateStart >= todayDateKey && item.dateStart <= upcomingDateKey && isDashboardVisiblePeriodStatus(item.status))
    .sort((left, right) => left.dateStart.localeCompare(right.dateStart));
  const pendingOrders = normalizeArray(orderRows)
    .filter((row) => normalizeText(row && row.status) === "pending")
    .map((row) => ({
      key: normalizeText(row && row.orderNo),
      title: normalizeText(row && row.serviceName) || normalizeText(row && row.orderNo),
      description: `${normalizeText(row && row.travelDateStart)} · ${normalizeNumber(row && row.peopleCountInt, 0)} 人 · ${normalizeText(row && row.versionName) || "标准版"}`,
      updatedAtTs: normalizeNumber(row && row.updatedAt, normalizeNumber(row && row.createdAtTs, 0))
    }))
    .sort((left, right) => right.updatedAtTs - left.updatedAtTs);
  const inventoryAlerts = normalizeArray(servicePeriodRows)
    .filter((row) => {
      const dateStart = normalizeText(row && row.dateStart);
      const remainingSeats = normalizeNumber(row && row.remainingSeats, 0);
      return dateStart >= todayDateKey
        && isDashboardVisiblePeriodStatus(row && row.status)
        && remainingSeats > 0
        && remainingSeats <= DASHBOARD_STOCK_WARNING_THRESHOLD;
    })
    .map((row) => ({
      key: normalizeText(row && row.periodCode),
      title: normalizeText(row && row.serviceName) || normalizeText(row && row.serviceSlug) || normalizeText(row && row.periodCode),
      description: `${normalizeText(row && row.dateStart)} · 余位 ${normalizeNumber(row && row.remainingSeats, 0)} / 成团 ${normalizeNumber(row && row.minGroup, 1)}`,
      remainingSeats: normalizeNumber(row && row.remainingSeats, 0),
      dateStart: normalizeText(row && row.dateStart)
    }))
    .sort((left, right) => left.remainingSeats - right.remainingSeats || left.dateStart.localeCompare(right.dateStart));

  return {
    workbench: [
      {
        key: "incompleteServices",
        label: "待补完路线数",
        value: incompleteServices.length,
        helper: `${activeServices} 条在架路线中仍有必填缺口`,
        items: incompleteServices.slice(0, DASHBOARD_PREVIEW_LIMIT)
      },
      {
        key: "upcomingPeriods",
        label: "即将出发团期",
        value: upcomingPeriods.length,
        helper: `未来 ${DASHBOARD_UPCOMING_DAYS} 天内待关注`,
        items: upcomingPeriods.slice(0, DASHBOARD_PREVIEW_LIMIT)
      },
      {
        key: "pendingOrders",
        label: "待确认订单",
        value: pendingOrders.length,
        helper: "优先处理等待人工确认的报名",
        items: pendingOrders.slice(0, DASHBOARD_PREVIEW_LIMIT)
      },
      {
        key: "inventoryAlerts",
        label: "库存预警",
        value: inventoryAlerts.length,
        helper: `余位不高于 ${DASHBOARD_STOCK_WARNING_THRESHOLD} 的可售团期`,
        items: inventoryAlerts.slice(0, DASHBOARD_PREVIEW_LIMIT)
      }
    ],
    trends: buildDashboardTrend(orderRows, todayDateKey)
  };
}

async function listServices(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const tag = normalizeText(payload && payload.tag);
  const limit = clampLimit(payload && payload.limit);
  const [services, creators, periodStatsMap, orderStatsMap] = await Promise.all([
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators),
    getPeriodStatsMap(),
    getOrderStatsMap()
  ]);
  const creatorNameMap = creators.reduce((map, creator) => {
    const id = normalizeText(creator && creator.id);
    const slug = normalizeText(creator && creator.slug);
    const name = normalizeText(creator && creator.name);
    if (id) {
      map[id] = name;
    }
    if (slug) {
      map[slug] = name;
      map[`creator-${slug}`] = name;
    }
    return map;
  }, {});

  return services
    .filter((service) => {
      const serviceStatus = buildStatusTag(service).toLowerCase();
      const serviceTags = getServiceRouteTags(service);
      if (status && status !== serviceStatus) {
        return false;
      }
      if (tag && !serviceTags.includes(tag)) {
        return false;
      }

      return matchesKeyword(
        [
          service.name,
          service.slug,
          service.summary,
          service.type,
          creatorNameMap[normalizeText(service.creatorId)],
          serviceTags.join(" ")
        ],
        keyword
      );
    })
    .slice(0, limit)
    .map((service) => buildServiceSummary(service, creatorNameMap, periodStatsMap, orderStatsMap));
}

async function getServiceDetail(payload) {
  const service = await findServiceDoc(payload);
  assertCondition(service, "未找到对应路线");

  const creators = await listCollection(COLLECTIONS.creators);
  const creatorNameMap = creators.reduce((map, creator) => {
    const refs = listCreatorRefs(creator);
    refs.forEach((ref) => {
      map[ref] = normalizeText(creator && creator.name);
    });
    return map;
  }, {});

  return mapServiceDetailRecord(service, creatorNameMap);
}

async function saveService(payload, adminUser) {
  const existing = payload && payload._id ? await findServiceDocById(payload._id) : null;
  const previousCreatorId = existing ? normalizeText(existing.creatorId) : "";
  const name = normalizeText(payload && payload.name);
  const type = normalizeServiceType(
    payload && payload.type,
    {
      durationTag: payload && payload.durationTag,
      travelDetail: payload && payload.travelDetail
    }
  );
  const requestedSlug = normalizeText(payload && payload.slug).toLowerCase();
  const slug = existing
    ? normalizeText(existing.slug).toLowerCase()
    : (requestedSlug || await generateServiceSlug(name));

  assertCondition(name, "路线名称不能为空");
  assertCondition(slug, "路线 slug 生成失败，请稍后重试");
  assertCondition(SERVICE_TYPE_OPTIONS.includes(type), "请选择有效的路线类型");

  if (existing) {
    assertCondition(
      !requestedSlug || normalizeText(existing.slug).toLowerCase() === requestedSlug,
      "暂不支持修改已有路线 slug"
    );
    assertCondition(
      !normalizeText(payload && payload.id) || normalizeText(existing.id) === normalizeText(payload.id),
      "暂不支持修改已有路线 ID"
    );
  } else {
    const duplicatedSlug = await findServiceDocBySlug(slug);
    assertCondition(!duplicatedSlug, "该路线 slug 已存在");

    const logicalId = normalizeText(payload && payload.id) || createServiceLogicalId(slug);
    const duplicatedId = await findServiceDocByLogicalId(logicalId);
    assertCondition(!duplicatedId, "该路线 ID 已存在");
  }

  const preparedSave = await copyDraftServiceAssetsForSave(payload, slug);
  const normalizedPayload = await normalizeServiceImagePayload(preparedSave.payload, slug);

  const now = Date.now();
  const logicalId = existing ? normalizeText(existing.id) : (normalizeText(normalizedPayload && normalizedPayload.id) || createServiceLogicalId(slug));
  const creatorRoles = uniqueStrings(normalizedPayload && normalizedPayload.creatorRoles);
  const routeTags = normalizeRouteTags(normalizedPayload && normalizedPayload.tags, existing ? getServiceRouteTags(existing) : []);
  assertCondition(routeTags.length >= 1, "请至少选择 1 个路线标签");
  assertCondition(routeTags.length <= 3, "路线标签最多选择 3 个");
  const nextDoc = {
    id: logicalId,
    slug,
    cover: normalizeImageAssetValue(normalizedPayload && normalizedPayload.cover),
    gallery: flattenServiceGalleryGroups(normalizedPayload && normalizedPayload.galleryGroups, normalizedPayload && normalizedPayload.gallery),
    galleryGroups: sanitizeServiceGalleryGroups(normalizedPayload && normalizedPayload.galleryGroups, normalizedPayload && normalizedPayload.gallery),
    type,
    name,
    creatorId: normalizeText(normalizedPayload && normalizedPayload.creatorId),
    creatorRoles: creatorRoles.length ? creatorRoles : getDefaultCreatorRoles(type),
    destinationSlugs: uniqueStrings(normalizedPayload && normalizedPayload.destinationSlugs),
    summary: normalizeText(normalizedPayload && normalizedPayload.summary),
    tags: routeTags,
    styles: routeTags,
    status: normalizeStatus(normalizedPayload && normalizedPayload.status, SERVICE_STATUSES, buildStatusTag(existing || normalizedPayload)),
    travelDetail: sanitizeTravelDetail(
      normalizedPayload && normalizedPayload.travelDetail,
      {
        slug,
        name,
        cover: normalizeImageAssetValue(normalizedPayload && normalizedPayload.cover)
      },
      existing && existing.travelDetail
    ),
    updatedAt: now,
    updatedBy: normalizeText(adminUser && (adminUser.uid || adminUser.id))
  };

  if (!existing) {
    nextDoc.createdAt = now;
    nextDoc.createdBy = normalizeText(adminUser && (adminUser.uid || adminUser.id));
    const createResult = await db.collection(COLLECTIONS.services).add({ data: nextDoc });
    if (nextDoc.status === "inactive") {
      await deactivateServicePeriodsByServiceSlug(slug);
    }
    const detail = await getServiceDetail({ _id: createResult && createResult._id });
    await deleteServiceAssetFiles(preparedSave.migratedSourceRefs);
    await syncCreatorDestinationSlugsForServiceCreatorId(nextDoc.creatorId, adminUser);
    return detail;
  }

  await db.collection(COLLECTIONS.services).doc(existing._id).update({
    data: {
      ...nextDoc,
      durationTag: _.remove(),
      priceLabel: _.remove(),
    },
  });
  if (nextDoc.status === "inactive") {
    await deactivateServicePeriodsByServiceSlug(slug);
  }
  const detail = await getServiceDetail({ _id: existing._id });
  await deleteServiceAssetFiles(preparedSave.migratedSourceRefs.concat(getRemovedServiceAssetRefs(existing, nextDoc)));
  await syncCreatorDestinationSlugsForServiceCreatorId(nextDoc.creatorId, adminUser);
  if (previousCreatorId && previousCreatorId !== normalizeText(nextDoc.creatorId)) {
    await syncCreatorDestinationSlugsForServiceCreatorId(previousCreatorId, adminUser);
  }
  return detail;
}

async function cleanupHomePageServiceReferences(serviceSlug, adminUser) {
  return cleanupHomePageSlugReferences(
    serviceSlug,
    [
      "featuredServiceSlugs",
      "recentServiceSlugs",
      "specialProjectServiceSlugs"
    ],
    adminUser
  );
}

async function cleanupHomePageSlugReferences(targetSlug, relationKeys, adminUser) {
  const normalizedTargetSlug = normalizeText(targetSlug);
  if (!normalizedTargetSlug) {
    return;
  }

  const homeConfigDoc = await readConfig("homePage");
  if (!homeConfigDoc || !isPlainObject(homeConfigDoc.value)) {
    return;
  }

  const nextValue = cloneJson(homeConfigDoc.value, {});

  let changed = false;
  relationKeys.forEach((key) => {
    const currentValues = uniqueStrings(nextValue[key]);
    const filteredValues = currentValues.filter((slug) => slug !== normalizedTargetSlug);
    if (filteredValues.length !== currentValues.length) {
      nextValue[key] = filteredValues;
      changed = true;
    }
  });

  if (!changed) {
    return;
  }

  await saveConfigDetail(
    {
      key: "homePage",
      value: nextValue
    },
    adminUser
  );
}

function collectCreatorAssetRefs(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  return uniqueStrings(listImageAssetRefs(source.avatar)).filter(isCloudFileId);
}

function collectDestinationAssetRefs(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  return uniqueStrings(listImageAssetRefs(source.cover)).filter(isCloudFileId);
}

function collectIdeaAssetRefs(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  return uniqueStrings(listImageAssetRefs(source.cover)).filter(isCloudFileId);
}

async function deleteService(payload, adminUser) {
  const existing = await findServiceDoc(payload);
  assertCondition(existing, "未找到对应路线");

  const serviceCreatorId = normalizeText(existing.creatorId);
  const serviceSlug = normalizeText(existing.slug);
  const orderCount = await queryCount(
    "SELECT COUNT(*) AS `total` FROM `TravelOrder` WHERE `serviceSlug` = {{serviceSlug}} AND COALESCE(`status`, '') <> 'canceled'",
    { serviceSlug }
  );
  assertCondition(orderCount === 0, "该路线已有订单，不能直接删除");

  const removedPeriods = await queryCount(
    "SELECT COUNT(*) AS `total` FROM `ServicePeriod` WHERE `serviceSlug` = {{serviceSlug}}",
    { serviceSlug }
  );

  const { error } = await rdb.from("ServicePeriod").delete().eq("serviceSlug", serviceSlug);
  if (error) {
    throw new Error(error.message || "删除路线关联团期失败");
  }

  await db.collection(COLLECTIONS.services).doc(existing._id).remove();
  await cleanupHomePageServiceReferences(serviceSlug, adminUser);
  await syncCreatorDestinationSlugsForServiceCreatorId(serviceCreatorId, adminUser);

  return {
    serviceSlug,
    removed: true,
    removedPeriods
  };
}

async function getCreatorDetail(payload) {
  const creator = await findContentDoc(COLLECTIONS.creators, payload);
  assertCondition(creator, "未找到对应创作者");
  return mapCreatorDetailRecord(creator);
}

async function saveCreator(payload, adminUser) {
  const existing = await findContentDoc(COLLECTIONS.creators, payload);
  const requestedSlug = normalizeText(payload && payload.slug).toLowerCase();
  const name = normalizeText(payload && payload.name);
  const slug = existing
    ? normalizeText(existing.slug).toLowerCase()
    : (requestedSlug || await generateCreatorSlug(name));

  assertCondition(name, "创作者名称不能为空");
  assertCondition(slug, "创作者 slug 生成失败，请稍后重试");

  if (existing) {
    assertCondition(
      !requestedSlug || normalizeText(existing.slug).toLowerCase() === requestedSlug,
      "暂不支持修改已有创作者 slug"
    );
    assertCondition(
      !normalizeText(payload && payload.id) || normalizeText(existing.id) === normalizeText(payload.id),
      "暂不支持修改已有创作者 ID"
    );
  } else {
    const duplicatedSlug = await findCollectionDocByField(COLLECTIONS.creators, "slug", slug);
    assertCondition(!duplicatedSlug, "该创作者 slug 已存在");

    const logicalId = normalizeText(payload && payload.id) || createCreatorLogicalId(slug);
    const duplicatedId = await findCollectionDocByField(COLLECTIONS.creators, "id", logicalId);
    assertCondition(!duplicatedId, "该创作者 ID 已存在");
  }

  const creatorTags = normalizeCreatorTags(payload && payload.tags, existing && existing.tags);
  assertCondition(creatorTags.length >= 1, "请至少选择 1 个创作者标签");
  assertCondition(creatorTags.length <= 2, "创作者标签最多选择 2 个");

  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();
  const normalizedPayload = await normalizeCreatorImagePayload(payload, slug);
  const services = await listCollection(COLLECTIONS.services);
  const creatorForDestinationAggregation = {
    id: existing ? normalizeText(existing.id) : (normalizeText(payload && payload.id) || createCreatorLogicalId(slug)),
    slug
  };
  const nextDoc = {
    id: existing ? normalizeText(existing.id) : (normalizeText(payload && payload.id) || createCreatorLogicalId(slug)),
    slug,
    name,
    avatar: getImageAssetOriginal(normalizedPayload && normalizedPayload.avatar),
    stance: normalizeText(payload && payload.stance),
    tags: creatorTags,
    destinationSlugs: collectDestinationSlugsFromServicesForCreator(creatorForDestinationAggregation, services),
    about: normalizeArray(payload && payload.about).map((item) => normalizeText(item)).filter(Boolean),
    reviews: sanitizeReviewList(payload && payload.reviews),
    status: normalizeStatus(payload && payload.status, SERVICE_STATUSES, buildStatusTag(existing || payload)),
    updatedAt: now,
    updatedBy: operatorId
  };

  if (!existing) {
    nextDoc.createdAt = now;
    nextDoc.createdBy = operatorId;
    const createResult = await db.collection(COLLECTIONS.creators).add({ data: nextDoc });
    return getCreatorDetail({ _id: createResult && createResult._id });
  }

  await db.collection(COLLECTIONS.creators).doc(existing._id).update({ data: nextDoc });
  return getCreatorDetail({ _id: existing._id });
}

async function deleteCreator(payload, adminUser) {
  const existing = await findContentDoc(COLLECTIONS.creators, payload);
  assertCondition(existing, "未找到对应创作者");

  const creatorRefs = listCreatorRefs(existing);
  const [services, ideas] = await Promise.all([
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas)
  ]);

  const relatedServices = services.filter((service) => creatorRefs.includes(normalizeText(service.creatorId)));
  assertCondition(relatedServices.length === 0, "该创作者仍有关联路线，不能直接删除");

  const relatedIdeas = ideas.filter((idea) => creatorRefs.includes(normalizeText(idea.authorId)));
  assertCondition(relatedIdeas.length === 0, "该创作者仍有关联故事，不能直接删除");

  await db.collection(COLLECTIONS.creators).doc(existing._id).remove();
  await cleanupHomePageSlugReferences(normalizeText(existing.slug), ["featuredCreatorSlugs"], adminUser);
  await deleteServiceAssetFiles(collectCreatorAssetRefs(existing));

  return {
    slug: normalizeText(existing.slug),
    removed: true
  };
}

async function getDestinationDetail(payload) {
  const destination = await findContentDoc(COLLECTIONS.destinations, payload);
  assertCondition(destination, "未找到对应目的地");
  return mapDestinationDetailRecord(destination);
}

async function saveDestination(payload, adminUser) {
  const existing = await findContentDoc(COLLECTIONS.destinations, payload);
  const requestedSlug = normalizeText(payload && payload.slug).toLowerCase();
  const name = normalizeText(payload && payload.name);
  const slug = existing
    ? normalizeText(existing.slug).toLowerCase()
    : (requestedSlug || (await generateDestinationSlug(name)));

  assertCondition(name, "目的地名称不能为空");
  assertCondition(slug, "目的地 slug 生成失败，请稍后重试");

  const regionCode = resolveDestinationRegionCode(
    payload && payload.regionCode,
    slug || (existing && existing.slug),
    existing && existing.regionCode
  );

  assertCondition(regionCode, "请选择所在区域");

  if (existing) {
    assertCondition(
      !requestedSlug || normalizeText(existing.slug).toLowerCase() === requestedSlug,
      "暂不支持修改已有目的地 slug"
    );
    assertCondition(
      !normalizeText(payload && payload.id) || normalizeText(existing.id) === normalizeText(payload.id),
      "暂不支持修改已有目的地 ID"
    );
  } else {
    const duplicatedSlug = await findCollectionDocByField(COLLECTIONS.destinations, "slug", slug);
    assertCondition(!duplicatedSlug, "该目的地 slug 已存在");

    const logicalId = normalizeText(payload && payload.id) || createDestinationLogicalId(slug);
    const duplicatedId = await findCollectionDocByField(COLLECTIONS.destinations, "id", logicalId);
    assertCondition(!duplicatedId, "该目的地 ID 已存在");
  }

  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();
  const normalizedPayload = await normalizeDestinationImagePayload(payload, slug);
  const nextDoc = {
    id: existing
      ? normalizeText(existing.id)
      : (normalizeText(payload && payload.id) || createDestinationLogicalId(slug)),
    slug,
    name,
    regionCode,
    cover: getImageAssetOriginal(normalizedPayload && normalizedPayload.cover),
    description: normalizeText(normalizedPayload && normalizedPayload.description),
    descriptionDetail: normalizeText(normalizedPayload && normalizedPayload.descriptionDetail),
    status: normalizeStatus(normalizedPayload && normalizedPayload.status, SERVICE_STATUSES, buildStatusTag(existing || normalizedPayload)),
    updatedAt: now,
    updatedBy: operatorId
  };

  if (!existing) {
    nextDoc.createdAt = now;
    nextDoc.createdBy = operatorId;
    const createResult = await db.collection(COLLECTIONS.destinations).add({ data: nextDoc });
    return getDestinationDetail({ _id: createResult && createResult._id });
  }

  await db.collection(COLLECTIONS.destinations).doc(existing._id).update({ data: nextDoc });
  return getDestinationDetail({ _id: existing._id });
}

async function deleteDestination(payload, adminUser) {
  const existing = await findContentDoc(COLLECTIONS.destinations, payload);
  assertCondition(existing, "未找到对应目的地");

  const destinationSlug = normalizeText(existing.slug);
  const [creators, services, ideas] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas)
  ]);

  assertCondition(
    creators.every((creator) => !normalizeArray(creator.destinationSlugs).includes(destinationSlug)),
    "该目的地仍有关联创作者，不能直接删除"
  );
  assertCondition(
    services.every((service) => !normalizeArray(service.destinationSlugs).includes(destinationSlug)),
    "该目的地仍有关联路线，不能直接删除"
  );
  assertCondition(
    ideas.every((idea) => !normalizeArray(idea.destinationSlugs).includes(destinationSlug)),
    "该目的地仍有关联故事，不能直接删除"
  );

  await db.collection(COLLECTIONS.destinations).doc(existing._id).remove();
  await cleanupHomePageSlugReferences(destinationSlug, ["featuredDestinationSlugs"], adminUser);
  await deleteServiceAssetFiles(collectDestinationAssetRefs(existing));

  return {
    slug: destinationSlug,
    removed: true
  };
}

async function getIdeaDetail(payload) {
  const idea = await findContentDoc(COLLECTIONS.ideas, payload);
  assertCondition(idea, "未找到对应故事");

  const creators = await listCollection(COLLECTIONS.creators);
  const authorNameMap = creators.reduce((map, creator) => {
    listCreatorRefs(creator).forEach((ref) => {
      map[ref] = normalizeText(creator && creator.name);
    });
    return map;
  }, {});

  return mapIdeaDetailRecord(idea, authorNameMap);
}

async function saveIdea(payload, adminUser) {
  const existing = await findContentDoc(COLLECTIONS.ideas, payload);
  const title = normalizeText(payload && payload.title);
  const requestedSlug = normalizeText(payload && payload.slug).toLowerCase();
  const sourceType = normalizeIdeaSourceType(payload && payload.sourceType);
  const slug = existing
    ? normalizeText(existing.slug).toLowerCase()
    : (requestedSlug || await generateIdeaSlug(title));
  const ideaTheme = normalizeIdeaTheme(
    payload && payload.themeKey,
    normalizeText(payload && payload.themeLabel) || normalizeText(payload && payload.theme),
    payload && payload.isCustomTheme
  );

  assertCondition(title, "故事标题不能为空");
  assertCondition(slug, "故事 slug 生成失败，请稍后重试");
  assertCondition(ideaTheme.themeLabel, "请选择或输入故事主题");

  if (existing) {
    assertCondition(
      !requestedSlug || normalizeText(existing.slug).toLowerCase() === requestedSlug,
      "暂不支持修改已有故事 slug"
    );
    assertCondition(
      !normalizeText(payload && payload.id) || normalizeText(existing.id) === normalizeText(payload.id),
      "暂不支持修改已有故事 ID"
    );
  } else {
    const duplicatedSlug = await findCollectionDocByField(COLLECTIONS.ideas, "slug", slug);
    assertCondition(!duplicatedSlug, "该故事 slug 已存在");
  }

  const creators = await listCollection(COLLECTIONS.creators);
  const matchedAuthor = creators.find((creator) =>
    listCreatorRefs(creator).includes(normalizeText(payload && payload.authorId))
  );
  assertCondition(matchedAuthor, "请选择已存在的创作者");

  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();
  const normalizedPayload = await normalizeIdeaImagePayload(payload, slug);
  const body = normalizeText(normalizedPayload && normalizedPayload.body);
  const excerptBody = normalizeText(normalizedPayload && normalizedPayload.excerptBody);
  const wechatArticleUrl = sanitizeExternalUrl(normalizedPayload && normalizedPayload.wechatArticleUrl);
  const wechatArticleTitle = normalizeText(normalizedPayload && normalizedPayload.wechatArticleTitle);
  const publishedAt = normalizeNumber(normalizedPayload && normalizedPayload.publishedAt, 0);
  const readMoreText = normalizeText(normalizedPayload && normalizedPayload.readMoreText) || DEFAULT_IDEA_READ_MORE_TEXT;
  const syncStatus = normalizeText(normalizedPayload && normalizedPayload.syncStatus) || "draft";

  if (sourceType === "mini") {
    assertCondition(body, "小程序全文模式必须填写正文内容");
  }

  if (sourceType === "hybrid") {
    assertCondition(excerptBody, "混合模式必须填写小程序导读");
  }

  if (sourceType === "wechat" || sourceType === "hybrid") {
    assertCondition(wechatArticleUrl, "公众号导流或混合模式必须填写原文链接");
  }

  const nextDoc = {
    id: existing
      ? normalizeText(existing.id)
      : (normalizeText(payload && payload.id) || createIdeaLogicalId(slug)),
    slug,
    title,
    theme: ideaTheme.themeLabel,
    themeKey: ideaTheme.themeKey,
    themeLabel: ideaTheme.themeLabel,
    isCustomTheme: ideaTheme.isCustomTheme,
    sourceType,
    summary: normalizeText(normalizedPayload && normalizedPayload.summary),
    cover: getImageAssetOriginal(normalizedPayload && normalizedPayload.cover),
    authorId: normalizeText(matchedAuthor && matchedAuthor.id) || normalizeText(normalizedPayload && normalizedPayload.authorId),
    destinationSlugs: uniqueStrings(normalizedPayload && normalizedPayload.destinationSlugs),
    relatedServiceSlugs: uniqueStrings(normalizedPayload && normalizedPayload.relatedServiceSlugs),
    body,
    excerptBody,
    wechatArticleUrl,
    wechatArticleTitle,
    wechatCover: getImageAssetOriginal(normalizedPayload && normalizedPayload.wechatCover),
    publishedAt: publishedAt > 0 ? publishedAt : now,
    readMoreText,
    syncStatus: syncStatus === "published" ? "published" : "draft",
    status: normalizeStatus(normalizedPayload && normalizedPayload.status, SERVICE_STATUSES, buildStatusTag(existing || normalizedPayload)),
    updatedAt: now,
    updatedBy: operatorId
  };

  assertCondition(nextDoc.cover, "请上传故事封面图");

  if (!existing) {
    nextDoc.createdAt = now;
    nextDoc.createdBy = operatorId;
    const createResult = await db.collection(COLLECTIONS.ideas).add({ data: nextDoc });
    return getIdeaDetail({ _id: createResult && createResult._id });
  }

  await db.collection(COLLECTIONS.ideas).doc(existing._id).update({ data: nextDoc });
  return getIdeaDetail({ _id: existing._id });
}

async function deleteIdea(payload, adminUser) {
  const existing = await findContentDoc(COLLECTIONS.ideas, payload);
  assertCondition(existing, "未找到对应故事");

  const ideaSlug = normalizeText(existing.slug);
  await db.collection(COLLECTIONS.ideas).doc(existing._id).remove();
  await cleanupHomePageSlugReferences(ideaSlug, ["featuredIdeaSlugs"], adminUser);
  await deleteServiceAssetFiles(collectIdeaAssetRefs(existing));

  return {
    slug: ideaSlug,
    removed: true
  };
}

async function listCreators(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const tag = normalizeText(payload && payload.tag);
  const limit = clampLimit(payload && payload.limit);
  const [creators, services] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services)
  ]);

  return creators
    .filter((creator) => {
      const creatorTags = normalizeCreatorTags(creator.tags);
      if (tag && !creatorTags.includes(tag)) {
        return false;
      }

      return matchesKeyword([creator.name, creator.slug, creator.stance, ...creatorTags], keyword);
    })
    .slice(0, limit)
    .map((creator) => ({
      id: normalizeText(creator.id) || normalizeText(creator.slug),
      slug: normalizeText(creator.slug),
      name: normalizeText(creator.name),
      status: buildStatusTag(creator),
      stance: normalizeText(creator.stance),
      tags: normalizeCreatorTags(creator.tags),
      destinationSlugs: uniqueStrings(creator.destinationSlugs),
      destinationCount: normalizeArray(creator.destinationSlugs).length,
      serviceCount: services.filter((service) => listCreatorRefs(creator).includes(normalizeText(service.creatorId))).length,
      createdAt: normalizeNumber(creator && creator.createdAt),
      updatedAt: normalizeNumber(creator && creator.updatedAt)
    }));
}

async function listDestinations(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const limit = clampLimit(payload && payload.limit);
  const [destinations, creators, services] = await Promise.all([
    listCollection(COLLECTIONS.destinations),
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services)
  ]);

  return destinations
    .filter((destination) =>
      matchesKeyword(
        [
          destination.name,
          destination.slug,
          destination.description,
          getDestinationRegionLabel(resolveDestinationRegionCode(destination.regionCode, destination.slug))
        ],
        keyword
      )
    )
    .slice(0, limit)
    .map((destination) => {
      const slug = normalizeText(destination.slug);
      const regionCode = resolveDestinationRegionCode(destination.regionCode, slug);
      return {
        id: normalizeText(destination.id) || slug,
        slug,
        name: normalizeText(destination.name),
        status: buildStatusTag(destination),
        regionCode,
        regionLabel: getDestinationRegionLabel(regionCode),
        description: normalizeText(destination.description),
        creatorSlugs: creators
          .filter((creator) => normalizeArray(creator.destinationSlugs).includes(slug))
          .map((creator) => normalizeText(creator.slug))
          .filter(Boolean),
        creatorCount: creators.filter((creator) => normalizeArray(creator.destinationSlugs).includes(slug)).length,
        serviceCount: services.filter((service) => normalizeArray(service.destinationSlugs).includes(slug)).length,
        createdAt: normalizeNumber(destination && destination.createdAt),
        updatedAt: normalizeNumber(destination && destination.updatedAt)
      };
    });
}

async function listIdeas(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const limit = clampLimit(payload && payload.limit);
  const [ideas, creators] = await Promise.all([
    listCollection(COLLECTIONS.ideas),
    listCollection(COLLECTIONS.creators)
  ]);
  const authorMap = creators.reduce((map, creator) => {
    map[normalizeText(creator.id)] = normalizeText(creator.name);
    map[normalizeText(creator.slug)] = normalizeText(creator.name);
    map[`creator-${normalizeText(creator.slug)}`] = normalizeText(creator.name);
    return map;
  }, {});

  return ideas
    .filter((idea) => {
      const ideaTheme = normalizeIdeaTheme(
        idea && idea.themeKey,
        normalizeText(idea && idea.themeLabel) || normalizeText(idea && idea.theme),
        idea && idea.isCustomTheme
      );
      return matchesKeyword(
        [idea.title, idea.slug, idea.summary, ideaTheme.themeLabel, authorMap[normalizeText(idea.authorId)]],
        keyword
      );
    })
    .slice(0, limit)
    .map((idea) => {
      const ideaTheme = normalizeIdeaTheme(
        idea && idea.themeKey,
        normalizeText(idea && idea.themeLabel) || normalizeText(idea && idea.theme),
        idea && idea.isCustomTheme
      );
      return {
        id: normalizeText(idea.id) || normalizeText(idea.slug),
        slug: normalizeText(idea.slug),
        title: normalizeText(idea.title),
        theme: ideaTheme.themeLabel,
        themeKey: ideaTheme.themeKey,
        themeLabel: ideaTheme.themeLabel,
        isCustomTheme: ideaTheme.isCustomTheme,
        sourceType: normalizeIdeaSourceType(idea && idea.sourceType),
        status: buildStatusTag(idea),
        authorName: authorMap[normalizeText(idea.authorId)] || "",
        destinationCount: normalizeArray(idea.destinationSlugs).length,
        summary: normalizeText(idea.summary),
        createdAt: normalizeNumber(idea && idea.createdAt),
        updatedAt: normalizeNumber(idea && idea.updatedAt)
      };
    });
}

async function listServicePeriods(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const serviceSlug = normalizeText(payload && payload.serviceSlug);
  const limit = clampLimit(payload && payload.limit, 100);
  const [rows, soldCountMap] = await Promise.all([
    queryRows(
      "SELECT `serviceSlug`, `serviceName`, `periodCode`, `versionName`, `durationDays`, `dateStart`, `dateEnd`, `price`, `minGroup`, `remainingSeats`, `status`, `updatedAt` FROM `ServicePeriod` ORDER BY `dateStart` DESC LIMIT 500"
    ),
    getSoldCountByPeriodCodeMap()
  ]);

  return rows
    .filter((row) => {
      if (serviceSlug && normalizeText(row.serviceSlug) !== serviceSlug) {
        return false;
      }

      return matchesKeyword([row.serviceName, row.serviceSlug, row.periodCode, row.versionName], keyword);
    })
    .slice(0, limit)
    .map((row) => Object.assign(
      mapServicePeriodRecord(row, soldCountMap[normalizeText(row.periodCode)] || 0),
      {
        updatedAt: normalizeNumber(row.updatedAt)
      }
    ));
}

async function getServicePeriodDetail(payload) {
  const record = await findServicePeriodByCode(payload && payload.periodCode);
  assertCondition(record, "未找到对应团期");
  const soldCount = await getSoldCountByPeriodCode(record.periodCode);
  return mapServicePeriodRecord(record, soldCount);
}

async function saveServicePeriod(payload, adminUser) {
  const originalPeriodCode = normalizeText(payload && (payload.originalPeriodCode || payload.periodCode));
  const existing = originalPeriodCode ? await findServicePeriodByCode(originalPeriodCode) : null;
  let periodCode = normalizeText(payload && payload.periodCode);
  const serviceSlug = normalizeText(payload && payload.serviceSlug);
  const service = await findServiceDocBySlug(serviceSlug);
  const requestedVersionName = normalizeText(payload && payload.versionName);

  assertCondition(service, "请选择已存在的路线");
  let versionDefinition = findServiceVersionDefinition(service, requestedVersionName);
  if (!versionDefinition && existing) {
    const existingVersionName = normalizeText(existing && existing.versionName);
    const shouldKeepExistingVersion = !requestedVersionName || requestedVersionName === existingVersionName;

    if (shouldKeepExistingVersion && existingVersionName) {
      versionDefinition = {
        versionName: existingVersionName,
        durationDays: Math.max(
          1,
          normalizePositiveInteger(
            existing && existing.durationDays,
            calcDurationDaysFromDates(existing && existing.dateStart, existing && existing.dateEnd)
          )
        )
      };
    }
  }
  assertCondition(versionDefinition, "请选择路线中已定义的版本");

  const dateStart = validateDateString(payload && payload.dateStart, "出发日期");
  const durationDays = Math.max(1, normalizePositiveInteger(versionDefinition && versionDefinition.durationDays, 1));
  const dateEnd = addDaysToDateString(dateStart, durationDays - 1);
  assertCondition(dateEnd >= dateStart, "结束日期不能早于出发日期");
  const price = normalizeNumber(payload && payload.price, NaN);
  assertCondition(Number.isFinite(price) && price > 0, "团期价格必须大于 0");

  if (!existing && !periodCode) {
    periodCode = await generateServicePeriodCode(serviceSlug, dateStart);
  }

  assertCondition(periodCode, "团期编码生成失败，请稍后重试");
  assertCondition(!existing || originalPeriodCode === periodCode, "暂不支持修改已有团期编码");

  if (!existing) {
    const duplicated = await findServicePeriodByCode(periodCode);
    assertCondition(!duplicated, "系统生成的团期编码重复，请稍后重试");
  }

  const minGroup = Math.max(1, normalizePositiveInteger(payload && payload.minGroup, 1));
  const soldCount = existing ? await getSoldCountByPeriodCode(originalPeriodCode || periodCode) : 0;
  if (existing) {
    const currentDisplayStatus = resolveDisplayServicePeriodStatus(existing, soldCount);
    assertCondition(currentDisplayStatus !== "inactive", "已下架团期不可编辑，只能查看或删除");
  }
  const totalSeats = Math.max(
    0,
    normalizePositiveInteger(payload && payload.totalSeats, normalizePositiveInteger(payload && payload.remainingSeats, 0))
  );
  const remainingSeats = Math.max(0, totalSeats - soldCount);
  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();
  const record = {
    periodCode,
    serviceId: normalizeText(service && service.id),
    serviceSlug: normalizeText(service && service.slug),
    serviceName: normalizeText(service && service.name),
    creatorId: normalizeText(service && service.creatorId),
    versionName: versionDefinition.versionName,
    durationDays,
    dateStart,
    dateEnd,
    dateStartDate: dateStart,
    dateEndDate: dateEnd,
    price,
    priceDec: toDecimalString(price),
    minGroup,
    minGroupInt: minGroup,
    totalSeats,
    totalSeatsInt: totalSeats,
    remainingSeats,
    remainingSeatsInt: remainingSeats,
    status: resolveServicePeriodStatus(payload && payload.status, service, remainingSeats, dateStart, dateEnd, soldCount, minGroup),
    badge: "",
    updatedAt: now,
    updateBy: operatorId
  };

  if (!existing) {
    const createRecord = buildServicePeriodCreateRecord(record, operatorId, now);
    let { error } = await rdb.from("ServicePeriod").insert(createRecord);
    if (error && shouldFallbackLegacyServicePeriodFields(error)) {
      ({ error } = await rdb.from("ServicePeriod").insert(stripOptionalTotalSeatFields(createRecord)));
    }
    if (error) {
      throw new Error(error.message || "创建团期失败");
    }
    return getServicePeriodDetail({ periodCode });
  }

  let { error } = await rdb
    .from("ServicePeriod")
    .update(record)
    .eq("periodCode", originalPeriodCode);
  if (error && shouldFallbackLegacyServicePeriodFields(error)) {
    ({ error } = await rdb
      .from("ServicePeriod")
      .update(stripOptionalTotalSeatFields(record))
      .eq("periodCode", originalPeriodCode));
  }

  if (error) {
    throw new Error(error.message || "更新团期失败");
  }

  return getServicePeriodDetail({ periodCode });
}

async function deleteServicePeriod(payload) {
  const periodCode = normalizeText(payload && payload.periodCode);
  assertCondition(periodCode, "缺少团期编码");

  const existing = await findServicePeriodByCode(periodCode);
  assertCondition(existing, "未找到对应团期");

  const orderCount = await queryCount(
    "SELECT COUNT(*) AS `total` FROM `TravelOrder` WHERE `servicePeriodCode` = {{periodCode}}",
    { periodCode }
  );
  assertCondition(orderCount === 0, "该团期已有订单，不能直接删除");

  const { error } = await rdb.from("ServicePeriod").delete().eq("periodCode", periodCode);
  if (error) {
    throw new Error(error.message || "删除团期失败");
  }

  return {
    periodCode,
    removed: true
  };
}

async function getConfigOverview() {
  const [configs, homeConfigDoc] = await Promise.all([
    listCollection(CONFIG_COLLECTION),
    readConfig("homePage")
  ]);
  const homeConfig = homeConfigDoc && homeConfigDoc.value ? homeConfigDoc.value : {};

  return {
    configKeys: configs.map((item) => normalizeText(item.key)).filter(Boolean),
    homePage: {
      heroSlides: normalizeArray(homeConfig.heroSlides).length,
      featuredCreatorSlugs: normalizeArray(homeConfig.featuredCreatorSlugs).length,
      featuredDestinationSlugs: normalizeArray(homeConfig.featuredDestinationSlugs).length,
      featuredServiceSlugs: normalizeArray(homeConfig.featuredServiceSlugs).length,
      recentServiceSlugs: normalizeArray(homeConfig.recentServiceSlugs).length,
      specialProjectServiceSlugs: normalizeArray(homeConfig.specialProjectServiceSlugs).length,
      featuredIdeaSlugs: normalizeArray(homeConfig.featuredIdeaSlugs).length
    }
  };
}

async function listOrders(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const userId = normalizeText(payload && payload.userId);
  const limit = clampLimit(payload && payload.limit);
  const [rows, users, orderEventDocs] = await Promise.all([
    queryRows(
      "SELECT `orderNo`, `userOpenid`, `serviceSlug`, `serviceName`, `travelDateStart`, `status`, `versionName`, `peopleCountInt`, `createdAtTs`, `paidAtTs`, `canceledAtTs`, `updatedAt` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT 200"
    ),
    listCollection(COLLECTIONS.users),
    listOptionalCollection(ORDER_EVENTS_COLLECTION)
  ]);
  const userMap = buildOrderUserMap(users);
  const orderEventMap = normalizeArray(orderEventDocs).reduce((map, doc) => {
    const orderNo = normalizeText(doc && doc.orderNo);
    if (!orderNo) {
      return map;
    }

    if (!map[orderNo]) {
      map[orderNo] = [];
    }

    map[orderNo].push(doc);
    return map;
  }, {});

  return rows
    .map((row) => {
      const userSummary = resolveOrderUserSummary(userMap, row.userOpenid);
      const statusLogs = buildOrderStatusLogs(row, orderEventMap[normalizeText(row.orderNo)]);
      return {
        row,
        userSummary,
        updatedAtTs: resolveLastOrderUpdateTs(row, statusLogs)
      };
    })
    .filter(({ row, userSummary }) =>
      (!userId || userSummary.userId === userId)
      && matchesKeyword(
        [row.orderNo, row.serviceName, row.serviceSlug, row.travelDateStart, row.versionName, row.status, userSummary.userNickname, userSummary.userId],
        keyword
      )
    )
    .slice(0, limit)
    .map(({ row, userSummary, updatedAtTs }) => ({
      orderNo: normalizeText(row.orderNo),
      serviceSlug: normalizeText(row.serviceSlug),
      serviceName: normalizeText(row.serviceName),
      travelDateStart: normalizeText(row.travelDateStart),
      status: normalizeText(row.status),
      versionName: normalizeText(row.versionName),
      userId: userSummary.userId,
      userNickname: userSummary.userNickname,
      peopleCount: normalizeNumber(row.peopleCountInt),
      updatedAtTs
    }));
}

async function getOrderDetail(payload) {
  const orderNo = normalizeText(payload && payload.orderNo);
  assertCondition(orderNo, "缺少订单号");

  const rows = await queryRows(
    "SELECT * FROM `TravelOrder` WHERE `orderNo` = {{orderNo}} LIMIT 1",
    { orderNo }
  );
  const row = rows[0];
  assertCondition(row, "未找到对应订单");
  const [users, orderEventDocs] = await Promise.all([
    listCollection(COLLECTIONS.users),
    listOptionalCollection(ORDER_EVENTS_COLLECTION)
  ]);
  const userSummary = resolveOrderUserSummary(buildOrderUserMap(users), row.userOpenid);
  const statusLogs = buildOrderStatusLogs(
    row,
    normalizeArray(orderEventDocs).filter((doc) => normalizeText(doc && doc.orderNo) === orderNo)
  );
  const travelers = normalizeArray(parseJsonText(row.travelersJson, [])).map(normalizeTravelerSnapshot);
  const serviceSnapshot = parseJsonText(row.serviceSnapshotJson, {}) || {};
  const normalizedServiceSnapshot = {
    ...serviceSnapshot,
    contact:
      serviceSnapshot && typeof serviceSnapshot.contact === "object" && serviceSnapshot.contact !== null
        ? {
            name: normalizeText(serviceSnapshot.contact.name || row.travelerName),
            phone: normalizeText(serviceSnapshot.contact.phone || row.travelerPhone)
          }
        : {
            name: normalizeText(row.travelerName),
            phone: normalizeText(row.travelerPhone)
          },
    travelers:
      Array.isArray(serviceSnapshot.travelers) && serviceSnapshot.travelers.length
        ? serviceSnapshot.travelers.map(normalizeTravelerSnapshot)
        : travelers
  };

  return {
    orderNo: normalizeText(row.orderNo),
    shortId: normalizeText(row.shortId),
    userOpenid: normalizeText(row.userOpenid),
    userId: userSummary.userId,
    userNickname: userSummary.userNickname,
    clientRequestId: normalizeText(row.clientRequestId),
    serviceSlug: normalizeText(row.serviceSlug),
    serviceName: normalizeText(row.serviceName),
    serviceType: normalizeText(row.serviceType),
    serviceCover: normalizeText(row.serviceCover),
    servicePeriodCode: normalizeText(row.servicePeriodCode),
    versionName: normalizeText(row.versionName),
    travelDate: normalizeText(row.travelDate),
    travelDateStart: normalizeText(row.travelDateStart),
    travelDateEnd: normalizeText(row.travelDateEnd),
    peopleCount: normalizeNumber(row.peopleCountInt || row.peopleCount),
    amount: normalizeNumber(row.amountDec || row.amount),
    discount: normalizeNumber(row.discountDec || row.discount),
    payable: normalizeNumber(row.payableDec || row.payable),
    travelerName: normalizeText(row.travelerName),
    travelerPhone: normalizeText(row.travelerPhone),
    travelers,
    serviceSnapshot: normalizedServiceSnapshot,
    creatorSnapshot: parseJsonText(row.creatorSnapshotJson, {}) || {},
    status: normalizeText(row.status),
    createdAtText: normalizeText(row.createdAtText),
    createdAtTs: normalizeNumber(row.createdAtTs),
    updatedAtTs: resolveLastOrderUpdateTs(row, statusLogs),
    statusLogs
  };
}

async function listUsers(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const limit = clampLimit(payload && payload.limit);
  const users = await listCollection(COLLECTIONS.users);

  return users
    .filter((user) =>
      matchesKeyword([user.nickname, user.memberLabel, user.openid, user.role], keyword)
    )
    .slice(0, limit)
    .map((user) => ({
      id: normalizeText(user._id),
      nickname: normalizeText(user.nickname) || "旅人",
      role: normalizeText(user.role) || "user",
      memberLabel: normalizeText(user.memberLabel) || "野哉会员",
      profileConfigured: Boolean(user.profileConfigured),
      createdAt: normalizeNumber(user.createdAt),
      updatedAt: normalizeNumber(user.updatedAt)
    }));
}

function shouldRestoreSeatsForDeletedOrder(status) {
  return ["pending", "paid", "traveling"].includes(normalizeText(status));
}

function resolvePeriodStatusByRemainingSeats(record, remainingSeats) {
  const normalizedRemainingSeats = Math.max(0, normalizeNumber(remainingSeats, 0));
  return resolveDisplayServicePeriodStatus(Object.assign({}, record, {
    remainingSeats: normalizedRemainingSeats
  }), Math.max(0, resolvePeriodTotalSeats(record) - normalizedRemainingSeats));
}

async function restoreDeletedOrderSeatsIfNeeded(orderRecord) {
  if (!orderRecord || !shouldRestoreSeatsForDeletedOrder(orderRecord.status)) {
    return;
  }

  const periodCode = normalizeText(orderRecord.servicePeriodCode);
  if (!periodCode) {
    return;
  }

  const peopleCount = Math.max(0, normalizePositiveInteger(orderRecord.peopleCountInt || orderRecord.peopleCount, 0));
  if (peopleCount <= 0) {
    return;
  }

  const periodRecord = await findServicePeriodByCode(periodCode);
  if (!periodRecord) {
    return;
  }

  const currentRemainingSeats = normalizeNumber(periodRecord.remainingSeats, 0);
  const nextRemainingSeats = currentRemainingSeats + peopleCount;
  const nextStatus = resolvePeriodStatusByRemainingSeats(periodRecord, nextRemainingSeats);
  const { error } = await rdb
    .from("ServicePeriod")
    .update({
      remainingSeats: nextRemainingSeats,
      remainingSeatsInt: nextRemainingSeats,
      status: nextStatus,
      updatedAt: Date.now()
    })
    .eq("periodCode", periodCode);

  if (error) {
    throw new Error(error.message || "回补团期库存失败");
  }
}

async function deleteOrder(payload) {
  const orderNo = normalizeText(payload && payload.orderNo);
  assertCondition(orderNo, "缺少订单号");

  const rows = await queryRows(
    "SELECT `orderNo`, `status`, `servicePeriodCode`, `peopleCountInt`, `peopleCount` FROM `TravelOrder` WHERE `orderNo` = {{orderNo}} LIMIT 1",
    { orderNo }
  );
  const existing = rows[0];
  assertCondition(existing, "未找到对应订单");

  await restoreDeletedOrderSeatsIfNeeded(existing);

  const { error } = await rdb.from("TravelOrder").delete().eq("orderNo", orderNo);
  if (error) {
    throw new Error(error.message || "删除订单失败");
  }

  return {
    orderNo,
    removed: true
  };
}

function resolveUserOrderOpenids(userDoc) {
  return uniqueIdentifiers([
    userDoc && userDoc.openid,
    userDoc && userDoc._openid
  ]);
}

async function countUserOrders(userDoc) {
  const openids = resolveUserOrderOpenids(userDoc);
  let total = 0;

  for (const openid of openids) {
    total += await queryCount(
      "SELECT COUNT(*) AS `total` FROM `TravelOrder` WHERE `userOpenid` = {{openid}}",
      { openid }
    );
  }

  return total;
}

async function deleteUser(payload) {
  const userId = normalizeText(payload && payload._id);
  assertCondition(userId, "缺少用户记录 ID");

  let existing = null;
  try {
    const result = await db.collection(COLLECTIONS.users).doc(userId).get();
    existing = result && result.data ? result.data : null;
  } catch (error) {
    existing = null;
  }
  assertCondition(existing, "未找到对应用户");

  const orderCount = await countUserOrders(existing);
  assertCondition(orderCount === 0, "该用户仍有关联订单，不能直接删除");

  await db.collection(COLLECTIONS.users).doc(userId).remove();
  return {
    _id: userId,
    removed: true
  };
}

const handlers = {
  getSession: async () => {
    const user = await requireAdmin();
    return {
      user,
      permissions: normalizeArray(user.permissions)
    };
  },
  getDashboardSummary: async () => {
    await requireAdmin();
    return getDashboardSummary();
  },
  listServices: async (payload) => {
    await requireAdmin();
    return listServices(payload);
  },
  getServiceDetail: async (payload) => {
    await requireAdmin();
    return getServiceDetail(payload);
  },
  saveService: async (payload) => {
    const adminUser = await requireAdmin();
    return saveService(payload, adminUser);
  },
  deleteService: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteService(payload, adminUser);
  },
  listServicePeriods: async (payload) => {
    await requireAdmin();
    return listServicePeriods(payload);
  },
  getServicePeriodDetail: async (payload) => {
    await requireAdmin();
    return getServicePeriodDetail(payload);
  },
  saveServicePeriod: async (payload) => {
    const adminUser = await requireAdmin();
    return saveServicePeriod(payload, adminUser);
  },
  deleteServicePeriod: async (payload) => {
    await requireAdmin();
    return deleteServicePeriod(payload);
  },
  listCreators: async (payload) => {
    await requireAdmin();
    return listCreators(payload);
  },
  getCreatorDetail: async (payload) => {
    await requireAdmin();
    return getCreatorDetail(payload);
  },
  saveCreator: async (payload) => {
    const adminUser = await requireAdmin();
    return saveCreator(payload, adminUser);
  },
  deleteCreator: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteCreator(payload, adminUser);
  },
  listDestinations: async (payload) => {
    await requireAdmin();
    return listDestinations(payload);
  },
  getDestinationDetail: async (payload) => {
    await requireAdmin();
    return getDestinationDetail(payload);
  },
  saveDestination: async (payload) => {
    const adminUser = await requireAdmin();
    return saveDestination(payload, adminUser);
  },
  deleteDestination: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteDestination(payload, adminUser);
  },
  listIdeas: async (payload) => {
    await requireAdmin();
    return listIdeas(payload);
  },
  getIdeaDetail: async (payload) => {
    await requireAdmin();
    return getIdeaDetail(payload);
  },
  saveIdea: async (payload) => {
    const adminUser = await requireAdmin();
    return saveIdea(payload, adminUser);
  },
  deleteIdea: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteIdea(payload, adminUser);
  },
  getConfigOverview: async () => {
    await requireAdmin();
    return getConfigOverview();
  },
  getConfigDetail: async (payload) => {
    await requireAdmin();
    return getConfigDetail(payload);
  },
  saveConfigDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return saveConfigDetail(payload, adminUser);
  },
  listAdminAccounts: async () => {
    await requireAdmin();
    return listAdminAccounts();
  },
  saveAdminAccount: async (payload) => {
    const adminUser = await requireAdmin();
    return saveAdminAccount(payload, adminUser);
  },
  deactivateAdminAccount: async (payload) => {
    const adminUser = await requireAdmin();
    return deactivateAdminAccount(payload, adminUser);
  },
  deleteAdminAccount: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteAdminAccount(payload, adminUser);
  },
  listOrders: async (payload) => {
    await requireAdmin();
    return listOrders(payload);
  },
  getOrderDetail: async (payload) => {
    await requireAdmin();
    return getOrderDetail(payload);
  },
  deleteOrder: async (payload) => {
    await requireAdmin();
    return deleteOrder(payload);
  },
  listUsers: async (payload) => {
    await requireAdmin();
    return listUsers(payload);
  },
  deleteUser: async (payload) => {
    await requireAdmin();
    return deleteUser(payload);
  },
  uploadImageFromUrl: async (payload) => {
    await requireAdmin();
    return uploadImageFromUrl(payload);
  },
  uploadImageFile: async (payload) => {
    await requireAdmin();
    return uploadImageFile(payload);
  }
};

exports.__test__ = {
  buildCreatorSlugBase,
  buildDestinationSlugBase,
  buildIdeaSlugBase,
  buildServiceSlugBase,
  buildServicePeriodCreateRecord,
  buildSyntheticOrderStatusLogs,
  countUserOrders,
  createSqlRecordId,
  deleteUser,
  generateCreatorSlug,
  generateDestinationSlug,
  generateIdeaSlug,
  generateServicePeriodCode,
  generateServiceSlug,
  getNextSlugSequence,
  listOrders,
  resolvePeriodStatusByRemainingSeats,
  resolveServicePeriodStatus,
  resolveUserOrderOpenids,
  saveIdea
};

exports.main = async (event) => {
  const action = event && event.action ? event.action : "";
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action}`
    };
  }

  try {
    const data = await handler(payload);
    if (CACHE_INVALIDATE_ACTIONS.has(action)) {
      await invalidateContentGatewayCache(action);
    }
    return {
      ok: true,
      data
    };
  } catch (error) {
    console.error("Admin gateway error", { action, error });
    return {
      ok: false,
      error: error && error.message ? error.message : "Admin gateway error"
    };
  }
};
