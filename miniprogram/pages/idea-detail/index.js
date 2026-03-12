const { getIdeaDetailData } = require("../../repositories/content-repository");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    idea: null,
    favoriteNoticeState: "",
    blocks: [],
    author: null
  },

  async onLoad(options) {
    const payload = await getIdeaDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到文章",
        icon: "none"
      });

      setTimeout(() => {
        wx.navigateTo({ url: "/pages/ideas/index" });
      }, 300);
      return;
    }
    this.setData(payload);
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.navigateTo({ url: "/pages/ideas/index" });
    }
  },

  goCreatorDetail() {
    if (!this.data.author) {
      return;
    }

    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${this.data.author.slug}`
    });
  },

  toggleFavorite() {
    const favorited = toggleFavorite("ideas", this.data.idea.slug);
    this.setData({
      "idea.isFavorited": favorited
    });
    if (favorited) {
      showFavoriteNotice(this);
      return;
    }

    clearFavoriteNotice(this);
  },

  goFavorites() {
    wx.navigateTo({
      url: "/pages/favorites/index"
    });
  }
});
