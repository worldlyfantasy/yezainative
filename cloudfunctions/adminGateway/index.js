const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const { sign } = require("@cloudbase/signature-nodejs");
const http = require("http");
const https = require("https");
const nodemailer = require("nodemailer");
const { pinyin } = require("pinyin-pro");
const { URL } = require("url");
const {
  buildApprovalAccessOutcome,
  buildCreatorActivationEmailPayload,
  buildCreatorPortalEmailPayload,
  buildCreatorRejectionEmailPayload,
  createActivationToken,
  hashActivationToken,
  ACTIVATION_EXPIRATION_MS
} = require("./creator-registration-access");
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

const ORDER_PAYMENT_EXPIRE_MS = 30 * 60 * 1000;

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
const SQL_RESUME_RETRY_MAX_ATTEMPTS = 3;
const SQL_QUERY_RETRY_MAX_ATTEMPTS = 3;
const SQL_RESUME_RETRY_BASE_DELAY_MS = 800;
const TRAVELER_RELATION_ORDER_LIMIT = 5000;
const DEFAULT_SERVICE_CREATOR_MESSAGE = "这段路线想带你用更贴近在地的方式慢慢走进去。";
const CONFIG_COLLECTION = "app_configs";
const ADMIN_COLLECTION = "admin_accounts";
const ORDER_EVENTS_COLLECTION = "order_events";
const ORDER_DEBUG_RECORDS_COLLECTION = "order_debug_records";
const COLLECTIONS = {
  services: "services",
  serviceDrafts: "service_drafts",
  serviceDraftVersions: "service_draft_versions",
  creators: "creators",
  creatorRegistrations: "creator_registrations",
  destinations: "destinations",
  ideas: "ideas",
  users: "users",
  userTravelers: "user_travelers",
  userCouponAssets: "user_coupon_assets",
  referralRelations: "referral_relations",
  referralRewardLedgers: "cash_reward_ledgers",
  payoutAccounts: "payout_accounts",
  orderDebugRecords: ORDER_DEBUG_RECORDS_COLLECTION
};
const EFFECTIVE_ORDER_STATUSES = new Set(["pending", "paid", "traveling", "completed"]);
const SOLD_ORDER_STATUS_SQL = "COALESCE(`status`, '') IN ('paid', 'traveling', 'completed')";
const CONTENT_GATEWAY_FUNCTION_NAME = normalizeText(process.env.CONTENT_GATEWAY_FUNCTION) || "contentGateway";
const ADMIN_GATEWAY_MAINTENANCE_TOKEN_ENV_KEY = "ADMIN_GATEWAY_MAINTENANCE_TOKEN";
const SERVICE_CREATOR_MESSAGE_BACKFILL_UPDATED_BY = "maintenance:backfill-service-creator-message";
const SERVICE_RESTORE_UPDATED_BY = "maintenance:restore-service-document";
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
const CONTENT_GATEWAY_REFRESH_ACTIONS_BY_ADMIN_ACTION = {
  saveService: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"],
  deleteService: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"],
  saveServicePeriod: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"],
  deleteServicePeriod: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"],
  saveCreator: ["refreshHomePageSnapshot", "refreshCreatorsPageSnapshot"],
  deleteCreator: ["refreshHomePageSnapshot", "refreshCreatorsPageSnapshot"],
  saveDestination: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"],
  deleteDestination: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"],
  saveIdea: ["refreshHomePageSnapshot"],
  deleteIdea: ["refreshHomePageSnapshot"],
  saveConfigDetail: ["refreshHomePageSnapshot", "refreshJourneyPageSnapshot", "refreshCreatorsPageSnapshot"]
};
const SERVICE_TYPE_OPTIONS = ["在地体验", "短途旅行", "长途旅行", "国际旅行"];
const LEGACY_SERVICE_TYPE_OPTIONS = ["带团旅行", "定制规划", "路线设计"];
const DEFAULT_SERVICE_TYPE = "短途旅行";
const SERVICE_GROUP_TYPES = ["regular", "custom"];
const DEFAULT_SERVICE_GROUP_TYPE = "regular";
const SERVICE_DRAFT_STATUSES = ["active", "deleted", "published"];
const SERVICE_DRAFT_VERSION_KEEP_COUNT = 10;
const SERVICE_DRAFT_MANUAL_VERSION_KEEP_COUNT = 5;
const SERVICE_DRAFT_AUTOSAVE_VERSION_KEEP_COUNT = 3;
const SERVICE_DRAFT_CRITICAL_VERSION_KEEP_COUNT = 5;
const SERVICE_DRAFT_AUTOSAVE_SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;
const SERVICE_DRAFT_SNAPSHOT_REASONS = new Set(["restore-version"]);
const SERVICE_DRAFT_MANUAL_VERSION_REASONS = new Set(["restore-point", "manual-save"]);
const SERVICE_DRAFT_CRITICAL_VERSION_REASONS = new Set(["before-delete", "before-publish", "restore-version"]);
const ADMIN_ROLE_NAMES = ["admin", "super_admin", "yezai_admin", "ops_admin"];
const ADMIN_ACCOUNT_TYPES = ["admin", "creator_portal"];
const ADMIN_ACCOUNT_LEVELS = ["owner", "admin"];
const ADMIN_ACCOUNT_STATUSES = ["active", "inactive"];
const ORDER_DEBUG_TOOL_ENABLED_ENV_KEYS = ["ENABLE_ORDER_DEBUG_TOOL", "ORDER_DEBUG_TOOL_ENABLED"];
const ORDER_DEBUG_TOOL_ADMIN_ALLOWLIST_ENV_KEYS = ["ORDER_DEBUG_ADMIN_UIDS", "ORDER_DEBUG_ADMIN_USER_IDS", "ORDER_DEBUG_ADMIN_EMAILS", "ORDER_DEBUG_ADMIN_USERNAMES"];
const ORDER_DEBUG_MUTATION_ACTIONS = new Set([
  "markTestOrder",
  "unmarkTestOrder",
  "confirmOrder",
  "setOrderEndDatePast",
  "runAutoComplete",
  "settleReward",
  "mockPayout"
]);
const ORDER_DEBUG_PAYOUT_STATUSES = new Set(["paid", "failed"]);
const DEFAULT_SHARE_REFERRAL_CONFIG = {
  campaignKey: "yezai_share_referral",
  campaignName: "野哉分享家",
  cashRewardAmount: 100,
  monthlySettlementDay: 20
};
const ADMIN_ACCOUNT_IDENTIFIER_FIELDS = ["uid", "customUserId", "username", "email", "phone"];
const ADMIN_HOME_PATH = "/admin/dashboard";
const CREATOR_PORTAL_HOME_PATH = "/admin/services";
const SERVICE_STATUSES = ["active", "inactive"];
const SERVICE_PERIOD_STATUSES = ["available", "confirmed", "soldout", "closed", "inactive"];
const CREATOR_REGISTRATION_ACTIVE_STATUSES = new Set(["draft", "submitted", "under_review", "rejected"]);
const CREATOR_REGISTRATION_REVIEWABLE_STATUSES = new Set(["submitted", "under_review"]);
const APPROVAL_EMAIL_STATUSES = new Set(["pending", "sent", "failed"]);
const CREATOR_REGISTRATION_ACCESS_PROVISION_STATUSES = new Set(["pending", "provisioned", "activation_pending", "conflict", "failed"]);
const CREATOR_REGISTRATION_ACTIVATION_EMAIL_STATUSES = new Set(["pending", "sent", "failed"]);
const ROUTE_TAG_OPTIONS = [
  "山野",
  "城市",
  "乡土",
  "户外",
  "研学",
  "文化",
  "内在成长",
  "家庭",
  "特殊节庆"
];
const LEGACY_ROUTE_TAG_ALIASES = {
  "城市漫游": "城市",
  "慢旅行": "文化",
  "徒步与自然": "户外",
  "徒步自然": "户外",
  "度假放松": "山野",
  "亲子&逆向亲子": "家庭",
  "人宠": "家庭",
  "摄影创作": "研学",
  "瑜伽疗愈": "内在成长",
  "特殊节庆": "特殊节庆"
};
const IDEA_THEME_OPTIONS = [
  { key: "xiaoye-travel-notes", label: "小野旅记" },
  { key: "yezai-traveler-voice", label: "野哉旅人说" },
  { key: "xiaoye-reflections", label: "小野行思" },
  { key: "yezai-field-notes", label: "野哉采风" }
];
const IDEA_SOURCE_TYPES = ["mini", "wechat", "hybrid"];
const DEFAULT_IDEA_SOURCE_TYPE = "mini";
const DEFAULT_IDEA_READ_MORE_TEXT = "阅读全文";
const DEFAULT_IDEA_THEME_KEY = "yezai-field-notes";
const IDEA_THEME_LABEL_MAP = IDEA_THEME_OPTIONS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});
const LEGACY_IDEA_THEME_KEY_ALIASES = {
  "hiking-nature": "xiaoye-travel-notes",
  "city-walk": "xiaoye-travel-notes",
  "local-life": "xiaoye-travel-notes",
  "craft-labor": "yezai-field-notes",
  "reset-recovery": "yezai-field-notes",
  "sensory-notes": "yezai-field-notes",
  "inner-growth": "xiaoye-reflections",
  "custom": ""
};
const LEGACY_IDEA_THEME_LABEL_ALIASES = {
  "徒步自然": "xiaoye-travel-notes",
  "城市漫游": "xiaoye-travel-notes",
  "在地生活": "xiaoye-travel-notes",
  "劳动手艺": "yezai-field-notes",
  "疲惫重置": "yezai-field-notes",
  "感官采集": "yezai-field-notes",
  "内在成长": "xiaoye-reflections"
};
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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function getCurrentEnvId() {
  return normalizeText(process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV);
}

function getTencentCloudContext() {
  try {
    return typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {};
  } catch (error) {
    return {};
  }
}

function getTencentCloudCredentials() {
  const context = getTencentCloudContext();
  const config = app && app.config ? app.config : {};
  const secretId =
    normalizeText(config.secretId)
    || normalizeText(context.TENCENTCLOUD_SECRETID)
    || normalizeText(process.env.TENCENTCLOUD_SECRETID);
  const secretKey =
    normalizeText(config.secretKey)
    || normalizeText(context.TENCENTCLOUD_SECRETKEY)
    || normalizeText(process.env.TENCENTCLOUD_SECRETKEY);
  const sessionToken =
    normalizeText(config.sessionToken)
    || normalizeText(context.TENCENTCLOUD_SESSIONTOKEN)
    || normalizeText(process.env.TENCENTCLOUD_SESSIONTOKEN);

  assertCondition(secretId && secretKey, "缺少云端账号同步凭证，请检查云函数运行权限");

  return { secretId, secretKey, sessionToken };
}

async function callTencentCloudTcbApi(action, payload) {
  assertCondition(typeof cloudbase.request === "function", "当前运行环境不支持云端账号同步请求");

  const credentials = getTencentCloudCredentials();
  const region =
    normalizeText(process.env.TENCENTCLOUD_REGION)
    || normalizeText(app && app.config && app.config.region)
    || "ap-shanghai";
  const url = "https://tcb.tencentcloudapi.com";
  const method = "POST";
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    "Content-Type": "application/json",
    Host: "tcb.tencentcloudapi.com",
    "X-TC-Action": action,
    "X-TC-Version": "2018-06-08",
    "X-TC-Timestamp": String(timestamp)
  };

  if (region) {
    headers["X-TC-Region"] = region;
  }

  if (credentials.sessionToken) {
    headers["X-TC-Token"] = credentials.sessionToken;
  }

  const signature = sign({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service: "tcb",
    method,
    url,
    headers,
    params: payload || {},
    timestamp,
    isCloudApi: true
  });

  headers.Authorization = signature.authorization;

  const response = await cloudbase.request(
    {
      url,
      method,
      headers,
      body: payload || {},
      json: true,
      timeout: 15000
    },
    {
      op: `tcb:${action}`,
      seqId: "",
      timingsMeasurerOptions: {}
    }
  );
  const body = response && response.body ? response.body : response;
  const result = body && body.Response ? body.Response : body;

  if (result && result.Error) {
    const error = new Error(result.Error.Message || `${action} 调用失败`);
    error.code = result.Error.Code;
    error.requestId = result.RequestId;
    throw error;
  }

  return result || {};
}

function extractCloudAuthUid(userInfo) {
  return (
    normalizeText(userInfo && userInfo.uid)
    || normalizeText(userInfo && userInfo.id)
    || normalizeText(userInfo && userInfo.Uid)
    || normalizeText(userInfo && userInfo.UUId)
  );
}

function isCloudAuthUserNotFoundError(error) {
  const code = normalizeText(error && error.code);
  const message = normalizeText(error && error.message);
  return /ResourceNotFound\.UserNotExists?|UserNotExist|用户不存在/i.test(`${code} ${message}`);
}

async function resolveAdminAccountCloudAuthUid(account) {
  const directUid = normalizeText(account && account.uid);
  if (directUid) {
    return directUid;
  }

  const email =
    normalizeEmail(account && account.email)
    || normalizeEmail(account && account.username);
  if (!email || typeof auth.queryUserInfo !== "function") {
    return "";
  }

  try {
    const result = await auth.queryUserInfo({
      platform: "EMAIL",
      platformId: email
    });
    return extractCloudAuthUid(result && result.userInfo);
  } catch (error) {
    if (isCloudAuthUserNotFoundError(error)) {
      return "";
    }
    throw error;
  }
}

async function syncAdminAccountCloudAuthStatus(account, status) {
  const uid = await resolveAdminAccountCloudAuthUid(account);
  assertCondition(uid, "缺少云端用户 UID，无法同步账号状态");

  await callTencentCloudTcbApi("ModifyUser", {
    EnvId: getCurrentEnvId(),
    Uid: uid,
    UserStatus: status === "inactive" ? "BLOCKED" : "ACTIVE"
  });
}

async function deleteAdminAccountCloudAuthUser(account) {
  const uid = await resolveAdminAccountCloudAuthUid(account);
  if (!uid) {
    return { skipped: true };
  }

  try {
    await callTencentCloudTcbApi("DeleteUsers", {
      EnvId: getCurrentEnvId(),
      Uids: [uid]
    });
  } catch (error) {
    if (!isCloudAuthUserNotFoundError(error)) {
      throw error;
    }
  }

  return { skipped: false };
}

function isCanonicalCloudbaseEnvId(envId) {
  const normalized = normalizeText(envId);

  if (!normalized) {
    return false;
  }

  const parts = normalized.split("-").filter(Boolean);
  const suffix = parts[parts.length - 1] || "";
  return parts.length >= 3 && /^[0-9a-z]+$/i.test(suffix) && suffix.length >= 8;
}

