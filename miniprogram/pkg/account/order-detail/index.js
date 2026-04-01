const { getOrderById, cancelOrder } = require("../../../repositories/transaction-repository");
const { getServiceDetailData } = require("../../../repositories/content-repository");
const { getOrderDetailPageConfig, getServiceDetailPageConfig } = require("../../../repositories/config-repository");
const { isAuditMode } = require("../../../utils/audit");

Page({
  data: {
    auditMode: isAuditMode(),
    order: null,
    consultSheetVisible: false,
    consultSheetAnimating: false,
    consultWeChatQr: "",
    consultGroupQr: "",
    consultSheetTitle: "",
    consultCardLabel: "",
    consultCardDesc: "",
    consultFollowupNote: "",
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
    const [orderDetailPageConfig, serviceDetailPageConfig] = await Promise.all([
      getOrderDetailPageConfig(),
      getServiceDetailPageConfig()
    ]);
    this.setData(
      Object.assign({}, orderDetailPageConfig, {
        consultWeChatQr: serviceDetailPageConfig.consultWeChatQr,
        consultGroupQr: serviceDetailPageConfig.consultGroupQr,
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
    const order = await getOrderById(orderId);
    if (!order) {
      wx.showToast({
        title: "未找到订单",
        icon: "none"
      });
      return;
    }

    let serviceConsultWeChatQr = "";
    if (order.serviceSlug) {
      try {
        const serviceDetail = await getServiceDetailData(order.serviceSlug);
        serviceConsultWeChatQr =
          (serviceDetail && serviceDetail.travelDetail && serviceDetail.travelDetail.consultWeChatQr) || "";
      } catch (error) {
        console.warn("Failed to load service consult qr", error);
      }
    }

    this.setData({
      order,
      consultWeChatQr: serviceConsultWeChatQr || this.data.consultWeChatQr
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
  }
});
