const { getJourneyPageData } = require("../../repositories/content-repository");
const { consumePendingJourneyFilter } = require("../../services/navigation");
const {
  enablePageShareMenus,
  createAddToFavorites,
  createShareAppMessage,
  createShareTimeline
} = require("../../utils/share");
const {
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
} = require("../../constants/journey");
const {
  getDestinationRegionLabel,
  normalizeDestinationRegionCode
} = require("../../constants/destination-region");
const {
  DESTINATION_REGION_OPTIONS
} = require("../../constants/destination-region");

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const UPCOMING_WINDOW_DAYS = 14;
const JOURNEY_STATUS_FILTER_OPTIONS = STATUS_FILTER_OPTIONS.filter((item) => item.key !== "available");
const VALID_STATUS_FILTERS = new Set(JOURNEY_STATUS_FILTER_OPTIONS.map((item) => item.key));
const BOOKABLE_STATUS_SET = new Set(["confirmed", "available"]);
const FLOATING_FILTER_SCROLL_EPSILON = 1;
const FLOATING_FILTER_TRIGGER_OFFSET = 8;
const INITIAL_JOURNEY_RENDER_COUNT = 6;
const JOURNEY_RENDER_BATCH_SIZE = 6;
const JOURNEY_VIEW_MODE_STORAGE_KEY = "yezaiJourneyViewMode";
const VALID_JOURNEY_VIEW_MODES = new Set(["image", "grid", "compact"]);
const REGION_SCOPE_TABS = [
  { key: "domestic", label: "国内" },
  { key: "international", label: "国际" }
];
const VALID_REGION_SCOPES = new Set(REGION_SCOPE_TABS.map((item) => item.key));

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lowerCaseText(value) {
  return normalizeText(value).toLowerCase();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function sortDateStrings(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function formatPriceValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  const normalized = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
  return `¥${normalized}`;
}

function buildDateString(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatMonthDay(dateStr, separator = ".") {
  const normalized = normalizeText(dateStr);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return normalized.slice(5).replace("-", separator);
}

function getTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(dateStr, days) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return "";
  }

  const [yearText, monthText, dayText] = dateStr.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isWithinUpcomingWindow(dateStr) {
  const normalized = normalizeText(dateStr);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }

  const today = getTodayDateString();
  const limit = addDays(today, UPCOMING_WINDOW_DAYS - 1);
  return Boolean(today && limit) && normalized >= today && normalized <= limit;
}

function normalizeStatusFilter(status) {
  const normalized = normalizeText(status) || "all";
  return VALID_STATUS_FILTERS.has(normalized) ? normalized : "all";
}

function normalizeJourneyViewMode(mode) {
  const normalized = normalizeText(mode);
  return VALID_JOURNEY_VIEW_MODES.has(normalized) ? normalized : "grid";
}

function getStoredJourneyViewMode() {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
    return "grid";
  }

  try {
    return normalizeJourneyViewMode(wx.getStorageSync(JOURNEY_VIEW_MODE_STORAGE_KEY));
  } catch (error) {
    return "grid";
  }
}

function setStoredJourneyViewMode(mode) {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
    return;
  }

  try {
    wx.setStorageSync(JOURNEY_VIEW_MODE_STORAGE_KEY, mode);
  } catch (error) {
    console.warn("Failed to persist journey view mode", error);
  }
}

function isBookableStatus(status) {
  return BOOKABLE_STATUS_SET.has(normalizeText(status));
}

function buildDisplayStatusTags(status, fallbackText) {
  const normalizedStatus = normalizeText(status);
  const fallback = normalizeText(fallbackText);

  if (normalizedStatus === "confirmed") {
    return [
      Object.assign({ key: "confirmed" }, getStatusMeta("confirmed"))
    ];
  }

  if (normalizedStatus === "available") {
    return [];
  }

  const statusMeta = getStatusMeta(normalizedStatus);
  const text = fallback || statusMeta.label;
  return text ? [
    {
      key: normalizedStatus || "available",
      label: text,
      theme: statusMeta.theme
    }
  ] : [];
}

function buildRouteTypeShortLabel(label) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return "旅程";
  }

  if (normalized.includes("&")) {
    return normalized.split("&")[0];
  }

  return normalized.slice(0, 2);
}

function buildRouteTypeDisplayLabel(label) {
  return normalizeText(label);
}

function buildRegionCountText(count, available) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (!available || !safeCount) {
    return "暂无可报";
  }

  return `${safeCount} 条旅程`;
}

function normalizeRegionScope(scope) {
  const normalized = normalizeText(scope);
  return VALID_REGION_SCOPES.has(normalized) ? normalized : "domestic";
}

function getRegionScopeByCode(regionCode) {
  return normalizeText(regionCode).startsWith("intl_") ? "international" : "domestic";
}

function buildRegionScopeTabs(activeScope) {
  const normalizedActiveScope = normalizeRegionScope(activeScope);
  return REGION_SCOPE_TABS.map((item) => Object.assign({}, item, {
    active: item.key === normalizedActiveScope
  }));
}

function buildRegionSheetColumns(regionOptions, regionScope) {
  const columns = [];
  const activeRegionScope = normalizeRegionScope(regionScope);
  const source = (Array.isArray(regionOptions) ? regionOptions : [])
    .filter((item) => getRegionScopeByCode(item && item.value) === activeRegionScope);

  for (let index = 0; index < source.length; index += 2) {
    columns.push(source.slice(index, index + 2));
  }

  return columns;
}

