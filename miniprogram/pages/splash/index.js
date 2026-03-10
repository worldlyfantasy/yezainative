// 入场页停留时间（毫秒），到点后自动跳转首页
const SPLASH_HOLD_MS = 1000;
const SPLASH_FADE_MS = 200;
const HOME_PATH = "/pages/home/home";
// 优先使用本地 Logo，与文字同时显示无延迟；不存在则用云存储地址（需联网）
const LOGO_LOCAL_PATH = "/images/splash-logo.png";
const LOGO_CLOUD_ID =
  "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/野哉（纯白底）.png";

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
    this.startAutoTransition();
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
  },

  beginLeave() {
    if (this.leaving) {
      return;
    }

    this.leaving = true;
    this.clearTimers();
    this.setData({
      isFading: true
    });

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
