const { getHomePageData } = require("../../repositories/content-repository");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const SERVICE_TABS = [
  { key: "featured", label: "野哉精选" },
  { key: "recent", label: "近期出行" },
  { key: "special", label: "特别企划" }
];

Page({
  data: {
    loading: true,
    errorText: "",
    heroSlides: [],
    featuredCreators: [],
    featuredDestinations: [],
    featuredIdeas: [],
    serviceTabs: SERVICE_TABS,
    activeServiceTab: "featured",
    featuredServicesByTab: {
      featured: [],
      recent: [],
      special: []
    },
    activeServices: []
  },

  async onLoad() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const homePageData = await getHomePageData();
      const featuredServicesByTab = this.normalizeServicesByTab(homePageData && homePageData.featuredServicesByTab);
      const activeServiceTab = this.resolveDefaultServiceTab(featuredServicesByTab);
      this.setData(
        Object.assign({}, homePageData, {
          loading: false,
          errorText: "",
          featuredServicesByTab,
          activeServiceTab,
          activeServices: this.getServicesByTab(featuredServicesByTab, activeServiceTab)
        })
      );
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

  goServices() {
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

  onServiceTabChange(event) {
    const { tab } = event.currentTarget.dataset;
    if (!tab || tab === this.data.activeServiceTab) {
      return;
    }

    this.setData({
      activeServiceTab: tab,
      activeServices: this.getServicesByTab(this.data.featuredServicesByTab, tab)
    });
  },

  onServiceTap(event) {
    const slug = (event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.slug)
      || (event.detail && event.detail.slug)
      || "";
    if (!slug) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${slug}`
    });
  },

  onIdeaTap(event) {
    wx.navigateTo({
      url: `/pkg/content/idea-detail/index?slug=${event.detail.slug}`
    });
  },

  resolveDefaultServiceTab(featuredServicesByTab) {
    const serviceTabs = this.data.serviceTabs || [];
    for (let index = 0; index < serviceTabs.length; index += 1) {
      const key = serviceTabs[index].key;
      if (this.getServicesByTab(featuredServicesByTab, key).length) {
        return key;
      }
    }

    return serviceTabs.length ? serviceTabs[0].key : "featured";
  },

  getServicesByTab(featuredServicesByTab, tabKey) {
    if (!featuredServicesByTab || !tabKey) {
      return [];
    }
    const services = featuredServicesByTab[tabKey];
    return Array.isArray(services) ? services.slice(0, 3) : [];
  },

  normalizeServicesByTab(featuredServicesByTab) {
    const source = featuredServicesByTab && typeof featuredServicesByTab === "object"
      ? featuredServicesByTab
      : {};
    return {
      featured: Array.isArray(source.featured) ? source.featured : [],
      recent: Array.isArray(source.recent) ? source.recent : [],
      special: Array.isArray(source.special) ? source.special : []
    };
  }
});
