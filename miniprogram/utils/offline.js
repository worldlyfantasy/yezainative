function showOfflineOrderNotice() {
  wx.showToast({
    title: "离线演示阶段，暂不开放下单",
    icon: "none",
    duration: 2200
  });
}

module.exports = {
  showOfflineOrderNotice
};
