const { AUDIT_MODE } = require("./utils/audit");

// 入场页 Logo 云存储 ID，在 onLaunch 预加载以减少入场页滞后
const SPLASH_LOGO_CLOUD_ID =
  "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/野哉（纯白底）.png";

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

    // 预加载入场页 Logo，与文字同时显示
    const imageInfoRequest = wx.getImageInfo({
      src: SPLASH_LOGO_CLOUD_ID,
      fail: () => {}
    });

    if (imageInfoRequest && typeof imageInfoRequest.catch === "function") {
      imageInfoRequest.catch(() => {});
    }
  }
});
