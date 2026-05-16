const cloudContentApi = require("../api/cloud/content");
const {
  mapHomePageData,
  mapJourneyPageData,
  mapCreatorsPageData,
  mapCreatorDetailData,
  mapDestinationsPageData,
  mapDestinationDetailData,
  mapIdeasPageData,
  mapIdeaDetailData,
  mapServiceBookingData,
  mapServiceConsultData,
  mapServiceDetailSummaryData,
  mapServiceDetailContentData,
  mapServiceGalleryData,
  mapServiceGalleryOriginalData,
  mapServiceDetailData
} = require("../mappers/content");
const CONTENT_CACHE_TTL_MS = 60 * 1000;
const responseCache = new Map();
const legacyServiceDetailPromiseCache = new Map();

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

async function invoke(methodName, mapper, args, options) {
  const useCache = !(options && options.cache === false);
  const cacheKey = buildCacheKey(methodName, args);
  if (useCache) {
    const cachedValue = getCachedValue(cacheKey);
    if (cachedValue !== undefined) {
      return cachedValue;
    }
  }

  const payload = await cloudContentApi[methodName].apply(cloudContentApi, args || []);
  const mapped = mapper(payload);
  if (useCache) {
    responseCache.set(cacheKey, {
      expiresAt: Date.now() + CONTENT_CACHE_TTL_MS,
      value: mapped
    });
  }
  return mapped;
}

function buildErrorMessage(error) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error.message || error.errMsg || error.error || "").trim();
}

async function getLegacyServiceDetailForFallback(slug) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) {
    return null;
  }

  if (legacyServiceDetailPromiseCache.has(normalizedSlug)) {
    return legacyServiceDetailPromiseCache.get(normalizedSlug);
  }

  const pending = invoke("getServiceDetailData", mapServiceDetailData, [normalizedSlug], { cache: false })
    .finally(() => {
      legacyServiceDetailPromiseCache.delete(normalizedSlug);
    });

  legacyServiceDetailPromiseCache.set(normalizedSlug, pending);
  return pending;
}

function buildServiceDetailSummaryFallback(legacyPayload) {
  if (!legacyPayload) {
    return null;
  }

  return {
    service: legacyPayload.service || null,
    travelDetail: null,
    creator: legacyPayload.creator || null,
    relatedDestinations: Array.isArray(legacyPayload.relatedDestinations) ? legacyPayload.relatedDestinations : [],
    heroCover: legacyPayload.heroCover || "",
    photoGallery: Array.isArray(legacyPayload.photoGallery) ? legacyPayload.photoGallery.slice(0, 4) : [],
    photoTotal: Number(legacyPayload.photoTotal) || 0,
    mediaTabs: Array.isArray(legacyPayload.mediaTabs) ? legacyPayload.mediaTabs : [],
    hasGalleryGroups: Boolean(legacyPayload.hasGalleryGroups),
    groupPeriods: []
  };
}

function buildServiceDetailContentFallback(legacyPayload) {
  if (!legacyPayload) {
    return null;
  }

  return {
    travelDetail: legacyPayload.travelDetail || null,
    groupPeriods: Array.isArray(legacyPayload.groupPeriods) ? legacyPayload.groupPeriods : []
  };
}

function buildServiceGalleryFallback(legacyPayload) {
  if (!legacyPayload) {
    return null;
  }

  const mediaTabs = Array.isArray(legacyPayload.mediaTabs)
    ? legacyPayload.mediaTabs.map((item) => ({
      key: item && item.key ? item.key : "",
      label: item && item.label ? item.label : "",
      images: Array.isArray(item && item.images) ? item.images : []
    }))
    : [];

  return {
    mediaTabs,
    photoTotal: Number(legacyPayload.photoTotal) || mediaTabs.flatMap((item) => item.images || []).filter(Boolean).length,
    hasGalleryGroups: Boolean(legacyPayload.hasGalleryGroups)
  };
}

function buildServiceBookingFallback(legacyPayload) {
  if (!legacyPayload) {
    return null;
  }

  return {
    service: legacyPayload.service || null,
    creator: legacyPayload.creator || null,
    groupPeriods: Array.isArray(legacyPayload.groupPeriods) ? legacyPayload.groupPeriods : []
  };
}

function buildServiceConsultFallback(legacyPayload) {
  return {
    consultWeChatQr:
      (legacyPayload && legacyPayload.travelDetail && legacyPayload.travelDetail.consultWeChatQr) || ""
  };
}

async function invokeServiceDetailFallback(methodName, mapper, slug, buildFallback, options) {
  try {
    return await invoke(methodName, mapper, [slug], options);
  } catch (error) {
    console.warn(`[content-repository] ${methodName} failed, fallback to getServiceDetailData`, buildErrorMessage(error));
    const legacyPayload = await getLegacyServiceDetailForFallback(slug);
    return buildFallback(legacyPayload);
  }
}

function getHomePageData() {
  return invoke("getHomePageData", mapHomePageData);
}

function getJourneyPageData() {
  return invoke("getJourneyPageData", mapJourneyPageData, [], { cache: false });
}

function getCustomJourneyPageData() {
  return invoke("getCustomJourneyPageData", mapJourneyPageData, [], { cache: false });
}

function getCreatorsPageData(filters) {
  return invoke("getCreatorsPageData", mapCreatorsPageData, [filters]);
}

function getCreatorDetailData(slug) {
  return invoke("getCreatorDetailData", mapCreatorDetailData, [slug]);
}

function getDestinationsPageData(search, filters) {
  return invoke("getDestinationsPageData", mapDestinationsPageData, [search, filters, "destination-region-v1"]);
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
  return invoke("getServiceDetailData", mapServiceDetailData, [slug], { cache: false });
}

function getServiceBookingData(slug) {
  return invokeServiceDetailFallback(
    "getServiceBookingData",
    mapServiceBookingData,
    slug,
    buildServiceBookingFallback,
    { cache: false }
  );
}

function getServiceConsultData(slug) {
  return invokeServiceDetailFallback(
    "getServiceConsultData",
    mapServiceConsultData,
    slug,
    buildServiceConsultFallback
  );
}

function getServiceDetailSummaryData(slug) {
  return invokeServiceDetailFallback(
    "getServiceDetailSummaryData",
    mapServiceDetailSummaryData,
    slug,
    buildServiceDetailSummaryFallback,
    { cache: false }
  );
}

function getServiceDetailContentData(slug) {
  return invokeServiceDetailFallback(
    "getServiceDetailContentData",
    mapServiceDetailContentData,
    slug,
    buildServiceDetailContentFallback,
    { cache: false }
  );
}

function getServiceGalleryData(slug) {
  return invokeServiceDetailFallback(
    "getServiceGalleryData",
    mapServiceGalleryData,
    slug,
    buildServiceGalleryFallback,
    { cache: false }
  );
}

function getServiceGalleryOriginalData(slug) {
  return invokeServiceDetailFallback(
    "getServiceGalleryOriginalData",
    mapServiceGalleryOriginalData,
    slug,
    buildServiceGalleryFallback,
    { cache: false }
  );
}

module.exports = {
  getHomePageData,
  getJourneyPageData,
  getCustomJourneyPageData,
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
