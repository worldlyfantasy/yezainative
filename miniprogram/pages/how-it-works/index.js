const { getHowItWorksData } = require("../../services/content");
const { showOfflineOrderNotice } = require("../../utils/offline");

Page({
  data: {
    flows: []
  },

  onLoad() {
    this.setData(getHowItWorksData());
  },

  handleOfflineOrder() {
    showOfflineOrderNotice();
  }
});
