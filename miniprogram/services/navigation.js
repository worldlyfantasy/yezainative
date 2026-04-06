const CREATOR_FILTER_KEY = "yezai_creator_filter";
const JOURNEY_FILTER_KEY = "yezai_journey_filter";
const TOP_LEVEL_ROUTES = {
  home: "/pages/home/home",
  creators: "/pages/creators/index",
  journeys: "/pages/destinations/index",
  destinations: "/pages/destinations/index",
  ideas: "/pkg/content/ideas/index",
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

function setPendingJourneyFilter(filter) {
  wx.setStorageSync(JOURNEY_FILTER_KEY, filter || {});
}

function consumePendingJourneyFilter() {
  const filter = wx.getStorageSync(JOURNEY_FILTER_KEY);
  wx.removeStorageSync(JOURNEY_FILTER_KEY);
  return filter || {};
}

function resolveTopLevelRoute(route) {
  const normalized = route && route.indexOf("/") === 0 ? route.slice(1) : route;

  if (!normalized) {
    return TOP_LEVEL_ROUTES.home;
  }

  if (normalized.indexOf("pkg/explore/creator-detail/") === 0 || normalized.indexOf("pages/creators/") === 0) {
    return TOP_LEVEL_ROUTES.creators;
  }

  if (
    normalized.indexOf("pkg/explore/destination-detail/") === 0 ||
    normalized.indexOf("pages/destinations/") === 0 ||
    normalized.indexOf("pkg/explore/service-detail/") === 0 ||
    normalized.indexOf("pkg/explore/checkout/") === 0
  ) {
    return TOP_LEVEL_ROUTES.journeys;
  }

  if (
    normalized.indexOf("pkg/content/idea-detail/") === 0 ||
    normalized.indexOf("pkg/content/ideas/") === 0 ||
    normalized.indexOf("pkg/content/article-bridge/") === 0
  ) {
    return TOP_LEVEL_ROUTES.creators;
  }

  if (
    normalized.indexOf("pages/profile/") === 0 ||
    normalized.indexOf("pkg/account/favorites/") === 0 ||
    normalized.indexOf("pkg/account/orders/") === 0 ||
    normalized.indexOf("pkg/account/order-detail/") === 0 ||
    normalized.indexOf("pkg/account/payment-result/") === 0
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
  setPendingJourneyFilter,
  consumePendingJourneyFilter,
  resolveTopLevelRoute,
  goTopLevel,
  TOP_LEVEL_ROUTES
};
