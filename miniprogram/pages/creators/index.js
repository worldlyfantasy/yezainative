const { getCreatorsPageData } = require("../../services/content");
const { consumePendingCreatorFilter } = require("../../services/navigation");

Page({
  data: {
    destinationOptions: [],
    styleOptions: [],
    destinationLabels: [],
    styleLabels: [],
    destinationIndex: 0,
    styleIndex: 0,
    creators: []
  },

  onLoad(options) {
    const payload = getCreatorsPageData();
    const destinationIndex = this.findIndexByValue(payload.destinationOptions, options.destination);
    const styleIndex = this.findIndexByValue(payload.styleOptions, options.style);
    this.setData(
      Object.assign({}, payload, {
        destinationIndex,
        styleIndex
      })
    );
    this.applyFilters();
  },

  onShow() {
    const pending = consumePendingCreatorFilter();
    if (!pending.destination && !pending.style) {
      return;
    }

    this.setData(
      {
        destinationIndex: this.findIndexByValue(this.data.destinationOptions, pending.destination),
        styleIndex: this.findIndexByValue(this.data.styleOptions, pending.style)
      },
      () => this.applyFilters()
    );
  },

  findIndexByValue(list, value) {
    if (!value) {
      return 0;
    }

    const index = list.findIndex((item) => item.value === value);
    return index === -1 ? 0 : index;
  },

  applyFilters() {
    const destination = this.data.destinationOptions[this.data.destinationIndex] ? this.data.destinationOptions[this.data.destinationIndex].value : "";
    const style = this.data.styleOptions[this.data.styleIndex] ? this.data.styleOptions[this.data.styleIndex].value : "";
    const payload = getCreatorsPageData({
      destination,
      style
    });
    this.setData({
      creators: payload.creators
    });
  },

  onDestinationChange(event) {
    this.setData(
      {
        destinationIndex: Number(event.detail.value)
      },
      () => this.applyFilters()
    );
  },

  onStyleChange(event) {
    this.setData(
      {
        styleIndex: Number(event.detail.value)
      },
      () => this.applyFilters()
    );
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${event.detail.slug}`
    });
  }
});
