const { getFavoritesPageData } = require("../../services/content");
const { getStoredUser } = require("../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");

Page({
  data: {
    loggedIn: false,
    favoriteDestinations: [],
    favoriteCreators: [],
    favoriteServices: [],
    favoriteIdeas: [],
    hasFavorites: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const loggedIn = Boolean(getStoredUser());

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

    const payload = getFavoritesPageData();
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
      url: `/pages/destination-detail/index?slug=${event.detail.slug}`
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${event.detail.slug}`
    });
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pages/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onIdeaTap(event) {
    wx.navigateTo({
      url: `/pages/idea-detail/index?slug=${event.currentTarget.dataset.slug}`
    });
  }
});