function buildFallbackRegionOptions(journeys, configuredRegionOptions) {
  const configuredMap = Array.isArray(configuredRegionOptions)
    ? configuredRegionOptions.reduce((result, item) => {
      const value = normalizeText(item && item.value);
      if (value) {
        result[value] = {
          label: normalizeText(item && item.label) || getDestinationRegionLabel(value),
          value,
          image: normalizeText(item && item.image)
        };
      }
      return result;
    }, {})
    : {};
  const discoveredRegionCodes = new Set();

  (Array.isArray(journeys) ? journeys : []).forEach((journey) => {
    unique(journey && journey.destinationRegionCodes).forEach((regionCode) => {
      const normalizedRegionCode = normalizeText(regionCode);
      if (normalizedRegionCode) {
        discoveredRegionCodes.add(normalizedRegionCode);
      }
    });
  });

  return DESTINATION_REGION_OPTIONS
    .filter((item) => discoveredRegionCodes.has(item.value))
    .map((item) => ({
      label: item.label,
      value: item.value,
      image: configuredMap[item.value] ? configuredMap[item.value].image : ""
    }));
}

function buildCalendarWeeks(monthKey, markedDateSet, selectedDate) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return [];
  }

  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const firstDay = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const leadingCount = firstDay.getDay();
  const cells = [];

  for (let index = 0; index < leadingCount; index += 1) {
    cells.push({
      key: `blank-leading-${index}`,
      empty: true
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const fullDate = buildDateString(year, month, day);
    cells.push({
      key: fullDate,
      empty: false,
      label: String(day),
      fullDate,
      marked: markedDateSet.has(fullDate),
      selected: fullDate === selectedDate
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `blank-trailing-${cells.length}`,
      empty: true
    });
  }

  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function buildStatusOptions(selectedStatus) {
  return JOURNEY_STATUS_FILTER_OPTIONS.map((item) => Object.assign({}, item, {
    active: item.key === selectedStatus
  }));
}

function sortPeriods(periods, selectedStatus) {
  return (periods || []).slice().sort((left, right) => {
    if (selectedStatus === "upcoming") {
      const dateDiff = sortDateStrings(left && left.dateStart, right && right.dateStart);
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return getStatusPriority(left && left.status) - getStatusPriority(right && right.status);
    }

    const statusDiff = getStatusPriority(left && left.status) - getStatusPriority(right && right.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    return sortDateStrings(left && left.dateStart, right && right.dateStart);
  });
}

function getRawJourneyRouteTypes(rawJourney) {
  return unique(
    ensureArray(rawJourney && rawJourney.routeTypes)
      .concat(ensureArray(rawJourney && rawJourney.tags))
      .concat(ensureArray(rawJourney && rawJourney.styles))
      .map((item) => normalizeRouteTypeLabel(item))
  );
}

function getRawJourneyPeriods(rawJourney) {
  return ensureArray(rawJourney && rawJourney.activePeriods).length
    ? ensureArray(rawJourney && rawJourney.activePeriods)
    : ensureArray(rawJourney && rawJourney.groupPeriods);
}

Page({
  data: {
    loading: true,
    errorText: "",
    searchKeyword: "",
    visibleRouteTypeOptions: [],
    visibleRegionOptions: [],
    statusOptions: buildStatusOptions("all"),
    selectedRouteType: "",
    selectedDestinationRegionCode: "",
    selectedDestinationRegionLabel: "",
    selectedStatus: "all",
    selectedFilterChips: [],
    resultCountText: "",
    renderedCountText: "",
    displayJourneys: [],
    displayJourneyColumns: [
      { key: "left", items: [] },
      { key: "right", items: [] }
    ],
    hasMoreJourneys: false,
    journeyViewMode: "grid",
    isDateSheetVisible: false,
    isDateSheetAnimating: false,
    isRegionSheetVisible: false,
    isRegionSheetAnimating: false,
    calendarMonthKeys: [],
    activeCalendarMonth: "",
    activeCalendarMonthLabel: "",
    calendarWeekdayLabels: WEEKDAY_LABELS,
    calendarWeeks: [],
    sheetSelectedDate: "",
    sheetSelectedDateLabel: "",
    sheetJourneys: [],
    sheetEmptyTitle: "",
    sheetEmptyDesc: "",
    sheetHintText: "",
    regionScopeTabs: buildRegionScopeTabs("domestic"),
    activeRegionScope: "domestic",
    regionSheetColumns: [],
    hasMarkedDates: false,
    showFloatingFilters: false,
    emptyStateTitle: "暂时没有匹配的旅程",
    emptyStateDescPrimary: "换一个旅程类型、团期状态试试看",
    emptyStateDescSecondary: "也可以直接清空筛选重新浏览",
    showEmptyClearRegionAction: false
  },

  async onLoad() {
    enablePageShareMenus();

    this.allJourneys = [];
    this.filteredJourneys = [];
    this.routeTypeOrder = [];
    this.regionOptions = [];
    this.lastScrollTop = 0;
    this.filterStackTop = 0;
    this.expandedJourneySummaryMap = {};
    this.setData({
      journeyViewMode: getStoredJourneyViewMode()
    });
    await this.loadJourneyData();
  },

  onReady() {
    this.queueMeasureFilterStack();
  },

  onShow() {
    const pendingFilter = consumePendingJourneyFilter();
    if (
      !pendingFilter
      || (!pendingFilter.searchKeyword
        && !pendingFilter.routeType
        && !pendingFilter.status
        && !pendingFilter.destinationRegionCode)
    ) {
      return;
    }

    this.applyJourneyFilters(pendingFilter);
  },

  buildRouteTypeOrder(routeTypeOptions, journeys) {
    const values = unique(
      (journeys || []).flatMap((item) => (
        item && Array.isArray(item.routeTypes)
          ? item.routeTypes.map((tag) => normalizeRouteTypeLabel(tag))
          : []
      ))
    );
    const ordered = ROUTE_TYPE_ORDER.filter((item) => values.includes(item));
    values.forEach((value) => {
      if (value && !ordered.includes(value)) {
        ordered.push(value);
      }
    });
    return ordered;
  },

  normalizeJourney(rawJourney) {
    const routeTypes = getRawJourneyRouteTypes(rawJourney);
    const activePeriods = sortPeriods(getRawJourneyPeriods(rawJourney), "all").map((period) => {
      const statusMeta = getStatusMeta(period && period.status);
      return Object.assign({}, period, {
        statusText: period && period.statusText ? period.statusText : statusMeta.label,
        statusTheme: statusMeta.theme
      });
    });
    const creatorName = normalizeText(rawJourney && rawJourney.creatorName);
    const destinationNames = unique(rawJourney && rawJourney.destinationNames);
    const destinationRegionCodes = unique(rawJourney && rawJourney.destinationRegionCodes);
    const destinationRegionLabels = unique(
      (rawJourney && rawJourney.destinationRegionLabels) || destinationRegionCodes.map((item) => getDestinationRegionLabel(item))
    );
    const searchText = lowerCaseText(
      rawJourney && rawJourney.searchText
        ? rawJourney.searchText
        : [rawJourney && rawJourney.name, creatorName]
          .concat(routeTypes)
          .concat(destinationNames)
          .concat(destinationRegionLabels)
          .join(" ")
    );

    return Object.assign({}, rawJourney, {
      routeTypes,
      primaryRouteType: normalizeRouteTypeLabel(rawJourney && rawJourney.primaryRouteType) || routeTypes[0] || "",
      primaryRouteTypeWordmark: buildRouteTypeWordmarkUrl(
        normalizeRouteTypeLabel(rawJourney && rawJourney.primaryRouteType) || routeTypes[0] || ""
      ),
      activePeriods,
      creatorName,
      destinationNames,
      destinationRegionCodes,
      destinationRegionLabels,
      searchText
    });
  },

  async loadJourneyData() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const payload = await getJourneyPageData();
      const allJourneys = (payload.journeys || []).map((item) => this.normalizeJourney(item));
      this.routeTypeOrder = this.buildRouteTypeOrder(payload.routeTypeOptions, allJourneys);
      const configuredRegionOptions = (payload.regionOptions || []).map((item) => ({
        label: normalizeText(item && item.label),
        value: normalizeText(item && item.value),
        image: normalizeText(item && item.image)
      })).filter((item) => item.value && item.label);
      this.regionOptions = configuredRegionOptions.length
        ? configuredRegionOptions
        : buildFallbackRegionOptions(allJourneys, configuredRegionOptions);
      this.allJourneys = allJourneys;

      this.setData(
        {
          loading: false,
          errorText: ""
        },
        () => {
          this.applyJourneyFilters();
          this.queueMeasureFilterStack();
        }
      );
    } catch (error) {
      console.error("Failed to load journeys", error);
      this.allJourneys = [];
      this.routeTypeOrder = [];
      this.regionOptions = [];
      this.setData({
        loading: false,
        errorText: "旅程列表加载失败，请稍后重试。",
        resultCountText: "",
        displayJourneys: [],
        visibleRouteTypeOptions: [],
        visibleRegionOptions: []
      });
    }
  },

  async retryLoadJourneyData() {
    await this.loadJourneyData();
  },

  resolveFilters(patch) {
    const source = patch || {};
    return {
      searchKeyword: Object.prototype.hasOwnProperty.call(source, "searchKeyword")
        ? normalizeText(source.searchKeyword)
        : this.data.searchKeyword,
      routeType: Object.prototype.hasOwnProperty.call(source, "routeType")
        ? normalizeText(source.routeType)
        : this.data.selectedRouteType,
      destinationRegionCode: Object.prototype.hasOwnProperty.call(source, "destinationRegionCode")
        ? normalizeDestinationRegionCode(source.destinationRegionCode)
        : normalizeDestinationRegionCode(this.data.selectedDestinationRegionCode),
      status: Object.prototype.hasOwnProperty.call(source, "status")
        ? normalizeStatusFilter(source.status)
        : normalizeStatusFilter(this.data.selectedStatus),
      departureDate: ""
    };
  },

  journeyMatchesSearch(journey, keyword) {
    if (!keyword) {
      return true;
    }

    return lowerCaseText(journey && journey.searchText).includes(lowerCaseText(keyword));
  },

  journeyMatchesRegion(journey, regionCode) {
    const normalizedRegionCode = normalizeText(regionCode);
    if (!normalizedRegionCode) {
      return true;
    }

    return Array.isArray(journey && journey.destinationRegionCodes)
      && journey.destinationRegionCodes.includes(normalizedRegionCode);
  },

  journeyMatchesBaseFilters(journey, filters, options) {
    const config = options || {};
    if (!config.excludeSearch && !this.journeyMatchesSearch(journey, filters.searchKeyword)) {
      return false;
    }

    if (!config.excludeRouteType && filters.routeType && !(journey.routeTypes || []).includes(filters.routeType)) {
      return false;
    }

    if (!config.excludeRegion && !this.journeyMatchesRegion(journey, filters.destinationRegionCode)) {
      return false;
    }

    return true;
  },

  filterPeriodsForFilters(periods, filters, options) {
    const config = options || {};
    let filtered = Array.isArray(periods) ? periods.slice() : [];

    if (!config.excludeDate && filters.departureDate) {
      filtered = filtered.filter((item) => item && item.dateStart === filters.departureDate);
    }

    if (!config.excludeStatus && filters.status && filters.status !== "all" && filters.status !== "upcoming") {
      filtered = filtered.filter((item) => item && item.status === filters.status);
    }

    if (!config.excludeStatus && filters.status === "upcoming") {
      filtered = filtered.filter((item) => item && isWithinUpcomingWindow(item.dateStart));
    }

    return filtered;
  },

  getMatchedPeriodsForJourney(journey, filters, options) {
    const config = options || {};
    if (!this.journeyMatchesBaseFilters(journey, filters, config)) {
      return [];
    }

    return this.filterPeriodsForFilters(journey && journey.activePeriods, filters, {
      excludeDate: Boolean(config.excludeDate),
      excludeStatus: Boolean(config.excludeStatus)
    });
  },

  decorateJourneyForDisplay(journey, displayPeriod, options) {
    const settings = options || {};
    const statusMeta = getStatusMeta(displayPeriod && displayPeriod.status);
    const displayStatus = displayPeriod && displayPeriod.status ? displayPeriod.status : "";
    const rawDisplayStatusText = displayPeriod && displayPeriod.statusText ? displayPeriod.statusText : statusMeta.label;
    const displayStatusTags = buildDisplayStatusTags(displayStatus, rawDisplayStatusText);
    const displayStatusText = normalizeText(displayStatus) === "available" ? "" : rawDisplayStatusText;
    const exactPrice = settings.exactPrice === true;
    const periodPriceText = formatPriceValue(displayPeriod && displayPeriod.price);
    const priceText = exactPrice
      ? (periodPriceText || journey.priceLabel || "")
      : (periodPriceText ? `${periodPriceText} 起` : journey.priceLabel || "");
    const slug = journey && journey.slug ? journey.slug : "";
    const summary = journey && journey.summary ? journey.summary : "";
    const expandedSummaryMap = this.expandedJourneySummaryMap || {};

    return {
      slug,
      name: journey && journey.name ? journey.name : "",
      cover: journey && journey.cover ? journey.cover : "",
      summary,
      summaryExpandable: summary.length > 50 || summary.includes("\n"),
      summaryExpanded: Boolean(slug && expandedSummaryMap[slug]),
      creatorName: journey && journey.creatorName ? journey.creatorName : "",
      primaryRouteTypeWordmark: journey && journey.primaryRouteTypeWordmark ? journey.primaryRouteTypeWordmark : "",
      isCustomGroup: Boolean(journey && journey.isCustomGroup),
      priceText,
      displayPeriod,
      displayStatus,
      displayStatusText,
      displayStatusTheme: statusMeta.theme,
      displayStatusTags,
      displayDateText: journey && journey.isCustomGroup
        ? normalizeText(journey.displayDateLabel) || "按需求定制"
        : formatJourneyDate(displayPeriod && displayPeriod.dateStart),
      displayDepartureDatesText: settings.departureDatesText || formatMonthDay(displayPeriod && displayPeriod.dateStart),
      displayPrimaryDepartureDateText: journey && journey.isCustomGroup
        ? normalizeText(journey.displayDateLabel) || "按需求定制"
        : formatMonthDay(displayPeriod && displayPeriod.dateStart),
      displayDurationLabel: normalizeText(displayPeriod && displayPeriod.durationLabel) || journey.durationTag || "",
      displayVersionLabel: normalizeText(displayPeriod && displayPeriod.versionName)
    };
  },

  buildDepartureDatesText(periods) {
    const dateLabels = unique(
      (periods || []).map((item) => formatMonthDay(item && item.dateStart)).filter(Boolean)
    );
    return dateLabels.slice(0, 3).join(" ");
  },

  filterJourneys(filters, options) {
    const settings = options || {};
    const exactPrice = settings.exactPrice === true;

    return (this.allJourneys || [])
      .reduce((result, journey) => {
        const candidatePeriods = this.getMatchedPeriodsForJourney(journey, filters);
        const sortedPeriods = sortPeriods(candidatePeriods, filters.status);
        const displayPeriod = sortedPeriods[0] || null;
        if (!displayPeriod) {
          return result;
        }

        result.push(this.decorateJourneyForDisplay(journey, displayPeriod, {
          exactPrice,
          departureDatesText: this.buildDepartureDatesText(sortedPeriods)
        }));
        return result;
      }, [])
      .sort((left, right) => {
        if (filters.status === "upcoming") {
          const dateDiff = sortDateStrings(left && left.displayPeriod && left.displayPeriod.dateStart, right && right.displayPeriod && right.displayPeriod.dateStart);
          if (dateDiff !== 0) {
            return dateDiff;
          }
        } else {
          const statusDiff = getStatusPriority(left && left.displayStatus) - getStatusPriority(right && right.displayStatus);
          if (statusDiff !== 0) {
            return statusDiff;
          }

          const dateDiff = sortDateStrings(left && left.displayPeriod && left.displayPeriod.dateStart, right && right.displayPeriod && right.displayPeriod.dateStart);
          if (dateDiff !== 0) {
            return dateDiff;
          }
        }

        return normalizeText(left && left.name).localeCompare(normalizeText(right && right.name));
      });
  },

  buildAvailableRouteTypeSet(filters) {
    const matchedTypeSet = new Set();

    (this.allJourneys || []).forEach((journey) => {
      const candidatePeriods = this.getMatchedPeriodsForJourney(journey, filters, {
        excludeRouteType: true
      });
      if (!candidatePeriods.length) {
        return;
      }

      (journey.routeTypes || []).forEach((tag) => matchedTypeSet.add(tag));
    });

    return matchedTypeSet;
  },

  buildVisibleRouteTypeOptions(filters) {
    const availableRouteTypeSet = this.buildAvailableRouteTypeSet(filters);
    const routeTypeOrder = this.routeTypeOrder || [];

    return routeTypeOrder.map((tag, index) => ({
        key: tag,
        value: tag,
        label: buildRouteTypeDisplayLabel(tag),
        icon: buildRouteTypeIconUrl(tag),
        selectedIcon: buildRouteTypeSelectedIconUrl(tag),
        shortLabel: buildRouteTypeShortLabel(tag),
        available: availableRouteTypeSet.has(tag),
        selected: tag === filters.routeType,
        sortIndex: index
      }))
      .sort((left, right) => {
        if (left.available !== right.available) {
          return left.available ? -1 : 1;
        }

        return left.sortIndex - right.sortIndex;
      });
  },

  buildAvailableRegionCountMap(filters) {
    return (this.allJourneys || []).reduce((result, journey) => {
      const candidatePeriods = this.getMatchedPeriodsForJourney(journey, filters, {
        excludeRegion: true,
        excludeDate: true
      });
      if (!candidatePeriods.length) {
        return result;
      }

      unique(journey && journey.destinationRegionCodes).forEach((regionCode) => {
        if (!regionCode) {
          return;
        }

        result[regionCode] = (result[regionCode] || 0) + 1;
      });
      return result;
    }, {});
  },

  buildVisibleRegionOptions(filters) {
    const availableRegionCountMap = this.buildAvailableRegionCountMap(filters);

    return (this.regionOptions || []).map((item) => {
      const value = normalizeText(item && item.value);
      const count = availableRegionCountMap[value] || 0;
      const available = count > 0;

      return {
        key: value,
        value,
        label: normalizeText(item && item.label),
        image: normalizeText(item && item.image),
        count,
        countText: buildRegionCountText(count, available),
        available,
        selected: value === filters.destinationRegionCode
      };
    });
  },

  buildSelectedFilterChips(filters) {
    const chips = [];

    if (filters.searchKeyword) {
      chips.push({
        key: "searchKeyword",
        label: `搜索：${filters.searchKeyword}`
      });
    }

    if (filters.routeType) {
      chips.push({
        key: "routeType",
        label: buildRouteTypeDisplayLabel(filters.routeType)
      });
    }

    if (filters.destinationRegionCode) {
      const destinationRegionLabel = getDestinationRegionLabel(filters.destinationRegionCode);
      if (destinationRegionLabel) {
        chips.push({
          key: "destinationRegionCode",
          label: destinationRegionLabel
        });
      }
    }

    if (filters.status && filters.status !== "all") {
      const statusOption = JOURNEY_STATUS_FILTER_OPTIONS.find((item) => item.key === filters.status);
      if (statusOption) {
        chips.push({
          key: "status",
          label: statusOption.label
        });
      }
    }

    return chips;
  },

  buildCalendarSource(filters) {
    return (this.allJourneys || []).reduce((result, journey) => {
      const periods = sortPeriods(
        this.getMatchedPeriodsForJourney(journey, filters, {
          excludeDate: true
        }).filter((item) => item && isBookableStatus(item.status)),
        filters.status
      );
      if (!periods.length) {
        return result;
      }

      result.push(Object.assign({}, journey, {
        calendarPeriods: sortPeriods(periods, "all")
      }));
      return result;
    }, []);
  },

  buildSheetJourneys(sourceJourneys, selectedDate) {
    if (!selectedDate) {
      return [];
    }

    return (sourceJourneys || [])
      .reduce((result, journey) => {
        const matchedPeriods = (journey.calendarPeriods || []).filter(
          (item) => item && item.dateStart === selectedDate && isBookableStatus(item.status)
        );
        const displayPeriod = sortPeriods(matchedPeriods, "all")[0] || null;
        if (!displayPeriod) {
          return result;
        }

        result.push(this.decorateJourneyForDisplay(journey, displayPeriod, {
          exactPrice: true
        }));
        return result;
      }, [])
      .sort((left, right) => {
        const statusDiff = getStatusPriority(left && left.displayStatus) - getStatusPriority(right && right.displayStatus);
        if (statusDiff !== 0) {
          return statusDiff;
        }

        return normalizeText(left && left.name).localeCompare(normalizeText(right && right.name));
      });
  },

  buildRegionSheetState(filters, visibleRegionOptions) {
    const activeRegionScope = filters && filters.destinationRegionCode
      ? getRegionScopeByCode(filters.destinationRegionCode)
      : normalizeRegionScope(this.data.activeRegionScope);
    return {
      activeRegionScope,
      regionScopeTabs: buildRegionScopeTabs(activeRegionScope),
      regionSheetColumns: buildRegionSheetColumns(visibleRegionOptions, activeRegionScope)
    };
  },

  buildDateSheetState(filters, patch) {
    const dateSheetFilters = {
      searchKeyword: "",
      routeType: "",
      destinationRegionCode: "",
      status: "all",
      departureDate: ""
    };
    const sourceJourneys = this.buildCalendarSource(dateSheetFilters);
    const markedDates = unique(
      sourceJourneys.flatMap((journey) => (journey.calendarPeriods || []).map((period) => period && period.dateStart))
    ).sort(sortDateStrings);
    const monthKeys = unique(markedDates.map((item) => buildMonthKey(item))).sort(sortDateStrings);
    const hasPatchedSelectedDate = Object.prototype.hasOwnProperty.call(patch || {}, "sheetSelectedDate");
    const preferredMonth = Object.prototype.hasOwnProperty.call(patch || {}, "activeCalendarMonth")
      ? normalizeText(patch.activeCalendarMonth)
      : this.data.activeCalendarMonth;
    const currentSelectedDate = hasPatchedSelectedDate
      ? normalizeText(patch.sheetSelectedDate)
      : this.data.sheetSelectedDate;
    const normalizedCurrentSelectedDate = markedDates.includes(currentSelectedDate) ? currentSelectedDate : "";
    const fallbackMonth = buildMonthKey(normalizedCurrentSelectedDate) || monthKeys[0] || "";
    const activeCalendarMonth = monthKeys.includes(preferredMonth) ? preferredMonth : fallbackMonth;
    const sheetSelectedDate = normalizedCurrentSelectedDate && buildMonthKey(normalizedCurrentSelectedDate) === activeCalendarMonth
      ? normalizedCurrentSelectedDate
      : "";
    const markedDateSet = new Set(markedDates);
    const calendarWeeks = buildCalendarWeeks(activeCalendarMonth, markedDateSet, sheetSelectedDate);
    const sheetJourneys = this.buildSheetJourneys(sourceJourneys, sheetSelectedDate);
    const hasMarkedDates = markedDates.length > 0;
    let sheetHintText = "";
    let sheetEmptyTitle = "";
    let sheetEmptyDesc = "";

    if (!hasMarkedDates) {
      sheetHintText = "暂时没有可报名的出行日期。";
      sheetEmptyTitle = "暂时没有可选出行日期";
      sheetEmptyDesc = "旅程数据准备好后，这里会显示可以报名的出发日期。";
    } else if (!sheetSelectedDate && hasPatchedSelectedDate) {
      sheetHintText = "点一个有标记的日期，查看当天所有有在架团期的旅程。";
    } else if (sheetSelectedDate && !sheetJourneys.length) {
      sheetHintText = "这一天暂时没有可报名的旅程。";
    }

    return {
      calendarMonthKeys: monthKeys,
      activeCalendarMonth,
      activeCalendarMonthLabel: formatCalendarMonth(activeCalendarMonth),
      calendarWeeks,
      sheetSelectedDate,
      sheetSelectedDateLabel: formatJourneyDate(sheetSelectedDate),
      sheetJourneys,
      sheetEmptyTitle,
      sheetEmptyDesc,
      sheetHintText,
      hasMarkedDates
    };
  },

  buildEmptyState(filters, filteredJourneys) {
    if (Array.isArray(filteredJourneys) && filteredJourneys.length) {
      return {
        emptyStateTitle: "暂时没有匹配的旅程",
        emptyStateDescPrimary: "换一个旅程类型、团期状态试试看",
        emptyStateDescSecondary: "也可以直接清空筛选重新浏览",
        showEmptyClearRegionAction: false
      };
    }

    if (filters.destinationRegionCode) {
      return {
        emptyStateTitle: `${getDestinationRegionLabel(filters.destinationRegionCode)}暂时没有可报名旅程`,
        emptyStateDescPrimary: "先清空区域看看其他在架旅程，或换一个旅程类型、团期状态试试看。",
        emptyStateDescSecondary: "",
        showEmptyClearRegionAction: true
      };
    }

    return {
      emptyStateTitle: "暂时没有匹配的旅程",
      emptyStateDescPrimary: "换一个旅程类型、团期状态试试看",
      emptyStateDescSecondary: "也可以直接清空筛选重新浏览",
      showEmptyClearRegionAction: false
    };
  },

  getNextJourneyRenderCount(currentCount) {
    const safeCurrent = Math.max(0, Number(currentCount) || 0);
    if (!safeCurrent) {
      return INITIAL_JOURNEY_RENDER_COUNT;
    }

    return safeCurrent + JOURNEY_RENDER_BATCH_SIZE;
  },

  buildRenderedCountText(totalCount, visibleCount) {
    const safeTotal = Math.max(0, Number(totalCount) || 0);
    const safeVisible = Math.max(0, Number(visibleCount) || 0);
    if (!safeTotal) {
      return "";
    }

    if (safeVisible >= safeTotal) {
      return `已显示全部 ${safeTotal} 条旅程`;
    }

    return `已显示 ${safeVisible}/${safeTotal} 条旅程`;
  },

  buildJourneyColumns(journeys) {
    const columns = [
      { key: "left", items: [] },
      { key: "right", items: [] }
    ];

    (Array.isArray(journeys) ? journeys : []).forEach((journey, index) => {
      columns[index % 2].items.push(journey);
    });

    return columns;
  },

  updateVisibleJourneys(nextCount) {
    const sourceJourneys = Array.isArray(this.filteredJourneys) ? this.filteredJourneys : [];
    const visibleCount = Math.min(Math.max(0, Number(nextCount) || 0), sourceJourneys.length);
    const displayJourneys = sourceJourneys.slice(0, visibleCount);

    this.setData({
      displayJourneys,
      displayJourneyColumns: this.buildJourneyColumns(displayJourneys),
      hasMoreJourneys: visibleCount < sourceJourneys.length,
      renderedCountText: this.buildRenderedCountText(sourceJourneys.length, visibleCount)
    });
  },

  loadMoreJourneys() {
    if (!this.data.hasMoreJourneys) {
      return;
    }

    this.updateVisibleJourneys(this.getNextJourneyRenderCount(this.data.displayJourneys.length));
  },

  onJourneySummaryToggle(event) {
    const detail = event && event.detail ? event.detail : {};
    const slug = normalizeText(detail.slug);
    if (!slug) {
      return;
    }

    if (!this.expandedJourneySummaryMap) {
      this.expandedJourneySummaryMap = {};
    }

    this.expandedJourneySummaryMap[slug] = Boolean(detail.expanded);
    const displayJourneys = (this.data.displayJourneys || []).map((journey) => {
      if (!journey || journey.slug !== slug) {
        return journey;
      }

      return Object.assign({}, journey, {
        summaryExpanded: Boolean(detail.expanded)
      });
    });

    this.setData({
      displayJourneys,
      displayJourneyColumns: this.buildJourneyColumns(displayJourneys)
    });
  },

  applyJourneyFilters(patch) {
    const filters = this.resolveFilters(patch);
    const filteredJourneys = this.filterJourneys(filters, {
      exactPrice: false
    });
    this.filteredJourneys = filteredJourneys;
    const initialDisplayJourneys = filteredJourneys.slice(0, INITIAL_JOURNEY_RENDER_COUNT);
    const visibleRouteTypeOptions = this.buildVisibleRouteTypeOptions(filters);
    const visibleRegionOptions = this.buildVisibleRegionOptions(filters);
    const selectedFilterChips = this.buildSelectedFilterChips(filters);
    const selectedDestinationRegionLabel = getDestinationRegionLabel(filters.destinationRegionCode);
    const nextData = Object.assign(
      {
        searchKeyword: filters.searchKeyword,
        selectedRouteType: filters.routeType,
        selectedDestinationRegionCode: filters.destinationRegionCode,
        selectedDestinationRegionLabel,
        selectedStatus: filters.status,
        visibleRouteTypeOptions,
        visibleRegionOptions,
        selectedFilterChips,
        displayJourneys: initialDisplayJourneys,
        displayJourneyColumns: this.buildJourneyColumns(initialDisplayJourneys),
        hasMoreJourneys: initialDisplayJourneys.length < filteredJourneys.length,
        statusOptions: buildStatusOptions(filters.status),
        resultCountText: `共 ${filteredJourneys.length} 条符合条件的旅程`,
        renderedCountText: this.buildRenderedCountText(filteredJourneys.length, initialDisplayJourneys.length)
      },
      this.buildDateSheetState(filters, patch),
      this.buildRegionSheetState(filters, visibleRegionOptions),
      this.buildEmptyState(filters, filteredJourneys)
    );

    this.setData(nextData);
  },

  queueMeasureFilterStack() {
    clearTimeout(this.measureFilterStackTimer);
    this.measureFilterStackTimer = setTimeout(() => {
      this.measureFilterStackTop();
    }, 80);
  },

  measureFilterStackTop() {
    const query = wx.createSelectorQuery();
    query.select(".journey-filter-stack-anchor").boundingClientRect();
    query.exec((result) => {
      const rect = Array.isArray(result) ? result[0] : null;
      if (!rect) {
        return;
      }

      this.filterStackTop = Math.max(0, Number(rect.top || 0) + Number(this.lastScrollTop || 0));
    });
  },

  onPageScroll(event) {
    const scrollTop = Math.max(0, Number(event && event.scrollTop) || 0);
    const lastScrollTop = Number(this.lastScrollTop || 0);
    const triggerTop = Math.max(0, Number(this.filterStackTop || 0));
    const passedTrigger = scrollTop > triggerTop + FLOATING_FILTER_TRIGGER_OFFSET;
    const isScrollingUp = scrollTop < lastScrollTop - FLOATING_FILTER_SCROLL_EPSILON;
    const isScrollingDown = scrollTop > lastScrollTop + FLOATING_FILTER_SCROLL_EPSILON;
    const isAnySheetVisible = this.data.isDateSheetVisible || this.data.isRegionSheetVisible;
    const shouldShow =
      !isAnySheetVisible
      && passedTrigger
      && isScrollingUp;

    const shouldHide =
      this.data.showFloatingFilters
      && (
        isAnySheetVisible
        || !passedTrigger
        || isScrollingDown
      );

    this.lastScrollTop = scrollTop;

    if (shouldShow && !this.data.showFloatingFilters) {
      this.setData({
        showFloatingFilters: true
      });
      return;
    }

    if (shouldHide) {
      this.setData({
        showFloatingFilters: false
      });
    }
  },

  onRouteTypeTap(event) {
    const routeType = normalizeText(event.currentTarget.dataset.value);
    this.applyJourneyFilters({
      routeType: routeType === this.data.selectedRouteType ? "" : routeType
    });
  },

  onStatusTap(event) {
    const status = normalizeText(event.currentTarget.dataset.status) || "all";
    if (status === this.data.selectedStatus) {
      this.applyJourneyFilters({
        status: "all"
      });
      return;
    }

    this.applyJourneyFilters({
      status
    });
  },

  removeFilterChip(event) {
    const key = normalizeText(event.currentTarget.dataset.key);
    const patch = {};

    if (key === "searchKeyword") {
      patch.searchKeyword = "";
    }

    if (key === "routeType") {
      patch.routeType = "";
    }

    if (key === "status") {
      patch.status = "all";
    }

    if (key === "destinationRegionCode") {
      patch.destinationRegionCode = "";
    }

    this.applyJourneyFilters(patch);
  },

  clearAllFilters() {
    this.applyJourneyFilters({
      searchKeyword: "",
      routeType: "",
      destinationRegionCode: "",
      status: "all"
    });
  },

  clearDestinationRegionFilter() {
    this.applyJourneyFilters({
      destinationRegionCode: ""
    });

    if (this.data.isRegionSheetVisible) {
      this.closeRegionSheet();
    }
  },

  onJourneyTap(event) {
    const slug = normalizeText(event.detail && event.detail.slug);
    if (!slug) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${slug}`
    });
  },

  onJourneyDepartureTap(event) {
    const departureDate = normalizeText(event.detail && event.detail.departureDate);
    if (!departureDate) {
      return;
    }

    this.applyJourneyFilters({
      sheetSelectedDate: departureDate,
      activeCalendarMonth: buildMonthKey(departureDate)
    });

    if (this.data.isDateSheetVisible) {
      return;
    }

    this.openDateSheet({
      preserveSelection: true
    });
  },

  showDateSheet(options) {
    const settings = options || {};
    const patch = {
      activeCalendarMonth: this.data.activeCalendarMonth
    };

    if (!settings.preserveSelection) {
      patch.sheetSelectedDate = "";
    }

    this.applyJourneyFilters({
      ...patch
    });
    this.setData(
      {
        isRegionSheetVisible: false,
        isRegionSheetAnimating: false,
        isDateSheetVisible: true,
        isDateSheetAnimating: false,
        showFloatingFilters: false
      },
      () => {
        setTimeout(() => {
          this.setData({
            isDateSheetAnimating: true
          });
        }, 20);
      }
    );
  },

  onReachBottom() {
    if (this.data.isDateSheetVisible || this.data.isRegionSheetVisible || !this.data.hasMoreJourneys) {
      return;
    }

    this.loadMoreJourneys();
  },

  onLoadMoreTap() {
    this.loadMoreJourneys();
  },

  onJourneyViewModeTap(event) {
    const mode = normalizeJourneyViewMode(event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.mode
      : "");
    if (mode === this.data.journeyViewMode) {
      return;
    }

    setStoredJourneyViewMode(mode);
    this.setData({
      journeyViewMode: mode
    });
  },

  getShareImageUrl() {
    const displayJourneys = this.data.displayJourneys || [];
    const allJourneys = this.allJourneys || [];

    return (displayJourneys[0] && displayJourneys[0].cover)
      || (allJourneys[0] && allJourneys[0].cover)
      || "";
  },

  onShareAppMessage() {
    return createShareAppMessage({
      title: "野哉旅程｜旅程",
      pagePath: "/pages/destinations/index",
      imageUrl: this.getShareImageUrl()
    });
  },

  onShareTimeline() {
    return createShareTimeline({
      title: "野哉旅程｜旅程",
      imageUrl: this.getShareImageUrl()
    });
  },

  onAddToFavorites() {
    return createAddToFavorites({
      title: "野哉旅程｜旅程",
      imageUrl: this.getShareImageUrl()
    });
  },

  openRegionSheet() {
    if (this.data.isRegionSheetVisible) {
      return;
    }

    if (this.data.loading) {
      wx.showToast({
        title: "旅程加载中，请稍候",
        icon: "none"
      });
      return;
    }

    if (this.data.errorText) {
      wx.showToast({
        title: "请先重新加载旅程",
        icon: "none"
      });
      return;
    }

    const activeRegionScope = this.data.selectedDestinationRegionCode
      ? getRegionScopeByCode(this.data.selectedDestinationRegionCode)
      : normalizeRegionScope(this.data.activeRegionScope);
    this.setData(
      {
        isDateSheetVisible: false,
        isDateSheetAnimating: false,
        isRegionSheetVisible: true,
        isRegionSheetAnimating: false,
        showFloatingFilters: false,
        activeRegionScope,
        regionScopeTabs: buildRegionScopeTabs(activeRegionScope),
        regionSheetColumns: buildRegionSheetColumns(this.data.visibleRegionOptions, activeRegionScope)
      },
      () => {
        setTimeout(() => {
          this.setData({
            isRegionSheetAnimating: true
          });
        }, 20);
      }
    );
  },

  closeRegionSheet() {
    if (!this.data.isRegionSheetVisible) {
      return;
    }

    this.setData({
      isRegionSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        isRegionSheetVisible: false
      });
    }, 240);
  },

  onRegionScopeTabTap(event) {
    const activeRegionScope = normalizeRegionScope(event.currentTarget.dataset.scope);
    if (activeRegionScope === this.data.activeRegionScope) {
      return;
    }

    this.setData({
      activeRegionScope,
      regionScopeTabs: buildRegionScopeTabs(activeRegionScope),
      regionSheetColumns: buildRegionSheetColumns(this.data.visibleRegionOptions, activeRegionScope)
    });
  },

  onRegionTap(event) {
    const destinationRegionCode = normalizeText(event.currentTarget.dataset.region);
    const regionOption = (this.data.visibleRegionOptions || []).find((item) => item && item.value === destinationRegionCode);
    if (!destinationRegionCode || !regionOption || (!regionOption.available && !regionOption.selected)) {
      return;
    }

    this.applyJourneyFilters({
      destinationRegionCode: destinationRegionCode === this.data.selectedDestinationRegionCode ? "" : destinationRegionCode
    });
    this.closeRegionSheet();
  },

  openDateSheet(options) {
    if (this.data.isDateSheetVisible) {
      return;
    }

    if (this.data.loading) {
      wx.showToast({
        title: "旅程加载中，请稍候",
        icon: "none"
      });
      return;
    }

    if (this.data.errorText) {
      wx.showToast({
        title: "请先重新加载旅程",
        icon: "none"
      });
      return;
    }

    this.showDateSheet(options);
  },

  closeDateSheet() {
    if (!this.data.isDateSheetVisible) {
      return;
    }

    this.setData({
      isDateSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        isDateSheetVisible: false,
        sheetSelectedDate: "",
        sheetSelectedDateLabel: "",
        sheetJourneys: []
      });
    }, 240);
  },

  onPrevCalendarMonth() {
    const monthKeys = this.data.calendarMonthKeys || [];
    const currentIndex = monthKeys.indexOf(this.data.activeCalendarMonth);
    if (currentIndex <= 0) {
      return;
    }

    this.applyJourneyFilters({
      activeCalendarMonth: monthKeys[currentIndex - 1],
      sheetSelectedDate: ""
    });
  },

  onNextCalendarMonth() {
    const monthKeys = this.data.calendarMonthKeys || [];
    const currentIndex = monthKeys.indexOf(this.data.activeCalendarMonth);
    if (currentIndex === -1 || currentIndex >= monthKeys.length - 1) {
      return;
    }

    this.applyJourneyFilters({
      activeCalendarMonth: monthKeys[currentIndex + 1],
      sheetSelectedDate: ""
    });
  },

  onCalendarDayTap(event) {
    const fullDate = normalizeText(event.currentTarget.dataset.date);
    if (!fullDate) {
      return;
    }

    this.applyJourneyFilters({
      sheetSelectedDate: fullDate,
      activeCalendarMonth: buildMonthKey(fullDate)
    });
  },

  onUnload() {
    clearTimeout(this.measureFilterStackTimer);
  }
});
