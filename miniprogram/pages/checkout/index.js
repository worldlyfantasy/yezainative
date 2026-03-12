const { getServiceDetailData } = require("../../repositories/content-repository");
const { createOrder } = require("../../services/orders");
const { isAuditMode, pickAuditText } = require("../../utils/audit");

/** Mock 协议正文，后续可改为从后台获取 */
function getAgreementContent(key) {
  const content = {
    service: {
      title: "服务协议",
      content: pickAuditText(
        "一、服务内容与确认\n\n野哉（以下简称「平台」）为用户提供旅行相关服务信息展示、预约与订单管理。您在下单并支付后，即表示与平台及具体服务提供方达成服务约定，双方须按本协议及行程说明履行。\n\n二、费用与支付\n\n订单金额以页面展示及结算为准，支付成功后视为合同成立。如需发票，请在下单时备注或联系客服。因不可抗力或政策原因导致行程变更时，平台将按退订规则与您协商处理。\n\n三、双方义务\n\n平台负责协调行程安排、联络带领者与目的地资源；您需如实提供出行人信息、遵守行程须知与当地规定。因您提供信息不实或自身行为导致的损失，平台不承担责任。\n\n四、其他\n\n本协议未尽事宜以平台公示的补充说明为准。如有争议，双方应友好协商；协商不成的，可向平台运营主体所在地有管辖权的人民法院提起诉讼。",
        "一、服务内容与确认\n\n野哉（以下简称「平台」）为用户提供旅行相关服务信息展示、报名预约与订单管理。您在提交报名信息后，即表示愿意与平台及具体服务提供方进入行前确认流程，双方将按页面说明与后续沟通推进。\n\n二、费用与确认\n\n页面展示金额为当前行程参考价格，具体名额、出发时间与后续安排将在平台确认后进一步同步。如需开票或补充说明，可在报名后与平台沟通。\n\n三、双方义务\n\n平台负责协调行程安排、联络带领者与目的地资源；您需如实提供出行人信息、遵守行程须知与当地规定。因您提供信息不实或自身行为导致的损失，平台不承担责任。\n\n四、其他\n\n本协议未尽事宜以平台公示的补充说明为准。如有争议，双方应友好协商；协商不成的，可向平台运营主体所在地有管辖权的人民法院提起诉讼。"
      )
    },
    risk: {
      title: "风险告知书",
      content:
        "一、户外与旅行风险\n\n您所参与的行程可能涉及徒步、露营、高海拔、野外环境或长途交通等，存在一定人身与财产风险。请根据自身健康状况、体能及经验谨慎选择，并遵守带领者与当地的安全指引。\n\n二、健康与保险\n\n部分行程对年龄、体质或既往病史有要求，请如实告知并自行评估是否适宜参加。平台建议您自行购买与行程相匹配的意外及医疗等保险，以降低不可预见风险带来的损失。\n\n三、免责说明\n\n在您充分知晓并自愿承担上述风险的前提下报名，即视为接受行程固有风险。因不可抗力、第三方原因或您自身原因导致的人身伤害、财产损失或行程变更，平台将依服务协议与退订规则尽力协助，但除法律明确规定外不承担额外赔偿责任。"
    },
    refund: {
      title: pickAuditText("退订规则", "变更说明"),
      content: pickAuditText(
        "一、退订与改期\n\n订单支付成功后，如您因个人原因取消行程，将按以下时间节点收取相应违约金或费用：\n\n· 集合日前 30 天以上：可免费取消或改期一次（如有余位）。\n· 集合日前 16–30 天：扣除订单金额的 20% 作为违约金。\n· 集合日前 10–15 天：扣除订单金额的 50%。\n· 集合日前 5–9 天：扣除订单金额的 70%。\n· 集合日前 1–4 天及当天：不予退款，仅支持名额转让（若服务方同意）。\n\n二、不可抗力与行程变更\n\n因天气、政策、目的地临时关闭等不可抗力导致行程无法成行或重大变更的，平台将与您协商改期、替换线路或按未发生费用比例退款，不收取违约金。\n\n三、名额转让\n\n在符合服务方要求的前提下，您可将名额转让给他人，转让事宜需提前联系客服确认并配合完成信息变更。具体以当次行程说明为准。",
        "一、报名变更与取消\n\n报名信息提交后，如您因个人原因需要取消或调整，请尽快联系平台确认当次行程的可调整空间与处理方式。\n\n二、不可抗力与行程变更\n\n因天气、政策、目的地临时关闭等不可抗力导致行程无法成行或重大变更的，平台将与您协商改期、替换线路或其他合理处理方式。\n\n三、名额转让\n\n在符合服务方要求的前提下，您可将名额转让给他人，转让事宜需提前联系客服确认并配合完成信息变更。具体以当次行程说明为准。"
      )
    }
  };
  return content[key] || { title: "", content: "" };
}

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

