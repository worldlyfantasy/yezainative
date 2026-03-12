const { isAuditMode, pickAuditText } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    orderId: "",
    titleText: pickAuditText("模拟支付成功", "报名提交成功"),
    subtitleText: pickAuditText(
      "当前仍是离线原型。这里模拟了支付成功状态，用于打通下单到订单详情的原型链路。",
      "我们已收到你的报名信息，接下来会继续确认名额、时间与出行安排。"
    ),
    detailButtonText: pickAuditText("查看订单详情", "查看报名详情"),
    listButtonText: pickAuditText("返回订单列表", "返回报名列表")
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
