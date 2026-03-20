const { getDestinationsPageData } = require("../../repositories/content-repository");

Page({
  data: {
    loading: true,
    errorText: "",
    searchValue: "",
    destinations: []
  },

  async onLoad() {
    await this.applySearch("");
  },

  onSearchInput(event) {
    this.applySearch(event.detail.value);
  },

  onSearch() {
    this.applySearch(this.data.searchValue);
  },

  async applySearch(value) {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const payload = await getDestinationsPageData(value);
      this.setData(
        Object.assign(
          {
            loading: false,
            errorText: "",
            searchValue: value
          },
          payload
        )
      );
    } catch (error) {
      console.error("Failed to load destinations", error);
      this.setData({
        loading: false,
        errorText: "目的地列表加载失败，请稍后重试。",
        searchValue: value
      });
    }
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${event.detail.slug}`
    });
  }
});
