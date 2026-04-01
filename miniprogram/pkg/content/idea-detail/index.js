const { getIdeaDetailData } = require("../../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");
const { renderIdeaBodyRichText } = require("../../../utils/content");

Page({
  data: {
    loading: true,
    idea: null,
    favoriteNoticeState: "",
    favoriteNoticeLabel: "收藏成功",
    favoriteNoticeActionLabel: "进入我的收藏",
    favoriteNoticeMode: "success",
    favoriteNoticeActionType: "favorites",
    blocks: [],
    richTextHtml: "",
    author: null
  },

  async onLoad(options) {
    try {
      const payload = await getIdeaDetailData(options.slug);
      if (!payload) {
        this.setData({ loading: false });
        wx.showToast({
          title: "未找到文章",
          icon: "none"
        });

        setTimeout(() => {
          wx.navigateTo({ url: "/pkg/content/ideas/index" });
        }, 300);
        return;
      }

      const favorited = await isFavorited("ideas", payload.idea.slug);
      this.setData(Object.assign({}, payload, {
        loading: false,
        richTextHtml: renderIdeaBodyRichText(payload.idea && payload.idea.body),
        "idea.isFavorited": favorited
      }));
    } catch (error) {
      console.error("Failed to load idea detail", error);
      this.setData({ loading: false });
      wx.showToast({
        title: "加载失败",
        icon: "none"
      });
    }
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.navigateTo({ url: "/pkg/content/ideas/index" });
    }
  },

  goCreatorDetail() {
    if (!this.data.author) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${this.data.author.slug}`
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
      url: "/pkg/account/favorites/index"
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
