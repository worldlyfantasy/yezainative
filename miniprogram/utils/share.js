function buildQueryString(query) {
  return Object.keys(query || {})
    .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join("&");
}

function buildPagePath(pagePath, query) {
  const queryString = buildQueryString(query);
  return queryString ? `${pagePath}?${queryString}` : pagePath;
}

function pruneEmptyFields(payload) {
  return Object.keys(payload || {}).reduce((result, key) => {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      result[key] = payload[key];
    }
    return result;
  }, {});
}

function enablePageShareMenus() {
  if (typeof wx.showShareMenu !== "function") {
    return;
  }

  wx.showShareMenu({
    menus: ["shareAppMessage", "shareTimeline"]
  });
}

function createShareAppMessage(options) {
  const pagePath = buildPagePath(options.pagePath, options.query);
  return pruneEmptyFields({
    title: options.title || "野哉 YEZAI",
    path: pagePath,
    imageUrl: options.imageUrl || ""
  });
}

function createShareTimeline(options) {
  return pruneEmptyFields({
    title: options.title || "野哉 YEZAI",
    query: buildQueryString(options.query),
    imageUrl: options.imageUrl || ""
  });
}

function createAddToFavorites(options) {
  return pruneEmptyFields({
    title: options.title || "野哉 YEZAI",
    query: buildQueryString(options.query),
    imageUrl: options.imageUrl || ""
  });
}

module.exports = {
  enablePageShareMenus,
  createShareAppMessage,
  createShareTimeline,
  createAddToFavorites
};
