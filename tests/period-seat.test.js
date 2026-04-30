const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_ORDER_PEOPLE_COUNT,
  getExceededOrderPeopleLimitMessage,
  getPeriodRemainingSeats,
  getInsufficientSeatsMessage,
  getOrderPeopleLimitMessage,
  hasEnoughSeats,
  normalizeOrderPeopleCount
} = require("../miniprogram/pkg/explore/period-seat");

test("period seat helper resolves remaining seats from direct remainingSeats field", () => {
  assert.equal(
    getPeriodRemainingSeats({
      remainingSeats: 2,
      totalSeats: 8,
      soldCount: 6
    }),
    2
  );
});

test("period seat helper falls back to totalSeats minus soldCount", () => {
  assert.equal(
    getPeriodRemainingSeats({
      totalSeats: 8,
      soldCount: 6
    }),
    2
  );
});

test("period seat helper blocks when requested travelers exceed remaining seats", () => {
  const period = {
    remainingSeats: 2
  };

  assert.equal(hasEnoughSeats(period, 2), true);
  assert.equal(hasEnoughSeats(period, 3), false);
  assert.equal(
    getInsufficientSeatsMessage(period, 3),
    "该团期仅剩2名额，请减少出行人数"
  );
});

test("period seat helper exposes and enforces the single-order people limit", () => {
  assert.equal(MAX_ORDER_PEOPLE_COUNT, 2);
  assert.equal(normalizeOrderPeopleCount(1, 1), 1);
  assert.equal(normalizeOrderPeopleCount(5, 1), 2);
  assert.equal(getExceededOrderPeopleLimitMessage(2), "");
  assert.equal(
    getExceededOrderPeopleLimitMessage(3),
    getOrderPeopleLimitMessage()
  );
});
