const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const {
  normalizeCreatorAssetFields,
  normalizeDestinationAssetFields,
  normalizeHeroSlides,
  normalizeIdeaAssetFields,
  normalizeImageRef,
  normalizeServiceAssetFields
} = require("./image-ref");

const HOME_CREATOR_WALL_LIMIT = 13;

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
const sqlApp = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});
const models = sqlApp.models;
const runSQL = models.$runSQL || models.runSQL;
const CONFIG_COLLECTION = "app_configs";
const HOME_PAGE_CONFIG_KEY = "homePage";
const HOME_PAGE_SNAPSHOT_CONFIG_KEY = "homePageSnapshot";
const HOME_PAGE_SNAPSHOT_VERSION = 1;
const CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const HOME_PAGE_CACHE_TTL_MS = 60 * 1000;
const HOME_PAGE_SNAPSHOT_CACHE_TTL_MS = 60 * 1000;
const HOME_PAGE_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const JOURNEY_PAGE_CACHE_TTL_MS = 30 * 1000;
const JOURNEY_PAGE_SNAPSHOT_CONFIG_KEY = "journeyPageSnapshot";
const JOURNEY_PAGE_SNAPSHOT_VERSION = 1;
const JOURNEY_PAGE_SNAPSHOT_CACHE_TTL_MS = 30 * 1000;
const JOURNEY_PAGE_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
const CREATORS_PAGE_CACHE_TTL_MS = 60 * 1000;
const CREATORS_PAGE_SNAPSHOT_CONFIG_KEY = "creatorsPageSnapshot";
const CREATORS_PAGE_SNAPSHOT_VERSION = 1;
const CREATORS_PAGE_SNAPSHOT_CACHE_TTL_MS = 60 * 1000;
const CREATORS_PAGE_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_CREATORS_PAGE_CACHE_KEY = JSON.stringify({
  destination: "",
  regionCode: "",
  style: ""
});
const COLLECTIONS = {
  creators: "creators",
  destinations: "destinations",
  services: "services",
  ideas: "ideas"
};
const SERVICE_TYPE_OPTIONS = ["在地体验", "短途旅行", "长途旅行", "国际旅行"];
const LEGACY_SERVICE_TYPE_OPTIONS = ["带团旅行", "定制规划", "路线设计"];
const DEFAULT_SERVICE_TYPE = "短途旅行";
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
const DEFAULT_PUBLIC_IDEA_SOURCE_TYPE = "mini";
const SERVICE_GROUP_TYPES = ["regular", "custom"];
const DEFAULT_SERVICE_GROUP_TYPE = "regular";
const CUSTOM_SERVICE_GROUP_TYPE = "custom";
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
const CREATOR_CARD_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  name: true,
  avatar: true,
  stance: true,
  tags: true,
  status: true
};
const CREATOR_NAME_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  name: true,
  status: true
};
const DESTINATION_CARD_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  name: true,
  regionCode: true,
  cover: true,
  description: true,
  status: true
};
const DESTINATION_NAME_COLLECTION_FIELDS = {
  slug: true,
  name: true,
  status: true,
  regionCode: true,
  cover: true
};
const SERVICE_LIST_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  cover: true,
  groupType: true,
  type: true,
  name: true,
  fullGroupSize: true,
  creatorId: true,
  creatorRoles: true,
  creatorMessage: true,
  regionCodes: true,
  destinationSlugs: true,
  summary: true,
  durationTag: true,
  priceLabel: true,
  styles: true,
  tags: true,
  status: true
};
const SERVICE_DETAIL_SUMMARY_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  cover: true,
  coverDetail: true,
  groupType: true,
  type: true,
  name: true,
  fullGroupSize: true,
  creatorId: true,
  creatorRoles: true,
  creatorMessage: true,
  regionCodes: true,
  destinationSlugs: true,
  summary: true,
  styles: true,
  tags: true,
  gallery: true,
  galleryCard: true,
  galleryGroups: true,
  galleryGroupsCard: true,
  status: true
};
const SERVICE_DETAIL_CONTENT_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  cover: true,
  coverDetail: true,
  groupType: true,
  type: true,
  name: true,
  fullGroupSize: true,
  creatorId: true,
  creatorRoles: true,
  creatorMessage: true,
  regionCodes: true,
  destinationSlugs: true,
  summary: true,
  styles: true,
  tags: true,
  groupPeriods: true,
  travelDetail: true,
  status: true
};
const SERVICE_GALLERY_COLLECTION_FIELDS = Object.assign({}, SERVICE_DETAIL_SUMMARY_COLLECTION_FIELDS);
const SERVICE_BOOKING_COLLECTION_FIELDS = {
  id: true,
  slug: true,
  cover: true,
  coverDetail: true,
  groupType: true,
  type: true,
  name: true,
  fullGroupSize: true,
  creatorId: true,
  creatorRoles: true,
  creatorMessage: true,
  regionCodes: true,
  destinationSlugs: true,
  summary: true,
  styles: true,
  tags: true,
  groupPeriods: true,
  status: true
};
const SERVICE_CONSULT_COLLECTION_FIELDS = {
  slug: true,
  travelDetail: true,
  status: true
};
const IDEA_CARD_COLLECTION_FIELDS = {
  slug: true,
  title: true,
  theme: true,
  themeKey: true,
  themeLabel: true,
  summary: true,
  cover: true,
  authorId: true,
  regionCodes: true,
  status: true
};
let contentDataCache = null;
let contentDataPromise = null;
const configValueCache = new Map();
let homePageCache = null;
let homePagePromise = null;
let homePageSnapshotCache = null;
let homePageSnapshotPromise = null;
let journeyPageCache = null;
let journeyPagePromise = null;
let journeyPageSnapshotCache = null;
let journeyPageSnapshotPromise = null;
let customJourneyPageCache = null;
let customJourneyPagePromise = null;
const creatorsPageCache = new Map();
const creatorsPagePromiseMap = new Map();
let creatorsPageSnapshotCache = null;
let creatorsPageSnapshotPromise = null;

function clearGatewayCache() {
  contentDataCache = null;
  contentDataPromise = null;
  configValueCache.clear();
  homePageCache = null;
  homePagePromise = null;
  homePageSnapshotCache = null;
  homePageSnapshotPromise = null;
  journeyPageCache = null;
  journeyPagePromise = null;
  journeyPageSnapshotCache = null;
  journeyPageSnapshotPromise = null;
  customJourneyPageCache = null;
  customJourneyPagePromise = null;
  creatorsPageCache.clear();
  creatorsPagePromiseMap.clear();
  creatorsPageSnapshotCache = null;
  creatorsPageSnapshotPromise = null;

  return {
    cleared: true,
    clearedAt: Date.now()
  };
}

const SERVICE_PERIOD_SQL_FIELDS = "`serviceName`, `versionName`, `durationDays`, `serviceSlug`, `periodCode`, `dateStart`, `dateEnd`, `price`, `minGroup`, `remainingSeats`, `status`, `creatorId`, `singleRoomEnabled`, `singleRoomPrice`, `singleRoomPriceDec`, `singleRoomNotice`, `createdAt`, `updatedAt`, `_id`, `owner`, `_mainDep`, `_openid`, `createBy`, `updateBy`";
const SOLD_ORDER_STATUS_SQL = "COALESCE(`status`, '') IN ('paid', 'traveling', 'completed')";
const DEFAULT_SQL_RETRY_DELAYS_MS = [500];

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

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
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

function isPublicContentActive(item) {
  return normalizeText(item && item.status) !== "inactive";
}

function getSQLRows(result) {
  const data = result && result.data ? result.data : {};
  return Array.isArray(data.executeResultList) ? data.executeResultList : [];
}

function getSqlRetryDelaysMs() {
  const override = normalizeText(process.env.CONTENT_GATEWAY_SQL_RETRY_DELAYS_MS);
  if (!override) {
    return DEFAULT_SQL_RETRY_DELAYS_MS;
  }

  return override
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function isTransientSqlError(error) {
  const message = [
    error && error.message,
    error && error.errMsg,
    error && error.code,
    error && error.requestId
  ].map((item) => String(item || "")).join(" ");

  return /9449|resuming|Database connection failed|connection/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runSQLWithRetry(sql, params) {
  if (typeof runSQL !== "function") {
    throw new Error("models.$runSQL unavailable");
  }

  const delays = getSqlRetryDelaysMs();
  let lastError = null;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await runSQL(sql, params);
    } catch (error) {
      lastError = error;
      if (!isTransientSqlError(error) || attempt >= delays.length) {
        throw error;
      }
      await sleep(delays[attempt]);
    }
  }

  throw lastError;
}

async function keepSqlAlive() {
  const result = await runSQLWithRetry("SELECT 1 AS `keepAlive`");
  const rows = getSQLRows(result);
  return {
    ok: true,
    checkedAt: Date.now(),
    rows: rows.length
  };
}

async function listSqlServicePeriods(serviceSlug) {
  if (!serviceSlug) {
    return [];
  }

  try {
    const result = await runSQLWithRetry(
      `SELECT ${SERVICE_PERIOD_SQL_FIELDS} FROM \`ServicePeriod\` WHERE \`serviceSlug\` = {{serviceSlug}} ORDER BY \`dateStart\` ASC`,
      {
        serviceSlug: String(serviceSlug).trim()
      }
    );
    return filterPublicActivePeriods(getSQLRows(result));
  } catch (error) {
    console.error("Failed to list SQL service periods", {
      serviceSlug,
      error
    });
    return [];
  }
}

async function getSoldCountByPeriodCodeMap(serviceSlug) {
  if (!serviceSlug) {
    return {};
  }

  try {
    const result = await runSQLWithRetry(
      `SELECT \`servicePeriodCode\`, SUM(COALESCE(\`peopleCountInt\`, \`peopleCount\`, 0)) AS \`soldCount\` FROM \`TravelOrder\` WHERE \`serviceSlug\` = {{serviceSlug}} AND ${SOLD_ORDER_STATUS_SQL} GROUP BY \`servicePeriodCode\``,
      {
        serviceSlug: String(serviceSlug).trim()
      }
    );

    return getSQLRows(result).reduce((map, row) => {
      const periodCode = normalizeText(row && row.servicePeriodCode);
      if (!periodCode) {
        return map;
      }

      map[periodCode] = Math.max(0, normalizeNumber(row && row.soldCount, 0));
      return map;
    }, {});
  } catch (error) {
    console.error("Failed to list sold counts for service periods", {
      serviceSlug,
      error
    });
    return {};
  }
}

async function getAllSoldCountByPeriodCodeMap() {
  try {
    const result = await runSQLWithRetry(
      `SELECT \`servicePeriodCode\`, SUM(COALESCE(\`peopleCountInt\`, \`peopleCount\`, 0)) AS \`soldCount\` FROM \`TravelOrder\` WHERE ${SOLD_ORDER_STATUS_SQL} GROUP BY \`servicePeriodCode\``
    );

    return getSQLRows(result).reduce((map, row) => {
      const periodCode = normalizeText(row && row.servicePeriodCode);
      if (!periodCode) {
        return map;
      }

      map[periodCode] = Math.max(0, normalizeNumber(row && row.soldCount, 0));
      return map;
    }, {});
  } catch (error) {
    console.error("Failed to list sold counts for all service periods", error);
    return {};
  }
}

function getJourneyPeriodStatusPriority(status) {
  if (status === "confirmed") {
    return 0;
  }

  if (status === "available") {
    return 1;
  }

  if (status === "soldout") {
    return 2;
  }

  if (status === "closed") {
    return 3;
  }

  return 9;
}

function isCreatorBookablePeriodStatus(status) {
  return status === "confirmed" || status === "available";
}

function isJourneyPageDisplayPeriodStatus(status) {
  return status === "confirmed" || status === "available" || status === "soldout";
}

function sortJourneyPeriods(periods) {
  return (periods || []).slice().sort((left, right) => {
    const dateDiff = String(left && left.dateStart || "").localeCompare(String(right && right.dateStart || ""));
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return getJourneyPeriodStatusPriority(left && left.status) - getJourneyPeriodStatusPriority(right && right.status);
  });
}

function buildPublicGroupPeriods(periods, soldCountMap) {
  return sortJourneyPeriods(
    (periods || []).map((period) => {
      const periodCode = period && (period.periodCode || period.id) ? String(period.periodCode || period.id) : "";
      const soldCount = soldCountMap && periodCode ? soldCountMap[periodCode] || 0 : 0;
      const remainingSeats = Number(period && period.remainingSeats) || 0;
      const totalSeats = Number(period && period.totalSeats) || (remainingSeats + soldCount);

      return buildGroupPeriodDisplay({
        id: periodCode || String(period && period.id || ""),
        periodCode,
        versionName: period && period.versionName ? String(period.versionName) : "",
        durationDays: Number(period && period.durationDays) || 0,
        dateStart: period && period.dateStart ? String(period.dateStart) : "",
        dateEnd: period && period.dateEnd ? String(period.dateEnd) : String(period && period.dateStart || ""),
        price: Number(period && period.price) || 0,
        status: period && period.status ? String(period.status) : "available",
        totalSeats,
        soldCount,
        remainingSeats,
        minGroup: Number(period && period.minGroup) || 1
      });
    })
  );
}

