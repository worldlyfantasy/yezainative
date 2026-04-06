const ROUTE_TYPE_ORDER = [
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

const STATUS_FILTER_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "confirmed", label: "确定成行" },
  { key: "available", label: "可报名" }
];

const STATUS_META = {
  confirmed: {
    label: "确定成行",
    theme: "confirmed"
  },
  available: {
    label: "可报名",
    theme: "available"
  },
  soldout: {
    label: "已报满",
    theme: "soldout"
  },
  closed: {
    label: "已截止",
    theme: "closed"
  }
};

const STATUS_PRIORITY = {
  confirmed: 0,
  available: 1,
  soldout: 2,
  closed: 3
};

const ROUTE_TYPE_ICON_MAP = {
  "城市漫游": "/images/journey-types/city-walk.svg",
  "慢旅行": "/images/journey-types/slow-travel.svg",
  "徒步与自然": "/images/journey-types/hike-nature.svg",
  "度假放松": "/images/journey-types/retreat.svg",
  "人宠": "/images/journey-types/human-pet.svg",
  "摄影创作": "/images/journey-types/photo-creation.svg",
  "瑜伽疗愈": "/images/journey-types/yoga-healing.svg",
  "特殊节庆": "/images/journey-types/festival.svg",
  "亲子&逆向亲子": "/images/journey-types/family.svg"
};

const ROUTE_TYPE_WORDMARK_MAP = {
  "城市漫游": "/images/route-type-wordmark/city-walk.svg",
  "慢旅行": "/images/route-type-wordmark/slow-travel.svg",
  "徒步与自然": "/images/route-type-wordmark/hike-nature.svg",
  "度假放松": "/images/route-type-wordmark/retreat.svg",
  "人宠": "/images/route-type-wordmark/human-pet.svg",
  "摄影创作": "/images/route-type-wordmark/photo-creation.svg",
  "瑜伽疗愈": "/images/route-type-wordmark/yoga-healing.svg",
  "特殊节庆": "/images/route-type-wordmark/festival.svg",
  "亲子&逆向亲子": "/images/route-type-wordmark/family.svg"
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildRouteTypeIconUrl(label) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return "";
  }

  return ROUTE_TYPE_ICON_MAP[normalized] || "";
}

function buildRouteTypeWordmarkUrl(label) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return "";
  }

  return ROUTE_TYPE_WORDMARK_MAP[normalized] || "";
}

function getStatusMeta(status) {
  return STATUS_META[normalizeText(status)] || {
    label: "可报名",
    theme: "available"
  };
}

function getStatusPriority(status) {
  const normalized = normalizeText(status);
  return Object.prototype.hasOwnProperty.call(STATUS_PRIORITY, normalized)
    ? STATUS_PRIORITY[normalized]
    : 99;
}

function buildMonthKey(dateStr) {
  const normalized = normalizeText(dateStr);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return normalized.slice(0, 7);
}

function formatJourneyDate(dateStr, separator = ".") {
  const normalized = normalizeText(dateStr);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return normalized.replace(/-/g, separator);
}

function formatCalendarMonth(monthKey) {
  const normalized = normalizeText(monthKey);
  if (!normalized || !/^\d{4}-\d{2}$/.test(normalized)) {
    return "";
  }

  const year = normalized.slice(0, 4);
  const month = String(Number(normalized.slice(5, 7)) || 0);
  return `${year}年${month}月`;
}

module.exports = {
  ROUTE_TYPE_ORDER,
  STATUS_FILTER_OPTIONS,
  buildMonthKey,
  buildRouteTypeIconUrl,
  buildRouteTypeWordmarkUrl,
  formatCalendarMonth,
  formatJourneyDate,
  getStatusMeta,
  getStatusPriority
};
