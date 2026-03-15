const { DATA_SOURCE_TYPES, getContentDataSource } = require("../constants/data-source");
const cloudContentApi = require("../api/cloud/content");
const legacyContentRepository = require("./legacy/content-repository");
const {
  mapHomePageData,
  mapCreatorsPageData,
  mapCreatorDetailData,
  mapDestinationsPageData,
  mapDestinationDetailData,
  mapIdeasPageData,
  mapIdeaDetailData,
  mapServiceDetailData
} = require("../mappers/content");

function getRepository() {
  return getContentDataSource() === DATA_SOURCE_TYPES.CLOUD ? cloudContentApi : legacyContentRepository;
}

async function invoke(methodName, mapper, args) {
  const repository = getRepository();
  let payload;

  try {
    payload = await repository[methodName].apply(repository, args || []);
  } catch (error) {
    if (repository !== legacyContentRepository) {
      payload = await legacyContentRepository[methodName].apply(legacyContentRepository, args || []);
    } else {
      throw error;
    }
  }

  return mapper(payload);
}

function getHomePageData() {
  return invoke("getHomePageData", mapHomePageData);
}

function getCreatorsPageData(filters) {
  return invoke("getCreatorsPageData", mapCreatorsPageData, [filters]);
}

function getCreatorDetailData(slug) {
  return invoke("getCreatorDetailData", mapCreatorDetailData, [slug]);
}

function getDestinationsPageData(search) {
  return invoke("getDestinationsPageData", mapDestinationsPageData, [search]);
}

function getDestinationDetailData(slug, filters) {
  return invoke("getDestinationDetailData", mapDestinationDetailData, [slug, filters]);
}

function getIdeasPageData(theme, creatorSlug) {
  return invoke("getIdeasPageData", mapIdeasPageData, [theme, creatorSlug]);
}

function getIdeaDetailData(slug) {
  return invoke("getIdeaDetailData", mapIdeaDetailData, [slug]);
}

function getServiceDetailData(slug) {
  return invoke("getServiceDetailData", mapServiceDetailData, [slug]);
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
