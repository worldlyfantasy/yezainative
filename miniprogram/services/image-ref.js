function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function pickFirstString(candidates) {
  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizePublicImageUrl(value) {
  const normalized = pickFirstString([value]);
  if (!normalized) {
    return "";
  }

  return normalized.replace(
    "https://7965-yezai-3gr73wd48057512e-1407224025.tcb.qcloud.la/",
    "https://7965-yezai-3gr73wd48057512e-10f17b581-1407224025.tcb.qcloud.la/"
  );
}

function isCloudFileId(value) {
  return /^cloud:\/\/[^/]+\.[^/]+\/.+$/.test(pickFirstString([value]));
}

function buildPublicUrlFromCloudFileId(value) {
  const normalized = pickFirstString([value]);
  const matched = normalized.match(/^cloud:\/\/[^/]+\.([^/]+)\/(.+)$/);
  if (!matched) {
    return "";
  }

  const bucket = matched[1];
  const filePath = matched[2];
  if (!bucket || !filePath) {
    return "";
  }

  return `https://${bucket}.tcb.qcloud.la/${filePath}`;
}

function getImageAsset(value) {
  if (typeof value === "string") {
  const normalized = value.trim();
  const resolved = isCloudFileId(normalized)
    ? (buildPublicUrlFromCloudFileId(normalized) || normalized)
    : normalizePublicImageUrl(normalized);
  return normalized
    ? {
          original: resolved,
          card: "",
          detail: ""
        }
      : null;
  }

  if (Array.isArray(value)) {
    return getImageAsset(value[0]);
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const card = pickFirstString([value.card]);
  const detail = pickFirstString([value.detail]);
  const original = pickFirstString([
    value.original,
    value.tempFileURL,
    value.url,
    value.src,
    value.image,
    value.coverImage,
    value.cover,
    value.avatar,
    value.fileID,
    value.cloudFileID,
    value.path,
    detail,
    card
  ]);
  const resolvedOriginal = isCloudFileId(original)
    ? (buildPublicUrlFromCloudFileId(original) || original)
    : normalizePublicImageUrl(original);
  const resolvedCard = isCloudFileId(card)
    ? (buildPublicUrlFromCloudFileId(card) || card)
    : normalizePublicImageUrl(card);
  const resolvedDetail = isCloudFileId(detail)
    ? (buildPublicUrlFromCloudFileId(detail) || detail)
    : normalizePublicImageUrl(detail);

  if (!resolvedOriginal && !resolvedCard && !resolvedDetail) {
    return null;
  }

  return {
    original: resolvedOriginal,
    card: resolvedCard,
    detail: resolvedDetail
  };
}

function normalizeImageRef(value, variant) {
  const asset = getImageAsset(value);
  if (!asset) {
    return "";
  }

  if (variant === "detail") {
    return asset.detail || asset.original || asset.card || "";
  }

  return asset.card || asset.detail || asset.original || "";
}

function normalizeImageList(values, variant) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map((item) => normalizeImageRef(item, variant)).filter(Boolean);
}

function normalizeHeroSlide(slide) {
  if (!isPlainObject(slide)) {
    return null;
  }

  const cloudFileID = pickFirstString([slide.cloudFileID, slide.fileID]);
  const imageSource = slide.image || slide.coverImage || slide.cover || cloudFileID;
  const image = normalizeImageRef(imageSource, "detail");
  const imageCard = normalizeImageRef(imageSource, "card");

  return Object.assign({}, slide, image ? { image } : {}, imageCard ? { imageCard } : {}, cloudFileID ? { cloudFileID } : {});
}

function normalizeHeroSlides(slides) {
  return (Array.isArray(slides) ? slides : []).map(normalizeHeroSlide).filter(Boolean);
}

function normalizeCreatorAssetFields(creator) {
  if (!isPlainObject(creator)) {
    return creator;
  }

  return Object.assign({}, creator, {
    avatar: normalizeImageRef(creator.avatar, "card"),
    avatarDetail: normalizeImageRef(creator.avatar, "detail")
  });
}

function normalizeDestinationAssetFields(destination) {
  if (!isPlainObject(destination)) {
    return destination;
  }

  return Object.assign({}, destination, {
    cover: normalizeImageRef(destination.cover, "card"),
    coverDetail: normalizeImageRef(destination.cover, "detail")
  });
}

function normalizeIdeaAssetFields(idea) {
  if (!isPlainObject(idea)) {
    return idea;
  }

  return Object.assign({}, idea, {
    cover: normalizeImageRef(idea.cover, "card"),
    coverDetail: normalizeImageRef(idea.cover, "detail")
  });
}

function normalizeGalleryGroups(value, variant) {
  return (Array.isArray(value) ? value : [])
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const label = pickFirstString([item.label, item.title, item.name]) || `图集 ${index + 1}`;
      const images = normalizeImageList(item.images || item.gallery || item.items, variant);
      if (!images.length) {
        return null;
      }

      return Object.assign({}, item, {
        label,
        images
      });
    })
    .filter(Boolean);
}

