const { getRecentOrders } = require("./orders");
const { services = [] } = require("../mock/services");
const { creators = [] } = require("../mock/creators");

const USER_KEY = "yezai_user_profile";

function getStoredUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function simulateWechatLogin() {
  const profile = {
    avatarUrl: "https://picsum.photos/seed/yezai-user-avatar/240/240",
    nickname: "旅人",
    memberLabel: "野哉会员"
  };

  wx.setStorageSync(USER_KEY, profile);
  return profile;
}

function logout() {
  wx.removeStorageSync(USER_KEY);
}

function getServiceBySlug(slug) {
  return services.find((item) => item.slug === slug) || null;
}

function getCreatorById(creatorId) {
  return creators.find((item) => item.id === creatorId) || null;
}

function buildActiveTrips(orders) {
  return orders
    .filter((order) => order.status === "paid" || order.status === "traveling")
    .map((order) => {
      const service = getServiceBySlug(order.serviceSlug);
      const creator = service ? getCreatorById(service.creatorId) : null;

      return Object.assign({}, order, {
        serviceSlug: service ? service.slug : order.serviceSlug,
        serviceSummary: service ? service.summary : "这段旅程仍在缓慢发生，具体安排已在行前发出。",
        serviceCover: service ? service.cover : order.cover,
        creatorName: creator ? creator.name : "野哉创作者",
        creatorSlug: creator ? creator.slug : "",
        creatorAvatar: creator ? creator.avatar : "",
        creatorStance: creator ? creator.stance : ""
      });
    });
}

function getMyPageData() {
  const user = getStoredUser();
  const loggedIn = Boolean(user);
  const recentOrders = loggedIn ? getRecentOrders(2) : [];
  const activeTripCandidates = loggedIn ? getRecentOrders(8) : [];

  return {
    loggedIn,
    user,
    shortcuts: [
      {
        key: "orders",
        label: "我的订单",
        cardClassName: "profile-entry-card--strong",
        eyebrow: "旅程归档",
        desc: "查看全部订单",
        glyphSrc:
          "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/野（扣底圆体）.png"
      },
      {
        key: "favorites",
        label: "我的收藏",
        cardClassName: "",
        eyebrow: "心意收藏",
        desc: "回看喜欢的故事",
        glyphSrc:
          "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/哉（扣底圆体）.png"
      }
    ],
    recentOrders,
    activeTrips: loggedIn ? buildActiveTrips(activeTripCandidates) : []
  };
}

module.exports = {
  getStoredUser,
  simulateWechatLogin,
  logout,
  getMyPageData
};
