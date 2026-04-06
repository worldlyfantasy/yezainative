const { getDestinationDetailData } = require("../../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { setPendingCreatorFilter, goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { openIdea } = require("../../../services/idea-navigation");
const { getCurrentUser } = require("../../../services/user");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");

Page({
  data: {
    loading: true,
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
    this.isPageActive = true;
    try {
      const payload = await getDestinationDetailData(options.slug);
      if (!payload) {
        this.setData({ loading: false });
        wx.showToast({
          title: "未找到目的地",
          icon: "none"
        });

        setTimeout(() => {
          goTopLevel(TOP_LEVEL_ROUTES.destinations);
        }, 300);
        return;
      }

      this.setData(
        Object.assign({}, payload, {
          loading: false
        })
      );
      this.loadFavoriteState(payload.destination && payload.destination.slug);
    } catch (error) {
      console.error("Failed to load destination detail", error);
      this.setData({ loading: false });
      wx.showToast({
        title: "加载失败",
        icon: "none"
      });
    }
  },

  onUnload() {
    this.isPageActive = false;
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  async loadFavoriteState(slug) {
    if (!slug) {
      return;
    }

    try {
      const favorited = await isFavorited("destinations", slug);
      if (!this.isPageActive || !this.data.destination || this.data.destination.slug !== slug) {
        return;
      }

      this.setData({
        "destination.isFavorited": favorited
      });
    } catch (error) {
      console.error("Failed to resolve destination favorite status", error);
    }
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.destinations);
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${event.detail.slug}`
    });
  },

  onStoryTap(event) {
    openIdea(event.currentTarget.dataset);
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
      url: "/pkg/account/favorites/index"
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
