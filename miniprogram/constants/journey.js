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

const ROUTE_TYPE_ICON_MAP = {
  "山野": "/images/journey-types/shan-ye.svg",
  "城市": "/images/journey-types/cheng-shi.svg",
  "乡土": "/images/journey-types/xiang-tu.svg",
  "户外": "/images/journey-types/hu-wai.svg",
  "研学": "/images/journey-types/yan-xue.svg",
  "文化": "/images/journey-types/wen-hua.svg",
  "内在成长": "/images/journey-types/nei-zai-cheng-zhang.svg",
  "家庭": "/images/journey-types/jia-ting.svg",
  "特殊节庆": "/images/journey-types/te-shu-jie-qing.svg"
};

const ROUTE_TYPE_WORDMARK_MAP = {
  "山野": "/images/route-type-wordmark/shan-ye.svg",
  "城市": "/images/route-type-wordmark/cheng-shi.svg",
  "乡土": "/images/route-type-wordmark/xiang-tu.svg",
  "户外": "/images/route-type-wordmark/hu-wai.svg",
  "研学": "/images/route-type-wordmark/yan-xue.svg",
  "文化": "/images/route-type-wordmark/wen-hua.svg",
  "内在成长": "/images/route-type-wordmark/nei-zai-cheng-zhang.svg",
  "家庭": "/images/route-type-wordmark/jia-ting.svg",
  "特殊节庆": "/images/route-type-wordmark/te-shu-jie-qing.svg"
};

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
  if (!normalized) {
    return "";
  }

  return ROUTE_TYPE_ICON_MAP[normalized] || "";
}

function buildRouteTypeWordmarkUrl(label) {
  const normalized = normalizeRouteTypeLabel(label);
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
  LEGACY_ROUTE_TYPE_ALIASES,
  ROUTE_TYPE_ORDER,
  STATUS_FILTER_OPTIONS,
  buildMonthKey,
  buildRouteTypeIconUrl,
  buildRouteTypeWordmarkUrl,
  formatCalendarMonth,
  formatJourneyDate,
  getStatusMeta,
  getStatusPriority,
  normalizeRouteTypeLabel
};