function buildJourneySearchText(service, creator, relatedDestinations, fallbackRegionLabels) {
  const regionLabels = unique(
    (relatedDestinations || []).map((item) => getDestinationRegionLabel(
      resolveDestinationRegionCode(item && item.regionCode, item && item.slug)
    ))
  );
  const effectiveRegionLabels = regionLabels.length ? regionLabels : normalizeArray(fallbackRegionLabels);

  return [
    service && service.name,
    service && service.summary,
    creator && creator.name,
    ...((relatedDestinations || []).map((item) => item && item.name)),
    ...effectiveRegionLabels,
    ...(service && Array.isArray(service.tags) ? service.tags : []),
    ...(service && Array.isArray(service.styles) ? service.styles : [])
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildHomeCreatorCard(creator) {
  const tags = getServiceRouteTags(creator);
  return {
    id: normalizeText(creator && creator.id),
    slug: normalizeText(creator && creator.slug),
    name: normalizeText(creator && creator.name),
    avatar: normalizeImageRef(creator && creator.avatar, "card"),
    stance: normalizeText(creator && creator.stance),
    displayTags: tags.slice(0, 3),
    gridDisplayTags: tags.slice(0, 3)
  };
}

function buildHomeDestinationCard(destination) {
  const regionCode = resolveDestinationRegionCode(destination && destination.regionCode, destination && destination.slug);
  return {
    id: normalizeText(destination && destination.id),
    slug: normalizeText(destination && destination.slug),
    name: normalizeText(destination && destination.name),
    cover: normalizeImageRef(destination && destination.cover, "card"),
    description: normalizeText(destination && destination.description),
    regionCode,
    regionLabel: getDestinationRegionLabel(regionCode)
  };
}

function buildHomeIdeaCard(idea) {
  return {
    slug: normalizeText(idea && idea.slug),
    title: normalizeText(idea && idea.title),
    summary: normalizeText(idea && idea.summary),
    theme: normalizeText(idea && (idea.themeLabel || idea.theme)),
    cover: normalizeImageRef(idea && idea.cover, "card"),
    authorName: normalizeText(idea && idea.authorName),
    sourceType: normalizeText(idea && idea.sourceType),
    wechatArticleUrl: normalizeText(idea && idea.wechatArticleUrl),
    wechatArticleTitle: normalizeText(idea && idea.wechatArticleTitle)
  };
}

function buildHomeServiceCard(service) {
  return {
    id: normalizeText(service && service.id),
    slug: normalizeText(service && service.slug),
    name: normalizeText(service && service.name),
    cover: normalizeImageRef(service && service.cover, "card"),
    summary: normalizeText(service && service.summary),
    priceLabel: normalizeText(service && service.priceLabel),
    durationTag: normalizeText(service && service.durationTag),
    creatorName: normalizeText(service && service.creatorName)
  };
}

function buildJourneyListPeriod(period) {
  return {
    id: normalizeText(period && period.id),
    periodCode: normalizeText(period && period.periodCode),
    versionName: normalizeText(period && period.versionName),
    dateStart: normalizeText(period && period.dateStart),
    dateEnd: normalizeText(period && period.dateEnd),
    price: normalizeNumber(period && period.price, 0),
    status: normalizeText(period && period.status),
    dateLabel: normalizeText(period && period.dateLabel),
    startDateLabel: normalizeText(period && period.startDateLabel),
    endDateLabel: normalizeText(period && period.endDateLabel),
    durationLabel: normalizeText(period && period.durationLabel),
    statusText: normalizeText(period && period.statusText)
  };
}

function buildJourneyCard(service, creator, relatedDestinations, activePeriods) {
  const publicService = buildPublicService(service, {
    creatorName: creator ? creator.name : ""
  });
  const displayPeriod = activePeriods[0] || null;
  const routeTypes = getServiceRouteTags(service);
  const explicitRegionCodes = unique(
    normalizeArray(service && service.regionCodes)
      .map((regionCode) => normalizeDestinationRegionCode(regionCode))
      .filter(Boolean)
  );
  const destinationRegionCodes = explicitRegionCodes.length ? explicitRegionCodes : unique(
    (relatedDestinations || []).map((item) => resolveDestinationRegionCode(item && item.regionCode, item && item.slug))
  );
  const destinationRegionLabels = unique(destinationRegionCodes.map((code) => getDestinationRegionLabel(code)));
  const destinationRegionImageMap = destinationRegionCodes.reduce((result, regionCode) => {
    const matchedDestination = (relatedDestinations || []).find((item) => (
      resolveDestinationRegionCode(item && item.regionCode, item && item.slug) === regionCode
      && normalizeText(item && item.cover)
    ));
    if (matchedDestination) {
      result[regionCode] = normalizeText(matchedDestination.cover);
    }
    return result;
  }, {});

  const displayPeriodForCard = displayPeriod ? buildJourneyListPeriod(displayPeriod) : null;

  return {
    id: normalizeText(publicService && publicService.id),
    slug: normalizeText(publicService && publicService.slug),
    name: normalizeText(publicService && publicService.name),
    cover: normalizeImageRef(publicService && publicService.cover, "card"),
    summary: normalizeText(publicService && publicService.summary),
    creatorName: normalizeText(publicService && publicService.creatorName),
    type: normalizeText(publicService && publicService.type),
    durationTag: normalizeText(publicService && publicService.durationTag),
    priceLabel: normalizeText(publicService && publicService.priceLabel),
    routeTypes,
    primaryRouteType: routeTypes[0] || "",
    activePeriods: activePeriods.map(buildJourneyListPeriod),
    displayPeriod: displayPeriodForCard,
    displayStatus: displayPeriod ? displayPeriod.status : "",
    displayStatusText: displayPeriod ? displayPeriod.statusText : "",
    displayDateStart: displayPeriod ? displayPeriod.dateStart : "",
    displayDateLabel: displayPeriod ? displayPeriod.dateLabel : "",
    displayDurationLabel: (displayPeriod && displayPeriod.durationLabel) || publicService.durationTag || "",
    displayVersionLabel: displayPeriod && displayPeriod.versionName ? displayPeriod.versionName : "",
    destinationNames: (relatedDestinations || []).map((item) => item && item.name).filter(Boolean),
    destinationRegionCodes,
    destinationRegionLabels,
    destinationRegionImageMap,
    searchText: buildJourneySearchText(publicService, creator, relatedDestinations, destinationRegionLabels)
  };
}

function buildCustomJourneyCard(service, creator, relatedDestinations) {
  const publicService = buildPublicService(service, {
    creatorName: creator ? creator.name : ""
  });
  const routeTypes = getServiceRouteTags(service);
  const explicitRegionCodes = unique(
    normalizeArray(service && service.regionCodes)
      .map((regionCode) => normalizeDestinationRegionCode(regionCode))
      .filter(Boolean)
  );
  const destinationRegionCodes = explicitRegionCodes.length ? explicitRegionCodes : unique(
    (relatedDestinations || []).map((item) => resolveDestinationRegionCode(item && item.regionCode, item && item.slug))
  );
  const destinationRegionLabels = unique(destinationRegionCodes.map((code) => getDestinationRegionLabel(code)));

  return {
    id: normalizeText(publicService && publicService.id),
    slug: normalizeText(publicService && publicService.slug),
    name: normalizeText(publicService && publicService.name),
    cover: normalizeImageRef(publicService && publicService.cover, "card"),
    summary: normalizeText(publicService && publicService.summary),
    creatorName: normalizeText(publicService && publicService.creatorName),
    type: normalizeText(publicService && publicService.type),
    durationTag: normalizeText(publicService && publicService.durationTag),
    priceLabel: normalizeText(publicService && publicService.priceLabel),
    routeTypes,
    primaryRouteType: routeTypes[0] || "",
    activePeriods: [],
    displayPeriod: null,
    displayStatus: "available",
    displayStatusText: "支持定制",
    displayDateStart: "",
    displayDateLabel: "按需求定制",
    displayDurationLabel: publicService.durationTag || "",
    displayVersionLabel: "",
    isCustomGroup: true,
    destinationNames: (relatedDestinations || []).map((item) => item && item.name).filter(Boolean),
    destinationRegionCodes,
    destinationRegionLabels,
    destinationRegionImageMap: {},
    searchText: buildJourneySearchText(publicService, creator, relatedDestinations, destinationRegionLabels)
  };
}

function buildJourneyRegionCardImageMap(configValue) {
  return normalizeArray(configValue && configValue.regionCards).reduce((result, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return result;
    }

    const regionCode = normalizeDestinationRegionCode(item.regionCode || item.value);
    const image = normalizeImageRef(item.image || item.cover || item.imageCard, "detail");
    if (!regionCode || !image) {
      return result;
    }

    result[regionCode] = image;
    return result;
  }, {});
}

function buildJourneyRegionOptions(journeys, regionCardImageMap) {
  const availableRegionSet = new Set();
  const fallbackImageMap = {};

  normalizeArray(journeys).forEach((journey) => {
    normalizeArray(journey && journey.destinationRegionCodes).forEach((regionCode) => {
      const normalizedRegionCode = normalizeDestinationRegionCode(regionCode);
      if (!normalizedRegionCode) {
        return;
      }

      availableRegionSet.add(normalizedRegionCode);
      if (!fallbackImageMap[normalizedRegionCode]) {
        fallbackImageMap[normalizedRegionCode] = normalizeText(
          journey && journey.destinationRegionImageMap
            ? journey.destinationRegionImageMap[normalizedRegionCode]
            : ""
        ) || normalizeText(journey && journey.cover);
      }
    });
  });

  return DESTINATION_REGION_OPTIONS
    .filter((item) => availableRegionSet.has(item.value))
    .map((item) => ({
      label: item.label,
      value: item.value,
      image: normalizeText(regionCardImageMap && regionCardImageMap[item.value]) || normalizeText(fallbackImageMap[item.value])
    }));
}

async function listAllSqlServicePeriods(options) {
  try {
    const result = await runSQLWithRetry(
      `SELECT ${SERVICE_PERIOD_SQL_FIELDS} FROM \`ServicePeriod\` ORDER BY \`serviceSlug\` ASC, \`dateStart\` ASC`
    );
    return filterPublicActivePeriods(getSQLRows(result));
  } catch (error) {
    console.error("Failed to list all SQL service periods", error);
    if (options && options.returnNullOnError) {
      return null;
    }
    return [];
  }
}

function calcDurationDays(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) {
    return 0;
  }

  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function getPeriodDurationDays(period) {
  const fromField = Number(period && period.durationDays);
  if (Number.isFinite(fromField) && fromField > 0) {
    return Math.round(fromField);
  }

  return calcDurationDays(period && period.dateStart, period && period.dateEnd);
}

function buildDurationLabelFromPeriods(periods) {
  const activePeriods = filterPublicActivePeriods(periods);
  const uniqueDays = Array.from(
    new Set(
      activePeriods
        .map((period) => getPeriodDurationDays(period))
        .filter((value) => value > 0)
    )
  ).sort((a, b) => a - b);

  if (!uniqueDays.length) {
    return "";
  }

  if (uniqueDays.length === 1) {
    return `${uniqueDays[0]}天`;
  }

  return `${uniqueDays.join("/")}天`;
}

function formatMoneyValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function buildPriceLabelFromPeriods(periods) {
  const prices = filterPublicActivePeriods(periods)
    .map((period) => Number(period && period.price))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!prices.length) {
    return "";
  }

  return `¥${formatMoneyValue(Math.min(...prices))} 起`;
}

function groupSqlPeriodsByServiceSlug(periods) {
  return (periods || []).reduce((result, period) => {
    const serviceSlug = String(period && period.serviceSlug ? period.serviceSlug : "").trim();
    if (!serviceSlug) {
      return result;
    }

    if (!result[serviceSlug]) {
      result[serviceSlug] = [];
    }

    result[serviceSlug].push(period);
    return result;
  }, {});
}

function parseIdeaBody(body) {
  if (!body) {
    return [];
  }

  return String(body)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      if (/^#{1,3}\s+/.test(block)) {
        return {
          id: `block-${index}`,
          type: "heading",
          content: block.replace(/^#{1,3}\s+/, "").trim()
        };
      }

      if (/^>\s?/.test(block)) {
        return {
          id: `block-${index}`,
          type: "quote",
          content: block.replace(/^>\s?/, "").trim()
        };
      }

      return {
        id: `block-${index}`,
        type: "paragraph",
        content: block
      };
    });
}

function normalizeIdeaTheme(themeKeyValue, themeLabelValue, isCustomThemeValue) {
  const rawKey = typeof themeKeyValue === "string" ? themeKeyValue.trim() : "";
  const rawLabel = typeof themeLabelValue === "string" ? themeLabelValue.trim() : "";
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

  return DEFAULT_PUBLIC_IDEA_SOURCE_TYPE;
}

function sanitizeExternalUrl(url) {
  const normalized = normalizeText(url);
  return /^https?:\/\//i.test(normalized) ? normalized : "";
}

function normalizeIdeaThemeDoc(idea) {
  const theme = normalizeIdeaTheme(
    idea && idea.themeKey,
    (idea && (idea.themeLabel || idea.theme)) || "",
    idea && idea.isCustomTheme
  );

  return Object.assign({}, idea, {
    theme: theme.themeLabel,
    themeKey: theme.themeKey,
    themeLabel: theme.themeLabel,
    isCustomTheme: theme.isCustomTheme,
    sourceType: normalizeIdeaSourceType(idea && idea.sourceType),
    regionCodes: normalizeArray(idea && idea.regionCodes)
      .map((regionCode) => normalizeDestinationRegionCode(regionCode))
      .filter(Boolean),
    relatedServiceSlugs: unique((Array.isArray(idea && idea.relatedServiceSlugs) ? idea.relatedServiceSlugs : []).map((item) => String(item || "").trim()).filter(Boolean)),
    excerptBody: normalizeText(idea && idea.excerptBody),
    wechatArticleUrl: sanitizeExternalUrl(idea && idea.wechatArticleUrl),
    wechatArticleTitle: normalizeText(idea && idea.wechatArticleTitle),
    wechatCover: normalizeText(idea && idea.wechatCover),
    publishedAt: normalizeNumber(idea && idea.publishedAt, 0),
    readMoreText: normalizeText(idea && idea.readMoreText) || DEFAULT_IDEA_READ_MORE_TEXT,
    syncStatus: normalizeText(idea && idea.syncStatus) || "draft"
  });
}

function formatPeriodDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function getShanghaiTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function resolvePublicPeriodStatus(period) {
  const manualStatus = normalizeText(period && period.status) === "inactive" ? "inactive" : "available";
  if (manualStatus === "inactive") {
    return "inactive";
  }

  const dateEnd = normalizeText(period && period.dateEnd);
  const today = getShanghaiTodayDateString();
  if (dateEnd && today && dateEnd < today) {
    return "inactive";
  }

  const totalSeats = Math.max(0, normalizeNumber(period && period.totalSeats, 0));
  const soldCount = Math.max(0, normalizeNumber(period && period.soldCount, 0));
  const minGroup = Math.max(1, normalizeNumber(period && period.minGroup, 1));
  const dateStart = normalizeText(period && period.dateStart);

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

function isPublicPeriodActive(period) {
  return resolvePublicPeriodStatus(period) !== "inactive";
}

function filterPublicActivePeriods(periods) {
  return normalizeArray(periods).filter((period) => isPublicPeriodActive(period));
}

function buildGroupPeriodDisplay(period) {
  const startDateLabel = formatPeriodDate(period.dateStart);
  const endDateLabel = formatPeriodDate(period.dateEnd);
  const dateLabel = period.dateStart === period.dateEnd ? startDateLabel : `${startDateLabel} - ${endDateLabel}`;
  const durationDays = getPeriodDurationDays(period);
  const status = resolvePublicPeriodStatus(period);
  let statusText = "可报名";

  if (status === "confirmed") {
    statusText = "确定成行";
  } else if (status === "soldout") {
    statusText = "已报满";
  } else if (status === "closed") {
    statusText = "已截止";
  } else if (status === "inactive") {
    statusText = "下架";
  }

  return Object.assign({}, period, {
    status,
    dateLabel,
    startDateLabel,
    endDateLabel,
    durationDays,
    durationLabel: durationDays > 0 ? `${durationDays}天` : "",
    statusText,
    singleRoomEnabled: normalizeBoolean(period && period.singleRoomEnabled),
    singleRoomPrice: Math.max(0, normalizeNumber(period && (period.singleRoomPriceDec || period.singleRoomPrice), 0)),
    singleRoomNotice: normalizeText(period && period.singleRoomNotice)
  });
}

function getServiceCreatorRoles(service) {
  const customRoles = Array.isArray(service.creatorRoles)
    ? service.creatorRoles.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const serviceType = String(service && service.type ? service.type : "").trim();

  if (customRoles.length) {
    return customRoles;
  }

  if (serviceType === "带团旅行") {
    return ["创作者", "带领者"];
  }

  if (serviceType === "定制规划") {
    return ["创作者", "策划者"];
  }

  if (SERVICE_TYPE_OPTIONS.includes(serviceType)) {
    return ["创作者", "带领者"];
  }

  return ["创作者"];
}

function getServiceTagValue(tags, key) {
  const tag = (tags || []).find((item) => item.key === key);
  return tag ? tag.value : "";
}

function getServiceTimelineDisplayText(timelineText) {
  const normalized = String(timelineText || "").trim();
  return normalized ? normalized.replace(/支付后/g, "报名确认后") : "";
}

function getServiceAdjustmentDisplayText(refundText) {
  const normalized = String(refundText || "").trim();
  return normalized || "如需调整或取消，请尽快联系平台确认当次行程的可调整空间与处理方式，具体以行前确认结果为准。";
}

function getServicePriceLabel(service) {
  const priceLabel = buildPriceLabelFromPeriods(service && service.groupPeriods);
  return priceLabel || normalizeText(service && service.priceLabel);
}

function getServiceDurationTag(service) {
  const durationTag = buildDurationLabelFromPeriods(service && service.groupPeriods);
  return durationTag || normalizeText(service && service.durationTag);
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

function normalizeRouteTags(value, fallbackValue) {
  return unique((value && value.length ? value : fallbackValue) || [])
    .map((item) => {
      const normalized = String(item || "").trim();
      return LEGACY_ROUTE_TAG_ALIASES[normalized] || normalized;
    })
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

function isCustomServiceGroup(service) {
  return normalizeServiceGroupType(service && service.groupType) === CUSTOM_SERVICE_GROUP_TYPE;
}

function isRegularServiceGroup(service) {
  return !isCustomServiceGroup(service);
}

function normalizeServiceContentDoc(service) {
  const normalized = normalizeServiceAssetFields(service);
  const durationTag = getServiceDurationTag(normalized);
  return Object.assign({}, normalized, {
    groupType: normalizeServiceGroupType(normalized && normalized.groupType),
    type: normalizeServiceType(normalized && normalized.type, Object.assign({}, normalized, { durationTag })),
    fullGroupSize: Math.max(0, normalizeNumber(normalized && normalized.fullGroupSize, 0)),
    durationTag,
    priceLabel: getServicePriceLabel(normalized),
    tags: getServiceRouteTags(normalized),
    styles: getServiceRouteTags(normalized)
  });
}

function normalizeDestinationContentDoc(destination) {
  const normalized = normalizeDestinationAssetFields(destination);
  const regionCode = resolveDestinationRegionCode(normalized && normalized.regionCode, normalized && normalized.slug);

  return Object.assign({}, normalized, {
    regionCode,
    regionLabel: getDestinationRegionLabel(regionCode)
  });
}

function buildPublicService(service, overrides) {
  const source = service && typeof service === "object" ? service : {};
  const { groupPeriods, travelDetail, ...rest } = source;
  const durationTag = getServiceDurationTag(source);
  const explicitCreatorMessage = String(source.creatorMessage || "").trim();
  const overview =
    travelDetail && typeof travelDetail === "object" && travelDetail.overview && typeof travelDetail.overview === "object"
      ? travelDetail.overview
      : {};
  const whyJoinText = String(overview.whyJoinText || "").trim();
  const creatorMessage = explicitCreatorMessage
    || (whyJoinText ? whyJoinText.split(/\n\s*\n/)[0].trim() : "")
    || String(source.summary || "").trim();

  return Object.assign({}, rest, {
    groupType: normalizeServiceGroupType(source && source.groupType),
    type: normalizeServiceType(source && source.type, Object.assign({}, source, { durationTag })),
    fullGroupSize: Math.max(0, normalizeNumber(source && source.fullGroupSize, 0)),
    durationTag,
    priceLabel: getServicePriceLabel(source),
    tags: getServiceRouteTags(source),
    styles: getServiceRouteTags(source),
    creatorMessage
  }, overrides || {});
}

function listCreatorRefCandidates(creator) {
  const candidates = [];
  const creatorId = String(creator && creator.id ? creator.id : "").trim();
  const creatorSlug = String(creator && creator.slug ? creator.slug : "").trim();

  if (creatorId) {
    candidates.push(creatorId);
  }
  if (creatorSlug) {
    candidates.push(creatorSlug);
    const slugRef = `creator-${creatorSlug}`;
    if (!candidates.includes(slugRef)) {
      candidates.push(slugRef);
    }
  }

  return candidates;
}

function matchesCreatorRef(creator, ref) {
  const normalizedRef = String(ref || "").trim();
  return normalizedRef ? listCreatorRefCandidates(creator).includes(normalizedRef) : false;
}

function findCreatorByRef(creators, ref) {
  return (creators || []).find((creator) => matchesCreatorRef(creator, ref)) || null;
}

function listCreatorServiceIds(services, creator) {
  return (services || [])
    .filter((service) => service && matchesCreatorRef(creator, service.creatorId) && service.id)
    .map((service) => service.id);
}

function listCreatorRelatedServices(creator, services) {
  return normalizeArray(services).filter((service) => service && matchesCreatorRef(creator, service.creatorId));
}

function listCreatorDestinationSlugs(creator, services) {
  return unique(
    listCreatorRelatedServices(creator, services)
      .flatMap((service) => normalizeArray(service && service.destinationSlugs))
      .map((slug) => normalizeText(slug))
      .filter(Boolean)
  );
}

function listCreatorRegionCodes(creator, services) {
  return unique(
    listCreatorRelatedServices(creator, services)
      .flatMap((service) => normalizeArray(service && service.regionCodes))
      .map((regionCode) => normalizeDestinationRegionCode(regionCode))
      .filter(Boolean)
  );
}

function hasCreatorBookablePeriods(service, soldCountMap) {
  return buildPublicGroupPeriods(service && service.groupPeriods, soldCountMap).some((period) =>
    isCreatorBookablePeriodStatus(period && period.status)
  );
}

function getCreatorTags(creator, services, soldCountMap) {
  const tagStatsMap = {};

  listCreatorRelatedServices(creator, services).forEach((service) => {
    const serviceTags = unique(getServiceRouteTags(service));
    if (!serviceTags.length) {
      return;
    }

    const hasBookablePeriods = hasCreatorBookablePeriods(service, soldCountMap);
    serviceTags.forEach((tag) => {
      if (!tagStatsMap[tag]) {
        tagStatsMap[tag] = {
          tag,
          activeCount: 0,
          totalCount: 0,
          order: ROUTE_TAG_OPTIONS.indexOf(tag)
        };
      }

      tagStatsMap[tag].totalCount += 1;
      if (hasBookablePeriods) {
        tagStatsMap[tag].activeCount += 1;
      }
    });
  });

  return Object.values(tagStatsMap)
    .sort((left, right) => {
      const activeCountDiff = right.activeCount - left.activeCount;
      if (activeCountDiff !== 0) {
        return activeCountDiff;
      }

      const totalCountDiff = right.totalCount - left.totalCount;
      if (totalCountDiff !== 0) {
        return totalCountDiff;
      }

      return left.order - right.order;
    })
    .map((item) => item.tag);
}

function enrichCreatorDoc(creator, services, soldCountMap) {
  return Object.assign({}, creator, {
    tags: getCreatorTags(creator, services, soldCountMap),
    regionCodes: listCreatorRegionCodes(creator, services),
    destinationSlugs: listCreatorDestinationSlugs(creator, services),
    serviceIds: listCreatorServiceIds(services, creator)
  });
}

function enrichDestinationDoc(destination, creators, services) {
  const destinationSlug = destination && destination.slug ? destination.slug : "";
  const relatedServices = (services || []).filter((service) =>
    Array.isArray(service && service.destinationSlugs) && service.destinationSlugs.includes(destinationSlug)
  );
  const relatedCreatorRefs = new Set(relatedServices
    .map((service) => normalizeText(service && service.creatorId))
    .filter(Boolean));
  const relatedCreators = (creators || []).filter((creator) =>
    listCreatorRefCandidates(creator).some((ref) => relatedCreatorRefs.has(ref))
  );

  return Object.assign({}, destination, {
    serviceIds: relatedServices.map((service) => service.id).filter(Boolean),
    creatorCount: relatedCreators.length,
    routeCount: relatedServices.length
  });
}

function getItineraryDayCount(service) {
  const periods = service.groupPeriods || [];
  const firstPeriod = periods[0];

  if (firstPeriod && firstPeriod.dateStart && firstPeriod.dateEnd) {
    const start = new Date(firstPeriod.dateStart);
    const end = new Date(firstPeriod.dateEnd);
    const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    if (Number.isFinite(diff) && diff > 0) {
      return Math.min(Math.max(diff, 3), 8);
    }
  }

  return 5;
}

function getHighlightImages(photoBaseList, startIndex, count) {
  const images = (photoBaseList || []).slice(startIndex, startIndex + count).filter(Boolean);
  if (images.length) {
    return images;
  }

  return (photoBaseList || []).slice(0, 1).filter(Boolean);
}

function buildDefaultHighlights(service, tags, photoBaseList, meetingPoint, dayCount) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const styles = Array.isArray(service.styles) ? service.styles : [];
  const highlightTheme = styles[0] || "在地体验";
  const secondaryTheme = styles[1] || "路线推进";

  return [
    {
      id: `${service.slug}-highlight-core`,
      title: `${service.name}的核心体验`,
      description: service.creatorQuote || service.summary || "围绕目的地、人物与在地经验展开本次行程安排。",
      images: getHighlightImages(photoBaseList, 0, 2)
    },
    {
      id: `${service.slug}-highlight-method`,
      title: `围绕${highlightTheme}建立可执行的行程节奏`,
      description:
        deliverables.length > 0
          ? `本次内容将结合${deliverables.join("、")}来组织每日推进方式，确保信息、体验与节奏都能落到具体安排。`
          : `围绕${highlightTheme}与${secondaryTheme}安排每日节奏，兼顾实际行进效率与内容承载。`,
      images: getHighlightImages(photoBaseList, 1, 2)
    },
    {
      id: `${service.slug}-highlight-plan`,
      title: `${meetingPoint || "指定集合点"}出发的完整安排`,
      description: `当前页面按 ${dayCount} 天结构展示亮点、行程、费用与须知，方便你快速判断是否适合报名。`,
      images: getHighlightImages(photoBaseList, 2, 2)
    }
  ];
}

function buildDefaultItinerary(service, tags, dayCount) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint") || "指定集合点";
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const styles = Array.isArray(service.styles) ? service.styles : [];
  const suitable = Array.isArray(service.suitable) ? service.suitable : [];
  const days = [];

  for (let day = 1; day <= dayCount; day += 1) {
    const isFirstDay = day === 1;
    const isLastDay = day === dayCount;
    const isMiddleDay = day === Math.ceil(dayCount / 2);
    const styleLabel = styles.length ? styles[(day - 1) % styles.length] : "在地体验";
    const focusDeliverable = deliverables.length ? deliverables[(day - 1) % deliverables.length] : "行程内容";

    let dayTitle = `${service.name} 第${day}日推进`;
    if (isFirstDay) {
      dayTitle = `${meetingPoint}集合，确认本次安排`;
    } else if (isLastDay) {
      dayTitle = "回到城市收束，完成本次行程复盘";
    }

    const modules = [
      {
        type: "schedule",
        title: "当日行程",
        content: isFirstDay
          ? `在${meetingPoint}完成集合与签到，确认成员信息、节奏安排和行前说明，围绕“${service.summary}”同步本次路线重点。`
          : isLastDay
            ? "上午完成最后一段内容或收尾安排，随后返回集合城市，整理记录与反馈，确认后续交付或复盘方式。"
            : `围绕${styleLabel}推进当日节奏，结合${focusDeliverable}安排步行、停留、观察或沟通时段，确保内容体验与实际推进保持平衡。`
      },
      {
        type: "transport",
        title: "交通",
        content: isFirstDay
          ? `往返${meetingPoint}的大交通需自理，集合后按现场通知统一衔接后续安排。`
          : isLastDay
            ? "根据当日收尾节点统一返程或原地解散，具体集合时间以领队通知为准。"
            : "以步行、短驳接驳或现场协调交通为主，实际节奏会根据当日路况与团队状态微调。"
      },
      {
        type: "meals",
        title: "餐食",
        content: "餐食安排以当天节点为准，行进过程中建议自备轻补给和饮水，避免临时断档。"
      },
      {
        type: "accommodation",
        title: "住宿",
        content:
          getServiceCreatorRoles(service).includes("带领者")
            ? "如涉及住宿或落脚点，将按当日推进节点安排，并以最终行前通知为准。"
            : "如涉及留宿或驻点，将根据最终确认方案执行；部分服务类型可能不含住宿。"
      }
    ];

    if (isMiddleDay) {
      modules.push({
        type: "tips",
        title: "温馨提示",
        content: suitable.length
          ? `建议参与者具备“${suitable[0]}”的基础条件，按领队节奏推进并留出体力缓冲。`
          : "当天请重点关注补水、保暖和节奏控制，尽量避免体能透支。"
      });
    }

    if (!isFirstDay && !isLastDay && day % 2 === 0) {
      modules.push({
        type: "support",
        title: "补给说明",
        content: "当天补给与临时调整将根据现场条件处理，建议把常用物品放在容易取用的位置。"
      });
    }

    days.push({
      key: `${service.slug}-day-${day}`,
      day,
      title: dayTitle,
      modules
    });
  }

  return { days };
}

function buildDefaultCosts(service, tags, dayCount) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint");
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const exclusions = Array.isArray(service.exclusions) ? service.exclusions : [];

  const include = [
    {
      label: "服务",
      content:
        deliverables.length > 0
          ? `包含${deliverables.slice(0, 3).join("、")}等当前页面所述的主要服务内容。`
          : "包含页面当前展示的主要服务内容与基础安排。"
    },
    {
      label: "带领",
      content: "包含创作者/领队沟通、流程说明与必要的过程协作安排。"
    },
    {
      label: "节奏",
      content: `当前页面展示的是本次行程的参考节奏，具体集合细节与行前准备会在确认后同步。`
    }
  ];

  if (meetingPoint) {
    include.unshift({
      label: "集合",
      content: `${meetingPoint}作为默认集合信息参考，最终以实际确认安排为准。`
    });
  }

  const exclude = exclusions.length
    ? exclusions.map((item, index) => ({
        label: String(item).replace(/[、，,\s].*$/, "").slice(0, 4) || `不含${index + 1}`,
        content: `${item}相关费用需根据实际情况自行承担。`
      }))
    : [
        {
          label: "自理",
          content: "未明确列入“费用包含”的个人消费及额外需求，默认需自行承担。"
        }
      ];

  return {
    include,
    exclude,
    refundRules: [
      {
        days: "规则说明",
        percent: getServiceAdjustmentDisplayText(service.refund)
      }
    ]
  };
}

function buildDefaultNotices(service, tags) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint") || "指定集合点";
  const suggestedAge = getServiceTagValue(tags, "suggestedAge");
  const registrationDeadline = getServiceTagValue(tags, "registrationDeadline");
  const suitable = Array.isArray(service.suitable) ? service.suitable : [];
  const notSuitable = Array.isArray(service.notSuitable) ? service.notSuitable : [];

  return [
    {
      key: "traffic",
      title: "关于交通",
      content: registrationDeadline
        ? `建议围绕${meetingPoint}提前规划交通，并尽量在${registrationDeadline}前完成最终确认，预留必要的时间缓冲。`
        : `建议提前规划前往${meetingPoint}的交通，并预留必要的时间缓冲，以免影响集合安排。`
    },
    {
      key: "local",
      title: "关于当地",
      content: "请尊重当地生活节奏与现场规则。具体在地安排会根据目的地情况、创作者节奏与出行时间进一步确认。"
    },
    {
      key: "safety",
      title: "安全告知",
      content:
        suitable.length || notSuitable.length
          ? `建议优先满足“${suitable[0] || "具备基本体力"}”等条件参与${suggestedAge ? `，建议年龄参考为${suggestedAge}` : ""}；若存在“${notSuitable[0] || "特殊限制"}”等情况，请在确认前先沟通。`
          : `参与前请确认自身状态与行程强度匹配${suggestedAge ? `，建议年龄参考为${suggestedAge}` : ""}，必要时提前沟通特殊情况。`
    },
    {
      key: "packing",
      title: "准备清单",
      content: `请结合“${getServiceTimelineDisplayText(service.timeline)}”与“${service.revision}”安排，提前准备个人证件、常用物品及页面说明中提到的必要装备。`
    }
  ];
}

