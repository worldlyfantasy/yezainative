const MAX_ORDER_PEOPLE_COUNT = 3;

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function getPeriodRemainingSeats(period) {
  const source = period && typeof period === "object" ? period : {};
  const remainingSeats = normalizeNonNegativeInteger(source.remainingSeats, NaN);
  if (Number.isFinite(remainingSeats)) {
    return remainingSeats;
  }

  const totalSeats = normalizeNonNegativeInteger(source.totalSeats, NaN);
  if (Number.isFinite(totalSeats)) {
    const soldCount = normalizeNonNegativeInteger(source.soldCount, 0);
    return Math.max(0, totalSeats - soldCount);
  }

  return 0;
}

function normalizeOrderPeopleCount(value, fallback) {
  const normalizedFallback = normalizeNonNegativeInteger(fallback, 1) || 1;
  const parsed = normalizeNonNegativeInteger(value, normalizedFallback);
  if (parsed <= 0) {
    return 1;
  }

  return Math.min(parsed, MAX_ORDER_PEOPLE_COUNT);
}

function getOrderPeopleLimitMessage() {
  return `单次最多报名 ${MAX_ORDER_PEOPLE_COUNT} 人，如需更多同行请分开提交`;
}

function getExceededOrderPeopleLimitMessage(peopleCount) {
  const requestedCount = normalizeNonNegativeInteger(peopleCount, 0);
  if (requestedCount > MAX_ORDER_PEOPLE_COUNT) {
    return getOrderPeopleLimitMessage();
  }

  return "";
}

function getInsufficientSeatsMessage(period, peopleCount) {
  if (!period || typeof period !== "object") {
    return "";
  }

  const requestedCount = normalizeNonNegativeInteger(peopleCount, 0);
  if (requestedCount <= 0) {
    return "";
  }

  const remainingSeats = getPeriodRemainingSeats(period);
  if (requestedCount > remainingSeats) {
    return `该团期仅剩${remainingSeats}名额，请减少出行人数`;
  }

  return "";
}

function hasEnoughSeats(period, peopleCount) {
  return !getInsufficientSeatsMessage(period, peopleCount);
}

module.exports = {
  MAX_ORDER_PEOPLE_COUNT,
  getExceededOrderPeopleLimitMessage,
  getPeriodRemainingSeats,
  getInsufficientSeatsMessage,
  getOrderPeopleLimitMessage,
  hasEnoughSeats,
  normalizeOrderPeopleCount
};
