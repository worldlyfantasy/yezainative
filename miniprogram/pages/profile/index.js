const { getMyPageData, simulateWechatLogin, logout } = require("../../services/user");
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

  refresh() {
    this.setData(getMyPageData());
  },

  handleLogin() {
    simulateWechatLogin();
    this.refresh();
    wx.showToast({
      title: pickAuditText("已完成模拟登录", "登录成功"),
      icon: "none"
    });
  },

  handleLogout() {
    logout();
    this.refresh();
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
