const { getIdeasPageData } = require("../../services/content");

Page({
  data: {
    creatorSlug: "",
    pageTitle: "旅行故事",
    themes: [],
    currentTheme: "",
    ideas: []
  },

  onLoad(options) {
    const creatorSlug = (options && options.creatorSlug) || "";
    const payload = getIdeasPageData("", creatorSlug);
    this.setData(
      {
        creatorSlug,
        pageTitle: payload.pageTitle,
        themes: payload.themes,
        currentTheme: "",
        ideas: payload.ideas
      }
    );
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
    const { currentTheme, creatorSlug } = this.data;
    const payload = getIdeasPageData(currentTheme, creatorSlug);
    this.setData({
      ideas: payload.ideas
    });
  },

  onIdeaTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/idea-detail/index?slug=${slug}`
    });
  }
});
