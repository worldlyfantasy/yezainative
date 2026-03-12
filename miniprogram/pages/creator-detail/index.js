const { getCreatorDetailData } = require("../../repositories/content-repository");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    creator: null,
    favoriteNoticeState: "",
    creatorDestinations: [],
    relatedServices: [],
    groupServices: []
  },

  async onLoad(options) {
    const payload = await getCreatorDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到创作者",
        icon: "none"
      });

      setTimeout(() => {
        goTopLevel(TOP_LEVEL_ROUTES.creators);
      }, 300);
      return;
    }
    const creatorIdeas = payload.creatorIdeas || [];
    this.setData({
      ...payload,
      displayIdeas: creatorIdeas.slice(0, 2),
      hasMoreIdeas: creatorIdeas.length > 2
    });
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.creators);
  },

  onServiceTap(event) {
    wx.navigateTo({
      url: `/pages/service-detail/index?slug=${event.detail.slug}`
    });
  },

  onDestinationTap(event) {
    const slug = event.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pages/destination-detail/index?slug=${slug}`
    });
  },

  onStoryTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/idea-detail/index?slug=${slug}`
    });
  },

  goCreatorStories() {
    const slug = this.data.creator && this.data.creator.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/ideas/index?creatorSlug=${slug}`
    });
  },

  toggleFavorite() {
    const favorited = toggleFavorite("creators", this.data.creator.slug);
    this.setData({
      "creator.isFavorited": favorited
    });
    if (favorited) {
      showFavoriteNotice(this);
      return;
    }

    clearFavoriteNotice(this);
  },

  goFavorites() {
    wx.navigateTo({
      url: "/pages/favorites/index"
    });
  }
});
