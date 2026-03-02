Page({
  data: {
    orderId: ""
  },

  onLoad(options) {
    this.setData({
      orderId: options.id || ""
    });
  },

  goOrderDetail() {
    wx.redirectTo({
      url: `/pages/order-detail/index?id=${this.data.orderId}`
    });
  },

  goOrders() {
    wx.redirectTo({
      url: "/pages/orders/index"
    });
  }
});
