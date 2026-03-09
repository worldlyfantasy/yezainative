// 入场页 Logo 云存储 ID，在 onLaunch 预加载以减少入场页滞后
const SPLASH_LOGO_CLOUD_ID =
  "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/野哉（纯白底）.png";

App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: "yezai-3gr73wd48057512e",
        traceUser: true
      });
    }

    this.globalData = {
      appMode: "offline",
      user: null
    };

    // 预加载入场页 Logo，与文字同时显示
    wx.getImageInfo({
      src: SPLASH_LOGO_CLOUD_ID
    }).catch(() => {});
  }
});