function buildOverviewWhyJoinText(service) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const quote = String(service.creatorQuote || "").trim();
  const summary = String(service.summary || "").trim();
  const intro = quote || summary || "把行程的重点体验、节奏与方法落到可执行的安排里。";
  const deliverableLine = deliverables.length
    ? `\n\n你将围绕${deliverables.slice(0, 4).join("、")}展开体验与练习，把收获带回日常。`
    : "";

  return intro + deliverableLine;
}

function buildOverviewSuitableText(service) {
  if (service && service.suitableDetail) {
    return service.suitableDetail;
  }

  const list = Array.isArray(service && service.suitable) ? service.suitable : [];
  const bulletLine = list.length > 0 ? `· ${list.join("\n· ")}\n\n` : "";
  const paragraph1 =
    "这段旅程更适合能接受一定不确定性、愿意按领队节奏推进的旅人。行程中可能包含连续多日行走、早晚温差与天气变化，部分路段对体能与耐心都有要求；如果你更在意慢下来观察、记录与在地体验，会更容易融入这次行程的节奏。";
  const paragraph2 =
    "如果你愿意在路上保持补水、保暖与体力分配，并接受根据路况与团队状态做的小幅调整，会获得更完整、更松弛的体验。";

  return bulletLine + paragraph1 + "\n\n" + paragraph2;
}

function buildServiceOverview(service, tags, photoBaseList, highlights) {
  const highlightFirstImage =
    highlights && highlights[0] && highlights[0].images && highlights[0].images[0]
      ? highlights[0].images[0]
      : "";
  const coverImage = highlightFirstImage || (photoBaseList || [])[0] || "";

  return {
    coverImage,
    whyJoinText: buildOverviewWhyJoinText(service),
    suitableTitle: "这段旅程适合谁",
    suitableText: buildOverviewSuitableText(service)
  };
}

function buildServiceTravelDetail(service, tags, photoBaseList) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint");
  const dismissalPoint = getServiceTagValue(tags, "dismissalPoint");
  const dayCount = getItineraryDayCount(service);
  const highlights = buildDefaultHighlights(service, tags, photoBaseList, meetingPoint, dayCount);

  return {
    id: service.id,
    title: service.name,
    meetingPoint,
    dismissalPoint,
    sections: [
      { key: "overview", title: "概况", anchorId: "section_overview" },
      { key: "highlights", title: "亮点", anchorId: "section_highlights" },
      { key: "itinerary", title: "行程", anchorId: "section_itinerary" },
      { key: "notices", title: "须知", anchorId: "section_notices" }
    ],
    overview: buildServiceOverview(service, tags, photoBaseList, highlights),
    highlights,
    itinerary: buildDefaultItinerary(service, tags, dayCount),
    itineraryVersions: [],
    costs: buildDefaultCosts(service, tags, dayCount),
    notices: buildDefaultNotices(service, tags)
  };
}

async function listCollection(name, options) {
  const fieldSpec = options && options.fieldSpec ? options.fieldSpec : null;

  try {
    const rows = [];
    let offset = 0;

    while (true) {
      let query = db.collection(name);
      if (fieldSpec) {
        query = query.field(fieldSpec);
      }

      const result = await query.skip(offset).limit(100).get();
      const batch = result.data || [];
      rows.push(...batch);

      if (batch.length < 100) {
        break;
      }

      offset += batch.length;
    }

    return rows.filter((item) => isPublicContentActive(item));
  } catch (error) {
    return [];
  }
}

async function listCollectionHead(name, limit, options) {
  const fieldSpec = options && options.fieldSpec ? options.fieldSpec : null;

  try {
    let query = db.collection(name);
    if (fieldSpec) {
      query = query.field(fieldSpec);
    }

    const result = await query.limit(Math.max(0, Number(limit) || 0)).get();
    return (result.data || []).filter((item) => isPublicContentActive(item));
  } catch (error) {
    return [];
  }
}

async function listCollectionByFieldValues(name, fieldName, values, options) {
  const fieldSpec = options && options.fieldSpec ? options.fieldSpec : null;
  const includeInactive = Boolean(options && options.includeInactive);
  const normalizedValues = unique((values || []).map((value) => normalizeText(value)).filter(Boolean));
  if (!normalizedValues.length) {
    return [];
  }

  try {
    const docMap = new Map();
    const batchSize = 20;

    for (let index = 0; index < normalizedValues.length; index += batchSize) {
      const batchValues = normalizedValues.slice(index, index + batchSize);
      let query = db.collection(name).where({
        [fieldName]: _.in(batchValues)
      });
      if (fieldSpec) {
        query = query.field(fieldSpec);
      }

      const result = await query.get();
      (result.data || []).forEach((item) => {
        const key = normalizeText(item && item[fieldName]);
        if (key) {
          docMap.set(key, item);
        }
      });
    }

    return normalizedValues
      .map((value) => docMap.get(value))
      .filter((item) => item && (includeInactive || isPublicContentActive(item)));
  } catch (error) {
    return [];
  }
}

function listCollectionBySlugs(name, slugs, options) {
  return listCollectionByFieldValues(name, "slug", slugs, options);
}

async function listCreatorsByRefs(refs, options) {
  const [creatorsBySlug, creatorsById] = await Promise.all([
    listCollectionByFieldValues(COLLECTIONS.creators, "slug", refs, options),
    listCollectionByFieldValues(COLLECTIONS.creators, "id", refs, options)
  ]);
  const creatorMap = new Map();

  creatorsBySlug.concat(creatorsById).forEach((creator) => {
    const creatorId = normalizeText(creator && creator.id);
    const creatorSlug = normalizeText(creator && creator.slug);
    const key = creatorSlug || creatorId;
    if (key && !creatorMap.has(key)) {
      creatorMap.set(key, creator);
    }
  });

  return Array.from(creatorMap.values());
}

function mergeCreatorResolverPool(primaryCreators, secondaryCreators) {
  const creatorMap = new Map();

  normalizeArray(primaryCreators)
    .concat(normalizeArray(secondaryCreators))
    .forEach((creator) => {
      if (!creator) {
        return;
      }

      const normalizedCreator = normalizeCreatorAssetFields(creator);
      const creatorRefs = listCreatorRefCandidates(normalizedCreator);
      const key = creatorRefs[0];
      if (!key || creatorMap.has(key)) {
        return;
      }

      creatorMap.set(key, normalizedCreator);
    });

  return Array.from(creatorMap.values());
}

function takeActiveTopUp(items, existingItems, limit) {
  const selected = Array.isArray(existingItems) ? existingItems.slice() : [];
  const maxCount = Number.isFinite(limit) ? Math.max(limit, 0) : 0;
  if (!maxCount) {
    return [];
  }

  const existingSlugs = new Set(selected.map((item) => normalizeText(item && item.slug)).filter(Boolean));
  const sourceItems = Array.isArray(items) ? items : [];

  for (let index = 0; index < sourceItems.length && selected.length < maxCount; index += 1) {
    const item = sourceItems[index];
    const slug = normalizeText(item && item.slug);
    if (!slug || existingSlugs.has(slug) || !isPublicContentActive(item)) {
      continue;
    }

    existingSlugs.add(slug);
    selected.push(item);
  }

  return selected.slice(0, maxCount);
}

async function loadHomePageCollectionsWithConfig(homeConfig) {
  const featuredCreatorSlugs = normalizeArray(homeConfig && homeConfig.featuredCreatorSlugs);
  const featuredDestinationSlugs = normalizeArray(homeConfig && homeConfig.featuredDestinationSlugs);
  const featuredIdeaSlugs = normalizeArray(homeConfig && homeConfig.featuredIdeaSlugs);
  const configuredServiceSlugs = unique(
    normalizeArray(homeConfig && homeConfig.featuredServiceSlugs)
      .concat(normalizeArray(homeConfig && homeConfig.recentServiceSlugs))
      .concat(normalizeArray(homeConfig && homeConfig.specialProjectServiceSlugs))
  );

  const [
    exactFeaturedCreators,
    exactFeaturedDestinations,
    exactFeaturedIdeas,
    exactConfiguredServices,
    fallbackCreators,
    fallbackDestinations,
    fallbackIdeas,
    fallbackServices,
    allServices
  ] = await Promise.all([
    listCollectionBySlugs(COLLECTIONS.creators, featuredCreatorSlugs, { fieldSpec: CREATOR_CARD_COLLECTION_FIELDS }),
    listCollectionBySlugs(COLLECTIONS.destinations, featuredDestinationSlugs, { fieldSpec: DESTINATION_CARD_COLLECTION_FIELDS }),
    listCollectionBySlugs(COLLECTIONS.ideas, featuredIdeaSlugs, { fieldSpec: IDEA_CARD_COLLECTION_FIELDS }),
    listCollectionBySlugs(COLLECTIONS.services, configuredServiceSlugs, { fieldSpec: SERVICE_LIST_COLLECTION_FIELDS }),
    listCollectionHead(COLLECTIONS.creators, HOME_CREATOR_WALL_LIMIT, { fieldSpec: CREATOR_CARD_COLLECTION_FIELDS }),
    listCollectionHead(COLLECTIONS.destinations, 8, { fieldSpec: DESTINATION_CARD_COLLECTION_FIELDS }),
    listCollectionHead(COLLECTIONS.ideas, 6, { fieldSpec: IDEA_CARD_COLLECTION_FIELDS }),
    listCollectionHead(COLLECTIONS.services, 12, { fieldSpec: SERVICE_LIST_COLLECTION_FIELDS }),
    listCollection(COLLECTIONS.services, { fieldSpec: SERVICE_LIST_COLLECTION_FIELDS })
  ]);

  const normalizedAllServices = allServices.map(normalizeServiceContentDoc);
  const normalizedFeaturedCreators = exactFeaturedCreators
    .map(normalizeCreatorAssetFields)
    .map((creator) => Object.assign({}, creator, {
      tags: getCreatorTags(creator, normalizedAllServices)
    }));
  const normalizedFallbackCreators = fallbackCreators
    .map(normalizeCreatorAssetFields)
    .map((creator) => Object.assign({}, creator, {
      tags: getCreatorTags(creator, normalizedAllServices)
    }));
  const normalizedFeaturedDestinations = exactFeaturedDestinations.map(normalizeDestinationContentDoc);
  const normalizedFallbackDestinations = fallbackDestinations.map(normalizeDestinationContentDoc);
  const normalizedFeaturedIdeas = exactFeaturedIdeas.map(normalizeIdeaAssetFields).map(normalizeIdeaThemeDoc);
  const normalizedFallbackIdeas = fallbackIdeas.map(normalizeIdeaAssetFields).map(normalizeIdeaThemeDoc);
  const normalizedConfiguredServices = exactConfiguredServices.map(normalizeServiceContentDoc);
  const normalizedFallbackServices = fallbackServices.map(normalizeServiceContentDoc);

  const featuredCreators = takeActiveTopUp(normalizedFallbackCreators, normalizedFeaturedCreators, HOME_CREATOR_WALL_LIMIT);
  const featuredDestinations = takeActiveTopUp(normalizedFallbackDestinations, normalizedFeaturedDestinations, 4);
  const featuredIdeasBase = takeActiveTopUp(normalizedFallbackIdeas, normalizedFeaturedIdeas, 3);
  const servicePool = takeActiveTopUp(normalizedFallbackServices, normalizedConfiguredServices, 12);
  const creatorRefs = unique(
    featuredCreators
      .map((creator) => creator && (creator.slug || creator.id))
      .concat(servicePool.map((service) => service && service.creatorId))
      .concat(featuredIdeasBase.map((idea) => idea && idea.authorId))
  );
  const creatorResolverPool = featuredCreators.concat(
    await listCreatorsByRefs(creatorRefs, {
      fieldSpec: CREATOR_NAME_COLLECTION_FIELDS,
      includeInactive: true
    })
  );
  const featuredIdeas = featuredIdeasBase.map((idea) => {
    const author = findCreatorByRef(creatorResolverPool, idea.authorId);
    return Object.assign({}, idea, {
      authorName: author ? author.name : ""
    });
  });

  ensureContentCollections({
    creators: featuredCreators,
    destinations: featuredDestinations,
    services: servicePool,
    ideas: featuredIdeas
  });

  return {
    creators: creatorResolverPool,
    services: servicePool,
    featuredCreators,
    featuredDestinations,
    featuredIdeas
  };
}

async function loadJourneyPageCollections() {
  const [rawCreators, rawDestinations, rawServices] = await Promise.all([
    listCollection(COLLECTIONS.creators, { fieldSpec: CREATOR_NAME_COLLECTION_FIELDS }),
    listCollection(COLLECTIONS.destinations, { fieldSpec: DESTINATION_NAME_COLLECTION_FIELDS }),
    listCollection(COLLECTIONS.services, { fieldSpec: SERVICE_LIST_COLLECTION_FIELDS })
  ]);
  const services = rawServices.map(normalizeServiceContentDoc);
  const linkedCreators = await listCreatorsByRefs(
    unique(services.map((service) => normalizeText(service && service.creatorId)).filter(Boolean)),
    {
      fieldSpec: CREATOR_NAME_COLLECTION_FIELDS,
      includeInactive: true
    }
  );

  return {
    creators: mergeCreatorResolverPool(rawCreators, linkedCreators),
    destinations: rawDestinations.map(normalizeDestinationAssetFields),
    services
  };
}

async function findCollectionDocBySlug(collectionName, slug, options) {
  const normalizedSlug = normalizeText(slug);
  if (!normalizedSlug) {
    return null;
  }

  try {
    let query = db.collection(collectionName).where({ slug: normalizedSlug }).limit(1);
    if (options && options.fieldSpec) {
      query = query.field(options.fieldSpec);
    }

    const result = await query.get();
    return result.data && result.data.length ? result.data[0] : null;
  } catch (error) {
    return null;
  }
}

async function findPublicIdeaBySlug(slug) {
  const idea = await findCollectionDocBySlug(COLLECTIONS.ideas, slug);
  if (!idea || !isPublicContentActive(idea)) {
    return null;
  }

  return normalizeIdeaThemeDoc(normalizeIdeaAssetFields(idea));
}

async function readConfigDoc(key) {
  const normalizedKey = normalizeText(key);
  if (!normalizedKey) {
    return null;
  }

  const result = await db.collection(CONFIG_COLLECTION).where({ key: normalizedKey }).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function getConfigValue(key) {
  const cached = configValueCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const doc = await readConfigDoc(key);
    if (!doc) {
      configValueCache.set(key, {
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
        value: null
      });
      return null;
    }

    const value = doc.value && typeof doc.value === "object" ? doc.value : doc;
    configValueCache.set(key, {
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
      value
    });
    return value;
  } catch (error) {
    return null;
  }
}

async function saveConfigValue(key, value) {
  const normalizedKey = normalizeText(key);
  if (!normalizedKey || !isPlainObject(value)) {
    return null;
  }

  const now = Date.now();
  const nextDoc = {
    key: normalizedKey,
    value,
    updatedAt: now
  };
  const existing = await readConfigDoc(normalizedKey);
  configValueCache.delete(normalizedKey);

  if (!existing) {
    const createResult = await db.collection(CONFIG_COLLECTION).add({
      data: Object.assign({}, nextDoc, {
        createdAt: now
      })
    });
    return Object.assign({}, nextDoc, {
      _id: createResult && createResult._id,
      createdAt: now
    });
  }

  await db.collection(CONFIG_COLLECTION).doc(existing._id).update({
    data: nextDoc
  });
  return Object.assign({}, existing, nextDoc);
}

