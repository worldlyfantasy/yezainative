const { getDestinationDetailData } = require("../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../repositories/transaction-repository");
const { setPendingCreatorFilter, goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { getCurrentUser } = require("../../services/user");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    destination: null,
    favoriteNoticeState: "",
    favoriteNoticeLabel: "收藏成功",
    favoriteNoticeActionLabel: "进入我的收藏",
    favoriteNoticeMode: "success",
    favoriteNoticeActionType: "favorites",
    relatedCreators: [],
    relatedIdeas: [],
    services: []
  },

  async onLoad(options) {
    const payload = await getDestinationDetailData(options.slug);
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
    this.setData(Object.assign({}, payload, {
      "destination.isFavorited": await isFavorited("destinations", payload.destination.slug)
    }));
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

  async toggleFavorite() {
    const user = await getCurrentUser();
    if (!user) {
      showFavoriteNotice(this, {
        label: "您还没有登录，请登录后再收藏",
        actionLabel: "去登录",
        mode: "warning",
        actionType: "login"
      });
      return;
    }

    const favorited = await toggleFavorite("destinations", this.data.destination.slug);
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
  },

  handleFavoriteNoticeAction() {
    const actionType = this.data.favoriteNoticeActionType;
    clearFavoriteNotice(this);
    if (actionType === "login") {
      goTopLevel(TOP_LEVEL_ROUTES.profile);
      return;
    }

    this.goFavorites();
  }
});
