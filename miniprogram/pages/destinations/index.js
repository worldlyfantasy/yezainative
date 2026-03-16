const { getDestinationsPageData } = require("../../repositories/content-repository");

Page({
  data: {
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
    const payload = await getDestinationsPageData(value);
    this.setData(
      Object.assign(
        {
          searchValue: value
        },
        payload
      )
    );
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${event.detail.slug}`
    });
  }
});