function buildOptionList(items, mode) {
  return [{ label: "全部", value: "" }].concat(
    (items || []).map((item) => {
      if (item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "label") && Object.prototype.hasOwnProperty.call(item, "value")) {
        return {
          label: item.label,
          value: item.value
        };
      }

      if (mode === "destination") {
        return {
          label: item.name,
          value: item.slug
        };
      }

      return {
        label: item,
        value: item
      };
    })
  );
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeSelectedValue(options, value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return (options || []).some((item) => item && item.value === normalized) ? normalized : "";
}

function buildDestinationRegionCodeMap(destinations) {
  return (destinations || []).reduce((map, destination) => {
    const slug = normalizeText(destination && destination.slug);
    if (!slug) {
      return map;
    }

    map[slug] = resolveDestinationRegionCode(destination && destination.regionCode, slug);
    return map;
  }, {});
}

function getServiceDestinationRegionCodes(service, destinationRegionCodeMap) {
  const explicitRegionCodes = unique(
    normalizeArray(service && service.regionCodes)
      .map((regionCode) => normalizeDestinationRegionCode(regionCode))
      .filter(Boolean)
  );
  if (explicitRegionCodes.length) {
    return explicitRegionCodes;
  }

  return unique(
    normalizeArray(service && service.destinationSlugs)
      .map((slug) => normalizeText(slug))
      .map((slug) => (slug ? normalizeDestinationRegionCode(destinationRegionCodeMap && destinationRegionCodeMap[slug], slug) : ""))
      .filter(Boolean)
  );
}

function getCreatorRelatedServices(creator, services, destinationRegionCodeMap, filters) {
  const requestedDestination = normalizeText(filters && filters.destination);
  const requestedRegionCode = normalizeDestinationRegionCode(filters && filters.regionCode);

  return listCreatorRelatedServices(creator, services).filter((service) => {

    const destinationSlugs = normalizeArray(service.destinationSlugs).map((slug) => normalizeText(slug)).filter(Boolean);
    if (requestedDestination && !destinationSlugs.includes(requestedDestination)) {
      return false;
    }

    if (requestedRegionCode) {
      const regionCodes = getServiceDestinationRegionCodes(service, destinationRegionCodeMap);
      if (!regionCodes.includes(requestedRegionCode)) {
        return false;
      }
    }

    return true;
  });
}

function filterCreators(creators, services, destinationRegionCodeMap, options) {
  const filters = options || {};
  return (creators || []).filter((creator) => {
    if (!listCreatorRelatedServices(creator, services).length) {
      return false;
    }

    const matchStyle = filters.style ? normalizeArray(creator && creator.tags).includes(filters.style) : true;
    if (!matchStyle) {
      return false;
    }

    if (!filters.destination && !filters.regionCode) {
      return true;
    }

    return getCreatorRelatedServices(creator, services, destinationRegionCodeMap, filters).length > 0;
  });
}

function filterDestinations(destinations, services, options) {
  const filters = options || {};
  const keyword = String(filters.search || "").trim();
  const tag = String(filters.tag || "").trim();
  const regionCode = normalizeDestinationRegionCode(filters.regionCode);

  return (destinations || []).filter((destination) => {
    const matchKeyword = keyword
      ? String(destination.name || "").includes(keyword) || String(destination.description || "").includes(keyword)
      : true;
    const matchRegion = regionCode ? resolveDestinationRegionCode(destination && destination.regionCode, destination && destination.slug) === regionCode : true;
    const matchTag = tag
      ? (services || []).some((service) =>
          Array.isArray(service && service.destinationSlugs)
          && service.destinationSlugs.includes(destination.slug)
          && getServiceRouteTags(service).includes(tag)
        )
      : true;

    return matchKeyword && matchRegion && matchTag;
  });
}

function filterServices(services, options) {
  const filters = options || {};
  return (services || []).filter((service) => {
    const matchDestination = filters.destinationSlug ? (service.destinationSlugs || []).includes(filters.destinationSlug) : true;
    const matchType = filters.type ? normalizeServiceType(service && service.type, service) === filters.type : true;
    const targetTag = String(filters.tag || filters.style || "").trim();
    const matchTag = targetTag ? getServiceRouteTags(service).includes(targetTag) : true;
    return matchDestination && matchType && matchTag;
  });
}

function buildCreatorDestinationOptions(destinations, creators, services, destinationRegionCodeMap, filters) {
  const matchedCreators = filterCreators(creators, services, destinationRegionCodeMap, {
    style: filters && filters.style,
    regionCode: filters && filters.regionCode
  });
  const destinationSlugSet = new Set();

  matchedCreators.forEach((creator) => {
    getCreatorRelatedServices(creator, services, destinationRegionCodeMap, {
      regionCode: filters && filters.regionCode
    }).forEach((service) => {
      normalizeArray(service && service.destinationSlugs).forEach((slug) => {
        const normalizedSlug = normalizeText(slug);
        if (normalizedSlug) {
          destinationSlugSet.add(normalizedSlug);
        }
      });
    });
  });

  return buildOptionList(
    (destinations || []).filter((destination) => destinationSlugSet.has(destination.slug)),
    "destination"
  );
}

function buildCreatorRegionOptions(destinations, creators, services, destinationRegionCodeMap, filters, regionCardImageMap) {
  const matchedCreators = filterCreators(creators, services, destinationRegionCodeMap, {
    style: filters && filters.style,
    destination: filters && filters.destination
  });
  const destinationsBySlug = normalizeArray(destinations).reduce((result, destination) => {
    const slug = normalizeText(destination && destination.slug);
    if (slug) {
      result[slug] = destination;
    }
    return result;
  }, {});
  const regionMetaMap = {};

  matchedCreators.forEach((creator) => {
    const creatorRegionSet = new Set();

    getCreatorRelatedServices(creator, services, destinationRegionCodeMap, {
      destination: filters && filters.destination
    }).forEach((service) => {
      getServiceDestinationRegionCodes(service, destinationRegionCodeMap).forEach((regionCode) => {
        const normalizedRegionCode = normalizeDestinationRegionCode(regionCode);
        if (!normalizedRegionCode) {
          return;
        }

        creatorRegionSet.add(normalizedRegionCode);
        if (!regionMetaMap[normalizedRegionCode]) {
          regionMetaMap[normalizedRegionCode] = {
            count: 0,
            image: ""
          };
        }

        if (!regionMetaMap[normalizedRegionCode].image) {
          const destinationImage = normalizeArray(service && service.destinationSlugs)
            .map((slug) => destinationsBySlug[normalizeText(slug)])
            .find((destination) => (
              destination
              && resolveDestinationRegionCode(destination && destination.regionCode, destination && destination.slug) === normalizedRegionCode
              && normalizeText(destination && destination.cover)
            ));

          regionMetaMap[normalizedRegionCode].image =
            normalizeText(destinationImage && destinationImage.cover)
            || normalizeText(service && service.cover);
        }
      });
    });

    creatorRegionSet.forEach((regionCode) => {
      regionMetaMap[regionCode].count += 1;
    });
  });

  return [{ label: "全部", value: "" }].concat(
    DESTINATION_REGION_OPTIONS
      .filter((item) => regionMetaMap[item.value])
      .map((item) => ({
        label: item.label,
        value: item.value,
        count: regionMetaMap[item.value].count,
        image: normalizeText(regionCardImageMap && regionCardImageMap[item.value]) || regionMetaMap[item.value].image
      }))
  );
}

function buildCreatorStyleOptions(creators, services, destinationRegionCodeMap, filters) {
  const matchedCreators = filterCreators(creators, services, destinationRegionCodeMap, {
    destination: filters && filters.destination,
    regionCode: filters && filters.regionCode
  });
  const tagSet = new Set(
    matchedCreators.reduce((result, creator) => result.concat(normalizeArray(creator && creator.tags)), [])
  );

  return buildOptionList(ROUTE_TAG_OPTIONS.filter((tag) => tagSet.has(tag)));
}

function compareDateValueAsc(left, right) {
  const leftValue = normalizeText(left);
  const rightValue = normalizeText(right);

  if (leftValue && rightValue) {
    return leftValue.localeCompare(rightValue);
  }

  if (leftValue) {
    return -1;
  }

  if (rightValue) {
    return 1;
  }

  return 0;
}

function buildCreatorSortMeta(creator, services, destinationRegionCodeMap, soldCountMap, filters) {
  const relatedServices = getCreatorRelatedServices(creator, services, destinationRegionCodeMap, filters);
  let nearestActiveDate = "";
  let nearestRouteDate = "";

  relatedServices.forEach((service) => {
    const publicPeriods = buildPublicGroupPeriods(service && service.groupPeriods, soldCountMap);
    const firstActivePeriod = publicPeriods.find((period) => isCreatorBookablePeriodStatus(period && period.status));
    const firstRoutePeriod = publicPeriods[0] || null;

    if (firstActivePeriod && (!nearestActiveDate || firstActivePeriod.dateStart < nearestActiveDate)) {
      nearestActiveDate = firstActivePeriod.dateStart;
    }

    if (firstRoutePeriod && (!nearestRouteDate || firstRoutePeriod.dateStart < nearestRouteDate)) {
      nearestRouteDate = firstRoutePeriod.dateStart;
    }
  });

  return {
    hasActivePeriod: Boolean(nearestActiveDate),
    nearestActiveDate,
    nearestRouteDate,
    relatedServiceCount: relatedServices.length
  };
}

function sortCreatorsForFilters(creators, services, destinationRegionCodeMap, soldCountMap, filters) {
  return normalizeArray(creators)
    .map((creator, index) => ({
      creator,
      index,
      sortMeta: buildCreatorSortMeta(creator, services, destinationRegionCodeMap, soldCountMap, filters)
    }))
    .sort((left, right) => {
      if (left.sortMeta.hasActivePeriod !== right.sortMeta.hasActivePeriod) {
        return left.sortMeta.hasActivePeriod ? -1 : 1;
      }

      const activeDateDiff = compareDateValueAsc(left.sortMeta.nearestActiveDate, right.sortMeta.nearestActiveDate);
      if (activeDateDiff !== 0) {
        return activeDateDiff;
      }

      const routeDateDiff = compareDateValueAsc(left.sortMeta.nearestRouteDate, right.sortMeta.nearestRouteDate);
      if (routeDateDiff !== 0) {
        return routeDateDiff;
      }

      if (left.sortMeta.relatedServiceCount !== right.sortMeta.relatedServiceCount) {
        return right.sortMeta.relatedServiceCount - left.sortMeta.relatedServiceCount;
      }

      return left.index - right.index;
    })
    .map((item) => item.creator);
}

function buildDestinationRegionOptions(destinations, services, filters) {
  const matchedDestinations = filterDestinations(destinations, services, {
    search: filters && filters.search,
    tag: filters && filters.tag
  });
  const regionCodeSet = new Set(
    matchedDestinations
      .map((destination) => resolveDestinationRegionCode(destination && destination.regionCode, destination && destination.slug))
      .filter(Boolean)
  );

  return buildOptionList(
    DESTINATION_REGION_OPTIONS.filter((item) => regionCodeSet.has(item.value))
  );
}

function buildDestinationStyleOptions(destinations, services, filters) {
  const matchedDestinations = filterDestinations(destinations, services, {
    search: filters && filters.search,
    regionCode: filters && filters.regionCode
  });
  const destinationSlugSet = new Set(matchedDestinations.map((destination) => destination.slug));
  const tagSet = new Set();

  (services || []).forEach((service) => {
    const isMatchedDestination = Array.isArray(service && service.destinationSlugs)
      && service.destinationSlugs.some((slug) => destinationSlugSet.has(slug));

    if (!isMatchedDestination) {
      return;
    }

    getServiceRouteTags(service).forEach((tag) => tagSet.add(tag));
  });

  return buildOptionList(ROUTE_TAG_OPTIONS.filter((tag) => tagSet.has(tag)));
}

function buildDestinationDetailTypeOptions(services, filters) {
  const matchedServices = filterServices(services, {
    destinationSlug: filters && filters.destinationSlug,
    style: filters && filters.style
  });

  return buildOptionList(unique(matchedServices.map((service) => normalizeServiceType(service && service.type, service))));
}

function buildDestinationDetailStyleOptions(services, filters) {
  const matchedServices = filterServices(services, {
    destinationSlug: filters && filters.destinationSlug,
    type: filters && filters.type
  });
  const tagSet = new Set();

  matchedServices.forEach((service) => {
    getServiceRouteTags(service).forEach((tag) => tagSet.add(tag));
  });

  return buildOptionList(ROUTE_TAG_OPTIONS.filter((tag) => tagSet.has(tag)));
}

function listBySlugOrder(items, slugs, limit) {
  const sourceItems = Array.isArray(items) ? items : [];
  const sourceSlugs = Array.isArray(slugs) ? slugs : [];
  const slugMap = sourceItems.reduce((map, item) => {
    if (item && item.slug) {
      map[item.slug] = item;
    }
    return map;
  }, {});
  const ordered = sourceSlugs
    .map((slug) => slugMap[String(slug || "").trim()])
    .filter(Boolean);
  return typeof limit === "number" ? ordered.slice(0, limit) : ordered;
}

function buildHomeServicesTab(services, slugs, fallbackStartIndex) {
  const limit = 3;
  const picked = listBySlugOrder(services, slugs, limit);
  if (picked.length >= limit) {
    return picked;
  }

  const existing = new Set(picked.map((service) => service.slug));
  const sourceServices = Array.isArray(services) ? services : [];
  const offset = Number.isFinite(fallbackStartIndex) ? Math.max(fallbackStartIndex, 0) : 0;
  const fallbackPool = sourceServices.slice(offset).concat(sourceServices.slice(0, offset));

  for (let index = 0; index < fallbackPool.length && picked.length < limit; index += 1) {
    const service = fallbackPool[index];
    if (!service || !service.slug || existing.has(service.slug)) {
      continue;
    }
    existing.add(service.slug);
    picked.push(service);
  }

  return picked;
}

function ensureContentCollections(payload) {
  if (!payload.creators.length || !payload.destinations.length || !payload.services.length || !payload.ideas.length) {
    throw new Error("Cloud content collections are empty");
  }
}

async function loadContentData() {
  if (contentDataCache && contentDataCache.expiresAt > Date.now()) {
    return contentDataCache.value;
  }

  if (contentDataPromise) {
    return contentDataPromise;
  }

  contentDataPromise = Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.destinations),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas),
    listAllSqlServicePeriods(),
    getAllSoldCountByPeriodCodeMap()
  ])
    .then(([rawCreators, rawDestinations, rawServices, rawIdeas, sqlPeriods, soldCountMap]) => {
      const periodMap = groupSqlPeriodsByServiceSlug(sqlPeriods);
      const services = rawServices.map((service) =>
        normalizeServiceContentDoc(
          Object.assign({}, service, {
            groupPeriods: (() => {
              const serviceSlug = String(service && service.slug ? service.slug : "").trim();
              const sqlGroupPeriods = periodMap[serviceSlug];
              if (Array.isArray(sqlGroupPeriods) && sqlGroupPeriods.length) {
                return sqlGroupPeriods;
              }
              return Array.isArray(service && service.groupPeriods) ? service.groupPeriods : [];
            })()
          })
        )
      );
      const creators = rawCreators
        .map(normalizeCreatorAssetFields)
        .map((creator) => enrichCreatorDoc(creator, services, soldCountMap));
      const destinations = rawDestinations
        .map(normalizeDestinationContentDoc)
        .map((destination) => enrichDestinationDoc(destination, creators, services));
      const ideas = rawIdeas.map(normalizeIdeaAssetFields).map(normalizeIdeaThemeDoc);
      const payload = {
        creators,
        destinations,
        services,
        ideas
      };
      ensureContentCollections(payload);
      contentDataCache = {
        expiresAt: Date.now() + CONTENT_CACHE_TTL_MS,
        value: payload
      };
      return payload;
    })
    .finally(() => {
      contentDataPromise = null;
    });

  return contentDataPromise;
}

