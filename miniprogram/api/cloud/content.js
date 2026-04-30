const CLOUD_ENV_ID = "yezai-3gr73wd48057512e-10f17b581";
let cloudInitialized = false;

function ensureCloudReady() {
  if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
    return false;
  }
  if (!cloudInitialized) {
    try {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      });
    } catch (error) {
      // ignore duplicated init in page-level fallback
    }
    cloudInitialized = true;
  }
  return true;
}

function callContentGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureCloudReady()) {
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

function getJourneyPageData() {
  return callContentGateway("getJourneyPageData");
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

function getServiceDetailSummaryData(slug) {
  return callContentGateway("getServiceDetailSummaryData", { slug });
}

function getServiceBookingData(slug) {
  return callContentGateway("getServiceBookingData", { slug });
}

function getServiceConsultData(slug) {
  return callContentGateway("getServiceConsultData", { slug });
}

function getServiceDetailContentData(slug) {
  return callContentGateway("getServiceDetailContentData", { slug });
}

function getServiceGalleryData(slug) {
  return callContentGateway("getServiceGalleryData", { slug });
}

function getServiceGalleryOriginalData(slug) {
  return callContentGateway("getServiceGalleryOriginalData", { slug });
}

module.exports = {
  getHomePageData,
  getJourneyPageData,
  getCreatorsPageData,
  getCreatorDetailData,
  getDestinationsPageData,
  getDestinationDetailData,
  getIdeasPageData,
  getIdeaDetailData,
  getServiceBookingData,
  getServiceConsultData,
  getServiceDetailSummaryData,
  getServiceDetailContentData,
  getServiceGalleryData,
  getServiceGalleryOriginalData,
  getServiceDetailData
};
