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
  buildRouteTypeWordmarkUrl,
  formatCalendarMonth,
  formatJourneyDate,
  getStatusMeta,
  getStatusPriority
} = require("../../constants/journey");

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const UPCOMING_WINDOW_DAYS = 14;
const VALID_STATUS_FILTERS = new Set(["all", "confirmed", "available"]);
const BOOKABLE_STATUS_SET = new Set(["confirmed", "available"]);
const FLOATING_FILTER_SCROLL_EPSILON = 1;
const FLOATING_FILTER_TRIGGER_OFFSET = 8;
const INITIAL_JOURNEY_RENDER_COUNT = 6;
const JOURNEY_RENDER_BATCH_SIZE = 6;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lowerCaseText(value) {
  return normalizeText(value).toLowerCase();
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

function isBookableStatus(status) {
  return BOOKABLE_STATUS_SET.has(normalizeText(status));
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
  const normalized = normalizeText(label);
  if (normalized === "亲子&逆向亲子") {
    return "亲子";
  }

  return normalized;
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
  return STATUS_FILTER_OPTIONS.map((item) => Object.assign({}, item, {
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

Page({
  data: {
    loading: true,
    errorText: "",
    searchKeyword: "",
    visibleRouteTypeOptions: [],
    statusOptions: buildStatusOptions("all"),
    selectedRouteType: "",
    selectedStatus: "all",
    selectedDepartureDate: "",
    selectedDepartureDateLabel: "",
    selectedFilterChips: [],
    resultCountText: "",
    renderedCountText: "",
    displayJourneys: [],
    hasMoreJourneys: false,
    isDateSheetVisible: false,
    isDateSheetAnimating: false,
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
    hasMarkedDates: false,
    showFloatingFilters: false
  },

  async onLoad() {
    enablePageShareMenus();

    this.allJourneys = [];
    this.filteredJourneys = [];
    this.routeTypeOrder = [];
    this.lastScrollTop = 0;
    this.filterStackTop = 0;
    await this.loadJourneyData();
  },

  onReady() {
    this.queueMeasureFilterStack();
  },

  onShow() {
    const pendingFilter = consumePendingJourneyFilter();
    if (
      !pendingFilter
      || (!pendingFilter.searchKeyword && !pendingFilter.routeType && !pendingFilter.status && !pendingFilter.departureDate)
    ) {
      return;
    }

    this.applyJourneyFilters(pendingFilter);
  },

  buildRouteTypeOrder(routeTypeOptions, journeys) {
    const values = unique(
      ROUTE_TYPE_ORDER
        .concat((routeTypeOptions || []).map((item) => normalizeText(item && (item.value || item.label))))
        .concat((journeys || []).flatMap((item) => item && Array.isArray(item.routeTypes) ? item.routeTypes : []))
    );
    const ordered = ROUTE_TYPE_ORDER.filter((item) => values.includes(item));
    const availableTypeSet = new Set();

    (journeys || []).forEach((journey) => {
      if (!Array.isArray(journey && journey.activePeriods) || !journey.activePeriods.length) {
        return;
      }

      (journey.routeTypes || []).forEach((tag) => {
        availableTypeSet.add(tag);
      });
    });

    values.forEach((value) => {
      if (!ordered.includes(value)) {
        ordered.push(value);
      }
    });

    return ordered
      .filter((value) => availableTypeSet.has(value))
      .concat(ordered.filter((value) => !availableTypeSet.has(value)));
  },

  normalizeJourney(rawJourney) {
    const routeTypes = unique(rawJourney && rawJourney.routeTypes);
    const activePeriods = sortPeriods(rawJourney && rawJourney.activePeriods, "all").map((period) => {
      const statusMeta = getStatusMeta(period && period.status);
      return Object.assign({}, period, {
        statusText: period && period.statusText ? period.statusText : statusMeta.label,
        statusTheme: statusMeta.theme
      });
    });
    const creatorName = normalizeText(rawJourney && rawJourney.creatorName);
    const destinationNames = unique(rawJourney && rawJourney.destinationNames);
    const searchText = lowerCaseText(
      rawJourney && rawJourney.searchText
        ? rawJourney.searchText
        : [rawJourney && rawJourney.name, creatorName]
          .concat(routeTypes)
          .concat(destinationNames)
          .join(" ")
    );

    return Object.assign({}, rawJourney, {
      routeTypes,
      primaryRouteType: normalizeText(rawJourney && rawJourney.primaryRouteType) || routeTypes[0] || "",
      primaryRouteTypeWordmark: buildRouteTypeWordmarkUrl(
        normalizeText(rawJourney && rawJourney.primaryRouteType) || routeTypes[0] || ""
      ),
      activePeriods,
      creatorName,
      destinationNames,
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
      this.setData({
        loading: false,
        errorText: "旅程列表加载失败，请稍后重试。",
        resultCountText: "",
        displayJourneys: [],
        visibleRouteTypeOptions: []
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
      status: Object.prototype.hasOwnProperty.call(source, "status")
        ? normalizeStatusFilter(source.status)
        : normalizeStatusFilter(this.data.selectedStatus),
      departureDate: Object.prototype.hasOwnProperty.call(source, "departureDate")
        ? normalizeText(source.departureDate)
        : this.data.selectedDepartureDate
    };
  },

  journeyMatchesSearch(journey, keyword) {
    if (!keyword) {
      return true;
    }

    return lowerCaseText(journey && journey.searchText).includes(lowerCaseText(keyword));
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

  decorateJourneyForDisplay(journey, displayPeriod, options) {
    const settings = options || {};
    const statusMeta = getStatusMeta(displayPeriod && displayPeriod.status);
    const exactPrice = settings.exactPrice === true;
    const priceText = exactPrice
      ? (formatPriceValue(displayPeriod && displayPeriod.price) || journey.priceLabel || "")
      : (journey.priceLabel || (formatPriceValue(displayPeriod && displayPeriod.price) ? `${formatPriceValue(displayPeriod && displayPeriod.price)} 起` : ""));

    return {
      slug: journey && journey.slug ? journey.slug : "",
      name: journey && journey.name ? journey.name : "",
      cover: journey && journey.cover ? journey.cover : "",
      summary: journey && journey.summary ? journey.summary : "",
      creatorName: journey && journey.creatorName ? journey.creatorName : "",
      primaryRouteTypeWordmark: journey && journey.primaryRouteTypeWordmark ? journey.primaryRouteTypeWordmark : "",
      priceText,
      displayPeriod,
      displayStatus: displayPeriod && displayPeriod.status ? displayPeriod.status : "",
      displayStatusText: displayPeriod && displayPeriod.statusText ? displayPeriod.statusText : statusMeta.label,
      displayStatusTheme: statusMeta.theme,
      displayDateText: formatJourneyDate(displayPeriod && displayPeriod.dateStart),
      displayDepartureDatesText: settings.departureDatesText || formatMonthDay(displayPeriod && displayPeriod.dateStart),
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
        if (!this.journeyMatchesSearch(journey, filters.searchKeyword)) {
          return result;
        }

        if (filters.routeType && !(journey.routeTypes || []).includes(filters.routeType)) {
          return result;
        }

        const candidatePeriods = this.filterPeriodsForFilters(journey.activePeriods, filters);
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
      if (!this.journeyMatchesSearch(journey, filters.searchKeyword)) {
        return;
      }

      const candidatePeriods = this.filterPeriodsForFilters(journey.activePeriods, filters, { excludeDate: false, excludeStatus: false });
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

    return routeTypeOrder.map((tag) => ({
        key: tag,
        value: tag,
        label: buildRouteTypeDisplayLabel(tag),
        icon: buildRouteTypeIconUrl(tag),
        shortLabel: buildRouteTypeShortLabel(tag),
        available: availableRouteTypeSet.has(tag),
        selected: tag === filters.routeType
      }));
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

    if (filters.status && filters.status !== "all") {
      const statusOption = STATUS_FILTER_OPTIONS.find((item) => item.key === filters.status);
      if (statusOption) {
        chips.push({
          key: "status",
          label: statusOption.label
        });
      }
    }

    if (filters.departureDate) {
      chips.push({
        key: "departureDate",
        label: formatJourneyDate(filters.departureDate)
      });
    }

    return chips;
  },

  buildCalendarSource(filters) {
    return (this.allJourneys || []).reduce((result, journey) => {
      const periods = sortPeriods(
        (journey.activePeriods || []).filter((item) => item && isBookableStatus(item.status)),
        "all"
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

  findFirstMarkedDateForMonth(monthKey, markedDates) {
    return (markedDates || []).find((item) => buildMonthKey(item) === monthKey) || "";
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

  buildDateSheetState(filters, patch) {
    const sourceJourneys = this.buildCalendarSource(filters);
    const markedDates = unique(
      sourceJourneys.flatMap((journey) => (journey.calendarPeriods || []).map((period) => period && period.dateStart))
    ).sort(sortDateStrings);
    const monthKeys = unique(markedDates.map((item) => buildMonthKey(item))).sort(sortDateStrings);
    const preferredMonth = Object.prototype.hasOwnProperty.call(patch || {}, "activeCalendarMonth")
      ? normalizeText(patch.activeCalendarMonth)
      : this.data.activeCalendarMonth;
    const dateFromFilter = filters.departureDate;
    const currentSelectedDate = Object.prototype.hasOwnProperty.call(patch || {}, "sheetSelectedDate")
      ? normalizeText(patch.sheetSelectedDate)
      : this.data.sheetSelectedDate;
    const fallbackMonth = buildMonthKey(dateFromFilter) || buildMonthKey(currentSelectedDate) || monthKeys[0] || "";
    const activeCalendarMonth = monthKeys.includes(preferredMonth) ? preferredMonth : fallbackMonth;
    const defaultDate = this.findFirstMarkedDateForMonth(activeCalendarMonth, markedDates) || (activeCalendarMonth ? `${activeCalendarMonth}-01` : "");
    const sheetSelectedDate = currentSelectedDate && buildMonthKey(currentSelectedDate) === activeCalendarMonth
      ? currentSelectedDate
      : (dateFromFilter && buildMonthKey(dateFromFilter) === activeCalendarMonth ? dateFromFilter : defaultDate);
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

  updateVisibleJourneys(nextCount) {
    const sourceJourneys = Array.isArray(this.filteredJourneys) ? this.filteredJourneys : [];
    const visibleCount = Math.min(Math.max(0, Number(nextCount) || 0), sourceJourneys.length);

    this.setData({
      displayJourneys: sourceJourneys.slice(0, visibleCount),
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

  applyJourneyFilters(patch) {
    const filters = this.resolveFilters(patch);
    const filteredJourneys = this.filterJourneys(filters, {
      exactPrice: Boolean(filters.departureDate)
    });
    this.filteredJourneys = filteredJourneys;
    const initialDisplayJourneys = filteredJourneys.slice(0, INITIAL_JOURNEY_RENDER_COUNT);
    const visibleRouteTypeOptions = this.buildVisibleRouteTypeOptions(filters);
    const selectedFilterChips = this.buildSelectedFilterChips(filters);
    const nextData = Object.assign(
      {
        searchKeyword: filters.searchKeyword,
        selectedRouteType: filters.routeType,
        selectedStatus: filters.status,
        selectedDepartureDate: filters.departureDate,
        selectedDepartureDateLabel: formatJourneyDate(filters.departureDate),
        visibleRouteTypeOptions,
        selectedFilterChips,
        displayJourneys: initialDisplayJourneys,
        hasMoreJourneys: initialDisplayJourneys.length < filteredJourneys.length,
        statusOptions: buildStatusOptions(filters.status),
        resultCountText: `共 ${filteredJourneys.length} 条符合条件的旅程`,
        renderedCountText: this.buildRenderedCountText(filteredJourneys.length, initialDisplayJourneys.length)
      },
      this.buildDateSheetState(filters, patch)
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
    const shouldShow =
      !this.data.isDateSheetVisible
      && passedTrigger
      && isScrollingUp;

    const shouldHide =
      this.data.showFloatingFilters
      && (
        this.data.isDateSheetVisible
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

    if (key === "departureDate") {
      patch.departureDate = "";
    }

    this.applyJourneyFilters(patch);
  },

  clearAllFilters() {
    this.applyJourneyFilters({
      searchKeyword: "",
      routeType: "",
      status: "all",
      departureDate: ""
    });
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
      status: "all",
      departureDate
    });
  },

  onReachBottom() {
    if (this.data.isDateSheetVisible || !this.data.hasMoreJourneys) {
      return;
    }

    this.loadMoreJourneys();
  },

  onLoadMoreTap() {
    this.loadMoreJourneys();
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

  openDateSheet() {
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

    this.setData(
      {
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

  closeDateSheet() {
    if (!this.data.isDateSheetVisible) {
      return;
    }

    this.setData({
      isDateSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        isDateSheetVisible: false
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
      routeType: "",
      status: "all",
      departureDate: fullDate,
      sheetSelectedDate: fullDate,
      activeCalendarMonth: buildMonthKey(fullDate)
    });
  },

  clearDateSelection() {
    this.applyJourneyFilters({
      departureDate: "",
      sheetSelectedDate: "",
      activeCalendarMonth: this.data.activeCalendarMonth
    });
    this.closeDateSheet();
  },

  confirmDateSelection() {
    if (!this.data.sheetSelectedDate) {
      return;
    }

    this.applyJourneyFilters({
      departureDate: this.data.sheetSelectedDate
    });
    this.closeDateSheet();
  },

  onUnload() {
    clearTimeout(this.measureFilterStackTimer);
  }
});