function buildEnvWarning(envId) {
  if (isCanonicalCloudbaseEnvId(envId)) {
    return "";
  }

  return "当前函数运行在非完整环境 ID 上，请改用完整 CloudBase 环境 ID 部署和查询，避免误连到旧环境或空环境。";
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

const MAX_IDENTITY_DOCUMENT_COUNT = 3;

function normalizeIdentityDocuments(value, fallbackDocument) {
  const documents = normalizeArray(value)
    .map((item) => ({
      documentType: normalizeText(item && (item.documentType || item.t)),
      documentNumber: normalizeText(item && (item.documentNumber || item.idCard || item.idNo || item.i))
    }))
    .filter((item) => item.documentType || item.documentNumber);

  if (documents.length) {
    return documents;
  }

  if (fallbackDocument && (fallbackDocument.documentType || fallbackDocument.documentNumber)) {
    return [
      {
        documentType: normalizeText(fallbackDocument.documentType),
        documentNumber: normalizeText(fallbackDocument.documentNumber)
      }
    ];
  }

  return [];
}

function assertIdentityDocumentsAllowed(documents) {
  const normalizedDocuments = normalizeArray(documents)
    .filter((item) => item && (item.documentType || item.documentNumber));
  assertCondition(
    normalizedDocuments.length <= MAX_IDENTITY_DOCUMENT_COUNT,
    "证件最多只能添加三条，且每种类型只能添加一条"
  );

  const documentTypes = new Set();
  normalizedDocuments.forEach((document) => {
    const documentType = normalizeText(document && document.documentType);
    if (!documentType) {
      return;
    }

    assertCondition(!documentTypes.has(documentType), "每种证件类型只能添加一条记录");
    documentTypes.add(documentType);
  });
}

function normalizeTravelerSnapshot(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const documentNumber = normalizeText(source.documentNumber || source.idCard || source.idNo || source.i);
  const documentType = normalizeText(source.documentType || source.t);
  const profileId = normalizeText(
    source.profileId || source.pid || source.matchedProfileId || source.travelerId
  );
  const travelerRecordId = normalizeText(
    source.travelerRecordId
      || source.recordId
      || source.rid
      || source.matchedTravelerRecordId
      || source._id
      || source.id
  );
  const sourceType = normalizeText(source.source || source.src)
    || (profileId || travelerRecordId ? "traveler_profile" : "manual");
  let documents = [];
  if (Array.isArray(source.documents) && source.documents.length) {
    documents = source.documents.map((item) => ({
      documentType: normalizeText(item && (item.documentType || item.t)),
      documentNumber: normalizeText(item && (item.documentNumber || item.idCard || item.i)),
      idCard: normalizeText(item && (item.documentNumber || item.idCard || item.i))
    }));
  } else if (Array.isArray(source.ds) && source.ds.length) {
    documents = source.ds.map((item) => ({
      documentType: normalizeText(item && item.t),
      documentNumber: normalizeText(item && item.i),
      idCard: normalizeText(item && item.i)
    }));
  } else if (documentNumber || documentType) {
    documents = [
      {
        documentType,
        documentNumber,
        idCard: documentNumber
      }
    ];
  }
  return {
    profileId,
    travelerRecordId,
    source: sourceType,
    matchedTravelerRecordId: travelerRecordId,
    matchedProfileId: profileId,
    isLinkedToTravelerProfile: Boolean(profileId || travelerRecordId),
    name: normalizeText(source.name || source.n),
    phone: normalizeText(source.phone || source.p),
    documentType,
    documentNumber,
    idCard: documentNumber,
    documents,
    gender: normalizeText(source.gender || source.g),
    birthday: normalizeText(source.birthday || source.b),
    wechat: normalizeText(source.wechat || source.w),
    email: normalizeText(source.email || source.e),
    note: normalizeText(source.note || source.o)
  };
}

function maskPhone(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (normalized.length < 7) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function maskIdNumber(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (normalized.length <= 6) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  const normalized = normalizeText(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
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

function buildUserIdSummaryMap(users) {
  return normalizeArray(users).reduce((map, user) => {
    const userId = normalizeText(user && (user._id || user.id));
    if (!userId) {
      return map;
    }

    map[userId] = {
      userId,
      userNickname: normalizeText(user && user.nickname) || "旅人"
    };
    return map;
  }, {});
}

function resolveUserSummaryByUserId(userMap, userId) {
  const normalizedUserId = normalizeText(userId);
  const matched = normalizedUserId ? userMap[normalizedUserId] : null;

  return {
    userId: normalizeText(matched && matched.userId) || normalizedUserId || "--",
    userNickname: normalizeText(matched && matched.userNickname) || "旅人"
  };
}

function maskName(value) {
  const source = normalizeText(value);
  if (!source) {
    return "";
  }
  if (source.length <= 1) {
    return `${source}*`;
  }
  return `${source.slice(0, 1)}${"*".repeat(Math.max(1, source.length - 1))}`;
}

function maskPhone(value) {
  const source = normalizeText(value).replace(/\s+/g, "");
  if (!source) {
    return "";
  }
  if (/^1\d{10}$/.test(source)) {
    return `${source.slice(0, 3)}****${source.slice(-4)}`;
  }
  if (source.length <= 4) {
    return `${source.slice(0, 1)}***`;
  }
  return `${source.slice(0, 2)}****${source.slice(-2)}`;
}

function maskBankAccount(value) {
  const source = normalizeText(value).replace(/\s+/g, "");
  if (!source) {
    return "";
  }
  return `${"*".repeat(Math.max(0, source.length - 4))}${source.slice(-4)}`;
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

async function appendOrderStatusEvent(event) {
  const orderNo = normalizeText(event && event.orderNo);
  const status = normalizeText(event && event.status);
  if (!orderNo || !status) {
    return;
  }

  const occurredAtTs = normalizeNumber(event && event.occurredAtTs, Date.now());
  const data = {
    orderNo,
    userOpenid: normalizeText(event && event.userOpenid),
    status,
    fromStatus: normalizeText(event && event.fromStatus),
    source: normalizeText(event && event.source) || "system",
    note: normalizeText(event && event.note),
    operatorId: normalizeText(event && event.operatorId),
    occurredAtTs,
    occurredAtText: formatDateTime(occurredAtTs),
    createdAt: occurredAtTs,
    updatedAt: occurredAtTs
  };

  try {
    await db.collection(ORDER_EVENTS_COLLECTION).add({ data });
  } catch (error) {
    console.error("Failed to append order status event", {
      orderNo,
      status,
      error
    });
  }
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

function normalizePageNumber(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeSortDirection(value, fallback = "desc") {
  return normalizeText(value).toLowerCase() === "asc"
    ? "asc"
    : (fallback === "asc" ? "asc" : "desc");
}

function compareSortValues(left, right) {
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left == null ? "" : left).localeCompare(
    String(right == null ? "" : right),
    "zh-Hans-CN",
    {
      numeric: true,
      sensitivity: "base"
    }
  );
}

function sortListItems(items, sortBy, sortDirection, getSortValue, getItemKey) {
  if (!sortBy || typeof getSortValue !== "function") {
    return items.slice();
  }

  return items.slice().sort((left, right) => {
    const result = compareSortValues(
      getSortValue(left, sortBy),
      getSortValue(right, sortBy)
    );

    if (result !== 0) {
      return sortDirection === "asc" ? result : -result;
    }

    if (typeof getItemKey !== "function") {
      return 0;
    }

    return compareSortValues(getItemKey(left), getItemKey(right));
  });
}

function shouldReturnPagedResult(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(payload, "page")
    || Object.prototype.hasOwnProperty.call(payload, "pageSize")
    || Boolean(normalizeText(payload.sortBy))
    || Boolean(normalizeText(payload.sortDirection))
  );
}

function buildPagedResult(items, payload, options = {}) {
  const page = normalizePageNumber(payload && payload.page);
  const pageSize = clampLimit(
    payload && payload.pageSize,
    Math.max(1, normalizePageNumber(options.defaultPageSize || 10))
  );
  const sortBy = normalizeText(payload && payload.sortBy) || normalizeText(options.defaultSortBy);
  const sortDirection = normalizeSortDirection(
    payload && payload.sortDirection,
    options.defaultSortDirection || "desc"
  );
  const sortedItems = sortListItems(
    items,
    sortBy,
    sortDirection,
    options.getSortValue,
    options.getItemKey
  );
  const total = sortedItems.length;
  const start = (page - 1) * pageSize;

  return {
    items: sortedItems.slice(start, start + pageSize),
    total,
    page,
    pageSize
  };
}

function parseListEnv(name) {
  return normalizeText(process.env[name])
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseBooleanEnv(name) {
  const normalized = normalizeText(process.env[name]).toLowerCase();
  if (!normalized) {
    return false;
  }

  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function isOrderDebugToolEnabled() {
  return ORDER_DEBUG_TOOL_ENABLED_ENV_KEYS.some((key) => parseBooleanEnv(key));
}

function matchesAnyOrderDebugAllowList(adminUser) {
  const uidAllowList = new Set(
    ORDER_DEBUG_TOOL_ADMIN_ALLOWLIST_ENV_KEYS
      .filter((key) => key.includes("UID") || key.includes("USER_ID"))
      .flatMap((key) => parseListEnv(key))
  );
  const emailAllowList = new Set(parseListEnv("ORDER_DEBUG_ADMIN_EMAILS"));
  const usernameAllowList = new Set(parseListEnv("ORDER_DEBUG_ADMIN_USERNAMES"));
  const uidCandidates = [
    adminUser && adminUser.uid,
    adminUser && adminUser.id,
    adminUser && adminUser.customUserId
  ].map((item) => normalizeText(item).toLowerCase()).filter(Boolean);
  const email = normalizeText(adminUser && adminUser.email).toLowerCase();
  const username = normalizeText(adminUser && adminUser.username).toLowerCase();

  return (
    uidCandidates.some((item) => uidAllowList.has(item))
    || Boolean(email && emailAllowList.has(email))
    || Boolean(username && usernameAllowList.has(username))
  );
}

function assertOrderDebugToolAccess(adminUser) {
  assertCondition(isOrderDebugToolEnabled(), "订单调试工具未启用，请仅在测试环境设置 ENABLE_ORDER_DEBUG_TOOL=true 后使用");
  assertPlatformAdmin(adminUser, "创作者账号不可使用订单调试工具");
  assertAdminPermission(adminUser, "ops:read");

  const adminLevel = normalizeText(adminUser && adminUser.adminLevel).toLowerCase();
  const isOwner = adminLevel === "owner";
  assertCondition(
    isOwner && matchesAnyOrderDebugAllowList(adminUser),
    "当前账号没有订单调试工具权限"
  );
}

function getContentGatewayRefreshActions(triggerAction) {
  return uniqueStrings(CONTENT_GATEWAY_REFRESH_ACTIONS_BY_ADMIN_ACTION[normalizeText(triggerAction)] || []);
}

async function callContentGatewayMaintenanceAction(action, triggerAction) {
  return cloud.callFunction({
    name: CONTENT_GATEWAY_FUNCTION_NAME,
    data: {
      action,
      payload: {
        source: "adminGateway",
        triggerAction: normalizeText(triggerAction)
      }
    }
  });
}

async function invalidateContentGatewayCache(triggerAction) {
  const actions = ["clearCache"].concat(getContentGatewayRefreshActions(triggerAction));

  for (const action of actions) {
    try {
      await callContentGatewayMaintenanceAction(action, triggerAction);
    } catch (error) {
      console.warn("Failed to run content gateway maintenance action", {
        action,
        triggerAction,
        functionName: CONTENT_GATEWAY_FUNCTION_NAME,
        error: error && error.message ? error.message : error
      });
    }
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
    .map((item) => LEGACY_ROUTE_TAG_ALIASES[item] || item)
    .filter((item) => ROUTE_TAG_OPTIONS.includes(item))
    .slice(0, 3);
}

function getServiceRouteTags(service) {
  return normalizeRouteTags(service && service.tags, service && service.styles);
}

function normalizeServiceGroupType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SERVICE_GROUP_TYPES.includes(normalized) ? normalized : DEFAULT_SERVICE_GROUP_TYPE;
}

function normalizeServiceRegionCodes(value) {
  return uniqueStrings(value)
    .map((item) => normalizeDestinationRegionCode(item))
    .filter(Boolean);
}

function getCreatorRouteTags(creator, services) {
  const tagSet = new Set();

  normalizeArray(services).forEach((service) => {
    if (!listCreatorRefs(creator).includes(normalizeText(service && service.creatorId))) {
      return;
    }

    getServiceRouteTags(service).forEach((tag) => tagSet.add(tag));
  });

  return ROUTE_TAG_OPTIONS.filter((tag) => tagSet.has(tag));
}

function normalizeIdeaTheme(themeKeyValue, themeLabelValue, isCustomThemeValue) {
  const rawKey = normalizeText(themeKeyValue);
  const rawLabel = normalizeText(themeLabelValue);
  const normalizedKey = rawKey && Object.prototype.hasOwnProperty.call(IDEA_THEME_LABEL_MAP, rawKey)
    ? rawKey
    : (LEGACY_IDEA_THEME_KEY_ALIASES[rawKey] || "");
  const matchedByKey = normalizedKey && IDEA_THEME_LABEL_MAP[normalizedKey]
    ? { key: normalizedKey, label: IDEA_THEME_LABEL_MAP[normalizedKey] }
    : null;
  const matchedByLabel = rawLabel
    ? IDEA_THEME_OPTIONS.find((item) => item.label === rawLabel)
      || IDEA_THEME_OPTIONS.find((item) => item.key === LEGACY_IDEA_THEME_LABEL_ALIASES[rawLabel])
      || null
    : null;

  if (!rawKey && !rawLabel) {
    return {
      themeKey: "",
      themeLabel: "",
      isCustomTheme: false
    };
  }

  if (matchedByKey) {
    return {
      themeKey: matchedByKey.key,
      themeLabel: matchedByKey.label,
      isCustomTheme: false
    };
  }

  if (matchedByLabel) {
    return {
      themeKey: matchedByLabel.key,
      themeLabel: matchedByLabel.label,
      isCustomTheme: false
    };
  }

  return {
    themeKey: DEFAULT_IDEA_THEME_KEY,
    themeLabel: IDEA_THEME_LABEL_MAP[DEFAULT_IDEA_THEME_KEY],
    isCustomTheme: false
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

function uniqueCaseSensitiveIdentifiers(values) {
  return Array.from(new Set(normalizeArray(values).map(normalizeText).filter(Boolean)));
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

function createServiceDraftId() {
  return createSqlRecordId("svc_draft");
}

function createServiceDraftVersionId() {
  return createSqlRecordId("svc_draft_ver");
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
  const documentType =
    normalizeText(userInfo && userInfo.documentType) || normalizeText(userMetadata.documentType);
  const documentNumber =
    normalizeText(userInfo && userInfo.documentNumber) || normalizeText(userMetadata.documentNumber);
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
    realName:
      normalizeText(userInfo && userInfo.realName)
      || normalizeText(userMetadata.realName)
      || normalizeText(userInfo && userInfo.name),
    gender: normalizeText(userInfo && userInfo.gender) || normalizeText(userMetadata.gender),
    birthday: normalizeText(userInfo && userInfo.birthday) || normalizeText(userMetadata.birthday),
    documentType,
    documentNumber,
    documents: normalizeIdentityDocuments(
      (userInfo && userInfo.documents) || userMetadata.documents,
      { documentType, documentNumber }
    ),
    wechat: normalizeText(userInfo && userInfo.wechat) || normalizeText(userMetadata.wechat),
    roles: collectRoles(userInfo)
  };
}

function normalizeAdminLevel(value, fallback = "admin") {
  return normalizeStatus(value, ADMIN_ACCOUNT_LEVELS, fallback);
}

function normalizeAdminAccountType(value, fallback = "admin") {
  return normalizeStatus(value, ADMIN_ACCOUNT_TYPES, fallback);
}

function normalizeAdminAccountStatus(value, fallback = "active") {
  return normalizeStatus(value, ADMIN_ACCOUNT_STATUSES, fallback);
}

function mapAdminAccountDoc(doc) {
  const accountType = normalizeAdminAccountType(doc && doc.accountType, "admin");
  const documentType = normalizeText(doc && doc.documentType);
  const documentNumber = normalizeText(doc && doc.documentNumber);
  const documents = normalizeIdentityDocuments(doc && doc.documents, { documentType, documentNumber });
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
    realName: normalizeText(doc && doc.realName),
    gender: normalizeText(doc && doc.gender),
    birthday: normalizeText(doc && doc.birthday),
    documentType,
    documentNumber,
    documents,
    wechat: normalizeText(doc && doc.wechat),
    accountType,
    boundCreatorId: accountType === "creator_portal" ? normalizeText(doc && doc.boundCreatorId) : "",
    level: accountType === "admin" ? normalizeAdminLevel(doc && doc.level, "admin") : "",
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

function getAdminStrongIdentifiers(account) {
  return uniqueIdentifiers([
    account && account.uid,
    account && account.customUserId
  ]);
}

function getAdminWeakIdentifiers(account) {
  return uniqueIdentifiers([
    account && account.username,
    account && account.email,
    account && account.phone
  ]);
}

function findAdminAccountForUser(accounts, user) {
  const normalizedAccounts = normalizeArray(accounts);
  const userStrongIdentifiers = new Set(
    uniqueIdentifiers([
      user && user.id,
      user && user.uid,
      user && user.customUserId
    ])
  );
  const userWeakIdentifiers = new Set(
    uniqueIdentifiers([
      user && user.username,
      user && user.email,
      user && user.phone
    ])
  );

  const strongMatch = normalizedAccounts.find((account) =>
    getAdminStrongIdentifiers(account).some((identifier) => userStrongIdentifiers.has(identifier))
  );

  if (strongMatch) {
    return strongMatch;
  }

  return normalizedAccounts.find((account) => {
    if (getAdminStrongIdentifiers(account).length) {
      return false;
    }

    return getAdminWeakIdentifiers(account).some((identifier) => userWeakIdentifiers.has(identifier));
  }) || null;
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
  const accountType = normalizeAdminAccountType(context && context.account && context.account.accountType, "admin");
  if (accountType === "creator_portal") {
    return [
      "dashboard:read:owned",
      "creators:read",
      "creators:write:self",
      "services:read",
      "services:write:owned",
      "periods:read",
      "periods:write:owned",
      "ideas:read",
      "orders:read:owned",
      "orders:detail:owned",
      "orders:update:owned",
      "orders:export:owned",
      "travelers:read:owned",
      "travelers:detail:owned",
      "travelers:sensitive:read:owned",
      "travelers:export:owned"
    ];
  }

  const canWriteAdmins = Boolean(
    context && (
      context.isAllowListed
      || (context.account && context.account.level === "owner")
      || (context.accountsCount === 0 && context.legacyAuthorized)
    )
  );

  const permissions = [
    "dashboard:read",
    "services:read",
    "services:write",
    "destinations:read",
    "destinations:write",
    "creators:read",
    "creators:write",
    "creator_registrations:read",
    "creator_registrations:review",
    "ideas:read",
    "ideas:write",
    "periods:read",
    "periods:write",
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
    realName: normalizeText(user && user.realName),
    gender: normalizeText(user && user.gender),
    birthday: normalizeText(user && user.birthday),
    documentType: normalizeText(user && user.documentType),
    documentNumber: normalizeText(user && user.documentNumber),
    documents: normalizeIdentityDocuments(user && user.documents, {
      documentType: normalizeText(user && user.documentType),
      documentNumber: normalizeText(user && user.documentNumber)
    }),
    wechat: normalizeText(user && user.wechat),
    level: "owner",
    status: "active",
    note: "Bootstrapped from legacy admin access",
    accountType: "admin",
    createdAt: now,
    updatedAt: now,
    createdBy: fallbackIdentifier,
    updatedBy: fallbackIdentifier,
    _openid: fallbackIdentifier
  };

  const result = await db.collection(ADMIN_COLLECTION).add({ data });
  return mapAdminAccountDoc(Object.assign({ _id: result && result._id }, data));
}

function normalizeRegistrationAccountDocuments(registration) {
  return normalizeIdentityDocuments([], {
    documentType: normalizeText(registration && registration.documentType),
    documentNumber: normalizeText(registration && registration.documentNumber)
  });
}

async function findApprovedRegistrationForCreatorPortalAccount(account) {
  const accountId = normalizeText(account && account._id);
  const uid = normalizeText(account && account.uid);
  const email = normalizeEmail(account && account.email);
  const registrations = normalizeArray(await listOptionalCollection(COLLECTIONS.creatorRegistrations))
    .map(normalizeCreatorRegistrationDoc)
    .filter((registration) => registration && registration.status === "approved");

  return registrations.find((registration) => (
    accountId && normalizeText(registration.linkedAdminAccountId) === accountId
  )) || registrations.find((registration) => (
    uid && normalizeText(registration.authUserId) === uid
  )) || registrations.find((registration) => (
    email && (
      normalizeEmail(registration.authEmail) === email
      || normalizeEmail(registration.contactEmail) === email
    )
  )) || null;
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

  const accountType = normalizeAdminAccountType(matchedAccount && matchedAccount.accountType, "admin");
  const boundCreatorId = accountType === "creator_portal"
    ? normalizeText(matchedAccount && matchedAccount.boundCreatorId)
    : "";
  if (matchedAccount && accountType === "creator_portal" && !boundCreatorId) {
    throw new Error(`creator portal binding missing: uid=${normalizeText(user.uid || user.id) || "unknown"}`);
  }

  const permissions = buildAdminPermissions({
    account: matchedAccount,
    accountsCount: accounts.length,
    legacyAuthorized,
    isAllowListed
  });
  const authSource = matchedAccount ? "directory" : isAllowListed ? "allowlist" : "role";
  const registrationProfile = matchedAccount && accountType === "creator_portal"
    ? await findApprovedRegistrationForCreatorPortalAccount(matchedAccount)
    : null;
  const registrationDocuments = normalizeRegistrationAccountDocuments(registrationProfile);
  const matchedAccountDocuments = matchedAccount
    ? normalizeIdentityDocuments(matchedAccount.documents, {
        documentType: normalizeText(matchedAccount.documentType),
        documentNumber: normalizeText(matchedAccount.documentNumber)
      })
    : [];
  const userDocuments = normalizeIdentityDocuments(user.documents, {
    documentType: normalizeText(user.documentType),
    documentNumber: normalizeText(user.documentNumber)
  });
  const resolvedProfile = matchedAccount
    ? {
        username: normalizeText(matchedAccount.username) || normalizeText(user.username),
        displayName:
          normalizeText(matchedAccount.displayName)
          || normalizeText(matchedAccount.username)
          || normalizeText(user.displayName)
          || normalizeText(user.username),
        email: normalizeText(matchedAccount.email) || normalizeText(user.email),
        phone: normalizeText(matchedAccount.phone) || normalizeText(registrationProfile && registrationProfile.phone) || normalizeText(user.phone),
        realName: normalizeText(matchedAccount.realName) || normalizeText(registrationProfile && registrationProfile.applicantName) || normalizeText(user.realName),
        gender: normalizeText(matchedAccount.gender) || normalizeText(registrationProfile && registrationProfile.gender) || normalizeText(user.gender),
        birthday: normalizeText(matchedAccount.birthday) || normalizeText(registrationProfile && registrationProfile.birthday) || normalizeText(user.birthday),
        documentType: normalizeText(matchedAccount.documentType) || normalizeText(registrationProfile && registrationProfile.documentType) || normalizeText(user.documentType),
        documentNumber: normalizeText(matchedAccount.documentNumber) || normalizeText(registrationProfile && registrationProfile.documentNumber) || normalizeText(user.documentNumber),
        documents: matchedAccountDocuments.length
          ? matchedAccountDocuments
          : (registrationDocuments.length ? registrationDocuments : userDocuments),
        wechat: normalizeText(matchedAccount.wechat) || normalizeText(registrationProfile && registrationProfile.wechat) || normalizeText(user.wechat)
      }
    : {
        username: normalizeText(user.username),
        displayName: normalizeText(user.displayName) || normalizeText(user.username),
        email: normalizeText(user.email),
        phone: normalizeText(user.phone),
        realName: normalizeText(user.realName),
        gender: normalizeText(user.gender),
        birthday: normalizeText(user.birthday),
        documentType: normalizeText(user.documentType),
        documentNumber: normalizeText(user.documentNumber),
        documents: normalizeIdentityDocuments(user.documents, {
          documentType: normalizeText(user.documentType),
          documentNumber: normalizeText(user.documentNumber)
        }),
        wechat: normalizeText(user.wechat)
      };

  return Object.assign({}, user, resolvedProfile, {
    adminAccountId: normalizeText(matchedAccount && matchedAccount._id),
    adminLevel: accountType === "admin"
      ? (normalizeText(matchedAccount && matchedAccount.level) || "owner")
      : "",
    accountType,
    boundCreatorId,
    homePath: accountType === "creator_portal" ? CREATOR_PORTAL_HOME_PATH : ADMIN_HOME_PATH,
    authSource,
    authEmail: normalizeText(user.email),
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

function isSqlResumeRetryableError(error) {
  const message = normalizeText(error && error.message).toLowerCase();
  return message.includes("error 9449") || message.includes("serverless instance is resuming");
}

function isSqlQueryRetryableError(error) {
  const message = normalizeText(error && error.message).toLowerCase();
  if (isSqlResumeRetryableError(error)) {
    return true;
  }

  return [
    "timeout",
    "timed out",
    "etimedout",
    "econnreset",
    "econnrefused",
    "socket hang up",
    "network error",
    "connection reset",
    "temporarily unavailable",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "502",
    "503",
    "504"
  ].some((keyword) => message.includes(keyword));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSQLWithRetry(sql, params, shouldRetryError, maxAttempts) {
  const normalizedParams = params || {};

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runSQL(sql, normalizedParams);
    } catch (error) {
      const canRetry = attempt < maxAttempts && shouldRetryError(error);
      if (!canRetry) {
        throw error;
      }

      const delayMs = SQL_RESUME_RETRY_BASE_DELAY_MS * attempt;
      console.warn("Admin SQL query retrying after transient failure", {
        attempt,
        delayMs,
        sql
      });
      await sleep(delayMs);
    }
  }

  throw new Error("后台 SQL 查询失败，请稍后重试");
}

async function runSQLWithResumeRetry(sql, params) {
  return runSQLWithRetry(sql, params, isSqlResumeRetryableError, SQL_RESUME_RETRY_MAX_ATTEMPTS);
}

async function runSQLWithQueryRetry(sql, params) {
  return runSQLWithRetry(sql, params, isSqlQueryRetryableError, SQL_QUERY_RETRY_MAX_ATTEMPTS);
}

async function queryRows(sql, params) {
  if (typeof runSQL !== "function") {
    throw new Error("后台 SQL 服务未就绪，请稍后重试");
  }

  try {
    return getSQLRows(await runSQLWithQueryRetry(sql, params));
  } catch (error) {
    console.error("Admin SQL query failed", { sql, params, error });
    throw new Error("后台 SQL 查询失败，请稍后重试");
  }
}

async function queryRowsBestEffort(sql, params) {
  if (typeof runSQL !== "function") {
    return [];
  }

  try {
    return getSQLRows(await runSQL(sql, params || {}));
  } catch (error) {
    console.warn("Admin SQL optional query skipped", { sql, params, error });
    return [];
  }
}

async function executeSQL(sql, params) {
  if (typeof runSQL !== "function") {
    throw new Error("后台 SQL 服务未就绪，请稍后重试");
  }

  try {
    return await runSQLWithResumeRetry(sql, params);
  } catch (error) {
    console.error("Admin SQL execute failed", { sql, params, error });
    throw new Error("后台 SQL 写入失败，请稍后重试");
  }
}

async function queryCount(sql, params) {
  const rows = await queryRows(sql, params);
  const first = rows[0] || {};
  return normalizeNumber(first.total, 0);
}

async function getSystemHealth() {
  const envId = getCurrentEnvId();
  const health = {
    envId,
    isCanonicalEnvId: isCanonicalCloudbaseEnvId(envId),
    envWarning: buildEnvWarning(envId),
    checkedAt: new Date().toISOString(),
    adminGateway: {
      name: "adminGateway",
      ok: true,
      message: "后台管理网关可用",
      error: ""
    },
    contentGateway: {
      name: CONTENT_GATEWAY_FUNCTION_NAME,
      ok: false,
      message: "",
      error: "",
      journeyCount: 0
    },
    sql: {
      ok: false,
      error: "",
      servicePeriodCount: 0,
      futurePeriodCount: 0,
      travelOrderCount: 0,
      latestOrderUpdatedAt: ""
    }
  };

  try {
    const servicePeriodRows = await queryRows(
      [
        "SELECT",
        "  COUNT(*) AS servicePeriodCount,",
        "  SUM(CASE WHEN dateStart >= CURRENT_DATE() THEN 1 ELSE 0 END) AS futurePeriodCount",
        "FROM `ServicePeriod`"
      ].join("\n")
    );
    const servicePeriodSummary = servicePeriodRows[0] || {};
    const orderRows = await queryRows(
      [
        "SELECT",
        "  COUNT(*) AS travelOrderCount,",
        "  MAX(COALESCE(updatedAt, createdAtTs)) AS latestOrderUpdatedAt",
        "FROM `TravelOrder`"
      ].join("\n")
    );
    const orderSummary = orderRows[0] || {};

    health.sql = {
      ok: true,
      error: "",
      servicePeriodCount: normalizeNumber(servicePeriodSummary.servicePeriodCount, 0),
      futurePeriodCount: normalizeNumber(servicePeriodSummary.futurePeriodCount, 0),
      travelOrderCount: normalizeNumber(orderSummary.travelOrderCount, 0),
      latestOrderUpdatedAt: normalizeText(orderSummary.latestOrderUpdatedAt)
    };
  } catch (error) {
    health.sql.error = normalizeText(error && error.message) || "后台 SQL 查询失败，请稍后重试";
  }

  try {
    if (typeof cloud.callFunction !== "function") {
      throw new Error("云函数调用能力不可用");
    }

    const response = await cloud.callFunction({
      name: CONTENT_GATEWAY_FUNCTION_NAME,
      data: {
        action: "getJourneyPageData",
        payload: {}
      }
    });
    const result = response && response.result;

    if (!result || result.ok !== true) {
      throw new Error(normalizeText(result && result.error) || "线路内容查询失败");
    }

    const journeys = normalizeArray(result.data && result.data.journeys);
    health.contentGateway = {
      name: CONTENT_GATEWAY_FUNCTION_NAME,
      ok: true,
      message: "线路聚合查询正常",
      error: "",
      journeyCount: journeys.length
    };
  } catch (error) {
    health.contentGateway.error = normalizeText(error && error.message) || "线路内容查询失败";
  }

  return health;
}

function assertAdminPermission(adminUser, permission) {
  assertCondition(
    normalizeArray(adminUser && adminUser.permissions).includes(permission),
    "当前账号没有对应操作权限"
  );
}

function assertPlatformAdmin(adminUser, message) {
  assertCondition(
    !isCreatorPortalUser(adminUser),
    message || "当前账号没有对应操作权限"
  );
}

function assertAnyAdminPermission(adminUser, permissions, message) {
  assertCondition(
    normalizeArray(permissions).some((permission) => hasAdminPermission(adminUser, permission)),
    message || "当前账号没有对应操作权限"
  );
}

function hasAdminPermission(adminUser, permission) {
  return normalizeArray(adminUser && adminUser.permissions).includes(permission);
}

function getAdminOperatorId(adminUser) {
  return normalizeText(adminUser && (adminUser.uid || adminUser.id));
}

function isCreatorPortalUser(adminUser) {
  return normalizeAdminAccountType(adminUser && adminUser.accountType, "admin") === "creator_portal";
}

function resolveRecordCreatedBy(record) {
  return normalizeText(record && record.createdBy);
}

function isOwnedContentRecord(record, adminUser) {
  const operatorId = getAdminOperatorId(adminUser);
  const createdBy = resolveRecordCreatedBy(record);
  return Boolean(operatorId && createdBy && operatorId === createdBy);
}

function canEditOwnedContent(record, adminUser, fullPermission, ownedPermission) {
  if (hasAdminPermission(adminUser, fullPermission)) {
    return true;
  }

  if (!hasAdminPermission(adminUser, ownedPermission)) {
    return false;
  }

  return isOwnedContentRecord(record, adminUser);
}

function getCreatorPortalBoundCreatorId(adminUser) {
  return isCreatorPortalUser(adminUser) ? normalizeText(adminUser && adminUser.boundCreatorId) : "";
}

function buildAdminCreatorRefSet(adminUser, creators) {
  if (!isCreatorPortalUser(adminUser)) {
    return null;
  }

  const boundCreatorId = getCreatorPortalBoundCreatorId(adminUser);
  if (!boundCreatorId) {
    return new Set();
  }

  const matchedCreator = normalizeArray(creators).find((creator) => listCreatorRefs(creator).includes(boundCreatorId)) || null;
  return new Set(uniqueStrings([boundCreatorId].concat(matchedCreator ? listCreatorRefs(matchedCreator) : [])));
}

function matchesCreatorRefSet(creatorRefSet, refs) {
  if (!(creatorRefSet instanceof Set)) {
    return true;
  }

  const normalizedRefs = uniqueStrings(normalizeArray(refs).map((item) => normalizeText(item)));
  return normalizedRefs.some((ref) => creatorRefSet.has(ref));
}

function buildServiceMap(services) {
  return normalizeArray(services).reduce((map, service) => {
    const slug = normalizeText(service && service.slug);
    if (slug) {
      map[slug] = service;
    }
    return map;
  }, {});
}

function buildOrderCreatorRefs(row, serviceMap) {
  const creatorSnapshot = parseJsonText(row && row.creatorSnapshotJson, {}) || {};
  const serviceSnapshot = parseJsonText(row && row.serviceSnapshotJson, {}) || {};
  const matchedService = serviceMap && serviceMap[normalizeText(row && row.serviceSlug)];

  return uniqueStrings([
    normalizeText(row && row.creatorId),
    normalizeText(row && row.serviceCreatorId),
    normalizeText(creatorSnapshot && creatorSnapshot.id),
    normalizeText(creatorSnapshot && creatorSnapshot.creatorId),
    normalizeText(creatorSnapshot && creatorSnapshot.slug),
    normalizeText(serviceSnapshot && serviceSnapshot.creatorId),
    normalizeText(serviceSnapshot && serviceSnapshot.creatorSlug),
    normalizeText(matchedService && matchedService.creatorId)
  ]);
}

function canAccessOrderForAdmin(row, adminUser, creatorRefSet, serviceMap) {
  if (!isCreatorPortalUser(adminUser)) {
    return true;
  }

  return matchesCreatorRefSet(creatorRefSet, buildOrderCreatorRefs(row, serviceMap));
}

function canAccessServiceForAdmin(service, adminUser, creatorRefSet) {
  if (!isCreatorPortalUser(adminUser)) {
    return true;
  }

  return matchesCreatorRefSet(creatorRefSet, [normalizeText(service && service.creatorId)]);
}

function canAccessServicePeriodForAdmin(row, adminUser, creatorRefSet, serviceMap) {
  if (!isCreatorPortalUser(adminUser)) {
    return true;
  }

  const matchedService = serviceMap && serviceMap[normalizeText(row && row.serviceSlug)];
  return matchesCreatorRefSet(creatorRefSet, [
    normalizeText(row && row.creatorId),
    normalizeText(matchedService && matchedService.creatorId)
  ]);
}

function filterOrderRowsForAdmin(rows, adminUser, creatorRefSet, serviceMap) {
  return normalizeArray(rows).filter((row) => canAccessOrderForAdmin(row, adminUser, creatorRefSet, serviceMap));
}

function buildContentAccess(canEdit, canDelete, extra) {
  return Object.assign(
    {
      canEdit: Boolean(canEdit),
      canDelete: Boolean(canDelete)
    },
    extra && typeof extra === "object" ? extra : {}
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
  const payloadAccountType = normalizeAdminAccountType(payload && payload.accountType, "admin");
  normalizeArray(accounts)
    .filter((account) => account._id !== existingId)
    .forEach((account) => {
      ADMIN_ACCOUNT_IDENTIFIER_FIELDS.forEach((field) => {
        const accountType = normalizeAdminAccountType(account && account.accountType, "admin");
        if (field === "phone" && (payloadAccountType === "creator_portal" || accountType === "creator_portal")) {
          return;
        }

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
  const payloadDocumentType = normalizeText(payload && payload.documentType);
  const payloadDocumentNumber = normalizeText(payload && payload.documentNumber);
  const existingDocumentType = normalizeText(existing && existing.documentType);
  const existingDocumentNumber = normalizeText(existing && existing.documentNumber);
  const payloadDocuments = normalizeIdentityDocuments(payload && payload.documents, {
    documentType: payloadDocumentType,
    documentNumber: payloadDocumentNumber
  });
  const existingDocuments = normalizeIdentityDocuments(existing && existing.documents, {
    documentType: existingDocumentType,
    documentNumber: existingDocumentNumber
  });
  const nextDocuments = payloadDocuments.length ? payloadDocuments : existingDocuments;
  assertIdentityDocumentsAllowed(nextDocuments);
  const primaryDocument = nextDocuments[0] || {};
  const accountType = normalizeAdminAccountType(
    payload && payload.accountType,
    normalizeText(existing && existing.accountType) || "admin"
  );
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
    realName: normalizeText(payload && payload.realName) || normalizeText(existing && existing.realName),
    gender: normalizeText(payload && payload.gender) || normalizeText(existing && existing.gender),
    birthday: normalizeText(payload && payload.birthday) || normalizeText(existing && existing.birthday),
    documentType:
      payloadDocumentType || normalizeText(primaryDocument.documentType) || existingDocumentType,
    documentNumber:
      payloadDocumentNumber || normalizeText(primaryDocument.documentNumber) || existingDocumentNumber,
    documents: nextDocuments,
    wechat: normalizeText(payload && payload.wechat) || normalizeText(existing && existing.wechat),
    accountType,
    boundCreatorId: accountType === "creator_portal"
      ? (normalizeText(payload && payload.boundCreatorId) || normalizeText(existing && existing.boundCreatorId))
      : "",
    level: accountType === "admin"
      ? normalizeAdminLevel(payload && payload.level, normalizeText(existing && existing.level) || "admin")
      : "",
    status: normalizeAdminAccountStatus(payload && payload.status, normalizeText(existing && existing.status) || "active"),
    note: normalizeText(payload && payload.note) || normalizeText(existing && existing.note),
    updatedAt: now,
    updatedBy: operatorId
  };

  assertAdminAccountHasIdentifier(nextDoc);
  if (accountType === "creator_portal") {
    assertCondition(nextDoc.boundCreatorId, "创作者后台账号必须绑定一个创作者");
  }

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

async function saveAdminAccount(payload, adminUser, options = {}) {
  const accounts = await listAdminAccountsData();
  const accountId = normalizeText(payload && payload._id);
  const existing = accounts.find((account) => account._id === accountId) || null;
  const nextDoc = buildAdminAccountData(payload, existing, adminUser);
  const isCreatorRegistrationProvision = Boolean(options && options.creatorRegistrationProvision)
    && normalizeAdminAccountType(nextDoc.accountType, "admin") === "creator_portal";

  if (isCreatorRegistrationProvision) {
    assertAdminPermission(adminUser, "creator_registrations:review");
    assertCondition(
      !existing || normalizeAdminAccountType(existing.accountType, "admin") === "creator_portal",
      "创作者申请自动开通不能改写普通管理员账号"
    );
  } else {
    assertAdminPermission(adminUser, "admins:write");
  }

  if (normalizeAdminAccountType(nextDoc.accountType, "admin") === "creator_portal") {
    const trustedBoundCreator = options && options.trustedBoundCreator;
    const boundCreator = await findCreatorByReference(
      nextDoc.boundCreatorId,
      trustedBoundCreator ? [trustedBoundCreator] : undefined
    );
    assertCondition(boundCreator, "绑定的创作者不存在，请先在创作者页面创建资料");
    nextDoc.boundCreatorId = normalizeText(boundCreator && boundCreator.id) || normalizeText(boundCreator && boundCreator.slug);
  }

  assertAdminAccountUnique(accounts, nextDoc, normalizeText(existing && existing._id));
  assertAdminOwnerRetention(accounts, existing, nextDoc);

  if (!existing) {
    if (nextDoc.status === "inactive") {
      await syncAdminAccountCloudAuthStatus(nextDoc, nextDoc.status);
    }
    const result = await db.collection(ADMIN_COLLECTION).add({ data: nextDoc });
    return mapAdminAccountDoc(Object.assign({ _id: result && result._id }, nextDoc));
  }

  if (existing.status !== nextDoc.status) {
    await syncAdminAccountCloudAuthStatus(Object.assign({}, existing, nextDoc), nextDoc.status);
  }

  await db.collection(ADMIN_COLLECTION).doc(existing._id).update({ data: nextDoc });
  return mapAdminAccountDoc(Object.assign({}, existing, nextDoc));
}

async function saveCurrentAdminAccountProfile(payload, adminUser) {
  const accounts = await listAdminAccountsData();
  const currentAccount = findAdminAccountForUser(
    accounts.filter((account) => account.status === "active"),
    adminUser
  );
  assertCondition(currentAccount, "未找到当前账号档案，请联系管理员处理");

  const requestedEmail = normalizeIdentifier(payload && payload.email);
  if (requestedEmail && requestedEmail !== normalizeIdentifier(currentAccount.email)) {
    let latestAuthEmail = normalizeIdentifier(adminUser && (adminUser.authEmail || adminUser.email));

    if (currentAccount.uid && typeof auth.getEndUserInfo === "function") {
      try {
        const latestAuthInfo = await auth.getEndUserInfo(currentAccount.uid);
        latestAuthEmail = normalizeIdentifier(
          latestAuthInfo
          && latestAuthInfo.userInfo
          && (latestAuthInfo.userInfo.email || latestAuthInfo.userInfo.mail)
        ) || latestAuthEmail;
      } catch (error) {
        console.error("Failed to refresh auth email for current admin account", {
          uid: currentAccount.uid,
          error
        });
      }
    }

    assertCondition(
      requestedEmail === latestAuthEmail,
      "请先完成邮箱二次验证"
    );
  }

  const nextDoc = buildAdminAccountData(
    {
      _id: currentAccount._id,
      uid: currentAccount.uid,
      customUserId: currentAccount.customUserId,
      username: normalizeText(payload && payload.username) || currentAccount.username,
      displayName: currentAccount.displayName,
      email: normalizeText(payload && payload.email) || currentAccount.email,
      phone: normalizeText(payload && payload.phone) || currentAccount.phone,
      realName: normalizeText(payload && payload.realName) || currentAccount.realName,
      gender: normalizeText(payload && payload.gender) || currentAccount.gender,
      birthday: normalizeText(payload && payload.birthday) || currentAccount.birthday,
      documentType: normalizeText(payload && payload.documentType) || currentAccount.documentType,
      documentNumber: normalizeText(payload && payload.documentNumber) || currentAccount.documentNumber,
      documents: Array.isArray(payload && payload.documents)
        ? normalizeIdentityDocuments(payload && payload.documents, {
            documentType: normalizeText(payload && payload.documentType) || currentAccount.documentType,
            documentNumber: normalizeText(payload && payload.documentNumber) || currentAccount.documentNumber
          })
        : currentAccount.documents,
      wechat: normalizeText(payload && payload.wechat) || currentAccount.wechat,
      accountType: currentAccount.accountType,
      boundCreatorId: currentAccount.boundCreatorId,
      level: currentAccount.level,
      status: currentAccount.status,
      note: currentAccount.note
    },
    currentAccount,
    adminUser
  );

  assertAdminAccountUnique(accounts, nextDoc, normalizeText(currentAccount && currentAccount._id));
  assertAdminOwnerRetention(accounts, currentAccount, nextDoc);

  await db.collection(ADMIN_COLLECTION).doc(currentAccount._id).update({ data: nextDoc });
  return mapAdminAccountDoc(Object.assign({}, currentAccount, nextDoc));
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

  await deleteAdminAccountCloudAuthUser(existing);
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

function extractMissingColumnFromMutationError(error) {
  const message = normalizeText((error && error.message) || (error && error.errMsg) || "");
  const match = message.match(/column\s+([`"'A-Za-z0-9_]+)\s+not\s+found/i);
  if (!match || !match[1]) {
    return "";
  }

  return String(match[1]).replace(/[`'"]/g, "").trim();
}

async function insertServicePeriodRecordWithCompatibility(record) {
  const nextRecord = Object.assign({}, record);
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await rdb.from("ServicePeriod").insert(nextRecord);
    if (!error) {
      return nextRecord;
    }

    lastError = error;
    const missingColumn = extractMissingColumnFromMutationError(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(nextRecord, missingColumn)) {
      throw error;
    }
    delete nextRecord[missingColumn];
  }

  throw lastError || new Error("创建团期失败");
}

async function updateServicePeriodRecordWithCompatibility(record, periodCode) {
  const nextRecord = Object.assign({}, record);
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await rdb
      .from("ServicePeriod")
      .update(nextRecord)
      .eq("periodCode", periodCode);
    if (!error) {
      return nextRecord;
    }

    lastError = error;
    const missingColumn = extractMissingColumnFromMutationError(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(nextRecord, missingColumn)) {
      throw error;
    }
    delete nextRecord[missingColumn];
  }

  throw lastError || new Error("更新团期失败");
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

      const label = index === 0
        ? "封面"
        : (normalizeText(item.label) || `图集 ${index}`);
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

  const images = dedupeImageValues(fallbackGallery || []).map(normalizeImageAssetValue).filter(Boolean);
  return images.length
    ? [
        {
          label: "封面",
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
  const itineraryImages = normalizeArray(detail.itinerary && detail.itinerary.days).flatMap((item) => {
    return isPlainObject(item)
      ? normalizeArray(item.images).flatMap((image) => listImageAssetRefs(image))
      : [];
  });
  const versionItineraryImages = normalizeArray(detail.itineraryVersions).flatMap((version) => {
    if (!isPlainObject(version)) {
      return [];
    }

    const days = normalizeArray(version.days).length
      ? version.days
      : version.itinerary && version.itinerary.days;
    return normalizeArray(days).flatMap((item) => {
      return isPlainObject(item)
        ? normalizeArray(item.images).flatMap((image) => listImageAssetRefs(image))
        : [];
    });
  });

  return uniqueStrings([
    ...listImageAssetRefs(source.cover),
    ...flattenServiceGalleryGroups(source.galleryGroups, source.gallery).flatMap((image) => listImageAssetRefs(image)),
    ...listImageAssetRefs(detail.consultWeChatQr),
    ...listImageAssetRefs(overview.coverImage),
    ...highlightImages,
    ...itineraryImages,
    ...versionItineraryImages
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

  const mapItineraryDays = (days) => {
    return normalizeArray(days).map((item) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return Object.assign({}, item, {
        images: dedupeImageValues(item.images).map(mapRef).filter(Boolean)
      });
    });
  };

  const itinerary = isPlainObject(detail.itinerary) ? detail.itinerary : {};
  detail.itinerary = Object.assign({}, itinerary, {
    days: mapItineraryDays(itinerary.days)
  });

  if (Array.isArray(detail.itineraryVersions)) {
    detail.itineraryVersions = detail.itineraryVersions.map((version) => {
      if (!isPlainObject(version)) {
        return version;
      }

      const versionItinerary = isPlainObject(version.itinerary) ? version.itinerary : null;
      return Object.assign({}, version, {
        days: mapItineraryDays(version.days),
        itinerary: versionItinerary
          ? Object.assign({}, versionItinerary, { days: mapItineraryDays(versionItinerary.days) })
          : version.itinerary
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
  const items = dedupeImageValues(values || []);
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
        images: await ensureImageAssetList(
          item.images,
          index === 0 ? `${assetRoot}/gallery/cover` : `${assetRoot}/gallery/group-${index}`
        )
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

  const normalizeItineraryDayImages = async (days, folderPrefix) => {
    const dayItems = normalizeArray(days);
    const normalizedDays = [];

    for (let index = 0; index < dayItems.length; index += 1) {
      const item = dayItems[index];
      if (!isPlainObject(item)) {
        normalizedDays.push(item);
        continue;
      }

      normalizedDays.push(Object.assign({}, item, {
        images: await ensureImageAssetList(item.images, `${folderPrefix}/day-${index + 1}`)
      }));
    }

    return normalizedDays;
  };

  const itinerary = isPlainObject(detail.itinerary) ? detail.itinerary : {};
  detail.itinerary = Object.assign({}, itinerary, {
    days: await normalizeItineraryDayImages(itinerary.days, `${assetRoot}/itinerary`)
  });

  detail.itineraryVersions = await Promise.all(
    normalizeArray(detail.itineraryVersions).map(async (version, versionIndex) => {
      if (!isPlainObject(version)) {
        return version;
      }

      const versionFolder = `${assetRoot}/itinerary/version-${versionIndex + 1}`;
      const versionItinerary = isPlainObject(version.itinerary) ? version.itinerary : null;
      return Object.assign({}, version, {
        days: await normalizeItineraryDayImages(version.days, versionFolder),
        itinerary: versionItinerary
          ? Object.assign({}, versionItinerary, {
              days: await normalizeItineraryDayImages(versionItinerary.days, versionFolder)
            })
          : version.itinerary
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

  if (key === "journeyPage") {
    const nextValue = cloneJson(value, {});
    nextValue.regionCards = await Promise.all(
      normalizeArray(nextValue.regionCards).map(async (item, index) => {
        if (!isPlainObject(item)) {
          return item;
        }

        const regionCode = normalizeText(item.regionCode || item.value || `region-${index + 1}`);
        return Object.assign({}, item, {
          regionCode,
          image: await ensureImageAssetField(
            item.image || item.cover || item.cloudFileID,
            `config/journeyPage/${regionCode || `region-${index + 1}`}`
          ),
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
        images: dedupeImageValues(item.images).map(normalizeImageAssetValue).filter(Boolean),
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

function resolveServiceCreatorMessage(service, fallbackTravelDetail) {
  const explicitMessage = normalizeText(service && service.creatorMessage);
  if (explicitMessage) {
    return explicitMessage;
  }

  const detail = isPlainObject(service && service.travelDetail)
    ? service.travelDetail
    : (isPlainObject(fallbackTravelDetail) ? fallbackTravelDetail : {});
  const overview = isPlainObject(detail.overview) ? detail.overview : {};
  const whyJoinText = normalizeText(overview.whyJoinText);
  const firstParagraph = whyJoinText ? whyJoinText.split(/\n\s*\n/)[0].trim() : "";

  return firstParagraph || normalizeText(service && service.summary);
}

function deriveServiceCreatorMessageForBackfill(service) {
  return resolveServiceCreatorMessage(service) || DEFAULT_SERVICE_CREATOR_MESSAGE;
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

function sanitizeServiceChannelsVideo(value, fallback) {
  const hasSource = isPlainObject(value);
  const source = hasSource ? value : {};
  const fallbackSource = isPlainObject(fallback) ? fallback : {};

  return {
    feedId: hasSource ? normalizeText(source.feedId) : normalizeText(fallbackSource.feedId),
    feedToken: hasSource ? normalizeText(source.feedToken) : normalizeText(fallbackSource.feedToken),
    finderUserName: hasSource ? normalizeText(source.finderUserName) : normalizeText(fallbackSource.finderUserName)
  };
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
    consultWeChatQr: "",
    meetingPoint:
      normalizeText(input.meetingPoint)
      || normalizeText(existingDetail && existingDetail.meetingPoint),
    dismissalPoint:
      normalizeText(input.dismissalPoint)
      || normalizeText(existingDetail && existingDetail.dismissalPoint),
    sections: sanitizeServiceSectionList(input.sections),
    overview: {
      coverImage:
        normalizeImageAssetValue(input.overview && input.overview.coverImage)
        || normalizeImageAssetValue(existingOverview.coverImage)
        || normalizeImageAssetValue(serviceMeta.cover),
      channelsVideo: sanitizeServiceChannelsVideo(
        input.overview && input.overview.channelsVideo,
        existingOverview.channelsVideo
      ),
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

function buildServiceSummary(service, creatorNameMap, periodStatsMap, orderStatsMap, adminUser) {
  const serviceSlug = normalizeText(service.slug);
  const periodStats = periodStatsMap[serviceSlug] || {};
  const orderStats = orderStatsMap[serviceSlug] || {};
  const tags = getServiceRouteTags(service);
  const pendingSummary = summarizeServicePendingSections(service);

  return {
    id: normalizeText(service.id) || serviceSlug,
    slug: serviceSlug,
    name: normalizeText(service.name),
    groupType: normalizeServiceGroupType(service && service.groupType),
    type: normalizeServiceType(service && service.type, service),
    status: buildStatusTag(service),
    creatorId: normalizeText(service.creatorId),
    creatorName: creatorNameMap[normalizeText(service.creatorId)] || "",
    regionCodes: normalizeServiceRegionCodes(service && service.regionCodes),
    destinationSlugs: uniqueStrings(service.destinationSlugs),
    destinationCount: normalizeArray(service.destinationSlugs).length,
    tags,
    summary: normalizeText(service.summary),
    periodCount: normalizeNumber(periodStats.periodCount),
    soldSeats: normalizeNumber(orderStats.soldSeats),
    nextDepartureDate: normalizeText(periodStats.nextDate),
    remainingSeats: normalizeNumber(periodStats.remainingSeats),
    pendingSectionCount: pendingSummary.pendingSectionCount,
    access: getServiceAccess(service, adminUser),
    createdAt: normalizeNumber(service && service.createdAt),
    updatedAt: normalizeNumber(service && service.updatedAt)
  };
}

function mapServiceDetailRecord(service, creatorNameMap, adminUser) {
  const detail = isPlainObject(service && service.travelDetail) ? service.travelDetail : {};
  const tags = getServiceRouteTags(service);

  return {
    _id: normalizeText(service && service._id),
    id: normalizeText(service && service.id),
    slug: normalizeText(service && service.slug),
    name: normalizeText(service && service.name),
    fullGroupSize: normalizePositiveInteger(service && service.fullGroupSize, 0),
    groupType: normalizeServiceGroupType(service && service.groupType),
    type: normalizeServiceType(service && service.type, service),
    status: buildStatusTag(service),
    creatorId: normalizeText(service && service.creatorId),
    creatorName: creatorNameMap[normalizeText(service && service.creatorId)] || "",
    creatorRoles: uniqueStrings(service && service.creatorRoles),
    creatorMessage: resolveServiceCreatorMessage(service, detail),
    regionCodes: normalizeServiceRegionCodes(service && service.regionCodes),
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
      const mapItineraryDayImages = (days) => normalizeArray(days).map((item) => {
        if (!isPlainObject(item)) {
          return item;
        }

        return Object.assign({}, item, {
          images: normalizeArray(item.images).map((image) => getImageAssetOriginal(image)).filter(Boolean)
        });
      });
      const itinerary = isPlainObject(travelDetail.itinerary) ? travelDetail.itinerary : {};
      travelDetail.itinerary = Object.assign({}, itinerary, {
        days: mapItineraryDayImages(itinerary.days)
      });
      travelDetail.itineraryVersions = normalizeArray(travelDetail.itineraryVersions).map((version) => {
        if (!isPlainObject(version)) {
          return version;
        }

        return Object.assign({}, version, {
          days: mapItineraryDayImages(version.days)
        });
      });
      return travelDetail;
    })(),
    access: getServiceAccess(service, adminUser),
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

function mapCreatorDetailRecord(creator, services, adminUser) {
  return {
    _id: normalizeText(creator && creator._id),
    id: normalizeText(creator && creator.id),
    slug: normalizeText(creator && creator.slug),
    name: normalizeText(creator && creator.name),
    status: buildStatusTag(creator),
    avatar: getImageAssetOriginal(creator && creator.avatar),
    stance: normalizeText(creator && creator.stance),
    tags: getCreatorRouteTags(creator, services),
    regionCodes: collectRegionCodesFromServicesForCreator(creator, services),
    destinationSlugs: collectDestinationSlugsFromServicesForCreator(creator, services),
    about: normalizeArray(creator && creator.about).map((item) => normalizeText(item)).filter(Boolean),
    reviews: sanitizeReviewList(creator && creator.reviews),
    access: getCreatorAccess(creator, adminUser),
    createdAt: normalizeNumber(creator && creator.createdAt),
    updatedAt: normalizeNumber(creator && creator.updatedAt)
  };
}

function mapDestinationDetailRecord(destination, adminUser) {
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
    access: getDestinationAccess(destination, adminUser),
    createdAt: normalizeNumber(destination && destination.createdAt),
    updatedAt: normalizeNumber(destination && destination.updatedAt)
  };
}

function mapIdeaDetailRecord(idea, authorNameMap, adminUser) {
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
    regionCodes: normalizeServiceRegionCodes(idea && idea.regionCodes),
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
    access: getIdeaAccess(idea, adminUser),
    createdAt: normalizeNumber(idea && idea.createdAt),
    updatedAt: normalizeNumber(idea && idea.updatedAt)
  };
}

function mapServicePeriodRecord(record, soldCount = resolvePeriodSoldCount(record), service, adminUser) {
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
    singleRoomEnabled: normalizeBoolean(record && record.singleRoomEnabled),
    singleRoomPrice: Math.max(0, normalizeNumber(record && (record.singleRoomPriceDec || record.singleRoomPrice), 0)),
    singleRoomNotice: normalizeText(record && record.singleRoomNotice),
    soldCount: normalizedSoldCount,
    remainingSeats,
    status,
    access: getServicePeriodAccess(service, adminUser),
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
    `SELECT SUM(COALESCE(\`peopleCountInt\`, \`peopleCount\`, 0)) AS \`soldCount\` FROM \`TravelOrder\` WHERE \`servicePeriodCode\` = {{periodCode}} AND ${SOLD_ORDER_STATUS_SQL}`,
    { periodCode: normalizedPeriodCode }
  );

  return resolvePeriodSoldCount(rows[0], 0);
}

async function getSoldCountByPeriodCodeMap(options = {}) {
  const queryFn = options.bestEffort ? queryRowsBestEffort : queryRows;
  const rows = await queryFn(
    `SELECT \`servicePeriodCode\`, SUM(COALESCE(\`peopleCountInt\`, \`peopleCount\`, 0)) AS \`soldCount\` FROM \`TravelOrder\` WHERE ${SOLD_ORDER_STATUS_SQL} GROUP BY \`servicePeriodCode\``
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

async function getPeriodStatsMap(options = {}) {
  const queryFn = options.bestEffort ? queryRowsBestEffort : queryRows;
  const rows = await queryFn(
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

async function getOrderStatsMap(options = {}) {
  const queryFn = options.bestEffort ? queryRowsBestEffort : queryRows;
  const rows = await queryFn(
    `SELECT \`serviceSlug\`, SUM(COALESCE(\`peopleCountInt\`, \`peopleCount\`, 0)) AS \`soldSeats\` FROM \`TravelOrder\` WHERE ${SOLD_ORDER_STATUS_SQL} GROUP BY \`serviceSlug\``
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

function buildPublicUrlFromCloudFileId(fileID) {
  const normalized = normalizeText(fileID);
  const matched = normalized.match(/^cloud:\/\/[^/]+\.([^/]+)\/(.+)$/);
  if (!matched) {
    return "";
  }

  const bucket = normalizeText(matched[1]);
  const filePath = normalizeText(matched[2]);
  if (!bucket || !filePath) {
    return "";
  }

  return `https://${bucket}.tcb.qcloud.la/${filePath}`;
}

async function resolveImagePreviewUrl(value) {
  const source = getImageAssetOriginal(value);
  if (!source) {
    return "";
  }

  if (!isImageCloudFileId(source)) {
    return source;
  }

  try {
    const result = await cloud.getTempFileURL({
      fileList: [source]
    });
    const file = normalizeArray(result && result.fileList)[0];
    return normalizeText(file && file.tempFileURL) || buildPublicUrlFromCloudFileId(source);
  } catch (error) {
    return buildPublicUrlFromCloudFileId(source);
  }
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
    case "completed":
      return "已完成";
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

function countFilledPairItems(value, leftKey, rightKey) {
  return normalizeArray(value).filter((item) => {
    if (!isPlainObject(item)) {
      return false;
    }

    return Boolean(normalizeText(item[leftKey]) || normalizeText(item[rightKey]));
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
    || normalizePositiveInteger(service && service.fullGroupSize, 0) <= 0
    || !normalizeText(service && service.creatorId)
    || !resolveServiceCreatorMessage(service, rawTravelDetail)
    || !normalizeServiceRegionCodes(service && service.regionCodes).length
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
    || !countFilledPairItems(rawCosts.refundRules, "days", "percent")
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

function resolveCreatorRefs(reference, creators) {
  const normalizedReference = normalizeText(reference);
  if (!normalizedReference) {
    return [];
  }

  const matchedCreator = normalizeArray(creators).find((creator) => listCreatorRefs(creator).includes(normalizedReference)) || null;
  return matchedCreator ? listCreatorRefs(matchedCreator) : [normalizedReference];
}

function resolveMineScopeCreatorRefs(payload, adminUser, creators) {
  if (normalizeText(payload && payload.scope) !== "mine") {
    return null;
  }

  return resolveCreatorRefs(getCreatorPortalBoundCreatorId(adminUser), creators);
}

function isBoundCreatorRecord(creator, adminUser) {
  const boundCreatorId = getCreatorPortalBoundCreatorId(adminUser);
  return Boolean(boundCreatorId && listCreatorRefs(creator).includes(boundCreatorId));
}

function getServiceAccess(service, adminUser) {
  const canEdit = canEditOwnedContent(service, adminUser, "services:write", "services:write:owned");
  return buildContentAccess(canEdit, canEdit);
}

function getCreatorAccess(creator, adminUser) {
  const canEditSelf = hasAdminPermission(adminUser, "creators:write")
    ? true
    : (hasAdminPermission(adminUser, "creators:write:self") && isBoundCreatorRecord(creator, adminUser));
  return buildContentAccess(
    canEditSelf,
    hasAdminPermission(adminUser, "creators:write"),
    { canEditSelf }
  );
}

function getDestinationAccess(destination, adminUser) {
  const canEdit = canEditOwnedContent(destination, adminUser, "destinations:write", "destinations:write:owned");
  return buildContentAccess(canEdit, canEdit);
}

function getIdeaAccess(idea, adminUser) {
  const canEdit = canEditOwnedContent(idea, adminUser, "ideas:write", "ideas:write:owned");
  return buildContentAccess(canEdit, canEdit);
}

function canManageServicePeriodsForService(service, adminUser) {
  return canEditOwnedContent(service, adminUser, "periods:write", "periods:write:owned");
}

function getServicePeriodAccess(service, adminUser) {
  const canEdit = service ? canManageServicePeriodsForService(service, adminUser) : hasAdminPermission(adminUser, "periods:write");
  return buildContentAccess(canEdit, canEdit);
}

function assertOwnedContentMutation(record, adminUser, fullPermission, ownedPermission, message) {
  assertCondition(
    canEditOwnedContent(record, adminUser, fullPermission, ownedPermission),
    message
  );
}

async function findCreatorByReference(reference, existingCreators) {
  const normalizedReference = normalizeText(reference);
  if (!normalizedReference) {
    return null;
  }

  const creators = Array.isArray(existingCreators) ? existingCreators : await listCollection(COLLECTIONS.creators);
  return normalizeArray(creators).find((creator) => listCreatorRefs(creator).includes(normalizedReference)) || null;
}

async function resolveBoundCreator(adminUser) {
  const boundCreatorId = getCreatorPortalBoundCreatorId(adminUser);
  if (!boundCreatorId) {
    return null;
  }

  return findCreatorByReference(boundCreatorId);
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

function collectRegionCodesFromServicesForCreator(creator, services) {
  const refs = listCreatorRefs(creator);
  const collected = [];

  normalizeArray(services).forEach((service) => {
    if (refs.includes(normalizeText(service.creatorId))) {
      collected.push(...normalizeServiceRegionCodes(service && service.regionCodes));
    }
  });

  return uniqueStrings(collected);
}

function collectDestinationSlugsForCreatorScope(creator, services) {
  if (!creator) {
    return [];
  }

  return uniqueStrings(
    normalizeArray(creator.destinationSlugs).concat(
      collectDestinationSlugsFromServicesForCreator(creator, services)
    )
  );
}

async function syncCreatorDestinationSlugsForServiceCreatorId(creatorIdField, adminUser) {
  const creatorId = normalizeText(creatorIdField);
  if (!creatorId) {
    return;
  }

  const [creators, services, ideas] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas)
  ]);

  const creator = creators.find((item) => listCreatorRefs(item).includes(creatorId));
  if (!creator || !creator._id) {
    return;
  }

  const destinationSlugs = collectDestinationSlugsFromServicesForCreator(creator, services);
  const regionCodes = collectRegionCodesFromServicesForCreator(creator, services);
  const now = Date.now();
  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));

  await db.collection(COLLECTIONS.creators).doc(creator._id).update({
    data: {
      regionCodes,
      destinationSlugs,
      updatedAt: now,
      ...(operatorId ? { updatedBy: operatorId } : {})
    }
  });
}

async function getDashboardSummary(adminUser) {
  const todayDateKey = getShanghaiTodayDateString();
  const upcomingDateKey = addDaysToDateString(todayDateKey, DASHBOARD_UPCOMING_DAYS - 1);
  const [services, creators, servicePeriodRows, orderRows] =
    await Promise.all([
      listCollection(COLLECTIONS.services),
      listCollection(COLLECTIONS.creators),
      queryRows(
        "SELECT `serviceSlug`, `serviceName`, `periodCode`, `versionName`, `dateStart`, `remainingSeats`, `minGroup`, `status`, `creatorId` FROM `ServicePeriod` ORDER BY `dateStart` ASC LIMIT 1000"
      ),
      queryRows(
        "SELECT `orderNo`, `serviceSlug`, `serviceName`, `travelDateStart`, `status`, `versionName`, `peopleCountInt`, `createdAtTs`, `paidAtTs`, `amount`, `amountDec`, `payable`, `payableDec`, `updatedAt`, `creatorSnapshotJson`, `serviceSnapshotJson` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT 1000"
      )
    ]);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  const visibleServices = normalizeArray(services).filter((service) => canAccessServiceForAdmin(service, adminUser, creatorRefSet));
  const visibleServicePeriods = normalizeArray(servicePeriodRows).filter((row) => canAccessServicePeriodForAdmin(row, adminUser, creatorRefSet, serviceMap));
  const visibleOrderRows = filterOrderRowsForAdmin(orderRows, adminUser, creatorRefSet, serviceMap);
  const activeServices = visibleServices.filter((item) => buildStatusTag(item) !== "inactive").length;
  const incompleteServices = visibleServices
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
  const upcomingPeriods = visibleServicePeriods
    .map((row) => ({
      key: normalizeText(row && row.periodCode),
      title: normalizeText(row && row.serviceName) || normalizeText(row && row.serviceSlug) || normalizeText(row && row.periodCode),
      description: `${normalizeText(row && row.dateStart)} · ${normalizeText(row && row.versionName) || "标准版"} · ${formatDashboardStatusLabel(row && row.status)}`,
      dateStart: normalizeText(row && row.dateStart),
      status: normalizeText(row && row.status)
    }))
    .filter((item) => item.dateStart >= todayDateKey && item.dateStart <= upcomingDateKey && isDashboardVisiblePeriodStatus(item.status))
    .sort((left, right) => left.dateStart.localeCompare(right.dateStart));
  const pendingOrders = visibleOrderRows
    .filter((row) => normalizeText(row && row.status) === "pending")
    .map((row) => ({
      key: normalizeText(row && row.orderNo),
      title: normalizeText(row && row.serviceName) || normalizeText(row && row.orderNo),
      description: `${normalizeText(row && row.travelDateStart)} · ${normalizeNumber(row && row.peopleCountInt, 0)} 人 · ${normalizeText(row && row.versionName) || "标准版"}`,
      updatedAtTs: normalizeNumber(row && row.updatedAt, normalizeNumber(row && row.createdAtTs, 0))
    }))
    .sort((left, right) => right.updatedAtTs - left.updatedAtTs);
  const inventoryAlerts = visibleServicePeriods
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
    trends: buildDashboardTrend(visibleOrderRows, todayDateKey)
  };
}

function normalizeServiceDraftStatus(value, fallback = "active") {
  const normalized = normalizeText(value).toLowerCase();
  return SERVICE_DRAFT_STATUSES.includes(normalized) ? normalized : fallback;
}

function getAdminUserRefs(adminUser) {
  return uniqueStrings([
    adminUser && adminUser.id,
    adminUser && adminUser.uid,
    adminUser && adminUser.customUserId,
    adminUser && adminUser.username,
    adminUser && adminUser.email
  ]);
}

function normalizeServiceDraftValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value));
}

function buildServiceDraftTitle(values, fallbackTitle) {
  return normalizeText(values && values.name)
    || normalizeText(fallbackTitle)
    || "未命名路线";
}

function hasText(value) {
  return Boolean(normalizeText(value));
}

function hasStringListContent(value) {
  return normalizeArray(value).some(hasText);
}

function hasServiceDraftImageContent(values) {
  return Boolean(
    hasText(values && values.cover)
    || hasText(values && values.overviewCoverImage)
    || normalizeArray(values && values.galleryGroups).some((group) => hasStringListContent(group && group.images))
    || normalizeArray(values && values.highlights).some((item) => hasStringListContent(item && item.images))
    || normalizeArray(values && values.itineraryDays).some((item) => hasStringListContent(item && item.images))
    || normalizeArray(values && values.itineraryVersions).some((version) =>
      normalizeArray(version && (version.itineraryDays || version.days)).some((item) => hasStringListContent(item && item.images))
    )
  );
}

function hasServiceDraftHighlightContent(values) {
  return normalizeArray(values && values.highlights).some((item) =>
    hasText(item && item.title)
    || hasText(item && item.description)
    || hasStringListContent(item && item.images)
  );
}

function hasServiceDraftItineraryContent(values) {
  const hasDayContent = (item) => (
    hasText(item && item.title)
    || hasStringListContent(item && item.images)
    || normalizeArray(item && item.modules).some((module) => hasText(module && module.title) || hasText(module && module.content))
  );

  return normalizeArray(values && values.itineraryDays).some(hasDayContent)
    || normalizeArray(values && values.itineraryVersions).some((version) =>
      normalizeArray(version && (version.itineraryDays || version.days)).some(hasDayContent)
    );
}

function hasSubstantialServiceDraftValues(values) {
  return Boolean(
    hasText(values && values.name)
    || hasText(values && values.summary)
    || hasText(values && values.whyJoinText)
    || hasText(values && values.suitableText)
    || hasServiceDraftImageContent(values)
    || hasServiceDraftHighlightContent(values)
    || hasServiceDraftItineraryContent(values)
  );
}

function shouldSnapshotServiceDraft(existing, reason, now) {
  if (!existing) {
    return false;
  }

  const normalizedReason = normalizeText(reason) || "autosave";
  if (SERVICE_DRAFT_SNAPSHOT_REASONS.has(normalizedReason)) {
    return true;
  }

  if (normalizedReason !== "autosave") {
    return false;
  }

  const latestSnapshotAt = normalizeNumber(existing.latestSnapshotAt, normalizeNumber(existing.createdAt, 0));
  return latestSnapshotAt > 0 && now - latestSnapshotAt >= SERVICE_DRAFT_AUTOSAVE_SNAPSHOT_INTERVAL_MS;
}

function summarizeServiceDraft(doc) {
  const values = normalizeServiceDraftValues(doc && doc.values);
  return {
    _id: normalizeText(doc && doc._id),
    draftId: normalizeText(doc && (doc.draftId || doc._id)),
    ownerUserId: normalizeText(doc && doc.ownerUserId),
    ownerCreatorId: normalizeText(doc && doc.ownerCreatorId),
    title: buildServiceDraftTitle(values, doc && doc.title),
    status: normalizeServiceDraftStatus(doc && doc.status),
    version: normalizePositiveInteger(doc && doc.version, 1),
    serviceId: normalizeText(doc && doc.serviceId),
    serviceSlug: normalizeText(doc && doc.serviceSlug),
    createdAt: normalizeNumber(doc && doc.createdAt),
    updatedAt: normalizeNumber(doc && doc.updatedAt),
    deletedAt: normalizeNumber(doc && doc.deletedAt),
    publishedAt: normalizeNumber(doc && doc.publishedAt)
  };
}

function mapServiceDraftDetail(doc) {
  return Object.assign({}, summarizeServiceDraft(doc), {
    values: normalizeServiceDraftValues(doc && doc.values)
  });
}

function mapServiceDraftVersion(doc) {
  return {
    _id: normalizeText(doc && doc._id),
    draftId: normalizeText(doc && doc.draftId),
    ownerUserId: normalizeText(doc && doc.ownerUserId),
    ownerCreatorId: normalizeText(doc && doc.ownerCreatorId),
    title: normalizeText(doc && doc.title) || "未命名路线",
    values: normalizeServiceDraftValues(doc && doc.values),
    version: normalizePositiveInteger(doc && doc.version, 1),
    reason: normalizeText(doc && doc.reason) || "autosave",
    createdAt: normalizeNumber(doc && doc.createdAt),
    createdBy: normalizeText(doc && doc.createdBy)
  };
}

function serviceDraftMatchesAdminUser(doc, adminUser, creatorRefSet) {
  if (hasAdminPermission(adminUser, "services:write") || (!isCreatorPortalUser(adminUser) && hasAdminPermission(adminUser, "services:read"))) {
    return true;
  }

  const userRefs = getAdminUserRefs(adminUser);
  const ownerRefs = uniqueStrings([
    doc && doc.ownerUserId,
    doc && doc.createdBy,
    doc && doc.updatedBy
  ]);
  if (ownerRefs.some((ref) => userRefs.includes(ref))) {
    return true;
  }

  return matchesCreatorRefSet(creatorRefSet, [doc && doc.ownerCreatorId]);
}

async function assertServiceDraftAccess(doc, adminUser, mode) {
  const permissionCandidates = mode === "read"
    ? ["services:read", "services:write", "services:write:owned"]
    : ["services:write", "services:write:owned"];
  assertAnyAdminPermission(adminUser, permissionCandidates, "当前账号没有操作路线草稿的权限");

  if (hasAdminPermission(adminUser, "services:write") || (!isCreatorPortalUser(adminUser) && mode === "read" && hasAdminPermission(adminUser, "services:read"))) {
    return;
  }

  const creators = await listCollection(COLLECTIONS.creators);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  assertCondition(
    serviceDraftMatchesAdminUser(doc, adminUser, creatorRefSet),
    "当前账号只能操作自己的路线草稿"
  );
}

async function listServiceDrafts(payload, adminUser) {
  assertAnyAdminPermission(adminUser, ["services:read", "services:write", "services:write:owned"], "当前账号没有查看路线草稿的权限");
  const status = normalizeServiceDraftStatus(payload && payload.status, "active");
  const limit = clampLimit(payload && payload.limit);
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const [drafts, creators] = await Promise.all([
    listCollection(COLLECTIONS.serviceDrafts),
    listCollection(COLLECTIONS.creators)
  ]);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);

  return drafts
    .filter((draft) => normalizeServiceDraftStatus(draft && draft.status) === status)
    .filter((draft) => serviceDraftMatchesAdminUser(draft, adminUser, creatorRefSet))
    .map(summarizeServiceDraft)
    .filter((draft) => !keyword || matchesKeyword([draft.title, draft.serviceSlug, draft.ownerCreatorId], keyword))
    .sort((left, right) => normalizeNumber(right.updatedAt) - normalizeNumber(left.updatedAt))
    .slice(0, limit);
}

async function findServiceDraftDoc(draftId) {
  const normalizedDraftId = normalizeText(draftId);
  if (!normalizedDraftId) {
    return null;
  }

  try {
    const result = await db.collection(COLLECTIONS.serviceDrafts).doc(normalizedDraftId).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    return null;
  }
}

async function addServiceDraftVersion(existing, reason, adminUser, now) {
  if (!existing || !normalizeText(existing._id)) {
    return null;
  }

  const versionDoc = {
    _id: createServiceDraftVersionId(),
    draftId: normalizeText(existing._id),
    ownerUserId: normalizeText(existing.ownerUserId),
    ownerCreatorId: normalizeText(existing.ownerCreatorId),
    title: buildServiceDraftTitle(existing.values, existing.title),
    values: normalizeServiceDraftValues(existing.values),
    version: normalizePositiveInteger(existing.version, 1),
    reason: normalizeText(reason) || "autosave",
    createdAt: now || Date.now(),
    createdBy: getAdminOperatorId(adminUser)
  };

  await db.collection(COLLECTIONS.serviceDraftVersions).add({ data: versionDoc });
  return versionDoc;
}

async function pruneServiceDraftVersions(draftId) {
  const normalizedDraftId = normalizeText(draftId);
  if (!normalizedDraftId) {
    return;
  }

  const versions = (await listCollection(COLLECTIONS.serviceDraftVersions))
    .filter((item) => normalizeText(item && item.draftId) === normalizedDraftId)
    .sort((left, right) => normalizeNumber(right.createdAt) - normalizeNumber(left.createdAt));

  const candidateIds = new Set();
  const addKeepCandidates = (predicate, limit) => {
    versions
      .filter(predicate)
      .slice(0, limit)
      .forEach((item) => {
        const versionId = normalizeText(item && item._id);
        if (versionId) {
          candidateIds.add(versionId);
        }
      });
  };

  addKeepCandidates(
    (item) => SERVICE_DRAFT_MANUAL_VERSION_REASONS.has(normalizeText(item && item.reason) || "autosave"),
    SERVICE_DRAFT_MANUAL_VERSION_KEEP_COUNT
  );
  addKeepCandidates(
    (item) => (normalizeText(item && item.reason) || "autosave") === "autosave",
    SERVICE_DRAFT_AUTOSAVE_VERSION_KEEP_COUNT
  );
  addKeepCandidates(
    (item) => {
      const reason = normalizeText(item && item.reason) || "autosave";
      return SERVICE_DRAFT_CRITICAL_VERSION_REASONS.has(reason)
        || (reason !== "autosave" && !SERVICE_DRAFT_MANUAL_VERSION_REASONS.has(reason));
    },
    SERVICE_DRAFT_CRITICAL_VERSION_KEEP_COUNT
  );

  const keepIds = new Set(
    versions
      .filter((item) => candidateIds.has(normalizeText(item && item._id)))
      .slice(0, SERVICE_DRAFT_VERSION_KEEP_COUNT)
      .map((item) => normalizeText(item && item._id))
  );
  const removableVersions = versions.filter((item) => !keepIds.has(normalizeText(item && item._id)));
  await Promise.all(removableVersions.map((item) => db.collection(COLLECTIONS.serviceDraftVersions).doc(item._id).remove()));
}

async function getServiceDraft(payload, adminUser) {
  const draft = await findServiceDraftDoc(payload && (payload.draftId || payload._id));
  assertCondition(draft, "未找到对应路线草稿");
  await assertServiceDraftAccess(draft, adminUser, "read");
  return mapServiceDraftDetail(draft);
}

async function saveServiceDraft(payload, adminUser) {
  assertAnyAdminPermission(adminUser, ["services:write", "services:write:owned"], "当前账号没有保存路线草稿的权限");
  const existing = await findServiceDraftDoc(payload && (payload.draftId || payload._id));
  if (existing) {
    await assertServiceDraftAccess(existing, adminUser, "write");
  }

  const now = Date.now();
  const incomingValues = normalizeServiceDraftValues(payload && payload.values);
  assertCondition(hasSubstantialServiceDraftValues(incomingValues), "路线草稿内容太少，暂不创建云端草稿");
  const reason = normalizeText(payload && payload.reason) || "autosave";
  const shouldCreateRestorePoint = reason === "restore-point";
  const requestedBaseVersion = normalizePositiveInteger(payload && payload.baseVersion, 0);
  if (existing && requestedBaseVersion > 0) {
    assertCondition(
      requestedBaseVersion === normalizePositiveInteger(existing.version, 1),
      "路线草稿已在其他设备更新，请先刷新草稿后再保存"
    );
  }

  const operatorId = getAdminOperatorId(adminUser);
  const ownerCreatorId = isCreatorPortalUser(adminUser)
    ? getCreatorPortalBoundCreatorId(adminUser)
    : normalizeText(payload && payload.ownerCreatorId);
  const nextDoc = {
    ownerUserId: existing ? normalizeText(existing.ownerUserId) : operatorId,
    ownerCreatorId: existing ? normalizeText(existing.ownerCreatorId) : ownerCreatorId,
    title: buildServiceDraftTitle(incomingValues, payload && payload.title),
    values: incomingValues,
    status: "active",
    version: existing ? normalizePositiveInteger(existing.version, 1) + 1 : 1,
    serviceId: normalizeText(payload && payload.serviceId) || (existing ? normalizeText(existing.serviceId) : ""),
    serviceSlug: normalizeText(payload && payload.serviceSlug) || (existing ? normalizeText(existing.serviceSlug) : ""),
    updatedAt: now,
    updatedBy: operatorId,
    deletedAt: 0,
    publishedAt: existing ? normalizeNumber(existing.publishedAt) : 0
  };

  if (existing) {
    const shouldSnapshot = shouldSnapshotServiceDraft(existing, reason, now);
    if (shouldSnapshot) {
      await addServiceDraftVersion(existing, reason, adminUser, now);
    }
    nextDoc.latestSnapshotAt = shouldSnapshot || shouldCreateRestorePoint
      ? now
      : normalizeNumber(existing.latestSnapshotAt);
    await db.collection(COLLECTIONS.serviceDrafts).doc(existing._id).update({ data: nextDoc });
    const savedDoc = Object.assign({}, existing, nextDoc);
    if (shouldCreateRestorePoint) {
      await addServiceDraftVersion(savedDoc, reason, adminUser, now);
    }
    if (shouldSnapshot || shouldCreateRestorePoint) {
      await pruneServiceDraftVersions(existing._id);
    }
    return mapServiceDraftDetail(savedDoc);
  }

  const draftId = createServiceDraftId();
  const createDoc = Object.assign(
    {
      _id: draftId,
      createdAt: now,
      createdBy: operatorId,
      latestSnapshotAt: shouldCreateRestorePoint ? now : 0
    },
    nextDoc
  );
  await db.collection(COLLECTIONS.serviceDrafts).add({ data: createDoc });
  if (shouldCreateRestorePoint) {
    await addServiceDraftVersion(createDoc, reason, adminUser, now);
  }
  return mapServiceDraftDetail(createDoc);
}

async function deleteServiceDraft(payload, adminUser) {
  const draft = await findServiceDraftDoc(payload && (payload.draftId || payload._id));
  assertCondition(draft, "未找到对应路线草稿");
  await assertServiceDraftAccess(draft, adminUser, "write");
  const now = Date.now();
  await addServiceDraftVersion(draft, "before-delete", adminUser, now);
  await db.collection(COLLECTIONS.serviceDrafts).doc(draft._id).update({
    data: {
      status: "deleted",
      deletedAt: now,
      latestSnapshotAt: now,
      updatedAt: now,
      updatedBy: getAdminOperatorId(adminUser)
    }
  });
  await pruneServiceDraftVersions(draft._id);
  return mapServiceDraftDetail(Object.assign({}, draft, {
    status: "deleted",
    deletedAt: now,
    latestSnapshotAt: now,
    updatedAt: now,
    updatedBy: getAdminOperatorId(adminUser)
  }));
}

async function restoreServiceDraft(payload, adminUser) {
  const draft = await findServiceDraftDoc(payload && (payload.draftId || payload._id));
  assertCondition(draft, "未找到对应路线草稿");
  await assertServiceDraftAccess(draft, adminUser, "write");
  const now = Date.now();
  await db.collection(COLLECTIONS.serviceDrafts).doc(draft._id).update({
    data: {
      status: "active",
      deletedAt: 0,
      updatedAt: now,
      updatedBy: getAdminOperatorId(adminUser)
    }
  });
  return mapServiceDraftDetail(Object.assign({}, draft, {
    status: "active",
    deletedAt: 0,
    updatedAt: now,
    updatedBy: getAdminOperatorId(adminUser)
  }));
}

async function listServiceDraftVersions(payload, adminUser) {
  const draft = await findServiceDraftDoc(payload && (payload.draftId || payload._id));
  assertCondition(draft, "未找到对应路线草稿");
  await assertServiceDraftAccess(draft, adminUser, "read");
  const limit = clampLimit(payload && payload.limit);
  return (await listCollection(COLLECTIONS.serviceDraftVersions))
    .filter((item) => normalizeText(item && item.draftId) === normalizeText(draft._id))
    .map(mapServiceDraftVersion)
    .sort((left, right) => normalizeNumber(right.createdAt) - normalizeNumber(left.createdAt))
    .slice(0, limit);
}

async function restoreServiceDraftVersion(payload, adminUser) {
  const draft = await findServiceDraftDoc(payload && payload.draftId);
  assertCondition(draft, "未找到对应路线草稿");
  await assertServiceDraftAccess(draft, adminUser, "write");
  const versionId = normalizeText(payload && payload.versionId);
  const version = (await listCollection(COLLECTIONS.serviceDraftVersions))
    .find((item) => normalizeText(item && item._id) === versionId && normalizeText(item && item.draftId) === normalizeText(draft._id));
  assertCondition(version, "未找到对应草稿历史版本");
  return saveServiceDraft({
    draftId: draft._id,
    values: normalizeServiceDraftValues(version.values),
    title: normalizeText(version.title),
    reason: "restore-version"
  }, adminUser);
}

async function markServiceDraftPublished(draftId, serviceDetail, adminUser) {
  const draft = await findServiceDraftDoc(draftId);
  if (!draft) {
    return;
  }

  await assertServiceDraftAccess(draft, adminUser, "write");
  const now = Date.now();
  await addServiceDraftVersion(draft, "before-publish", adminUser, now);
  await db.collection(COLLECTIONS.serviceDrafts).doc(draft._id).update({
    data: {
      status: "published",
      serviceId: normalizeText(serviceDetail && serviceDetail.id) || normalizeText(draft.serviceId),
      serviceSlug: normalizeText(serviceDetail && serviceDetail.slug) || normalizeText(draft.serviceSlug),
      latestSnapshotAt: now,
      publishedAt: now,
      updatedAt: now,
      updatedBy: getAdminOperatorId(adminUser)
    }
  });
  await pruneServiceDraftVersions(draft._id);
}

async function listServices(payload, adminUser) {
  assertAdminPermission(adminUser, "services:read");
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const tag = normalizeText(payload && payload.tag);
  const groupType = normalizeText(payload && payload.groupType);
  const serviceSlug = normalizeText(payload && payload.serviceSlug);
  const creatorSlug = normalizeText(payload && payload.creatorSlug);
  const completion = normalizeText(payload && payload.completion);
  const limit = clampLimit(payload && payload.limit);
  const shouldPage = shouldReturnPagedResult(payload);
  const [services, creators, periodStatsMap] = await Promise.all([
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators),
    shouldPage ? getPeriodStatsMap({ bestEffort: true }) : Promise.resolve({})
  ]);
  const orderStatsMap = {};
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
  const creatorRefs = resolveCreatorRefs(creatorSlug, creators);
  const mineCreatorRefs = resolveMineScopeCreatorRefs(payload, adminUser, creators);
  const activeCreatorRefs = Array.isArray(mineCreatorRefs) ? mineCreatorRefs : creatorRefs;

  const items = services
    .map((service) => buildServiceSummary(service, creatorNameMap, periodStatsMap, orderStatsMap, adminUser))
    .filter((service) => {
      const serviceStatus = normalizeText(service.status).toLowerCase();
      if (serviceSlug && normalizeText(service.slug) !== serviceSlug) {
        return false;
      }
      if (status && status !== "all" && status !== serviceStatus) {
        return false;
      }
      if (tag && !normalizeArray(service.tags).includes(tag)) {
        return false;
      }
      if (groupType && groupType !== "all" && normalizeServiceGroupType(service.groupType) !== groupType) {
        return false;
      }
      if (activeCreatorRefs.length && !activeCreatorRefs.includes(normalizeText(service.creatorId))) {
        return false;
      }
      if (Array.isArray(mineCreatorRefs) && !activeCreatorRefs.length) {
        return false;
      }
      if (completion === "incomplete" && normalizeNumber(service.pendingSectionCount) <= 0) {
        return false;
      }

      return matchesKeyword(
        [
          service.name,
          service.slug,
          service.summary,
          service.type,
          service.creatorName,
          normalizeArray(service.tags).join(" ")
        ],
        keyword
      );
    });

  if (shouldPage) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "name":
            return item.name;
          case "creatorName":
            return item.creatorName;
          case "periodCount":
            return item.periodCount;
          case "remainingSeats":
            return item.remainingSeats;
          case "updatedAt":
            return item.updatedAt;
          case "status":
            return item.status;
          case "groupType":
            return item.groupType;
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.id || item.slug
    });
  }

  return items.slice(0, limit);
}

async function getServiceDetail(payload, adminUser) {
  assertAdminPermission(adminUser, "services:read");
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

  return mapServiceDetailRecord(service, creatorNameMap, adminUser);
}

async function saveService(payload, adminUser) {
  assertCondition(
    hasAdminPermission(adminUser, "services:write") || hasAdminPermission(adminUser, "services:write:owned"),
    "当前账号没有编辑路线的权限"
  );
  const existing = payload && payload._id ? await findServiceDocById(payload._id) : null;
  if (existing) {
    assertOwnedContentMutation(
      existing,
      adminUser,
      "services:write",
      "services:write:owned",
      "当前账号只能编辑自己新建的路线"
    );
  }
  const previousCreatorId = existing ? normalizeText(existing.creatorId) : "";
  const sourceDraftId = normalizeText(payload && payload.draftId);
  const requestedStatus = normalizeStatus(
    payload && payload.status,
    SERVICE_STATUSES,
    existing ? buildStatusTag(existing) : buildStatusTag(payload)
  );
  const name = normalizeText(payload && payload.name) || (requestedStatus === "inactive" && existing ? normalizeText(existing.name) : "");
  const type = normalizeServiceType(
    normalizeText(payload && payload.type) || (requestedStatus === "inactive" && existing ? existing.type : ""),
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

  if (existing && requestedStatus === "inactive" && buildStatusTag(existing) !== "inactive") {
    await db.collection(COLLECTIONS.services).doc(existing._id).update({
      data: {
        status: "inactive",
        updatedAt: Date.now(),
        updatedBy: normalizeText(adminUser && (adminUser.uid || adminUser.id))
      }
    });
    await deactivateServicePeriodsByServiceSlug(slug);
    await syncCreatorDestinationSlugsForServiceCreatorId(previousCreatorId, adminUser);
    return getServiceDetail({ _id: existing._id }, adminUser);
  }

  const preparedSave = await copyDraftServiceAssetsForSave(payload, slug);
  const normalizedPayload = await normalizeServiceImagePayload(preparedSave.payload, slug);
  const creators = await listCollection(COLLECTIONS.creators);
  const requestedCreatorId =
    normalizeText(normalizedPayload && normalizedPayload.creatorId)
    || (requestedStatus === "inactive" && existing ? normalizeText(existing.creatorId) : "");
  const matchedCreator = isCreatorPortalUser(adminUser)
    ? await resolveBoundCreator(adminUser)
    : creators.find((creator) => listCreatorRefs(creator).includes(requestedCreatorId));
  assertCondition(matchedCreator, "请选择已存在的创作者");

  const now = Date.now();
  const logicalId = existing ? normalizeText(existing.id) : (normalizeText(normalizedPayload && normalizedPayload.id) || createServiceLogicalId(slug));
  const creatorRoles = uniqueStrings(normalizedPayload && normalizedPayload.creatorRoles);
  const creatorMessage =
    normalizeText(normalizedPayload && normalizedPayload.creatorMessage)
    || (requestedStatus === "inactive" && existing ? normalizeText(existing.creatorMessage) : "");
  const fullGroupSize = normalizePositiveInteger(
    normalizedPayload && normalizedPayload.fullGroupSize,
    existing ? normalizePositiveInteger(existing && existing.fullGroupSize, 0) : 0
  );
  const regionCodes = normalizeServiceRegionCodes(
    isPlainObject(normalizedPayload) && Object.prototype.hasOwnProperty.call(normalizedPayload, "regionCodes")
      ? normalizedPayload.regionCodes
      : (requestedStatus === "inactive" && existing ? existing.regionCodes : [])
  );
  const routeTags = normalizeRouteTags(normalizedPayload && normalizedPayload.tags, existing ? getServiceRouteTags(existing) : []);
  const groupTypeSource =
    normalizedPayload && Object.prototype.hasOwnProperty.call(normalizedPayload, "groupType")
      ? normalizedPayload.groupType
      : existing && existing.groupType;
  if (requestedStatus === "active") {
    assertCondition(regionCodes.length >= 1, "请至少选择 1 个路线区域");
    assertCondition(routeTags.length >= 1, "请至少选择 1 个路线标签");
    assertCondition(routeTags.length <= 3, "路线标签最多选择 3 个");
    assertCondition(creatorMessage, "请填写创作者的话");
  }
  const nextDoc = {
    id: logicalId,
    slug,
    cover: normalizeImageAssetValue(normalizedPayload && normalizedPayload.cover),
    gallery: flattenServiceGalleryGroups(normalizedPayload && normalizedPayload.galleryGroups, normalizedPayload && normalizedPayload.gallery),
    galleryGroups: sanitizeServiceGalleryGroups(normalizedPayload && normalizedPayload.galleryGroups, normalizedPayload && normalizedPayload.gallery),
    groupType: normalizeServiceGroupType(groupTypeSource),
    type,
    name,
    fullGroupSize,
    creatorId: normalizeText(matchedCreator && matchedCreator.id) || normalizeText(normalizedPayload && normalizedPayload.creatorId),
    creatorRoles: creatorRoles.length ? creatorRoles : getDefaultCreatorRoles(type),
    creatorMessage,
    regionCodes,
    destinationSlugs: uniqueStrings(normalizedPayload && normalizedPayload.destinationSlugs),
    summary: normalizeText(normalizedPayload && normalizedPayload.summary),
    tags: routeTags,
    styles: routeTags,
    status: requestedStatus,
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
    const detail = await getServiceDetail({ _id: createResult && createResult._id }, adminUser);
    await deleteServiceAssetFiles(preparedSave.migratedSourceRefs);
    await syncCreatorDestinationSlugsForServiceCreatorId(nextDoc.creatorId, adminUser);
    if (sourceDraftId) {
      await markServiceDraftPublished(sourceDraftId, detail, adminUser);
    }
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
  const detail = await getServiceDetail({ _id: existing._id }, adminUser);
  await deleteServiceAssetFiles(preparedSave.migratedSourceRefs.concat(getRemovedServiceAssetRefs(existing, nextDoc)));
  await syncCreatorDestinationSlugsForServiceCreatorId(nextDoc.creatorId, adminUser);
  if (previousCreatorId && previousCreatorId !== normalizeText(nextDoc.creatorId)) {
    await syncCreatorDestinationSlugsForServiceCreatorId(previousCreatorId, adminUser);
  }
  if (sourceDraftId) {
    await markServiceDraftPublished(sourceDraftId, detail, adminUser);
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
  assertCondition(
    hasAdminPermission(adminUser, "services:write") || hasAdminPermission(adminUser, "services:write:owned"),
    "当前账号没有删除路线的权限"
  );
  const existing = await findServiceDoc(payload);
  assertCondition(existing, "未找到对应路线");
  assertOwnedContentMutation(
    existing,
    adminUser,
    "services:write",
    "services:write:owned",
    "当前账号只能删除自己新建的路线"
  );

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

async function getCreatorDetail(payload, adminUser) {
  assertAdminPermission(adminUser, "creators:read");
  const creator = await findContentDoc(COLLECTIONS.creators, payload);
  assertCondition(creator, "未找到对应创作者");
  const services = await listCollection(COLLECTIONS.services);
  return mapCreatorDetailRecord(creator, services, adminUser);
}

async function saveCreator(payload, adminUser) {
  assertCondition(
    hasAdminPermission(adminUser, "creators:write") || hasAdminPermission(adminUser, "creators:write:self"),
    "当前账号没有编辑创作者的权限"
  );
  const existing = await findContentDoc(COLLECTIONS.creators, payload);
  if (isCreatorPortalUser(adminUser)) {
    assertCondition(existing, "创作者后台账号只能编辑已绑定的创作者资料");
    assertCondition(isBoundCreatorRecord(existing, adminUser), "当前账号只能编辑自己的创作者资料");
  }
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

  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();
  const normalizedPayload = await normalizeCreatorImagePayload(payload, slug);
  const services = await listCollection(COLLECTIONS.services);
  const creatorForDestinationAggregation = {
    id: existing ? normalizeText(existing.id) : (normalizeText(payload && payload.id) || createCreatorLogicalId(slug)),
    slug
  };
  const regionCodes = collectRegionCodesFromServicesForCreator(creatorForDestinationAggregation, services);
  const nextDoc = {
    id: existing ? normalizeText(existing.id) : (normalizeText(payload && payload.id) || createCreatorLogicalId(slug)),
    slug,
    name,
    avatar: getImageAssetOriginal(normalizedPayload && normalizedPayload.avatar),
    stance: normalizeText(payload && payload.stance),
    regionCodes,
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
    return getCreatorDetail({ _id: createResult && createResult._id }, adminUser);
  }

  await db.collection(COLLECTIONS.creators).doc(existing._id).update({
    data: {
      ...nextDoc,
      tags: _.remove()
    }
  });
  return getCreatorDetail({ _id: existing._id }, adminUser);
}

async function deleteCreator(payload, adminUser) {
  assertAdminPermission(adminUser, "creators:write");
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

function normalizeCreatorRegistrationAbout(value) {
  return normalizeArray(value)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeCreatorRegistrationDoc(doc) {
  if (!doc) {
    return null;
  }

  const registrationId = normalizeText(doc._id || doc.registrationId);
  return {
    _id: registrationId,
    registrationId,
    authUserId: normalizeText(doc.authUserId),
    authEmail: normalizeEmail(doc.authEmail),
    contactEmail: normalizeEmail(doc.contactEmail),
    applicantName: normalizeText(doc.applicantName),
    phone: normalizeText(doc.phone),
    gender: normalizeText(doc.gender),
    birthday: normalizeText(doc.birthday),
    documentType: normalizeText(doc.documentType),
    documentNumber: normalizeText(doc.documentNumber),
    wechat: normalizeText(doc.wechat),
    avatar: normalizeText(doc.avatar),
    stance: normalizeText(doc.stance),
    about: normalizeCreatorRegistrationAbout(doc.about),
    status: normalizeText(doc.status) || "draft",
    rejectionReason: normalizeText(doc.rejectionReason),
    linkedCreatorId: normalizeText(doc.linkedCreatorId),
    linkedCreatorSlug: normalizeText(doc.linkedCreatorSlug),
    accessProvisionStatus: CREATOR_REGISTRATION_ACCESS_PROVISION_STATUSES.has(normalizeText(doc.accessProvisionStatus))
      ? normalizeText(doc.accessProvisionStatus)
      : "pending",
    linkedAdminAccountId: normalizeText(doc.linkedAdminAccountId),
    linkedAdminUsername: normalizeText(doc.linkedAdminUsername),
    linkedAdminDisplayName: normalizeText(doc.linkedAdminDisplayName),
    activationTokenHash: normalizeText(doc.activationTokenHash),
    activationExpiresAt: normalizeNumber(doc.activationExpiresAt, 0),
    activationConsumedAt: normalizeNumber(doc.activationConsumedAt, 0),
    activationEmailStatus: CREATOR_REGISTRATION_ACTIVATION_EMAIL_STATUSES.has(normalizeText(doc.activationEmailStatus))
      ? normalizeText(doc.activationEmailStatus)
      : "pending",
    activationEmailSentAt: normalizeNumber(doc.activationEmailSentAt, 0),
    activationEmailError: normalizeText(doc.activationEmailError),
    accessProvisionError: normalizeText(doc.accessProvisionError),
    approvalEmailStatus: APPROVAL_EMAIL_STATUSES.has(normalizeText(doc.approvalEmailStatus))
      ? normalizeText(doc.approvalEmailStatus)
      : "pending",
    approvalEmailSentAt: normalizeNumber(doc.approvalEmailSentAt, 0),
    approvalEmailError: normalizeText(doc.approvalEmailError),
    submittedAt: normalizeNumber(doc.submittedAt, 0),
    reviewedAt: normalizeNumber(doc.reviewedAt, 0),
    reviewedBy: normalizeText(doc.reviewedBy),
    createdAt: normalizeNumber(doc.createdAt, 0),
    updatedAt: normalizeNumber(doc.updatedAt, 0)
  };
}

function normalizeCreatorRegistrationDetail(doc) {
  return normalizeCreatorRegistrationDoc(doc);
}

function looksLikeOpaqueIdentifier(value) {
  return /^\d{8,}$/.test(String(value || "").trim()) || /^[A-Za-z0-9_-]{24,}$/.test(String(value || "").trim());
}

function getMeaningfulAdminAccountLabel(account) {
  const candidates = [
    normalizeText(account && account.username),
    normalizeText(account && account.displayName),
    normalizeText(account && account.email),
    normalizeText(account && account.phone)
  ].filter(Boolean);

  return candidates.find((value) => !looksLikeOpaqueIdentifier(value)) || candidates[0] || "";
}

function findLinkedAdminAccountForRegistration(detail, accounts) {
  const linkedAccountId = normalizeText(detail && detail.linkedAdminAccountId);
  const authUserId = normalizeText(detail && detail.authUserId);
  const authEmail = normalizeEmail(detail && detail.authEmail);
  const explicitLinkedAccount = normalizeArray(accounts).find((account) => (
    linkedAccountId && normalizeText(account && account._id) === linkedAccountId
  )) || null;

  if (explicitLinkedAccount || normalizeText(detail && detail.accessProvisionStatus) === "conflict") {
    return explicitLinkedAccount;
  }

  return normalizeArray(accounts).find((account) => (
    (authUserId && normalizeText(account && account.uid) === authUserId)
    || (authEmail && normalizeEmail(account && account.email) === authEmail)
  )) || null;
}

function enrichCreatorRegistrationAdminAccount(detail, accounts) {
  const linkedAccount = findLinkedAdminAccountForRegistration(detail, accounts);
  if (!linkedAccount) {
    return detail;
  }

  return Object.assign({}, detail, {
    linkedAdminAccountId: normalizeText(linkedAccount._id) || detail.linkedAdminAccountId,
    linkedAdminUsername: getMeaningfulAdminAccountLabel(linkedAccount),
    linkedAdminDisplayName: normalizeText(linkedAccount.displayName)
  });
}

async function hydrateCreatorRegistrationDetail(doc) {
  const detail = normalizeCreatorRegistrationDetail(doc);
  if (!detail) {
    return detail;
  }

  const accounts = await listAdminAccountsData();
  const hydrated = enrichCreatorRegistrationAdminAccount(detail, accounts);

  return Object.assign({}, hydrated, {
    avatarPreviewUrl: await resolveImagePreviewUrl(detail.avatar)
  });
}

function buildCreatorRegistrationFailedAccessPatch(error) {
  return {
    accessProvisionStatus: "failed",
    linkedAdminAccountId: "",
    activationTokenHash: "",
    activationExpiresAt: 0,
    activationConsumedAt: 0,
    activationEmailStatus: "pending",
    activationEmailSentAt: 0,
    activationEmailError: "",
    accessProvisionError: normalizeText(error && error.message) || "创作者后台开通失败，请人工处理",
    approvalEmailStatus: "pending",
    approvalEmailSentAt: 0,
    approvalEmailError: ""
  };
}

async function getCreatorRegistrationDocById(registrationId) {
  const normalizedRegistrationId = normalizeText(registrationId);
  if (!normalizedRegistrationId) {
    return null;
  }

  const byField = await findCollectionDocByField(COLLECTIONS.creatorRegistrations, "_id", normalizedRegistrationId);
  if (byField) {
    return byField;
  }

  try {
    const result = await db.collection(COLLECTIONS.creatorRegistrations).doc(normalizedRegistrationId).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    return null;
  }
}

async function createCreatorFromRegistration(registration, adminUser) {
  const linkedCreatorReference = normalizeText(registration && (registration.linkedCreatorId || registration.linkedCreatorSlug));
  if (linkedCreatorReference) {
    const existingCreator = await findCreatorByReference(linkedCreatorReference);
    assertCondition(existingCreator, "申请已关联的创作者不存在");
    return {
      _id: normalizeText(existingCreator._id),
      id: normalizeText(existingCreator.id),
      slug: normalizeText(existingCreator.slug),
      name: normalizeText(existingCreator.name)
    };
  }

  const creatorName = normalizeText(registration && registration.applicantName);
  assertCondition(creatorName, "申请缺少创作者名称");

  const slug = await generateCreatorSlug(creatorName);
  const logicalId = createCreatorLogicalId(slug);
  const operatorId = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  const now = Date.now();
  const nextDoc = {
    id: logicalId,
    slug,
    name: creatorName,
    avatar: getImageAssetOriginal(registration && registration.avatar),
    stance: normalizeText(registration && registration.stance),
    destinationSlugs: [],
    about: normalizeCreatorRegistrationAbout(registration && registration.about),
    reviews: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
    createdBy: operatorId,
    updatedBy: operatorId
  };

  const createResult = await db.collection(COLLECTIONS.creators).add({ data: nextDoc });
  return {
    _id: normalizeText(createResult && createResult._id),
    id: logicalId,
    slug,
    name: creatorName
  };
}

async function ensureApprovedCreatorActive(linkedCreator, adminUser) {
  const creatorId = normalizeText(linkedCreator && linkedCreator._id);
  if (!creatorId) {
    return;
  }

  await db.collection(COLLECTIONS.creators).doc(creatorId).update({
    data: {
      status: "active",
      updatedAt: Date.now(),
      updatedBy: normalizeText(adminUser && (adminUser.uid || adminUser.id))
    }
  });
}

function buildCreatorRegistrationApprovalTransport() {
  const host = normalizeText(process.env.CREATOR_APPROVAL_SMTP_HOST);
  const user = normalizeText(process.env.CREATOR_APPROVAL_SMTP_USER);
  const pass = normalizeText(process.env.CREATOR_APPROVAL_SMTP_PASS);
  const sender = normalizeText(process.env.CREATOR_APPROVAL_SENDER);

  assertCondition(
    host && user && pass && sender,
    "创作者审核通知邮件未配置"
  );

  return {
    sender,
    transporter: nodemailer.createTransport({
      host,
      port: normalizeNumber(process.env.CREATOR_APPROVAL_SMTP_PORT, 465),
      secure: normalizeBoolean(process.env.CREATOR_APPROVAL_SMTP_SECURE || "true"),
      auth: {
        user,
        pass
      }
    })
  };
}

async function sendCreatorRegistrationApprovalEmail(registration) {
  const { sender, transporter } = buildCreatorRegistrationApprovalTransport();
  return transporter.sendMail(buildCreatorPortalEmailPayload({
    registration,
    linkedCreator: {
      slug: normalizeText(registration && registration.linkedCreatorSlug),
      id: normalizeText(registration && registration.linkedCreatorId),
      name: normalizeText(registration && registration.applicantName)
    },
    sender,
    creatorPortalHomeUrl: normalizeText(process.env.CREATOR_PORTAL_HOME_URL || process.env.YEZAIADMIN_LOGIN_URL),
    normalizeText,
    normalizeEmail,
    assertCondition
  }));
}

function summarizeEmailDelivery(delivery) {
  return {
    messageId: normalizeText(delivery && delivery.messageId),
    accepted: normalizeArray(delivery && delivery.accepted).map(normalizeText).filter(Boolean),
    rejected: normalizeArray(delivery && delivery.rejected).map(normalizeText).filter(Boolean),
    pending: normalizeArray(delivery && delivery.pending).map(normalizeText).filter(Boolean),
    response: normalizeText(delivery && delivery.response)
  };
}

function assertEmailDeliveryAccepted(delivery) {
  const summary = summarizeEmailDelivery(delivery);
  assertCondition(
    summary.rejected.length === 0,
    `邮件服务器拒收：${summary.rejected.join(", ")}${summary.response ? `；${summary.response}` : ""}`
  );
  return summary;
}

async function deliverCreatorRegistrationApprovalEmail(registration) {
  const sentAt = Date.now();

  try {
    const delivery = await sendCreatorRegistrationApprovalEmail(registration);
    console.info("Creator registration approval email delivery", {
      registrationId: normalizeText(registration && registration.registrationId),
      to: normalizeEmail(registration && registration.contactEmail),
      delivery: assertEmailDeliveryAccepted(delivery)
    });
    return {
      approvalEmailStatus: "sent",
      approvalEmailSentAt: sentAt,
      approvalEmailError: ""
    };
  } catch (error) {
    return {
      approvalEmailStatus: "failed",
      approvalEmailSentAt: 0,
      approvalEmailError: normalizeText(error && error.message) || "邮件发送失败"
    };
  }
}

async function sendCreatorRegistrationRejectionEmail(registration) {
  const { sender, transporter } = buildCreatorRegistrationApprovalTransport();
  return transporter.sendMail(buildCreatorRejectionEmailPayload({
    registration,
    sender,
    normalizeText,
    normalizeEmail,
    assertCondition
  }));
}

async function deliverCreatorRegistrationRejectionEmail(registration) {
  const sentAt = Date.now();

  try {
    const delivery = await sendCreatorRegistrationRejectionEmail(registration);
    console.info("Creator registration rejection email delivery", {
      registrationId: normalizeText(registration && registration.registrationId),
      to: normalizeEmail(registration && registration.contactEmail),
      delivery: assertEmailDeliveryAccepted(delivery)
    });
    return {
      approvalEmailStatus: "sent",
      approvalEmailSentAt: sentAt,
      approvalEmailError: ""
    };
  } catch (error) {
    return {
      approvalEmailStatus: "failed",
      approvalEmailSentAt: 0,
      approvalEmailError: normalizeText(error && error.message) || "邮件发送失败"
    };
  }
}

async function sendCreatorRegistrationActivationEmail(payload) {
  const { sender, transporter } = buildCreatorRegistrationApprovalTransport();

  return transporter.sendMail(buildCreatorActivationEmailPayload({
    registration: payload && payload.registration,
    linkedCreator: payload && payload.linkedCreator,
    token: normalizeText(payload && payload.token),
    sender,
    creatorPortalHomeUrl: normalizeText(process.env.CREATOR_PORTAL_HOME_URL || process.env.YEZAIADMIN_LOGIN_URL),
    creatorActivationUrl: normalizeText(process.env.CREATOR_PORTAL_ACTIVATION_URL || process.env.YEZAIADMIN_ACTIVATION_URL),
    normalizeText,
    normalizeEmail,
    assertCondition
  }));
}

async function deliverCreatorRegistrationActivationEmail(payload) {
  const sentAt = Date.now();

  try {
    const delivery = await sendCreatorRegistrationActivationEmail(payload);
    const registration = payload && payload.registration;
    console.info("Creator registration activation email delivery", {
      registrationId: normalizeText(registration && registration.registrationId),
      to: normalizeEmail(registration && registration.contactEmail),
      delivery: assertEmailDeliveryAccepted(delivery)
    });
    return {
      activationEmailStatus: "sent",
      activationEmailSentAt: sentAt,
      activationEmailError: ""
    };
  } catch (error) {
    return {
      activationEmailStatus: "failed",
      activationEmailSentAt: 0,
      activationEmailError: normalizeText(error && error.message) || "邮件发送失败"
    };
  }
}

function matchesCreatorRegistrationStatus(status, filter) {
  const normalizedFilter = normalizeText(filter).toLowerCase();
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  return normalizeText(status).toLowerCase() === normalizedFilter;
}

function matchesCreatorRegistrationKeyword(doc, keyword) {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  return matchesKeyword([
    doc && doc.registrationId,
    doc && doc.applicantName,
    doc && doc.contactEmail,
    doc && doc.authEmail,
    doc && doc.phone,
    doc && doc.stance,
    doc && doc.linkedCreatorSlug,
    doc && doc.linkedCreatorId
  ], normalizedKeyword);
}

async function listCreatorRegistrations(payload, adminUser) {
  assertAdminPermission(adminUser, "creator_registrations:read");
  const keyword = normalizeText(payload && payload.keyword);
  const status = normalizeText(payload && payload.status);
  const adminAccounts = await listAdminAccountsData();
  const registrations = normalizeArray(await listOptionalCollection(COLLECTIONS.creatorRegistrations))
    .map(normalizeCreatorRegistrationDoc)
    .map((item) => enrichCreatorRegistrationAdminAccount(item, adminAccounts))
    .filter((item) => item && matchesCreatorRegistrationStatus(item.status, status) && matchesCreatorRegistrationKeyword(item, keyword));

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(registrations, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "applicantName":
            return item.applicantName;
          case "contactEmail":
            return item.contactEmail;
          case "status":
            return item.status;
          case "submittedAt":
            return item.submittedAt;
          case "reviewedAt":
            return item.reviewedAt;
          case "updatedAt":
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.registrationId
    });
  }

  return registrations;
}

async function getCreatorRegistrationDetail(payload, adminUser) {
  assertAdminPermission(adminUser, "creator_registrations:read");
  const registrationId = normalizeText(payload && (payload.registrationId || payload._id || payload.id));
  assertCondition(registrationId, "缺少申请记录 ID");

  const existing = await getCreatorRegistrationDocById(registrationId);
  assertCondition(existing, "未找到对应申请记录");

  return hydrateCreatorRegistrationDetail(existing);
}

async function reviewCreatorRegistration(payload, adminUser) {
  assertAdminPermission(adminUser, "creator_registrations:review");
  const registrationId = normalizeText(payload && (payload.registrationId || payload._id || payload.id));
  const action = normalizeText(payload && payload.action).toLowerCase();
  const rejectionReason = normalizeText(payload && payload.rejectionReason);
  assertCondition(registrationId, "缺少申请记录 ID");
  assertCondition(["approve", "reject"].includes(action), "不支持的审核动作");

  const existing = await getCreatorRegistrationDocById(registrationId);
  assertCondition(existing, "未找到对应申请记录");

  const currentStatus = normalizeText(existing.status) || "draft";
  assertCondition(CREATOR_REGISTRATION_REVIEWABLE_STATUSES.has(currentStatus), "当前状态不可审核");
  if (action === "reject") {
    assertCondition(rejectionReason, "请填写驳回原因");
  }

  const now = Date.now();
  const nextStatus = action === "approve" ? "approved" : "rejected";
  const nextDoc = normalizeCreatorRegistrationDoc(existing);
  nextDoc.status = nextStatus;
  nextDoc.rejectionReason = action === "reject" ? rejectionReason : "";
  nextDoc.reviewedAt = now;
  nextDoc.reviewedBy = normalizeText(adminUser && (adminUser.uid || adminUser.id));
  nextDoc.updatedAt = now;
  nextDoc.accessProvisionStatus = "pending";
  nextDoc.linkedAdminAccountId = "";
  nextDoc.activationTokenHash = "";
  nextDoc.activationExpiresAt = 0;
  nextDoc.activationConsumedAt = 0;
  nextDoc.activationEmailStatus = "pending";
  nextDoc.activationEmailSentAt = 0;
  nextDoc.activationEmailError = "";
  nextDoc.accessProvisionError = "";
  nextDoc.approvalEmailStatus = "pending";
  nextDoc.approvalEmailSentAt = 0;
  nextDoc.approvalEmailError = "";

  if (action === "approve") {
    Object.assign(nextDoc, await provisionCreatorRegistrationAccess(nextDoc, adminUser, {
      now,
      registrationId
    }));
  } else {
    const emailPatch = await deliverCreatorRegistrationRejectionEmail(nextDoc);
    nextDoc.approvalEmailStatus = emailPatch.approvalEmailStatus;
    nextDoc.approvalEmailSentAt = emailPatch.approvalEmailSentAt;
    nextDoc.approvalEmailError = emailPatch.approvalEmailError;
  }

  await db.collection(COLLECTIONS.creatorRegistrations).doc(registrationId).update({
    data: {
      status: nextDoc.status,
      rejectionReason: nextDoc.rejectionReason,
      linkedCreatorId: nextDoc.linkedCreatorId,
      linkedCreatorSlug: nextDoc.linkedCreatorSlug,
      accessProvisionStatus: nextDoc.accessProvisionStatus,
      linkedAdminAccountId: nextDoc.linkedAdminAccountId,
      activationTokenHash: nextDoc.activationTokenHash,
      activationExpiresAt: nextDoc.activationExpiresAt,
      activationConsumedAt: nextDoc.activationConsumedAt,
      activationEmailStatus: nextDoc.activationEmailStatus,
      activationEmailSentAt: nextDoc.activationEmailSentAt,
      activationEmailError: nextDoc.activationEmailError,
      accessProvisionError: nextDoc.accessProvisionError,
      approvalEmailStatus: nextDoc.approvalEmailStatus,
      approvalEmailSentAt: nextDoc.approvalEmailSentAt,
      approvalEmailError: nextDoc.approvalEmailError,
      reviewedAt: nextDoc.reviewedAt,
      reviewedBy: nextDoc.reviewedBy,
      updatedAt: nextDoc.updatedAt
    }
  });

  return hydrateCreatorRegistrationDetail(nextDoc);
}

async function provisionCreatorRegistrationAccess(registration, adminUser, options = {}) {
  const nextDoc = normalizeCreatorRegistrationDoc(registration);
  const now = normalizeNumber(options.now, Date.now());
  const registrationId = normalizeText(options.registrationId || nextDoc.registrationId);
  const linkedCreator = await createCreatorFromRegistration(nextDoc, adminUser);
  await ensureApprovedCreatorActive(linkedCreator, adminUser);
  nextDoc.linkedCreatorId = normalizeText(linkedCreator && linkedCreator.id);
  nextDoc.linkedCreatorSlug = normalizeText(linkedCreator && linkedCreator.slug);

  try {
    const accessOutcome = await buildApprovalAccessOutcome({
      registration: nextDoc,
      linkedCreator,
      adminUser,
      getEndUserInfo: (uid) => auth.getEndUserInfo(uid),
      listAdminAccountsData,
      saveAdminAccount,
      deliverCreatorRegistrationApprovalEmail,
      deliverCreatorRegistrationActivationEmail,
      normalizeText,
      normalizeEmail,
      assertCondition,
      now
    });

    Object.assign(nextDoc, accessOutcome);
  } catch (error) {
    console.error("Creator registration access provisioning failed", {
      registrationId,
      linkedCreatorId: nextDoc.linkedCreatorId,
      error
    });
    Object.assign(nextDoc, buildCreatorRegistrationFailedAccessPatch(error));
  }

  return nextDoc;
}

async function resendCreatorRegistrationApprovalEmail(payload, adminUser) {
  assertAdminPermission(adminUser, "creator_registrations:review");
  const registrationId = normalizeText(payload && (payload.registrationId || payload._id || payload.id));
  assertCondition(registrationId, "缺少申请记录 ID");

  const existing = await getCreatorRegistrationDocById(registrationId);
  assertCondition(existing, "未找到对应申请记录");

  const nextDoc = normalizeCreatorRegistrationDoc(existing);
  assertCondition(["approved", "rejected"].includes(nextDoc.status), "仅已通过或已驳回申请支持重发通知邮件");
  if (nextDoc.status === "approved") {
    assertCondition(
      nextDoc.accessProvisionStatus === "provisioned",
      "仅已开通可直接登录的申请支持重发通知邮件"
    );
  }

  const emailPatch = nextDoc.status === "rejected"
    ? await deliverCreatorRegistrationRejectionEmail(nextDoc)
    : await deliverCreatorRegistrationApprovalEmail(nextDoc);
  nextDoc.approvalEmailStatus = emailPatch.approvalEmailStatus;
  nextDoc.approvalEmailSentAt = emailPatch.approvalEmailSentAt;
  nextDoc.approvalEmailError = emailPatch.approvalEmailError;
  nextDoc.updatedAt = Date.now();

  await db.collection(COLLECTIONS.creatorRegistrations).doc(registrationId).update({
    data: {
      approvalEmailStatus: nextDoc.approvalEmailStatus,
      approvalEmailSentAt: nextDoc.approvalEmailSentAt,
      approvalEmailError: nextDoc.approvalEmailError,
      updatedAt: nextDoc.updatedAt
    }
  });

  return hydrateCreatorRegistrationDetail(nextDoc);
}

async function resendCreatorRegistrationActivationEmail(payload, adminUser) {
  assertAdminPermission(adminUser, "creator_registrations:review");
  const registrationId = normalizeText(payload && (payload.registrationId || payload._id || payload.id));
  assertCondition(registrationId, "缺少申请记录 ID");

  const existing = await getCreatorRegistrationDocById(registrationId);
  assertCondition(existing, "未找到对应申请记录");

  const nextDoc = normalizeCreatorRegistrationDoc(existing);
  assertCondition(nextDoc.status === "approved", "仅已通过申请支持重发激活邮件");
  assertCondition(nextDoc.accessProvisionStatus === "activation_pending", "仅待激活申请支持重发激活邮件");

  const token = createActivationToken();
  const patch = await deliverCreatorRegistrationActivationEmail({
    registration: nextDoc,
    linkedCreator: {
      id: nextDoc.linkedCreatorId,
      slug: nextDoc.linkedCreatorSlug,
      name: nextDoc.applicantName
    },
    token
  });
  nextDoc.activationTokenHash = hashActivationToken(token);
  nextDoc.activationExpiresAt = Date.now() + ACTIVATION_EXPIRATION_MS;
  nextDoc.activationEmailStatus = patch.activationEmailStatus;
  nextDoc.activationEmailSentAt = patch.activationEmailSentAt;
  nextDoc.activationEmailError = patch.activationEmailError;
  nextDoc.updatedAt = Date.now();

  await db.collection(COLLECTIONS.creatorRegistrations).doc(registrationId).update({
    data: {
      activationTokenHash: nextDoc.activationTokenHash,
      activationExpiresAt: nextDoc.activationExpiresAt,
      activationEmailStatus: nextDoc.activationEmailStatus,
      activationEmailSentAt: nextDoc.activationEmailSentAt,
      activationEmailError: nextDoc.activationEmailError,
      updatedAt: nextDoc.updatedAt
    }
  });

  return hydrateCreatorRegistrationDetail(nextDoc);
}

async function retryCreatorRegistrationAccessProvision(payload, adminUser) {
  assertAdminPermission(adminUser, "creator_registrations:review");
  const registrationId = normalizeText(payload && (payload.registrationId || payload._id || payload.id));
  assertCondition(registrationId, "缺少申请记录 ID");

  const existing = await getCreatorRegistrationDocById(registrationId);
  assertCondition(existing, "未找到对应申请记录");

  const nextDoc = normalizeCreatorRegistrationDoc(existing);
  assertCondition(nextDoc.status === "approved", "仅已通过申请支持重新开通访问");
  assertCondition(
    ["pending", "failed", "conflict"].includes(nextDoc.accessProvisionStatus),
    "当前申请不需要重新开通访问"
  );

  nextDoc.updatedAt = Date.now();
  Object.assign(nextDoc, await provisionCreatorRegistrationAccess(nextDoc, adminUser, {
    now: nextDoc.updatedAt,
    registrationId
  }));

  await db.collection(COLLECTIONS.creatorRegistrations).doc(registrationId).update({
    data: {
      linkedCreatorId: nextDoc.linkedCreatorId,
      linkedCreatorSlug: nextDoc.linkedCreatorSlug,
      accessProvisionStatus: nextDoc.accessProvisionStatus,
      linkedAdminAccountId: nextDoc.linkedAdminAccountId,
      activationTokenHash: nextDoc.activationTokenHash,
      activationExpiresAt: nextDoc.activationExpiresAt,
      activationConsumedAt: nextDoc.activationConsumedAt,
      activationEmailStatus: nextDoc.activationEmailStatus,
      activationEmailSentAt: nextDoc.activationEmailSentAt,
      activationEmailError: nextDoc.activationEmailError,
      accessProvisionError: nextDoc.accessProvisionError,
      approvalEmailStatus: nextDoc.approvalEmailStatus,
      approvalEmailSentAt: nextDoc.approvalEmailSentAt,
      approvalEmailError: nextDoc.approvalEmailError,
      updatedAt: nextDoc.updatedAt
    }
  });

  return hydrateCreatorRegistrationDetail(nextDoc);
}

function getCreatorProfileKey(creator) {
  return normalizeText(creator && creator.id) || normalizeText(creator && creator.slug);
}

function sortRegistrationsByRecency(left, right) {
  return Math.max(
    normalizeNumber(right && right.updatedAt),
    normalizeNumber(right && right.reviewedAt),
    normalizeNumber(right && right.submittedAt)
  ) - Math.max(
    normalizeNumber(left && left.updatedAt),
    normalizeNumber(left && left.reviewedAt),
    normalizeNumber(left && left.submittedAt)
  );
}

function findLatestCreatorRegistrationForProfile(creator, registrations) {
  const creatorRefs = listCreatorRefs(creator);
  return normalizeArray(registrations)
    .filter((registration) => {
      const linkedCreatorId = normalizeText(registration && registration.linkedCreatorId);
      const linkedCreatorSlug = normalizeText(registration && registration.linkedCreatorSlug);
      return creatorRefs.includes(linkedCreatorId) || creatorRefs.includes(linkedCreatorSlug);
    })
    .sort(sortRegistrationsByRecency)[0] || null;
}

function selectCreatorPortalAccountForProfile(creator, accounts, registration) {
  const creatorRefs = listCreatorRefs(creator);
  const directMatch = normalizeArray(accounts)
    .filter((account) =>
      normalizeAdminAccountType(account && account.accountType, "admin") === "creator_portal"
      && creatorRefs.includes(normalizeText(account && account.boundCreatorId))
    )
    .sort((left, right) => {
      const leftStatusRank = normalizeText(left && left.status) === "active" ? 0 : 1;
      const rightStatusRank = normalizeText(right && right.status) === "active" ? 0 : 1;
      if (leftStatusRank !== rightStatusRank) {
        return leftStatusRank - rightStatusRank;
      }
      return normalizeNumber(right && right.updatedAt) - normalizeNumber(left && left.updatedAt);
    })[0] || null;

  if (directMatch) {
    return directMatch;
  }

  return registration ? findLinkedAdminAccountForRegistration(registration, accounts) : null;
}

function resolveCreatorProfilePortalAccessStatus(registration, adminAccount) {
  const accountStatus = normalizeText(adminAccount && adminAccount.status);
  const registrationAccessStatus = normalizeText(registration && registration.accessProvisionStatus);
  const registrationStatus = normalizeText(registration && registration.status);

  if (accountStatus === "inactive") {
    return "inactive";
  }

  if (registrationAccessStatus === "activation_pending") {
    return "activation_pending";
  }

  if (registrationAccessStatus === "conflict") {
    return "conflict";
  }

  if (registrationAccessStatus === "failed") {
    return "failed";
  }

  if (registrationAccessStatus === "provisioned") {
    return "provisioned";
  }

  if (accountStatus === "active") {
    return "provisioned";
  }

  if (registrationAccessStatus === "pending" || registrationStatus === "submitted") {
    return "pending";
  }

  return "none";
}

function matchesCreatorProfileApplicationStatus(filter, registration) {
  const normalizedFilter = normalizeText(filter).toLowerCase();
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  const actualStatus = normalizeText(registration && registration.status).toLowerCase() || "none";
  return actualStatus === normalizedFilter;
}

function matchesCreatorProfilePortalAccessStatus(filter, status) {
  const normalizedFilter = normalizeText(filter).toLowerCase();
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  return normalizeText(status).toLowerCase() === normalizedFilter;
}

function resolveCreatorProfilePersonName(registration, adminAccount, creator) {
  const applicantName = normalizeText(registration && registration.applicantName);
  const realName = normalizeText(adminAccount && adminAccount.realName);
  const applicantUpdatedAt = Math.max(
    normalizeNumber(registration && registration.updatedAt),
    normalizeNumber(registration && registration.reviewedAt),
    normalizeNumber(registration && registration.submittedAt),
    normalizeNumber(registration && registration.createdAt)
  );
  const realNameUpdatedAt = Math.max(
    normalizeNumber(adminAccount && adminAccount.updatedAt),
    normalizeNumber(adminAccount && adminAccount.createdAt)
  );

  if (applicantName && realName && realNameUpdatedAt > applicantUpdatedAt) {
    return realName;
  }

  return (
    applicantName
    || realName
    || normalizeText(adminAccount && adminAccount.displayName)
    || normalizeText(registration && registration.linkedAdminDisplayName)
    || normalizeText(creator && creator.name)
  );
}

function resolveCreatorProfileStatus(creator, adminAccount) {
  const creatorStatus = buildStatusTag(creator);
  const adminAccountStatus = normalizeText(adminAccount && adminAccount.status);

  if (creatorStatus === "deleted") {
    return "deleted";
  }

  if (creatorStatus === "inactive" || adminAccountStatus === "inactive") {
    return "inactive";
  }

  return "active";
}

function buildCreatorProfileOrderSummaryMaps(orderRows, creators, services) {
  const creatorKeyByRef = normalizeArray(creators).reduce((map, creator) => {
    const creatorKey = getCreatorProfileKey(creator);
    if (!creatorKey) {
      return map;
    }

    listCreatorRefs(creator).forEach((ref) => {
      map[ref] = creatorKey;
    });
    return map;
  }, {});

  const serviceOwnerMap = normalizeArray(services).reduce((map, service) => {
    const serviceSlug = normalizeText(service && service.slug);
    const creatorRef = normalizeText(service && service.creatorId);
    const creatorKey = creatorKeyByRef[creatorRef];
    if (serviceSlug && creatorKey) {
      map[serviceSlug] = creatorKey;
    }
    return map;
  }, {});

  return normalizeArray(orderRows).reduce((result, row) => {
    const status = normalizeText(row && row.status);
    if (!EFFECTIVE_ORDER_STATUSES.has(status)) {
      return result;
    }

    const serviceSlug = normalizeText(row && row.serviceSlug);
    const creatorKey = serviceOwnerMap[serviceSlug];
    if (!creatorKey) {
      return result;
    }

    if (!result[creatorKey]) {
      result[creatorKey] = {
        effectiveOrderCount: 0,
        lastOrderAt: 0,
        lastOrderNo: ""
      };
    }

    const updatedAtTs = normalizeNumber(row && (row.updatedAt || row.createdAtTs));
    result[creatorKey].effectiveOrderCount += 1;
    if (updatedAtTs >= normalizeNumber(result[creatorKey].lastOrderAt)) {
      result[creatorKey].lastOrderAt = updatedAtTs;
      result[creatorKey].lastOrderNo = normalizeText(row && row.orderNo);
    }

    return result;
  }, {});
}

async function listCreatorProfileOrderRows() {
  return queryRows(
    "SELECT `orderNo`, `userOpenid`, `serviceSlug`, `serviceName`, `servicePeriodCode`, `status`, `peopleCountInt`, `travelDateStart`, `updatedAt`, `createdAtTs` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC"
  );
}

async function listCreatorProfilePeriodRows() {
  return queryRows(
    "SELECT `serviceSlug`, `serviceName`, `periodCode`, `versionName`, `durationDays`, `dateStart`, `dateEnd`, `price`, `minGroup`, `remainingSeats`, `status`, `updatedAt` FROM `ServicePeriod` ORDER BY `dateStart` DESC"
  );
}

function buildCreatorProfileListItem(creator, context) {
  const creatorKey = getCreatorProfileKey(creator);
  const destinationSlugs = collectDestinationSlugsFromServicesForCreator(creator, context.services);
  const regionCodes = collectRegionCodesFromServicesForCreator(creator, context.services);
  const tags = getCreatorRouteTags(creator, context.services);
  const creatorRefs = listCreatorRefs(creator);
  const relatedServices = normalizeArray(context.services).filter((service) =>
    creatorRefs.includes(normalizeText(service && service.creatorId))
  );
  const registration = findLatestCreatorRegistrationForProfile(creator, context.registrations);
  const adminAccount = selectCreatorPortalAccountForProfile(creator, context.accounts, registration);
  const orderSummary = context.orderSummaryMap[creatorKey] || {
    effectiveOrderCount: 0,
    lastOrderAt: 0,
    lastOrderNo: ""
  };
  const periodCount = relatedServices.reduce((total, service) => {
    const serviceSlug = normalizeText(service && service.slug);
    const periodStats = context.periodStatsMap && serviceSlug ? context.periodStatsMap[serviceSlug] : null;
    return total + normalizeNumber(periodStats && periodStats.periodCount);
  }, 0);

  return {
    creatorId: normalizeText(creator && creator.id) || normalizeText(creator && creator.slug),
    creatorSlug: normalizeText(creator && creator.slug),
    creatorName: normalizeText(creator && creator.name),
    personName: resolveCreatorProfilePersonName(registration, adminAccount, creator),
    contentStatus: resolveCreatorProfileStatus(creator, adminAccount),
    stance: normalizeText(creator && creator.stance),
    tags,
    regionCodes,
    regionCount: regionCodes.length,
    destinationCount: destinationSlugs.length,
    serviceCount: relatedServices.length,
    periodCount,
    ideaCount: normalizeArray(context.ideas).filter((idea) =>
      creatorRefs.includes(normalizeText(idea && idea.authorId))
    ).length,
    effectiveOrderCount: normalizeNumber(orderSummary.effectiveOrderCount),
    lastOrderAt: normalizeNumber(orderSummary.lastOrderAt),
    lastOrderNo: normalizeText(orderSummary.lastOrderNo),
    applicantName: normalizeText(registration && registration.applicantName),
    contactEmail: normalizeEmail(registration && (registration.contactEmail || registration.authEmail)),
    phone: normalizeText(registration && registration.phone),
    registrationId: normalizeText(registration && registration.registrationId),
    registrationStatus: normalizeText(registration && registration.status) || "none",
    portalAccessStatus: resolveCreatorProfilePortalAccessStatus(registration, adminAccount),
    linkedAdminAccountId: normalizeText(adminAccount && adminAccount._id) || normalizeText(registration && registration.linkedAdminAccountId),
    linkedAdminUsername: normalizeText(adminAccount && adminAccount.username) || normalizeText(registration && registration.linkedAdminUsername),
    linkedAdminDisplayName: normalizeText(adminAccount && adminAccount.displayName) || normalizeText(registration && registration.linkedAdminDisplayName),
    linkedAdminRealName: normalizeText(adminAccount && adminAccount.realName),
    adminAccountStatus: normalizeText(adminAccount && adminAccount.status),
    createdAt: normalizeNumber(creator && creator.createdAt),
    updatedAt: normalizeNumber(creator && creator.updatedAt)
  };
}

async function listCreatorProfiles(payload, adminUser) {
  assertPlatformAdmin(adminUser, "当前账号没有查看创作者档案的权限");
  assertAdminPermission(adminUser, "ops:read");
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const contentStatus = normalizeText(payload && payload.contentStatus).toLowerCase();
  const applicationStatus = normalizeText(payload && payload.applicationStatus).toLowerCase();
  const portalAccessStatus = normalizeText(payload && payload.portalAccessStatus).toLowerCase();
  const hasServices = normalizeText(payload && payload.hasServices).toLowerCase();
  const hasOrders = normalizeText(payload && payload.hasOrders).toLowerCase();
  const limit = clampLimit(payload && payload.limit);

  const [creators, services, ideas, registrations, accounts, orderRows, periodStatsMap] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas),
    listOptionalCollection(COLLECTIONS.creatorRegistrations),
    listAdminAccountsData(),
    listCreatorProfileOrderRows(),
    getPeriodStatsMap({ bestEffort: true })
  ]);

  const normalizedRegistrations = normalizeArray(registrations).map(normalizeCreatorRegistrationDoc);
  const orderSummaryMap = buildCreatorProfileOrderSummaryMaps(orderRows, creators, services);

  const items = normalizeArray(creators)
    .map((creator) => buildCreatorProfileListItem(creator, {
      services,
      ideas,
      registrations: normalizedRegistrations,
      accounts,
      orderSummaryMap,
      periodStatsMap
    }))
    .filter((item) => {
      if (contentStatus && contentStatus !== "all" && normalizeText(item && item.contentStatus).toLowerCase() !== contentStatus) {
        return false;
      }
      if (!matchesCreatorProfileApplicationStatus(applicationStatus, { status: item && item.registrationStatus })) {
        return false;
      }
      if (!matchesCreatorProfilePortalAccessStatus(portalAccessStatus, item && item.portalAccessStatus)) {
        return false;
      }
      if (hasServices === "yes" && normalizeNumber(item && item.serviceCount) <= 0) {
        return false;
      }
      if (hasServices === "no" && normalizeNumber(item && item.serviceCount) > 0) {
        return false;
      }
      if (hasOrders === "yes" && normalizeNumber(item && item.effectiveOrderCount) <= 0) {
        return false;
      }
      if (hasOrders === "no" && normalizeNumber(item && item.effectiveOrderCount) > 0) {
        return false;
      }

      return matchesKeyword([
        item && item.creatorName,
        item && item.creatorSlug,
        item && item.stance,
        item && item.contactEmail,
        item && item.phone,
        item && item.personName,
        item && item.applicantName,
        item && item.linkedAdminUsername,
        item && item.linkedAdminDisplayName,
        item && item.linkedAdminRealName,
        ...(item && item.tags ? item.tags : [])
      ], keyword);
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "creatorName":
            return item.creatorName;
          case "serviceCount":
            return item.serviceCount;
          case "periodCount":
            return item.periodCount;
          case "ideaCount":
            return item.ideaCount;
          case "effectiveOrderCount":
            return item.effectiveOrderCount;
          case "lastOrderAt":
            return item.lastOrderAt;
          case "registrationStatus":
            return item.registrationStatus;
          case "portalAccessStatus":
            return item.portalAccessStatus;
          case "updatedAt":
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.creatorId || item.creatorSlug
    });
  }

  return items.slice(0, limit);
}

async function getCreatorProfileDetail(payload, adminUser) {
  assertPlatformAdmin(adminUser, "当前账号没有查看创作者档案的权限");
  assertAdminPermission(adminUser, "ops:read");
  const creatorReference = normalizeText(payload && (payload.creatorId || payload.creatorSlug || payload.id || payload.slug || payload._id));
  assertCondition(creatorReference, "缺少创作者 ID");

  const [creators, services, ideas, registrations, accounts, orderRows, periodRows, users] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas),
    listOptionalCollection(COLLECTIONS.creatorRegistrations),
    listAdminAccountsData(),
    listCreatorProfileOrderRows(),
    listCreatorProfilePeriodRows(),
    listCollection(COLLECTIONS.users)
  ]);

  const creator = normalizeArray(creators).find((item) => listCreatorRefs(item).includes(creatorReference)) || null;
  assertCondition(creator, "未找到对应创作者");

  const normalizedRegistrations = normalizeArray(registrations).map(normalizeCreatorRegistrationDoc);
  const registration = findLatestCreatorRegistrationForProfile(creator, normalizedRegistrations);
  const adminAccount = selectCreatorPortalAccountForProfile(creator, accounts, registration);
  const creatorRefs = listCreatorRefs(creator);
  const relatedServices = normalizeArray(services)
    .filter((service) => creatorRefs.includes(normalizeText(service && service.creatorId)))
    .map((service) => ({
      slug: normalizeText(service && service.slug),
      name: normalizeText(service && service.name),
      status: buildStatusTag(service),
      updatedAt: normalizeNumber(service && service.updatedAt)
    }))
    .sort((left, right) => normalizeNumber(right && right.updatedAt) - normalizeNumber(left && left.updatedAt));
  const relatedIdeas = normalizeArray(ideas)
    .filter((idea) => creatorRefs.includes(normalizeText(idea && idea.authorId)))
    .map((idea) => ({
      slug: normalizeText(idea && idea.slug),
      title: normalizeText(idea && idea.title),
      status: buildStatusTag(idea),
      updatedAt: normalizeNumber(idea && idea.updatedAt)
    }))
    .sort((left, right) => normalizeNumber(right && right.updatedAt) - normalizeNumber(left && left.updatedAt));
  const serviceMap = normalizeArray(services).reduce((map, service) => {
    const slug = normalizeText(service && service.slug);
    if (slug) {
      map[slug] = service;
    }
    return map;
  }, {});
  const orderSummaryMap = buildCreatorProfileOrderSummaryMaps(orderRows, [creator], services);
  const orderSummary = orderSummaryMap[getCreatorProfileKey(creator)] || {
    effectiveOrderCount: 0,
    lastOrderAt: 0,
    lastOrderNo: ""
  };
  const userMap = buildOrderUserMap(users);
  const serviceRefs = new Set(relatedServices.map((service) => normalizeText(service && service.slug)).filter(Boolean));
  const activeServiceRefs = new Set(
    relatedServices
      .filter((service) => normalizeText(service && service.status) === "active")
      .map((service) => normalizeText(service && service.slug))
      .filter(Boolean)
  );
  const periodSoldCountMap = normalizeArray(orderRows).reduce((map, row) => {
    if (normalizeText(row && row.status) === "canceled") {
      return map;
    }

    const periodCode = normalizeText(row && row.servicePeriodCode);
    if (!periodCode) {
      return map;
    }

    map[periodCode] = normalizeNumber(map[periodCode]) + Math.max(0, normalizeNumber(row && row.peopleCountInt));
    return map;
  }, {});
  const relatedPeriods = normalizeArray(periodRows)
    .filter((row) => serviceRefs.has(normalizeText(row && row.serviceSlug)))
    .map((row) => {
      const mapped = mapServicePeriodRecord(
        row,
        periodSoldCountMap[normalizeText(row && row.periodCode)] || 0,
        serviceMap[normalizeText(row && row.serviceSlug)] || null,
        adminUser
      );

      return {
        periodCode: normalizeText(mapped && mapped.periodCode),
        serviceSlug: normalizeText(mapped && mapped.serviceSlug),
        serviceName: normalizeText(mapped && mapped.serviceName),
        dateStart: normalizeText(mapped && mapped.dateStart),
        status: normalizeText(mapped && mapped.status),
        updatedAt: normalizeNumber(mapped && mapped.updatedAt)
      };
    });
  const activePeriodRefs = new Set(
    relatedPeriods
      .filter((period) => normalizeText(period && period.status) !== "inactive")
      .map((period) => normalizeText(period && period.periodCode))
      .filter(Boolean)
  );
  const relatedOrderRows = normalizeArray(orderRows)
    .filter((row) => serviceRefs.has(normalizeText(row && row.serviceSlug)));
  const activeOrderCount = relatedOrderRows.filter((row) => {
    const serviceSlug = normalizeText(row && row.serviceSlug);
    if (!activeServiceRefs.has(serviceSlug)) {
      return false;
    }

    const periodCode = normalizeText(row && row.servicePeriodCode);
    if (!periodCode) {
      return true;
    }

    return activePeriodRefs.has(periodCode);
  }).length;
  const recentOrders = relatedOrderRows
    .slice(0, 20)
    .map((row) => {
      const userSummary = resolveOrderUserSummary(userMap, row && row.userOpenid);
      return {
        orderNo: normalizeText(row && row.orderNo),
        serviceSlug: normalizeText(row && row.serviceSlug),
        serviceName: normalizeText(row && row.serviceName),
        servicePeriodCode: normalizeText(row && row.servicePeriodCode),
        userId: userSummary.userId,
        userNickname: userSummary.userNickname,
        peopleCount: normalizeNumber(row && row.peopleCountInt),
        status: normalizeText(row && row.status),
        travelDateStart: normalizeText(row && row.travelDateStart),
        updatedAtTs: normalizeNumber(row && (row.updatedAt || row.createdAtTs))
      };
    });

  return {
    creatorId: normalizeText(creator && creator.id) || normalizeText(creator && creator.slug),
    creatorSlug: normalizeText(creator && creator.slug),
    name: normalizeText(creator && creator.name),
    personName: resolveCreatorProfilePersonName(registration, adminAccount, creator),
    status: buildStatusTag(creator),
    avatar: normalizeText(creator && creator.avatar),
    stance: normalizeText(creator && creator.stance),
    tags: getCreatorRouteTags(creator, services),
    regionCodes: collectRegionCodesFromServicesForCreator(creator, services),
    destinationSlugs: collectDestinationSlugsFromServicesForCreator(creator, services),
    about: normalizeArray(creator && creator.about).map((item) => normalizeText(item)).filter(Boolean),
    reviews: sanitizeReviewList(creator && creator.reviews),
    regionCount: collectRegionCodesFromServicesForCreator(creator, services).length,
    destinationCount: collectDestinationSlugsFromServicesForCreator(creator, services).length,
    serviceCount: relatedServices.length,
    ideaCount: relatedIdeas.length,
    effectiveOrderCount: normalizeNumber(orderSummary.effectiveOrderCount),
    activeServiceCount: relatedServices.filter((service) => normalizeText(service && service.status) === "active").length,
    activePeriodCount: relatedPeriods.filter((period) => normalizeText(period && period.status) !== "inactive").length,
    activeOrderCount: activeOrderCount,
    historicalServiceCount: relatedServices.length,
    historicalPeriodCount: relatedPeriods.length,
    historicalOrderCount: relatedOrderRows.length,
    lastOrderAt: normalizeNumber(orderSummary.lastOrderAt),
    lastOrderNo: normalizeText(orderSummary.lastOrderNo),
    createdAt: normalizeNumber(creator && creator.createdAt),
    updatedAt: normalizeNumber(creator && creator.updatedAt),
    registration: registration ? {
      registrationId: normalizeText(registration && registration.registrationId),
      applicantName: normalizeText(registration && registration.applicantName),
      authUserId: normalizeText(registration && registration.authUserId),
      authEmail: normalizeEmail(registration && registration.authEmail),
      contactEmail: normalizeEmail(registration && registration.contactEmail),
      phone: normalizeText(registration && registration.phone),
      gender: normalizeText(registration && registration.gender),
      birthday: normalizeText(registration && registration.birthday),
      documentType: normalizeText(registration && registration.documentType),
      documentNumber: normalizeText(registration && registration.documentNumber),
      wechat: normalizeText(registration && registration.wechat),
      status: normalizeText(registration && registration.status) || "none",
      rejectionReason: normalizeText(registration && registration.rejectionReason),
      accessProvisionStatus: normalizeText(registration && registration.accessProvisionStatus) || "none",
      linkedAdminAccountId: normalizeText(adminAccount && adminAccount._id) || normalizeText(registration && registration.linkedAdminAccountId),
      linkedAdminUsername: normalizeText(adminAccount && adminAccount.username) || normalizeText(registration && registration.linkedAdminUsername),
      linkedAdminDisplayName: normalizeText(adminAccount && adminAccount.displayName) || normalizeText(registration && registration.linkedAdminDisplayName),
      submittedAt: normalizeNumber(registration && registration.submittedAt),
      reviewedAt: normalizeNumber(registration && registration.reviewedAt),
      updatedAt: normalizeNumber(registration && registration.updatedAt)
    } : null,
    adminAccount: adminAccount ? {
      _id: normalizeText(adminAccount && adminAccount._id),
      uid: normalizeText(adminAccount && adminAccount.uid),
      username: normalizeText(adminAccount && adminAccount.username),
      displayName: normalizeText(adminAccount && adminAccount.displayName),
      email: normalizeText(adminAccount && adminAccount.email),
      phone: normalizeText(adminAccount && adminAccount.phone),
      realName: normalizeText(adminAccount && adminAccount.realName),
      gender: normalizeText(adminAccount && adminAccount.gender),
      birthday: normalizeText(adminAccount && adminAccount.birthday),
      documentType: normalizeText(adminAccount && adminAccount.documentType),
      documentNumber: normalizeText(adminAccount && adminAccount.documentNumber),
      documents: normalizeIdentityDocuments(adminAccount && adminAccount.documents, {
        documentType: normalizeText(adminAccount && adminAccount.documentType),
        documentNumber: normalizeText(adminAccount && adminAccount.documentNumber)
      }),
      wechat: normalizeText(adminAccount && adminAccount.wechat),
      accountType: normalizeAdminAccountType(adminAccount && adminAccount.accountType, "creator_portal"),
      boundCreatorId: normalizeText(adminAccount && adminAccount.boundCreatorId),
      status: normalizeText(adminAccount && adminAccount.status) || "inactive",
      createdAt: normalizeNumber(adminAccount && adminAccount.createdAt),
      updatedAt: normalizeNumber(adminAccount && adminAccount.updatedAt)
    } : null,
    relatedServices,
    relatedPeriods,
    relatedIdeas,
    recentOrders
  };
}

async function getDestinationDetail(payload, adminUser) {
  assertPlatformAdmin(adminUser, "当前账号没有查看目的地的权限");
  assertAdminPermission(adminUser, "destinations:read");
  const destination = await findContentDoc(COLLECTIONS.destinations, payload);
  assertCondition(destination, "未找到对应目的地");
  return mapDestinationDetailRecord(destination, adminUser);
}

async function saveDestination(payload, adminUser) {
  assertPlatformAdmin(adminUser, "当前账号没有编辑目的地的权限");
  assertCondition(
    hasAdminPermission(adminUser, "destinations:write") || hasAdminPermission(adminUser, "destinations:write:owned"),
    "当前账号没有编辑目的地的权限"
  );
  const existing = await findContentDoc(COLLECTIONS.destinations, payload);
  if (existing) {
    assertOwnedContentMutation(
      existing,
      adminUser,
      "destinations:write",
      "destinations:write:owned",
      "当前账号只能编辑自己新建的目的地"
    );
  }
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
    return getDestinationDetail({ _id: createResult && createResult._id }, adminUser);
  }

  await db.collection(COLLECTIONS.destinations).doc(existing._id).update({ data: nextDoc });
  return getDestinationDetail({ _id: existing._id }, adminUser);
}

async function deleteDestination(payload, adminUser) {
  assertPlatformAdmin(adminUser, "当前账号没有删除目的地的权限");
  assertCondition(
    hasAdminPermission(adminUser, "destinations:write") || hasAdminPermission(adminUser, "destinations:write:owned"),
    "当前账号没有删除目的地的权限"
  );
  const existing = await findContentDoc(COLLECTIONS.destinations, payload);
  assertCondition(existing, "未找到对应目的地");
  assertOwnedContentMutation(
    existing,
    adminUser,
    "destinations:write",
    "destinations:write:owned",
    "当前账号只能删除自己新建的目的地"
  );

  const destinationSlug = normalizeText(existing.slug);
  const services = await listCollection(COLLECTIONS.services);

  assertCondition(
    services.every((service) => !normalizeArray(service.destinationSlugs).includes(destinationSlug)),
    "该目的地仍有关联路线，不能直接删除"
  );

  await db.collection(COLLECTIONS.destinations).doc(existing._id).remove();
  await cleanupHomePageSlugReferences(destinationSlug, ["featuredDestinationSlugs"], adminUser);
  await deleteServiceAssetFiles(collectDestinationAssetRefs(existing));

  return {
    slug: destinationSlug,
    removed: true
  };
}

async function getIdeaDetail(payload, adminUser) {
  assertAdminPermission(adminUser, "ideas:read");
  const idea = await findContentDoc(COLLECTIONS.ideas, payload);
  assertCondition(idea, "未找到对应故事");

  const creators = await listCollection(COLLECTIONS.creators);
  const authorNameMap = creators.reduce((map, creator) => {
    listCreatorRefs(creator).forEach((ref) => {
      map[ref] = normalizeText(creator && creator.name);
    });
    return map;
  }, {});

  return mapIdeaDetailRecord(idea, authorNameMap, adminUser);
}

async function saveIdea(payload, adminUser) {
  assertCondition(
    hasAdminPermission(adminUser, "ideas:write") || hasAdminPermission(adminUser, "ideas:write:owned"),
    "当前账号没有编辑故事的权限"
  );
  const existing = await findContentDoc(COLLECTIONS.ideas, payload);
  if (existing) {
    assertOwnedContentMutation(
      existing,
      adminUser,
      "ideas:write",
      "ideas:write:owned",
      "当前账号只能编辑自己新建的故事"
    );
  }
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
  assertCondition(ideaTheme.themeLabel, "请选择故事主题");

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
  const matchedAuthor = isCreatorPortalUser(adminUser)
    ? await resolveBoundCreator(adminUser)
    : creators.find((creator) =>
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
  const regionCodes = normalizeServiceRegionCodes(normalizedPayload && normalizedPayload.regionCodes);

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
    regionCodes,
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
    return getIdeaDetail({ _id: createResult && createResult._id }, adminUser);
  }

  await db.collection(COLLECTIONS.ideas).doc(existing._id).update({ data: nextDoc });
  return getIdeaDetail({ _id: existing._id }, adminUser);
}

async function deleteIdea(payload, adminUser) {
  assertCondition(
    hasAdminPermission(adminUser, "ideas:write") || hasAdminPermission(adminUser, "ideas:write:owned"),
    "当前账号没有删除故事的权限"
  );
  const existing = await findContentDoc(COLLECTIONS.ideas, payload);
  assertCondition(existing, "未找到对应故事");
  assertOwnedContentMutation(
    existing,
    adminUser,
    "ideas:write",
    "ideas:write:owned",
    "当前账号只能删除自己新建的故事"
  );

  const ideaSlug = normalizeText(existing.slug);
  await db.collection(COLLECTIONS.ideas).doc(existing._id).remove();
  await cleanupHomePageSlugReferences(ideaSlug, ["featuredIdeaSlugs"], adminUser);
  await deleteServiceAssetFiles(collectIdeaAssetRefs(existing));

  return {
    slug: ideaSlug,
    removed: true
  };
}

async function listCreators(payload, adminUser) {
  assertAdminPermission(adminUser, "creators:read");
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const tag = normalizeText(payload && payload.tag);
  const creatorSlug = normalizeText(payload && payload.creatorSlug);
  const limit = clampLimit(payload && payload.limit);
  const boundCreatorId = getCreatorPortalBoundCreatorId(adminUser);
  const [creators, services, ideas] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas)
  ]);
  const mineCreatorRefs = resolveMineScopeCreatorRefs(payload, adminUser, creators);

  const items = creators
    .map((creator) => {
      const destinationSlugs = collectDestinationSlugsFromServicesForCreator(creator, services);
      const regionCodes = collectRegionCodesFromServicesForCreator(creator, services);
      const tags = getCreatorRouteTags(creator, services);
      const creatorRefs = listCreatorRefs(creator);

      return {
        id: normalizeText(creator.id) || normalizeText(creator.slug),
        slug: normalizeText(creator.slug),
        name: normalizeText(creator.name),
        status: buildStatusTag(creator),
        stance: normalizeText(creator.stance),
        tags,
        regionCodes,
        regionCount: regionCodes.length,
        destinationSlugs,
        destinationCount: destinationSlugs.length,
        serviceCount: services.filter((service) => creatorRefs.includes(normalizeText(service.creatorId))).length,
        ideaCount: ideas.filter((idea) => creatorRefs.includes(normalizeText(idea.authorId))).length,
        access: getCreatorAccess(creator, adminUser),
        createdAt: normalizeNumber(creator && creator.createdAt),
        updatedAt: normalizeNumber(creator && creator.updatedAt)
      };
    })
    .filter((creator) => {
      const isBoundCreator = Boolean(boundCreatorId && listCreatorRefs(creator).includes(boundCreatorId));
      if (Array.isArray(mineCreatorRefs) && !matchesCreatorRefSet(new Set(mineCreatorRefs), listCreatorRefs(creator))) {
        return false;
      }
      if (creatorSlug && creator.slug !== creatorSlug) {
        return false;
      }
      if (
        status
        && status !== "all"
        && status !== normalizeText(creator.status).toLowerCase()
        && !isBoundCreator
      ) {
        return false;
      }
      if (tag && !normalizeArray(creator.tags).includes(tag)) {
        return false;
      }

      return matchesKeyword([creator.name, creator.slug, creator.stance, ...normalizeArray(creator.tags)], keyword);
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "name":
            return item.name;
          case "destinationCount":
            return item.destinationCount;
          case "serviceCount":
            return item.serviceCount;
          case "ideaCount":
            return item.ideaCount;
          case "updatedAt":
            return item.updatedAt;
          case "status":
            return item.status;
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.id || item.slug
    });
  }

  return items.slice(0, limit);
}

async function getCreatorRelationSummaries(payload) {
  const creatorSlugs = uniqueStrings(normalizeArray(payload && payload.creatorSlugs));
  if (!creatorSlugs.length) {
    return {};
  }

  const [creators, destinations, services, ideas] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.destinations),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas)
  ]);

  const destinationNameMap = normalizeArray(destinations).reduce((map, destination) => {
    const slug = normalizeText(destination && destination.slug);
    if (slug) {
      map[slug] = normalizeText(destination && destination.name) || slug;
    }
    return map;
  }, {});

  return normalizeArray(creators)
    .filter((creator) => creatorSlugs.includes(normalizeText(creator && creator.slug)))
    .reduce((result, creator) => {
      const creatorSlug = normalizeText(creator && creator.slug);
      const creatorRefs = listCreatorRefs(creator);
      const matchedServices = normalizeArray(services).filter((service) =>
        creatorRefs.includes(normalizeText(service && service.creatorId))
      );
      const matchedIdeas = normalizeArray(ideas).filter((idea) =>
        creatorRefs.includes(normalizeText(idea && idea.authorId))
      );
      const regionCodes = collectRegionCodesFromServicesForCreator(creator, services);
      const destinationSlugs = collectDestinationSlugsFromServicesForCreator(creator, services);

      result[creatorSlug] = {
        regionCount: regionCodes.length,
        regions: regionCodes.map((code) => ({
          code,
          label: getDestinationRegionLabel(code) || code
        })),
        destinationCount: destinationSlugs.length,
        destinations: destinationSlugs.map((slug) => ({
          slug,
          name: destinationNameMap[slug] || slug
        })),
        serviceCount: matchedServices.length,
        services: uniqueStrings(matchedServices.map((service) => normalizeText(service && service.slug)))
          .map((slug) => {
            const service = matchedServices.find((item) => normalizeText(item && item.slug) === slug);
            return {
              slug,
              name: normalizeText(service && service.name) || slug
            };
          }),
        ideaCount: matchedIdeas.length,
        ideas: uniqueStrings(matchedIdeas.map((idea) => normalizeText(idea && idea.slug)))
          .map((slug) => {
            const idea = matchedIdeas.find((item) => normalizeText(item && item.slug) === slug);
            return {
              slug,
              title: normalizeText(idea && idea.title) || slug
            };
          })
      };

      return result;
    }, {});
}

async function listDestinations(payload, adminUser) {
  assertPlatformAdmin(adminUser, "当前账号没有查看目的地的权限");
  assertAdminPermission(adminUser, "destinations:read");
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const destinationSlug = normalizeText(payload && payload.destinationSlug);
  const limit = clampLimit(payload && payload.limit);
  const [destinations, creators, services] = await Promise.all([
    listCollection(COLLECTIONS.destinations),
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.services)
  ]);
  const mineCreatorRefs = resolveMineScopeCreatorRefs(payload, adminUser, creators);
  const mineCreator = Array.isArray(mineCreatorRefs)
    ? normalizeArray(creators).find((creator) => matchesCreatorRefSet(new Set(mineCreatorRefs), listCreatorRefs(creator))) || null
    : null;
  const mineDestinationSlugSet = Array.isArray(mineCreatorRefs)
    ? new Set(collectDestinationSlugsForCreatorScope(mineCreator, services))
    : null;

  const items = destinations
    .map((destination) => {
      const slug = normalizeText(destination.slug);
      const regionCode = resolveDestinationRegionCode(destination.regionCode, slug);
      const relatedServices = services.filter((service) => normalizeArray(service.destinationSlugs).includes(slug));
      const relatedCreatorRefs = uniqueStrings(relatedServices.map((service) => normalizeText(service && service.creatorId)));
      const relatedCreators = creators.filter((creator) => {
        const creatorRefs = listCreatorRefs(creator);
        return relatedCreatorRefs.some((creatorRef) => creatorRefs.includes(creatorRef));
      });
      return {
        id: normalizeText(destination.id) || slug,
        slug,
        name: normalizeText(destination.name),
        status: buildStatusTag(destination),
        regionCode,
        regionLabel: getDestinationRegionLabel(regionCode),
        description: normalizeText(destination.description),
        creatorSlugs: relatedCreators
          .map((creator) => normalizeText(creator.slug))
          .filter(Boolean),
        creatorCount: relatedCreators.length,
        serviceCount: relatedServices.length,
        access: getDestinationAccess(destination, adminUser),
        createdAt: normalizeNumber(destination && destination.createdAt),
        updatedAt: normalizeNumber(destination && destination.updatedAt)
      };
    })
    .filter((destination) => {
      if (mineDestinationSlugSet && !mineDestinationSlugSet.has(destination.slug)) {
        return false;
      }
      if (destinationSlug && destination.slug !== destinationSlug) {
        return false;
      }
      if (status && status !== "all" && status !== normalizeText(destination.status).toLowerCase()) {
        return false;
      }

      return matchesKeyword(
        [
          destination.name,
          destination.slug,
          destination.description,
          destination.regionLabel
        ],
        keyword
      );
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "name":
            return item.name;
          case "regionLabel":
            return item.regionLabel;
          case "creatorCount":
            return item.creatorCount;
          case "serviceCount":
            return item.serviceCount;
          case "updatedAt":
            return item.updatedAt;
          case "status":
            return item.status;
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.id || item.slug
    });
  }

  return items.slice(0, limit);
}

async function listIdeas(payload, adminUser) {
  assertAdminPermission(adminUser, "ideas:read");
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const ideaSlug = normalizeText(payload && payload.ideaSlug);
  const creatorSlug = normalizeText(payload && payload.creatorSlug);
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
  const creatorRefs = resolveCreatorRefs(creatorSlug, creators);

  const items = ideas
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
        authorId: normalizeText(idea && idea.authorId),
        authorName: authorMap[normalizeText(idea.authorId)] || "",
        regionCodes: normalizeServiceRegionCodes(idea && idea.regionCodes),
        regionCount: normalizeServiceRegionCodes(idea && idea.regionCodes).length,
        destinationSlugs: uniqueStrings(idea && idea.destinationSlugs),
        destinationCount: normalizeArray(idea.destinationSlugs).length,
        summary: normalizeText(idea.summary),
        access: getIdeaAccess(idea, adminUser),
        createdAt: normalizeNumber(idea && idea.createdAt),
        updatedAt: normalizeNumber(idea && idea.updatedAt)
      };
    })
    .filter((idea) => {
      if (ideaSlug && idea.slug !== ideaSlug) {
        return false;
      }
      if (creatorRefs.length && !creatorRefs.includes(normalizeText(idea.authorId))) {
        return false;
      }
      if (status && status !== "all" && status !== normalizeText(idea.status).toLowerCase()) {
        return false;
      }

      return matchesKeyword(
        [idea.title, idea.slug, idea.summary, idea.themeLabel, idea.authorName],
        keyword
      );
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "title":
            return item.title;
          case "theme":
            return item.theme;
          case "authorName":
            return item.authorName;
          case "destinationCount":
            return item.destinationCount;
          case "updatedAt":
            return item.updatedAt;
          case "status":
            return item.status;
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.id || item.slug
    });
  }

  return items.slice(0, limit);
}

async function listServicePeriods(payload, adminUser) {
  assertAdminPermission(adminUser, "periods:read");
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const serviceSlug = normalizeText(payload && payload.serviceSlug);
  const status = normalizeText(payload && payload.status).toLowerCase();
  const dateScope = normalizeText(payload && payload.dateScope).toLowerCase();
  const stock = normalizeText(payload && payload.stock).toLowerCase();
  const limit = clampLimit(payload && payload.limit, 100);
  const [rows, soldCountMap, services, creators] = await Promise.all([
    queryRows(
      "SELECT `serviceSlug`, `serviceName`, `periodCode`, `versionName`, `durationDays`, `dateStart`, `dateEnd`, `price`, `minGroup`, `remainingSeats`, `status`, `updatedAt` FROM `ServicePeriod` ORDER BY `dateStart` DESC LIMIT 500"
    ),
    getSoldCountByPeriodCodeMap({ bestEffort: true }),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);
  const serviceMap = normalizeArray(services).reduce((map, service) => {
    const slug = normalizeText(service && service.slug);
    if (slug) {
      map[slug] = service;
    }
    return map;
  }, {});
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const todayDateKey = getShanghaiTodayDateString();
  const upcomingDateKey = addDaysToDateString(todayDateKey, 13);

  const items = rows
    .map((row) => Object.assign(
      mapServicePeriodRecord(
        row,
        soldCountMap[normalizeText(row.periodCode)] || 0,
        serviceMap[normalizeText(row.serviceSlug)] || null,
        adminUser
      ),
      {
        updatedAt: normalizeNumber(row.updatedAt)
      }
    ))
    .filter((row) => {
      if (!canAccessServicePeriodForAdmin(row, adminUser, creatorRefSet, serviceMap)) {
        return false;
      }
      if (serviceSlug && normalizeText(row.serviceSlug) !== serviceSlug) {
        return false;
      }
      if (status === "active" && !["available", "confirmed", "soldout", "closed"].includes(normalizeText(row.status))) {
        return false;
      }
      if (status && status !== "all" && status !== "active" && normalizeText(row.status) !== status) {
        return false;
      }
      if (dateScope === "upcoming" && (row.dateStart < todayDateKey || row.dateStart > upcomingDateKey)) {
        return false;
      }
      if (
        stock === "warning"
        && !(normalizeNumber(row.remainingSeats) > 0
          && normalizeNumber(row.remainingSeats) <= 3
          && normalizeText(row.status) !== "inactive"
          && normalizeText(row.status) !== "closed")
      ) {
        return false;
      }

      return matchesKeyword([row.serviceName, row.serviceSlug, row.periodCode, row.versionName], keyword);
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "serviceName":
            return item.serviceName;
          case "versionName":
            return item.versionName;
          case "durationDays":
            return item.durationDays;
          case "dateStart":
            return item.dateStart;
          case "price":
            return item.price;
          case "totalSeats":
            return item.totalSeats;
          case "soldCount":
            return item.soldCount;
          case "remainingSeats":
            return item.remainingSeats;
          case "minGroup":
            return item.minGroup;
          case "updatedAt":
            return item.updatedAt;
          case "status":
            return item.status;
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.periodCode
    });
  }

  return items.slice(0, limit);
}

async function getServicePeriodDetail(payload, adminUser) {
  assertAdminPermission(adminUser, "periods:read");
  const record = await findServicePeriodByCode(payload && payload.periodCode);
  assertCondition(record, "未找到对应团期");
  const [soldCount, service, creators] = await Promise.all([
    getSoldCountByPeriodCode(record.periodCode),
    findServiceDocBySlug(record && record.serviceSlug),
    listCollection(COLLECTIONS.creators)
  ]);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  assertCondition(
    canAccessServicePeriodForAdmin(
      record,
      adminUser,
      creatorRefSet,
      service ? { [normalizeText(service && service.slug)]: service } : {}
    ),
    "未找到对应团期"
  );
  return mapServicePeriodRecord(record, soldCount, service, adminUser);
}

async function saveServicePeriod(payload, adminUser) {
  assertCondition(
    hasAdminPermission(adminUser, "periods:write") || hasAdminPermission(adminUser, "periods:write:owned"),
    "当前账号没有编辑团期的权限"
  );
  const originalPeriodCode = normalizeText(payload && (payload.originalPeriodCode || payload.periodCode));
  const existing = originalPeriodCode ? await findServicePeriodByCode(originalPeriodCode) : null;
  let periodCode = normalizeText(payload && payload.periodCode);
  const serviceSlug = normalizeText(payload && payload.serviceSlug);
  const service = await findServiceDocBySlug(serviceSlug);
  const requestedVersionName = normalizeText(payload && payload.versionName);

  assertCondition(service, "请选择已存在的路线");
  assertCondition(
    canManageServicePeriodsForService(service, adminUser),
    "当前账号只能维护自己可编辑路线下的团期"
  );
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
  const singleRoomEnabled = normalizeBoolean(payload && payload.singleRoomEnabled);
  const singleRoomPrice = singleRoomEnabled
    ? Math.max(0, normalizeNumber(payload && payload.singleRoomPrice, 0))
    : 0;
  const singleRoomNotice = singleRoomEnabled ? normalizeText(payload && payload.singleRoomNotice) : "";
  if (singleRoomEnabled) {
    assertCondition(singleRoomPrice > 0, "开启单房申请时，请填写大于 0 的单房差参考价");
  }
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
    singleRoomEnabled,
    singleRoomPrice,
    singleRoomPriceDec: toDecimalString(singleRoomPrice),
    singleRoomNotice,
    remainingSeats,
    remainingSeatsInt: remainingSeats,
    status: resolveServicePeriodStatus(payload && payload.status, service, remainingSeats, dateStart, dateEnd, soldCount, minGroup),
    badge: "",
    updatedAt: now,
    updateBy: operatorId
  };

  if (!existing) {
    const createRecord = buildServicePeriodCreateRecord(record, operatorId, now);
    await insertServicePeriodRecordWithCompatibility(createRecord);
    return getServicePeriodDetail({ periodCode }, adminUser);
  }

  await updateServicePeriodRecordWithCompatibility(record, originalPeriodCode);

  return getServicePeriodDetail({ periodCode }, adminUser);
}

async function deleteServicePeriod(payload, adminUser) {
  assertCondition(
    hasAdminPermission(adminUser, "periods:write") || hasAdminPermission(adminUser, "periods:write:owned"),
    "当前账号没有删除团期的权限"
  );
  const periodCode = normalizeText(payload && payload.periodCode);
  assertCondition(periodCode, "缺少团期编码");

  const existing = await findServicePeriodByCode(periodCode);
  assertCondition(existing, "未找到对应团期");
  const service = await findServiceDocBySlug(existing && existing.serviceSlug);
  assertCondition(service, "未找到团期所属路线");
  assertCondition(
    canManageServicePeriodsForService(service, adminUser),
    "当前账号只能删除自己可编辑路线下的团期"
  );

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

function getReferralRelationDedupeKey(item) {
  const inviterUserId = normalizeText(item && item.inviterUserId);
  const inviteeUserId = normalizeText(item && item.inviteeUserId);
  const referralCode = normalizeText(item && item.referralCode).toUpperCase();

  if (!inviterUserId || !inviteeUserId || !referralCode) {
    return "";
  }

  return `${inviterUserId}::${inviteeUserId}::${referralCode}`;
}

function getReferralRelationFirstTime(item) {
  return normalizeNumber(item && item.firstValidScanAt, 0)
    || normalizeNumber(item && item.createdAt, 0)
    || normalizeNumber(item && item.updatedAt, 0);
}

function dedupeReferralRelationItems(items) {
  const keyedItems = new Map();
  const unkeyedItems = [];

  normalizeArray(items).forEach((item) => {
    const key = getReferralRelationDedupeKey(item);
    if (!key) {
      unkeyedItems.push(item);
      return;
    }

    const existing = keyedItems.get(key);
    if (!existing) {
      keyedItems.set(key, item);
      return;
    }

    const existingTime = getReferralRelationFirstTime(existing);
    const itemTime = getReferralRelationFirstTime(item);
    if ((itemTime && !existingTime) || (itemTime && existingTime && itemTime < existingTime)) {
      keyedItems.set(key, item);
    }
  });

  return unkeyedItems.concat(Array.from(keyedItems.values()));
}

async function listReferralRelations(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const [relations, users] = await Promise.all([
    listOptionalCollection(COLLECTIONS.referralRelations),
    listCollection(COLLECTIONS.users)
  ]);
  const userMap = buildUserIdSummaryMap(users);

  const filteredItems = normalizeArray(relations)
    .map((doc) => {
      const inviterSummary = resolveUserSummaryByUserId(userMap, doc && doc.inviterUserId);
      const inviteeSummary = resolveUserSummaryByUserId(userMap, doc && doc.inviteeUserId);

      return {
        relationId: normalizeText(doc && doc._id),
        inviterUserId: inviterSummary.userId,
        inviterNickname: inviterSummary.userNickname,
        inviteeUserId: inviteeSummary.userId,
        inviteeNickname: inviteeSummary.userNickname,
        referralCode: normalizeText(doc && (doc.firstValidScanCode || doc.referralCode)),
        sourceScene: normalizeText(doc && (doc.firstValidScanScene || doc.sourceScene)),
        status: normalizeText(doc && doc.status) || "active",
        firstValidScanAt: normalizeNumber(doc && doc.firstValidScanAt, 0),
        createdAt: normalizeNumber(doc && doc.createdAt, 0),
        updatedAt: normalizeNumber(doc && doc.updatedAt, 0)
      };
    })
    .filter((item) => {
      if (status && normalizeText(item.status).toLowerCase() !== status) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [
        item.relationId,
        item.inviterNickname,
        item.inviteeNickname,
        item.referralCode
      ].some((value) => normalizeText(value).toLowerCase().includes(keyword));
    });
  const items = dedupeReferralRelationItems(filteredItems);

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultSortBy: "firstValidScanAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "inviterNickname":
            return item.inviterNickname;
          case "inviteeNickname":
            return item.inviteeNickname;
          case "status":
            return item.status;
          case "createdAt":
            return item.createdAt;
          case "firstValidScanAt":
          default:
            return item.firstValidScanAt;
        }
      },
      getItemKey: (item) => item.relationId
    });
  }

  return items;
}

async function listReferralRewardLedgers(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const [ledgers, users] = await Promise.all([
    listOptionalCollection(COLLECTIONS.referralRewardLedgers),
    listCollection(COLLECTIONS.users)
  ]);
  const userMap = buildUserIdSummaryMap(users);

  const items = normalizeArray(ledgers)
    .map((doc) => {
      const inviterSummary = resolveUserSummaryByUserId(userMap, doc && doc.inviterUserId);
      const inviteeSummary = resolveUserSummaryByUserId(userMap, doc && doc.inviteeUserId);

      const normalizedStatus = normalizeReferralRewardLedgerOperationalStatus(doc && doc.status);

      return {
        ledgerId: normalizeText(doc && doc._id),
        inviterUserId: inviterSummary.userId,
        inviterNickname: inviterSummary.userNickname,
        inviteeUserId: inviteeSummary.userId,
        inviteeNickname: inviteeSummary.userNickname,
        sourceOrderNo: normalizeText(doc && doc.sourceOrderNo),
        serviceName: normalizeText(doc && doc.serviceName),
        rewardAmount: normalizeNumber(doc && doc.rewardAmount, 0),
        status: normalizedStatus,
        settlementMonth: normalizeText(doc && doc.settlementMonth),
        payoutBatchId: normalizeText(doc && doc.payoutBatchId),
        earnedAt: normalizeNumber(doc && doc.earnedAt, 0),
        updatedAt: normalizeNumber(doc && doc.updatedAt, 0)
      };
    })
    .filter((item) => {
      if (status && normalizeText(item.status).toLowerCase() !== status) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [
        item.ledgerId,
        item.inviterNickname,
        item.inviteeNickname,
        item.sourceOrderNo,
        item.serviceName,
        item.settlementMonth
      ].some((value) => normalizeText(value).toLowerCase().includes(keyword));
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultSortBy: "earnedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "inviterNickname":
            return item.inviterNickname;
          case "inviteeNickname":
            return item.inviteeNickname;
          case "rewardAmount":
            return item.rewardAmount;
          case "status":
            return item.status;
          case "updatedAt":
            return item.updatedAt;
          case "earnedAt":
          default:
            return item.earnedAt;
        }
      },
      getItemKey: (item) => item.ledgerId
    });
  }

  return items;
}

function normalizeReferralRewardLedgerOperationalStatus(status) {
  const normalized = normalizeText(status).toLowerCase();
  switch (normalized) {
    case "under_review":
      return "payable";
    case "payable":
    case "paid":
    case "failed":
      return normalized;
    case "earned":
      return "awaiting_account";
    case "batched":
      return "payable";
    case "reversed":
      return "failed";
    case "awaiting_account":
    default:
      return "awaiting_account";
  }
}

function normalizeReferralPayoutAccountOperationalStatus(status) {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "under_review") {
    return "payable";
  }
  return normalized || "awaiting_account";
}

async function updateReferralRewardLedgerPayoutStatus(payload, adminUser) {
  const ledgerId = normalizeText(payload && (payload.ledgerId || payload.rewardLedgerId || payload._id));
  const nextStatus = normalizeText(payload && payload.status).toLowerCase();
  const note = normalizeText(payload && payload.note);
  assertCondition(ledgerId, "请选择奖励台账");
  assertCondition(["paid", "failed"].includes(nextStatus), "只支持标记为已打款或打款失败");

  const ledgerResult = await db.collection(COLLECTIONS.referralRewardLedgers).doc(ledgerId).get();
  const ledger = ledgerResult && ledgerResult.data ? ledgerResult.data : null;
  assertCondition(ledger, "奖励台账不存在");

  const currentStatus = normalizeReferralRewardLedgerOperationalStatus(ledger && ledger.status);
  if (nextStatus === "paid") {
    assertCondition(["payable", "failed"].includes(currentStatus), "只有待打款或打款失败的奖励可以标记为已打款");
  } else {
    assertCondition(["payable", "paid"].includes(currentStatus), "只有待打款或已打款的奖励可以标记为打款失败");
  }

  const now = Date.now();
  const updateData = {
    status: nextStatus,
    payoutMarkedAt: now,
    payoutMarkedBy: getOrderDebugOperatorId(adminUser),
    updatedAt: now
  };
  if (nextStatus === "paid") {
    updateData.paidAt = now;
    updateData.paidAtTs = now;
    updateData.payoutFailureReason = "";
  } else {
    updateData.payoutFailedAt = now;
    updateData.payoutFailureReason = note || "后台标记打款失败";
  }

  await db.collection(COLLECTIONS.referralRewardLedgers).doc(ledgerId).update({
    data: updateData
  });

  return {
    ledgerId,
    status: nextStatus
  };
}

async function listReferralPayoutAccounts(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const [accounts, users] = await Promise.all([
    listOptionalCollection(COLLECTIONS.payoutAccounts),
    listCollection(COLLECTIONS.users)
  ]);
  const userMap = buildUserIdSummaryMap(users);

  const items = normalizeArray(accounts)
    .map((doc) => {
      const userSummary = resolveUserSummaryByUserId(userMap, doc && doc.userId);

      return {
        payoutAccountId: normalizeText(doc && doc._id),
        userId: userSummary.userId,
        userNickname: userSummary.userNickname,
        accountName: normalizeText(doc && doc.accountName),
        accountNameMasked: maskName(doc && doc.accountName),
        phone: normalizeText(doc && doc.phone),
        phoneMasked: maskPhone(doc && doc.phone),
        bankName: normalizeText(doc && doc.bankName),
        bankAccountNo: normalizeText(doc && doc.bankAccountNo),
        bankAccountMasked: maskBankAccount(doc && doc.bankAccountNo),
        idNumberLast4: normalizeText(doc && (
          doc.idNumberLast4
          || doc.idCardLast4
          || doc.identityNumberLast4
          || doc.certificateLast4
        )),
        status: normalizeReferralPayoutAccountOperationalStatus(doc && doc.status),
        rejectionReason: normalizeText(doc && doc.rejectionReason),
        submittedAt: normalizeNumber(doc && doc.submittedAt, 0),
        reviewedAt: normalizeNumber(doc && doc.reviewedAt, 0),
        updatedAt: normalizeNumber(doc && doc.updatedAt, 0)
      };
    })
    .filter((item) => {
      if (status && normalizeText(item.status).toLowerCase() !== status) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [
        item.userNickname,
        item.bankName,
        item.bankAccountMasked,
        item.phoneMasked
      ].some((value) => normalizeText(value).toLowerCase().includes(keyword));
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultSortBy: "submittedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "userNickname":
            return item.userNickname;
          case "status":
            return item.status;
          case "updatedAt":
            return item.updatedAt;
          case "submittedAt":
          default:
            return item.submittedAt;
        }
      },
      getItemKey: (item) => item.payoutAccountId
    });
  }

  return items;
}

function getOrderDebugOperatorId(adminUser) {
  return normalizeText(adminUser && (adminUser.uid || adminUser.id || adminUser.username));
}

function formatSettlementMonth(timestamp) {
  const targetTs = normalizeNumber(timestamp, 0);
  if (!targetTs) {
    return "";
  }

  return formatDateInTimeZone(targetTs, "Asia/Shanghai").slice(0, 7);
}

async function getShareReferralCampaignConfigForDebug() {
  const doc = await readConfig("shareReferralCampaign");
  const value = isPlainObject(doc && doc.value) ? doc.value : {};

  return Object.assign({}, DEFAULT_SHARE_REFERRAL_CONFIG, value);
}

async function getOrderRowByOrderNo(orderNo) {
  const normalizedOrderNo = normalizeText(orderNo);
  assertCondition(normalizedOrderNo, "缺少订单号");

  const rows = await queryRows(
    "SELECT * FROM `TravelOrder` WHERE `orderNo` = {{orderNo}} LIMIT 1",
    { orderNo: normalizedOrderNo }
  );

  return rows[0] || null;
}

async function findOrderDebugRecord(orderNo) {
  const normalizedOrderNo = normalizeText(orderNo);
  if (!normalizedOrderNo) {
    return null;
  }

  try {
    const result = await db.collection(COLLECTIONS.orderDebugRecords)
      .where({ orderNo: normalizedOrderNo })
      .limit(1)
      .get();
    const rows = normalizeArray(result && result.data);
    return rows.find((item) => normalizeText(item && item.orderNo) === normalizedOrderNo) || rows[0] || null;
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return null;
    }

    throw error;
  }
}

function mapOrderDebugRecord(record) {
  return {
    isTestOrder: Boolean(record && record.isTestOrder),
    originalTravelDateEnd: normalizeText(record && record.originalTravelDateEnd),
    originalServiceSnapshotJson: normalizeText(record && record.originalServiceSnapshotJson),
    markedAt: normalizeNumber(record && record.markedAt, 0),
    markedBy: normalizeText(record && record.markedBy),
    updatedAt: normalizeNumber(record && record.updatedAt, 0),
    updatedBy: normalizeText(record && record.updatedBy)
  };
}

async function upsertOrderDebugRecord(orderRecord, adminUser, patch = {}) {
  const orderNo = normalizeText(orderRecord && orderRecord.orderNo);
  assertCondition(orderNo, "缺少订单号");

  const operatorId = getOrderDebugOperatorId(adminUser);
  const now = Date.now();
  const existing = await findOrderDebugRecord(orderNo);
  const nextData = Object.assign(
    {
      orderNo,
      isTestOrder: true,
      originalTravelDateEnd: normalizeText(orderRecord && orderRecord.travelDateEnd),
      originalServiceSnapshotJson: normalizeText(orderRecord && orderRecord.serviceSnapshotJson),
      markedAt: normalizeNumber(existing && existing.markedAt, now),
      markedBy: normalizeText(existing && existing.markedBy) || operatorId
    },
    existing || {},
    patch,
    {
      orderNo,
      isTestOrder: true,
      updatedAt: now,
      updatedBy: operatorId
    }
  );

  if (existing && normalizeText(existing._id)) {
    const updateData = Object.assign({}, nextData);
    delete updateData._id;
    await db.collection(COLLECTIONS.orderDebugRecords).doc(existing._id).update({
      data: updateData
    });
    return Object.assign({}, existing, updateData);
  }

  const createResult = await db.collection(COLLECTIONS.orderDebugRecords).add({
    data: Object.assign({}, nextData, {
      createdAt: now,
      createdBy: operatorId
    })
  });

  return Object.assign({ _id: createResult && createResult._id }, nextData);
}

async function assertOrderIsMarkedForDebug(orderNo) {
  const record = await findOrderDebugRecord(orderNo);
  assertCondition(record && record.isTestOrder, "请先将该订单标记为测试订单");
  return record;
}

async function unmarkOrderDebugRecord(orderNo, adminUser) {
  const normalizedOrderNo = normalizeText(orderNo);
  assertCondition(normalizedOrderNo, "缺少订单号");

  const record = await assertOrderIsMarkedForDebug(normalizedOrderNo);
  const now = Date.now();
  await db.collection(COLLECTIONS.orderDebugRecords).doc(record._id).update({
    data: {
      isTestOrder: false,
      unmarkedAt: now,
      unmarkedBy: getOrderDebugOperatorId(adminUser),
      updatedAt: now,
      updatedBy: getOrderDebugOperatorId(adminUser)
    }
  });

  return Object.assign({}, record, {
    isTestOrder: false,
    unmarkedAt: now,
    unmarkedBy: getOrderDebugOperatorId(adminUser),
    updatedAt: now,
    updatedBy: getOrderDebugOperatorId(adminUser)
  });
}

function mapOrderDebugListItem(record, orderRecord) {
  return {
    orderNo: normalizeText(record && record.orderNo),
    isTestOrder: Boolean(record && record.isTestOrder),
    serviceName: normalizeText(orderRecord && orderRecord.serviceName),
    servicePeriodCode: normalizeText(orderRecord && orderRecord.servicePeriodCode),
    status: normalizeText(orderRecord && orderRecord.status),
    travelDateStart: normalizeText(orderRecord && orderRecord.travelDateStart),
    travelDateEnd: normalizeText(orderRecord && orderRecord.travelDateEnd),
    userOpenid: normalizeText(orderRecord && orderRecord.userOpenid),
    markedAt: normalizeNumber(record && record.markedAt, 0),
    markedBy: normalizeText(record && record.markedBy),
    updatedAt: normalizeNumber(record && record.updatedAt, 0),
    updatedBy: normalizeText(record && record.updatedBy)
  };
}

async function listOrderDebugTestOrders(payload, adminUser) {
  assertOrderDebugToolAccess(adminUser);
  const limit = Math.min(50, clampLimit(payload && payload.limit));
  const records = normalizeArray(await listOptionalCollection(COLLECTIONS.orderDebugRecords))
    .filter((record) => record && record.isTestOrder && normalizeText(record.orderNo))
    .sort((left, right) => normalizeNumber(right.updatedAt || right.markedAt, 0) - normalizeNumber(left.updatedAt || left.markedAt, 0))
    .slice(0, limit);

  const orders = await Promise.all(records.map((record) => getOrderRowByOrderNo(record.orderNo)));
  return records.map((record, index) => mapOrderDebugListItem(record, orders[index]));
}

async function appendOrderDebugEvent(orderRecord, adminUser, source, note) {
  await appendOrderStatusEvent({
    orderNo: orderRecord && orderRecord.orderNo,
    userOpenid: orderRecord && orderRecord.userOpenid,
    status: orderRecord && orderRecord.status,
    fromStatus: orderRecord && orderRecord.status,
    source,
    note,
    operatorId: getOrderDebugOperatorId(adminUser)
  });
}

function isAllowedDebugOrderTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (nextStatus === "paid") {
    return currentStatus === "pending";
  }

  if (nextStatus === "completed") {
    return currentStatus === "paid" || currentStatus === "traveling";
  }

  return false;
}

function buildDebugOrderStatusUpdateData(nextStatus, now) {
  const data = {
    status: nextStatus,
    updatedAt: now
  };

  if (nextStatus === "paid") {
    data.paidAtTs = now;
  }

  return data;
}

async function updateTravelOrderByOrderNo(orderNo, data) {
  const { error } = await rdb
    .from("TravelOrder")
    .update(data)
    .eq("orderNo", orderNo);

  if (error) {
    throw new Error(error.message || "订单更新失败");
  }
}

async function transitionDebugOrderStatus(orderRecord, nextStatus, adminUser, source) {
  const orderNo = normalizeText(orderRecord && orderRecord.orderNo);
  const currentStatus = normalizeText(orderRecord && orderRecord.status);
  assertCondition(orderNo, "缺少订单号");
  assertCondition(isAllowedDebugOrderTransition(currentStatus, nextStatus), "当前订单状态不允许执行该调试动作");

  if (currentStatus === nextStatus) {
    return orderRecord;
  }

  const now = Date.now();
  const updateData = buildDebugOrderStatusUpdateData(nextStatus, now);
  await updateTravelOrderByOrderNo(orderNo, updateData);
  const updatedOrder = Object.assign({}, orderRecord, updateData);
  await appendOrderStatusEvent({
    orderNo,
    userOpenid: orderRecord && orderRecord.userOpenid,
    status: nextStatus,
    fromStatus: currentStatus,
    source,
    operatorId: getOrderDebugOperatorId(adminUser)
  });

  return updatedOrder;
}

function buildOrderServiceSnapshotWithTravelEnd(orderRecord, nextEndDate) {
  const snapshot = parseJsonText(orderRecord && orderRecord.serviceSnapshotJson, {});
  const nextSnapshot = isPlainObject(snapshot) ? cloneJson(snapshot, {}) : {};
  const currentTravelPeriod = isPlainObject(nextSnapshot.travelPeriod) ? nextSnapshot.travelPeriod : {};

  nextSnapshot.travelPeriod = Object.assign({}, currentTravelPeriod, {
    dateStart: normalizeText(currentTravelPeriod.dateStart) || normalizeText(orderRecord && orderRecord.travelDateStart),
    dateEnd: nextEndDate
  });

  return JSON.stringify(nextSnapshot);
}

async function setDebugOrderEndDatePast(orderRecord, adminUser) {
  const orderNo = normalizeText(orderRecord && orderRecord.orderNo);
  const today = getShanghaiTodayDateString();
  const nextEndDate = addDaysToDateString(today, -1);
  const serviceSnapshotJson = buildOrderServiceSnapshotWithTravelEnd(orderRecord, nextEndDate);
  const now = Date.now();
  const updateData = {
    travelDateEnd: nextEndDate,
    travelDateEndDate: nextEndDate,
    serviceSnapshotJson,
    updatedAt: now
  };

  await updateTravelOrderByOrderNo(orderNo, updateData);
  await appendOrderDebugEvent(
    Object.assign({}, orderRecord, updateData),
    adminUser,
    "debug_tool_set_order_end_past",
    `订单结束日期设为 ${nextEndDate}`
  );
  await upsertOrderDebugRecord(orderRecord, adminUser, {
    lastTravelDateEnd: nextEndDate
  });

  return Object.assign({}, orderRecord, updateData);
}

async function findActiveReferralRelationByInviteeUserIdForDebug(inviteeUserId) {
  const normalizedUserId = normalizeText(inviteeUserId);
  if (!normalizedUserId) {
    return null;
  }

  const relations = await listOptionalCollection(COLLECTIONS.referralRelations);
  return normalizeArray(relations).find((item) => (
    normalizeText(item && item.inviteeUserId) === normalizedUserId
    && (normalizeText(item && item.status) || "active") === "active"
  )) || null;
}

async function findRewardLedgerByOrderNoForDebug(orderNo, campaignKey) {
  const normalizedOrderNo = normalizeText(orderNo);
  const normalizedCampaignKey = normalizeText(campaignKey);
  const ledgers = await listOptionalCollection(COLLECTIONS.referralRewardLedgers);

  return normalizeArray(ledgers).find((item) => (
    normalizeText(item && item.sourceOrderNo) === normalizedOrderNo
    && normalizeText(item && item.campaignKey) === normalizedCampaignKey
  )) || null;
}

function buildShareReferralRewardLedgerForDebug(orderRecord, relation, config, now = Date.now()) {
  const normalizedNow = normalizeNumber(now, Date.now());
  const rewardAmount = Math.max(0, normalizeNumber(config && config.cashRewardAmount, DEFAULT_SHARE_REFERRAL_CONFIG.cashRewardAmount));

  return {
    campaignKey: normalizeText(config && config.campaignKey) || DEFAULT_SHARE_REFERRAL_CONFIG.campaignKey,
    campaignName: normalizeText(config && config.campaignName) || DEFAULT_SHARE_REFERRAL_CONFIG.campaignName,
    inviterUserId: normalizeText(relation && relation.inviterUserId),
    inviteeUserId: normalizeText(relation && relation.inviteeUserId),
    relationId: normalizeText(relation && relation._id),
    inviteeOpenid: normalizeText(orderRecord && orderRecord.userOpenid),
    sourceOrderNo: normalizeText(orderRecord && orderRecord.orderNo),
    sourceServiceSlug: normalizeText(orderRecord && orderRecord.serviceSlug),
    serviceName: normalizeText(orderRecord && orderRecord.serviceName),
    travelDateStart: normalizeText(orderRecord && orderRecord.travelDateStart),
    travelDateEnd: normalizeText(orderRecord && orderRecord.travelDateEnd),
    rewardAmount,
    grossAmount: rewardAmount,
    netAmount: rewardAmount,
    status: "awaiting_account",
    settlementMonth: formatSettlementMonth(normalizedNow),
    settlementPlannedDay: Math.max(1, Math.min(28, normalizePositiveInteger(config && config.monthlySettlementDay) || DEFAULT_SHARE_REFERRAL_CONFIG.monthlySettlementDay)),
    earnedAt: normalizedNow,
    updatedAt: normalizedNow,
    createdBy: "debug_tool"
  };
}

async function updateCompletedTravelStatsForDebug(userDoc, occurredAt = Date.now()) {
  const userId = normalizeText(userDoc && userDoc._id);
  if (!userId) {
    return;
  }

  await db.collection(COLLECTIONS.users).doc(userId).update({
    data: {
      effectiveOrderCount: Math.max(1, normalizeNumber(userDoc && userDoc.effectiveOrderCount, 0)),
      effectiveRouteCount: Math.max(1, normalizeNumber(userDoc && userDoc.effectiveRouteCount, 0)),
      lastTravelAt: Math.max(normalizeNumber(userDoc && userDoc.lastTravelAt, 0), normalizeNumber(occurredAt, Date.now())),
      updatedAt: Date.now()
    }
  });
}

async function syncShareReferralRewardForDebugCompletedOrder(orderRecord, adminUser) {
  const orderNo = normalizeText(orderRecord && orderRecord.orderNo);
  assertCondition(orderNo, "缺少订单号");
  assertCondition(normalizeText(orderRecord && orderRecord.status) === "completed", "订单完成后才能结算分享家奖励");

  const inviteeUser = await findUserForDetail({ userOpenid: orderRecord && orderRecord.userOpenid });
  if (!inviteeUser || !normalizeText(inviteeUser._id)) {
    return { created: false, reason: "未找到下单用户" };
  }

  await updateCompletedTravelStatsForDebug(inviteeUser, Date.now());

  const relation = await findActiveReferralRelationByInviteeUserIdForDebug(inviteeUser._id);
  if (!relation) {
    return { created: false, reason: "该下单用户没有有效分享家关系" };
  }

  const config = await getShareReferralCampaignConfigForDebug();
  const campaignKey = normalizeText(config && config.campaignKey) || DEFAULT_SHARE_REFERRAL_CONFIG.campaignKey;
  const existing = await findRewardLedgerByOrderNoForDebug(orderNo, campaignKey);
  if (existing) {
    return { created: false, ledgerId: normalizeText(existing._id), reason: "奖励台账已存在" };
  }

  const ledger = buildShareReferralRewardLedgerForDebug(orderRecord, relation, config, Date.now());
  const createResult = await db.collection(COLLECTIONS.referralRewardLedgers).add({ data: ledger });
  await appendOrderDebugEvent(orderRecord, adminUser, "debug_tool_settle_referral_reward", "触发分享家奖励结算");

  return {
    created: true,
    ledgerId: normalizeText(createResult && createResult._id)
  };
}

function mapDebugServicePeriod(periodRecord) {
  if (!periodRecord) {
    return null;
  }

  return {
    periodCode: normalizeText(periodRecord.periodCode),
    serviceSlug: normalizeText(periodRecord.serviceSlug),
    serviceName: normalizeText(periodRecord.serviceName),
    versionName: normalizeText(periodRecord.versionName),
    dateStart: normalizeText(periodRecord.dateStart),
    dateEnd: normalizeText(periodRecord.dateEnd),
    status: normalizeText(periodRecord.status),
    updatedAt: normalizeNumber(periodRecord.updatedAt, 0)
  };
}

async function getOrderDebugToolDetail(payload, adminUser) {
  assertOrderDebugToolAccess(adminUser);
  const orderNo = normalizeText(payload && payload.orderNo);
  assertCondition(orderNo, "请输入订单号");

  const order = await getOrderDetail({ orderNo }, adminUser);
  const [rawOrder, debugRecord, periodRecord, rewardPage] = await Promise.all([
    getOrderRowByOrderNo(orderNo),
    findOrderDebugRecord(orderNo),
    order && order.servicePeriodCode ? findServicePeriodByCode(order.servicePeriodCode) : Promise.resolve(null),
    listReferralRewardLedgers({ keyword: orderNo })
  ]);

  return {
    toolEnabled: isOrderDebugToolEnabled(),
    envId: getCurrentEnvId(),
    order,
    rawOrder: {
      travelDateEnd: normalizeText(rawOrder && rawOrder.travelDateEnd),
      serviceSnapshotJson: normalizeText(rawOrder && rawOrder.serviceSnapshotJson)
    },
    servicePeriod: mapDebugServicePeriod(periodRecord),
    debug: mapOrderDebugRecord(debugRecord),
    rewardLedgers: normalizeArray(rewardPage).filter((item) => normalizeText(item && item.sourceOrderNo) === orderNo)
  };
}

async function handleOrderDebugToolAction(payload, adminUser) {
  assertOrderDebugToolAccess(adminUser);
  const action = normalizeText(payload && payload.action);
  const orderNo = normalizeText(payload && payload.orderNo);
  assertCondition(ORDER_DEBUG_MUTATION_ACTIONS.has(action), "不支持的订单调试动作");

  if (action === "mockPayout") {
    const ledgerId = normalizeText(payload && payload.ledgerId);
    const payoutStatus = normalizeText(payload && payload.payoutStatus).toLowerCase();
    assertCondition(ledgerId, "请选择奖励台账");
    assertCondition(ORDER_DEBUG_PAYOUT_STATUSES.has(payoutStatus), "不支持的模拟打款状态");

    const ledgerResult = await db.collection(COLLECTIONS.referralRewardLedgers).doc(ledgerId).get();
    const ledger = ledgerResult && ledgerResult.data ? ledgerResult.data : null;
    assertCondition(ledger, "未找到奖励台账");
    const ledgerOrderNo = normalizeText(ledger && ledger.sourceOrderNo);
    await assertOrderIsMarkedForDebug(ledgerOrderNo);
    const now = Date.now();
    await db.collection(COLLECTIONS.referralRewardLedgers).doc(ledgerId).update({
      data: {
        status: payoutStatus,
        payoutBatchId: normalizeText(ledger && ledger.payoutBatchId) || `debug-${ledgerOrderNo || ledgerId}`,
        payoutMockedAt: now,
        payoutMockedBy: getOrderDebugOperatorId(adminUser),
        updatedAt: now
      }
    });
    const debugOrder = await getOrderRowByOrderNo(ledgerOrderNo);
    if (debugOrder) {
      await appendOrderDebugEvent(debugOrder, adminUser, `debug_tool_mock_payout_${payoutStatus}`, `模拟打款状态：${payoutStatus}`);
    }
    return getOrderDebugToolDetail({ orderNo: ledgerOrderNo }, adminUser);
  }

  const orderRecord = await getOrderRowByOrderNo(orderNo);
  assertCondition(orderRecord, "未找到对应订单");

  if (action === "markTestOrder") {
    await upsertOrderDebugRecord(orderRecord, adminUser);
    await appendOrderDebugEvent(orderRecord, adminUser, "debug_tool_mark_test_order", "标记为测试订单");
    return getOrderDebugToolDetail({ orderNo }, adminUser);
  }

  if (action === "unmarkTestOrder") {
    await unmarkOrderDebugRecord(orderNo, adminUser);
    await appendOrderDebugEvent(orderRecord, adminUser, "debug_tool_unmark_test_order", "取消测试订单标记");
    return getOrderDebugToolDetail({ orderNo }, adminUser);
  }

  await assertOrderIsMarkedForDebug(orderNo);

  if (action === "confirmOrder") {
    const updatedOrder = await transitionDebugOrderStatus(orderRecord, "paid", adminUser, "debug_tool_confirm_order");
    return getOrderDebugToolDetail({ orderNo: updatedOrder.orderNo }, adminUser);
  }

  if (action === "setOrderEndDatePast") {
    const updatedOrder = await setDebugOrderEndDatePast(orderRecord, adminUser);
    return getOrderDebugToolDetail({ orderNo: updatedOrder.orderNo }, adminUser);
  }

  if (action === "runAutoComplete") {
    const endDate = normalizeText(orderRecord.travelDateEnd || orderRecord.travelDateStart);
    const today = getShanghaiTodayDateString();
    assertCondition(normalizeText(orderRecord.status) === "completed" || endDate < today, "订单结束日期尚未早于今天，不能自动完成");
    const completedOrder = normalizeText(orderRecord.status) === "completed"
      ? orderRecord
      : await transitionDebugOrderStatus(orderRecord, "completed", adminUser, "debug_tool_auto_complete_order");
    await syncShareReferralRewardForDebugCompletedOrder(completedOrder, adminUser);
    return getOrderDebugToolDetail({ orderNo: completedOrder.orderNo }, adminUser);
  }

  if (action === "settleReward") {
    await syncShareReferralRewardForDebugCompletedOrder(orderRecord, adminUser);
    return getOrderDebugToolDetail({ orderNo }, adminUser);
  }

  throw new Error("不支持的订单调试动作");
}

async function listOrders(payload, adminUser) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const userId = normalizeText(payload && payload.userId);
  const status = normalizeText(payload && payload.status).toLowerCase();
  const servicePeriodCode = normalizeText(payload && payload.servicePeriodCode);
  const travelerRecordId = normalizeText(payload && (payload.travelerRecordId || payload.travelerId || payload._id));
  const travelerProfileId = normalizeText(payload && (payload.travelerProfileId || payload.profileId));
  const limit = clampLimit(payload && payload.limit);
  const [rows, users, orderEventDocs, travelerDocs, services, creators] = await Promise.all([
    queryRows(
      "SELECT `orderNo`, `userOpenid`, `serviceSlug`, `serviceName`, `servicePeriodCode`, `travelDateStart`, `status`, `versionName`, `peopleCountInt`, `createdAtTs`, `paidAtTs`, `canceledAtTs`, `updatedAt`, `payExpireAtTs`, `amount`, `amountDec`, `payable`, `payableDec`, `priceAdjustmentAmount`, `priceAdjustmentReason`, `priceAdjustedAtTs`, `priceAdjustedBy`, `travelersJson`, `creatorSnapshotJson`, `serviceSnapshotJson` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT 200"
    ),
    listCollection(COLLECTIONS.users),
    listOptionalCollection(ORDER_EVENTS_COLLECTION),
    listCollection(COLLECTIONS.userTravelers),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);
  const userMap = buildOrderUserMap(users);
  const travelerLookup = buildTravelerProfileLookup(travelerDocs);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  const targetTravelerDoc = normalizeArray(travelerDocs).find((doc) => {
    const docRecordId = normalizeText(doc && doc._id);
    const docProfileId = normalizeText(doc && (doc.profileId || doc.travelerId));

    if (travelerRecordId && docRecordId === travelerRecordId) {
      return true;
    }

    return Boolean(travelerProfileId && docProfileId === travelerProfileId);
  }) || null;
  const targetTravelerState = targetTravelerDoc
    ? buildTravelerBackfillStateByUser([targetTravelerDoc])[normalizeText(targetTravelerDoc && targetTravelerDoc.userOpenid)]
    : null;
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

  const items = rows
    .map((row) => {
      const userSummary = resolveOrderUserSummary(userMap, row.userOpenid);
      const statusLogs = buildOrderStatusLogs(row, orderEventMap[normalizeText(row.orderNo)]);
      return {
        row,
        userSummary,
        updatedAtTs: resolveLastOrderUpdateTs(row, statusLogs)
      };
    })
    .filter(({ row, userSummary }) => {
      if (!canAccessOrderForAdmin(row, adminUser, creatorRefSet, serviceMap)) {
        return false;
      }

      if (travelerRecordId || travelerProfileId) {
        if (!targetTravelerDoc) {
          return false;
        }

        const matchedTraveler = normalizeArray(parseJsonText(row && row.travelersJson, []))
          .map((item) => ({
            rawTraveler: item,
            traveler: normalizeTravelerSnapshot(item)
          }))
          .some(({ rawTraveler, traveler }) => {
            const matchedDoc = matchTravelerProfileDoc(traveler, travelerLookup, row && row.userOpenid)
              || (resolveTravelerProfileBackfillMatch(rawTraveler, traveler, row && row.userOpenid, targetTravelerState).doc || null);

            if (!matchedDoc) {
              return false;
            }

            const matchedRecordId = normalizeText(matchedDoc && matchedDoc._id);
            const matchedProfileId = normalizeText(matchedDoc && (matchedDoc.profileId || matchedDoc.travelerId));

            return matchedRecordId === normalizeText(targetTravelerDoc && targetTravelerDoc._id)
              || matchedProfileId === normalizeText(targetTravelerDoc && (targetTravelerDoc.profileId || targetTravelerDoc.travelerId));
          });

        if (!matchedTraveler) {
          return false;
        }
      }

      return (
      (!userId || userSummary.userId === userId)
      && (!servicePeriodCode || normalizeText(row.servicePeriodCode) === servicePeriodCode)
      && (!status || status === "all" || normalizeText(row.status).toLowerCase() === status)
      && matchesKeyword(
        [row.orderNo, row.serviceName, row.serviceSlug, row.servicePeriodCode, row.travelDateStart, row.versionName, row.status, formatDashboardStatusLabel(row.status), userSummary.userNickname, userSummary.userId],
        keyword
      )
      );
    })
    .map(({ row, userSummary, updatedAtTs }) => ({
      orderNo: normalizeText(row.orderNo),
      serviceSlug: normalizeText(row.serviceSlug),
      serviceName: normalizeText(row.serviceName),
      servicePeriodCode: normalizeText(row.servicePeriodCode),
      travelDateStart: normalizeText(row.travelDateStart),
      status: normalizeText(row.status),
      versionName: normalizeText(row.versionName),
      userId: userSummary.userId,
      userNickname: userSummary.userNickname,
      peopleCount: normalizeNumber(row.peopleCountInt),
      amount: normalizeNumber(row.amountDec || row.amount),
      payable: normalizeNumber(row.payableDec || row.payable),
      payExpireAtTs: getOrderPaymentExpireAtTs(row),
      priceAdjustmentAmount: normalizeNumber(row.priceAdjustmentAmount, 0),
      priceAdjustmentReason: normalizeText(row.priceAdjustmentReason),
      priceAdjustedAtTs: normalizeNumber(row.priceAdjustedAtTs, 0),
      priceAdjustedBy: normalizeText(row.priceAdjustedBy),
      updatedAtTs
    }));

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAtTs",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "userNickname":
            return item.userNickname;
          case "serviceName":
            return item.serviceName;
          case "versionName":
            return item.versionName;
          case "travelDateStart":
            return item.travelDateStart;
          case "updatedAtTs":
            return item.updatedAtTs;
          case "status":
            return item.status;
          default:
            return item.updatedAtTs;
        }
      },
      getItemKey: (item) => item.orderNo
    });
  }

  return items.slice(0, limit);
}

