const { getServiceDetailData } = require("../../services/content");
const { createOrder } = require("../../services/orders");

function getBasePrice(service, unitPriceFromQuery) {
  if (unitPriceFromQuery != null && !isNaN(Number(unitPriceFromQuery))) {
    return Number(unitPriceFromQuery);
  }
  const matched = String(service.price || "").match(/\d+/);
  return matched ? Number(matched[0]) : 0;
}

Page({
  data: {
    service: null,
    travelDate: "2026-03-20",
    peopleCount: 1,
    travelerName: "",
    travelerIdCard: "",
    travelerPhone: "",
    note: "",
    payableText: "¥0"
  },

  onLoad(options) {
    const payload = getServiceDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到服务",
        icon: "none"
      });
      return;
    }

    const travelDate = options.travelDate || "2026-03-20";
    const peopleCount = Math.max(1, parseInt(options.peopleCount, 10) || 1);
    const unitPrice = options.unitPrice;

    this.setData(
      {
        service: payload.service,
        travelDate,
        peopleCount,
        _unitPrice: unitPrice
      },
      () => this.updatePayable()
    );
  },

  updatePayable() {
    const base = this.data.service
      ? getBasePrice(this.data.service, this.data._unitPrice)
      : 0;
    const payable = base * this.data.peopleCount;
    this.setData({
      payableText: `¥${payable}`
    });
  },

  onDateChange(event) {
    this.setData({
      travelDate: event.detail.value
    });
  },

  increasePeople() {
    this.setData(
      {
        peopleCount: this.data.peopleCount + 1
      },
      () => this.updatePayable()
    );
  },

  decreasePeople() {
    if (this.data.peopleCount <= 1) {
      return;
    }
    this.setData(
      {
        peopleCount: this.data.peopleCount - 1
      },
      () => this.updatePayable()
    );
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value
    });
  },

  submitOrder() {
    if (!this.data.travelerName || !this.data.travelerPhone) {
      wx.showToast({
        title: "请填写出行人姓名和手机号",
        icon: "none"
      });
      return;
    }

    const payable = Number(this.data.payableText.replace("¥", ""));
    const order = createOrder({
      serviceSlug: this.data.service.slug,
      travelDate: this.data.travelDate,
      peopleCount: this.data.peopleCount,
      amount: payable,
      traveler: {
        name: this.data.travelerName,
        idCard: this.data.travelerIdCard || "未填写",
        phone: this.data.travelerPhone
      },
      note: this.data.note
    });

    wx.navigateTo({
      url: `/pages/order-detail/index?id=${order.id}`
    });
  }
});
