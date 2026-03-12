const { getOrderById, cancelOrder, payOrder } = require("../../services/orders");
const { showOfflineOrderNotice } = require("../../utils/offline");
const { isAuditMode, pickAuditText } = require("../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    order: null,
    creatorContactText: pickAuditText("联系创作者：离线原型阶段暂不接入", "行前沟通：报名确认后同步创作者或带领者信息"),
    serviceContactText: pickAuditText("联系客服：离线原型阶段暂不接入", "咨询入口：平台统一跟进，服务时间为工作日 10:00-18:00"),
    statusTitleText: pickAuditText("订单状态", "报名状态"),
    orderIdLabelText: pickAuditText("订单号", "报名编号"),
    priceTitleText: pickAuditText("价格明细", "费用说明"),
    payableLabelText: pickAuditText("已付", "参考金额"),
    pendingPrimaryText: pickAuditText("立即支付", "确认报名"),
    pendingSecondaryText: pickAuditText("取消订单", "取消报名"),
    completedPrimaryText: pickAuditText("再次购买", "再次报名")
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
