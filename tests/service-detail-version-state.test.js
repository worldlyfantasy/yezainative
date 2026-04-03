const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildVisibleItineraryVersions,
  resolveItineraryVersionState
} = require("../miniprogram/pkg/explore/service-detail/version-state");

function createDay(day, title) {
  return {
    day,
    key: `day-${day}`,
    modules: [],
    title
  };
}

test("service detail exposes default itinerary as a selectable version when there is exactly one custom version", () => {
  const travelDetail = {
    defaultVersionName: "标准版",
    itinerary: {
      days: [createDay(1, "默认第1天"), createDay(2, "默认第2天")]
    },
    itineraryVersions: [
      {
        key: "version-7-day",
        versionName: "澜沧江源7日",
        days: [createDay(1, "7日第1天"), createDay(2, "7日第2天"), createDay(3, "7日第3天")]
      }
    ]
  };

  const state = resolveItineraryVersionState(travelDetail, "澜沧江源7日");

  assert.deepEqual(
    state.itineraryVersions.map((item) => item.versionName),
    ["标准版", "澜沧江源7日"]
  );
  assert.equal(state.activeItineraryVersionName, "澜沧江源7日");
  assert.equal(state.displayItinerary.days[0].title, "7日第1天");
});

test("service detail injects default itinerary even if custom shares the same duration", () => {
  const travelDetail = {
    defaultVersionName: "经典版",
    itinerary: {
      days: [createDay(1, "经典第1天"), createDay(2, "经典第2天")]
    },
    itineraryVersions: [
      {
        key: "version-special",
        versionName: "特别版",
        days: [createDay(1, "特别第1天"), createDay(2, "特别第2天")]
      }
    ]
  };

  assert.deepEqual(
    buildVisibleItineraryVersions(travelDetail).map((item) => item.versionName),
    ["经典版", "特别版"]
  );
});

test("service detail keeps the default itinerary visible alongside multiple named versions", () => {
  const travelDetail = {
    defaultVersionName: "标准版",
    itinerary: {
      days: [createDay(1, "默认第1天"), createDay(2, "默认第2天"), createDay(3, "默认第3天")]
    },
    itineraryVersions: [
      {
        key: "version-5-day",
        versionName: "湖岸环线5日",
        days: [createDay(1, "5日第1天")]
      },
      {
        key: "version-6-day",
        versionName: "湖岸环线6日",
        days: [createDay(1, "6日第1天")]
      }
    ]
  };

  const state = resolveItineraryVersionState(travelDetail, "湖岸环线6日");

  assert.deepEqual(
    state.itineraryVersions.map((item) => item.versionName),
    ["标准版", "湖岸环线5日", "湖岸环线6日"]
  );
  assert.equal(state.activeItineraryVersionName, "湖岸环线6日");
  assert.equal(state.displayItinerary.days[0].title, "6日第1天");
});

test("service detail keeps default itinerary when the preferred version points to the default name", () => {
  const travelDetail = {
    defaultVersionName: "标准版",
    itinerary: {
      days: [createDay(1, "默认第1天"), createDay(2, "默认第2天")]
    },
    itineraryVersions: [
      {
        key: "version-5-day",
        versionName: "湖岸环线5日",
        days: [createDay(1, "5日第1天")]
      }
    ]
  };

  const state = resolveItineraryVersionState(travelDetail, "标准版");

  assert.equal(state.activeItineraryVersionName, "标准版");
  assert.equal(state.displayItinerary.days[0].title, "默认第1天");
});

test("visible itinerary versions are deduplicated by version name", () => {
  const travelDetail = {
    itineraryVersions: [
      { key: "v1", versionName: "标准版", days: [createDay(1, "A")] },
      { key: "v2", versionName: "标准版", days: [createDay(1, "B")] },
      { key: "v3", versionName: "升级版", days: [createDay(1, "C")] }
    ]
  };

  assert.deepEqual(
    buildVisibleItineraryVersions(travelDetail).map((item) => item.versionName),
    ["标准版", "升级版"]
  );
});
