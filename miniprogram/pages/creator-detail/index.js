const { getCreatorDetailData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    creator: null,
    favoriteNoticeState: "",
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

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
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
  },

  toggleFavorite() {
    const favorited = toggleFavorite("creators", this.data.creator.slug);
    this.setData({
      "creator.isFavorited": favorited
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
