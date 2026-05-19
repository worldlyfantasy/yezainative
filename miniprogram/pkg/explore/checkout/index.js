const { getServiceBookingData } = require("../../../repositories/content-repository");
const { getCheckoutPageConfig } = require("../../../repositories/config-repository");
const { createOrder } = require("../../../repositories/transaction-repository");
const { payOrderWithWechat } = require("../../../repositories/payment-repository");
const { ensureLoggedIn } = require("../../../services/user");
const { getAssetOverview } = require("../../../api/cloud/referral");
const cloudUserApi = require("../../../api/cloud/user");
const { isAuditMode } = require("../../../utils/audit");
const {
  getExceededOrderPeopleLimitMessage,
  getInsufficientSeatsMessage,
  getOrderPeopleLimitMessage,
  normalizeOrderPeopleCount
} = require("../period-seat");
const {
  DOCUMENT_TYPE_PICKER_OPTIONS,
  GENDER_PICKER_OPTIONS,
  ROOM_TYPE_PICKER_OPTIONS,
  buildEmptyContactErrors,
  buildEmptyRoomingErrors,
  buildEmptyTravelerErrors,
  buildNormalizedTravelerRecord,
  normalizeContactFieldValue,
  normalizeRoomingMode,
  normalizeTravelPersonFieldValue,
  validateCheckoutForm,
  validateContactField,
  validateRoomingFields,
  validateDocumentNumber,
  validateTravelerProfileForm,
  validateTravelerField
} = require("./form-validation");
const { bindSavedTravelerToTravelPersons } = require("./linkage");
const { getPeriodDurationDays } = require("../service-detail/duration-state");

const TRAVELER_PROFILE_STORAGE_KEY_V1 = "checkoutTravelerProfilesV1";
const TRAVELER_PROFILE_STORAGE_KEY = "checkoutTravelerProfilesV2";
const CHECKOUT_FORM_DRAFT_KEY = "checkoutFormDraftV1";
const CHECKOUT_ANALYTICS_KEY = "checkoutEvent";
const TRAVELER_PROFILE_SOURCE = "traveler_profile";
const MANUAL_TRAVELER_SOURCE = "manual";
const MAX_TRAVELER_DOCUMENT_ROWS = 5;
const COUPON_OPTIONS = [
  { id: "", title: "暂不使用优惠", discountType: "none", amountOff: 0, threshold: 0, desc: "" }
];

function toMoneyNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.round(numericValue * 100) / 100;
}

function formatMoney(value) {
  const amount = toMoneyNumber(value);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function getBasePrice(service, periods, unitPriceFromQuery) {
  if (unitPriceFromQuery != null && !isNaN(Number(unitPriceFromQuery))) {
    return Number(unitPriceFromQuery);
  }

  const periodPrices = (Array.isArray(periods) ? periods : [])
    .map((item) => Number(item && item.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (periodPrices.length) {
    return Math.min(...periodPrices);
  }
  return 0;
}

function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function resolveSingleRoomPeriodState(period) {
  const source = period && typeof period === "object" ? period : {};
  return {
    enabled: normalizeBooleanFlag(source.singleRoomEnabled),
    price: toMoneyNumber(Math.max(0, Number(source.singleRoomPrice) || 0)),
    notice: String(source.singleRoomNotice || "").trim()
  };
}

function resolveSelectedSingleRoomCharge(data) {
  const source = data && typeof data === "object" ? data : {};
  const roomingMode = String(source.roomingMode || "").trim();
  if (roomingMode !== "singleRoomRequest") {
    return 0;
  }
  return toMoneyNumber(Math.max(0, Number(source.singleRoomPrice) || 0));
}

function resolveCheckoutAmount(data) {
  const subtotal = Number(data && data.subtotal) || 0;
  return toMoneyNumber(subtotal + resolveSelectedSingleRoomCharge(data));
}

function parseDurationDaysFromTag(value) {
  const matches = String(value == null ? "" : value).trim().match(/\d+/g);
  if (!matches || !matches.length) {
    return 0;
  }
  return Math.max(
    ...matches
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
  );
}

function countItineraryDays(service) {
  const days =
    service &&
    service.travelDetail &&
    service.travelDetail.itinerary &&
    Array.isArray(service.travelDetail.itinerary.days)
      ? service.travelDetail.itinerary.days.length
      : 0;
  return days > 0 ? days : 0;
}

function resolveCheckoutDurationDays(service, period, travelDateStart, travelDateEnd) {
  const periodDays = getPeriodDurationDays(period);
  if (Number.isFinite(periodDays) && periodDays > 0) {
    return periodDays;
  }

  const queryDays = getPeriodDurationDays({
    dateStart: travelDateStart,
    dateEnd: travelDateEnd || travelDateStart
  });
  if (Number.isFinite(queryDays) && queryDays > 0) {
    return queryDays;
  }

  const durationTagDays = parseDurationDaysFromTag(service && service.durationTag);
  if (durationTagDays > 0) {
    return durationTagDays;
  }

  return countItineraryDays(service);
}

function shouldShowRoomingSection(service, period, travelDateStart, travelDateEnd) {
  const durationDays = resolveCheckoutDurationDays(service, period, travelDateStart, travelDateEnd);
  return !durationDays || durationDays > 1;
}

function normalizeCheckoutRoomingMode(value, singleRoomEnabled) {
  const normalized = normalizeRoomingMode(value);
  if (!singleRoomEnabled && normalized === "singleRoomRequest") {
    return "random";
  }
  return normalized;
}

function createEmptyDocumentRow() {
  return {
    rowId: `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    documentType: "",
    documentTypeIndex: 0,
    documentNumber: ""
  };
}

function ensureDocumentRowIds(documents) {
  const list = Array.isArray(documents) ? documents : [];
  return list.map((row) => ({
    ...row,
    rowId: row && row.rowId ? row.rowId : `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }));
}

function buildEmptyTravelPerson(index) {
  return {
    index,
    profileId: "",
    travelerRecordId: "",
    source: MANUAL_TRAVELER_SOURCE,
    name: "",
    documentType: "",
    documentTypeIndex: 0,
    documentNumber: "",
    idCard: "",
    phone: "",
    wechat: "",
    email: "",
    gender: "",
    genderIndex: 0,
    birthday: "",
    note: "",
    documents: [createEmptyDocumentRow()]
  };
}

function buildEmptyTravelerFormDraft() {
  return {
    profileId: "",
    travelerRecordId: "",
    source: TRAVELER_PROFILE_SOURCE,
    name: "",
    gender: "",
    genderIndex: 0,
    birthday: "",
    documents: [createEmptyDocumentRow()],
    phone: "",
    wechat: "",
    email: ""
  };
}

function buildTravelPersons(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(buildEmptyTravelPerson(i + 1));
  }
  return list;
}

function clearTravelerProfileFromTravelPersons(travelPersons, profileId) {
  const targetProfileId = String(profileId || "").trim();
  return (Array.isArray(travelPersons) ? travelPersons : []).map((item, index) => {
    const currentProfileId = String(item && item.profileId ? item.profileId : "").trim();
    if (!targetProfileId || currentProfileId !== targetProfileId) {
      return item;
    }
    return buildEmptyTravelPerson(index + 1);
  });
}

function buildCheckoutDraftKey({ slug, periodCode, travelDateStart, peopleCount, versionName }) {
  return [
    String(slug || "").trim(),
    String(periodCode || "").trim(),
    String(travelDateStart || "").trim(),
    String(Number(peopleCount) > 0 ? Number(peopleCount) : 1),
    String(versionName || "").trim()
  ].join("|");
}

function trackCheckoutEvent(eventName, extras) {
  if (!eventName || typeof wx === "undefined" || typeof wx.reportEvent !== "function") {
    return;
  }
  const payload = Object.assign(
    {
      scene: "checkout",
      eventName,
      ts: Date.now()
    },
    extras || {}
  );
  try {
    wx.reportEvent(CHECKOUT_ANALYTICS_KEY, payload);
  } catch (error) {
    // Ignore analytics failure in checkout critical flow.
  }
}

