const { getServiceDetailData } = require("../../../repositories/content-repository");
const { getCheckoutPageConfig } = require("../../../repositories/config-repository");
const { createOrder } = require("../../../repositories/transaction-repository");
const { ensureLoggedIn } = require("../../../services/user");
const { isAuditMode } = require("../../../utils/audit");

function getBasePrice(service, unitPriceFromQuery) {
  if (unitPriceFromQuery != null && !isNaN(Number(unitPriceFromQuery))) {
    return Number(unitPriceFromQuery);
  }
  const matched = String(service.price || "").match(/\d+/);
  return matched ? Number(matched[0]) : 0;
}

function buildEmptyTravelPerson(index) {
  return {
    index,
    name: "",
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

function createSubmissionToken() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
    selectedDate: "",
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
    travelPersons: [],
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
    amountLabelText: "",
    submitButtonText: ""
  },

  async onLoad(options) {
    const [payload, pageConfig] = await Promise.all([
      getServiceDetailData(options.slug),
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
    const travelDate = String(options.travelDate || "").trim();
    const peopleCount = Math.max(1, parseInt(options.peopleCount, 10) || 1);
    const unitPrice = getBasePrice(service, options.unitPrice);
    const subtotal = unitPrice * peopleCount;
    const total = subtotal;

    const versionName = options.versionName ? decodeURIComponent(options.versionName) : (service.type || "");

    const travelPersons = buildTravelPersons(peopleCount);

    this.setData({
      travelDetail: payload.travelDetail || null,
      creator: payload.creator || null,
      selectedVersion: versionName,
      selectedDate: travelDate,
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
      travelPersons,
      service,
      submitting: false,
      submissionToken: createSubmissionToken(),
      agreements: pageConfig.agreements || {},
      contactName: "",
      contactPhone: "",
      summaryTitleText: pageConfig.summaryTitleText,
      serviceAgreementTitle: pageConfig.agreements && pageConfig.agreements.service ? pageConfig.agreements.service.title : "服务协议",
      riskAgreementTitle: pageConfig.agreements && pageConfig.agreements.risk ? pageConfig.agreements.risk.title : "风险告知书",
      refundAgreementTitle: pageConfig.refundAgreementTitle,
      amountLabelText: pageConfig.amountLabelText,
      submitButtonText: pageConfig.submitButtonText
    });
  },

  onTravelPersonInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const travelPersons = this.data.travelPersons.map((p) =>
      String(p.index) === String(index) ? { ...p, [field]: value } : p
    );
    this.setData({ travelPersons });
  },

  onContactInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
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

      for (let i = 0; i < travelPersons.length; i += 1) {
        const p = travelPersons[i];
        if (!p.name || !p.idCard || !p.phone) {
          wx.showToast({
            title: `请完善出行人${i + 1}的姓名、证件号与手机号`,
            icon: "none"
          });
          return;
        }
      }

      if (!contactName || !contactPhone) {
        wx.showToast({
          title: "请填写联系人姓名与联系电话",
          icon: "none"
        });
        return;
      }

      const selectedPeriod = (this.data.groupPeriods || []).find(
        (item) => String(item.dateStart || "") === String(this.data.selectedDate)
      );
      const payable = this.data.total;
      const order = await createOrder({
        clientRequestId: this.data.submissionToken,
        serviceSlug: this.data.service.slug,
        travelDate: this.data.selectedDate,
        peopleCount: this.data.selectedCount,
        amount: payable,
        travelPeriod: selectedPeriod
          ? {
              dateStart: selectedPeriod.dateStart,
              dateEnd: selectedPeriod.dateEnd || selectedPeriod.dateStart
            }
          : {
              dateStart: this.data.selectedDate,
              dateEnd: this.data.selectedDate
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
        traveler: {
          name: contactName,
          idCard: travelPersons[0] ? travelPersons[0].idCard : "",
          phone: contactPhone
        },
        travelers: travelPersons.map((p) => ({
          name: p.name,
          idCard: p.idCard,
          phone: p.phone,
          wechat: p.wechat,
          note: p.note
        })),
        note: travelPersons[0] ? travelPersons[0].note : ""
      });

      wx.redirectTo({
        url: `/pkg/account/payment-result/index?id=${order.id}`
      });
    } catch (error) {
      console.error("Failed to submit order", error);
      this.setData({
        submissionToken: createSubmissionToken()
      });
      wx.showToast({
        title: "提交失败，请稍后重试",
        icon: "none"
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  }
});
