const { getOrderById } = require("../../../repositories/transaction-repository");
const { getOrderDetailPageConfig, getServiceDetailPageConfig } = require("../../../repositories/config-repository");
const { buildOrderCard } = require("../../../constants/transaction-meta");
const { isAuditMode } = require("../../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    order: null,
    consultSheetVisible: false,
    consultSheetAnimating: false,
    consultWeChatQr: "",
    consultSheetTitle: "",
    consultCardLabel: "",
    consultCardDesc: "",
    consultFollowupNote: "",
    statusTitleText: "",
    orderIdLabelText: "",
    priceTitleText: "",
    payableLabelText: "",
    pendingPrimaryText: "",
    completedPrimaryText: ""
  },

  async onLoad(options) {
    const [orderDetailPageConfig, serviceDetailPageConfig] = await Promise.all([
      getOrderDetailPageConfig(),
      getServiceDetailPageConfig()
    ]);
    this.setData(
      Object.assign({}, orderDetailPageConfig, {
        consultWeChatQr: serviceDetailPageConfig.consultWeChatQr,
        consultSheetTitle: serviceDetailPageConfig.consultSheetTitle,
        consultCardLabel: serviceDetailPageConfig.consultCardLabel,
        consultCardDesc: serviceDetailPageConfig.consultCardDesc,
        consultFollowupNote: serviceDetailPageConfig.consultFollowupNote
      })
    );
    await this.loadOrder(options.id);
  },

  async onShow() {
    if (this.data.order) {
      await this.loadOrder(this.data.order.id);
    }
  },

  async loadOrder(orderId) {
    const rawOrder = await getOrderById(orderId);
    if (!rawOrder) {
      wx.showToast({
        title: "未找到订单",
        icon: "none"
      });
      return;
    }

    const order = buildOrderCard(rawOrder);
    this.setData({
      order
    });
  },

  async handlePrimary() {
    const { order } = this.data;
    if (!order) {
      return;
    }

    if (order.status === "completed") {
      wx.navigateTo({
        url: `/pkg/explore/checkout/index?slug=${order.serviceSlug}`
      });
    }
  },

  openConsultSheet() {
    if (this.data.consultSheetVisible) return;
    this.setData(
      {
        consultSheetVisible: true,
        consultSheetAnimating: false
      },
      () => {
        setTimeout(() => {
          this.setData({
            consultSheetAnimating: true
          });
        }, 20);
      }
    );
  },

  closeConsultSheet() {
    if (!this.data.consultSheetVisible) return;
    this.setData({
      consultSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        consultSheetVisible: false
      });
    }, 260);
  },

  onConsultQrTap() {
    const qrUrl = String(this.data.consultWeChatQr || "").trim();
    if (!qrUrl) {
      wx.showToast({
        title: "客服二维码暂不可用",
        icon: "none"
      });
      return;
    }

    wx.previewImage({
      current: qrUrl,
      urls: [qrUrl],
      showmenu: true,
      fail: () => {
        wx.showToast({
          title: "二维码打开失败",
          icon: "none"
        });
      }
    });
  }
});
