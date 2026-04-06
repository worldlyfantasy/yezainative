const { getHomePageData } = require("../../repositories/content-repository");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { openIdea } = require("../../services/idea-navigation");
const {
  enablePageShareMenus,
  createAddToFavorites,
  createShareAppMessage,
  createShareTimeline
} = require("../../utils/share");
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
    enablePageShareMenus();

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
    } catch (error) {
      console.error("Failed to load home page", error);
      this.setData({
        loading: false,
        errorText: "首页内容加载失败，请稍后重试。"
      });
    }
  },

  getShareImageUrl() {
    const heroSlides = this.data.heroSlides || [];
    const activeServices = this.data.activeServices || [];
    const featuredCreators = this.data.featuredCreators || [];
    const featuredIdeas = this.data.featuredIdeas || [];

    return (heroSlides[0] && heroSlides[0].image)
      || (activeServices[0] && activeServices[0].cover)
      || (featuredCreators[0] && featuredCreators[0].avatar)
      || (featuredIdeas[0] && featuredIdeas[0].cover)
      || "";
  },

  onShareAppMessage() {
    return createShareAppMessage({
      title: "野哉 YEZAI｜首页",
      pagePath: "/pages/home/home",
      imageUrl: this.getShareImageUrl()
    });
  },

  onShareTimeline() {
    return createShareTimeline({
      title: "野哉 YEZAI｜首页",
      imageUrl: this.getShareImageUrl()
    });
  },

  onAddToFavorites() {
    return createAddToFavorites({
      title: "野哉 YEZAI｜首页",
      imageUrl: this.getShareImageUrl()
    });
  },

  goCreators() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  goServices() {
    goTopLevel(TOP_LEVEL_ROUTES.journeys);
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
    openIdea(event.detail);
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
