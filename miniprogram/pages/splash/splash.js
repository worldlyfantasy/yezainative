// 入场页停留时间（毫秒），到点后自动跳转首页
const SPLASH_HOLD_MS = 1000;
const SPLASH_FADE_MS = 200;
const HOME_PATH = "/pages/home/home";
const LAST_SPLASH_DATE_STORAGE_KEY = "yezai:lastSplashDate";
// 优先使用本地 Logo，与文字同时显示无延迟；不存在则用云存储地址（需联网）
const LOGO_LOCAL_PATH = "/images/splash-logo.png";
const LOGO_CLOUD_ID =
  "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/野哉（纯白底）.png";

function restoreSplash(page, error) {
  console.error("Failed to open home page from splash", error);
  page.leaving = false;
  page.setData({
    isFading: false
  });
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasShownSplashToday() {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
    return false;
  }

  try {
    return wx.getStorageSync(LAST_SPLASH_DATE_STORAGE_KEY) === getLocalDateKey(new Date());
  } catch (error) {
    return false;
  }
}

function markSplashShownToday() {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
    return;
  }

  try {
    wx.setStorageSync(LAST_SPLASH_DATE_STORAGE_KEY, getLocalDateKey(new Date()));
  } catch (error) {
    // Storage failures should not block the entry animation.
  }
}

function openHomePage(page) {
  wx.redirectTo({
    url: HOME_PATH,
    fail: (error) => {
      restoreSplash(page, error);
      wx.reLaunch({
        url: HOME_PATH,
        fail: (relaunchError) => {
          console.error("Failed to relaunch home page from splash", relaunchError);
        }
      });
    }
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
    if (hasShownSplashToday()) {
      openHomePage(this);
      return;
    }

    markSplashShownToday();
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
      openHomePage(this);
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
