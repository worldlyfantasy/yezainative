const { getHomePageData } = require("../../repositories/content-repository");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");

Page({
  data: {
    loading: true,
    errorText: "",
    heroSlides: [],
    featuredCreators: [],
    featuredDestinations: [],
    featuredIdeas: []
  },

  async onLoad() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const homePageData = await getHomePageData();
      this.setData(Object.assign({}, homePageData, {
        loading: false,
        errorText: ""
      }));
      this.resolveHeroSlides(homePageData.heroSlides);
    } catch (error) {
      console.error("Failed to load home page", error);
      this.setData({
        loading: false,
        errorText: "首页内容加载失败，请稍后重试。"
      });
    }
  },

  resolveHeroSlides(heroSlides) {
    if (!wx.cloud || !heroSlides || !heroSlides.length) {
      return;
    }

    const cloudSlides = heroSlides.filter((slide) => slide.cloudFileID);
    if (!cloudSlides.length) {
      return;
    }

    wx.cloud.getTempFileURL({
      fileList: cloudSlides.map((slide) => slide.cloudFileID),
      success: (result) => {
        const tempURLMap = (result.fileList || []).reduce((map, file) => {
          if (file.fileID && file.tempFileURL) {
            map[file.fileID] = file.tempFileURL;
          } else if (file.fileID) {
            console.error("Cloud file temp URL missing", file);
          }
          return map;
        }, {});

        const resolvedSlides = heroSlides.map((slide) => {
          if (!slide.cloudFileID) {
            return slide;
          }

          return Object.assign({}, slide, {
            image: tempURLMap[slide.cloudFileID] || slide.image || ""
          });
        });

        this.setData({
          heroSlides: resolvedSlides
        });
      },
      fail: (error) => {
        console.error("Failed to resolve hero slide image", error);
      }
    });
  },

  goCreators() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  goDestinations() {
    goTopLevel(TOP_LEVEL_ROUTES.destinations);
  },

  goIdeas() {
    wx.navigateTo({
      url: "/pkg/content/ideas/index"
    });
  },

  onHeroTap(event) {
    const { slug } = event.currentTarget.dataset;
    if (!slug) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/content/idea-detail/index?slug=${slug}`
    });
  },

  onHeroImageError(event) {
    console.error("Hero image failed to load", {
      id: event.currentTarget.dataset.id,
      src: event.currentTarget.dataset.src,
      detail: event.detail
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${event.detail.slug}`
    });
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${event.detail.slug}`
    });
  },

  onIdeaTap(event) {
    wx.navigateTo({
      url: `/pkg/content/idea-detail/index?slug=${event.detail.slug}`
    });
  }
});
