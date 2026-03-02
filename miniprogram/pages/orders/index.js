const { getOrderStatusTabs, getOrders, payOrder } = require("../../services/orders");

Page({
  data: {
    tabs: [],
    currentStatus: "all",
    orders: []
  },

  onShow() {
    this.setData({
      tabs: getOrderStatusTabs()
    });
    this.refreshOrders();
  },

  refreshOrders() {
    this.setData({
      orders: getOrders(this.data.currentStatus)
    });
  },

  switchTab(event) {
    this.setData(
      {
        currentStatus: event.currentTarget.dataset.status
      },
      () => this.refreshOrders()
    );
  },

  onOrderTap(event) {
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${event.detail.id}`
    });
  },

  onOrderPay(event) {
    payOrder(event.detail.id);
    wx.navigateTo({
      url: `/pages/payment-result/index?id=${event.detail.id}`
    });
  }
});
