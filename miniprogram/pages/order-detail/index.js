const { getOrderById, cancelOrder, payOrder } = require("../../services/orders");
const { showOfflineOrderNotice } = require("../../utils/offline");

Page({
  data: {
    order: null
  },

  onLoad(options) {
    this.loadOrder(options.id);
  },

  onShow() {
    if (this.data.order) {
      this.loadOrder(this.data.order.id);
    }
  },

  loadOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
      wx.showToast({
        title: "未找到订单",
        icon: "none"
      });
      return;
    }

    this.setData({
      order
    });
  },

  handlePrimary() {
    const { order } = this.data;
    if (!order) {
      return;
    }

    if (order.status === "pending") {
      payOrder(order.id);
      wx.navigateTo({
        url: `/pages/payment-result/index?id=${order.id}`
      });
      return;
    }

    if (order.status === "paid") {
      showOfflineOrderNotice();
      return;
    }

    if (order.status === "completed") {
      wx.navigateTo({
        url: `/pages/checkout/index?slug=${order.serviceSlug}`
      });
    }
  },

  handleSecondary() {
    const { order } = this.data;
    if (!order) {
      return;
    }

    if (order.status === "pending") {
      cancelOrder(order.id);
      this.loadOrder(order.id);
      return;
    }

    showOfflineOrderNotice();
  }
});
