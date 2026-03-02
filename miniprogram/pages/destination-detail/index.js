const { getDestinationDetailData } = require("../../services/content");
const { setPendingCreatorFilter, goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    destination: null,
    favoriteNoticeState: "",
    typeOptions: [],
    styleOptions: [],
    typeLabels: [],
    styleLabels: [],
    relatedCreators: [],
    typeIndex: 0,
    styleIndex: 0,
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
    this.applyFilters();
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  applyFilters() {
    const type = this.data.typeOptions[this.data.typeIndex] ? this.data.typeOptions[this.data.typeIndex].value : "";
    const style = this.data.styleOptions[this.data.styleIndex] ? this.data.styleOptions[this.data.styleIndex].value : "";
    const payload = getDestinationDetailData(this.data.destination.slug, {
      type,
      style
    });
    this.setData({
      destination: payload.destination,
      relatedCreators: payload.relatedCreators,
      services: payload.services
    });
  },

  onTypeChange(event) {
    this.setData(
      {
        typeIndex: Number(event.detail.value)
      },
      () => this.applyFilters()
    );
  },

  onStyleChange(event) {
    this.setData(
      {
        styleIndex: Number(event.detail.value)
      },
      () => this.applyFilters()
    );
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
      url: `/pages/creator-detail/index?slug=${event.currentTarget.dataset.slug}`
    });
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