function normalizeTravelDetail(travelDetail) {
  if (!isPlainObject(travelDetail)) {
    return travelDetail || null;
  }

  const overview = isPlainObject(travelDetail.overview)
    ? Object.assign({}, travelDetail.overview, {
        coverImage: normalizeImageRef(travelDetail.overview.coverImage || travelDetail.overview.image, "detail"),
        coverImageCard: normalizeImageRef(travelDetail.overview.coverImage || travelDetail.overview.image, "card")
      })
    : travelDetail.overview;

  const highlights = Array.isArray(travelDetail.highlights)
    ? travelDetail.highlights.map((highlight) => {
        if (!isPlainObject(highlight)) {
          return highlight;
        }

        return Object.assign({}, highlight, {
          images: normalizeImageList(highlight.images || highlight.gallery || highlight.image, "detail"),
          imagesCard: normalizeImageList(highlight.images || highlight.gallery || highlight.image, "card")
        });
      })
    : travelDetail.highlights;

  const normalizeItineraryDay = (day) => {
    if (!isPlainObject(day)) {
      return day;
    }

    const imageSource =
      Array.isArray(day.images) && day.images.length
        ? day.images
        : Array.isArray(day.dayImages) && day.dayImages.length
          ? day.dayImages
          : Array.isArray(day.photos) && day.photos.length
            ? day.photos
            : Array.isArray(day.gallery) && day.gallery.length
              ? day.gallery
              : day.image || day.coverImage;
    return Object.assign({}, day, {
      images: normalizeImageList(imageSource, "detail"),
      imagesCard: normalizeImageList(imageSource, "card")
    });
  };

  const normalizeItinerary = (itinerary) => {
    if (!isPlainObject(itinerary) || !Array.isArray(itinerary.days)) {
      return itinerary;
    }

    return Object.assign({}, itinerary, {
      days: itinerary.days.map(normalizeItineraryDay)
    });
  };

  const itineraryVersions = Array.isArray(travelDetail.itineraryVersions)
    ? travelDetail.itineraryVersions.map((version) => {
        if (!isPlainObject(version)) {
          return version;
        }

        return Object.assign({}, version, {
          days: Array.isArray(version.days) ? version.days.map(normalizeItineraryDay) : version.days,
          itinerary: normalizeItinerary(version.itinerary)
        });
      })
    : travelDetail.itineraryVersions;

  return Object.assign({}, travelDetail, {
    consultWeChatQr: normalizeImageRef(travelDetail.consultWeChatQr, "detail"),
    overview,
    highlights,
    itinerary: normalizeItinerary(travelDetail.itinerary),
    itineraryVersions
  });
}

function normalizeServiceAssetFields(service) {
  if (!isPlainObject(service)) {
    return service;
  }

  return Object.assign({}, service, {
    cover: normalizeImageRef(service.cover, "card"),
    coverDetail: normalizeImageRef(service.cover, "detail"),
    gallery: normalizeImageList(service.gallery, "detail"),
    galleryCard: normalizeImageList(service.gallery, "card"),
    galleryGroups: normalizeGalleryGroups(service.galleryGroups, "detail"),
    galleryGroupsCard: normalizeGalleryGroups(service.galleryGroups, "card"),
    travelDetail: normalizeTravelDetail(service.travelDetail)
  });
}

module.exports = {
  normalizeCreatorAssetFields,
  normalizeDestinationAssetFields,
  normalizeHeroSlides,
  normalizeIdeaAssetFields,
  normalizeImageRef,
  normalizeServiceAssetFields
};
