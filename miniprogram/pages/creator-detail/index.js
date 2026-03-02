const { getCreatorDetailData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { showOfflineOrderNotice } = require("../../utils/offline");

Page({
  data: {
    creator: null,
    creatorDestinations: [],
    relatedServices: [],
    groupServices: []
  },

  onLoad(options) {
    const payload = getCreatorDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到创作者",
        icon: "none"
      });

      setTimeout(() => {
        goTopLevel(TOP_LEVEL_ROUTES.creators);
      }, 300);
      return;
    }
    this.setData(payload);
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  handleOfflineOrder() {
    showOfflineOrderNotice();
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pages/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onDestinationTap(event) {
    const slug = event.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pages/destination-detail/index?slug=${slug}`
    });
  }
});
