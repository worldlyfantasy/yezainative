const { AUDIT_MODE } = require("./utils/audit");

const FONT_LOAD_DELAY_MS = 2500;
const YEZAI_FIXED_SONGTI_FONT_URL =
  "https://7965-yezai-3gr73wd48057512e-10f17b581-1407224025.tcb.qcloud.la/brandasset/fonts/yezai-songti-fixed.ttf?v=fixed-20260508";

function loadYezaiSongtiFont() {
  if (typeof wx === "undefined" || typeof wx.loadFontFace !== "function") {
    return;
  }

  wx.loadFontFace({
    family: "Yezai Songti Fixed",
    source: `url("${YEZAI_FIXED_SONGTI_FONT_URL}")`,
    desc: {
      weight: "500"
    },
    global: true,
    scopes: ["webview", "native"],
    fail: () => {}
  });
}

function scheduleYezaiSongtiFontLoad() {
  if (typeof setTimeout !== "function") {
    loadYezaiSongtiFont();
    return null;
  }

  const timer = setTimeout(loadYezaiSongtiFont, FONT_LOAD_DELAY_MS);
  if (timer && typeof timer.unref === "function") {
    timer.unref();
  }
  return timer;
}

App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: "yezai-3gr73wd48057512e-10f17b581",
        traceUser: true
      });
    }

    this.globalData = {
      appMode: AUDIT_MODE ? "audit" : "offline",
      auditMode: AUDIT_MODE,
      user: null
    };

    scheduleYezaiSongtiFontLoad();
  }
});