function getOrderPaymentExpireAtTs(orderRecord) {
  const explicitExpireAt = normalizeNumber(orderRecord && orderRecord.payExpireAtTs, 0);
  if (explicitExpireAt > 0) {
    return explicitExpireAt;
  }

  const createdAtTs = normalizeNumber(orderRecord && (orderRecord.createdAtTs || orderRecord.createdAt), 0);
  return createdAtTs > 0 ? createdAtTs + ORDER_PAYMENT_EXPIRE_MS : 0;
}

function isPendingOrderPaymentExpired(orderRecord, now = Date.now()) {
  if (!orderRecord || normalizeText(orderRecord.status) !== "pending") {
    return false;
  }

  const expireAtTs = getOrderPaymentExpireAtTs(orderRecord);
  return expireAtTs > 0 && expireAtTs <= now;
}

async function getOrderDetail(payload, adminUser) {
  const orderNo = normalizeText(payload && payload.orderNo);
  assertCondition(orderNo, "缺少订单号");

  const rows = await queryRows(
    "SELECT * FROM `TravelOrder` WHERE `orderNo` = {{orderNo}} LIMIT 1",
    { orderNo }
  );
  const row = rows[0];
  assertCondition(row, "未找到对应订单");
  const [users, orderEventDocs, travelerDocs, services, creators] = await Promise.all([
    listCollection(COLLECTIONS.users),
    listOptionalCollection(ORDER_EVENTS_COLLECTION),
    listCollection(COLLECTIONS.userTravelers),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  assertCondition(canAccessOrderForAdmin(row, adminUser, creatorRefSet, serviceMap), "未找到对应订单");
  const userSummary = resolveOrderUserSummary(buildOrderUserMap(users), row.userOpenid);
  const statusLogs = buildOrderStatusLogs(
    row,
    normalizeArray(orderEventDocs).filter((doc) => normalizeText(doc && doc.orderNo) === orderNo)
  );
  const travelerLookup = buildTravelerProfileLookup(travelerDocs);
  const travelers = normalizeArray(parseJsonText(row.travelersJson, []))
    .map(normalizeTravelerSnapshot)
    .map((traveler) => {
      const matchedDoc = matchTravelerProfileDoc(traveler, travelerLookup, row.userOpenid);
      return Object.assign({}, traveler, {
        matchedTravelerRecordId: normalizeText(matchedDoc && matchedDoc._id) || normalizeText(traveler.travelerRecordId),
        matchedProfileId: normalizeText(matchedDoc && (matchedDoc.profileId || matchedDoc.travelerId)) || normalizeText(traveler.profileId),
        isLinkedToTravelerProfile: Boolean(
          normalizeText(matchedDoc && matchedDoc._id)
          || normalizeText(traveler.travelerRecordId)
          || normalizeText(traveler.profileId)
        )
      });
    });
  const serviceSnapshot = parseJsonText(row.serviceSnapshotJson, {}) || {};
  const snapshotSingleRoom =
    serviceSnapshot && typeof serviceSnapshot.singleRoom === "object" && serviceSnapshot.singleRoom !== null
      ? serviceSnapshot.singleRoom
      : {};
  const orderContactName = normalizeText(row.orderContactName || row.travelerName);
  const orderContactPhone = normalizeText(row.orderContactPhone || row.travelerPhone);
  const emergencyContactName = normalizeText(row.emergencyContactName || orderContactName);
  const emergencyContactPhone = normalizeText(row.emergencyContactPhone || orderContactPhone);
  const normalizedServiceSnapshot = {
    ...serviceSnapshot,
    contact:
      serviceSnapshot && typeof serviceSnapshot.contact === "object" && serviceSnapshot.contact !== null
        ? {
            name: normalizeText(serviceSnapshot.contact.name || orderContactName),
            phone: normalizeText(serviceSnapshot.contact.phone || orderContactPhone)
          }
        : {
            name: orderContactName,
            phone: orderContactPhone
          },
    travelers:
      Array.isArray(serviceSnapshot.travelers) && serviceSnapshot.travelers.length
        ? serviceSnapshot.travelers
          .map(normalizeTravelerSnapshot)
          .map((traveler) => {
            const matchedDoc = matchTravelerProfileDoc(traveler, travelerLookup, row.userOpenid);
            return Object.assign({}, traveler, {
              matchedTravelerRecordId: normalizeText(matchedDoc && matchedDoc._id) || normalizeText(traveler.travelerRecordId),
              matchedProfileId: normalizeText(matchedDoc && (matchedDoc.profileId || matchedDoc.travelerId)) || normalizeText(traveler.profileId),
              isLinkedToTravelerProfile: Boolean(
                normalizeText(matchedDoc && matchedDoc._id)
                || normalizeText(traveler.travelerRecordId)
                || normalizeText(traveler.profileId)
              )
            });
          })
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
    payExpireAtTs: getOrderPaymentExpireAtTs(row),
    priceAdjustmentAmount: normalizeNumber(row.priceAdjustmentAmount, 0),
    priceAdjustmentReason: normalizeText(row.priceAdjustmentReason),
    priceAdjustedAtTs: normalizeNumber(row.priceAdjustedAtTs, 0),
    priceAdjustedBy: normalizeText(row.priceAdjustedBy),
    orderContactName,
    orderContactPhone,
    travelerName: normalizeText(row.travelerName || orderContactName),
    travelerPhone: normalizeText(row.travelerPhone || orderContactPhone),
    emergencyContactName,
    emergencyContactPhone,
    roomingMode:
      normalizeText(row.roomingMode)
      || (normalizeBoolean(snapshotSingleRoom.requested) ? "singleRoomRequest" : "random"),
    roommateName: normalizeText(row.roommateName),
    roomType: normalizeText(row.roomType),
    singleRoomPrice: Math.max(0, normalizeNumber(row.singleRoomPriceDec || row.singleRoomPrice || snapshotSingleRoom.price, 0)),
    singleRoomStatus: normalizeText(row.singleRoomStatus || snapshotSingleRoom.status),
    singleRoomNotice: normalizeText(row.singleRoomNotice || snapshotSingleRoom.notice),
    allergyNotes: normalizeText(row.allergyNotes),
    couponId: normalizeText(row.couponId),
    couponSnapshot: parseJsonText(row.couponSnapshotJson, {}) || {},
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

function normalizeOrderPayableInput(value) {
  const amount = Math.round(normalizeNumber(value, NaN) * 100) / 100;
  assertCondition(Number.isFinite(amount) && amount > 0, "请填写有效的订单价格");
  return amount;
}

function resolveOrderPriceOperatorId(adminUser) {
  return normalizeText(
    adminUser && (
      adminUser.uid
      || adminUser.id
      || adminUser.username
      || adminUser.email
      || adminUser.realName
    )
  ) || "admin";
}

async function adjustOrderPrice(payload, adminUser) {
  const orderNo = normalizeText(payload && payload.orderNo);
  const nextPayable = normalizeOrderPayableInput(payload && (payload.payable != null ? payload.payable : payload.amount));
  const reason = normalizeText(payload && payload.reason).slice(0, 256);
  assertCondition(orderNo, "缺少订单号");

  const rows = await queryRows(
    "SELECT * FROM `TravelOrder` WHERE `orderNo` = {{orderNo}} LIMIT 1",
    { orderNo }
  );
  const row = rows[0];
  assertCondition(row, "未找到对应订单");

  const [services, creators] = await Promise.all([
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  assertCondition(canAccessOrderForAdmin(row, adminUser, creatorRefSet, serviceMap), "未找到对应订单");
  assertCondition(normalizeText(row.status) === "pending", "只有待支付订单可以改价");
  assertCondition(!isPendingOrderPaymentExpired(row), "订单待支付时间已过，不能改价");

  const previousPayable = Math.round(normalizeNumber(row.payableDec != null ? row.payableDec : row.payable, 0) * 100) / 100;
  assertCondition(previousPayable > 0, "订单原价格无效，不能改价");
  assertCondition(Math.round(previousPayable * 100) !== Math.round(nextPayable * 100), "新价格与当前价格一致");

  const now = Date.now();
  const operatorId = resolveOrderPriceOperatorId(adminUser);
  const priceAdjustmentAmount = Math.round((nextPayable - previousPayable) * 100) / 100;

  await executeSQL(
    "UPDATE `TravelOrder` SET `payable` = {{payable}}, `payableDec` = {{payable}}, `priceAdjustmentAmount` = {{priceAdjustmentAmount}}, `priceAdjustmentReason` = {{priceAdjustmentReason}}, `priceAdjustedAtTs` = {{priceAdjustedAtTs}}, `priceAdjustedBy` = {{priceAdjustedBy}}, `updatedAt` = {{updatedAt}} WHERE `orderNo` = {{orderNo}} AND `status` = 'pending' LIMIT 1",
    {
      orderNo,
      payable: nextPayable,
      priceAdjustmentAmount,
      priceAdjustmentReason: reason,
      priceAdjustedAtTs: now,
      priceAdjustedBy: operatorId,
      updatedAt: now
    }
  );

  await appendOrderStatusEvent({
    orderNo,
    userOpenid: row.userOpenid,
    status: "pending",
    fromStatus: "pending",
    source: "price_adjustment",
    note: reason
      ? `改价：${previousPayable.toFixed(2)} -> ${nextPayable.toFixed(2)}；${reason}`
      : `改价：${previousPayable.toFixed(2)} -> ${nextPayable.toFixed(2)}`,
    operatorId
  });

  return getOrderDetail({ orderNo }, adminUser);
}

function mapTravelerProfileForAdmin(doc) {
  const documents = normalizeArray(doc && doc.documents)
    .map((item) => ({
      documentType: normalizeText(item && item.documentType),
      documentNumberMasked: maskIdNumber(item && item.documentNumber)
    }))
    .filter((item) => item.documentType || item.documentNumberMasked);
  const primaryDocument = documents[0] || null;
  const allDocumentTypes = documents.map((item) => normalizeText(item && item.documentType)).filter(Boolean);
  const allDocumentNumbers = documents.map((item) => normalizeText(item && item.documentNumberMasked)).filter(Boolean);
  const idType = allDocumentTypes.length
    ? allDocumentTypes.join(" / ")
    : (normalizeText(doc && doc.idType) || normalizeText(primaryDocument && primaryDocument.documentType));
  const idNumberMasked = allDocumentNumbers.length
    ? allDocumentNumbers.join(" / ")
    : (normalizeText(doc && doc.idNumberMasked)
      || normalizeText(primaryDocument && primaryDocument.documentNumberMasked)
      || maskIdNumber(doc && doc.idNumber));
  return {
    travelerRecordId: normalizeText(doc && doc._id),
    travelerId: normalizeText(doc && (doc.travelerId || doc.profileId)),
    profileId: normalizeText(doc && (doc.profileId || doc.travelerId)),
    name: normalizeText(doc && doc.name),
    phoneMasked: normalizeText(doc && doc.phoneMasked) || maskPhone(doc && doc.phone),
    wechat: normalizeText(doc && doc.wechat),
    email: normalizeText(doc && doc.email),
    idType,
    idNumberMasked,
    gender: normalizeText(doc && doc.gender),
    birthday: normalizeText(doc && doc.birthday),
    status: normalizeText(doc && doc.status) || "active",
    source: normalizeText(doc && doc.source),
    version: normalizeNumber(doc && doc.version, 1),
    updatedAt: normalizeNumber(doc && doc.updatedAt),
    lastUsedAt: normalizeNumber(doc && doc.lastUsedAt),
    documents
  };
}

function mapTravelerProfileDetailForAdmin(doc, userSummary, relation) {
  const source = doc && typeof doc === "object" ? doc : {};
  const documents = normalizeArray(source.documents)
    .map((item) => ({
      documentType: normalizeText(item && item.documentType),
      documentNumber: normalizeText(item && item.documentNumber)
    }))
    .filter((item) => item.documentType || item.documentNumber);
  const relationSummary = relation && typeof relation === "object" ? relation : {};

  return {
    travelerRecordId: normalizeText(source && source._id),
    travelerId: normalizeText(source && (source.travelerId || source.profileId)),
    profileId: normalizeText(source && (source.profileId || source.travelerId)),
    userId: normalizeText(source && source.userId) || normalizeText(userSummary && userSummary.userId),
    userOpenid: normalizeText(source && source.userOpenid),
    userNickname: normalizeText(userSummary && userSummary.userNickname) || "旅人",
    name: normalizeText(source && source.name),
    gender: normalizeText(source && source.gender),
    birthday: normalizeText(source && source.birthday),
    phone: normalizeText(source && source.phone),
    phoneMasked: normalizeText(source && source.phoneMasked) || maskPhone(source && source.phone),
    wechat: normalizeText(source && source.wechat),
    email: normalizeText(source && source.email),
    note: normalizeText(source && source.note),
    documents,
    idType: normalizeText(source && source.idType),
    idNumber: normalizeText(source && source.idNumber),
    idNumberMasked: normalizeText(source && source.idNumberMasked) || maskIdNumber(source && source.idNumber),
    status: normalizeText(source && source.status) || "active",
    source: normalizeText(source && source.source) || "traveler_profile",
    version: normalizeNumber(source && source.version, 1),
    createdAt: normalizeNumber(source && source.createdAt),
    updatedAt: normalizeNumber(source && source.updatedAt),
    lastUsedAt: normalizeNumber(source && source.lastUsedAt),
    relatedOrderCount: normalizeNumber(relationSummary.relatedOrderCount ?? source.relatedOrderCount),
    lastRelatedOrderNo: normalizeText(relationSummary.lastRelatedOrderNo || source.lastRelatedOrderNo),
    lastRelatedOrderStatus: normalizeText(relationSummary.lastRelatedOrderStatus || source.lastRelatedOrderStatus),
    lastRelatedOrderAt: normalizeNumber(relationSummary.lastRelatedOrderAt ?? source.lastRelatedOrderAt),
    lastRelatedServiceName: normalizeText(relationSummary.lastRelatedServiceName || source.lastRelatedServiceName),
    relatedOrders: normalizeArray(relationSummary.relatedOrders)
  };
}

function buildTravelerProfileScopedKey(userOpenid, profileId) {
  const normalizedOpenid = normalizeText(userOpenid);
  const normalizedProfileId = normalizeText(profileId);
  return normalizedOpenid && normalizedProfileId ? `${normalizedOpenid}::${normalizedProfileId}` : "";
}

function buildTravelerProfileLookup(records) {
  return normalizeArray(records).reduce((result, doc) => {
    const recordId = normalizeText(doc && doc._id);
    const profileId = normalizeText(doc && (doc.profileId || doc.travelerId));
    const scopedProfileKey = buildTravelerProfileScopedKey(doc && doc.userOpenid, profileId);

    if (recordId) {
      result.byRecordId[recordId] = doc;
    }

    if (profileId) {
      const previousByProfileId = result.byProfileId[profileId];
      if (
        !previousByProfileId
        || normalizeNumber(doc && doc.updatedAt) > normalizeNumber(previousByProfileId && previousByProfileId.updatedAt)
      ) {
        result.byProfileId[profileId] = doc;
      }
    }

    if (scopedProfileKey) {
      const previousByScopedKey = result.byScopedProfileKey[scopedProfileKey];
      if (
        !previousByScopedKey
        || normalizeNumber(doc && doc.updatedAt) > normalizeNumber(previousByScopedKey && previousByScopedKey.updatedAt)
      ) {
        result.byScopedProfileKey[scopedProfileKey] = doc;
      }
    }

    return result;
  }, {
    byRecordId: {},
    byProfileId: {},
    byScopedProfileKey: {}
  });
}

function matchTravelerProfileDoc(snapshot, lookup, userOpenid) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const resolvedLookup = lookup && typeof lookup === "object" ? lookup : {
    byRecordId: {},
    byProfileId: {},
    byScopedProfileKey: {}
  };
  const recordId = normalizeText(source.travelerRecordId || source.rid);
  if (recordId && resolvedLookup.byRecordId[recordId]) {
    return resolvedLookup.byRecordId[recordId];
  }

  const profileId = normalizeText(source.profileId || source.pid || source.travelerId);
  if (!profileId) {
    return null;
  }

  const scopedProfileKey = buildTravelerProfileScopedKey(userOpenid, profileId);
  return resolvedLookup.byScopedProfileKey[scopedProfileKey] || resolvedLookup.byProfileId[profileId] || null;
}

function buildTravelerRelatedOrderItem(row) {
  const updatedAtTs = normalizeNumber(row && (row.updatedAt || row.createdAtTs));
  return {
    orderNo: normalizeText(row && row.orderNo),
    serviceSlug: normalizeText(row && row.serviceSlug),
    serviceName: normalizeText(row && row.serviceName),
    servicePeriodCode: normalizeText(row && row.servicePeriodCode),
    versionName: normalizeText(row && row.versionName),
    status: normalizeText(row && row.status),
    travelDateStart: normalizeText(row && row.travelDateStart),
    travelDateEnd: normalizeText(row && row.travelDateEnd),
    updatedAtTs
  };
}

function buildTravelerRelationMaps(orderRows, travelerDocs) {
  const lookup = buildTravelerProfileLookup(travelerDocs);
  const travelerStateByUser = buildTravelerBackfillStateByUser(travelerDocs);
  const statsByRecordId = {};
  const ordersByRecordId = {};

  normalizeArray(orderRows).forEach((row) => {
    const userOpenid = normalizeText(row && row.userOpenid);
    const userState = travelerStateByUser[userOpenid];
    const relatedOrder = buildTravelerRelatedOrderItem(row);
    const relatedOrderTs = normalizeNumber(relatedOrder.updatedAtTs);
    const matchedRecordIds = new Set();

    normalizeArray(parseJsonText(row && row.travelersJson, []))
      .forEach((item) => {
        const traveler = normalizeTravelerSnapshot(item);
        const matchedDoc = matchTravelerProfileDoc(traveler, lookup, userOpenid)
          || (resolveTravelerProfileBackfillMatch(item, traveler, userOpenid, userState).doc || null);
        const recordId = normalizeText(matchedDoc && matchedDoc._id);
        if (!recordId || matchedRecordIds.has(recordId)) {
          return;
        }

        matchedRecordIds.add(recordId);
        if (!ordersByRecordId[recordId]) {
          ordersByRecordId[recordId] = [];
        }
        ordersByRecordId[recordId].push(relatedOrder);

        if (!statsByRecordId[recordId]) {
          statsByRecordId[recordId] = {
            relatedOrderCount: 0,
            lastRelatedOrderNo: "",
            lastRelatedOrderStatus: "",
            lastRelatedOrderAt: 0,
            lastRelatedServiceName: ""
          };
        }

        statsByRecordId[recordId].relatedOrderCount += 1;
        if (relatedOrderTs >= normalizeNumber(statsByRecordId[recordId].lastRelatedOrderAt)) {
          statsByRecordId[recordId] = {
            relatedOrderCount: statsByRecordId[recordId].relatedOrderCount,
            lastRelatedOrderNo: relatedOrder.orderNo,
            lastRelatedOrderStatus: relatedOrder.status,
            lastRelatedOrderAt: relatedOrderTs,
            lastRelatedServiceName: relatedOrder.serviceName
          };
        }
      });
  });

  Object.keys(ordersByRecordId).forEach((recordId) => {
    ordersByRecordId[recordId] = normalizeArray(ordersByRecordId[recordId]).sort(
      (left, right) => normalizeNumber(right && right.updatedAtTs) - normalizeNumber(left && left.updatedAtTs)
    );
  });

  return {
    statsByRecordId,
    ordersByRecordId
  };
}

function isSoldOrderStatus(status) {
  return ["paid", "traveling", "completed"].includes(normalizeText(status));
}

function resolveTravelerRelationSummary(doc, relationMaps, options) {
  const usePersistedFallback = !isPlainObject(options) || options.usePersistedFallback !== false;
  const recordId = normalizeText(doc && doc._id);
  const relationStats = relationMaps && relationMaps.statsByRecordId
    ? relationMaps.statsByRecordId[recordId]
    : null;
  const relatedOrders = relationMaps && relationMaps.ordersByRecordId
    ? normalizeArray(relationMaps.ordersByRecordId[recordId])
    : [];

  return {
    relatedOrderCount: usePersistedFallback
      ? normalizeNumber(relationStats && relationStats.relatedOrderCount, normalizeNumber(doc && doc.relatedOrderCount))
      : normalizeNumber(relationStats && relationStats.relatedOrderCount, 0),
    lastRelatedOrderNo: usePersistedFallback
      ? normalizeText(relationStats && relationStats.lastRelatedOrderNo || doc && doc.lastRelatedOrderNo)
      : normalizeText(relationStats && relationStats.lastRelatedOrderNo),
    lastRelatedOrderStatus: usePersistedFallback
      ? normalizeText(relationStats && relationStats.lastRelatedOrderStatus || doc && doc.lastRelatedOrderStatus)
      : normalizeText(relationStats && relationStats.lastRelatedOrderStatus),
    lastRelatedOrderAt: usePersistedFallback
      ? normalizeNumber(relationStats && relationStats.lastRelatedOrderAt, normalizeNumber(doc && doc.lastRelatedOrderAt))
      : normalizeNumber(relationStats && relationStats.lastRelatedOrderAt, 0),
    lastRelatedServiceName: usePersistedFallback
      ? normalizeText(relationStats && relationStats.lastRelatedServiceName || doc && doc.lastRelatedServiceName)
      : normalizeText(relationStats && relationStats.lastRelatedServiceName),
    relatedOrders
  };
}

function mapEffectiveOrderItem(row) {
  const rawTravelers = normalizeArray(parseJsonText(row && row.travelersJson, []))
    .map((item) => normalizeTravelerSnapshot(item));
  const travelers = rawTravelers
    .map((item) => ({
      name: item.name,
      phoneMasked: maskPhone(item.phone),
      documentType: item.documentType,
      documentNumberMasked: maskIdNumber(item.documentNumber),
      gender: item.gender,
      birthday: item.birthday
    }));
  const updatedAtTs = normalizeNumber(row && (row.updatedAt || row.createdAtTs));
  const orderContactName = normalizeText(row && (row.orderContactName || row.travelerName));
  const orderContactPhone = normalizeText(row && (row.orderContactPhone || row.travelerPhone));
  return {
    orderNo: normalizeText(row && row.orderNo),
    serviceSlug: normalizeText(row && row.serviceSlug),
    serviceName: normalizeText(row && row.serviceName),
    servicePeriodCode: normalizeText(row && row.servicePeriodCode),
    status: normalizeText(row && row.status),
    peopleCount: normalizeNumber(row && (row.peopleCountInt || row.peopleCount)),
    amount: normalizeNumber(row && (row.amountDec || row.amount)),
    travelDateStart: normalizeText(row && row.travelDateStart),
    travelDateEnd: normalizeText(row && row.travelDateEnd),
    orderContactName,
    orderContactPhoneMasked: maskPhone(orderContactPhone),
    travelerName: orderContactName,
    travelerPhoneMasked: maskPhone(orderContactPhone),
    updatedAtTs,
    createdAtTs: normalizeNumber(row && row.createdAtTs),
    travelers,
    rawTravelers
  };
}

function buildRouteHistory(effectiveOrders) {
  const map = {};
  normalizeArray(effectiveOrders).forEach((item) => {
    const serviceSlug = normalizeText(item && item.serviceSlug);
    if (!serviceSlug) {
      return;
    }

    if (!map[serviceSlug]) {
      map[serviceSlug] = {
        serviceSlug,
        serviceName: normalizeText(item && item.serviceName),
        orderCount: 0,
        lastOrderAt: 0
      };
    }

    map[serviceSlug].orderCount += 1;
    map[serviceSlug].lastOrderAt = Math.max(
      map[serviceSlug].lastOrderAt,
      normalizeNumber(item && (item.updatedAtTs || item.createdAtTs))
    );
    if (!map[serviceSlug].serviceName) {
      map[serviceSlug].serviceName = normalizeText(item && item.serviceName);
    }
  });

  return Object.values(map).sort((left, right) => right.lastOrderAt - left.lastOrderAt);
}

function buildTravelerFingerprint(userOpenid, traveler) {
  const documentNumber = normalizeText(traveler && (traveler.documentNumber || traveler.idCard)).replace(/\s+/g, "");
  const phone = normalizeText(traveler && traveler.phone).replace(/\s+/g, "");
  const name = normalizeText(traveler && traveler.name);
  const base = `${normalizeText(userOpenid)}|${documentNumber || phone}|${name}`;
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = ((hash << 5) - hash) + base.charCodeAt(index);
    hash |= 0;
  }
  return `hist_${Math.abs(hash).toString(36)}`;
}

function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function appendBackfillSample(samples, item, maxSize = 20) {
  if (Array.isArray(samples) && samples.length < maxSize) {
    samples.push(item);
  }
}

function buildTravelOrderBackfillWhere(payload) {
  const clauses = [];
  const params = {};
  const orderNo = normalizeText(payload && payload.orderNo);
  const userOpenid = normalizeText(payload && payload.userOpenid);

  if (orderNo) {
    clauses.push("`orderNo` = {{orderNo}}");
    params.orderNo = orderNo;
  }

  if (userOpenid) {
    clauses.push("`userOpenid` = {{userOpenid}}");
    params.userOpenid = userOpenid;
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function resolveBackfillPageOptions(payload, defaultLimit = 500, maxLimit = 2000) {
  return {
    limit: Math.max(1, Math.min(maxLimit, normalizePositiveInteger(payload && payload.limit, defaultLimit) || defaultLimit)),
    offset: Math.max(0, normalizePositiveInteger(payload && payload.offset, 0)),
    dryRun: normalizeBooleanFlag(payload && payload.dryRun)
  };
}

async function listTravelOrderRowsInBatches(selectColumns, payload, options = {}) {
  const batchSize = Math.max(1, Math.min(500, normalizePositiveInteger(options.batchSize, 200) || 200));
  const startOffset = Math.max(0, normalizePositiveInteger(options.offset, 0));
  const maxRows = Math.max(0, normalizePositiveInteger(options.limit, 0));
  const { whereSql, params } = buildTravelOrderBackfillWhere(payload);
  const rows = [];
  let offset = startOffset;

  while (true) {
    const size = maxRows ? Math.min(batchSize, maxRows - rows.length) : batchSize;
    if (!size) {
      break;
    }

    const batch = await queryRows(
      `SELECT ${selectColumns} FROM \`TravelOrder\` ${whereSql} ORDER BY COALESCE(\`updatedAt\`, \`createdAtTs\`) DESC LIMIT {{limit}} OFFSET {{offset}}`,
      Object.assign({}, params, {
        limit: size,
        offset
      })
    );
    rows.push(...normalizeArray(batch));

    if (batch.length < size) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

function normalizeTravelerMatchPhone(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeTravelerMatchDocumentNumber(value) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}

function uniqueNormalizedValues(values, normalizeValue) {
  const normalizer = typeof normalizeValue === "function" ? normalizeValue : normalizeText;
  return Array.from(new Set(normalizeArray(values).map((item) => normalizer(item)).filter(Boolean)));
}

function getAdminGatewayMaintenanceToken() {
  return normalizeText(process.env[ADMIN_GATEWAY_MAINTENANCE_TOKEN_ENV_KEY]);
}

function assertMaintenanceAccess(payload) {
  const expectedToken = getAdminGatewayMaintenanceToken();
  const accessToken = normalizeText(payload && (payload.accessToken || payload.maintenanceToken || payload.token));

  assertCondition(expectedToken, "maintenance access is not configured");
  assertCondition(accessToken && accessToken === expectedToken, "maintenance access denied");
}

function resolveServiceMaintenanceOptions(payload) {
  const limit = Math.max(0, Math.min(2000, normalizePositiveInteger(payload && payload.limit, 0)));
  const slugs = uniqueNormalizedValues(
    [payload && payload.slug].concat(normalizeArray(payload && payload.slugs)),
    normalizeText
  );

  return {
    dryRun: normalizeBooleanFlag(payload && payload.dryRun),
    limit,
    overwrite: normalizeBooleanFlag(payload && payload.overwrite),
    slugs
  };
}

function buildServiceCreatorMessageBackfillPlan(services, options = {}) {
  const slugFilter = new Set(uniqueNormalizedValues(options.slugs, normalizeText));
  const overwrite = Boolean(options.overwrite);
  const limit = Math.max(0, normalizePositiveInteger(options.limit, 0));
  const filteredServices = normalizeArray(services)
    .filter((service) => {
      const slug = normalizeText(service && service.slug);
      return !slugFilter.size || slugFilter.has(slug);
    })
    .slice(0, limit || undefined);

  return filteredServices.map((service) => {
    const previousMessage = normalizeText(service && service.creatorMessage);
    const nextMessage = deriveServiceCreatorMessageForBackfill(service);
    const recordId = normalizeText(service && service._id);
    const slug = normalizeText(service && service.slug);
    const shouldUpdate = Boolean(recordId)
      && Boolean(slug)
      && previousMessage !== nextMessage
      && (overwrite || !previousMessage);

    return {
      _id: recordId,
      name: normalizeText(service && service.name),
      nextMessage,
      previousMessage,
      shouldUpdate,
      slug
    };
  });
}

function sanitizeServiceRestorePayload(service) {
  if (!isPlainObject(service)) {
    return null;
  }

  const nextDoc = Object.assign({}, service);
  const recordId = normalizeText(nextDoc._id);
  const slug = normalizeText(nextDoc.slug);
  const logicalId = normalizeText(nextDoc.id);
  delete nextDoc._id;

  return recordId || slug || logicalId
    ? {
        _id: recordId,
        id: logicalId,
        slug,
        data: nextDoc
      }
    : null;
}

function getTravelerSnapshotDocumentNumbers(traveler) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const values = [
    source.documentNumber,
    source.idCard,
    source.idNo,
    ...normalizeArray(source.documents).map((item) => item && (item.documentNumber || item.idCard || item.idNo))
  ];

  return uniqueNormalizedValues(values, normalizeTravelerMatchDocumentNumber);
}

function getTravelerDocDocumentNumbers(doc) {
  const source = doc && typeof doc === "object" ? doc : {};
  const values = [
    source.idNumber,
    ...normalizeArray(source.documents).map((item) => item && item.documentNumber)
  ];

  return uniqueNormalizedValues(values, normalizeTravelerMatchDocumentNumber);
}

function buildTravelerBackfillCandidate(doc) {
  return {
    doc,
    recordId: normalizeText(doc && doc._id),
    profileId: normalizeText(doc && (doc.profileId || doc.travelerId)),
    userOpenid: normalizeText(doc && doc.userOpenid),
    name: normalizeText(doc && doc.name),
    phone: normalizeTravelerMatchPhone(doc && doc.phone),
    documentNumbers: getTravelerDocDocumentNumbers(doc)
  };
}

function buildTravelerBackfillStateByUser(travelerDocs) {
  const state = {};

  normalizeArray(travelerDocs).forEach((doc) => {
    const source = normalizeText(doc && doc.source);
    const status = normalizeText(doc && doc.status);
    if ((source && source !== "traveler_profile") || status === "inactive") {
      return;
    }

    const userOpenid = normalizeText(doc && doc.userOpenid);
    if (!userOpenid) {
      return;
    }

    if (!state[userOpenid]) {
      state[userOpenid] = {
        docs: []
      };
    }

    state[userOpenid].docs.push(doc);
  });

  Object.keys(state).forEach((userOpenid) => {
    state[userOpenid].lookup = buildTravelerProfileLookup(state[userOpenid].docs);
    state[userOpenid].candidates = state[userOpenid].docs.map((doc) => buildTravelerBackfillCandidate(doc));
  });

  return state;
}

function classifyTravelerBackfillMatches(candidates) {
  const deduped = [];
  const seenRecordIds = new Set();

  normalizeArray(candidates).forEach((candidate) => {
    const recordId = normalizeText(candidate && candidate.recordId);
    if (!recordId || seenRecordIds.has(recordId)) {
      return;
    }

    seenRecordIds.add(recordId);
    deduped.push(candidate);
  });

  if (deduped.length === 1) {
    return {
      status: "matched",
      doc: deduped[0].doc,
      candidates: deduped
    };
  }

  if (deduped.length > 1) {
    return {
      status: "multiple",
      doc: null,
      candidates: deduped
    };
  }

  return {
    status: "unmatched",
    doc: null,
    candidates: []
  };
}

function resolveTravelerProfileBackfillMatch(rawTraveler, normalizedTraveler, userOpenid, userState) {
  const resolvedState = userState && typeof userState === "object"
    ? userState
    : {
        docs: [],
        lookup: {
          byRecordId: {},
          byProfileId: {},
          byScopedProfileKey: {}
        },
        candidates: []
      };
  const directDoc = matchTravelerProfileDoc(normalizedTraveler, resolvedState.lookup, userOpenid);
  if (directDoc) {
    return {
      status: "matched",
      reason: "existing_link",
      doc: directDoc,
      candidates: [buildTravelerBackfillCandidate(directDoc)]
    };
  }

  const travelerName = normalizeText(normalizedTraveler && normalizedTraveler.name);
  if (!travelerName) {
    return {
      status: "unmatched",
      reason: "missing_name",
      doc: null,
      candidates: []
    };
  }

  const documentNumbers = getTravelerSnapshotDocumentNumbers(normalizedTraveler);
  if (documentNumbers.length) {
    const byDocument = classifyTravelerBackfillMatches(
      resolvedState.candidates.filter(
        (candidate) => candidate.name === travelerName
          && candidate.documentNumbers.some((item) => documentNumbers.includes(item))
      )
    );
    if (byDocument.status !== "unmatched") {
      return Object.assign(byDocument, { reason: "document_name" });
    }
  }

  const phone = normalizeTravelerMatchPhone(normalizedTraveler && normalizedTraveler.phone);
  if (phone) {
    const byPhone = classifyTravelerBackfillMatches(
      resolvedState.candidates.filter(
        (candidate) => candidate.name === travelerName && candidate.phone === phone
      )
    );
    if (byPhone.status !== "unmatched") {
      return Object.assign(byPhone, { reason: "phone_name" });
    }
  }

  if (!documentNumbers.length && !phone) {
    const byName = classifyTravelerBackfillMatches(
      resolvedState.candidates.filter((candidate) => candidate.name === travelerName)
    );
    if (byName.status === "multiple") {
      return Object.assign(byName, { reason: "name_only" });
    }
  }

  return {
    status: "unmatched",
    reason: "missing_document_or_phone_match",
    doc: null,
    candidates: []
  };
}

function buildTravelerBackfilledSnapshot(rawTraveler, matchedDoc) {
  const nextTraveler = isPlainObject(rawTraveler) ? cloneJson(rawTraveler, {}) : {};
  const profileId = normalizeText(matchedDoc && (matchedDoc.profileId || matchedDoc.travelerId));
  const travelerRecordId = normalizeText(matchedDoc && matchedDoc._id);
  const source = normalizeText(nextTraveler && (nextTraveler.src || nextTraveler.source))
    || normalizeText(matchedDoc && matchedDoc.source)
    || "traveler_profile";

  if (profileId) {
    nextTraveler.pid = profileId;
  }
  if (travelerRecordId) {
    nextTraveler.rid = travelerRecordId;
  }
  if (source) {
    nextTraveler.src = source;
  }

  return nextTraveler;
}

function isTravelerSnapshotLinkMatched(rawTraveler, matchedDoc) {
  const normalizedTraveler = normalizeTravelerSnapshot(rawTraveler);
  const profileId = normalizeText(matchedDoc && (matchedDoc.profileId || matchedDoc.travelerId));
  const travelerRecordId = normalizeText(matchedDoc && matchedDoc._id);
  const source = normalizeText(rawTraveler && (rawTraveler.src || rawTraveler.source))
    || normalizeText(matchedDoc && matchedDoc.source)
    || "traveler_profile";

  return (
    normalizedTraveler.profileId === profileId
    && normalizedTraveler.travelerRecordId === travelerRecordId
    && normalizedTraveler.source === source
  );
}

async function findUserForDetail(payload) {
  const userId = normalizeText(payload && (payload.userId || payload._id));
  const openidHint = normalizeText(payload && (payload.openid || payload.userOpenid));
  if (userId) {
    try {
      const byDocId = await db.collection(COLLECTIONS.users).doc(userId).get();
      if (byDocId && byDocId.data) {
        return byDocId.data;
      }
    } catch (error) {
      // Ignore and continue lookup by openid.
    }
  }

  const openidCandidates = uniqueCaseSensitiveIdentifiers([openidHint, userId]);
  for (const openid of openidCandidates) {
    const rows = await db.collection(COLLECTIONS.users)
      .where(
        _.or([
          {
            openid
          },
          {
            _openid: openid
          }
        ])
      )
      .limit(1)
      .get();
    if (rows && rows.data && rows.data.length) {
      return rows.data[0];
    }
  }

  return null;
}

async function listUserTravelerProfilesByUser(userDoc, openids) {
  const records = [];
  const userId = normalizeText(userDoc && userDoc._id);
  if (userId) {
    const byUserId = await db.collection(COLLECTIONS.userTravelers)
      .where({
        userId,
        status: "active",
        source: "traveler_profile"
      })
      .limit(MAX_LIMIT)
      .get();
    records.push(...normalizeArray(byUserId && byUserId.data));
  }
  for (const openid of uniqueCaseSensitiveIdentifiers(openids)) {
    const result = await db.collection(COLLECTIONS.userTravelers)
      .where({
        userOpenid: openid,
        status: "active",
        source: "traveler_profile"
      })
      .limit(MAX_LIMIT)
      .get();
    records.push(...normalizeArray(result && result.data));
  }
  const dedupedMap = {};
  records.forEach((item) => {
    const key = normalizeText(item && (item.profileId || item.travelerId || item._id));
    if (!key) {
      return;
    }
    const previous = dedupedMap[key];
    if (!previous || normalizeNumber(item && item.updatedAt) > normalizeNumber(previous && previous.updatedAt)) {
      dedupedMap[key] = item;
    }
  });
  return Object.values(dedupedMap)
    .map(mapTravelerProfileForAdmin)
    .sort((left, right) => normalizeNumber(right.updatedAt) - normalizeNumber(left.updatedAt));
}

async function listTravelerRelationOrderRows(limit = TRAVELER_RELATION_ORDER_LIMIT) {
  return queryRows(
    "SELECT `orderNo`, `userOpenid`, `serviceSlug`, `serviceName`, `servicePeriodCode`, `versionName`, `status`, `travelDateStart`, `travelDateEnd`, `travelersJson`, `createdAtTs`, `updatedAt`, `creatorSnapshotJson`, `serviceSnapshotJson` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT {{limit}}",
    { limit: Math.max(1, Math.min(TRAVELER_RELATION_ORDER_LIMIT, normalizePositiveInteger(limit, TRAVELER_RELATION_ORDER_LIMIT))) }
  );
}

async function listUserEffectiveOrderRows(openids) {
  const rows = [];
  for (const openid of uniqueCaseSensitiveIdentifiers(openids)) {
    const partialRows = await queryRows(
      "SELECT * FROM `TravelOrder` WHERE `userOpenid` = {{openid}} ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT 500",
      { openid }
    );
    rows.push(...partialRows);
  }
  const dedupedMap = {};
  rows.forEach((row) => {
    const orderNo = normalizeText(row && row.orderNo);
    if (!orderNo) {
      return;
    }
    const status = normalizeText(row && row.status);
    if (!EFFECTIVE_ORDER_STATUSES.has(status)) {
      return;
    }
    if (!dedupedMap[orderNo]) {
      dedupedMap[orderNo] = row;
    }
  });
  return Object.values(dedupedMap)
    .map(mapEffectiveOrderItem)
    .sort((left, right) => normalizeNumber(right.updatedAtTs) - normalizeNumber(left.updatedAtTs));
}

async function getUserDetail(payload) {
  const userDoc = await findUserForDetail(payload);
  assertCondition(userDoc, "未找到对应用户");

  const openids = resolveUserOrderOpenids(userDoc);
  const userId = normalizeText(userDoc._id);
  const [persistedTravelers, effectiveOrders, couponDocs, rewardDocs, users] = await Promise.all([
    listUserTravelerProfilesByUser(userDoc, openids),
    listUserEffectiveOrderRows(openids),
    listOptionalCollection(COLLECTIONS.userCouponAssets),
    listOptionalCollection(COLLECTIONS.referralRewardLedgers),
    listCollection(COLLECTIONS.users)
  ]);
  const travelers = persistedTravelers;
  const routeHistory = buildRouteHistory(effectiveOrders);
  const userMap = buildUserIdSummaryMap(users);
  const couponAssets = normalizeArray(couponDocs)
    .filter((doc) => {
      const docUserId = normalizeText(doc && doc.userId);
      const docOpenid = normalizeText(doc && doc.userOpenid);
      return (userId && docUserId === userId) || (docOpenid && openids.includes(docOpenid));
    })
    .map((doc) => ({
      couponAssetId: normalizeText(doc && doc._id),
      campaignKey: normalizeText(doc && doc.campaignKey),
      couponType: normalizeText(doc && doc.couponType),
      title: normalizeText(doc && doc.title) || "野哉分享家活动券",
      amount: normalizeNumber(doc && doc.amount, 0),
      threshold: normalizeNumber(doc && doc.threshold, 0),
      status: normalizeText(doc && doc.status) || "active",
      stackGroup: normalizeText(doc && doc.stackGroup),
      grantedAt: normalizeNumber(doc && doc.grantedAt, 0),
      expiresAt: normalizeNumber(doc && doc.expiresAt, 0),
      usedOrderNo: normalizeText(doc && doc.usedOrderNo),
      usedAt: normalizeNumber(doc && doc.usedAt, 0),
      updatedAt: normalizeNumber(doc && doc.updatedAt, 0)
    }))
    .sort((left, right) => normalizeNumber(right.grantedAt, 0) - normalizeNumber(left.grantedAt, 0));
  const cashRewardLedgers = normalizeArray(rewardDocs)
    .filter((doc) => userId && normalizeText(doc && doc.inviterUserId) === userId)
    .map((doc) => {
      const inviteeSummary = resolveUserSummaryByUserId(userMap, doc && doc.inviteeUserId);
      return {
        ledgerId: normalizeText(doc && doc._id),
        campaignKey: normalizeText(doc && doc.campaignKey),
        campaignName: normalizeText(doc && doc.campaignName),
        inviterUserId: userId,
        inviteeUserId: inviteeSummary.userId || normalizeText(doc && doc.inviteeUserId),
        inviteeNickname: inviteeSummary.userNickname,
        relationId: normalizeText(doc && doc.relationId),
        sourceOrderNo: normalizeText(doc && doc.sourceOrderNo),
        sourceServiceSlug: normalizeText(doc && doc.sourceServiceSlug),
        serviceName: normalizeText(doc && doc.serviceName),
        travelDateStart: normalizeText(doc && doc.travelDateStart),
        travelDateEnd: normalizeText(doc && doc.travelDateEnd),
        rewardAmount: normalizeNumber(doc && doc.rewardAmount, 0),
        grossAmount: normalizeNumber(doc && doc.grossAmount, 0),
        netAmount: normalizeNumber(doc && doc.netAmount, 0),
        status: normalizeText(doc && doc.status) || "awaiting_account",
        settlementMonth: normalizeText(doc && doc.settlementMonth),
        settlementPlannedDay: normalizeNumber(doc && doc.settlementPlannedDay, 0),
        earnedAt: normalizeNumber(doc && doc.earnedAt, 0),
        updatedAt: normalizeNumber(doc && doc.updatedAt, 0)
      };
    })
    .sort((left, right) => normalizeNumber(right.earnedAt, 0) - normalizeNumber(left.earnedAt, 0));
  const stats = {
    travelerCount: travelers.length,
    effectiveOrderCount: effectiveOrders.length,
    effectiveRouteCount: routeHistory.length,
    lastTravelAt: normalizeNumber(effectiveOrders[0] && effectiveOrders[0].updatedAtTs)
  };

  if (normalizeText(userDoc._id)) {
    await db.collection(COLLECTIONS.users).doc(userDoc._id).update({
      data: {
        travelerCount: stats.travelerCount,
        effectiveOrderCount: stats.effectiveOrderCount,
        effectiveRouteCount: stats.effectiveRouteCount,
        lastTravelAt: stats.lastTravelAt,
        updatedAt: Date.now()
      }
    });
  }

  return {
    user: {
      id: normalizeText(userDoc._id),
      openid: normalizeText(userDoc.openid || userDoc._openid),
      nickname: normalizeText(userDoc.nickname) || "旅人",
      avatarUrl: normalizeText(userDoc.avatarUrl || userDoc.avatar),
      role: normalizeText(userDoc.role) || "user",
      memberLabel: normalizeText(userDoc.memberLabel) || "野哉会员",
      profileConfigured: Boolean(userDoc.profileConfigured),
      createdAt: normalizeNumber(userDoc.createdAt),
      updatedAt: normalizeNumber(userDoc.updatedAt),
      ...stats
    },
    travelers,
    couponAssets,
    cashRewardLedgers,
    routeHistory,
    effectiveOrders
  };
}

async function findTravelerDocForDetail(payload) {
  const travelerRecordId = normalizeText(payload && (payload.travelerId || payload.travelerRecordId || payload._id));
  const profileId = normalizeText(payload && payload.profileId);

  if (travelerRecordId) {
    try {
      const byDocId = await db.collection(COLLECTIONS.userTravelers).doc(travelerRecordId).get();
      if (byDocId && byDocId.data) {
        return byDocId.data;
      }
    } catch (error) {
      // Ignore and fall back to collection scan below.
    }
  }

  const travelerDocs = await listCollection(COLLECTIONS.userTravelers);
  const exactByRecordId = normalizeArray(travelerDocs).find((doc) => normalizeText(doc && doc._id) === travelerRecordId);
  if (exactByRecordId) {
    return exactByRecordId;
  }

  return normalizeArray(travelerDocs).find((doc) => {
    const docProfileId = normalizeText(doc && (doc.profileId || doc.travelerId));
    return docProfileId && docProfileId === profileId;
  }) || null;
}

async function listTravelers(payload, adminUser) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const status = normalizeText(payload && payload.status).toLowerCase();
  const hasOrders = normalizeText(payload && payload.hasOrders).toLowerCase();
  const servicePeriodCode = normalizeText(payload && payload.servicePeriodCode);
  const limit = clampLimit(payload && payload.limit, 100);

  const [travelerDocs, users, relationOrderRows, services, creators] = await Promise.all([
    listCollection(COLLECTIONS.userTravelers),
    listCollection(COLLECTIONS.users),
    listTravelerRelationOrderRows(),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);

  const userMap = buildOrderUserMap(users);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  const visibleRelationOrderRows = filterOrderRowsForAdmin(relationOrderRows, adminUser, creatorRefSet, serviceMap)
    .filter((row) => {
      if (!servicePeriodCode) {
        return true;
      }

      return normalizeText(row && row.servicePeriodCode) === servicePeriodCode
        && isSoldOrderStatus(row && row.status);
    });
  const relationOrderMaps = buildTravelerRelationMaps(visibleRelationOrderRows, travelerDocs);

  const items = normalizeArray(travelerDocs)
    .filter((doc) => {
      const source = normalizeText(doc && doc.source);
      return !source || source === "traveler_profile";
    })
    .map((doc) => {
      const summary = mapTravelerProfileForAdmin(doc);
      const userSummary = resolveOrderUserSummary(userMap, doc && doc.userOpenid);
      const relationSummary = resolveTravelerRelationSummary(doc, relationOrderMaps, {
        usePersistedFallback: !isCreatorPortalUser(adminUser)
      });
      const searchableDocumentNumbers = normalizeArray(doc && doc.documents)
        .map((item) => normalizeText(item && item.documentNumber))
        .filter(Boolean);

      return Object.assign({}, summary, {
        relatedOrderCount: relationSummary.relatedOrderCount,
        lastRelatedOrderNo: relationSummary.lastRelatedOrderNo,
        lastRelatedOrderStatus: relationSummary.lastRelatedOrderStatus,
        lastRelatedOrderAt: relationSummary.lastRelatedOrderAt,
        lastRelatedServiceName: relationSummary.lastRelatedServiceName,
        userId: normalizeText(doc && doc.userId) || userSummary.userId,
        userOpenid: normalizeText(doc && doc.userOpenid),
        userNickname: userSummary.userNickname,
        _keywordValues: [
          summary.name,
          normalizeText(doc && doc.phone),
          normalizeText(doc && doc.idNumber),
          summary.profileId,
          normalizeText(doc && doc.travelerId),
          userSummary.userNickname,
          normalizeText(doc && doc.userId),
          ...searchableDocumentNumbers
        ]
      });
    })
    .filter((item) => {
      if (isCreatorPortalUser(adminUser) && normalizeNumber(item && item.relatedOrderCount) <= 0) {
        return false;
      }
      if (servicePeriodCode && normalizeNumber(item && item.relatedOrderCount) <= 0) {
        return false;
      }
      if (status && status !== "all" && status !== normalizeText(item && item.status).toLowerCase()) {
        return false;
      }
      if (hasOrders === "yes" && normalizeNumber(item && item.relatedOrderCount) <= 0) {
        return false;
      }
      if (hasOrders === "no" && normalizeNumber(item && item.relatedOrderCount) > 0) {
        return false;
      }

      return matchesKeyword(item && item._keywordValues, keyword);
    })
    .map((item) => {
      const nextItem = Object.assign({}, item);
      delete nextItem._keywordValues;
      return nextItem;
    });

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "name":
            return item.name;
          case "userNickname":
            return item.userNickname;
          case "relatedOrderCount":
            return item.relatedOrderCount;
          case "lastRelatedOrderAt":
            return item.lastRelatedOrderAt;
          case "lastUsedAt":
            return item.lastUsedAt;
          case "status":
            return item.status;
          case "updatedAt":
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.travelerRecordId || item.profileId
    });
  }

  return items.slice(0, limit);
}

async function listServicePeriodTravelerExportRows(payload, adminUser) {
  const servicePeriodCode = normalizeText(payload && payload.servicePeriodCode);
  assertCondition(servicePeriodCode, "请选择要导出的团期");

  const [periodRecord, orderRows, users, services, creators] = await Promise.all([
    findServicePeriodByCode(servicePeriodCode),
    queryRows(
      `SELECT \`orderNo\`, \`userOpenid\`, \`serviceSlug\`, \`serviceName\`, \`serviceType\`, \`servicePeriodCode\`, \`versionName\`, \`status\`, \`travelDateStart\`, \`travelDateEnd\`, \`orderContactName\`, \`orderContactPhone\`, \`travelerName\`, \`travelerPhone\`, \`emergencyContactName\`, \`emergencyContactPhone\`, \`roomingMode\`, \`roommateName\`, \`roomType\`, \`singleRoomPrice\`, \`singleRoomPriceDec\`, \`singleRoomStatus\`, \`singleRoomNotice\`, \`allergyNotes\`, \`note\`, \`travelersJson\`, \`createdAtTs\`, \`updatedAt\`, \`creatorSnapshotJson\`, \`serviceSnapshotJson\` FROM \`TravelOrder\` WHERE \`servicePeriodCode\` = {{servicePeriodCode}} AND ${SOLD_ORDER_STATUS_SQL} ORDER BY COALESCE(\`paidAtTs\`, \`updatedAt\`, \`createdAtTs\`) ASC LIMIT 1000`,
      { servicePeriodCode }
    ),
    listCollection(COLLECTIONS.users),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);
  assertCondition(periodRecord, "未找到对应团期");

  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  assertCondition(
    canAccessServicePeriodForAdmin(periodRecord, adminUser, creatorRefSet, serviceMap),
    "未找到对应团期"
  );

  const userMap = buildOrderUserMap(users);
  const visibleRows = filterOrderRowsForAdmin(orderRows, adminUser, creatorRefSet, serviceMap);
  const items = [];

  visibleRows.forEach((row) => {
    const userSummary = resolveOrderUserSummary(userMap, row && row.userOpenid);
    const serviceSnapshot = parseJsonText(row && row.serviceSnapshotJson, {}) || {};
    const snapshotSingleRoom =
      serviceSnapshot && typeof serviceSnapshot.singleRoom === "object" && serviceSnapshot.singleRoom !== null
        ? serviceSnapshot.singleRoom
        : {};
    const orderContactName = normalizeText(row && (row.orderContactName || row.travelerName));
    const orderContactPhone = normalizeText(row && (row.orderContactPhone || row.travelerPhone));
    const roomingMode =
      normalizeText(row && row.roomingMode)
      || (normalizeBoolean(snapshotSingleRoom.requested) ? "singleRoomRequest" : "random");
    const travelers = normalizeArray(parseJsonText(row && row.travelersJson, []))
      .map(normalizeTravelerSnapshot)
      .filter((traveler) => traveler && (traveler.name || traveler.phone || traveler.documentNumber || traveler.documents.length));

    travelers.forEach((traveler, index) => {
      const documents = normalizeArray(traveler.documents)
        .map((document) => ({
          documentType: normalizeText(document && document.documentType),
          documentNumber: normalizeText(document && document.documentNumber)
        }))
        .filter((document) => document.documentType || document.documentNumber);

      items.push({
        orderNo: normalizeText(row && row.orderNo),
        orderStatus: normalizeText(row && row.status),
        serviceSlug: normalizeText(row && row.serviceSlug),
        serviceName: normalizeText(row && row.serviceName),
        serviceType: normalizeText(row && row.serviceType),
        servicePeriodCode: normalizeText(row && row.servicePeriodCode),
        versionName: normalizeText(row && row.versionName),
        travelDateStart: normalizeText(row && row.travelDateStart),
        travelDateEnd: normalizeText(row && row.travelDateEnd),
        userId: userSummary.userId,
        userOpenid: normalizeText(row && row.userOpenid),
        userNickname: userSummary.userNickname,
        orderContactName,
        orderContactPhone,
        emergencyContactName: normalizeText(row && row.emergencyContactName) || orderContactName,
        emergencyContactPhone: normalizeText(row && row.emergencyContactPhone) || orderContactPhone,
        roomingMode,
        roommateName: normalizeText(row && row.roommateName),
        roomType: normalizeText(row && row.roomType),
        singleRoomPrice: Math.max(0, normalizeNumber(row && (row.singleRoomPriceDec || row.singleRoomPrice || snapshotSingleRoom.price), 0)),
        singleRoomStatus: normalizeText(row && (row.singleRoomStatus || snapshotSingleRoom.status)),
        singleRoomNotice: normalizeText(row && (row.singleRoomNotice || snapshotSingleRoom.notice)),
        allergyNotes: normalizeText(row && row.allergyNotes),
        orderNote: normalizeText(row && row.note),
        travelerIndex: index + 1,
        travelerRecordId: normalizeText(traveler.travelerRecordId),
        profileId: normalizeText(traveler.profileId),
        name: normalizeText(traveler.name),
        phone: normalizeText(traveler.phone),
        wechat: normalizeText(traveler.wechat),
        email: normalizeText(traveler.email),
        gender: normalizeText(traveler.gender),
        birthday: normalizeText(traveler.birthday),
        documentType: normalizeText(traveler.documentType || (documents[0] && documents[0].documentType)),
        documentNumber: normalizeText(traveler.documentNumber || (documents[0] && documents[0].documentNumber)),
        documents,
        note: normalizeText(traveler.note)
      });
    });
  });

  return {
    period: mapServicePeriodRecord(
      periodRecord,
      resolvePeriodSoldCount(periodRecord),
      serviceMap[normalizeText(periodRecord && periodRecord.serviceSlug)] || null,
      adminUser
    ),
    items
  };
}

async function getTravelerDetail(payload, adminUser) {
  const travelerDoc = await findTravelerDocForDetail(payload);
  assertCondition(travelerDoc, "未找到对应出行人");

  const [users, relationOrderRows, services, creators] = await Promise.all([
    listCollection(COLLECTIONS.users),
    listTravelerRelationOrderRows(),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.creators)
  ]);

  const userSummary = resolveOrderUserSummary(buildOrderUserMap(users), travelerDoc && travelerDoc.userOpenid);
  const creatorRefSet = buildAdminCreatorRefSet(adminUser, creators);
  const serviceMap = buildServiceMap(services);
  const visibleRelationOrderRows = filterOrderRowsForAdmin(relationOrderRows, adminUser, creatorRefSet, serviceMap);
  const relationMaps = buildTravelerRelationMaps(visibleRelationOrderRows, [travelerDoc]);
  const relationSummary = resolveTravelerRelationSummary(travelerDoc, relationMaps, {
    usePersistedFallback: !isCreatorPortalUser(adminUser)
  });
  assertCondition(!isCreatorPortalUser(adminUser) || normalizeNumber(relationSummary && relationSummary.relatedOrderCount, 0) > 0, "未找到对应出行人");

  return mapTravelerProfileDetailForAdmin(travelerDoc, userSummary, relationSummary);
}

async function deleteTraveler(payload) {
  const travelerDoc = await findTravelerDocForDetail(payload);
  assertCondition(travelerDoc, "未找到对应出行人");

  const relationOrderRows = await listTravelerRelationOrderRows();
  const relationMaps = buildTravelerRelationMaps(relationOrderRows, [travelerDoc]);
  const relationSummary = resolveTravelerRelationSummary(travelerDoc, relationMaps);
  assertCondition(normalizeNumber(relationSummary && relationSummary.relatedOrderCount, 0) === 0, "该出行人仍有关联行程，不能直接删除");

  const travelerRecordId = normalizeText(travelerDoc && travelerDoc._id);
  assertCondition(travelerRecordId, "缺少出行人记录 ID");

  await db.collection(COLLECTIONS.userTravelers).doc(travelerRecordId).remove();
  return {
    _id: travelerRecordId,
    removed: true
  };
}

async function backfillOrderContactFields(payload) {
  const { limit, offset, dryRun } = resolveBackfillPageOptions(payload, 500, 2000);
  const { whereSql, params } = buildTravelOrderBackfillWhere(payload);
  const orderRows = await queryRows(
    `SELECT \`orderNo\`, \`orderContactName\`, \`orderContactPhone\`, \`travelerName\`, \`travelerPhone\` FROM \`TravelOrder\` ${whereSql} ORDER BY COALESCE(\`updatedAt\`, \`createdAtTs\`) DESC LIMIT {{limit}} OFFSET {{offset}}`,
    Object.assign({}, params, {
      limit,
      offset
    })
  );
  const updatedSamples = [];
  const skippedSamples = [];
  const errorSamples = [];
  let updatedOrders = 0;
  let skippedOrders = 0;
  let errorCount = 0;

  for (const row of normalizeArray(orderRows)) {
    const orderNo = normalizeText(row && row.orderNo);
    const legacyName = normalizeText(row && row.travelerName);
    const legacyPhone = normalizeText(row && row.travelerPhone);
    const currentName = normalizeText(row && row.orderContactName);
    const currentPhone = normalizeText(row && row.orderContactPhone);
    const nextName = currentName || legacyName;
    const nextPhone = currentPhone || legacyPhone;

    if (nextName === currentName && nextPhone === currentPhone) {
      skippedOrders += 1;
      appendBackfillSample(skippedSamples, {
        orderNo,
        reason: currentName || currentPhone ? "already_filled" : "missing_legacy_contact"
      });
      continue;
    }

    try {
      if (!dryRun) {
        await executeSQL(
          "UPDATE `TravelOrder` SET `orderContactName` = {{orderContactName}}, `orderContactPhone` = {{orderContactPhone}} WHERE `orderNo` = {{orderNo}} LIMIT 1",
          {
            orderNo,
            orderContactName: nextName,
            orderContactPhone: nextPhone
          }
        );
      }

      updatedOrders += 1;
      appendBackfillSample(updatedSamples, {
        orderNo,
        orderContactName: nextName,
        orderContactPhone: nextPhone
      });
    } catch (error) {
      errorCount += 1;
      appendBackfillSample(errorSamples, {
        orderNo,
        message: error && error.message ? error.message : "order contact backfill failed"
      });
    }
  }

  return {
    dryRun,
    limit,
    offset,
    scannedOrders: orderRows.length,
    updatedOrders,
    skippedOrders,
    errorCount,
    updatedSamples,
    skippedSamples,
    errorSamples
  };
}

async function backfillOrderTravelerProfileRefs(payload) {
  const { limit, offset, dryRun } = resolveBackfillPageOptions(payload, 500, 2000);
  const { whereSql, params } = buildTravelOrderBackfillWhere(payload);
  const [orderRows, travelerDocs] = await Promise.all([
    queryRows(
      `SELECT \`orderNo\`, \`userOpenid\`, \`travelersJson\` FROM \`TravelOrder\` ${whereSql} ORDER BY COALESCE(\`updatedAt\`, \`createdAtTs\`) DESC LIMIT {{limit}} OFFSET {{offset}}`,
      Object.assign({}, params, {
        limit,
        offset
      })
    ),
    listCollection(COLLECTIONS.userTravelers)
  ]);
  const travelerStateByUser = buildTravelerBackfillStateByUser(travelerDocs);
  const updatedSamples = [];
  const unmatchedSamples = [];
  const multiMatchedSamples = [];
  const errorSamples = [];
  let scannedTravelers = 0;
  let updatedOrders = 0;
  let updatedTravelerRefs = 0;
  let alreadyLinkedTravelers = 0;
  let unmatchedTravelers = 0;
  let multiMatchedTravelers = 0;
  let errorCount = 0;

  for (const row of normalizeArray(orderRows)) {
    const orderNo = normalizeText(row && row.orderNo);
    const userOpenid = normalizeText(row && row.userOpenid);
    const rawTravelers = normalizeArray(parseJsonText(row && row.travelersJson, []));
    if (!rawTravelers.length) {
      continue;
    }

    const userState = travelerStateByUser[userOpenid];
    let orderChanged = false;
    const nextTravelers = rawTravelers.map((rawTraveler, travelerIndex) => {
      const normalizedTraveler = normalizeTravelerSnapshot(rawTraveler);
      scannedTravelers += 1;

      const matchResult = resolveTravelerProfileBackfillMatch(
        rawTraveler,
        normalizedTraveler,
        userOpenid,
        userState
      );

      if (matchResult.status === "matched" && matchResult.doc) {
        if (isTravelerSnapshotLinkMatched(rawTraveler, matchResult.doc)) {
          alreadyLinkedTravelers += 1;
          return rawTraveler;
        }

        orderChanged = true;
        updatedTravelerRefs += 1;
        appendBackfillSample(updatedSamples, {
          orderNo,
          travelerIndex,
          name: normalizedTraveler.name,
          profileId: normalizeText(matchResult.doc && (matchResult.doc.profileId || matchResult.doc.travelerId)),
          travelerRecordId: normalizeText(matchResult.doc && matchResult.doc._id),
          reason: matchResult.reason
        });
        return buildTravelerBackfilledSnapshot(rawTraveler, matchResult.doc);
      }

      if (matchResult.status === "multiple") {
        multiMatchedTravelers += 1;
        appendBackfillSample(multiMatchedSamples, {
          orderNo,
          travelerIndex,
          name: normalizedTraveler.name,
          reason: matchResult.reason,
          candidateRecordIds: normalizeArray(matchResult.candidates).map((item) => normalizeText(item && item.recordId)).filter(Boolean)
        });
        return rawTraveler;
      }

      unmatchedTravelers += 1;
      appendBackfillSample(unmatchedSamples, {
        orderNo,
        travelerIndex,
        name: normalizedTraveler.name,
        phone: normalizedTraveler.phone,
        documentNumber: normalizedTraveler.documentNumber,
        reason: matchResult.reason
      });
      return rawTraveler;
    });

    if (!orderChanged) {
      continue;
    }

    try {
      if (!dryRun) {
        await executeSQL(
          "UPDATE `TravelOrder` SET `travelersJson` = {{travelersJson}} WHERE `orderNo` = {{orderNo}} LIMIT 1",
          {
            orderNo,
            travelersJson: JSON.stringify(nextTravelers)
          }
        );
      }

      updatedOrders += 1;
    } catch (error) {
      errorCount += 1;
      appendBackfillSample(errorSamples, {
        orderNo,
        message: error && error.message ? error.message : "traveler refs backfill failed"
      });
    }
  }

  return {
    dryRun,
    limit,
    offset,
    scannedOrders: orderRows.length,
    scannedTravelers,
    updatedOrders,
    updatedTravelerRefs,
    alreadyLinkedTravelers,
    unmatchedTravelers,
    multiMatchedTravelers,
    errorCount,
    updatedSamples,
    unmatchedSamples,
    multiMatchedSamples,
    errorSamples
  };
}

async function backfillTravelerOrderStats(payload) {
  const dryRun = normalizeBooleanFlag(payload && payload.dryRun);
  const userOpenidFilter = normalizeText(payload && payload.userOpenid);
  const travelerRecordIdFilter = normalizeText(payload && (payload.travelerId || payload.travelerRecordId || payload._id));
  const profileIdFilter = normalizeText(payload && payload.profileId);
  const orderLimit = Math.max(0, normalizePositiveInteger(payload && payload.orderLimit, 0));
  const [travelerDocs, users] = await Promise.all([
    listCollection(COLLECTIONS.userTravelers),
    listCollection(COLLECTIONS.users)
  ]);
  const filteredTravelerDocs = normalizeArray(travelerDocs).filter((doc) => {
    const userOpenid = normalizeText(doc && doc.userOpenid);
    const travelerRecordId = normalizeText(doc && doc._id);
    const profileId = normalizeText(doc && (doc.profileId || doc.travelerId));

    if (userOpenidFilter && userOpenid !== userOpenidFilter) {
      return false;
    }
    if (travelerRecordIdFilter && travelerRecordId !== travelerRecordIdFilter) {
      return false;
    }
    if (profileIdFilter && profileId !== profileIdFilter) {
      return false;
    }

    return true;
  });
  const userOpenids = uniqueNormalizedValues(
    filteredTravelerDocs.map((doc) => doc && doc.userOpenid),
    normalizeText
  );
  const relationOrderRows = await listTravelOrderRowsInBatches(
    "`orderNo`, `userOpenid`, `serviceSlug`, `serviceName`, `servicePeriodCode`, `status`, `travelDateStart`, `travelDateEnd`, `travelersJson`, `createdAtTs`, `updatedAt`",
    {
      userOpenid: userOpenids.length === 1 ? userOpenids[0] : ""
    },
    {
      limit: orderLimit,
      batchSize: 200
    }
  );
  const relationMaps = buildTravelerRelationMaps(relationOrderRows, filteredTravelerDocs);
  const userMap = buildOrderUserMap(users);
  const updatedSamples = [];
  const skippedSamples = [];
  const errorSamples = [];
  let updatedTravelers = 0;
  let skippedTravelers = 0;
  let errorCount = 0;

  for (const doc of filteredTravelerDocs) {
    const travelerRecordId = normalizeText(doc && doc._id);
    const profileId = normalizeText(doc && (doc.profileId || doc.travelerId));
    const relationSummary = resolveTravelerRelationSummary(doc, relationMaps);
    const resolvedUser = userMap[normalizeText(doc && doc.userOpenid)] || {};
    const nextData = {};
    const desiredTravelerId = profileId || normalizeText(doc && doc.travelerId);
    const desiredProfileId = profileId || normalizeText(doc && doc.travelerId);
    const desiredUserId = normalizeText(doc && doc.userId) || normalizeText(resolvedUser && resolvedUser.userId);
    const desiredLastUsedAt = normalizeNumber(relationSummary.lastRelatedOrderAt, 0)
      || normalizeNumber(doc && doc.lastUsedAt, 0);

    if (desiredTravelerId && normalizeText(doc && doc.travelerId) !== desiredTravelerId) {
      nextData.travelerId = desiredTravelerId;
    }
    if (desiredProfileId && normalizeText(doc && doc.profileId) !== desiredProfileId) {
      nextData.profileId = desiredProfileId;
    }
    if (desiredUserId && normalizeText(doc && doc.userId) !== desiredUserId) {
      nextData.userId = desiredUserId;
    }
    if (normalizeNumber(doc && doc.relatedOrderCount, 0) !== normalizeNumber(relationSummary.relatedOrderCount, 0)) {
      nextData.relatedOrderCount = normalizeNumber(relationSummary.relatedOrderCount, 0);
    }
    if (normalizeText(doc && doc.lastRelatedOrderNo) !== normalizeText(relationSummary.lastRelatedOrderNo)) {
      nextData.lastRelatedOrderNo = normalizeText(relationSummary.lastRelatedOrderNo);
    }
    if (normalizeText(doc && doc.lastRelatedOrderStatus) !== normalizeText(relationSummary.lastRelatedOrderStatus)) {
      nextData.lastRelatedOrderStatus = normalizeText(relationSummary.lastRelatedOrderStatus);
    }
    if (normalizeNumber(doc && doc.lastRelatedOrderAt, 0) !== normalizeNumber(relationSummary.lastRelatedOrderAt, 0)) {
      nextData.lastRelatedOrderAt = normalizeNumber(relationSummary.lastRelatedOrderAt, 0);
    }
    if (normalizeText(doc && doc.lastRelatedServiceName) !== normalizeText(relationSummary.lastRelatedServiceName)) {
      nextData.lastRelatedServiceName = normalizeText(relationSummary.lastRelatedServiceName);
    }
    if (desiredLastUsedAt > 0 && normalizeNumber(doc && doc.lastUsedAt, 0) !== desiredLastUsedAt) {
      nextData.lastUsedAt = desiredLastUsedAt;
    }

    if (!Object.keys(nextData).length) {
      skippedTravelers += 1;
      appendBackfillSample(skippedSamples, {
        travelerRecordId,
        profileId,
        reason: "already_synced"
      });
      continue;
    }

    try {
      if (!dryRun) {
        await db.collection(COLLECTIONS.userTravelers).doc(travelerRecordId).update({
          data: nextData
        });
      }

      updatedTravelers += 1;
      appendBackfillSample(updatedSamples, Object.assign({
        travelerRecordId,
        profileId
      }, nextData));
    } catch (error) {
      errorCount += 1;
      appendBackfillSample(errorSamples, {
        travelerRecordId,
        profileId,
        message: error && error.message ? error.message : "traveler stats backfill failed"
      });
    }
  }

  return {
    dryRun,
    scannedTravelers: filteredTravelerDocs.length,
    scannedOrders: relationOrderRows.length,
    updatedTravelers,
    skippedTravelers,
    errorCount,
    updatedSamples,
    skippedSamples,
    errorSamples
  };
}

async function maintenanceBackfillServiceCreatorMessages(payload) {
  assertMaintenanceAccess(payload);

  const options = resolveServiceMaintenanceOptions(payload);
  const plan = buildServiceCreatorMessageBackfillPlan(
    await listCollection(COLLECTIONS.services),
    options
  );
  const updatedSamples = [];
  const skippedSamples = [];
  const errorSamples = [];
  let updatedServices = 0;
  let skippedServices = 0;
  let errorCount = 0;

  for (const item of plan) {
    if (!item.shouldUpdate) {
      skippedServices += 1;
      appendBackfillSample(skippedSamples, {
        _id: item._id,
        slug: item.slug,
        previousMessage: item.previousMessage,
        reason: item.previousMessage ? "already_filled" : "no_change"
      });
      continue;
    }

    try {
      if (!options.dryRun) {
        await db.collection(COLLECTIONS.services).doc(item._id).update({
          data: {
            creatorMessage: item.nextMessage,
            updatedAt: Date.now(),
            updatedBy: SERVICE_CREATOR_MESSAGE_BACKFILL_UPDATED_BY
          }
        });
      }

      updatedServices += 1;
      appendBackfillSample(updatedSamples, {
        _id: item._id,
        slug: item.slug,
        nextMessage: item.nextMessage,
        previousMessage: item.previousMessage
      });
    } catch (error) {
      errorCount += 1;
      appendBackfillSample(errorSamples, {
        _id: item._id,
        slug: item.slug,
        message: error && error.message ? error.message : "service creatorMessage backfill failed"
      });
    }
  }

  if (!options.dryRun && updatedServices > 0) {
    await invalidateContentGatewayCache("maintenanceBackfillServiceCreatorMessages");
  }

  return {
    dryRun: options.dryRun,
    overwrite: options.overwrite,
    scannedServices: plan.length,
    updatedServices,
    skippedServices,
    errorCount,
    updatedSamples,
    skippedSamples,
    errorSamples
  };
}

async function maintenanceRestoreServices(payload) {
  assertMaintenanceAccess(payload);

  const restoreRequests = normalizeArray(payload && payload.services)
    .map((service) => sanitizeServiceRestorePayload(service))
    .filter(Boolean);
  const dryRun = normalizeBooleanFlag(payload && payload.dryRun);
  const updatedSamples = [];
  const errorSamples = [];
  let updatedServices = 0;
  let errorCount = 0;

  assertCondition(restoreRequests.length > 0, "至少提供一条待恢复的路线");

  for (const request of restoreRequests) {
    try {
      const existing = await findServiceDoc(request);
      assertCondition(existing, `未找到待恢复路线：${request.slug || request.id || request._id}`);

      const recordId = normalizeText(existing && existing._id) || request._id;
      assertCondition(recordId, "缺少待恢复路线记录 ID");

      const nextData = Object.assign({}, existing, request.data, {
        updatedAt: Date.now(),
        updatedBy: SERVICE_RESTORE_UPDATED_BY
      });
      delete nextData._id;

      if (!dryRun) {
        await db.collection(COLLECTIONS.services).doc(recordId).update({
          data: nextData
        });
      }

      updatedServices += 1;
      appendBackfillSample(updatedSamples, {
        _id: recordId,
        slug: normalizeText(nextData.slug),
        name: normalizeText(nextData.name)
      });
    } catch (error) {
      errorCount += 1;
      appendBackfillSample(errorSamples, {
        _id: request._id,
        slug: request.slug,
        message: error && error.message ? error.message : "service restore failed"
      });
    }
  }

  if (!dryRun && updatedServices > 0) {
    await invalidateContentGatewayCache("maintenanceRestoreServices");
  }

  return {
    dryRun,
    scannedServices: restoreRequests.length,
    updatedServices,
    errorCount,
    updatedSamples,
    errorSamples
  };
}

async function backfillUserTravelersFromOrders(payload) {
  const limit = Math.max(1, Math.min(2000, normalizePositiveInteger(payload && payload.limit, 500)));
  const orderRows = await queryRows(
    "SELECT `orderNo`, `userOpenid`, `travelersJson`, `travelerName`, `travelerPhone`, `createdAtTs`, `updatedAt` FROM `TravelOrder` ORDER BY COALESCE(`updatedAt`, `createdAtTs`) DESC LIMIT {{limit}}",
    { limit }
  );
  const openidFilter = normalizeText(payload && payload.userOpenid);
  const affectedUsers = {};
  let inserted = 0;
  let updated = 0;

  for (const row of orderRows) {
    const userOpenid = normalizeText(row && row.userOpenid);
    if (!userOpenid) {
      continue;
    }
    if (openidFilter && userOpenid !== openidFilter) {
      continue;
    }
    affectedUsers[userOpenid] = true;
    let travelers = normalizeArray(parseJsonText(row && row.travelersJson, []))
      .map((item) => normalizeTravelerSnapshot(item))
      .filter((item) => normalizeText(item.name) || normalizeText(item.phone));
    if (!travelers.length && (normalizeText(row && row.travelerName) || normalizeText(row && row.travelerPhone))) {
      travelers = [{
        name: normalizeText(row && row.travelerName),
        phone: normalizeText(row && row.travelerPhone),
        documentType: "",
        documentNumber: ""
      }];
    }

    for (const traveler of travelers) {
      const profileId = buildTravelerFingerprint(userOpenid, traveler);
      const result = await db.collection(COLLECTIONS.userTravelers)
        .where({
          userOpenid,
          profileId
        })
        .limit(1)
        .get();
      const existing = result && result.data && result.data.length ? result.data[0] : null;
      const nowTs = normalizeNumber(row && (row.updatedAt || row.createdAtTs), Date.now());
      const nextData = {
        travelerId: profileId,
        profileId,
        userOpenid,
        userId: normalizeText(existing && existing.userId),
        name: normalizeText(traveler && traveler.name),
        phone: normalizeText(traveler && traveler.phone),
        phoneMasked: maskPhone(traveler && traveler.phone),
        idType: normalizeText(traveler && traveler.documentType),
        idNumber: normalizeText(traveler && traveler.documentNumber),
        idNumberMasked: maskIdNumber(traveler && traveler.documentNumber),
        gender: normalizeText(traveler && traveler.gender),
        birthday: normalizeText(traveler && traveler.birthday),
        wechat: normalizeText(traveler && traveler.wechat),
        email: normalizeText(traveler && traveler.email),
        note: normalizeText(traveler && traveler.note),
        documents: normalizeArray(traveler && traveler.documents).map((item) => ({
          documentType: normalizeText(item && item.documentType),
          documentNumber: normalizeText(item && item.documentNumber)
        })).filter((item) => item.documentType && item.documentNumber),
        status: "active",
        source: "profile_migration",
        version: normalizeNumber(existing && existing.version, 0) + 1,
        lastUsedAt: nowTs,
        createdAt: normalizeNumber(existing && existing.createdAt, nowTs),
        updatedAt: nowTs,
        createdByOpenid: normalizeText(existing && existing.createdByOpenid) || userOpenid,
        updatedByOpenid: userOpenid
      };
      if (existing && existing._id) {
        await db.collection(COLLECTIONS.userTravelers).doc(existing._id).update({
          data: nextData
        });
        updated += 1;
      } else {
        await db.collection(COLLECTIONS.userTravelers).add({
          data: nextData
        });
        inserted += 1;
      }
    }
  }

  for (const userOpenid of Object.keys(affectedUsers)) {
    const userRows = await db.collection(COLLECTIONS.users)
      .where(
        _.or([
          { openid: userOpenid },
          { _openid: userOpenid }
        ])
      )
      .limit(1)
      .get();
    const user = userRows && userRows.data && userRows.data.length ? userRows.data[0] : null;
    if (!user || !user._id) {
      continue;
    }
    const travelerRows = await db.collection(COLLECTIONS.userTravelers)
      .where({
        userOpenid,
        status: "active"
      })
      .limit(MAX_LIMIT)
      .get();
    await db.collection(COLLECTIONS.users).doc(user._id).update({
      data: {
        travelerCount: normalizeArray(travelerRows && travelerRows.data).length,
        updatedAt: Date.now()
      }
    });
  }

  return {
    scannedOrders: orderRows.length,
    affectedUsers: Object.keys(affectedUsers).length,
    inserted,
    updated
  };
}

async function listUsers(payload) {
  const keyword = normalizeText(payload && payload.keyword).toLowerCase();
  const limit = clampLimit(payload && payload.limit);
  const users = await listCollection(COLLECTIONS.users);

  const items = users
    .map((user) => ({
      id: normalizeText(user._id),
      nickname: normalizeText(user.nickname) || "旅人",
      role: normalizeText(user.role) || "user",
      memberLabel: normalizeText(user.memberLabel) || "野哉会员",
      profileConfigured: Boolean(user.profileConfigured),
      travelerCount: normalizeNumber(user.travelerCount),
      effectiveOrderCount: normalizeNumber(user.effectiveOrderCount),
      effectiveRouteCount: normalizeNumber(user.effectiveRouteCount),
      lastTravelAt: normalizeNumber(user.lastTravelAt),
      createdAt: normalizeNumber(user.createdAt),
      updatedAt: normalizeNumber(user.updatedAt)
    }))
    .filter((user) =>
      matchesKeyword([user.nickname, user.memberLabel, user.id, user.role], keyword)
    );

  if (shouldReturnPagedResult(payload)) {
    return buildPagedResult(items, payload, {
      defaultPageSize: 10,
      defaultSortBy: "updatedAt",
      defaultSortDirection: "desc",
      getSortValue: (item, sortBy) => {
        switch (sortBy) {
          case "nickname":
            return item.nickname;
          case "role":
            return item.role;
          case "memberLabel":
            return item.memberLabel;
          case "profileConfigured":
            return item.profileConfigured;
          case "createdAt":
            return item.createdAt;
          case "travelerCount":
            return item.travelerCount;
          case "effectiveOrderCount":
            return item.effectiveOrderCount;
          case "effectiveRouteCount":
            return item.effectiveRouteCount;
          case "lastTravelAt":
            return item.lastTravelAt;
          case "updatedAt":
            return item.updatedAt;
          default:
            return item.updatedAt;
        }
      },
      getItemKey: (item) => item.id
    });
  }

  return items.slice(0, limit);
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
  return uniqueCaseSensitiveIdentifiers([
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

  const openids = resolveUserOrderOpenids(existing);
  for (const openid of openids) {
    const travelerRows = await db.collection(COLLECTIONS.userTravelers)
      .where({ userOpenid: openid })
      .limit(MAX_LIMIT)
      .get();
    for (const traveler of normalizeArray(travelerRows && travelerRows.data)) {
      if (normalizeText(traveler && traveler._id)) {
        await db.collection(COLLECTIONS.userTravelers).doc(traveler._id).remove();
      }
    }
  }

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
  getSystemHealth: async () => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return getSystemHealth();
  },
  getDashboardSummary: async () => {
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["dashboard:read", "dashboard:read:owned"]);
    return getDashboardSummary(adminUser);
  },
  listServices: async (payload) => {
    const adminUser = await requireAdmin();
    return listServices(payload, adminUser);
  },
  getServiceDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getServiceDetail(payload, adminUser);
  },
  saveService: async (payload) => {
    const adminUser = await requireAdmin();
    return saveService(payload, adminUser);
  },
  listServiceDrafts: async (payload) => {
    const adminUser = await requireAdmin();
    return listServiceDrafts(payload, adminUser);
  },
  getServiceDraft: async (payload) => {
    const adminUser = await requireAdmin();
    return getServiceDraft(payload, adminUser);
  },
  saveServiceDraft: async (payload) => {
    const adminUser = await requireAdmin();
    return saveServiceDraft(payload, adminUser);
  },
  deleteServiceDraft: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteServiceDraft(payload, adminUser);
  },
  restoreServiceDraft: async (payload) => {
    const adminUser = await requireAdmin();
    return restoreServiceDraft(payload, adminUser);
  },
  listServiceDraftVersions: async (payload) => {
    const adminUser = await requireAdmin();
    return listServiceDraftVersions(payload, adminUser);
  },
  restoreServiceDraftVersion: async (payload) => {
    const adminUser = await requireAdmin();
    return restoreServiceDraftVersion(payload, adminUser);
  },
  deleteService: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteService(payload, adminUser);
  },
  listServicePeriods: async (payload) => {
    const adminUser = await requireAdmin();
    return listServicePeriods(payload, adminUser);
  },
  getServicePeriodDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getServicePeriodDetail(payload, adminUser);
  },
  saveServicePeriod: async (payload) => {
    const adminUser = await requireAdmin();
    return saveServicePeriod(payload, adminUser);
  },
  deleteServicePeriod: async (payload) => {
    const adminUser = await requireAdmin();
    return deleteServicePeriod(payload, adminUser);
  },
  listCreators: async (payload) => {
    const adminUser = await requireAdmin();
    return listCreators(payload, adminUser);
  },
  listCreatorProfiles: async (payload) => {
    const adminUser = await requireAdmin();
    return listCreatorProfiles(payload, adminUser);
  },
  listCreatorRegistrations: async (payload) => {
    const adminUser = await requireAdmin();
    return listCreatorRegistrations(payload, adminUser);
  },
  getCreatorRegistrationDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getCreatorRegistrationDetail(payload, adminUser);
  },
  reviewCreatorRegistration: async (payload) => {
    const adminUser = await requireAdmin();
    return reviewCreatorRegistration(payload, adminUser);
  },
  resendCreatorRegistrationApprovalEmail: async (payload) => {
    const adminUser = await requireAdmin();
    return resendCreatorRegistrationApprovalEmail(payload, adminUser);
  },
  resendCreatorRegistrationActivationEmail: async (payload) => {
    const adminUser = await requireAdmin();
    return resendCreatorRegistrationActivationEmail(payload, adminUser);
  },
  retryCreatorRegistrationAccessProvision: async (payload) => {
    const adminUser = await requireAdmin();
    return retryCreatorRegistrationAccessProvision(payload, adminUser);
  },
  getCreatorRelationSummaries: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "creators:read");
    return getCreatorRelationSummaries(payload);
  },
  getCreatorDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getCreatorDetail(payload, adminUser);
  },
  getCreatorProfileDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getCreatorProfileDetail(payload, adminUser);
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
    const adminUser = await requireAdmin();
    return listDestinations(payload, adminUser);
  },
  getDestinationDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getDestinationDetail(payload, adminUser);
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
    const adminUser = await requireAdmin();
    return listIdeas(payload, adminUser);
  },
  getIdeaDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getIdeaDetail(payload, adminUser);
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
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "config:read");
    return getConfigOverview();
  },
  getConfigDetail: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "config:read");
    return getConfigDetail(payload);
  },
  saveConfigDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return saveConfigDetail(payload, adminUser);
  },
  listAdminAccounts: async () => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "admins:read");
    return listAdminAccounts();
  },
  saveAdminAccount: async (payload) => {
    const adminUser = await requireAdmin();
    return saveAdminAccount(payload, adminUser);
  },
  saveCurrentAdminAccountProfile: async (payload) => {
    const adminUser = await requireAdmin();
    return saveCurrentAdminAccountProfile(payload, adminUser);
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
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["ops:read", "orders:read:owned"]);
    return listOrders(payload, adminUser);
  },
  listReferralRelations: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return listReferralRelations(payload);
  },
  listReferralRewardLedgers: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return listReferralRewardLedgers(payload);
  },
  listReferralPayoutAccounts: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return listReferralPayoutAccounts(payload);
  },
  updateReferralRewardLedgerPayoutStatus: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return updateReferralRewardLedgerPayoutStatus(payload, adminUser);
  },
  getOrderDebugToolDetail: async (payload) => {
    const adminUser = await requireAdmin();
    return getOrderDebugToolDetail(payload, adminUser);
  },
  listOrderDebugTestOrders: async (payload) => {
    const adminUser = await requireAdmin();
    return listOrderDebugTestOrders(payload, adminUser);
  },
  runOrderDebugToolAction: async (payload) => {
    const adminUser = await requireAdmin();
    return handleOrderDebugToolAction(payload, adminUser);
  },
  getOrderDetail: async (payload) => {
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["ops:read", "orders:detail:owned"]);
    return getOrderDetail(payload, adminUser);
  },
  adjustOrderPrice: async (payload) => {
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["ops:read", "orders:update:owned"]);
    return adjustOrderPrice(payload, adminUser);
  },
  deleteOrder: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return deleteOrder(payload);
  },
  listUsers: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return listUsers(payload);
  },
  getUserDetail: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return getUserDetail(payload);
  },
  listTravelers: async (payload) => {
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["ops:read", "travelers:read:owned"]);
    return listTravelers(payload, adminUser);
  },
  exportServicePeriodTravelers: async (payload) => {
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["ops:read", "travelers:export:owned"]);
    return listServicePeriodTravelerExportRows(payload, adminUser);
  },
  getTravelerDetail: async (payload) => {
    const adminUser = await requireAdmin();
    assertAnyAdminPermission(adminUser, ["ops:read", "travelers:detail:owned"]);
    return getTravelerDetail(payload, adminUser);
  },
  deleteTraveler: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return deleteTraveler(payload);
  },
  deleteUser: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return deleteUser(payload);
  },
  backfillOrderContactFields: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return backfillOrderContactFields(payload);
  },
  backfillOrderTravelerProfileRefs: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return backfillOrderTravelerProfileRefs(payload);
  },
  backfillTravelerOrderStats: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return backfillTravelerOrderStats(payload);
  },
  backfillUserTravelersFromOrders: async (payload) => {
    const adminUser = await requireAdmin();
    assertAdminPermission(adminUser, "ops:read");
    return backfillUserTravelersFromOrders(payload);
  },
  maintenanceBackfillServiceCreatorMessages: async (payload) => {
    return maintenanceBackfillServiceCreatorMessages(payload);
  },
  maintenanceRestoreServices: async (payload) => {
    return maintenanceRestoreServices(payload);
  },
  uploadImageFromUrl: async (payload) => {
    const adminUser = await requireAdmin();
    assertCondition(
      hasAdminPermission(adminUser, "services:write")
      || hasAdminPermission(adminUser, "services:write:owned")
      || hasAdminPermission(adminUser, "destinations:write")
      || hasAdminPermission(adminUser, "destinations:write:owned")
      || hasAdminPermission(adminUser, "ideas:write")
      || hasAdminPermission(adminUser, "ideas:write:owned")
      || hasAdminPermission(adminUser, "creators:write")
      || hasAdminPermission(adminUser, "creators:write:self"),
      "当前账号没有上传图片的权限"
    );
    return uploadImageFromUrl(payload);
  },
  uploadImageFile: async (payload) => {
    const adminUser = await requireAdmin();
    assertCondition(
      hasAdminPermission(adminUser, "services:write")
      || hasAdminPermission(adminUser, "services:write:owned")
      || hasAdminPermission(adminUser, "destinations:write")
      || hasAdminPermission(adminUser, "destinations:write:owned")
      || hasAdminPermission(adminUser, "ideas:write")
      || hasAdminPermission(adminUser, "ideas:write:owned")
      || hasAdminPermission(adminUser, "creators:write")
      || hasAdminPermission(adminUser, "creators:write:self"),
      "当前账号没有上传图片的权限"
    );
    return uploadImageFile(payload);
  }
};

