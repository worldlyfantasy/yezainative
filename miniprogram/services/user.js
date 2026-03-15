const { getCurrentUser, login, logout } = require("../repositories/user-repository");
const { getRecentOrders } = require("../repositories/transaction-repository");
const { getServiceCreatorRoles, getServiceCreatorRoleText } = require("./service-roles");
const { services = [] } = require("../mock/services");
const { creators = [] } = require("../mock/creators");

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
        creatorRoles: service ? getServiceCreatorRoles(service) : ["创作者"],
        creatorRoleText: service ? getServiceCreatorRoleText(service) : "创作者",
        creatorStance: creator ? creator.stance : ""
      });
    });
}

async function getMyPageData() {
  const user = await getCurrentUser();
  const loggedIn = Boolean(user);
  const recentOrders = loggedIn ? await getRecentOrders(2) : [];
  const activeTripCandidates = loggedIn ? await getRecentOrders(8) : [];

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
  getCurrentUser,
  login,
  logout,
  getMyPageData
};