function loadTravelerProfiles() {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
    return [];
  }

  try {
    let raw = wx.getStorageSync(TRAVELER_PROFILE_STORAGE_KEY);
    if (!Array.isArray(raw) || !raw.length) {
      raw = wx.getStorageSync(TRAVELER_PROFILE_STORAGE_KEY_V1);
    }
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item, idx) => {
        const normalized = buildNormalizedTravelerRecord(item || {});
        const source = String((item && item.source) || "").trim();
        const hasDoc = (normalized.documents || []).some(
          (d) => String(d.documentType || "").trim() || String(d.documentNumber || "").trim()
        );
        if (source !== TRAVELER_PROFILE_SOURCE || (!normalized.name && !normalized.phone && !hasDoc)) {
          return null;
        }
        return {
          ...normalized,
          source,
          profileId: String(
            (item && item.profileId) ||
              (normalized.profileId && normalized.profileId.trim()) ||
              `profile_${idx + 1}`
          )
        };
      })
      .filter(Boolean)
      .slice(0, 12);
  } catch (error) {
    return [];
  }
}

function saveTravelerProfiles(travelers) {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
    return;
  }
  const source = Array.isArray(travelers) ? travelers : [];
  const normalized = source
    .map((traveler, idx) => {
      const record = buildNormalizedTravelerRecord(traveler || {});
      const profileSource = String((traveler && traveler.source) || "").trim();
      const hasDoc = (record.documents || []).some(
        (d) => String(d.documentType || "").trim() || String(d.documentNumber || "").trim()
      );
      if (profileSource !== TRAVELER_PROFILE_SOURCE || (!record.name && !record.phone && !hasDoc)) {
        return null;
      }
      return {
        ...record,
        source: profileSource,
        profileId: String(
          (traveler && traveler.profileId) ||
            (record.profileId && record.profileId.trim()) ||
            `profile_${idx + 1}`
        )
      };
    })
    .filter(Boolean);

  const map = {};
  normalized.forEach((item) => {
    if (!item.profileId) return;
    map[item.profileId] = item;
  });
  const deduped = Object.keys(map)
    .map((key) => map[key])
    .slice(0, 12);

  wx.setStorageSync(TRAVELER_PROFILE_STORAGE_KEY, deduped);
}

async function fetchCloudTravelerProfiles() {
  try {
    const result = await cloudUserApi.listTravelerProfiles();
    const list = Array.isArray(result) ? result : [];
    const normalized = list
      .map((item, idx) => {
        const base = buildNormalizedTravelerRecord(item || {});
        const hasDoc = (base.documents || []).some(
          (d) => String(d.documentType || "").trim() || String(d.documentNumber || "").trim()
        );
        if (!base.name && !base.phone && !hasDoc) {
          return null;
        }
        return {
          ...base,
          source: String((item && item.source) || TRAVELER_PROFILE_SOURCE),
          profileId: String(
            (item && item.profileId) ||
              (item && item.travelerId) ||
              (base.profileId && base.profileId.trim()) ||
              `profile_${idx + 1}`
          )
        };
      })
      .filter(Boolean)
      .slice(0, 12);
    if (normalized.length) {
      saveTravelerProfiles(normalized);
    }
    return normalized;
  } catch (error) {
    return [];
  }
}

function getCouponById(couponId) {
  const options = Array.isArray(arguments[1]) && arguments[1].length ? arguments[1] : COUPON_OPTIONS;
  return options.find((item) => item.id === couponId) || options[0] || COUPON_OPTIONS[0];
}

function resolveCouponDiscount(couponId, subtotal) {
  const coupon = getCouponById(couponId, arguments[2]);
  if (!coupon || !coupon.id || coupon.available === false) {
    return 0;
  }
  const amount = toMoneyNumber(subtotal);
  if (amount < (Number(coupon.threshold) || 0)) {
    return 0;
  }
  if (coupon.discountType === "amount") {
    return toMoneyNumber(Math.max(0, Number(coupon.amountOff) || 0));
  }
  return 0;
}

function isActiveShareReferralCoupon(item) {
  const expiresAt = Number(item && item.expiresAt) || 0;
  return Boolean(
    item
    && item.status === "active"
    && /^share_referral_/.test(String(item.couponType || ""))
    && (!expiresAt || expiresAt >= Date.now())
  );
}

function buildActivityCouponOption(items) {
  const source = Array.isArray(items) ? items.filter(isActiveShareReferralCoupon) : [];
  if (!source.length) {
    return null;
  }

  const sorted = source.slice().sort((left, right) => (Number(right.amount) || 0) - (Number(left.amount) || 0));
  const id = sorted.map((item) => String(item.id || "").trim()).filter(Boolean).join("+");
  const amountOff = sorted.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  const threshold = sorted.reduce((maxValue, item) => Math.max(maxValue, Number(item.threshold) || 0), 0);
  if (!id || amountOff <= 0) {
    return null;
  }

  return {
    id,
    title: `野哉分享家新人券 ¥${amountOff}`,
    discountType: "amount",
    amountOff,
    threshold,
    desc: `满${threshold || 0}可用${sorted.length > 1 ? " · 100+50可叠加" : ""}`,
    source: "share_referral",
    assetIds: sorted.map((item) => String(item.id || "").trim()).filter(Boolean)
  };
}

function updateCouponOptionEligibility(couponOptions, amount) {
  const normalizedAmount = toMoneyNumber(Math.max(0, Number(amount) || 0));
  return (Array.isArray(couponOptions) ? couponOptions : COUPON_OPTIONS).map((item) => {
    const threshold = Math.max(0, Number(item && item.threshold) || 0);
    const available = !item.id || normalizedAmount >= threshold;
    return {
      ...item,
      available,
      unavailableReason: available ? "" : `还差 ¥${formatMoney(threshold - normalizedAmount)} 可用`
    };
  });
}

function buildCouponOptionsFromAssetOverview(assetOverview, amount) {
  const coupons = assetOverview && Array.isArray(assetOverview.coupons) ? assetOverview.coupons : [];
  const activityCoupons = coupons.filter(isActiveShareReferralCoupon);
  const phase2Coupons = activityCoupons.filter((item) => String(item.couponType || "") === "share_referral_welcome_100" || String(item.couponType || "") === "share_referral_bonus_50");
  const phase1Coupons = activityCoupons.filter((item) => String(item.couponType || "") === "share_referral_phase1_welcome_150");
  const activityOption = buildActivityCouponOption(phase2Coupons.length >= 2 ? phase2Coupons.slice(0, 2) : (phase1Coupons.slice(0, 1)[0] ? phase1Coupons.slice(0, 1) : activityCoupons.slice(0, 1)));

  return updateCouponOptionEligibility([
    COUPON_OPTIONS[0],
    ...(activityOption ? [activityOption] : [])
  ], amount);
}

function buildTravelPersonErrors(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(buildEmptyTravelerErrors(1));
  }
  return list;
}

function createSubmissionToken() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatTravelDateText(dateStart, dateEnd) {
  const start = String(dateStart || "").trim();
  const end = String(dateEnd || dateStart || "").trim();

  if (!start) {
    return "";
  }

  if (!end || end === start) {
    return start;
  }

  return `${start} ～ ${end}`;
}

function isBookablePeriodStatus(status) {
  const normalized = String(status || "").trim();
  return normalized === "available" || normalized === "confirmed";
}

function isBookablePeriod(period) {
  return isBookablePeriodStatus(period && period.status);
}

function getPeriodUnavailableMessage(period) {
  const status = String(period && period.status || "").trim();
  if (status === "soldout") {
    return "该团期名额已满";
  }
  if (status === "closed") {
    return "该团期已截止报名";
  }
  return "该团期暂不可报名";
}

