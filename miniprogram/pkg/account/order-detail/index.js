const { cancelOrder, getOrderById } = require("../../../repositories/transaction-repository");
const { getServiceDetailSummaryData } = require("../../../repositories/content-repository");
const { payOrderWithWechat } = require("../../../repositories/payment-repository");
const { getOrderDetailPageConfig, getServiceDetailPageConfig } = require("../../../repositories/config-repository");
const { buildOrderCard } = require("../../../constants/transaction-meta");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
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
    completedPrimaryText: "",
    payCountdownText: "30分钟",
    paying: false,
    canceling: false,
    openingService: false
  },

  countdownTimer: null,

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

  onUnload() {
    this.stopPayCountdown();
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
    this.refreshPayCountdown();
  },

  stopPayCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  },

  refreshPayCountdown() {
    this.stopPayCountdown();
    const order = this.data.order;
    if (!order || order.status !== "pending") {
      this.setData({ payCountdownText: "30分钟" });
      return;
    }

    const explicitExpireAtTs = Number(order.payExpireAtTs || 0);
    const createdAtTs = Number(order.createdAtTs || 0);
    const expireAtTs = explicitExpireAtTs > 0
      ? explicitExpireAtTs
      : (createdAtTs > 0 ? createdAtTs + 30 * 60 * 1000 : Date.now() + 30 * 60 * 1000);
    const updateText = () => {
      const remainingMs = Math.max(0, expireAtTs - Date.now());
      const totalMinutes = Math.ceil(remainingMs / 60000);
      this.setData({
        payCountdownText: `${totalMinutes}分钟`
      });
      if (remainingMs <= 0) {
        this.stopPayCountdown();
      }
    };

    updateText();
    this.countdownTimer = setInterval(updateText, 30000);
  },

  isPaymentCancel(error) {
    const message = String(error && (error.errMsg || error.message) ? (error.errMsg || error.message) : "");
    return message.indexOf("cancel") >= 0 || message.indexOf("取消") >= 0;
  },

  async continuePay() {
    const { order } = this.data;
    if (!order || this.data.paying) {
      return;
    }

    this.setData({ paying: true });
    try {
      const latestOrder = await getOrderById(order.id);
      const effectiveOrder = latestOrder ? buildOrderCard(latestOrder) : order;
      this.setData({ order: effectiveOrder });
      if (effectiveOrder.status !== "pending") {
        wx.showToast({
          title: "当前订单不可支付",
          icon: "none"
        });
        return;
      }
      const result = await payOrderWithWechat(effectiveOrder.id);
      if (result.confirmation && result.confirmation.paid === false) {
        wx.showToast({
          title: "支付确认中，请稍后查看",
          icon: "none"
        });
      } else {
        wx.showToast({
          title: "支付成功",
          icon: "success"
        });
      }
      wx.redirectTo({
        url: "/pkg/account/orders/index?status=not_departed"
      });
    } catch (error) {
      if (!this.isPaymentCancel(error)) {
        wx.showToast({
          title: error && error.message ? error.message : "支付失败",
          icon: "none"
        });
      }
    } finally {
      this.setData({ paying: false });
    }
  },

  async cancelPendingOrder() {
    const { order } = this.data;
    if (!order || this.data.canceling) {
      return;
    }

    wx.showModal({
      title: "取消订单",
      content: "取消后将释放当前名额，确认取消吗？",
      confirmText: "取消订单",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({ canceling: true });
        try {
          await cancelOrder(order.id);
          wx.showToast({
            title: "取消成功",
            icon: "success"
          });
          setTimeout(() => {
            goTopLevel(TOP_LEVEL_ROUTES.journeys);
          }, 600);
        } catch (error) {
          wx.showToast({
            title: error && error.message ? error.message : "取消失败",
            icon: "none"
          });
        } finally {
          this.setData({ canceling: false });
        }
      }
    });
  },

  async openServiceDetail() {
    const { order } = this.data;
    const serviceSlug = String(order && order.serviceSlug ? order.serviceSlug : "").trim();
    if (this.data.openingService) {
      return;
    }
    if (!serviceSlug) {
      wx.showToast({
        title: "该旅程已下架",
        icon: "none"
      });
      return;
    }

    this.setData({ openingService: true });
    try {
      const payload = await getServiceDetailSummaryData(serviceSlug);
      if (!payload || !payload.service) {
        wx.showToast({
          title: "该旅程已下架",
          icon: "none"
        });
        return;
      }

      wx.navigateTo({
        url: `/pkg/explore/service-detail/index?slug=${serviceSlug}`
      });
    } catch (error) {
      wx.showToast({
        title: "该旅程已下架",
        icon: "none"
      });
    } finally {
      this.setData({ openingService: false });
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