function setHomePageCache(payload) {
  homePageCache = {
    expiresAt: Date.now() + HOME_PAGE_CACHE_TTL_MS,
    value: payload
  };
  return payload;
}

function isValidHomePagePayload(payload) {
  return (
    isPlainObject(payload)
    && Array.isArray(payload.heroSlides)
    && Array.isArray(payload.featuredCreators)
    && Array.isArray(payload.featuredDestinations)
    && isPlainObject(payload.featuredServicesByTab)
    && Array.isArray(payload.featuredIdeas)
  );
}

function normalizeHomePageSnapshot(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const payload = isValidHomePagePayload(value.payload) ? value.payload : null;
  const generatedAt = normalizeNumber(value.generatedAt, 0);
  if (!payload || !generatedAt) {
    return null;
  }

  return {
    version: normalizeNumber(value.version, 0) || HOME_PAGE_SNAPSHOT_VERSION,
    generatedAt,
    expiresAt: normalizeNumber(value.expiresAt, 0),
    payload
  };
}

function isFreshHomePageSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== HOME_PAGE_SNAPSHOT_VERSION) {
    return false;
  }

  const now = Date.now();
  if (snapshot.expiresAt && snapshot.expiresAt <= now) {
    return false;
  }

  return now - snapshot.generatedAt <= HOME_PAGE_SNAPSHOT_MAX_AGE_MS;
}

async function readHomePageSnapshot() {
  if (homePageSnapshotCache && homePageSnapshotCache.expiresAt > Date.now()) {
    return homePageSnapshotCache.value;
  }

  if (homePageSnapshotPromise) {
    return homePageSnapshotPromise;
  }

  homePageSnapshotPromise = (async () => {
    try {
      const doc = await readConfigDoc(HOME_PAGE_SNAPSHOT_CONFIG_KEY);
      const snapshot = normalizeHomePageSnapshot(doc && doc.value);
      homePageSnapshotCache = {
        expiresAt: Date.now() + HOME_PAGE_SNAPSHOT_CACHE_TTL_MS,
        value: snapshot
      };
      return snapshot;
    } catch (error) {
      homePageSnapshotCache = {
        expiresAt: Date.now() + HOME_PAGE_SNAPSHOT_CACHE_TTL_MS,
        value: null
      };
      return null;
    }
  })()
    .finally(() => {
      homePageSnapshotPromise = null;
    });

  return homePageSnapshotPromise;
}

async function saveHomePageSnapshot(payload) {
  if (!isValidHomePagePayload(payload)) {
    return null;
  }

  const now = Date.now();
  const snapshot = {
    version: HOME_PAGE_SNAPSHOT_VERSION,
    generatedAt: now,
    expiresAt: now + HOME_PAGE_SNAPSHOT_MAX_AGE_MS,
    payload
  };

  await saveConfigValue(HOME_PAGE_SNAPSHOT_CONFIG_KEY, snapshot);
  homePageSnapshotCache = {
    expiresAt: Date.now() + HOME_PAGE_SNAPSHOT_CACHE_TTL_MS,
    value: snapshot
  };
  return snapshot;
}

function setJourneyPageCache(payload) {
  journeyPageCache = {
    expiresAt: Date.now() + JOURNEY_PAGE_CACHE_TTL_MS,
    value: payload
  };
  return payload;
}

function isValidJourneyPagePayload(payload) {
  return (
    isPlainObject(payload)
    && Array.isArray(payload.routeTypeOptions)
    && Array.isArray(payload.regionOptions)
    && Array.isArray(payload.journeys)
  );
}

function normalizeJourneyPageSnapshot(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const payload = isValidJourneyPagePayload(value.payload) ? value.payload : null;
  const generatedAt = normalizeNumber(value.generatedAt, 0);
  if (!payload || !generatedAt) {
    return null;
  }

  return {
    version: normalizeNumber(value.version, 0) || JOURNEY_PAGE_SNAPSHOT_VERSION,
    generatedAt,
    expiresAt: normalizeNumber(value.expiresAt, 0),
    payload
  };
}

function isFreshJourneyPageSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== JOURNEY_PAGE_SNAPSHOT_VERSION) {
    return false;
  }

  const now = Date.now();
  if (snapshot.expiresAt && snapshot.expiresAt <= now) {
    return false;
  }

  return now - snapshot.generatedAt <= JOURNEY_PAGE_SNAPSHOT_MAX_AGE_MS;
}

async function readJourneyPageSnapshot() {
  if (journeyPageSnapshotCache && journeyPageSnapshotCache.expiresAt > Date.now()) {
    return journeyPageSnapshotCache.value;
  }

  if (journeyPageSnapshotPromise) {
    return journeyPageSnapshotPromise;
  }

  journeyPageSnapshotPromise = (async () => {
    try {
      const doc = await readConfigDoc(JOURNEY_PAGE_SNAPSHOT_CONFIG_KEY);
      const snapshot = normalizeJourneyPageSnapshot(doc && doc.value);
      journeyPageSnapshotCache = {
        expiresAt: Date.now() + JOURNEY_PAGE_SNAPSHOT_CACHE_TTL_MS,
        value: snapshot
      };
      return snapshot;
    } catch (error) {
      journeyPageSnapshotCache = {
        expiresAt: Date.now() + JOURNEY_PAGE_SNAPSHOT_CACHE_TTL_MS,
        value: null
      };
      return null;
    }
  })()
    .finally(() => {
      journeyPageSnapshotPromise = null;
    });

  return journeyPageSnapshotPromise;
}

async function saveJourneyPageSnapshot(payload) {
  if (!isValidJourneyPagePayload(payload)) {
    return null;
  }

  const now = Date.now();
  const snapshot = {
    version: JOURNEY_PAGE_SNAPSHOT_VERSION,
    generatedAt: now,
    expiresAt: now + JOURNEY_PAGE_SNAPSHOT_MAX_AGE_MS,
    payload
  };

  await saveConfigValue(JOURNEY_PAGE_SNAPSHOT_CONFIG_KEY, snapshot);
  journeyPageSnapshotCache = {
    expiresAt: Date.now() + JOURNEY_PAGE_SNAPSHOT_CACHE_TTL_MS,
    value: snapshot
  };
  return snapshot;
}

function normalizeCreatorsPageFilters(filters) {
  const requestedFilters = filters || {};
  return {
    destination: normalizeText(requestedFilters.destination),
    regionCode: normalizeDestinationRegionCode(requestedFilters.regionCode),
    style: normalizeText(requestedFilters.style)
  };
}

function getCreatorsPageCacheKey(filters) {
  return JSON.stringify(normalizeCreatorsPageFilters(filters));
}

function setCreatorsPageCache(cacheKey, payload) {
  creatorsPageCache.set(cacheKey, {
    expiresAt: Date.now() + CREATORS_PAGE_CACHE_TTL_MS,
    value: payload
  });
  return payload;
}

function isValidCreatorsPagePayload(payload) {
  return (
    isPlainObject(payload)
    && Array.isArray(payload.destinationOptions)
    && Array.isArray(payload.regionOptions)
    && Array.isArray(payload.styleOptions)
    && Array.isArray(payload.creators)
  );
}

function normalizeCreatorsPageSnapshot(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const payload = isValidCreatorsPagePayload(value.payload) ? value.payload : null;
  const generatedAt = normalizeNumber(value.generatedAt, 0);
  if (!payload || !generatedAt) {
    return null;
  }

  return {
    version: normalizeNumber(value.version, 0) || CREATORS_PAGE_SNAPSHOT_VERSION,
    generatedAt,
    expiresAt: normalizeNumber(value.expiresAt, 0),
    payload
  };
}

function isFreshCreatorsPageSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== CREATORS_PAGE_SNAPSHOT_VERSION) {
    return false;
  }

  const now = Date.now();
  if (snapshot.expiresAt && snapshot.expiresAt <= now) {
    return false;
  }

  return now - snapshot.generatedAt <= CREATORS_PAGE_SNAPSHOT_MAX_AGE_MS;
}

async function readCreatorsPageSnapshot() {
  if (creatorsPageSnapshotCache && creatorsPageSnapshotCache.expiresAt > Date.now()) {
    return creatorsPageSnapshotCache.value;
  }

  if (creatorsPageSnapshotPromise) {
    return creatorsPageSnapshotPromise;
  }

  creatorsPageSnapshotPromise = (async () => {
    try {
      const doc = await readConfigDoc(CREATORS_PAGE_SNAPSHOT_CONFIG_KEY);
      const snapshot = normalizeCreatorsPageSnapshot(doc && doc.value);
      creatorsPageSnapshotCache = {
        expiresAt: Date.now() + CREATORS_PAGE_SNAPSHOT_CACHE_TTL_MS,
        value: snapshot
      };
      return snapshot;
    } catch (error) {
      creatorsPageSnapshotCache = {
        expiresAt: Date.now() + CREATORS_PAGE_SNAPSHOT_CACHE_TTL_MS,
        value: null
      };
      return null;
    }
  })()
    .finally(() => {
      creatorsPageSnapshotPromise = null;
    });

  return creatorsPageSnapshotPromise;
}

async function saveCreatorsPageSnapshot(payload) {
  if (!isValidCreatorsPagePayload(payload)) {
    return null;
  }

  const now = Date.now();
  const snapshot = {
    version: CREATORS_PAGE_SNAPSHOT_VERSION,
    generatedAt: now,
    expiresAt: now + CREATORS_PAGE_SNAPSHOT_MAX_AGE_MS,
    payload
  };

  await saveConfigValue(CREATORS_PAGE_SNAPSHOT_CONFIG_KEY, snapshot);
  creatorsPageSnapshotCache = {
    expiresAt: Date.now() + CREATORS_PAGE_SNAPSHOT_CACHE_TTL_MS,
    value: snapshot
  };
  return snapshot;
}

async function buildHomePagePayload() {
  const homeConfig = (await getConfigValue(HOME_PAGE_CONFIG_KEY)) || {};
  const {
    creators,
    services,
    featuredCreators,
    featuredDestinations,
    featuredIdeas
  } = await loadHomePageCollectionsWithConfig(homeConfig);
  const featuredServiceSlugs = homeConfig.featuredServiceSlugs || [];
  const recentServiceSlugs = homeConfig.recentServiceSlugs || [];
  const specialProjectServiceSlugs = homeConfig.specialProjectServiceSlugs || [];

  const featuredServicesByTab = {
    featured: buildHomeServicesTab(services, featuredServiceSlugs, 0),
    recent: buildHomeServicesTab(services, recentServiceSlugs, 3),
    special: buildHomeServicesTab(services, specialProjectServiceSlugs, 6)
  };
  Object.keys(featuredServicesByTab).forEach((key) => {
    featuredServicesByTab[key] = featuredServicesByTab[key].map((service) => {
      const creator = findCreatorByRef(creators, service.creatorId);
      const publicService = buildPublicService(service, {
        creatorName: creator ? creator.name : ""
      });
      return buildHomeServiceCard(publicService);
    });
  });

  const payload = {
    heroSlides: normalizeHeroSlides(
      Array.isArray(homeConfig.heroSlides) && homeConfig.heroSlides.length
        ? homeConfig.heroSlides
        : (featuredIdeas[0]
          ? [{
              id: `hero-${featuredIdeas[0].slug}`,
              variant: "photo",
              image: featuredIdeas[0].cover || "",
              mark: "野哉",
              title: featuredIdeas[0].title || "",
              desc: featuredIdeas[0].summary || "",
              targetIdeaSlug: featuredIdeas[0].slug
            }]
          : [])
    ),
    featuredCreators: featuredCreators.map(buildHomeCreatorCard),
    featuredDestinations: featuredDestinations.map(buildHomeDestinationCard),
    featuredServicesByTab,
    featuredIdeas: featuredIdeas.map(buildHomeIdeaCard)
  };
  return payload;
}

async function refreshHomePageSnapshot() {
  const payload = await buildHomePagePayload();
  const snapshot = await saveHomePageSnapshot(payload);
  setHomePageCache(payload);
  return {
    refreshed: true,
    generatedAt: snapshot ? snapshot.generatedAt : Date.now(),
    expiresAt: snapshot ? snapshot.expiresAt : 0
  };
}

async function refreshHomePageSnapshotBestEffort() {
  try {
    return await refreshHomePageSnapshot();
  } catch (error) {
    return {
      refreshed: false,
      error: normalizeText(error && error.message) || "refresh failed"
    };
  }
}

async function warmContentGateway() {
  const [sqlAlive, homePageSnapshot, journeyPageSnapshot, creatorsPageSnapshot] = await Promise.all([
    keepSqlAlive(),
    refreshHomePageSnapshotBestEffort(),
    refreshJourneyPageSnapshotBestEffort(),
    refreshCreatorsPageSnapshotBestEffort()
  ]);

  return {
    ok: true,
    sqlAlive,
    homePageSnapshot,
    journeyPageSnapshot,
    creatorsPageSnapshot
  };
}

async function getHomePageData() {
  if (homePageCache && homePageCache.expiresAt > Date.now()) {
    return homePageCache.value;
  }

  if (homePagePromise) {
    return homePagePromise;
  }

  homePagePromise = (async () => {
    const snapshot = await readHomePageSnapshot();
    if (isFreshHomePageSnapshot(snapshot)) {
      return setHomePageCache(snapshot.payload);
    }

    const payload = await buildHomePagePayload();
    await saveHomePageSnapshot(payload);
    return setHomePageCache(payload);
  })()
    .finally(() => {
      homePagePromise = null;
    });

  return homePagePromise;
}

async function buildJourneyPagePayload() {
  const { creators, destinations, services } = await loadJourneyPageCollections();
  const [sqlPeriods, soldCountMap, journeyPageConfig] = await Promise.all([
    listAllSqlServicePeriods({ returnNullOnError: true }),
    getAllSoldCountByPeriodCodeMap(),
    getConfigValue("journeyPage")
  ]);
  const sqlPeriodsAvailable = Array.isArray(sqlPeriods);
  const sqlPeriodsByServiceSlug = groupSqlPeriodsByServiceSlug(sqlPeriodsAvailable ? sqlPeriods : []);
  const regionCardImageMap = buildJourneyRegionCardImageMap(journeyPageConfig);

  const journeys = services
    .map((service) => {
      const sqlServicePeriods = sqlPeriodsByServiceSlug[service.slug];
      const effectivePeriods = Array.isArray(sqlServicePeriods) && sqlServicePeriods.length
        ? sqlServicePeriods
        : filterPublicActivePeriods(service.groupPeriods);
      const activePeriods = buildPublicGroupPeriods(effectivePeriods, soldCountMap)
        .filter((period) => isJourneyPageDisplayPeriodStatus(period && period.status));
      if (!activePeriods.length) {
        return null;
      }

      const creator = findCreatorByRef(creators, service.creatorId);
      const relatedDestinations = destinations.filter((item) => (service.destinationSlugs || []).includes(item.slug));
      return buildJourneyCard(service, creator, relatedDestinations, activePeriods);
    })
    .filter(Boolean)
    .sort((left, right) => {
      const dateDiff = String(left && left.displayDateStart || "").localeCompare(String(right && right.displayDateStart || ""));
      if (dateDiff !== 0) {
        return dateDiff;
      }

      const statusDiff =
        getJourneyPeriodStatusPriority(left && left.displayStatus) -
        getJourneyPeriodStatusPriority(right && right.displayStatus);
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return normalizeText(left && left.name).localeCompare(normalizeText(right && right.name), "zh-CN");
    });

  if (!sqlPeriodsAvailable && !journeys.length) {
    throw new Error("旅程数据正在唤醒，请稍后重试。");
  }

  const routeTypeSet = new Set();
  journeys.forEach((journey) => {
    (journey.routeTypes || []).forEach((tag) => {
      routeTypeSet.add(tag);
    });
  });

  const payload = {
    routeTypeOptions: ROUTE_TAG_OPTIONS
      .filter((tag) => routeTypeSet.has(tag))
      .map((tag) => ({
        label: tag,
        value: tag
      })),
    regionOptions: buildJourneyRegionOptions(journeys, regionCardImageMap),
    journeys
  };
  return payload;
}

