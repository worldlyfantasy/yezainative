const { getHowItWorksPageConfig } = require("../../repositories/config-repository");
const { showOfflineOrderNotice } = require("../../utils/offline");
const { isAuditMode } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    flows: [],
    introText: "",
    ctaTitle: "",
    ctaDesc: "",
    ctaButtonText: ""
  },

  async onLoad() {
    this.setData(await getHowItWorksPageConfig());
  },

  handleOfflineOrder() {
    showOfflineOrderNotice();
  }
});
