const { getFavoritesPageData } = require("../../../repositories/transaction-repository");
const { getFavoritesPageConfig } = require("../../../repositories/config-repository");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { isAuditMode } = require("../../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    loading: true,
    errorText: "",
    loginHint: "",
    loggedIn: false,
    favoriteDestinations: [],
    favoriteCreators: [],
    favoriteServices: [],
    favoriteIdeas: [],
    hasFavorites: false
  },

  async onLoad() {
    try {
      this.setData(await getFavoritesPageConfig());
    } catch (error) {
      console.error("Failed to load favorites page config", error);
    }
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const loggedIn = Boolean(await getCurrentUser());

      if (!loggedIn) {
        this.setData({
          loading: false,
          errorText: "",
          loggedIn: false,
          favoriteDestinations: [],
          favoriteCreators: [],
          favoriteServices: [],
          favoriteIdeas: [],
          hasFavorites: false
        });
        return;
      }

      const payload = await getFavoritesPageData();
      const hasFavorites = Boolean(
        payload.favoriteDestinations.length ||
          payload.favoriteCreators.length ||
          payload.favoriteServices.length ||
          payload.favoriteIdeas.length
      );

      this.setData(
        Object.assign({}, payload, {
          loading: false,
          errorText: "",
          loggedIn: true,
          hasFavorites
        })
      );
    } catch (error) {
      console.error("Failed to refresh favorites", error);
      this.setData({
        loading: false,
        errorText: "收藏内容加载失败，请稍后重试。"
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        goTopLevel(TOP_LEVEL_ROUTES.profile);
      }
    });
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${event.detail.slug}`
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${event.detail.slug}`
    });
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onIdeaTap(event) {
    wx.navigateTo({
      url: `/pkg/content/idea-detail/index?slug=${event.currentTarget.dataset.slug}`
    });
  }
});