Page({
  data: {
    auditMode: isAuditMode(),
    summaryTitleText: pickAuditText("订单摘要", "报名摘要"),
    refundAgreementTitle: pickAuditText("退订规则", "变更说明"),
    travelDetail: null,
    selectedVersion: "",
    selectedDate: "",
    selectedPrice: 0,
    selectedCount: 1,
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
    agreementSheetVisible: false,
    agreementSheetAnimating: false,
    agreementSheetTitle: "",
    agreementSheetContent: "",
    amountLabelText: pickAuditText("应付金额", "参考金额"),
    submitButtonText: pickAuditText("提交订单并支付", "提交报名信息")
  },

  async onLoad(options) {
    const payload = await getServiceDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到服务",
        icon: "none"
      });
      return;
    }

    const service = payload.service;
    const travelDate = String(options.travelDate || "").trim();
    const peopleCount = Math.max(1, parseInt(options.peopleCount, 10) || 1);
    const unitPrice = getBasePrice(service, options.unitPrice);
    const subtotal = unitPrice * peopleCount;
    const total = subtotal;

    const versionName = options.versionName ? decodeURIComponent(options.versionName) : (service.type || "");

    const travelPersons = buildTravelPersons(peopleCount);

    this.setData({
      travelDetail: payload.travelDetail || null,
      selectedVersion: versionName,
      selectedDate: travelDate,
      selectedPrice: unitPrice,
      selectedCount: peopleCount,
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
      contactName: "",
      contactPhone: "",
      amountLabelText: pickAuditText("应付金额", "参考金额"),
      submitButtonText: pickAuditText("提交订单并支付", "提交报名信息")
    });
  },

  onTravelPersonInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const travelPersons = this.data.travelPersons.map((p) =>
      String(p.index) === String(index) ? { ...p, [field]: value } : p
    );
    this.setData({ travelPersons }, () => this.syncContactFromFirst());
  },

  syncContactFromFirst() {
    const first = this.data.travelPersons[0];
    if (!first) return;
    if (!this.data.contactName && first.name) {
      this.setData({ contactName: first.name });
    }
    if (!this.data.contactPhone && first.phone) {
      this.setData({ contactPhone: first.phone });
    }
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
    const { title, content } = getAgreementContent(key);
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

  submitOrder() {
    const { travelPersons, contactName, contactPhone, agreedService, agreedRisk, agreedRefund } = this.data;
    if (!agreedService || !agreedRisk || !agreedRefund) {
      wx.showToast({
        title: "请先阅读并同意全部协议",
        icon: "none"
      });
      return;
    }
    for (let i = 0; i < travelPersons.length; i++) {
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

    const payable = this.data.total;
    const order = createOrder({
      serviceSlug: this.data.service.slug,
      travelDate: this.data.selectedDate,
      peopleCount: this.data.selectedCount,
      amount: payable,
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

    wx.navigateTo({
      url: `/pages/order-detail/index?id=${order.id}`
    });
  }
});