function getSubmitOrderErrorMessage(error) {
  const candidates = [];
  if (error && typeof error === "object") {
    candidates.push(error.message, error.errMsg, error.error, error.reason);
    // Common cloud function error shapes
    if (error.result && typeof error.result === "object") {
      candidates.push(error.result.error, error.result.message);
    }
    if (error.data && typeof error.data === "object") {
      candidates.push(error.data.error, error.data.message);
    }
    if (error.response && typeof error.response === "object") {
      candidates.push(error.response.error, error.response.message);
    }
  } else {
    candidates.push(error);
  }

  let raw = "";
  for (let i = 0; i < candidates.length; i += 1) {
    const text = String(candidates[i] == null ? "" : candidates[i]).trim();
    if (text) {
      raw = text;
      break;
    }
  }

  if (!raw) {
    try {
      const serialized = JSON.stringify(error);
      raw = String(serialized || "").trim();
    } catch (e) {
      raw = "";
    }
  }

  if (!raw) {
    return "提交失败[E_EMPTY]";
  }

  const message = raw.toLowerCase();
  if (message.includes("user session inactive")) {
    return "登录状态已失效，请重新登录后再试";
  }
  if (message.includes("service period not found")) {
    return "未找到可报名的团期，请返回重选日期/人数";
  }
  if (message.includes("service period is closed")) {
    return "该团期已截止报名";
  }
  if (message.includes("remaining seats are insufficient")) {
    return "该团期余位不足，请调整人数或更换团期";
  }
  if (message.includes("service period price is invalid")) {
    return "该团期价格异常，请稍后再试";
  }
  if (message.includes("service period changed too frequently")) {
    return "当前报名太火爆，请稍后再试";
  }
  if (message.includes("peoplecount exceeds max allowed")) {
    return getOrderPeopleLimitMessage();
  }

  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
}

function findSelectedPeriod(periods, periodCode, travelDateStart) {
  return (Array.isArray(periods) ? periods : []).find((item) => {
    if (periodCode) {
      return String((item && (item.periodCode || item.id)) || "").trim() === String(periodCode).trim();
    }

    return String(item && item.dateStart || "").trim() === String(travelDateStart || "").trim();
  }) || null;
}

