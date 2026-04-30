const { normalizeHeroSlides } = require("../services/image-ref");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeIdeaSortTimestamp(item) {
  const source = ensureObject(item);
  const candidates = [
    Number(source.publishedAt) || 0,
    Number(source.updatedAt) || 0,
    Number(source.createdAt) || 0
  ];

  return candidates.find((value) => value > 0) || 0;
}

function sortIdeasByNewest(items) {
  return ensureArray(items)
    .slice()
    .sort((left, right) => normalizeIdeaSortTimestamp(right) - normalizeIdeaSortTimestamp(left));
}

function mapHomePageData(payload) {
  const source = ensureObject(payload);
  const servicesByTab = ensureObject(source.featuredServicesByTab);
  return {
    heroSlides: normalizeHeroSlides(source.heroSlides),
    featuredCreators: ensureArray(source.featuredCreators),
    featuredDestinations: ensureArray(source.featuredDestinations),
    featuredServicesByTab: {
      featured: ensureArray(servicesByTab.featured),
      recent: ensureArray(servicesByTab.recent),
      special: ensureArray(servicesByTab.special)
    },
    featuredIdeas: ensureArray(source.featuredIdeas)
  };
}

function mapJourneyPageData(payload) {
  const source = ensureObject(payload);
  return {
    routeTypeOptions: ensureArray(source.routeTypeOptions),
    regionOptions: ensureArray(source.regionOptions),
    journeys: ensureArray(source.journeys).length
      ? ensureArray(source.journeys)
      : ensureArray(source.services)
  };
}

function mapCreatorsPageData(payload) {
  const source = ensureObject(payload);
  return {
    destinationOptions: ensureArray(source.destinationOptions),
    regionOptions: ensureArray(source.regionOptions),
    styleOptions: ensureArray(source.styleOptions),
    destinationLabels: ensureArray(source.destinationLabels),
    regionLabels: ensureArray(source.regionLabels),
    styleLabels: ensureArray(source.styleLabels),
    creators: ensureArray(source.creators)
  };
}

function mapCreatorDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    creator: source.creator || null,
    creatorDestinations: ensureArray(source.creatorDestinations),
    relatedServices: ensureArray(source.relatedServices),
    creatorIdeas: sortIdeasByNewest(source.creatorIdeas)
  };
}

function mapDestinationsPageData(payload) {
  const source = ensureObject(payload);
  return {
    regionOptions: ensureArray(source.regionOptions),
    regionLabels: ensureArray(source.regionLabels),
    styleOptions: ensureArray(source.styleOptions),
    styleLabels: ensureArray(source.styleLabels),
    destinations: ensureArray(source.destinations)
  };
}

function mapDestinationDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    destination: source.destination || null,
    typeOptions: ensureArray(source.typeOptions),
    styleOptions: ensureArray(source.styleOptions),
    typeLabels: ensureArray(source.typeLabels),
    styleLabels: ensureArray(source.styleLabels),
    relatedCreators: ensureArray(source.relatedCreators),
    relatedIdeas: ensureArray(source.relatedIdeas),
    services: ensureArray(source.services)
  };
}

function mapIdeasPageData(payload) {
  const source = ensureObject(payload);
  return {
    themes: ensureArray(source.themes),
    pageTitle: source.pageTitle || "旅行故事",
    ideas: sortIdeasByNewest(source.ideas)
  };
}

function mapIdeaDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    idea: source.idea || null,
    author: source.author || null,
    relatedRegions: ensureArray(source.relatedRegions),
    relatedServices: ensureArray(source.relatedServices),
    blocks: ensureArray(source.blocks)
  };
}

function mapServiceDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    service: source.service || null,
    travelDetail: source.travelDetail || null,
    creator: source.creator || null,
    relatedDestinations: ensureArray(source.relatedDestinations),
    heroCover: source.heroCover || "",
    photoGallery: ensureArray(source.photoGallery),
    photoTotal: Number(source.photoTotal) || 0,
    mediaTabs: ensureArray(source.mediaTabs),
    hasGalleryGroups: Boolean(source.hasGalleryGroups),
    groupPeriods: ensureArray(source.groupPeriods)
  };
}

function mapServiceDetailSummaryData(payload) {
  return mapServiceDetailData(payload);
}

function mapServiceBookingData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    service: source.service || null,
    creator: source.creator || null,
    groupPeriods: ensureArray(source.groupPeriods)
  };
}

function mapServiceConsultData(payload) {
  const source = ensureObject(payload);
  return {
    consultWeChatQr: source.consultWeChatQr || ""
  };
}

function mapServiceDetailContentData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    travelDetail: source.travelDetail || null,
    groupPeriods: ensureArray(source.groupPeriods)
  };
}

function mapServiceGalleryData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    mediaTabs: ensureArray(source.mediaTabs),
    photoTotal: Number(source.photoTotal) || 0,
    hasGalleryGroups: Boolean(source.hasGalleryGroups)
  };
}

function mapServiceGalleryOriginalData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    mediaTabs: ensureArray(source.mediaTabs),
    photoTotal: Number(source.photoTotal) || 0,
    hasGalleryGroups: Boolean(source.hasGalleryGroups)
  };
}

module.exports = {
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
};
