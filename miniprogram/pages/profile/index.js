const { getMyPageData, login, logout } = require("../../services/user");
const { showOfflineOrderNotice } = require("../../utils/offline");
const { pickAuditText } = require("../../utils/audit");

Page({
  data: {
    loggedIn: false,
    user: null,
    shortcuts: [],
    activeTrips: [],
    recentOrders: []
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData(await getMyPageData());
  },

  async handleLogin() {
    await login();
    await this.refresh();
    wx.showToast({
      title: pickAuditText("登录成功", "登录成功"),
      icon: "none"
    });
  },

  async handleLogout() {
    await logout();
    await this.refresh();
  },

  onShortcutTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "orders") {
      wx.navigateTo({
        url: "/pages/orders/index"
      });
      return;
    }

    if (key === "favorites") {
      wx.navigateTo({
        url: "/pages/favorites/index"
      });
      return;
    }

    showOfflineOrderNotice();
  },

  onActiveTripTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/service-detail/index?slug=${slug}`
    });
  },

  onActiveTripCreatorTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${slug}`
    });
  },

  onOrderTap(event) {
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${event.currentTarget.dataset.id}`
    });
  }
});
