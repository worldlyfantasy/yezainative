const { getDestinationsPageData } = require("../../services/content");

Page({
  data: {
    searchValue: "",
    destinations: []
  },

  onLoad() {
    this.applySearch("");
  },

  onSearchInput(event) {
    this.setData({
      searchValue: event.detail.value
    });
  },

  onSearch() {
    this.applySearch(this.data.searchValue);
  },

  applySearch(value) {
    this.setData(
      Object.assign(
        {
          searchValue: value
        },
        getDestinationsPageData(value)
      )
    );
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pages/destination-detail/index?slug=${event.detail.slug}`
    });
  }
});
