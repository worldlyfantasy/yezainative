const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const {
  normalizeCreatorAssetFields,
  normalizeDestinationAssetFields,
  normalizeHeroSlides,
  normalizeIdeaAssetFields,
  normalizeServiceAssetFields
} = require("./image-ref");
const {
  DESTINATION_REGION_OPTIONS,
  normalizeDestinationRegionCode,
  resolveDestinationRegionCode,
  getDestinationRegionLabel
} = require("./destination-regions");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const sqlApp = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});
const models = sqlApp.models;
const runSQL = models.$runSQL || models.runSQL;
const CONFIG_COLLECTION = "app_configs";
const CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
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
const IDEA_THEME_LABEL_MAP = IDEA_THEME_OPTIONS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});
const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
let contentDataCache = null;
let contentDataPromise = null;
const configValueCache = new Map();

function clearGatewayCache() {
  contentDataCache = null;
  contentDataPromise = null;
  configValueCache.clear();

  return {
    cleared: true,
    clearedAt: Date.now()
  };
}

const SERVICE_PERIOD_SQL_FIELDS = "`serviceName`, `versionName`, `durationDays`, `serviceSlug`, `periodCode`, `dateStart`, `dateEnd`, `price`, `minGroup`, `remainingSeats`, `status`, `creatorId`, `createdAt`, `updatedAt`, `_id`, `owner`, `_mainDep`, `_openid`, `createBy`, `updateBy`";

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

function isPublicContentActive(item) {
  return normalizeText(item && item.status) !== "inactive";
}

function getSQLRows(result) {
  const data = result && result.data ? result.data : {};
  return Array.isArray(data.executeResultList) ? data.executeResultList : [];
}

