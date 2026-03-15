const { getIdeaDetailData } = require("../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../repositories/transaction-repository");
const { getCurrentUser } = require("../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

Page({
  data: {
    idea: null,
    favoriteNoticeState: "",
    favoriteNoticeLabel: "收藏成功",
    favoriteNoticeActionLabel: "进入我的收藏",
    favoriteNoticeMode: "success",
    favoriteNoticeActionType: "favorites",
    blocks: [],
    author: null
  },

  async onLoad(options) {
    const payload = await getIdeaDetailData(options.slug);
    if (!payload) {
      wx.showToast({
        title: "未找到文章",
        icon: "none"
      });

      setTimeout(() => {
        wx.navigateTo({ url: "/pages/ideas/index" });
      }, 300);
      return;
    }
    this.setData(Object.assign({}, payload, {
      "idea.isFavorited": await isFavorited("ideas", payload.idea.slug)
    }));
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.navigateTo({ url: "/pages/ideas/index" });
    }
  },

  goCreatorDetail() {
    if (!this.data.author) {
      return;
    }

    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${this.data.author.slug}`
    });
  },

  async toggleFavorite() {
    const user = await getCurrentUser();
    if (!user) {
      showFavoriteNotice(this, {
        label: "您还没有登录，请登录后再收藏",
        actionLabel: "去登录",
        mode: "warning",
        actionType: "login"
      });
      return;
    }

    const favorited = await toggleFavorite("ideas", this.data.idea.slug);
    this.setData({
      "idea.isFavorited": favorited
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
  },

  handleFavoriteNoticeAction() {
    const actionType = this.data.favoriteNoticeActionType;
    clearFavoriteNotice(this);
    if (actionType === "login") {
      goTopLevel(TOP_LEVEL_ROUTES.profile);
      return;
    }

    this.goFavorites();
  }
});
