function callContentGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
      reject(new Error("wx.cloud.callFunction is unavailable"));
      return;
    }

    wx.cloud.callFunction({
      name: "contentGateway",
      data: {
        action,
        payload: payload || {}
      },
      success: (result) => {
        resolve(result && result.result ? result.result : null);
      },
      fail: reject
    });
  });
}

function getHomePageData() {
  return callContentGateway("getHomePageData");
}

function getCreatorsPageData(filters) {
  return callContentGateway("getCreatorsPageData", { filters: filters || {} });
}

function getCreatorDetailData(slug) {
  return callContentGateway("getCreatorDetailData", { slug });
}

function getDestinationsPageData(search) {
  return callContentGateway("getDestinationsPageData", { search: search || "" });
}

function getDestinationDetailData(slug, filters) {
  return callContentGateway("getDestinationDetailData", { slug, filters: filters || {} });
}

function getIdeasPageData(theme, creatorSlug) {
  return callContentGateway("getIdeasPageData", {
    theme: theme || "",
    creatorSlug: creatorSlug || ""
  });
}

function getIdeaDetailData(slug) {
  return callContentGateway("getIdeaDetailData", { slug });
}

function getServiceDetailData(slug) {
  return callContentGateway("getServiceDetailData", { slug });
}

function getHowItWorksData() {
  return callContentGateway("getHowItWorksData");
}

function getFavoritesPageData() {
  return callContentGateway("getFavoritesPageData");
}

module.exports = {
  getHomePageData,
  getCreatorsPageData,
  getCreatorDetailData,
  getDestinationsPageData,
  getDestinationDetailData,
  getIdeasPageData,
  getIdeaDetailData,
  getServiceDetailData,
  getHowItWorksData,
  getFavoritesPageData
};
