function calcDurationDaysFromDates(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return "";
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (!Number.isFinite(diff) || diff <= 0) return "";
  return diff;
}

function getPeriodDurationDays(period) {
  const fromField = Number(period && period.durationDays);
  if (Number.isFinite(fromField) && fromField > 0) {
    return Math.round(fromField);
  }

  return calcDurationDaysFromDates(period && period.dateStart, period && period.dateEnd);
}

function buildDurationLabelFromDayValues(dayValues) {
  const uniqueDays = Array.from(
    new Set((dayValues || []).filter((value) => typeof value === "number" && value > 0))
  ).sort((a, b) => a - b);

  if (!uniqueDays.length) return "";
  if (uniqueDays.length === 1) return `${uniqueDays[0]}天`;
  return `${uniqueDays.join("/")}天`;
}

function buildDurationLabelFromPeriods(periods) {
  return buildDurationLabelFromDayValues(
    (periods || [])
      .map((item) => getPeriodDurationDays(item))
      .filter((value) => typeof value === "number" && value > 0)
  );
}

function countItineraryDays(itinerary) {
  return itinerary && Array.isArray(itinerary.days) ? itinerary.days.length : 0;
}

function buildDurationLabelFromTravelDetail(travelDetail) {
  if (!travelDetail) {
    return "";
  }

  const dayValues = [];
  const defaultDays = countItineraryDays(travelDetail.itinerary);
  if (defaultDays > 0) {
    dayValues.push(defaultDays);
  }

  if (Array.isArray(travelDetail.itineraryVersions)) {
    travelDetail.itineraryVersions.forEach((item) => {
      const days = item && Array.isArray(item.days) ? item.days.length : 0;
      if (days > 0) {
        dayValues.push(days);
      }
    });
  }

  return buildDurationLabelFromDayValues(dayValues);
}

function calcDurationLabel(payload, travelDetail) {
  const fromPeriods = buildDurationLabelFromPeriods(payload && payload.groupPeriods);
  if (fromPeriods) {
    return fromPeriods;
  }

  const fromTravelDetail = buildDurationLabelFromTravelDetail(travelDetail);
  return fromTravelDetail || "行程待确认";
}

module.exports = {
  buildDurationLabelFromPeriods,
  buildDurationLabelFromTravelDetail,
  calcDurationLabel,
  getPeriodDurationDays
};
