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

function normalizeImageRef(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return normalizeImageRef(value[0]);
  }

  if (!isPlainObject(value)) {
    return "";
  }

  return pickFirstString([
    value.tempFileURL,
    value.url,
    value.src,
    value.image,
    value.coverImage,
    value.cover,
    value.avatar,
    value.fileID,
    value.cloudFileID,
    value.path
  ]);
}

function normalizeImageList(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map(normalizeImageRef).filter(Boolean);
}

function normalizeHeroSlide(slide) {
  if (!isPlainObject(slide)) {
    return null;
  }

  const cloudFileID = pickFirstString([slide.cloudFileID, slide.fileID]);
  const image = normalizeImageRef(slide.image || slide.coverImage || slide.cover || cloudFileID);

  return Object.assign({}, slide, image ? { image } : {}, cloudFileID ? { cloudFileID } : {});
}

function normalizeHeroSlides(slides) {
  return (Array.isArray(slides) ? slides : []).map(normalizeHeroSlide).filter(Boolean);
}

function normalizeCreatorAssetFields(creator) {
  if (!isPlainObject(creator)) {
    return creator;
  }

  return Object.assign({}, creator, {
    avatar: normalizeImageRef(creator.avatar)
  });
}

function normalizeDestinationAssetFields(destination) {
  if (!isPlainObject(destination)) {
    return destination;
  }

  return Object.assign({}, destination, {
    cover: normalizeImageRef(destination.cover)
  });
}

function normalizeIdeaAssetFields(idea) {
  if (!isPlainObject(idea)) {
    return idea;
  }

  return Object.assign({}, idea, {
    cover: normalizeImageRef(idea.cover)
  });
}

function normalizeTravelDetail(travelDetail) {
  if (!isPlainObject(travelDetail)) {
    return travelDetail || null;
  }

  const overview = isPlainObject(travelDetail.overview)
    ? Object.assign({}, travelDetail.overview, {
        coverImage: normalizeImageRef(travelDetail.overview.coverImage || travelDetail.overview.image)
      })
    : travelDetail.overview;

  const highlights = Array.isArray(travelDetail.highlights)
    ? travelDetail.highlights.map((highlight) => {
        if (!isPlainObject(highlight)) {
          return highlight;
        }

        return Object.assign({}, highlight, {
          images: normalizeImageList(highlight.images || highlight.gallery || highlight.image)
        });
      })
    : travelDetail.highlights;

  return Object.assign({}, travelDetail, {
    overview,
    highlights
  });
}

function normalizeServiceAssetFields(service) {
  if (!isPlainObject(service)) {
    return service;
  }

  return Object.assign({}, service, {
    cover: normalizeImageRef(service.cover),
    gallery: normalizeImageList(service.gallery),
    travelDetail: normalizeTravelDetail(service.travelDetail)
  });
}

module.exports = {
  normalizeCreatorAssetFields,
  normalizeDestinationAssetFields,
  normalizeHeroSlides,
  normalizeIdeaAssetFields,
  normalizeImageList,
  normalizeImageRef,
  normalizeServiceAssetFields
};
