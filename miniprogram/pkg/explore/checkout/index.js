const { getServiceBookingData } = require("../../../repositories/content-repository");
const { getCheckoutPageConfig } = require("../../../repositories/config-repository");
const { createOrder } = require("../../../repositories/transaction-repository");
const { ensureLoggedIn } = require("../../../services/user");
const { isAuditMode } = require("../../../utils/audit");
const {
  getExceededOrderPeopleLimitMessage,
  getInsufficientSeatsMessage,
  getOrderPeopleLimitMessage,
  normalizeOrderPeopleCount
} = require("../period-seat");
const {
  DOCUMENT_TYPE_PICKER_OPTIONS,
  buildEmptyContactErrors,
  buildEmptyTravelerErrors,
  buildNormalizedTravelerRecord,
  normalizeContactFieldValue,
  normalizeTravelPersonFieldValue,
  validateCheckoutForm,
  validateContactField,
  validateTravelerField
} = require("./form-validation");

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

function buildEmptyTravelPerson(index) {
  return {
    index,
    name: "",
    documentType: "",
    documentTypeIndex: 0,
    documentNumber: "",
    idCard: "",
    phone: "",
    wechat: "",
    note: ""
  };
}

function buildTravelPersons(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(buildEmptyTravelPerson(i + 1));
  }
  return list;
}

function buildTravelPersonErrors(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(buildEmptyTravelerErrors());
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
    documentTypeOptions: DOCUMENT_TYPE_PICKER_OPTIONS.map((item) => item.label),
    contactName: "",
    contactPhone: "",
    agreedService: false,
    agreedRisk: false,
    agreedRefund: false,
    submitting: false,
    submissionToken: "",
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
    const total = subtotal;
    const selectedPeriod = findSelectedPeriod(groupPeriods, periodCode, travelDateStart);

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

    const travelPersons = buildTravelPersons(peopleCount);
    const travelPersonErrors = buildTravelPersonErrors(peopleCount);

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
      total,
      summaryPrice: String(unitPrice),
      summaryCount: String(peopleCount),
      summarySubtotal: String(subtotal),
      summaryTotal: String(total),
      payableText: `¥${subtotal}`,
      peopleCountLimitText: getOrderPeopleLimitMessage(),
      periodCode,
      travelPersons,
      travelPersonErrors,
      service,
      submitting: false,
      submissionToken: createSubmissionToken(),
      agreements: pageConfig.agreements || {},
      contactName: "",
      contactPhone: "",
      contactErrors: buildEmptyContactErrors(),
      summaryTitleText: pageConfig.summaryTitleText,
      serviceAgreementTitle: pageConfig.agreements && pageConfig.agreements.service ? pageConfig.agreements.service.title : "服务协议",
      riskAgreementTitle: pageConfig.agreements && pageConfig.agreements.risk ? pageConfig.agreements.risk.title : "风险告知书",
      refundAgreementTitle: pageConfig.refundAgreementTitle,
      amountLabelText: "",
      submitButtonText: pageConfig.submitButtonText
    });
  },

  onTravelPersonInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const travelPersons = this.data.travelPersons.map((p) =>
      String(p.index) === String(index) ? { ...p, [field]: value } : p
    );
    const travelPersonErrors = this.data.travelPersonErrors.map((errors, idx) => {
      if (idx !== Number(index) - 1) {
        return errors;
      }

      return {
        ...errors,
        [field]: ""
      };
    });
    this.setData({ travelPersons, travelPersonErrors });
  },

  onTravelPersonDocumentTypeChange(e) {
    const { index } = e.currentTarget.dataset;
    const selectedIndex = Number(e.detail.value);
    const selectedOption = DOCUMENT_TYPE_PICKER_OPTIONS[selectedIndex] || DOCUMENT_TYPE_PICKER_OPTIONS[0];
    let currentTraveler = null;
    const travelPersons = this.data.travelPersons.map((person) => {
      if (String(person.index) !== String(index)) {
        return person;
      }

      currentTraveler = buildNormalizedTravelerRecord({
        ...person,
        documentType: selectedOption.value
      });
      return currentTraveler;
    });
    const travelPersonErrors = this.data.travelPersonErrors.map((errors, idx) => {
      if (idx !== Number(index) - 1) {
        return errors;
      }

      return {
        ...errors,
        documentType: validateTravelerField(
          "documentType",
          currentTraveler && currentTraveler.documentType,
          currentTraveler
        ),
        documentNumber: validateTravelerField(
          "documentNumber",
          currentTraveler && currentTraveler.documentNumber,
          currentTraveler
        )
      };
    });
    this.setData({ travelPersons, travelPersonErrors });
  },

  onTravelPersonBlur(e) {
    const { index, field } = e.currentTarget.dataset;
    const normalizedValue = normalizeTravelPersonFieldValue(field, e.detail.value);
    let currentTraveler = null;
    const travelPersons = this.data.travelPersons.map((person) => {
      if (String(person.index) !== String(index)) {
        return person;
      }

      currentTraveler = buildNormalizedTravelerRecord({
        ...person,
        [field]: normalizedValue
      });
      return currentTraveler;
    });
    const travelPersonErrors = this.data.travelPersonErrors.map((errors, idx) => {
      if (idx !== Number(index) - 1) {
        return errors;
      }

      return {
        ...errors,
        [field]: validateTravelerField(
          field,
          currentTraveler && currentTraveler[field],
          currentTraveler
        )
      };
    });
    this.setData({ travelPersons, travelPersonErrors });
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

  async submitOrder() {
    if (this.data.submitting) {
      return;
    }

    this.setData({
      submitting: true
    });

    const { travelPersons, contactName, contactPhone, agreedService, agreedRisk, agreedRefund } = this.data;

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
        contactName,
        contactPhone
      });

      this.setData({
        travelPersons: validationResult.travelPersons,
        travelPersonErrors: validationResult.travelPersonErrors,
        contactName: validationResult.contactName,
        contactPhone: validationResult.contactPhone,
        contactErrors: validationResult.contactErrors
      });

      if (validationResult.firstErrorMessage) {
        wx.showToast({
          title: validationResult.firstErrorMessage,
          icon: "none"
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
        contactName: validationResult.contactName,
        contactPhone: validationResult.contactPhone,
        travelers: validationResult.travelPersons.map((p) => ({
          name: p.name,
          documentType: p.documentType,
          documentNumber: p.documentNumber,
          idCard: p.documentNumber,
          phone: p.phone,
          wechat: p.wechat,
          note: p.note
        }))
      });

      wx.redirectTo({
        url: `/pkg/account/payment-result/index?id=${order.id}`
      });
    } catch (error) {
      console.error("Failed to submit order", error);
      let debugDetail = "";
      try {
        debugDetail = JSON.stringify(error);
      } catch (e) {
        debugDetail = "";
      }
      console.error("Submit order debug detail", {
        message: error && error.message,
        errMsg: error && error.errMsg,
        error: error && error.error,
        reason: error && error.reason,
        serialized: debugDetail
      });
      this.setData({
        submissionToken: createSubmissionToken()
      });
      const toastMessage = getSubmitOrderErrorMessage(error);
      wx.showToast({
        title: toastMessage,
        icon: "none"
      });
      if (toastMessage === "提交失败[E_EMPTY]") {
        wx.showModal({
          title: "下单失败调试信息",
          content: debugDetail || "error object is empty",
          showCancel: false
        });
      }
    } finally {
      this.setData({
        submitting: false
      });
    }
  }
});
