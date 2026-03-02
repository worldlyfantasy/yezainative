const CREATOR_FILTER_KEY = "yezai_creator_filter";
const TOP_LEVEL_ROUTES = {
  home: "/pages/home/home",
  creators: "/pages/creators/index",
  destinations: "/pages/destinations/index",
  ideas: "/pages/ideas/index",
  profile: "/pages/profile/index"
};

function setPendingCreatorFilter(filter) {
  wx.setStorageSync(CREATOR_FILTER_KEY, filter || {});
}

function consumePendingCreatorFilter() {
  const filter = wx.getStorageSync(CREATOR_FILTER_KEY);
  wx.removeStorageSync(CREATOR_FILTER_KEY);
  return filter || {};
}

function resolveTopLevelRoute(route) {
  const normalized = route && route.indexOf("/") === 0 ? route.slice(1) : route;

  if (!normalized) {
    return TOP_LEVEL_ROUTES.home;
  }

  if (normalized.indexOf("pages/creator-detail/") === 0 || normalized.indexOf("pages/creators/") === 0) {
    return TOP_LEVEL_ROUTES.creators;
  }

  if (
    normalized.indexOf("pages/destination-detail/") === 0 ||
    normalized.indexOf("pages/destinations/") === 0 ||
    normalized.indexOf("pages/service-detail/") === 0 ||
    normalized.indexOf("pages/checkout/") === 0
  ) {
    return TOP_LEVEL_ROUTES.destinations;
  }

  if (normalized.indexOf("pages/idea-detail/") === 0 || normalized.indexOf("pages/ideas/") === 0) {
    return TOP_LEVEL_ROUTES.ideas;
  }

  if (
    normalized.indexOf("pages/profile/") === 0 ||
    normalized.indexOf("pages/favorites/") === 0 ||
    normalized.indexOf("pages/orders/") === 0 ||
    normalized.indexOf("pages/order-detail/") === 0 ||
    normalized.indexOf("pages/payment-result/") === 0
  ) {
    return TOP_LEVEL_ROUTES.profile;
  }

  return TOP_LEVEL_ROUTES.home;
}

function goTopLevel(targetPath) {
  if (!targetPath) {
    return;
  }

  wx.reLaunch({
    url: targetPath
  });
}

module.exports = {
  setPendingCreatorFilter,
  consumePendingCreatorFilter,
  resolveTopLevelRoute,
  goTopLevel,
  TOP_LEVEL_ROUTES
};
