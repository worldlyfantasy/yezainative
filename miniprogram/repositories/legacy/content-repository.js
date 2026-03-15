const legacyContentService = require("../../services/content");

function callLegacy(methodName, args) {
  return Promise.resolve(legacyContentService[methodName].apply(legacyContentService, args || []));
}

function getHomePageData() {
  return callLegacy("getHomePageData");
}

function getCreatorsPageData(filters) {
  return callLegacy("getCreatorsPageData", [filters]);
}

function getCreatorDetailData(slug) {
  return callLegacy("getCreatorDetailData", [slug]);
}

function getDestinationsPageData(search) {
  return callLegacy("getDestinationsPageData", [search]);
}

function getDestinationDetailData(slug, filters) {
  return callLegacy("getDestinationDetailData", [slug, filters]);
}

function getIdeasPageData(theme, creatorSlug) {
  return callLegacy("getIdeasPageData", [theme, creatorSlug]);
}

function getIdeaDetailData(slug) {
  return callLegacy("getIdeaDetailData", [slug]);
}

function getServiceDetailData(slug) {
  return callLegacy("getServiceDetailData", [slug]);
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
