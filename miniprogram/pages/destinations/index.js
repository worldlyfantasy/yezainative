const { getDestinationsPageData } = require("../../repositories/content-repository");

Page({
  data: {
    loading: true,
    errorText: "",
    regionOptions: [],
    regionLabels: [],
    regionIndex: 0,
    styleOptions: [],
    styleLabels: [],
    styleIndex: 0,
    destinations: []
  },

  async onLoad() {
    await this.applyFilters();
  },

  findIndexByValue(list, value) {
    if (!value) {
      return 0;
    }

    const index = (list || []).findIndex((item) => item.value === value);
    return index === -1 ? 0 : index;
  },

  onRegionChange(event) {
    this.setData(
      {
        regionIndex: Number(event.detail.value)
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

  async applyFilters() {
    this.setData({
      loading: true,
      errorText: ""
    });

    const regionCode = this.data.regionOptions[this.data.regionIndex]
      ? this.data.regionOptions[this.data.regionIndex].value
      : "";
    const tag = this.data.styleOptions[this.data.styleIndex]
      ? this.data.styleOptions[this.data.styleIndex].value
      : "";

    try {
      const payload = await getDestinationsPageData("", { regionCode, tag });
      this.setData(
        Object.assign(
          {
            loading: false,
            errorText: "",
            regionIndex: this.findIndexByValue(payload.regionOptions, regionCode),
            styleIndex: this.findIndexByValue(payload.styleOptions, tag)
          },
          payload
        )
      );
    } catch (error) {
      console.error("Failed to load destinations", error);
      this.setData({
        loading: false,
        errorText: "目的地列表加载失败，请稍后重试。"
      });
    }
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${event.detail.slug}`
    });
  }
});
