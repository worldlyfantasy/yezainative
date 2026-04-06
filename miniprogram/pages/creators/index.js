const { getCreatorsPageData } = require("../../repositories/content-repository");
const {
  enablePageShareMenus,
  createAddToFavorites,
  createShareAppMessage,
  createShareTimeline
} = require("../../utils/share");

Page({
  data: {
    loading: true,
    errorText: "",
    regionOptions: [{ label: "全部", value: "" }],
    regionLabels: ["全部"],
    regionIndex: 0,
    styleOptions: [{ label: "全部", value: "" }],
    styleLabels: ["全部"],
    styleIndex: 0,
    creators: []
  },

  async onLoad(options) {
    enablePageShareMenus();

    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const initialFilters = {
        style: options.style || "",
        regionCode: options.regionCode || options.region || ""
      };
      const payload = await getCreatorsPageData(initialFilters);
      const regionIndex = this.findIndexByValue(payload.regionOptions, initialFilters.regionCode);
      const styleIndex = this.findIndexByValue(payload.styleOptions, initialFilters.style);

      this.setData(
        Object.assign({}, payload, {
          loading: false,
          errorText: "",
          regionIndex,
          styleIndex
        })
      );
    } catch (error) {
      console.error("Failed to load creators page", error);
      this.setData({
        loading: false,
        errorText: "创作者列表加载失败，请稍后重试。"
      });
    }
  },

  findIndexByValue(list, value) {
    if (!value) {
      return 0;
    }

    const index = list.findIndex((item) => item.value === value);
    return index === -1 ? 0 : index;
  },

  async applyFilters() {
    this.setData({
      loading: true,
      errorText: ""
    });

    const regionCode = this.data.regionOptions[this.data.regionIndex] ? this.data.regionOptions[this.data.regionIndex].value : "";
    const style = this.data.styleOptions[this.data.styleIndex] ? this.data.styleOptions[this.data.styleIndex].value : "";
    try {
      const payload = await getCreatorsPageData({
        regionCode,
        style
      });
      this.setData({
        loading: false,
        errorText: "",
        regionOptions: payload.regionOptions,
        regionLabels: payload.regionLabels,
        regionIndex: this.findIndexByValue(payload.regionOptions, regionCode),
        styleOptions: payload.styleOptions,
        styleLabels: payload.styleLabels,
        styleIndex: this.findIndexByValue(payload.styleOptions, style),
        creators: payload.creators
      });
    } catch (error) {
      console.error("Failed to filter creators", error);
      this.setData({
        loading: false,
        errorText: "筛选结果加载失败，请稍后重试。"
      });
    }
  },

  getShareImageUrl() {
    const creators = this.data.creators || [];
    return (creators[0] && creators[0].avatar) || "";
  },

  onShareAppMessage() {
    return createShareAppMessage({
      title: "野哉创作者｜人物",
      pagePath: "/pages/creators/index",
      imageUrl: this.getShareImageUrl()
    });
  },

  onShareTimeline() {
    return createShareTimeline({
      title: "野哉创作者｜人物",
      imageUrl: this.getShareImageUrl()
    });
  },

  onAddToFavorites() {
    return createAddToFavorites({
      title: "野哉创作者｜人物",
      imageUrl: this.getShareImageUrl()
    });
  },

  onStyleChange(event) {
    this.setData(
      {
        styleIndex: Number(event.detail.value)
      },
      () => this.applyFilters()
    );
  },

  onRegionChange(event) {
    this.setData(
      {
        regionIndex: Number(event.detail.value)
      },
      () => this.applyFilters()
    );
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${event.detail.slug}`
    });
  }
});
