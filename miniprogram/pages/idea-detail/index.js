const { getIdeaDetailData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { showOfflineOrderNotice } = require("../../utils/offline");

Page({
  data: {
    idea: null,
    blocks: [],
    author: null
  },

  onLoad(options) {
    const payload = getIdeaDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到文章",
        icon: "none"
      });

      setTimeout(() => {
        goTopLevel(TOP_LEVEL_ROUTES.ideas);
      }, 300);
      return;
    }
    this.setData(payload);
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.ideas);
  },

  goCreatorDetail() {
    if (!this.data.author) {
      return;
    }

    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${this.data.author.slug}`
    });
  },

  handleOfflineOrder() {
    showOfflineOrderNotice();
  },

  toggleFavorite() {
    const favorited = toggleFavorite("ideas", this.data.idea.slug);
    this.setData({
      "idea.isFavorited": favorited
    });
  }
});
