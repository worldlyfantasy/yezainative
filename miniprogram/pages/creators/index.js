const { getCreatorsPageData } = require("../../repositories/content-repository");
const { consumePendingCreatorFilter } = require("../../services/navigation");

Page({
  data: {
    loading: true,
    errorText: "",
    destinationOptions: [],
    styleOptions: [],
    destinationLabels: [],
    styleLabels: [],
    destinationIndex: 0,
    styleIndex: 0,
    creators: []
  },

  async onLoad(options) {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const payload = await getCreatorsPageData();
      const destinationIndex = this.findIndexByValue(payload.destinationOptions, options.destination);
      const styleIndex = this.findIndexByValue(payload.styleOptions, options.style);
      const hasPresetFilters = Boolean(options.destination || options.style);

      this.setData(
        Object.assign({}, payload, {
          loading: false,
          errorText: "",
          destinationIndex,
          styleIndex,
          creators: hasPresetFilters ? [] : payload.creators
        }),
        () => {
          if (hasPresetFilters) {
            this.applyFilters();
          }
        }
      );
    } catch (error) {
      console.error("Failed to load creators page", error);
      this.setData({
        loading: false,
        errorText: "创作者列表加载失败，请稍后重试。"
      });
    }
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

  async applyFilters() {
    this.setData({
      loading: true,
      errorText: ""
    });

    const destination = this.data.destinationOptions[this.data.destinationIndex] ? this.data.destinationOptions[this.data.destinationIndex].value : "";
    const style = this.data.styleOptions[this.data.styleIndex] ? this.data.styleOptions[this.data.styleIndex].value : "";
    try {
      const payload = await getCreatorsPageData({
        destination,
        style
      });
      this.setData({
        loading: false,
        errorText: "",
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
      url: `/pkg/explore/creator-detail/index?slug=${event.detail.slug}`
    });
  }
});
