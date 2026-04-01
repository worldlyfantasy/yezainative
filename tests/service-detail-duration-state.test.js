const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDurationLabelFromTravelDetail,
  calcDurationLabel
} = require("../miniprogram/pkg/explore/service-detail/duration-state");

function createDay(day) {
  return {
    day,
    key: `day-${day}`,
    modules: [],
    title: `第${day}天`
  };
}

test("service detail duration includes both default and custom itinerary durations when periods are absent", () => {
  const travelDetail = {
    defaultVersionName: "暹粒标准",
    itinerary: {
      days: [createDay(1), createDay(2), createDay(3), createDay(4), createDay(5)]
    },
    itineraryVersions: [
      {
        key: "luxury",
        versionName: "暹粒高端",
        days: [createDay(1), createDay(2)]
      }
    ]
  };

  assert.equal(buildDurationLabelFromTravelDetail(travelDetail), "2/5天");
  assert.equal(calcDurationLabel({}, travelDetail), "2/5天");
});

test("service detail duration still prioritizes live periods when they exist", () => {
  const payload = {
    groupPeriods: [
      { durationDays: 5, dateStart: "2026-04-09", dateEnd: "2026-04-13" },
      { durationDays: 2, dateStart: "2026-04-11", dateEnd: "2026-04-12" }
    ]
  };

  assert.equal(calcDurationLabel(payload, null), "2/5天");
});