Page({
  data: {
    auditMode: isAuditMode(),
    summaryTitleText: "",
    serviceAgreementTitle: "",
    riskAgreementTitle: "",
    refundAgreementTitle: "",
    travelDetail: null,
    selectedVersion: "",
    selectedDateText: "",
    selectedDateStart: "",
    selectedDateEnd: "",
    selectedPrice: 0,
    selectedCount: 1,
    groupPeriods: [],
    unitPrice: 0,
    subtotal: 0,
    total: 0,
    summaryPrice: "0",
    summaryCount: "1",
    summarySubtotal: "0",
    summaryTotal: "0",
    payableText: "¥0",
    peopleCountLimitText: getOrderPeopleLimitMessage(),
    periodCode: "",
    travelPersons: [],
    travelerProfiles: [],
    travelerSelectionIds: [],
    travelerSheetTargetIndex: -1,
    travelerSheetVisible: false,
    travelerSheetAnimating: false,
    travelerFormVisible: false,
    travelerFormAnimating: false,
    travelerFormDraft: buildEmptyTravelerFormDraft(),
    travelerFormErrors: buildEmptyTravelerErrors(1),
    travelerFormIsNew: false,
    travelerFormSaving: false,
    documentTypeOptions: DOCUMENT_TYPE_PICKER_OPTIONS.map((item) => item.label),
    genderOptions: GENDER_PICKER_OPTIONS.map((item) => item.label),
    roomTypeOptions: ROOM_TYPE_PICKER_OPTIONS.map((item) => item.label),
    emergencyContactName: "",
    emergencyContactPhone: "",
    roomingMode: "random",
    roommateName: "",
    roomType: "twin",
    showRoomingSection: true,
    singleRoomEnabled: false,
    singleRoomPrice: 0,
    summarySingleRoomPrice: "0",
    singleRoomNotice: "",
    roomingErrors: buildEmptyRoomingErrors(),
    allergyNotes: "",
    couponOptions: COUPON_OPTIONS,
    selectedCouponId: "",
    selectedCouponText: "暂不使用优惠",
    pendingCouponId: "",
    pendingCouponText: "暂不使用优惠",
    couponSheetVisible: false,
    couponSheetAnimating: false,
    summaryDiscount: "0",
    summaryPayable: "0",
    agreedService: false,
    agreedRisk: false,
    agreedRefund: false,
    submitting: false,
    submissionToken: "",
    currentOrderId: "",
    agreements: {},
    agreementSheetVisible: false,
    agreementSheetAnimating: false,
    agreementSheetTitle: "",
    agreementSheetContent: "",
    travelPersonErrors: [],
    contactErrors: buildEmptyContactErrors(),
    amountLabelText: "",
    submitButtonText: ""
  },

  async onLoad(options) {
    const [payload, pageConfig] = await Promise.all([
      getServiceBookingData(options.slug),
      getCheckoutPageConfig()
    ]);
    if (!payload) {
      wx.showToast({
        title: "未找到服务",
        icon: "none"
      });
      return;
    }

    const service = payload.service;
    const groupPeriods = Array.isArray(payload.groupPeriods) ? payload.groupPeriods : [];
    const travelDateStart = String(options.travelDateStart || options.travelDate || "").trim();
    const travelDateEnd = String(options.travelDateEnd || options.travelDateStart || options.travelDate || "").trim();
    const periodCode = String(options.periodCode || "").trim();
    const requestedPeopleCount = Math.max(1, parseInt(options.peopleCount, 10) || 1);
    const peopleCount = normalizeOrderPeopleCount(requestedPeopleCount, 1);
    const unitPrice = getBasePrice(service, groupPeriods, options.unitPrice);
    const subtotal = unitPrice * peopleCount;
    const selectedPeriod = findSelectedPeriod(groupPeriods, periodCode, travelDateStart);
    const showRoomingSection = shouldShowRoomingSection(
      service,
      selectedPeriod,
      travelDateStart,
      travelDateEnd
    );
    const singleRoomState = showRoomingSection ? resolveSingleRoomPeriodState(selectedPeriod) : resolveSingleRoomPeriodState(null);

    if (selectedPeriod && !isBookablePeriod(selectedPeriod)) {
      wx.showToast({
        title: getPeriodUnavailableMessage(selectedPeriod),
        icon: "none"
      });
      setTimeout(() => {
        wx.redirectTo({
          url: `/pkg/explore/service-detail/index?slug=${service.slug}`
        });
      }, 250);
      return;
    }

    const seatError = getInsufficientSeatsMessage(selectedPeriod, peopleCount);
    if (seatError) {
      wx.showToast({
        title: seatError,
        icon: "none"
      });
      setTimeout(() => {
        wx.redirectTo({
          url: `/pkg/explore/service-detail/index?slug=${service.slug}`
        });
      }, 250);
      return;
    }

    const peopleLimitError = getExceededOrderPeopleLimitMessage(requestedPeopleCount);
    if (peopleLimitError) {
      wx.showToast({
        title: peopleLimitError,
        icon: "none"
      });
    }

    const versionName = options.versionName ? decodeURIComponent(options.versionName) : (service.type || "");

    const localTravelerProfiles = loadTravelerProfiles();
    const travelPersons = buildTravelPersons(peopleCount);
    const travelPersonErrors = buildTravelPersonErrors(peopleCount);
    const coupon = getCouponById("");
    const discount = resolveCouponDiscount(coupon.id, subtotal);
    const payable = toMoneyNumber(Math.max(0, subtotal - discount));

    this.setData({
      creator: payload.creator || null,
      selectedVersion: versionName,
      selectedDateText: formatTravelDateText(travelDateStart, travelDateEnd),
      selectedDateStart: travelDateStart,
      selectedDateEnd: travelDateEnd,
      selectedPrice: unitPrice,
      selectedCount: peopleCount,
      groupPeriods,
      unitPrice,
      subtotal,
      total: payable,
      summaryPrice: formatMoney(unitPrice),
      summaryCount: String(peopleCount),
      summarySubtotal: formatMoney(subtotal),
      summaryTotal: formatMoney(payable),
      payableText: `¥${formatMoney(payable)}`,
      summaryDiscount: formatMoney(discount),
      summaryPayable: formatMoney(payable),
      peopleCountLimitText: getOrderPeopleLimitMessage(),
      periodCode,
      travelPersons,
      travelPersonErrors,
      travelerProfiles: localTravelerProfiles,
      travelerSelectionIds: [],
      travelerSheetTargetIndex: -1,
      service,
      submitting: false,
      submissionToken: createSubmissionToken(),
      currentOrderId: "",
      agreements: pageConfig.agreements || {},
      agreedService: false,
      agreedRisk: false,
      agreedRefund: false,
      emergencyContactName: "",
      emergencyContactPhone: "",
      contactErrors: buildEmptyContactErrors(),
      roomingMode: normalizeCheckoutRoomingMode("random", singleRoomState.enabled),
      roommateName: "",
      showRoomingSection,
      singleRoomEnabled: singleRoomState.enabled,
      singleRoomPrice: singleRoomState.price,
      summarySingleRoomPrice: "0",
      singleRoomNotice: singleRoomState.notice,
      roomingErrors: buildEmptyRoomingErrors(),
      allergyNotes: "",
      selectedCouponId: coupon.id,
      selectedCouponText: coupon.title,
      summaryTitleText: pageConfig.summaryTitleText,
      serviceAgreementTitle: pageConfig.agreements && pageConfig.agreements.service ? pageConfig.agreements.service.title : "服务协议",
      riskAgreementTitle: pageConfig.agreements && pageConfig.agreements.risk ? pageConfig.agreements.risk.title : "风险告知书",
      refundAgreementTitle: pageConfig.refundAgreementTitle,
      amountLabelText: "",
      submitButtonText: pageConfig.submitButtonText
    });
    trackCheckoutEvent("page_load", {
      peopleCount,
      hasTravelerProfiles: localTravelerProfiles.length > 0
    });

    const travelerProfiles = await fetchCloudTravelerProfiles();
    if (Array.isArray(travelerProfiles) && travelerProfiles.length) {
      this.setData({
        travelerProfiles: travelerProfiles
      });
    }

    await this.refreshActivityCouponOptions();

    this.checkoutDraftKey = buildCheckoutDraftKey({
      slug: service.slug,
      periodCode,
      travelDateStart,
      peopleCount,
      versionName
    });
    this.applyCheckoutDraftFromStorage();
  },

  onHide() {
    this.saveCheckoutDraft();
  },

  onUnload() {
    this.saveCheckoutDraft();
  },

  async refreshActivityCouponOptions() {
    try {
      const assetOverview = await getAssetOverview();
      const couponOptions = buildCouponOptionsFromAssetOverview(assetOverview, resolveCheckoutAmount(this.data));
      const selectedCoupon = getCouponById(this.data.selectedCouponId, couponOptions);
      this.setData(
        {
          couponOptions,
          selectedCouponId: selectedCoupon.available === false ? "" : selectedCoupon.id,
          selectedCouponText: selectedCoupon.available === false ? COUPON_OPTIONS[0].title : selectedCoupon.title,
          pendingCouponId: selectedCoupon.available === false ? "" : selectedCoupon.id,
          pendingCouponText: selectedCoupon.available === false ? COUPON_OPTIONS[0].title : selectedCoupon.title
        },
        () => {
          this.refreshPayableSummary();
        }
      );
    } catch (error) {
      console.error("Failed to load share referral coupons for checkout", error);
    }
  },

  saveCheckoutDraft() {
    if (!this.checkoutDraftKey || !this.data.service) {
      return;
    }
    if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
      return;
    }
    try {
      wx.setStorageSync(CHECKOUT_FORM_DRAFT_KEY, {
        key: this.checkoutDraftKey,
        travelPersons: this.data.travelPersons,
        emergencyContactName: this.data.emergencyContactName,
        emergencyContactPhone: this.data.emergencyContactPhone,
        roomingMode: this.data.roomingMode,
        roommateName: this.data.roommateName,
        roomType: this.data.roomType,
        allergyNotes: this.data.allergyNotes,
        selectedCouponId: this.data.selectedCouponId
      });
    } catch (error) {
      // ignore storage failures
    }
  },

  applyCheckoutDraftFromStorage() {
    const key = this.checkoutDraftKey;
    if (!key || typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
      return;
    }
    try {
      const raw = wx.getStorageSync(CHECKOUT_FORM_DRAFT_KEY);
      if (!raw || typeof raw !== "object" || raw.key !== key) {
        return;
      }
      if (!Array.isArray(raw.travelPersons) || raw.travelPersons.length !== this.data.selectedCount) {
        return;
      }
      const roomingMode = normalizeCheckoutRoomingMode(
        this.data.showRoomingSection ? (raw.roomingMode || "random") : "random",
        this.data.showRoomingSection && this.data.singleRoomEnabled
      );
      let roomType = this.data.showRoomingSection && raw.roomType === "king" ? "king" : "twin";
      const roommateName = this.data.showRoomingSection ? String(raw.roommateName || "").trim() : "";
      if (roomingMode === "random" || !this.data.showRoomingSection) {
        roomType = "twin";
      }
      const coupon = getCouponById(raw.selectedCouponId || "", this.data.couponOptions);
      this.setData(
        {
          travelPersons: raw.travelPersons.map((item, index) => {
            const base = buildEmptyTravelPerson(index + 1);
            const normalized = buildNormalizedTravelerRecord(item || {});
            return {
              ...base,
              ...normalized,
              source: normalized.source || base.source
            };
          }),
          travelPersonErrors: buildTravelPersonErrors(this.data.selectedCount),
          emergencyContactName: String(raw.emergencyContactName || "").trim(),
          emergencyContactPhone: String(raw.emergencyContactPhone || "").trim(),
          roomingMode,
          roommateName,
          roomType,
          roomingErrors: {
            roommateName: validateRoomingFields(roomingMode, roommateName, this.data.selectedCount)
          },
          allergyNotes: String(raw.allergyNotes || ""),
          selectedCouponId: coupon.id,
          selectedCouponText: coupon.title,
          contactErrors: buildEmptyContactErrors()
        },
        () => {
          this.refreshPayableSummary();
        }
      );
    } catch (error) {
      // ignore
    }
  },

  onTravelerFormInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const draft = { ...this.data.travelerFormDraft, [field]: value };
    const travelerFormErrors = {
      ...this.data.travelerFormErrors,
      [field]: ""
    };
    this.setData({ travelerFormDraft: draft, travelerFormErrors });
  },

  patchTravelerFormDocuments(rowId, patch) {
    const draft = this.data.travelerFormDraft;
    const documents = (draft.documents || []).map((row) =>
      row.rowId === rowId ? { ...row, ...patch } : row
    );
    const merged = buildNormalizedTravelerRecord(
      { ...draft, documents },
      { inferDocumentType: false }
    );
    return { ...merged, documents: ensureDocumentRowIds(merged.documents) };
  },

  onTravelerFormDocTypeChange(e) {
    const rowId = String(e.currentTarget.dataset.rowId || "");
    if (!rowId) {
      return;
    }
    const selectedIndex = Number(e.detail.value);
    const selectedOption = DOCUMENT_TYPE_PICKER_OPTIONS[selectedIndex] || DOCUMENT_TYPE_PICKER_OPTIONS[0];
    const travelerFormDraft = this.patchTravelerFormDocuments(rowId, {
      documentType: selectedOption.value
    });
    this.setData({
      travelerFormDraft,
      travelerFormErrors: buildEmptyTravelerErrors(Math.max(1, (travelerFormDraft.documents || []).length))
    });
  },

  onTravelerFormDocNumberInput(e) {
    const rowId = String(e.currentTarget.dataset.rowId || "");
    if (!rowId) {
      return;
    }
    const value = e.detail.value;
    const travelerFormDraft = this.patchTravelerFormDocuments(rowId, { documentNumber: value });
    this.setData({
      travelerFormDraft,
      travelerFormErrors: buildEmptyTravelerErrors(Math.max(1, (travelerFormDraft.documents || []).length))
    });
  },

  onTravelerFormDocNumberBlur(e) {
    const rowId = String(e.currentTarget.dataset.rowId || "");
    if (!rowId) {
      return;
    }
    const normalizedValue = normalizeTravelPersonFieldValue("documentNumber", e.detail.value);
    const travelerFormDraft = this.patchTravelerFormDocuments(rowId, { documentNumber: normalizedValue });
    this.setData({
      travelerFormDraft,
      travelerFormErrors: buildEmptyTravelerErrors(Math.max(1, (travelerFormDraft.documents || []).length))
    });
  },

  onTravelerFormAddDocumentRow() {
    const docs = this.data.travelerFormDraft.documents || [];
    if (docs.length >= MAX_TRAVELER_DOCUMENT_ROWS) {
      wx.showToast({
        title: `最多添加${MAX_TRAVELER_DOCUMENT_ROWS}组证件`,
        icon: "none"
      });
      return;
    }
    const travelerFormDraft = buildNormalizedTravelerRecord(
      {
        ...this.data.travelerFormDraft,
        documents: [...docs, createEmptyDocumentRow()]
      },
      { inferDocumentType: false }
    );
    const finalDraft = { ...travelerFormDraft, documents: ensureDocumentRowIds(travelerFormDraft.documents) };
    this.setData({
      travelerFormDraft: finalDraft,
      travelerFormErrors: buildEmptyTravelerErrors(Math.max(1, (finalDraft.documents || []).length))
    });
  },

  onTravelerFormRemoveDocumentRow(e) {
    const rowId = String(e.currentTarget.dataset.rowId || "");
    const docs = this.data.travelerFormDraft.documents || [];
    if (docs.length <= 1) {
      wx.showToast({
        title: "至少保留一组证件信息",
        icon: "none"
      });
      return;
    }
    if (!rowId) {
      return;
    }
    const nextDocs = docs.filter((row) => row.rowId !== rowId);
    const travelerFormDraft = buildNormalizedTravelerRecord(
      {
        ...this.data.travelerFormDraft,
        documents: nextDocs.length ? nextDocs : [createEmptyDocumentRow()]
      },
      { inferDocumentType: false }
    );
    const finalDraft = { ...travelerFormDraft, documents: ensureDocumentRowIds(travelerFormDraft.documents) };
    this.setData({
      travelerFormDraft: finalDraft,
      travelerFormErrors: buildEmptyTravelerErrors(Math.max(1, (finalDraft.documents || []).length))
    });
  },

  onTravelerFormGenderChange(e) {
    const selectedIndex = Number(e.detail.value);
    const selectedOption = GENDER_PICKER_OPTIONS[selectedIndex] || GENDER_PICKER_OPTIONS[0];
    const merged = buildNormalizedTravelerRecord({
      ...this.data.travelerFormDraft,
      gender: selectedOption.value
    });
    this.setData({
      travelerFormDraft: { ...this.data.travelerFormDraft, ...merged },
      travelerFormErrors: {
        ...this.data.travelerFormErrors,
        gender: validateTravelerField("gender", merged.gender, merged)
      }
    });
  },

  onTravelerFormBirthdayChange(e) {
    const birthday = String(e.detail.value || "").trim();
    const merged = buildNormalizedTravelerRecord({
      ...this.data.travelerFormDraft,
      birthday
    });
    this.setData({
      travelerFormDraft: { ...this.data.travelerFormDraft, ...merged },
      travelerFormErrors: {
        ...this.data.travelerFormErrors,
        birthday: validateTravelerField("birthday", merged.birthday, merged)
      }
    });
  },

  onTravelerFormBlur(e) {
    const { field } = e.currentTarget.dataset;
    const normalizedValue = normalizeTravelPersonFieldValue(field, e.detail.value);
    const merged = buildNormalizedTravelerRecord({
      ...this.data.travelerFormDraft,
      [field]: normalizedValue
    });
    this.setData({
      travelerFormDraft: { ...this.data.travelerFormDraft, ...merged },
      travelerFormErrors: {
        ...this.data.travelerFormErrors,
        [field]: validateTravelerField(field, merged[field], merged)
      }
    });
  },

  openTravelerSheet(e) {
    if (this.data.travelerSheetVisible) {
      return;
    }
    const targetIndex = Number(e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.targetIndex
      : -1);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= this.data.selectedCount) {
      wx.showToast({
        title: "请选择要操作的出行人卡片",
        icon: "none"
      });
      return;
    }
    const travelerProfiles = loadTravelerProfiles();
    const current = this.data.travelPersons[targetIndex] || {};
    const initialSelection = String(current.profileId || "").trim();
    this.setData(
      {
        travelerProfiles,
        travelerSheetVisible: true,
        travelerSheetAnimating: false,
        travelerSelectionIds: initialSelection ? [initialSelection] : [],
        travelerSheetTargetIndex: targetIndex
      },
      () => {
        setTimeout(() => {
          this.setData({ travelerSheetAnimating: true });
        }, 20);
      }
    );
    trackCheckoutEvent("traveler_sheet_open", {
      profileCount: travelerProfiles.length
    });
  },

  closeTravelerSheet() {
    if (!this.data.travelerSheetVisible) {
      return;
    }
    this.setData({ travelerSheetAnimating: false });
    setTimeout(() => {
      this.setData({
        travelerSheetVisible: false,
        travelerSheetTargetIndex: -1,
        travelerSelectionIds: []
      });
    }, 260);
  },

  onTravelerSelectionCheckboxTap(e) {
    const profileId = String(e.currentTarget.dataset.profileId || "").trim();
    if (!profileId) {
      return;
    }
    const selectedSet = new Set(this.data.travelerSelectionIds || []);
    if (selectedSet.has(profileId)) {
      selectedSet.delete(profileId);
    } else {
      selectedSet.clear();
      selectedSet.add(profileId);
    }
    this.setData({
      travelerSelectionIds: Array.from(selectedSet)
    });
  },

  async onDeleteTravelerProfile(e) {
    const profileId = String(e.currentTarget.dataset.profileId || "").trim();
    if (!profileId) {
      return;
    }

    const { confirm } = await new Promise((resolve) => {
      wx.showModal({
        title: "删除出行人",
        content: "请确认是否要删除该出行人，删除后Ta的相关信息不会被保存",
        confirmText: "删除",
        confirmColor: "#b14d35",
        cancelText: "取消",
        success: resolve,
        fail: () => resolve({ confirm: false, cancel: true })
      });
    });
    if (!confirm) {
      return;
    }

    const localProfiles = loadTravelerProfiles().filter((item) => item.profileId !== profileId);
    saveTravelerProfiles(localProfiles);

    const nextTravelPersons = clearTravelerProfileFromTravelPersons(this.data.travelPersons || [], profileId);
    const nextTravelPersonErrors = buildTravelPersonErrors(nextTravelPersons.length);
    const nextSelectionIds = (this.data.travelerSelectionIds || []).filter((item) => item !== profileId);

    this.setData({
      travelerProfiles: localProfiles,
      travelerSelectionIds: nextSelectionIds,
      travelPersons: nextTravelPersons,
      travelPersonErrors: nextTravelPersonErrors
    });

    let cloudSyncSucceeded = false;
    try {
      await cloudUserApi.deleteTravelerProfile(profileId);
      cloudSyncSucceeded = true;
      const cloudProfiles = await fetchCloudTravelerProfiles();
      if (Array.isArray(cloudProfiles) && (cloudProfiles.length || !localProfiles.length)) {
        saveTravelerProfiles(cloudProfiles);
        this.setData({
          travelerProfiles: cloudProfiles
        });
      }
    } catch (error) {
      // Keep local deletion as fallback when cloud sync fails.
    }

    wx.showToast({
      title: cloudSyncSucceeded ? "已删除" : "已从本机删除",
      icon: "none"
    });
  },

  openAddTravelerForm() {
    if (this.data.travelerFormVisible) {
      return;
    }
    this.setData(
      {
        travelerFormVisible: true,
        travelerFormAnimating: false,
        travelerFormDraft: buildEmptyTravelerFormDraft(),
        travelerFormErrors: buildEmptyTravelerErrors(1),
        travelerFormIsNew: true,
        travelerFormSaving: false
      },
      () => {
        setTimeout(() => {
          this.setData({ travelerFormAnimating: true });
        }, 20);
      }
    );
  },

  openTravelerEditForm(e) {
    const profileId = String(e.currentTarget.dataset.profileId || "").trim();
    if (!profileId || this.data.travelerFormVisible) {
      return;
    }
    const profiles = loadTravelerProfiles();
    let profile = profiles.find((item) => item.profileId === profileId);
    if (!profile) {
      const slot = (this.data.travelPersons || []).find(
        (p) => String(p && p.profileId ? p.profileId : "").trim() === profileId
      );
      if (slot) {
        profile = {
          profileId,
          ...buildNormalizedTravelerRecord(slot)
        };
      }
    }
    if (!profile) {
      wx.showToast({
        title: "未找到该出行人档案",
        icon: "none"
      });
      return;
    }
    const normalized = buildNormalizedTravelerRecord(profile);
    const withIds = {
      ...buildEmptyTravelerFormDraft(),
      ...normalized,
      profileId: profile.profileId || "",
      documents: ensureDocumentRowIds(
        normalized.documents && normalized.documents.length
          ? normalized.documents
          : [createEmptyDocumentRow()]
      )
    };
    this.setData(
      {
        travelerProfiles: profiles,
        travelerFormVisible: true,
        travelerFormAnimating: false,
        travelerFormDraft: withIds,
        travelerFormErrors: buildEmptyTravelerErrors(Math.max(1, (withIds.documents || []).length)),
        travelerFormIsNew: false,
        travelerFormSaving: false
      },
      () => {
        setTimeout(() => {
          this.setData({ travelerFormAnimating: true });
        }, 20);
      }
    );
  },

  closeTravelerForm() {
    if (!this.data.travelerFormVisible) {
      return;
    }
    this.travelerFormSaving = false;
    this.setData({ travelerFormAnimating: false });
    setTimeout(() => {
      this.setData({
        travelerFormVisible: false,
        travelerFormDraft: buildEmptyTravelerFormDraft(),
        travelerFormErrors: buildEmptyTravelerErrors(1),
        travelerFormSaving: false
      });
    }, 260);
  },

  async saveTravelerForm() {
    if (this.travelerFormSaving || this.data.travelerFormSaving) {
      return;
    }
    const base = {
      ...this.data.travelerFormDraft,
      profileId: String(this.data.travelerFormDraft.profileId || "").trim(),
      documents: ensureDocumentRowIds(this.data.travelerFormDraft.documents)
    };
    const { normalized, errors, firstErrorMessage } = validateTravelerProfileForm(base);
    if (firstErrorMessage) {
      wx.showToast({
        title: firstErrorMessage,
        icon: "none"
      });
      this.setData({ travelerFormErrors: errors });
      return;
    }

    try {
      this.travelerFormSaving = true;
      this.setData({ travelerFormSaving: true });

      let profileId = base.profileId;
      if (this.data.travelerFormIsNew || !profileId) {
        profileId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      const record = {
        profileId,
        ...normalized,
        source: TRAVELER_PROFILE_SOURCE,
        documents: ensureDocumentRowIds(normalized.documents),
      };

      const localList = loadTravelerProfiles().filter((item) => item.profileId !== profileId);
      localList.unshift(record);
      saveTravelerProfiles(localList);
      let latestProfiles = loadTravelerProfiles();
      let persistedProfile = record;

      let cloudSyncSucceeded = false;
      try {
        const savedProfile = await cloudUserApi.upsertTravelerProfile({
          profileId,
          ...normalized,
          documents: ensureDocumentRowIds(normalized.documents),
          source: TRAVELER_PROFILE_SOURCE
        });
        cloudSyncSucceeded = true;
        if (savedProfile && typeof savedProfile === "object") {
          persistedProfile = savedProfile;
        }
        const cloudProfiles = await fetchCloudTravelerProfiles();
        if (Array.isArray(cloudProfiles) && cloudProfiles.length) {
          latestProfiles = cloudProfiles;
          const matchedProfile = cloudProfiles.find(
            (item) => String(item && item.profileId ? item.profileId : "").trim() === profileId
          );
          if (matchedProfile) {
            persistedProfile = matchedProfile;
          }
        }
      } catch (error) {
        // Keep local persistence as fallback when cloud sync fails.
      }

      const nextTravelPersons = bindSavedTravelerToTravelPersons(
        this.data.travelPersons || [],
        this.data.travelerSheetTargetIndex,
        persistedProfile
      );
      this.setData({
        travelerProfiles: latestProfiles,
        travelPersons: nextTravelPersons
      });
      this.closeTravelerForm();
      wx.showToast({
        title: cloudSyncSucceeded ? "已保存" : "已保存到本机",
        icon: cloudSyncSucceeded ? "success" : "none"
      });
    } finally {
      this.travelerFormSaving = false;
      this.setData({ travelerFormSaving: false });
    }
  },

  onConfirmTravelerSelection() {
    const selectedIds = (this.data.travelerSelectionIds || []).filter(Boolean);
    if (selectedIds.length !== 1) {
      wx.showToast({
        title: "请选择1位出行人",
        icon: "none"
      });
      return;
    }
    const targetIndex = Number(this.data.travelerSheetTargetIndex);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= this.data.selectedCount) {
      wx.showToast({
        title: "请选择要填充的出行人卡片",
        icon: "none"
      });
      return;
    }

    const profileMap = {};
    (this.data.travelerProfiles || []).forEach((item) => {
      if (item && item.profileId) {
        profileMap[item.profileId] = item;
      }
    });

    const selectedProfile = profileMap[selectedIds[0]];
    if (!selectedProfile) {
      wx.showToast({
        title: "出行人资料有误，请重新选择",
        icon: "none"
      });
      return;
    }

    const selectedProfileId = String(selectedProfile.profileId || "").trim();
    const duplicatedIndex = (this.data.travelPersons || []).findIndex(
      (item, idx) => idx !== targetIndex && String(item.profileId || "").trim() === selectedProfileId
    );
    if (duplicatedIndex >= 0) {
      wx.showToast({
        title: `该出行人已用于出行人${duplicatedIndex + 1}`,
        icon: "none"
      });
      return;
    }

    const selectedTraveler = {
      ...buildEmptyTravelPerson(targetIndex + 1),
      ...buildNormalizedTravelerRecord(selectedProfile),
      profileId: selectedProfileId
    };
    const nextTravelPersons = (this.data.travelPersons || []).map((item, idx) =>
      idx === targetIndex ? selectedTraveler : item
    );
    const nextTravelPersonErrors = buildTravelPersonErrors(nextTravelPersons.length);

    this.setData({
      travelPersons: nextTravelPersons,
      travelPersonErrors: nextTravelPersonErrors
    });
    this.closeTravelerSheet();
    trackCheckoutEvent("traveler_selection_confirm", {
      selectedCount: 1,
      targetIndex: targetIndex + 1
    });
  },

  onContactInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value,
      contactErrors: {
        ...this.data.contactErrors,
        [field]: ""
      }
    });
  },

  onContactBlur(e) {
    const field = e.currentTarget.dataset.field;
    const normalizedValue = normalizeContactFieldValue(field, e.detail.value);
    this.setData({
      [field]: normalizedValue,
      contactErrors: {
        ...this.data.contactErrors,
        [field]: validateContactField(field, normalizedValue)
      }
    });
  },

  onRoomingModeChange(e) {
    const roomingMode = normalizeCheckoutRoomingMode(
      e.detail.value || e.currentTarget.dataset.mode,
      this.data.singleRoomEnabled
    );
    const patch = {
      roomingMode,
      roomingErrors: {
        ...this.data.roomingErrors,
        roommateName: validateRoomingFields(roomingMode, this.data.roommateName, this.data.selectedCount)
      }
    };
    if (roomingMode === "random") {
      patch.roomType = "twin";
    }
    this.setData(patch, () => {
      this.refreshPayableSummary();
    });
  },

  onRoomTypeChange(e) {
    if (this.data.roomingMode === "random") {
      this.setData({ roomType: "twin" });
      return;
    }
    const next = String(e.detail.value || e.currentTarget.dataset.roomType || "").trim();
    const roomType = next === "king" ? "king" : "twin";
    this.setData({ roomType });
  },

  onRoommateNameInput(e) {
    this.setData({
      roommateName: e.detail.value,
      roomingErrors: {
        ...this.data.roomingErrors,
        roommateName: ""
      }
    });
  },

  onRoommateNameBlur(e) {
    const roommateName = String(e.detail.value || "").trim();
    this.setData({
      roommateName,
      roomingErrors: {
        ...this.data.roomingErrors,
        roommateName: validateRoomingFields(this.data.roomingMode, roommateName, this.data.selectedCount)
      }
    });
  },

  onAllergyNotesInput(e) {
    this.setData({
      allergyNotes: e.detail.value
    });
  },

  openCouponSheet() {
    if (this.data.couponSheetVisible) return;
    void this.refreshActivityCouponOptions();
    const coupon = getCouponById(this.data.selectedCouponId, this.data.couponOptions);
    this.setData(
      {
        pendingCouponId: coupon.available === false ? "" : coupon.id,
        pendingCouponText: coupon.available === false ? COUPON_OPTIONS[0].title : coupon.title,
        couponSheetVisible: true,
        couponSheetAnimating: false
      },
      () => {
        setTimeout(() => {
          this.setData({ couponSheetAnimating: true });
        }, 20);
      }
    );
  },

  closeCouponSheet() {
    if (!this.data.couponSheetVisible) return;
    this.setData({ couponSheetAnimating: false });
    setTimeout(() => {
      this.setData({
        couponSheetVisible: false
      });
    }, 260);
  },

  onSelectCoupon(e) {
    const couponId = String(e.currentTarget.dataset.couponId || "");
    const coupon = getCouponById(couponId, this.data.couponOptions);
    if (coupon.available === false) {
      wx.showToast({
        title: coupon.unavailableReason || "当前订单不可用",
        icon: "none"
      });
      return;
    }
    this.setData({
      pendingCouponId: coupon.id,
      pendingCouponText: coupon.title
    });
    trackCheckoutEvent("coupon_pending_selected", { couponId: coupon.id || "none" });
  },

  onConfirmCouponSelection() {
    const coupon = getCouponById(this.data.pendingCouponId, this.data.couponOptions);
    if (coupon.available === false) {
      wx.showToast({
        title: coupon.unavailableReason || "当前订单不可用",
        icon: "none"
      });
      return;
    }
    this.setData(
      {
        selectedCouponId: coupon.id,
        selectedCouponText: coupon.title
      },
      () => {
        this.refreshPayableSummary();
        this.closeCouponSheet();
      }
    );
    trackCheckoutEvent("coupon_selected", { couponId: coupon.id || "none" });
  },

  onOpenCouponAssets() {
    this.closeCouponSheet();
    wx.navigateTo({
      url: "/pkg/account/assets/index"
    });
  },

  refreshPayableSummary() {
    const subtotal = toMoneyNumber(this.data.subtotal);
    const singleRoomCharge = resolveSelectedSingleRoomCharge(this.data);
    const amount = toMoneyNumber(subtotal + singleRoomCharge);
    const couponOptions = updateCouponOptionEligibility(this.data.couponOptions, amount);
    const selectedCoupon = getCouponById(this.data.selectedCouponId, couponOptions);
    const effectiveCoupon = selectedCoupon.available === false ? COUPON_OPTIONS[0] : selectedCoupon;
    const discount = resolveCouponDiscount(effectiveCoupon.id, amount, couponOptions);
    const payable = toMoneyNumber(Math.max(0, amount - discount));
    this.setData({
      couponOptions,
      selectedCouponId: effectiveCoupon.id,
      selectedCouponText: effectiveCoupon.title,
      amount,
      total: payable,
      summarySingleRoomPrice: formatMoney(singleRoomCharge),
      summaryDiscount: formatMoney(discount),
      summaryPayable: formatMoney(payable),
      summaryTotal: formatMoney(payable),
      payableText: `¥${formatMoney(payable)}`
    });
  },

  onAgreementChange(e) {
    const selected = e.detail.value || [];
    this.setData({
      agreedService: selected.includes("service"),
      agreedRisk: selected.includes("risk"),
      agreedRefund: selected.includes("refund")
    });
  },

  onAgreementLinkTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const agreement = this.data.agreements[key] || { title: "", content: "" };
    const title = agreement.title || "";
    const content = agreement.content || "";
    this.setData(
      {
        agreementSheetVisible: true,
        agreementSheetAnimating: false,
        agreementSheetTitle: title,
        agreementSheetContent: content
      },
      () => {
        setTimeout(() => {
          this.setData({ agreementSheetAnimating: true });
        }, 20);
      }
    );
  },

  closeAgreementSheet() {
    if (!this.data.agreementSheetVisible) return;
    this.setData({ agreementSheetAnimating: false });
    setTimeout(() => {
      this.setData({
        agreementSheetVisible: false,
        agreementSheetTitle: "",
        agreementSheetContent: ""
      });
    }, 260);
  },

  isPaymentCancel(error) {
    const message = String(error && (error.errMsg || error.message) ? (error.errMsg || error.message) : "");
    return message.indexOf("cancel") >= 0 || message.indexOf("取消") >= 0;
  },

  async startOrderPayment(order) {
    const orderId = order && order.id ? order.id : "";
    if (!orderId) {
      throw new Error("订单号缺失");
    }

    this.setData({
      currentOrderId: orderId,
      submitButtonText: "支付",
      submitting: true
    });

    try {
      const result = await payOrderWithWechat(orderId);
      if (result.confirmation && result.confirmation.paid === false) {
        wx.showToast({
          title: "支付确认中，请稍后查看",
          icon: "none"
        });
      } else {
        wx.showToast({
          title: "支付成功",
          icon: "success"
        });
      }
      wx.redirectTo({
        url: "/pkg/account/orders/index?status=not_departed"
      });
    } catch (error) {
      if (error && error.paymentStage === "confirm") {
        wx.showToast({
          title: "支付确认中，请稍后查看",
          icon: "none"
        });
        wx.redirectTo({
          url: `/pkg/account/order-detail/index?id=${orderId}&pay=pending`
        });
        return;
      }
      if (this.isPaymentCancel(error)) {
        wx.showToast({
          title: "订单已保留，请在30分钟内完成支付",
          icon: "none"
        });
        wx.redirectTo({
          url: `/pkg/account/order-detail/index?id=${orderId}&pay=pending`
        });
        return;
      }
      throw error;
    }
  },

  async submitOrder() {
    if (this.data.submitting) {
      return;
    }

    this.setData({
      submitting: true
    });

    const {
      travelPersons,
      emergencyContactName,
      emergencyContactPhone,
      roomingMode,
      roommateName,
      roomType,
      singleRoomEnabled,
      allergyNotes,
      selectedCouponId,
      agreedService,
      agreedRisk,
      agreedRefund,
      selectedCount
    } = this.data;

    const effectiveRoomingMode = this.data.showRoomingSection ? roomingMode : "random";
    const effectiveRoommateName = this.data.showRoomingSection ? roommateName : "";
    const effectiveRoomType = this.data.showRoomingSection ? roomType : "twin";
    const effectiveSingleRoomEnabled = this.data.showRoomingSection ? singleRoomEnabled : false;

    try {
      const user = await ensureLoggedIn({
        toastTitle: "登录后才可提交报名"
      });
      if (!user) {
        return;
      }

      if (!agreedService || !agreedRisk || !agreedRefund) {
        wx.showToast({
          title: "请先阅读并同意全部协议",
          icon: "none"
        });
        return;
      }

      const validationResult = validateCheckoutForm({
        travelPersons,
        emergencyContactName,
        emergencyContactPhone,
        roomingMode: effectiveRoomingMode,
        roommateName: effectiveRoommateName,
        roomType: effectiveRoomType,
        singleRoomEnabled: effectiveSingleRoomEnabled,
        allergyNotes,
        couponId: selectedCouponId,
        peopleCount: selectedCount
      });
      const normalizedCoupon = getCouponById(validationResult.couponId, this.data.couponOptions);

      this.setData({
        travelPersons: validationResult.travelPersons,
        travelPersonErrors: validationResult.travelPersonErrors,
        emergencyContactName: validationResult.emergencyContactName,
        emergencyContactPhone: validationResult.emergencyContactPhone,
        contactErrors: validationResult.contactErrors,
        roomingMode: validationResult.roomingMode,
        roommateName: validationResult.roommateName,
        roomingErrors: validationResult.roomingErrors,
        roomType: validationResult.roomType,
        allergyNotes: validationResult.allergyNotes,
        selectedCouponId: normalizedCoupon.id,
        selectedCouponText: normalizedCoupon.title
      });
      this.refreshPayableSummary();

      if (validationResult.firstErrorMessage) {
        wx.showToast({
          title: validationResult.firstErrorMessage,
          icon: "none"
        });
        trackCheckoutEvent("submit_validation_error", {
          message: validationResult.firstErrorMessage
        });
        return;
      }

      const selectedPeriod = findSelectedPeriod(
        this.data.groupPeriods,
        this.data.periodCode,
        this.data.selectedDateStart
      );
      if (selectedPeriod && !isBookablePeriod(selectedPeriod)) {
        wx.showToast({
          title: getPeriodUnavailableMessage(selectedPeriod),
          icon: "none"
        });
        return;
      }
      const seatError = getInsufficientSeatsMessage(selectedPeriod, this.data.selectedCount);
      if (seatError) {
        wx.showToast({
          title: seatError,
          icon: "none"
        });
        return;
      }
      const peopleLimitError = getExceededOrderPeopleLimitMessage(this.data.selectedCount);
      if (peopleLimitError) {
        wx.showToast({
          title: peopleLimitError,
          icon: "none"
        });
        return;
      }
      const travelDateStart = selectedPeriod ? selectedPeriod.dateStart : this.data.selectedDateStart;
      const travelDateEnd = selectedPeriod
        ? (selectedPeriod.dateEnd || selectedPeriod.dateStart)
        : (this.data.selectedDateEnd || this.data.selectedDateStart);
      const normalizedPeopleCount = normalizeOrderPeopleCount(this.data.selectedCount, 1);
      const summaryCoupon = getCouponById(validationResult.couponId, this.data.couponOptions);
      const selectedPeriodSingleRoomState =
        this.data.showRoomingSection ? resolveSingleRoomPeriodState(selectedPeriod) : resolveSingleRoomPeriodState(null);
      const order = await createOrder({
        clientRequestId: this.data.submissionToken,
        serviceSlug: this.data.service.slug,
        periodCode: selectedPeriod ? (selectedPeriod.periodCode || "") : this.data.periodCode,
        versionName: selectedPeriod ? selectedPeriod.versionName || this.data.selectedVersion : this.data.selectedVersion,
        travelDateStart,
        travelDateEnd,
        peopleCount: normalizedPeopleCount,
        travelPeriod: {
          dateStart: travelDateStart,
          dateEnd: travelDateEnd
        },
        serviceSnapshot: {
          serviceName: this.data.service.name,
          serviceType: this.data.service.type,
          cover: this.data.service.cover || "",
          creatorRoles: Array.isArray(this.data.service.creatorRoles) ? this.data.service.creatorRoles : []
        },
        creatorSnapshot: this.data.creator
          ? {
              id: this.data.creator.id || "",
              slug: this.data.creator.slug || "",
              name: this.data.creator.name || "",
              avatar: this.data.creator.avatar || "",
              stance: this.data.creator.stance || ""
            }
          : {},
        emergencyContactName: validationResult.emergencyContactName,
        emergencyContactPhone: validationResult.emergencyContactPhone,
        roomingMode: validationResult.roomingMode,
        roommateName: validationResult.roommateName,
        roomType: validationResult.roomType,
        singleRoomEnabled: selectedPeriodSingleRoomState.enabled || effectiveSingleRoomEnabled,
        singleRoomPrice: selectedPeriodSingleRoomState.price || this.data.singleRoomPrice,
        singleRoomNotice: selectedPeriodSingleRoomState.notice || this.data.singleRoomNotice,
        allergyNotes: validationResult.allergyNotes,
        couponId: validationResult.couponId,
        couponSnapshot: summaryCoupon && summaryCoupon.id
          ? {
              id: summaryCoupon.id,
              title: summaryCoupon.title,
              threshold: summaryCoupon.threshold,
              amountOff: summaryCoupon.amountOff
            }
          : null,
        travelers: validationResult.travelPersons.map((p) => ({
          profileId: p.profileId,
          travelerRecordId: p.travelerRecordId,
          source: p.source || (p.profileId || p.travelerRecordId ? TRAVELER_PROFILE_SOURCE : MANUAL_TRAVELER_SOURCE),
          name: p.name,
          documentType: p.documentType,
          documentNumber: p.documentNumber,
          idCard: p.documentNumber,
          documents: (p.documents || [])
            .filter(
              (d) =>
                d.documentType &&
                d.documentNumber &&
                validateDocumentNumber(d.documentType, d.documentNumber) === ""
            )
            .map((d) => ({
              documentType: d.documentType,
              documentNumber: d.documentNumber
            })),
          phone: p.phone,
          wechat: p.wechat,
          email: p.email,
          gender: p.gender,
          birthday: p.birthday,
          note: p.note
        }))
      });
      trackCheckoutEvent("submit_success", {
        peopleCount: normalizedPeopleCount,
        couponId: validationResult.couponId || "none"
      });

      try {
        if (typeof wx !== "undefined" && typeof wx.removeStorageSync === "function") {
          wx.removeStorageSync(CHECKOUT_FORM_DRAFT_KEY);
        }
      } catch (error) {
        // ignore
      }

      await this.startOrderPayment(order);
    } catch (error) {
      console.error("Failed to submit order", error);
      this.setData({
        submissionToken: createSubmissionToken()
      });
      const toastMessage = getSubmitOrderErrorMessage(error);
      trackCheckoutEvent("submit_failed", {
        message: toastMessage
      });
      wx.showToast({
        title: toastMessage,
        icon: "none"
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  }
});
