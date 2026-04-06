const { getIdeaDetailData } = require("../../../repositories/content-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");
const { renderIdeaBodyRichText } = require("../../../utils/content");
const { enablePageShareMenus, createShareAppMessage, createShareTimeline } = require("../../../utils/share");

function formatPublishedDate(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

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
    excerptHtml: "",
    author: null,
    relatedServices: [],
    publishedDateLabel: "",
    isMiniFullArticle: true,
    showReadMore: false
  },

  async onLoad(options) {
    this.isPageActive = true;
    enablePageShareMenus();

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

      const idea = payload.idea || {};
      const sourceType = idea.sourceType || "mini";
      const publishedDateLabel = formatPublishedDate(idea.publishedAt);
      const excerptHtml = renderIdeaBodyRichText(idea.excerptBody || "");
      const richTextSource = sourceType === "mini" ? idea.body : "";
      this.setData(Object.assign({}, payload, {
        loading: false,
        excerptHtml,
        richTextHtml: renderIdeaBodyRichText(richTextSource),
        publishedDateLabel,
        isMiniFullArticle: sourceType === "mini",
        showReadMore: Boolean(idea.wechatArticleUrl) && sourceType !== "mini"
      }));
      this.loadFavoriteState(idea.slug);
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
    this.isPageActive = false;
    clearFavoriteNotice(this, "favoriteNoticeState", true);
  },

  async loadFavoriteState(slug) {
    if (!slug) {
      return;
    }

    try {
      const favorited = await isFavorited("ideas", slug);
      if (!this.isPageActive || !this.data.idea || this.data.idea.slug !== slug) {
        return;
      }

      this.setData({
        "idea.isFavorited": favorited
      });
    } catch (error) {
      console.error("Failed to resolve idea favorite status", error);
    }
  },

  onShareAppMessage() {
    const idea = this.data.idea || {};
    return createShareAppMessage({
      title: idea.title ? `${idea.title}｜野哉故事` : "野哉故事",
      pagePath: "/pkg/content/idea-detail/index",
      query: {
        slug: idea.slug
      },
      imageUrl: idea.cover || (this.data.author && this.data.author.avatar)
    });
  },

  onShareTimeline() {
    const idea = this.data.idea || {};
    return createShareTimeline({
      title: idea.title ? `${idea.title}｜野哉故事` : "野哉故事",
      query: {
        slug: idea.slug
      },
      imageUrl: idea.cover || (this.data.author && this.data.author.avatar)
    });
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

  goDestinationDetail(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${slug}`
    });
  },

  onServiceTap(event) {
    const slug = event && event.detail && event.detail.slug;
    if (!slug) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${slug}`
    });
  },

  handleReadMore() {
    const idea = this.data.idea || {};
    const articleUrl = idea.wechatArticleUrl;
    if (!articleUrl) {
      wx.showToast({
        title: "未配置原文链接",
        icon: "none"
      });
      return;
    }

    wx.navigateTo({
      url: `/pkg/content/article-bridge/index?target=${encodeURIComponent(articleUrl)}&title=${encodeURIComponent(idea.wechatArticleTitle || idea.title || "")}`
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
