const { getOrderById, cancelOrder, payOrder } = require("../../repositories/transaction-repository");
const { getOrderDetailPageConfig } = require("../../repositories/config-repository");
const { showOfflineOrderNotice } = require("../../utils/offline");
const { isAuditMode } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    order: null,
    creatorContactText: "",
    serviceContactText: "",
    statusTitleText: "",
    orderIdLabelText: "",
    priceTitleText: "",
    payableLabelText: "",
    pendingPrimaryText: "",
    pendingSecondaryText: "",
    completedPrimaryText: ""
  },

  async onLoad(options) {
    this.setData(await getOrderDetailPageConfig());
    await this.loadOrder(options.id);
  },

  async onShow() {
    if (this.data.order) {
      await this.loadOrder(this.data.order.id);
    }
  },

  async loadOrder(orderId) {
    const order = await getOrderById(orderId);
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

  async handlePrimary() {
    const { order } = this.data;
    if (!order) {
      return;
    }

    if (order.status === "pending") {
      await payOrder(order.id);
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

  async handleSecondary() {
    const { order } = this.data;
    if (!order) {
      return;
    }

    if (order.status === "pending") {
      await cancelOrder(order.id);
      await this.loadOrder(order.id);
      return;
    }

    showOfflineOrderNotice();
  }
});
