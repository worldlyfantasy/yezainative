function normalizeVersionName(value) {
  return String(value || "").trim();
}

function normalizeItineraryDays(value) {
  return Array.isArray(value) ? value : [];
}

function countItineraryDays(value) {
  return Array.isArray(value) ? value.length : 0;
}

function buildDefaultItineraryVersion(travelDetail) {
  const defaultVersionName = normalizeVersionName(travelDetail && travelDetail.defaultVersionName) || "标准版";
  const itineraryDays =
    travelDetail && travelDetail.itinerary && Array.isArray(travelDetail.itinerary.days)
      ? travelDetail.itinerary.days
      : [];

  if (!defaultVersionName || !itineraryDays.length) {
    return null;
  }

  return {
    key: "default-itinerary",
    versionName: defaultVersionName,
    days: itineraryDays
  };
}

function buildRawItineraryVersions(travelDetail) {
  const rawVersions = travelDetail && Array.isArray(travelDetail.itineraryVersions)
    ? travelDetail.itineraryVersions
    : [];

  return rawVersions
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const versionName = normalizeVersionName(item.versionName);
      const days = Array.isArray(item.days)
        ? item.days
        : item.itinerary && Array.isArray(item.itinerary.days)
          ? item.itinerary.days
          : [];

      if (!versionName && !days.length) {
        return null;
      }

      return {
        key: normalizeVersionName(item.key) || `version-${index + 1}`,
        versionName,
        days
      };
    })
    .filter(Boolean);
}

function buildVisibleItineraryVersions(travelDetail) {
  const seenNames = new Set();
  const visibleCustomVersions = buildRawItineraryVersions(travelDetail).filter((item) => {
    if (!item.versionName || seenNames.has(item.versionName)) {
      return false;
    }

    seenNames.add(item.versionName);
    return true;
  });

  // The itinerary switcher UI only appears when there are 2+ options.
  // For services that have exactly "default itinerary + one named itinerary", expose the default
  // as a selectable option so users can switch between the two versions.
  //
  // When there are multiple named itineraries, we keep the picker focused on named variants to
  // avoid an extra "标准版" that is often an implementation baseline instead of a real SKU.
  const defaultItineraryVersion = buildDefaultItineraryVersion(travelDetail);
  if (!defaultItineraryVersion) {
    return visibleCustomVersions;
  }

  if (visibleCustomVersions.length !== 1) {
    return visibleCustomVersions;
  }

  const onlyCustom = visibleCustomVersions[0];
  const defaultDays = countItineraryDays(defaultItineraryVersion.days);
  const customDays = countItineraryDays(onlyCustom.days);

  if (!defaultDays || !customDays) {
    return visibleCustomVersions;
  }

  if (defaultItineraryVersion.versionName === onlyCustom.versionName) {
    return visibleCustomVersions;
  }

  return [defaultItineraryVersion, ...visibleCustomVersions];
}

function resolveItineraryVersionState(travelDetail, preferredVersionName) {
  const visibleVersions = buildVisibleItineraryVersions(travelDetail);
  const defaultVersionName = normalizeVersionName(travelDetail && travelDetail.defaultVersionName) || "标准版";
  const preferred = normalizeVersionName(preferredVersionName);
  const matchedVersion = preferred
    ? visibleVersions.find((item) => item.versionName === preferred) || null
    : null;
  const shouldUseDefaultItinerary = preferred && !matchedVersion && preferred === defaultVersionName;
  const activeVersion = matchedVersion || (!preferred && visibleVersions[0]) || null;

  return {
    itineraryVersions: visibleVersions,
    activeItineraryVersionKey: activeVersion ? activeVersion.key : "",
    activeItineraryVersionName: activeVersion ? activeVersion.versionName : "",
    displayItinerary: activeVersion
      ? { days: normalizeItineraryDays(activeVersion.days) }
      : shouldUseDefaultItinerary
        ? (travelDetail && travelDetail.itinerary) || { days: [] }
        : visibleVersions.length
          ? { days: normalizeItineraryDays(visibleVersions[0].days) }
          : (travelDetail && travelDetail.itinerary) || { days: [] }
  };
}

module.exports = {
  buildVisibleItineraryVersions,
  normalizeVersionName,
  resolveItineraryVersionState
};
