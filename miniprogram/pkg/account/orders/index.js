const { getOrderStatusTabs, getOrders } = require("../../../repositories/transaction-repository");

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
      url: `/pkg/account/order-detail/index?id=${event.detail.id}`
    });
  }
});
