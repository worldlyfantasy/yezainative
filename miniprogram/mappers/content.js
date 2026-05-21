const { normalizeHeroSlides } = require("../services/image-ref");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizePercent(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function buildCoverPositionStyle(position) {
  const source = ensureObject(position);
  const x = normalizePercent(source.x, 50);
  const y = normalizePercent(source.y, 50);
  return `object-fit: cover; object-position: ${x}% ${y}%;`;
}

function buildBackgroundImageStyle(image, position) {
  const normalizedImage = String(image || "").trim().replace(/["\\]/g, "\\$&");
  if (!normalizedImage) {
    return "";
  }

  const source = ensureObject(position);
  const x = normalizePercent(source.x, 50);
  const y = normalizePercent(source.y, 50);
  return `background-image: url("${normalizedImage}"); background-size: cover; background-repeat: no-repeat; background-position: ${x}% ${y}%;`;
}

function mapCreatorAvatarPosition(item) {
  const source = ensureObject(item);
  if (!source || !item) {
    return item;
  }

  return Object.assign({}, source, {
    avatarPositionStyle: buildCoverPositionStyle(source.avatarPosition),
    avatarBackgroundStyle: buildBackgroundImageStyle(source.avatarDetail || source.avatar, source.avatarPosition)
  });
}

function normalizeIdeaDisplayMode(value) {
  return String(value || "").trim() === "featured" ? "featured" : "thumbnail";
}

function mapIdeaCoverPosition(item) {
  const source = ensureObject(item);
  if (!source || !item) {
    return item;
  }

  return Object.assign({}, source, {
    displayMode: normalizeIdeaDisplayMode(source.displayMode),
    coverPositionStyle: buildCoverPositionStyle(source.coverPosition),
    coverBackgroundStyle: buildBackgroundImageStyle(source.cover, source.coverPosition)
  });
}

function mapServiceCoverPosition(item) {
  const source = ensureObject(item);
  if (!source || !item) {
    return item;
  }

  const positions = ensureObject(source.coverPositions);
  const cardPosition = positions.card || source.coverPosition;
  const squarePosition = positions.square || cardPosition;

  return Object.assign({}, source, {
    coverCardBackgroundStyle: buildBackgroundImageStyle(source.cover, cardPosition),
    coverSquareBackgroundStyle: buildBackgroundImageStyle(source.cover, squarePosition),
    coverBackgroundStyle: buildBackgroundImageStyle(source.cover, cardPosition)
  });
}

function mapHeroSlidePosition(item) {
  const source = ensureObject(item);
  if (!source || !item) {
    return item;
  }

  return Object.assign({}, source, {
    imagePositionStyle: buildCoverPositionStyle(source.coverPosition || source.imagePosition),
    imageBackgroundStyle: buildBackgroundImageStyle(source.image, source.coverPosition || source.imagePosition)
  });
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
    heroSlides: normalizeHeroSlides(source.heroSlides).map(mapHeroSlidePosition),
    featuredCreators: ensureArray(source.featuredCreators).map(mapCreatorAvatarPosition),
    featuredDestinations: ensureArray(source.featuredDestinations),
    featuredServicesByTab: {
      featured: ensureArray(servicesByTab.featured).map(mapServiceCoverPosition),
      recent: ensureArray(servicesByTab.recent).map(mapServiceCoverPosition),
      special: ensureArray(servicesByTab.special).map(mapServiceCoverPosition)
    },
    featuredIdeas: ensureArray(source.featuredIdeas).map(mapIdeaCoverPosition)
  };
}

function mapJourneyPageData(payload) {
  const source = ensureObject(payload);
  return {
    routeTypeOptions: ensureArray(source.routeTypeOptions),
    regionOptions: ensureArray(source.regionOptions),
    journeys: ensureArray(source.journeys).length
      ? ensureArray(source.journeys).map(mapServiceCoverPosition)
      : ensureArray(source.services).map(mapServiceCoverPosition)
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
    creators: ensureArray(source.creators).map(mapCreatorAvatarPosition)
  };
}

function mapCreatorDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    creator: source.creator ? mapCreatorAvatarPosition(source.creator) : null,
    creatorDestinations: ensureArray(source.creatorDestinations),
    relatedServices: ensureArray(source.relatedServices).map(mapServiceCoverPosition),
    creatorIdeas: ensureArray(source.creatorIdeas).map(mapIdeaCoverPosition)
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
    relatedCreators: ensureArray(source.relatedCreators).map(mapCreatorAvatarPosition),
    relatedIdeas: ensureArray(source.relatedIdeas).map(mapIdeaCoverPosition),
    services: ensureArray(source.services).map(mapServiceCoverPosition)
  };
}

function mapIdeasPageData(payload) {
  const source = ensureObject(payload);
  return {
    themes: ensureArray(source.themes),
    pageTitle: source.pageTitle || "旅行故事",
    ideas: ensureArray(source.ideas).map(mapIdeaCoverPosition)
  };
}

function mapIdeaDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    idea: source.idea ? mapIdeaCoverPosition(source.idea) : null,
    author: source.author ? mapCreatorAvatarPosition(source.author) : null,
    relatedRegions: ensureArray(source.relatedRegions),
    relatedServices: ensureArray(source.relatedServices).map(mapServiceCoverPosition),
    blocks: ensureArray(source.blocks)
  };
}

function mapServiceDetailData(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    service: source.service ? mapServiceCoverPosition(source.service) : null,
    travelDetail: source.travelDetail || null,
    creator: source.creator ? mapCreatorAvatarPosition(source.creator) : null,
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
    service: source.service ? mapServiceCoverPosition(source.service) : null,
    creator: source.creator ? mapCreatorAvatarPosition(source.creator) : null,
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