async function refreshJourneyPageSnapshot() {
  const payload = await buildJourneyPagePayload();
  const snapshot = await saveJourneyPageSnapshot(payload);
  setJourneyPageCache(payload);
  return {
    refreshed: true,
    generatedAt: snapshot ? snapshot.generatedAt : Date.now(),
    expiresAt: snapshot ? snapshot.expiresAt : 0
  };
}

async function refreshJourneyPageSnapshotBestEffort() {
  try {
    return await refreshJourneyPageSnapshot();
  } catch (error) {
    return {
      refreshed: false,
      error: normalizeText(error && error.message) || "refresh failed"
    };
  }
}

async function getJourneyPageData() {
  if (journeyPageCache && journeyPageCache.expiresAt > Date.now()) {
    return journeyPageCache.value;
  }

  if (journeyPagePromise) {
    return journeyPagePromise;
  }

  journeyPagePromise = (async () => {
    const snapshot = await readJourneyPageSnapshot();
    if (isFreshJourneyPageSnapshot(snapshot)) {
      return setJourneyPageCache(snapshot.payload);
    }

    try {
      const payload = await buildJourneyPagePayload();
      await saveJourneyPageSnapshot(payload);
      return setJourneyPageCache(payload);
    } catch (error) {
      if (snapshot && isValidJourneyPagePayload(snapshot.payload)) {
        return setJourneyPageCache(snapshot.payload);
      }
      throw error;
    }
  })()
    .finally(() => {
      journeyPagePromise = null;
    });

  return journeyPagePromise;
}

async function getCustomJourneyPageData() {
  if (customJourneyPageCache && customJourneyPageCache.expiresAt > Date.now()) {
    return customJourneyPageCache.value;
  }

  if (customJourneyPagePromise) {
    return customJourneyPagePromise;
  }

  customJourneyPagePromise = (async () => {
    const { creators, destinations, services } = await loadJourneyPageCollections();
    const customJourneyPageConfig = (await getConfigValue("customJourneyPage")) || {};
    const exampleServiceSlugs = unique(normalizeArray(customJourneyPageConfig.exampleServiceSlugs).map(normalizeText));
    const journeys = services
      .filter((service) => exampleServiceSlugs.includes(normalizeText(service && service.slug)))
      .sort((left, right) => {
        return exampleServiceSlugs.indexOf(normalizeText(left && left.slug))
          - exampleServiceSlugs.indexOf(normalizeText(right && right.slug));
      })
      .map((service) => {
        const creator = findCreatorByRef(creators, service.creatorId);
        const relatedDestinations = destinations.filter((item) => (service.destinationSlugs || []).includes(item.slug));
        return buildCustomJourneyCard(service, creator, relatedDestinations);
      });

    const routeTypeSet = new Set();
    journeys.forEach((journey) => {
      (journey.routeTypes || []).forEach((tag) => {
        routeTypeSet.add(tag);
      });
    });

    const payload = {
      routeTypeOptions: ROUTE_TAG_OPTIONS
        .filter((tag) => routeTypeSet.has(tag))
        .map((tag) => ({
          label: tag,
          value: tag
        })),
      regionOptions: buildJourneyRegionOptions(journeys, {}),
      journeys
    };

    customJourneyPageCache = {
      expiresAt: Date.now() + JOURNEY_PAGE_CACHE_TTL_MS,
      value: payload
    };

    return payload;
  })()
    .finally(() => {
      customJourneyPagePromise = null;
    });

  return customJourneyPagePromise;
}

async function buildCreatorsPagePayload(filters) {
  const { creators, destinations, services } = await loadContentData();
  const [soldCountMap, journeyPageConfig] = await Promise.all([
    getAllSoldCountByPeriodCodeMap(),
    getConfigValue("journeyPage")
  ]);
  const destinationRegionCodeMap = buildDestinationRegionCodeMap(destinations);
  const regionCardImageMap = buildJourneyRegionCardImageMap(journeyPageConfig);
  const requestedFilters = filters || {};
  let style = String(requestedFilters.style || "").trim();
  let regionCode = normalizeDestinationRegionCode(requestedFilters.regionCode);
  let destination = String(requestedFilters.destination || "").trim();
  let destinationOptions = buildCreatorDestinationOptions(
    destinations,
    creators,
    services,
    destinationRegionCodeMap,
    { style, regionCode }
  );

  destination = normalizeSelectedValue(destinationOptions, destination);

  let regionOptions = buildCreatorRegionOptions(
    destinations,
    creators,
    services,
    destinationRegionCodeMap,
    { style, destination },
    regionCardImageMap
  );
  regionCode = normalizeSelectedValue(regionOptions, regionCode);

  let styleOptions = buildCreatorStyleOptions(
    creators,
    services,
    destinationRegionCodeMap,
    { destination, regionCode }
  );
  style = normalizeSelectedValue(styleOptions, style);

  destinationOptions = buildCreatorDestinationOptions(
    destinations,
    creators,
    services,
    destinationRegionCodeMap,
    { style, regionCode }
  );
  destination = normalizeSelectedValue(destinationOptions, destination);
  regionOptions = buildCreatorRegionOptions(
    destinations,
    creators,
    services,
    destinationRegionCodeMap,
    { style, destination },
    regionCardImageMap
  );
  regionCode = normalizeSelectedValue(regionOptions, regionCode);
  styleOptions = buildCreatorStyleOptions(
    creators,
    services,
    destinationRegionCodeMap,
    { destination, regionCode }
  );

  const normalizedFilters = {
    destination,
    regionCode,
    style: normalizeSelectedValue(styleOptions, style)
  };

  const displayCreators = sortCreatorsForFilters(
    filterCreators(creators, services, destinationRegionCodeMap, normalizedFilters),
    services,
    destinationRegionCodeMap,
    soldCountMap,
    normalizedFilters
  );

  return {
    destinationOptions,
    regionOptions,
    styleOptions,
    destinationLabels: destinationOptions.map((item) => item.label),
    regionLabels: regionOptions.map((item) => item.label),
    styleLabels: styleOptions.map((item) => item.label),
    creators: displayCreators
  };
}

async function refreshCreatorsPageSnapshot() {
  const payload = await buildCreatorsPagePayload({});
  const snapshot = await saveCreatorsPageSnapshot(payload);
  setCreatorsPageCache(DEFAULT_CREATORS_PAGE_CACHE_KEY, payload);
  return {
    refreshed: true,
    generatedAt: snapshot ? snapshot.generatedAt : Date.now(),
    expiresAt: snapshot ? snapshot.expiresAt : 0
  };
}

async function refreshCreatorsPageSnapshotBestEffort() {
  try {
    return await refreshCreatorsPageSnapshot();
  } catch (error) {
    return {
      refreshed: false,
      error: normalizeText(error && error.message) || "refresh failed"
    };
  }
}

async function getCreatorsPageData(filters) {
  const cacheKey = getCreatorsPageCacheKey(filters);
  const cached = creatorsPageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pendingPromise = creatorsPagePromiseMap.get(cacheKey);
  if (pendingPromise) {
    return pendingPromise;
  }

  const shouldUseSnapshot = cacheKey === DEFAULT_CREATORS_PAGE_CACHE_KEY;
  const promise = (async () => {
    const snapshot = shouldUseSnapshot ? await readCreatorsPageSnapshot() : null;
    if (shouldUseSnapshot && isFreshCreatorsPageSnapshot(snapshot)) {
      return setCreatorsPageCache(cacheKey, snapshot.payload);
    }

    try {
      const payload = await buildCreatorsPagePayload(filters);
      if (shouldUseSnapshot) {
        await saveCreatorsPageSnapshot(payload);
      }
      return setCreatorsPageCache(cacheKey, payload);
    } catch (error) {
      if (shouldUseSnapshot && snapshot && isValidCreatorsPagePayload(snapshot.payload)) {
        return setCreatorsPageCache(cacheKey, snapshot.payload);
      }
      throw error;
    }
  })()
    .finally(() => {
      creatorsPagePromiseMap.delete(cacheKey);
    });

  creatorsPagePromiseMap.set(cacheKey, promise);
  return promise;
}

async function getCreatorDetailData(slug) {
  const { creators, destinations, services, ideas } = await loadContentData();
  const creator = creators.find((item) => item.slug === slug);
  if (!creator) {
    return null;
  }

  const relatedServices = services
    .filter((service) => matchesCreatorRef(creator, service.creatorId))
    .map((service) => buildPublicService(service, { creatorName: creator.name }));
  const creatorDestinationSlugs = unique(
    relatedServices.flatMap((service) => normalizeArray(service && service.destinationSlugs))
  );
  const creatorDestinations = destinations.filter((destination) => creatorDestinationSlugs.includes(destination.slug));
  const creatorIdeas = ideas.filter((idea) => matchesCreatorRef(creator, idea.authorId));

  return {
    creator: Object.assign({}, creator, { isFavorited: false }),
    creatorDestinations,
    relatedServices,
    creatorIdeas
  };
}

async function getDestinationsPageData(options) {
  const { destinations, services } = await loadContentData();
  const requestedOptions = options || {};
  const search = String(requestedOptions.search || "").trim();
  let tag = String(requestedOptions.tag || "").trim();
  let regionCode = normalizeDestinationRegionCode(requestedOptions.regionCode);
  let regionOptions = buildDestinationRegionOptions(destinations, services, { search, tag });

  regionCode = normalizeSelectedValue(regionOptions, regionCode);

  let styleOptions = buildDestinationStyleOptions(destinations, services, { search, regionCode });
  tag = normalizeSelectedValue(styleOptions, tag);

  regionOptions = buildDestinationRegionOptions(destinations, services, { search, tag });
  regionCode = normalizeSelectedValue(regionOptions, regionCode);
  styleOptions = buildDestinationStyleOptions(destinations, services, { search, regionCode });

  const normalizedOptions = {
    search,
    regionCode,
    tag: normalizeSelectedValue(styleOptions, tag)
  };

  return {
    regionOptions,
    regionLabels: regionOptions.map((item) => item.label),
    styleOptions,
    styleLabels: styleOptions.map((item) => item.label),
    destinations: filterDestinations(destinations, services, normalizedOptions)
  };
}

async function getDestinationDetailData(slug, filters) {
  const { creators, destinations, services } = await loadContentData();
  const destination = destinations.find((item) => item.slug === slug);
  if (!destination) {
    return null;
  }

  const requestedFilters = filters || {};
  let type = String(requestedFilters.type || "").trim();
  let style = String(requestedFilters.style || "").trim();
  let typeOptions = buildDestinationDetailTypeOptions(services, {
    destinationSlug: destination.slug,
    style
  });

  type = normalizeSelectedValue(typeOptions, type);

  let tagOptions = buildDestinationDetailStyleOptions(services, {
    destinationSlug: destination.slug,
    type
  });
  style = normalizeSelectedValue(tagOptions, style);

  typeOptions = buildDestinationDetailTypeOptions(services, {
    destinationSlug: destination.slug,
    style
  });
  type = normalizeSelectedValue(typeOptions, type);
  tagOptions = buildDestinationDetailStyleOptions(services, {
    destinationSlug: destination.slug,
    type
  });

  const normalizedFilters = {
    destinationSlug: destination.slug,
    type,
    style: normalizeSelectedValue(tagOptions, style)
  };

  const relatedCreatorRefs = unique(
    services
      .filter((service) => normalizeArray(service && service.destinationSlugs).includes(destination.slug))
      .map((service) => normalizeText(service && service.creatorId))
      .filter(Boolean)
  );
  const relatedCreators = unique(
    relatedCreatorRefs
      .map((creatorRef) => findCreatorByRef(creators, creatorRef))
      .filter(Boolean)
      .map((creator) => normalizeText(creator && creator.slug))
  )
    .map((creatorSlug) => creators.find((creator) => normalizeText(creator && creator.slug) === creatorSlug))
    .filter(Boolean)
    .map((creator) => Object.assign({}, creator, { isFavorited: false }));
  const relatedIdeas = [];
  const matchedServices = filterServices(
    services,
    normalizedFilters
  ).map((service) => {
    const creator = findCreatorByRef(creators, service.creatorId);
    return buildPublicService(service, {
      creatorName: creator ? creator.name : ""
    });
  });

  return {
    destination: Object.assign({}, destination, { isFavorited: false }),
    typeOptions,
    styleOptions: tagOptions,
    typeLabels: typeOptions.map((item) => item.label),
    styleLabels: tagOptions.map((item) => item.label),
    relatedCreators,
    relatedIdeas,
    services: matchedServices
  };
}

async function getIdeasPageData(theme, creatorSlug) {
  const { creators, ideas } = await loadContentData();
  let sourceIdeas = ideas;
  let pageTitle = "旅行故事";

  if (creatorSlug) {
    const creator = creators.find((item) => item.slug === creatorSlug);
    if (creator) {
      sourceIdeas = sourceIdeas.filter((idea) => matchesCreatorRef(creator, idea.authorId));
      pageTitle = `${creator.name}的故事`;
    }
  }

  const filteredIdeas = creatorSlug
    ? sourceIdeas.filter((idea) => !theme || idea.theme === theme)
    : (!theme ? sourceIdeas : sourceIdeas.filter((idea) => idea.theme === theme));
  const themes = creatorSlug
    ? unique(sourceIdeas.map((idea) => idea.theme).filter(Boolean))
    : unique(ideas.map((idea) => idea.theme).filter(Boolean));

  return {
    themes,
    pageTitle,
    ideas: filteredIdeas
  };
}

async function getIdeaDetailData(slug) {
  const { creators, destinations, services } = await loadContentData();
  const idea = await findPublicIdeaBySlug(slug);
  if (!idea) {
    return null;
  }

  const author = findCreatorByRef(creators, idea.authorId);
  const explicitRegionCodes = unique(normalizeArray(idea && idea.regionCodes)
    .map((code) => normalizeDestinationRegionCode(code))
    .filter(Boolean));
  const destinationRegionCodeMap = buildDestinationRegionCodeMap(destinations);
  const fallbackRegionCodes = unique(normalizeArray(idea && idea.destinationSlugs)
    .map((destinationSlug) => {
      const normalizedSlug = normalizeText(destinationSlug);
      return destinationRegionCodeMap[normalizedSlug] || inferDestinationRegionCodeBySlug(normalizedSlug);
    })
    .map((code) => normalizeDestinationRegionCode(code))
    .filter(Boolean));
  const relatedRegions = (explicitRegionCodes.length ? explicitRegionCodes : fallbackRegionCodes)
    .map((code) => ({
      code,
      label: getDestinationRegionLabel(code) || code
    }));
  const relatedServiceSlugs = Array.isArray(idea.relatedServiceSlugs) ? idea.relatedServiceSlugs : [];
  const relatedServices = services
    .filter((service) => relatedServiceSlugs.includes(service.slug))
    .map((service) => {
      const serviceCreator = findCreatorByRef(creators, service.creatorId);
      return buildPublicService(service, {
        creatorName: serviceCreator ? serviceCreator.name : ""
      });
    });
  const detailBody = idea.sourceType === "mini" ? idea.body : (idea.excerptBody || idea.body);
  return {
    idea: Object.assign({}, idea, { isFavorited: false }),
    author,
    relatedDestinations: [],
    relatedRegions,
    relatedServices,
    blocks: parseIdeaBody(detailBody)
  };
}