exports.__test__ = {
  buildAdminPermissions,
  findAdminAccountForUser,
  buildCreatorSlugBase,
  buildDestinationSlugBase,
  buildIdeaSlugBase,
  buildServiceSlugBase,
  createCreatorFromRegistration,
  deliverCreatorRegistrationApprovalEmail,
  getCreatorRegistrationDetail,
  listCreatorRegistrations,
  provisionCreatorRegistrationAccess,
  reviewCreatorRegistration,
  retryCreatorRegistrationAccessProvision,
  resendCreatorRegistrationApprovalEmail,
  resendCreatorRegistrationActivationEmail,
  sendCreatorRegistrationApprovalEmail,
  sendCreatorRegistrationActivationEmail,
  getContentGatewayRefreshActions,
  buildServicePeriodCreateRecord,
  buildSyntheticOrderStatusLogs,
  backfillOrderContactFields,
  backfillOrderTravelerProfileRefs,
  backfillTravelerOrderStats,
  buildServiceCreatorMessageBackfillPlan,
  countUserOrders,
  createSqlRecordId,
  deleteUser,
  deriveServiceCreatorMessageForBackfill,
  getDashboardSummary,
  generateCreatorSlug,
  generateDestinationSlug,
  generateIdeaSlug,
  generateServicePeriodCode,
  generateServiceSlug,
  getCreatorRelationSummaries,
  getOrderDetail,
  adjustOrderPrice,
  getTravelerDetail,
  deleteTraveler,
  getUserDetail,
  getSystemHealth,
  getNextSlugSequence,
  listCreators,
  listDestinations,
  listOrders,
  listServicePeriodTravelerExportRows,
  listReferralPayoutAccounts,
  listReferralRelations,
  listReferralRewardLedgers,
  listServices,
  listServiceDrafts,
  getServiceDraft,
  saveServiceDraft,
  deleteServiceDraft,
  restoreServiceDraft,
  listServiceDraftVersions,
  restoreServiceDraftVersion,
  listTravelers,
  getOrderDebugToolDetail,
  listOrderDebugTestOrders,
  handleOrderDebugToolAction,
  isOrderDebugToolEnabled,
  normalizeTravelerSnapshot,
  updateReferralRewardLedgerPayoutStatus,
  resolvePeriodStatusByRemainingSeats,
  resolveServicePeriodStatus,
  resolveUserOrderOpenids,
  maintenanceBackfillServiceCreatorMessages,
  maintenanceRestoreServices,
  saveService,
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
