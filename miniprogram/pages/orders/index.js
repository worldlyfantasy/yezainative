const { getOrderStatusTabs, getOrders, payOrder } = require("../../repositories/transaction-repository");

Page({
  data: {
    tabs: [],
    currentStatus: "pending",
    orders: []
  },

  async onShow() {
    this.setData({
      tabs: getOrderStatusTabs()
    });
    await this.refreshOrders();
  },

  async refreshOrders() {
    this.setData({
      orders: await getOrders(this.data.currentStatus)
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

  async onOrderPay(event) {
    await payOrder(event.detail.id);
    wx.navigateTo({
      url: `/pages/payment-result/index?id=${event.detail.id}`
    });
  }
});
