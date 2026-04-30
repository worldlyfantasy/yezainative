const { getArticleBridgePageConfig } = require("../../../repositories/config-repository");
const {
  isExternalHttpUrl,
  buildArticleBridgeSrc
} = require("./bridge");

const DEFAULT_PAGE_TITLE = "阅读全文";
const DEFAULT_LOADING_TEXT = "正在打开公众号全文…";
const DEFAULT_HINT_TEXT = "请确认当前小程序已关联目标公众号，并使用公众号文章链接。";
const DEFAULT_FALLBACK_TITLE = "如真机无法直接打开，请配置业务域名下的文章中转页地址。";

Page({
  data: {
    src: "",
    errorText: "",
    loadingText: DEFAULT_LOADING_TEXT,
    fallbackTitle: DEFAULT_FALLBACK_TITLE,
    bridgeHintText: DEFAULT_HINT_TEXT
  },

  async onLoad(options) {
    const target = decodeURIComponent((options && options.target) || "").trim();
    const title = decodeURIComponent((options && options.title) || "").trim();

    if (!isExternalHttpUrl(target)) {
      wx.setNavigationBarTitle({
        title: DEFAULT_PAGE_TITLE
      });
      this.setData({
        errorText: "原文链接缺失或格式不正确。"
      });
      return;
    }

    let bridgeConfig = null;
    try {
      bridgeConfig = await getArticleBridgePageConfig();
    } catch (error) {
      bridgeConfig = null;
    }

    const normalizedConfig =
      bridgeConfig && typeof bridgeConfig === "object" ? bridgeConfig : {};
    const pageTitle = title || normalizedConfig.bridgePageTitle || DEFAULT_PAGE_TITLE;

    wx.setNavigationBarTitle({
      title: pageTitle
    });

    this.setData({
      src: buildArticleBridgeSrc({
        target,
        title,
        bridgeBaseUrl: ""
      }),
      loadingText: normalizedConfig.bridgeLoadingText || DEFAULT_LOADING_TEXT,
      fallbackTitle: normalizedConfig.bridgeFallbackTitle || DEFAULT_FALLBACK_TITLE,
      bridgeHintText: normalizedConfig.bridgeHintText || DEFAULT_HINT_TEXT
    });
  }
});
