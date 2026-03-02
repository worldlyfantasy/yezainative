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
  }
});
