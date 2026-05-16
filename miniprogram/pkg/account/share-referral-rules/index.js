const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");

Page({
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({
          url: "/pkg/account/assets/index",
          fail: () => {
            goTopLevel(TOP_LEVEL_ROUTES.profile);
          }
        });
      }
    });
  }
});
