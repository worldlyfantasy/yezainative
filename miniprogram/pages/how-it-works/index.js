const { getHowItWorksData } = require("../../repositories/content-repository");
const { showOfflineOrderNotice } = require("../../utils/offline");
const { isAuditMode, pickAuditText } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    flows: [],
    introText: pickAuditText(
      "野哉以托管支付与分账机制保障双方。当前 PHASE 1 只迁移页面与离线数据，不接支付、合同与云端履约。",
      "野哉会在报名确认、行前沟通与旅程履约之间提供清晰的信息同步与协作安排。"
    ),
    ctaTitle: pickAuditText("后续阶段再接入下单链路", "下一步如何确认报名"),
    ctaDesc: pickAuditText("当前小程序用于离线浏览与结构迁移验收。", "提交报名信息后，平台会统一跟进名额、时间与行前沟通安排，服务时间为工作日 10:00-18:00。"),
    ctaButtonText: pickAuditText("离线模式说明", "查看咨询说明")
  },

  async onLoad() {
    this.setData(await getHowItWorksData());
  },

  handleOfflineOrder() {
    showOfflineOrderNotice();
  }
});
