const { getFavoritesPageData } = require("../../repositories/content-repository");
const { getStoredUser } = require("../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { isAuditMode, pickAuditText } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    loginHint: pickAuditText(
      "当前原型使用本地模拟登录，先到“我的”完成登录，再回来管理收藏。",
      "登录后可查看和管理你收藏的目的地、人物、行程与故事。"
    ),
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

  async refresh() {
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
