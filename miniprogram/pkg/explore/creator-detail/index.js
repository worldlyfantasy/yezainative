const { getCreatorDetailData } = require("../../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { getCurrentUser } = require("../../../services/user");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");

Page({
  data: {
    loading: true,
    creator: null,
    favoriteNoticeState: "",
    favoriteNoticeLabel: "收藏成功",
    favoriteNoticeActionLabel: "进入我的收藏",
    favoriteNoticeMode: "success",
    favoriteNoticeActionType: "favorites",
    creatorDestinations: [],
    relatedServices: [],
    displayIdeas: [],
    hasMoreIdeas: false
  },

  async onLoad(options) {
    try {
      const payload = await getCreatorDetailData(options.slug);
      if (!payload) {
        this.setData({ loading: false });
        wx.showToast({
          title: "未找到创作者",
          icon: "none"
        });

        setTimeout(() => {
          goTopLevel(TOP_LEVEL_ROUTES.creators);
        }, 300);
        return;
      }

      const creatorIdeas = payload.creatorIdeas || [];
      const favorited = await isFavorited("creators", payload.creator.slug);
      this.setData({
        ...payload,
        loading: false,
        "creator.isFavorited": favorited,
        displayIdeas: creatorIdeas.slice(0, 2),
        hasMoreIdeas: creatorIdeas.length > 2
      });
    } catch (error) {
      console.error("Failed to load creator detail", error);
      this.setData({ loading: false });
      wx.showToast({
        title: "加载失败",
        icon: "none"
      });
    }
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onDestinationTap(event) {
    const slug = event.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${slug}`
    });
  },

  onStoryTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pkg/content/idea-detail/index?slug=${slug}`
    });
  },

  goCreatorStories() {
    const slug = this.data.creator && this.data.creator.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pkg/content/ideas/index?creatorSlug=${slug}`
    });
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

    const favorited = await toggleFavorite("creators", this.data.creator.slug);
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
