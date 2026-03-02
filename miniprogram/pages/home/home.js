const { getHomePageData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { showOfflineOrderNotice } = require("../../utils/offline");

Page({
  data: {
    featuredCreators: [],
    featuredDestinations: [],
    featuredIdeas: [],
    steps: []
  },

  onLoad() {
    this.setData(getHomePageData());
  },

  goCreators() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  goDestinations() {
    goTopLevel(TOP_LEVEL_ROUTES.destinations);
  },

  goIdeas() {
    goTopLevel(TOP_LEVEL_ROUTES.ideas);
  },

  goHowItWorks() {
    wx.navigateTo({
      url: "/pages/how-it-works/index"
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${event.detail.slug}`
    });
  },

  onDestinationTap(event) {
    wx.navigateTo({
      url: `/pages/destination-detail/index?slug=${event.detail.slug}`
    });
  },

  onIdeaTap(event) {
    wx.navigateTo({
      url: `/pages/idea-detail/index?slug=${event.detail.slug}`
    });
  },

  handleOfflineOrder() {
    showOfflineOrderNotice();
  }
});
