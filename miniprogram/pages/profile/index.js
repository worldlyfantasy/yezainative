const { getMyPageData, simulateWechatLogin, logout } = require("../../services/user");
const { showOfflineOrderNotice } = require("../../utils/offline");

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
      title: "已完成模拟登录",
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

  onOrderTap(event) {
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${event.currentTarget.dataset.id}`
    });
  }
});
