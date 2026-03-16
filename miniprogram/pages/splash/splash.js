// 入场页停留时间（毫秒），到点后自动跳转首页
const SPLASH_HOLD_MS = 1000;
const SPLASH_FADE_MS = 200;
const HOME_PATH = "/pages/home/home";
const ENABLE_SPLASH_DEBUG = false;
// 优先使用本地 Logo，与文字同时显示无延迟；不存在则用云存储地址（需联网）
const LOGO_LOCAL_PATH = "/images/splash-logo.png";
const LOGO_CLOUD_ID =
  "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/野哉（纯白底）.png";

function debugLog(location, message, data, hypothesisId) {
  if (!ENABLE_SPLASH_DEBUG) {
    return;
  }

  const payload = { sessionId: "b47e01", location, message, data: data || {}, timestamp: Date.now(), hypothesisId };
  console.warn("[splash debug]", JSON.stringify(payload));
  wx.request({
    url: "http://127.0.0.1:7534/ingest/4b528870-c39d-43e2-8b98-da57e3c13434",
    method: "POST",
    header: { "Content-Type": "application/json", "X-Debug-Session-Id": "b47e01" },
    data: payload,
    fail: function() {}
  });
}

Page({
  data: {
    isFading: false,
    // 入场页中间诗句：左列、右列，每列按字拆成数组
    quoteColumns: [
      ["山", "风", "缓", "下", "来"],
      ["人", "才", "听", "见", "远", "处", "的", "路"]
    ],
    logoSrc: LOGO_LOCAL_PATH
  },

  onLoad() {
    // #region agent log
    debugLog("splash/splash.js:onLoad", "splash onLoad", { quoteColumnsLen: this.data.quoteColumns.length, logoSrc: this.data.logoSrc }, "H1");
    // #endregion
    this.startAutoTransition();
  },

  onReady() {
    // #region agent log
    debugLog("splash/splash.js:onReady", "splash onReady", {}, "H1");
    // #endregion
  },

  onLogoError() {
    this.setData({ logoSrc: LOGO_CLOUD_ID });
  },

  onUnload() {
    this.clearTimers();
  },

  onHide() {
    this.clearTimers();
  },

  startAutoTransition() {
    this.holdTimer = setTimeout(() => {
      this.beginLeave();
    }, SPLASH_HOLD_MS);
    // #region agent log
    debugLog("splash/splash.js:startAutoTransition", "holdTimer set", { SPLASH_HOLD_MS }, "H3");
    // #endregion
  },

  beginLeave() {
    // #region agent log
    debugLog("splash/splash.js:beginLeave", "beginLeave called", { leaving: !!this.leaving }, "H3");
    // #endregion
    if (this.leaving) {
      return;
    }

    this.leaving = true;
    this.clearTimers();
    this.setData({
      isFading: true
    });
    // #region agent log
    debugLog("splash/splash.js:beginLeave", "setData isFading true", {}, "H5");
    // #endregion

    this.redirectTimer = setTimeout(() => {
      wx.redirectTo({
        url: HOME_PATH
      });
    }, SPLASH_FADE_MS);
  },

  clearTimers() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }

    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
      this.redirectTimer = null;
    }
  }
});