async function listSqlServicePeriods(serviceSlug) {
  if (!serviceSlug) {
    return [];
  }

  try {
    if (typeof runSQL !== "function") {
      throw new Error("models.$runSQL unavailable");
    }

    const result = await runSQL(
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
    if (typeof runSQL !== "function") {
      throw new Error("models.$runSQL unavailable");
    }

    const result = await runSQL(
      "SELECT `servicePeriodCode`, SUM(COALESCE(`peopleCountInt`, `peopleCount`, 0)) AS `soldCount` FROM `TravelOrder` WHERE `serviceSlug` = {{serviceSlug}} AND COALESCE(`status`, '') <> 'canceled' GROUP BY `servicePeriodCode`",
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

async function listAllSqlServicePeriods() {
  try {
    if (typeof runSQL !== "function") {
      throw new Error("models.$runSQL unavailable");
    }

    const result = await runSQL(
      `SELECT ${SERVICE_PERIOD_SQL_FIELDS} FROM \`ServicePeriod\` ORDER BY \`serviceSlug\` ASC, \`dateStart\` ASC`
    );
    return filterPublicActivePeriods(getSQLRows(result));
  } catch (error) {
    console.error("Failed to list all SQL service periods", error);
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
    isCustomTheme: theme.isCustomTheme
  });
}

function formatPeriodDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = WEEKDAY_NAMES[date.getDay()];
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")} ${week}`;
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
    statusText
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
  return buildPriceLabelFromPeriods(service && service.groupPeriods);
}

function getServiceDurationTag(service) {
  return buildDurationLabelFromPeriods(service && service.groupPeriods);
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
    .map((item) => String(item || "").trim())
    .filter((item) => ROUTE_TAG_OPTIONS.includes(item))
    .slice(0, 3);
}

function normalizeCreatorTags(value, fallbackValue) {
  return unique((value && value.length ? value : fallbackValue) || [])
    .map((item) => String(item || "").trim())
    .filter((item) => CREATOR_TAG_OPTIONS.includes(item))
    .slice(0, 2);
}

function getCreatorTags(creator) {
  return normalizeCreatorTags(creator && creator.tags);
}

function getServiceRouteTags(service) {
  return normalizeRouteTags(service && service.tags, service && service.styles);
}

function normalizeServiceContentDoc(service) {
  const normalized = normalizeServiceAssetFields(service);
  const durationTag = getServiceDurationTag(normalized);
  return Object.assign({}, normalized, {
    type: normalizeServiceType(normalized && normalized.type, Object.assign({}, normalized, { durationTag })),
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
  const { groupPeriods, ...rest } = source;
  const durationTag = getServiceDurationTag(source);

  return Object.assign({}, rest, {
    type: normalizeServiceType(source && source.type, Object.assign({}, source, { durationTag })),
    durationTag,
    priceLabel: getServicePriceLabel(source),
    tags: getServiceRouteTags(source),
    styles: getServiceRouteTags(source)
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

function enrichCreatorDoc(creator, services) {
  return Object.assign({}, creator, {
    tags: getCreatorTags(creator),
    serviceIds: listCreatorServiceIds(services, creator)
  });
}

function enrichDestinationDoc(destination, creators, services) {
  const destinationSlug = destination && destination.slug ? destination.slug : "";
  const relatedServices = (services || []).filter((service) =>
    Array.isArray(service && service.destinationSlugs) && service.destinationSlugs.includes(destinationSlug)
  );
  const relatedCreators = (creators || []).filter((creator) =>
    Array.isArray(creator && creator.destinationSlugs) && creator.destinationSlugs.includes(destinationSlug)
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
  const dayCount = getItineraryDayCount(service);
  const highlights = buildDefaultHighlights(service, tags, photoBaseList, meetingPoint, dayCount);

  return {
    id: service.id,
    title: service.name,
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

async function listCollection(name) {
  try {
    const rows = [];
    let offset = 0;

    while (true) {
      const result = await db.collection(name).skip(offset).limit(100).get();
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

async function findCollectionDocBySlug(collectionName, slug) {
  const normalizedSlug = normalizeText(slug);
  if (!normalizedSlug) {
    return null;
  }

  try {
    const result = await db.collection(collectionName).where({ slug: normalizedSlug }).limit(1).get();
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

async function getConfigValue(key) {
  const cached = configValueCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const result = await db.collection(CONFIG_COLLECTION).where({ key }).limit(1).get();
    if (!result.data || !result.data.length) {
      configValueCache.set(key, {
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
        value: null
      });
      return null;
    }

    const doc = result.data[0];
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

function filterCreators(creators, options) {
  const filters = options || {};
  return (creators || []).filter((creator) => {
    const matchDestination = filters.destination ? (creator.destinationSlugs || []).includes(filters.destination) : true;
    const matchStyle = filters.style ? getCreatorTags(creator).includes(filters.style) : true;
    return matchDestination && matchStyle;
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

function buildCreatorDestinationOptions(destinations, creators, filters) {
  const matchedCreators = filterCreators(creators, {
    style: filters && filters.style
  });
  const destinationSlugSet = new Set(
    matchedCreators.reduce((result, creator) => result.concat(creator.destinationSlugs || []), [])
  );

  return buildOptionList(
    (destinations || []).filter((destination) => destinationSlugSet.has(destination.slug)),
    "destination"
  );
}

function buildCreatorStyleOptions(creators, filters) {
  const matchedCreators = filterCreators(creators, {
    destination: filters && filters.destination
  });
  const tagSet = new Set(
    matchedCreators.reduce((result, creator) => result.concat(getCreatorTags(creator)), [])
  );

  return buildOptionList(CREATOR_TAG_OPTIONS.filter((tag) => tagSet.has(tag)));
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
    listAllSqlServicePeriods()
  ])
    .then(([rawCreators, rawDestinations, rawServices, rawIdeas, sqlPeriods]) => {
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
      const creators = rawCreators.map(normalizeCreatorAssetFields).map((creator) => enrichCreatorDoc(creator, services));
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

async function getHomePageData() {
  const { creators, destinations, services, ideas } = await loadContentData();
  const homeConfig = (await getConfigValue("homePage")) || {};

  const featuredCreatorSlugs = homeConfig.featuredCreatorSlugs || [];
  const featuredDestinationSlugs = homeConfig.featuredDestinationSlugs || [];
  const featuredIdeaSlugs = homeConfig.featuredIdeaSlugs || [];
  const featuredServiceSlugs = homeConfig.featuredServiceSlugs || [];
  const recentServiceSlugs = homeConfig.recentServiceSlugs || [];
  const specialProjectServiceSlugs = homeConfig.specialProjectServiceSlugs || [];

  const featuredCreators = featuredCreatorSlugs.length
    ? creators.filter((creator) => featuredCreatorSlugs.includes(creator.slug))
    : creators.slice(0, 3);
  const featuredDestinations = featuredDestinationSlugs.length
    ? destinations.filter((destination) => featuredDestinationSlugs.includes(destination.slug))
    : destinations.slice(0, 4);
  const featuredIdeas = (featuredIdeaSlugs.length
    ? ideas.filter((idea) => featuredIdeaSlugs.includes(idea.slug))
    : ideas.slice(0, 3)
  ).map((idea) => {
    const author = findCreatorByRef(creators, idea.authorId);
    return Object.assign({}, idea, {
      authorName: author ? author.name : ""
    });
  });

  const featuredServicesByTab = {
    featured: buildHomeServicesTab(services, featuredServiceSlugs, 0),
    recent: buildHomeServicesTab(services, recentServiceSlugs, 3),
    special: buildHomeServicesTab(services, specialProjectServiceSlugs, 6)
  };
  Object.keys(featuredServicesByTab).forEach((key) => {
    featuredServicesByTab[key] = featuredServicesByTab[key].map((service) => {
      const creator = findCreatorByRef(creators, service.creatorId);
      return buildPublicService(service, {
        creatorName: creator ? creator.name : ""
      });
    });
  });

  return {
    heroSlides: normalizeHeroSlides(
      Array.isArray(homeConfig.heroSlides) && homeConfig.heroSlides.length
        ? homeConfig.heroSlides
        : (ideas[0]
          ? [{
              id: `hero-${ideas[0].slug}`,
              variant: "photo",
              image: ideas[0].cover || "",
              mark: "野哉",
              title: ideas[0].title || "",
              desc: ideas[0].summary || "",
              targetIdeaSlug: ideas[0].slug
            }]
          : [])
    ),
    featuredCreators: featuredCreators.length ? featuredCreators : creators.slice(0, 3),
    featuredDestinations: featuredDestinations.length ? featuredDestinations : destinations.slice(0, 4),
    featuredServicesByTab,
    featuredIdeas: featuredIdeas.length
      ? featuredIdeas
      : ideas.slice(0, 3).map((idea) => {
          const author = findCreatorByRef(creators, idea.authorId);
          return Object.assign({}, idea, {
            authorName: author ? author.name : ""
          });
        })
  };
}

async function getCreatorsPageData(filters) {
  const { creators, destinations } = await loadContentData();
  const requestedFilters = filters || {};
  let style = String(requestedFilters.style || "").trim();
  let destination = String(requestedFilters.destination || "").trim();
  let destinationOptions = buildCreatorDestinationOptions(destinations, creators, { style });

  destination = normalizeSelectedValue(destinationOptions, destination);

  let styleOptions = buildCreatorStyleOptions(creators, { destination });
  style = normalizeSelectedValue(styleOptions, style);

  destinationOptions = buildCreatorDestinationOptions(destinations, creators, { style });
  destination = normalizeSelectedValue(destinationOptions, destination);
  styleOptions = buildCreatorStyleOptions(creators, { destination });

  const normalizedFilters = {
    destination,
    style: normalizeSelectedValue(styleOptions, style)
  };

  return {
    destinationOptions,
    styleOptions,
    destinationLabels: destinationOptions.map((item) => item.label),
    styleLabels: styleOptions.map((item) => item.label),
    creators: filterCreators(creators, normalizedFilters)
  };
}

async function getCreatorDetailData(slug) {
  const { creators, destinations, services, ideas } = await loadContentData();
  const creator = creators.find((item) => item.slug === slug);
  if (!creator) {
    return null;
  }

  const creatorDestinations = destinations.filter((destination) => (creator.destinationSlugs || []).includes(destination.slug));
  const relatedServices = services
    .filter((service) => matchesCreatorRef(creator, service.creatorId))
    .map((service) => buildPublicService(service, { creatorName: creator.name }));
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
  const { creators, destinations, services, ideas } = await loadContentData();
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

  const relatedCreators = creators
    .filter((creator) => (creator.destinationSlugs || []).includes(destination.slug))
    .map((creator) => Object.assign({}, creator, { isFavorited: false }));
  const relatedIdeas = ideas
    .filter((idea) => Array.isArray(idea.destinationSlugs) && idea.destinationSlugs.includes(destination.slug))
    .map((idea) => {
      const author = findCreatorByRef(creators, idea.authorId);
      return Object.assign({}, idea, {
        authorName: author ? author.name : ""
      });
    });
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
  const { creators } = await loadContentData();
  const idea = await findPublicIdeaBySlug(slug);
  if (!idea) {
    return null;
  }

  const author = findCreatorByRef(creators, idea.authorId);
  return {
    idea: Object.assign({}, idea, { isFavorited: false }),
    author,
    blocks: parseIdeaBody(idea.body)
  };
}

function normalizeServiceGalleryGroups(service) {
  return (Array.isArray(service && service.galleryGroups) ? service.galleryGroups : [])
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const label = String(item.label || "").trim() || `图集 ${index + 1}`;
      const images = unique(Array.isArray(item.images) ? item.images.filter(Boolean) : []);
      if (!images.length) {
        return null;
      }

      return {
        key: String(item.key || "").trim() || `gallery-${index + 1}`,
        label,
        images
      };
    })
    .filter(Boolean);
}

function buildLegacyMediaTabs(photoBaseList) {
  return [
    {
      key: "landscape",
      label: "景观",
      images: photoBaseList.slice(0, 2)
    },
    {
      key: "experience",
      label: "体验",
      images: photoBaseList.slice(1, 3).length ? photoBaseList.slice(1, 3) : photoBaseList.slice(0, 1)
    },
    {
      key: "stay",
      label: "住宿",
      images: photoBaseList.slice(2, 4).length ? photoBaseList.slice(2, 4) : photoBaseList.slice(0, 1)
    }
  ];
}

function buildServiceGalleryState(service, heroCover) {
  const galleryGroups = normalizeServiceGalleryGroups(service);
  const galleryGroupsCard = Array.isArray(service && service.galleryGroupsCard) ? service.galleryGroupsCard : [];

  if (galleryGroups.length) {
    const photoGallery = unique((galleryGroupsCard.length ? galleryGroupsCard : galleryGroups).flatMap((item) => item.images || []));
    const photoBaseList = unique(heroCover ? [heroCover].concat(photoGallery) : photoGallery);

    return {
      photoGallery,
      photoBaseList,
      mediaTabs: galleryGroups.map((item) => ({
        key: item.key,
        label: item.label,
        images: item.images
      }))
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
  const photoBaseList = unique(heroCover ? [heroCover].concat(detailGallery) : detailGallery);

  return {
    photoGallery,
    photoBaseList,
    mediaTabs: buildLegacyMediaTabs(photoBaseList)
  };
}

async function getServiceDetailData(slug) {
  const { creators, destinations, services } = await loadContentData();
  const service = services.find((item) => item.slug === slug);
  if (!service) {
    return null;
  }

  const creator = findCreatorByRef(creators, service.creatorId);
  const relatedDestinations = destinations.filter((item) => (service.destinationSlugs || []).includes(item.slug));
  const heroCover = service.coverDetail || service.cover || (relatedDestinations[0] ? (relatedDestinations[0].coverDetail || relatedDestinations[0].cover) : "");
  const galleryState = buildServiceGalleryState(service, heroCover);
  const photoGallery = galleryState.photoGallery;
  const photoBaseList = galleryState.photoBaseList;
  const photoTotal = photoBaseList.length;
  const [sqlPeriods, soldCountMap] = await Promise.all([
    listSqlServicePeriods(service.slug),
    getSoldCountByPeriodCodeMap(service.slug)
  ]);
  const effectivePeriods = Array.isArray(sqlPeriods) && sqlPeriods.length
    ? sqlPeriods
    : filterPublicActivePeriods(service.groupPeriods);
  const mediaTabs = galleryState.mediaTabs;

  return {
    service: buildPublicService(service, {
      isFavorited: false,
      creatorRoles: getServiceCreatorRoles(service)
    }),
    travelDetail: service.travelDetail || buildServiceTravelDetail(service, [], photoBaseList),
    creator,
    relatedDestinations,
    heroCover,
    photoGallery,
    photoTotal,
    mediaTabs,
    groupPeriods: effectivePeriods
      .map((period) =>
        buildGroupPeriodDisplay({
          id: period.periodCode || period.id,
          periodCode: period.periodCode || period.id || "",
          versionName: period.versionName || "",
          durationDays: Number(period.durationDays) || 0,
          dateStart: period.dateStart || "",
          dateEnd: period.dateEnd || period.dateStart || "",
          price: Number(period.price) || 0,
          status: period.status || "available",
          totalSeats: Number(period.totalSeats) || (Number(period.remainingSeats) || 0) + (soldCountMap[period.periodCode || period.id || ""] || 0),
          soldCount: soldCountMap[period.periodCode || period.id || ""] || 0,
          remainingSeats: Number(period.remainingSeats) || 0,
          minGroup: Number(period.minGroup) || 1
        })
      )
  };
}

const handlers = {
  clearCache: () => clearGatewayCache(),
  getHomePageData: (payload) => getHomePageData(payload),
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
  getServiceDetailData: (payload) => getServiceDetailData(payload.slug)
};

exports.main = async (event) => {
  const action = event && event.action;
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