function normalizeServiceGalleryGroupLabel(label, index) {
  const normalized = String(label || "").trim();
  if (index === 0 && (!normalized || /^图集\s*\d*$/u.test(normalized))) {
    return "封面";
  }

  return normalized || `图集 ${index + 1}`;
}

function normalizeServiceGalleryGroupsBySource(value) {
  return (Array.isArray(value) ? value : [])
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const label = normalizeServiceGalleryGroupLabel(item.label, index);
      const images = unique(Array.isArray(item.images) ? item.images.filter(Boolean) : []);
      if (!images.length) {
        return null;
      }

      return {
        sourceIndex: index,
        key: String(item.key || "").trim() || `gallery-${index + 1}`,
        label,
        images
      };
    })
    .filter(Boolean);
}

function normalizeServiceGalleryGroups(service) {
  return normalizeServiceGalleryGroupsBySource(service && service.galleryGroups);
}

function prioritizeServiceGalleryGroups(groups) {
  const orderedGroups = Array.isArray(groups) ? groups.slice() : [];
  const coverGroups = orderedGroups.filter((item) => item && item.label === "封面");
  const otherGroups = orderedGroups.filter((item) => !item || item.label !== "封面");

  return coverGroups.concat(otherGroups);
}

function buildLegacyMediaTabs(photoPreviewList, photoBaseList) {
  return [
    {
      key: "cover",
      label: "封面",
      images: photoPreviewList,
      previewImages: photoBaseList
    }
  ];
}

function buildServiceGalleryState(service, heroCover) {
  const galleryGroups = normalizeServiceGalleryGroups(service);
  const galleryGroupsCard = normalizeServiceGalleryGroupsBySource(service && service.galleryGroupsCard);

  if (galleryGroups.length) {
    const baseGroups = prioritizeServiceGalleryGroups(galleryGroups);
    const mediaTabs = baseGroups.map((item) => {
      const cardGroup = galleryGroupsCard.find((cardItem) => cardItem.sourceIndex === item.sourceIndex);
      const previewImages = Array.isArray(item.images) ? item.images : [];
      const images = cardGroup && Array.isArray(cardGroup.images) && cardGroup.images.length
        ? cardGroup.images
        : previewImages;

      return {
        key: item.key,
        label: item.label,
        images,
        previewImages
      };
    });
    const photoGallery = unique(mediaTabs.flatMap((item) => item.images || []));
    const photoBaseList = unique(mediaTabs.flatMap((item) => item.previewImages || item.images || []));

    return {
      photoGallery,
      photoBaseList,
      mediaTabs,
      hasGalleryGroups: true
    };
  }

  const photoGallery = Array.isArray(service && service.galleryCard) && service.galleryCard.length
    ? service.galleryCard
    : Array.isArray(service && service.gallery) && service.gallery.length
      ? service.gallery
    : heroCover ? [heroCover] : [];
  const detailGallery = Array.isArray(service && service.gallery) && service.gallery.length
      ? service.gallery
      : photoGallery;
  const photoBaseList = unique(detailGallery.length ? detailGallery : (heroCover ? [heroCover] : []));
  const photoPreviewList = unique(photoGallery.length ? photoGallery : photoBaseList);

  return {
    photoGallery: photoPreviewList,
    photoBaseList,
    mediaTabs: buildLegacyMediaTabs(photoPreviewList, photoBaseList),
    hasGalleryGroups: false
  };
}

function buildServiceDetailGalleryPayload(service, heroCover, options) {
  const galleryState = buildServiceGalleryState(service, heroCover);
  const previewLimit = Number.isFinite(options && options.previewLimit)
    ? Math.max(0, options.previewLimit)
    : 0;
  const photoGallery = previewLimit
    ? unique(
      galleryState.photoGallery
        .concat(galleryState.photoBaseList || [])
        .filter(Boolean)
    ).slice(0, previewLimit)
    : galleryState.photoGallery;

  return {
    photoGallery,
    photoTotal: galleryState.photoBaseList.length,
    photoBaseList: galleryState.photoBaseList,
    hasGalleryGroups: galleryState.hasGalleryGroups,
    mediaTabs: galleryState.hasGalleryGroups
      ? galleryState.mediaTabs.map((item) => ({
        key: item.key,
        label: item.label,
        imageCount: Array.isArray(item.previewImages) && item.previewImages.length
          ? item.previewImages.length
          : Array.isArray(item.images) ? item.images.length : 0,
        images: (Array.isArray(item.images) ? item.images : []).slice(0, 4)
      }))
      : []
  };
}

function buildServiceGalleryPayload(service, heroCover) {
  const galleryState = buildServiceGalleryState(service, heroCover);

  return {
    mediaTabs: galleryState.mediaTabs.map((item) => ({
      key: item.key,
      label: item.label,
      images: item.images
    })),
    photoTotal: galleryState.photoBaseList.length,
    hasGalleryGroups: galleryState.hasGalleryGroups
  };
}

function buildServiceGalleryOriginalPayload(service, heroCover) {
  const galleryState = buildServiceGalleryState(service, heroCover);

  return {
    mediaTabs: galleryState.mediaTabs.map((item) => ({
      key: item.key,
      label: item.label,
      images: Array.isArray(item.previewImages) && item.previewImages.length ? item.previewImages : item.images
    })),
    photoTotal: galleryState.photoBaseList.length,
    hasGalleryGroups: galleryState.hasGalleryGroups
  };
}

async function loadServiceDetailBase(slug, serviceFieldSpec) {
  const rawService = await findCollectionDocBySlug(COLLECTIONS.services, slug, {
    fieldSpec: serviceFieldSpec
  });
  if (!rawService || !isPublicContentActive(rawService)) {
    return null;
  }

  const service = normalizeServiceContentDoc(rawService);
  const [creatorDocs, destinationDocs] = await Promise.all([
    listCreatorsByRefs(service.creatorId ? [service.creatorId] : [], {
      fieldSpec: CREATOR_CARD_COLLECTION_FIELDS,
      includeInactive: true
    }),
    listCollectionBySlugs(COLLECTIONS.destinations, service.destinationSlugs || [], {
      fieldSpec: DESTINATION_CARD_COLLECTION_FIELDS
    })
  ]);
  const creator = creatorDocs[0] ? normalizeCreatorAssetFields(creatorDocs[0]) : null;
  const relatedDestinations = destinationDocs.map(normalizeDestinationContentDoc);
  const heroCover =
    service.coverDetail ||
    service.cover ||
    (relatedDestinations[0] ? (relatedDestinations[0].coverDetail || relatedDestinations[0].cover) : "");

  return {
    service,
    creator,
    relatedDestinations,
    heroCover
  };
}

async function getServiceDetailSummaryData(slug) {
  const detailBase = await loadServiceDetailBase(slug, SERVICE_DETAIL_SUMMARY_COLLECTION_FIELDS);
  if (!detailBase) {
    return null;
  }

  const galleryPayload = buildServiceDetailGalleryPayload(detailBase.service, detailBase.heroCover, {
    previewLimit: 4
  });

  return {
    service: buildPublicService(detailBase.service, {
      isFavorited: false,
      creatorRoles: getServiceCreatorRoles(detailBase.service)
    }),
    creator: detailBase.creator,
    relatedDestinations: detailBase.relatedDestinations,
    heroCover: detailBase.heroCover,
    photoGallery: galleryPayload.photoGallery,
    photoTotal: galleryPayload.photoTotal,
    mediaTabs: galleryPayload.mediaTabs,
    hasGalleryGroups: galleryPayload.hasGalleryGroups,
    travelDetail: null,
    groupPeriods: []
  };
}

async function getServiceBookingData(slug) {
  const detailBase = await loadServiceDetailBase(slug, SERVICE_BOOKING_COLLECTION_FIELDS);
  if (!detailBase) {
    return null;
  }

  const [sqlPeriods, soldCountMap] = await Promise.all([
    listSqlServicePeriods(detailBase.service.slug),
    getSoldCountByPeriodCodeMap(detailBase.service.slug)
  ]);
  const effectivePeriods = Array.isArray(sqlPeriods) && sqlPeriods.length
    ? sqlPeriods
    : filterPublicActivePeriods(detailBase.service.groupPeriods);

  return {
    service: buildPublicService(detailBase.service, {
      isFavorited: false,
      creatorRoles: getServiceCreatorRoles(detailBase.service)
    }),
    creator: detailBase.creator,
    groupPeriods: effectivePeriods.map((period) =>
      buildGroupPeriodDisplay({
        id: period.periodCode || period.id,
        periodCode: period.periodCode || period.id || "",
        versionName: period.versionName || "",
        durationDays: Number(period.durationDays) || 0,
        dateStart: period.dateStart || "",
        dateEnd: period.dateEnd || period.dateStart || "",
        price: Number(period.price) || 0,
        status: period.status || "available",
        singleRoomEnabled: period.singleRoomEnabled,
        singleRoomPrice: period.singleRoomPrice,
        singleRoomPriceDec: period.singleRoomPriceDec,
        singleRoomNotice: period.singleRoomNotice,
        totalSeats:
          Number(period.totalSeats) ||
          (Number(period.remainingSeats) || 0) + (soldCountMap[period.periodCode || period.id || ""] || 0),
        soldCount: soldCountMap[period.periodCode || period.id || ""] || 0,
        remainingSeats: Number(period.remainingSeats) || 0,
        minGroup: Number(period.minGroup) || 1
      })
    )
  };
}

async function getServiceDetailContentData(slug) {
  const detailBase = await loadServiceDetailBase(slug, SERVICE_DETAIL_CONTENT_COLLECTION_FIELDS);
  if (!detailBase) {
    return null;
  }

  const galleryPayload = buildServiceDetailGalleryPayload(detailBase.service, detailBase.heroCover);
  const [sqlPeriods, soldCountMap] = await Promise.all([
    listSqlServicePeriods(detailBase.service.slug),
    getSoldCountByPeriodCodeMap(detailBase.service.slug)
  ]);
  const effectivePeriods = Array.isArray(sqlPeriods) && sqlPeriods.length
    ? sqlPeriods
    : filterPublicActivePeriods(detailBase.service.groupPeriods);

  return {
    travelDetail: detailBase.service.travelDetail || buildServiceTravelDetail(detailBase.service, [], galleryPayload.photoBaseList),
    groupPeriods: effectivePeriods.map((period) =>
      buildGroupPeriodDisplay({
        id: period.periodCode || period.id,
        periodCode: period.periodCode || period.id || "",
        versionName: period.versionName || "",
        durationDays: Number(period.durationDays) || 0,
        dateStart: period.dateStart || "",
        dateEnd: period.dateEnd || period.dateStart || "",
        price: Number(period.price) || 0,
        status: period.status || "available",
        singleRoomEnabled: period.singleRoomEnabled,
        singleRoomPrice: period.singleRoomPrice,
        singleRoomPriceDec: period.singleRoomPriceDec,
        singleRoomNotice: period.singleRoomNotice,
        totalSeats:
          Number(period.totalSeats) ||
          (Number(period.remainingSeats) || 0) + (soldCountMap[period.periodCode || period.id || ""] || 0),
        soldCount: soldCountMap[period.periodCode || period.id || ""] || 0,
        remainingSeats: Number(period.remainingSeats) || 0,
        minGroup: Number(period.minGroup) || 1
      })
    )
  };
}

async function getServiceGalleryData(slug) {
  const detailBase = await loadServiceDetailBase(slug, SERVICE_GALLERY_COLLECTION_FIELDS);
  if (!detailBase) {
    return null;
  }

  return buildServiceGalleryPayload(detailBase.service, detailBase.heroCover);
}

async function getServiceGalleryOriginalData(slug) {
  const detailBase = await loadServiceDetailBase(slug, SERVICE_GALLERY_COLLECTION_FIELDS);
  if (!detailBase) {
    return null;
  }

  return buildServiceGalleryOriginalPayload(detailBase.service, detailBase.heroCover);
}

async function getServiceConsultData(slug) {
  const serviceDoc = await findCollectionDocBySlug(COLLECTIONS.services, slug, {
    fieldSpec: SERVICE_CONSULT_COLLECTION_FIELDS
  });
  if (!serviceDoc || !isPublicContentActive(serviceDoc)) {
    return null;
  }

  return {
    consultWeChatQr:
      normalizeText(
        serviceDoc
        && serviceDoc.travelDetail
        && serviceDoc.travelDetail.consultWeChatQr
      ) || ""
  };
}

async function getServiceDetailData(slug) {
  const [summaryPayload, contentPayload, galleryPayload] = await Promise.all([
    getServiceDetailSummaryData(slug),
    getServiceDetailContentData(slug),
    getServiceGalleryData(slug)
  ]);
  if (!summaryPayload) {
    return null;
  }
  if (!contentPayload && !galleryPayload) {
    return summaryPayload;
  }

  return Object.assign({}, summaryPayload, contentPayload || {}, galleryPayload || {});
}

const handlers = {
  clearCache: () => clearGatewayCache(),
  keepSqlAlive: () => keepSqlAlive(),
  warmContentGateway: () => warmContentGateway(),
  refreshHomePageSnapshot: () => refreshHomePageSnapshot(),
  refreshJourneyPageSnapshot: () => refreshJourneyPageSnapshot(),
  refreshCreatorsPageSnapshot: () => refreshCreatorsPageSnapshot(),
  getHomePageData: (payload) => getHomePageData(payload),
  getJourneyPageData: () => getJourneyPageData(),
  getCustomJourneyPageData: () => getCustomJourneyPageData(),
  getCreatorsPageData: (payload) => getCreatorsPageData(payload.filters),
  getCreatorDetailData: (payload) => getCreatorDetailData(payload.slug),
  getDestinationsPageData: (payload) => getDestinationsPageData({
    search: payload.search,
    tag: payload.filters && payload.filters.tag,
    regionCode: payload.filters && payload.filters.regionCode
  }),
  getDestinationDetailData: (payload) => getDestinationDetailData(payload.slug, payload.filters),
  getIdeasPageData: (payload) => getIdeasPageData(payload.theme, payload.creatorSlug),
  getIdeaDetailData: (payload) => getIdeaDetailData(payload.slug),
  getServiceBookingData: (payload) => getServiceBookingData(payload.slug),
  getServiceConsultData: (payload) => getServiceConsultData(payload.slug),
  getServiceDetailSummaryData: (payload) => getServiceDetailSummaryData(payload.slug),
  getServiceDetailContentData: (payload) => getServiceDetailContentData(payload.slug),
  getServiceGalleryData: (payload) => getServiceGalleryData(payload.slug),
  getServiceGalleryOriginalData: (payload) => getServiceGalleryOriginalData(payload.slug),
  getServiceDetailData: (payload) => getServiceDetailData(payload.slug)
};

exports.main = async (event) => {
  const isTimerEvent = event && (event.Type === "Timer" || event.TriggerName || event.triggerName);
  const action = event && event.action ? event.action : (isTimerEvent ? "warmContentGateway" : "");
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler(payload);
    return {
      ok: true,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Content gateway error"
    };
  }
};
