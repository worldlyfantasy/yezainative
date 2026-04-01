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
        const gatewayResult = result && result.result ? result.result : null;
        if (!gatewayResult || gatewayResult.ok !== true) {
          reject(new Error(gatewayResult && gatewayResult.error ? gatewayResult.error : "Content gateway failed"));
          return;
        }

        resolve(gatewayResult.data || null);
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

function getDestinationsPageData(search, filters) {
  return callContentGateway("getDestinationsPageData", {
    search: search || "",
    filters: filters || {}
  });
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

module.exports = {
  getHomePageData,
  getCreatorsPageData,
  getCreatorDetailData,
  getDestinationsPageData,
  getDestinationDetailData,
  getIdeasPageData,
  getIdeaDetailData,
  getServiceDetailData
};
