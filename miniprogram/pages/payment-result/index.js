const { getPaymentResultPageConfig } = require("../../repositories/config-repository");
const { isAuditMode } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    orderId: "",
    titleText: "",
    subtitleText: "",
    detailButtonText: "",
    listButtonText: ""
  },

  async onLoad(options) {
    const pageConfig = await getPaymentResultPageConfig();
    this.setData(
      Object.assign({}, pageConfig, {
        orderId: options.id || ""
      })
    );
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
