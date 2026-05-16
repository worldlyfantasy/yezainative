const ROUTE_TYPE_ORDER = [
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

const LEGACY_ROUTE_TYPE_ALIASES = {
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

const ROUTE_TYPE_ICON_BASE = "/images/icons/journey-types";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRouteTypeLabel(label) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return "";
  }

  return LEGACY_ROUTE_TYPE_ALIASES[normalized] || normalized;
}

function buildRouteTypeIconUrl(label) {
  const normalized = normalizeRouteTypeLabel(label);
  if (!ROUTE_TYPE_ORDER.includes(normalized)) {
    return "";
  }

  return `${ROUTE_TYPE_ICON_BASE}/${normalized}2.svg`;
}

function buildRouteTypeSelectedIconUrl(label) {
  const normalized = normalizeRouteTypeLabel(label);
  if (!ROUTE_TYPE_ORDER.includes(normalized)) {
    return "";
  }

  return `${ROUTE_TYPE_ICON_BASE}/${normalized}3.svg`;
}

function buildRouteTypeWordmarkUrl(label) {
  const normalized = normalizeRouteTypeLabel(label);
  if (!ROUTE_TYPE_ORDER.includes(normalized)) {
    return "";
  }

  return `${ROUTE_TYPE_ICON_BASE}/${normalized}1.svg`;
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
  LEGACY_ROUTE_TYPE_ALIASES,
  ROUTE_TYPE_ORDER,
  STATUS_FILTER_OPTIONS,
  buildMonthKey,
  buildRouteTypeIconUrl,
  buildRouteTypeSelectedIconUrl,
  buildRouteTypeWordmarkUrl,
  formatCalendarMonth,
  formatJourneyDate,
  getStatusMeta,
  getStatusPriority,
  normalizeRouteTypeLabel
};
