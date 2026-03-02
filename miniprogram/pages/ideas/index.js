const { getIdeasPageData } = require("../../services/content");

Page({
  data: {
    themes: [],
    currentTheme: "",
    ideas: []
  },

  onLoad() {
    this.setData(getIdeasPageData(""));
    this.applyFilter();
  },

  toggleTheme(event) {
    const theme = event.currentTarget.dataset.theme;
    this.setData(
      {
        currentTheme: this.data.currentTheme === theme ? "" : theme
      },
      () => this.applyFilter()
    );
  },

  applyFilter() {
    this.setData({
      ideas: getIdeasPageData(this.data.currentTheme).ideas
    });
  },

  onIdeaTap(event) {
    wx.navigateTo({
      url: `/pages/idea-detail/index?slug=${event.detail.slug}`
    });
  }
});
