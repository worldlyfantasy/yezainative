const { getServiceDetailData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    service: null,
    favoriteNoticeState: "",
    creator: null,
    relatedDestinations: [],
    heroCover: "",
    photoGallery: []
  },

  onLoad(options) {
    const payload = getServiceDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到服务",
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
    const destinationSlug = this.data.service.destinationSlugs[0];
    wx.redirectTo({
      url: `/pages/destination-detail/index?slug=${destinationSlug}`
    });
  },

  handleCheckout() {
    wx.navigateTo({
      url: `/pages/checkout/index?slug=${this.data.service.slug}`
    });
  },

  goCreatorDetail() {
    if (!this.data.creator) {
      return;
    }

    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${this.data.creator.slug}`
    });
  },

  onDestinationTap(event) {
    const slug = event.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pages/destination-detail/index?slug=${slug}`
    });
  },

  toggleFavorite() {
    const favorited = toggleFavorite("services", this.data.service.slug);
    this.setData({
      "service.isFavorited": favorited
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
