const { pickAuditText } = require("./audit");

function showOfflineOrderNotice() {
  wx.showToast({
    title: pickAuditText("离线演示阶段，暂不开放下单", "当前阶段请先提交报名信息"),
    icon: "none",
    duration: 2200
  });
}

module.exports = {
  showOfflineOrderNotice
};
