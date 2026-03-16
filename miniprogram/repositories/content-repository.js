const { DATA_SOURCE_TYPES, getContentDataSource, isCloudFallbackEnabled } = require("../constants/data-source");
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
const CONTENT_CACHE_TTL_MS = 60 * 1000;
const responseCache = new Map();

function getRepository() {
  return getContentDataSource() === DATA_SOURCE_TYPES.CLOUD ? cloudContentApi : legacyContentRepository;
}

function buildCacheKey(methodName, args) {
  return `${methodName}:${JSON.stringify(args || [])}`;
}

function getCachedValue(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return undefined;
  }

  return cached.value;
}

async function invoke(methodName, mapper, args) {
  const cacheKey = buildCacheKey(methodName, args);
  const cachedValue = getCachedValue(cacheKey);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const repository = getRepository();
  let payload;

  try {
    payload = await repository[methodName].apply(repository, args || []);
  } catch (error) {
    if (repository !== legacyContentRepository && isCloudFallbackEnabled()) {
      payload = await legacyContentRepository[methodName].apply(legacyContentRepository, args || []);
    } else {
      throw error;
    }
  }

  const mapped = mapper(payload);
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CONTENT_CACHE_TTL_MS,
    value: mapped
  });
  return mapped;
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
