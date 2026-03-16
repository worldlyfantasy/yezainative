const { getFavoritesPageData } = require("../../../repositories/transaction-repository");
const { getFavoritesPageConfig } = require("../../../repositories/config-repository");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { isAuditMode } = require("../../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    loginHint: "",
    loggedIn: false,
    favoriteDestinations: [],
    favoriteCreators: [],
    favoriteServices: [],
    favoriteIdeas: [],
    hasFavorites: false
  },

  async onLoad() {
    this.setData(await getFavoritesPageConfig());
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const loggedIn = Boolean(await getCurrentUser());

    if (!loggedIn) {
      this.setData({
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
        loggedIn: true,
        hasFavorites
      })
    );
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
