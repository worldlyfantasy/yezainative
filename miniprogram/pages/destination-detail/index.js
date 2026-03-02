const { getDestinationDetailData } = require("../../services/content");
const { setPendingCreatorFilter, goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    destination: null,
    favoriteNoticeState: "",
    relatedCreators: [],
    relatedIdeas: [],
    services: []
  },

  onLoad(options) {
    const payload = getDestinationDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到目的地",
        icon: "none"
      });

      setTimeout(() => {
        goTopLevel(TOP_LEVEL_ROUTES.destinations);
      }, 300);
      return;
    }
    this.setData(payload);
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.destinations);
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pages/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${event.detail.slug}`
    });
  },

  onStoryTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (slug) {
      wx.navigateTo({
        url: `/pages/idea-detail/index?slug=${slug}`
      });
    }
  },

  goCreatorList() {
    setPendingCreatorFilter({
      destination: this.data.destination.slug
    });
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  toggleFavorite() {
    const favorited = toggleFavorite("destinations", this.data.destination.slug);
    this.setData({
      "destination.isFavorited": favorited
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
