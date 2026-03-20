const { getIdeasPageData } = require("../../../repositories/content-repository");

Page({
  data: {
    loading: true,
    errorText: "",
    creatorSlug: "",
    pageTitle: "旅行故事",
    themes: [],
    currentTheme: "",
    ideas: []
  },

  async onLoad(options) {
    const creatorSlug = (options && options.creatorSlug) || "";
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const payload = await getIdeasPageData("", creatorSlug);
      this.setData(
        {
          loading: false,
          errorText: "",
          creatorSlug,
          pageTitle: payload.pageTitle,
          themes: payload.themes,
          currentTheme: "",
          ideas: payload.ideas
        }
      );
    } catch (error) {
      console.error("Failed to load ideas", error);
      this.setData({
        loading: false,
        errorText: "故事列表加载失败，请稍后重试。",
        creatorSlug
      });
    }
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

  async applyFilter() {
    const { currentTheme, creatorSlug } = this.data;
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const payload = await getIdeasPageData(currentTheme, creatorSlug);
      this.setData({
        loading: false,
        errorText: "",
        ideas: payload.ideas
      });
    } catch (error) {
      console.error("Failed to filter ideas", error);
      this.setData({
        loading: false,
        errorText: "故事列表加载失败，请稍后重试。"
      });
    }
  },

  onIdeaTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pkg/content/idea-detail/index?slug=${slug}`
    });
  }
});
