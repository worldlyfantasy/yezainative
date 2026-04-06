const { getCreatorDetailData } = require("../../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { goTopLevel, setPendingJourneyFilter, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { openIdea } = require("../../../services/idea-navigation");
const { getCurrentUser } = require("../../../services/user");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");
const { enablePageShareMenus, createShareAppMessage, createShareTimeline } = require("../../../utils/share");

Page({
  data: {
    loading: true,
    creator: null,
    favoriteNoticeState: "",
    favoriteNoticeLabel: "收藏成功",
    favoriteNoticeActionLabel: "进入我的收藏",
    favoriteNoticeMode: "success",
    favoriteNoticeActionType: "favorites",
    creatorRouteTypes: [],
    relatedServices: [],
    displayIdeas: [],
    hasMoreIdeas: false
  },

  async onLoad(options) {
    this.isPageActive = true;
    enablePageShareMenus();

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
      const creatorRouteTypes = this.buildCreatorRouteTypes(payload.relatedServices);
      this.setData({
        ...payload,
        loading: false,
        creatorRouteTypes,
        displayIdeas: creatorIdeas.slice(0, 2),
        hasMoreIdeas: creatorIdeas.length > 2
      });
      this.loadFavoriteState(payload.creator && payload.creator.slug);
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
    this.isPageActive = false;
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  async loadFavoriteState(slug) {
    if (!slug) {
      return;
    }

    try {
      const favorited = await isFavorited("creators", slug);
      if (!this.isPageActive || !this.data.creator || this.data.creator.slug !== slug) {
        return;
      }

      this.setData({
        "creator.isFavorited": favorited
      });
    } catch (error) {
      console.error("Failed to resolve creator favorite status", error);
    }
  },

  onShareAppMessage() {
    const creator = this.data.creator || {};
    return createShareAppMessage({
      title: creator.name ? `${creator.name}｜野哉创作者` : "野哉创作者",
      pagePath: "/pkg/explore/creator-detail/index",
      query: {
        slug: creator.slug
      },
      imageUrl: creator.avatarDetail || creator.avatar
    });
  },

  onShareTimeline() {
    const creator = this.data.creator || {};
    return createShareTimeline({
      title: creator.name ? `${creator.name}｜野哉创作者` : "野哉创作者",
      query: {
        slug: creator.slug
      },
      imageUrl: creator.avatarDetail || creator.avatar
    });
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${event.detail.slug}`
    });
  },

  buildCreatorRouteTypes(services) {
    const tagSet = new Set();
    (services || []).forEach((service) => {
      (service && Array.isArray(service.tags) ? service.tags : []).forEach((item) => {
        const value = String(item || "").trim();
        if (value) {
          tagSet.add(value);
        }
      });
    });
    return Array.from(tagSet).slice(0, 6);
  },

  onRouteTypeTap(event) {
    const routeType = String(event.currentTarget.dataset.value || "").trim();
    if (!routeType) {
      return;
    }

    setPendingJourneyFilter({
      routeType
    });
    goTopLevel(TOP_LEVEL_ROUTES.journeys);
  },

  onStoryTap(event) {
    openIdea(event.currentTarget.dataset);
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
