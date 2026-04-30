const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const pageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pages/destinations/index.js"
);

function loadDestinationsPageDefinition(options = {}) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  let capturedDefinition = null;
  const journeyPayload = options.journeyPayload || {
    journeys: [],
    regionOptions: [],
    routeTypeOptions: []
  };

  global.Page = function registerPage(definition) {
    capturedDefinition = definition;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../../repositories/content-repository") {
      return {
        getJourneyPageData: async () => journeyPayload
      };
    }

    if (request === "../../services/navigation") {
      return {
        consumePendingJourneyFilter() {
          return null;
        }
      };
    }

    if (request === "../../utils/share") {
      return {
        enablePageShareMenus() {},
        createAddToFavorites() {
          return {};
        },
        createShareAppMessage() {
          return {};
        },
        createShareTimeline() {
          return {};
        }
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[pageModulePath];

  try {
    require(pageModulePath);
  } finally {
    Module._load = originalLoad;
    if (originalPage === undefined) {
      delete global.Page;
    } else {
      global.Page = originalPage;
    }
  }

  return capturedDefinition;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPageInstance(options = {}) {
  const definition = loadDestinationsPageDefinition(options);
  const instance = {
    data: cloneData(definition.data),
    allJourneys: [],
    filteredJourneys: [],
    routeTypeOrder: [],
    regionOptions: [],
    setData(update, callback) {
      Object.assign(this.data, update);
      if (typeof callback === "function") {
        callback();
      }
    }
  };

  Object.keys(definition).forEach((key) => {
    if (key === "data") {
      return;
    }

    if (typeof definition[key] === "function") {
      instance[key] = definition[key].bind(instance);
    }
  });

  return instance;
}

function createJourney(options) {
  return {
    slug: options.slug,
    name: options.name || options.slug,
    cover: options.cover || "",
    summary: "",
    creatorName: options.creatorName || "野哉",
    routeTypes: options.routeTypes || [],
    durationTag: "",
    priceLabel: "",
    primaryRouteTypeWordmark: "",
    destinationRegionCodes: options.destinationRegionCodes || [],
    activePeriods: (options.activePeriods || []).map((period) => ({
      statusText: "",
      ...period
    }))
  };
}

test("journey page keeps the date sheet independent from the selected destination region", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "qinghai-loop",
      destinationRegionCodes: ["cn_tibetan"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 3999
        }
      ]
    }),
    createJourney({
      slug: "nanjiang-dune",
      destinationRegionCodes: ["cn_xinjiang"],
      activePeriods: [
        {
          dateStart: "2026-06-01",
          status: "available",
          price: 4999
        }
      ]
    })
  ];

  const state = page.buildDateSheetState({
    searchKeyword: "",
    routeType: "",
    destinationRegionCode: "cn_tibetan",
    status: "all",
    departureDate: ""
  });

  const markedDates = state.calendarWeeks
    .flat()
    .filter((item) => item && item.marked)
    .map((item) => item.fullDate);

  assert.deepEqual(state.calendarMonthKeys, ["2026-05", "2026-06"]);
  assert.deepEqual(markedDates, ["2026-05-01"]);
});

test("journey page normalizes legacy journey payloads that still use services and groupPeriods", async () => {
  const legacyPayload = {
    journeys: [
      {
        slug: "legacy-journey",
        name: "旧版旅程",
        creatorName: "野哉",
        tags: ["文化"],
        groupPeriods: [
          {
            dateStart: "2026-05-01",
            dateEnd: "2026-05-03",
            status: "available",
            price: 3999
          }
        ],
        destinationRegionCodes: ["cn_tibetan"]
      }
    ],
    routeTypeOptions: [{ label: "文化", value: "文化" }],
    regionOptions: [{ label: "藏区", value: "cn_tibetan", image: "" }]
  };
  const page = createPageInstance({ journeyPayload: legacyPayload });

  await page.loadJourneyData();
  clearTimeout(page.measureFilterStackTimer);

  assert.equal(page.data.resultCountText, "共 1 条符合条件的旅程");
  assert.equal(page.data.displayJourneys.length, 1);
  assert.equal(page.data.displayJourneys[0].slug, "legacy-journey");
});

test("journey page maps legacy route tags to the new route tag system and hides unmatched route types", async () => {
  const legacyPayload = {
    journeys: [
      {
        slug: "legacy-journey",
        name: "旧版旅程",
        creatorName: "野哉",
        tags: ["摄影创作", "慢旅行"],
        groupPeriods: [
          {
            dateStart: "2026-05-01",
            dateEnd: "2026-05-03",
            status: "available",
            price: 3999
          }
        ]
      }
    ],
    routeTypeOptions: [
      { label: "摄影创作", value: "摄影创作" },
      { label: "瑜伽疗愈", value: "瑜伽疗愈" }
    ],
    regionOptions: []
  };
  const page = createPageInstance({ journeyPayload: legacyPayload });

  await page.loadJourneyData();
  clearTimeout(page.measureFilterStackTimer);

  assert.deepEqual(page.allJourneys[0].routeTypes, ["研学", "文化"]);
  assert.deepEqual(
    page.data.visibleRouteTypeOptions.map((item) => item.value),
    ["研学", "文化"]
  );
});

test("journey page keeps region availability independent from transient calendar dates", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "qinghai-loop",
      destinationRegionCodes: ["cn_tibetan"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 3999
        }
      ]
    }),
    createJourney({
      slug: "nanjiang-dune",
      destinationRegionCodes: ["cn_xinjiang"],
      activePeriods: [
        {
          dateStart: "2026-06-01",
          status: "available",
          price: 4999
        }
      ]
    })
  ];
  page.regionOptions = [
    { label: "藏区", value: "cn_tibetan", image: "tibetan.jpg" },
    { label: "新疆", value: "cn_xinjiang", image: "xinjiang.jpg" }
  ];

  const options = page.buildVisibleRegionOptions({
    searchKeyword: "",
    routeType: "",
    destinationRegionCode: "",
    status: "all",
    departureDate: "2026-06-01"
  });

  assert.deepEqual(options, [
    {
      key: "cn_tibetan",
      value: "cn_tibetan",
      label: "藏区",
      image: "tibetan.jpg",
      count: 1,
      countText: "1 条旅程",
      available: true,
      selected: false
    },
    {
      key: "cn_xinjiang",
      value: "cn_xinjiang",
      label: "新疆",
      image: "xinjiang.jpg",
      count: 1,
      countText: "1 条旅程",
      available: true,
      selected: false
    }
  ]);
});

test("journey page shows a region-specific empty state when the selected region has no results", () => {
  const page = createPageInstance();

  const emptyState = page.buildEmptyState(
    {
      searchKeyword: "",
      routeType: "",
      destinationRegionCode: "cn_tibetan",
      status: "all",
      departureDate: "2026-06-01"
    },
    []
  );

  assert.deepEqual(emptyState, {
    emptyStateTitle: "藏区暂时没有可报名旅程",
    emptyStateDescPrimary: "先清空区域看看其他在架旅程，或换一个旅程类型、团期状态试试看。",
    emptyStateDescSecondary: "",
    showEmptyClearRegionAction: true
  });
});

test("journey page keeps the date sheet open while browsing different dates", () => {
  const page = createPageInstance();
  let appliedPatch = null;
  let closed = false;

  page.applyJourneyFilters = (patch) => {
    appliedPatch = patch;
  };
  page.closeDateSheet = () => {
    closed = true;
  };

  page.onCalendarDayTap({
    currentTarget: {
      dataset: {
        date: "2026-05-01"
      }
    }
  });

  assert.deepEqual(appliedPatch, {
    sheetSelectedDate: "2026-05-01",
    activeCalendarMonth: "2026-05"
  });
  assert.equal(closed, false);
});

test("journey page falls back to journey region codes when backend region options are missing", async () => {
  const page = createPageInstance({
    journeyPayload: {
      routeTypeOptions: [],
      regionOptions: [],
      journeys: [
        {
          slug: "qinghai-loop",
          name: "青海湖环线",
          creatorName: "领队A",
          routeTypes: [],
          destinationRegionCodes: ["cn_tibetan"],
          activePeriods: [
            {
              dateStart: "2026-05-01",
              status: "available",
              price: 3999
            }
          ]
        }
      ]
    }
  });
  page.queueMeasureFilterStack = () => {};

  await page.loadJourneyData();

  assert.deepEqual(page.regionOptions, [
    {
      label: "藏区",
      value: "cn_tibetan",
      image: ""
    }
  ]);
  assert.equal(page.data.visibleRegionOptions.length, 1);
  assert.equal(page.data.visibleRegionOptions[0].label, "藏区");
});

test("journey page clears transient calendar state when the sheet closes", () => {
  const page = createPageInstance();
  const originalSetTimeout = global.setTimeout;

  page.data.isDateSheetVisible = true;
  page.data.sheetSelectedDate = "2026-05-01";
  page.data.sheetSelectedDateLabel = "2026年5月1日";
  page.data.sheetJourneys = [{ slug: "qinghai-loop" }];

  global.setTimeout = (callback) => {
    callback();
    return 1;
  };

  try {
    page.closeDateSheet();
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.equal(page.data.isDateSheetVisible, false);
  assert.equal(page.data.sheetSelectedDate, "");
  assert.equal(page.data.sheetSelectedDateLabel, "");
  assert.deepEqual(page.data.sheetJourneys, []);
});

test("journey page resets a stale calendar month without auto-selecting a day", () => {
  const page = createPageInstance();
  page.data.activeCalendarMonth = "2026-04";
  page.data.sheetSelectedDate = "2026-04-16";
  page.allJourneys = [
    createJourney({
      slug: "qinghai-loop",
      destinationRegionCodes: ["cn_tibetan"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 3999
        },
        {
          dateStart: "2026-06-12",
          status: "available",
          price: 4299
        }
      ]
    })
  ];

  const state = page.buildDateSheetState({
    searchKeyword: "",
    routeType: "",
    destinationRegionCode: "cn_tibetan",
    status: "all",
    departureDate: ""
  });

  assert.equal(state.activeCalendarMonth, "2026-05");
  assert.equal(state.sheetSelectedDate, "");
  assert.deepEqual(state.calendarMonthKeys, ["2026-05", "2026-06"]);
});

test("journey page keeps region filtering persistent and closes the region sheet after selection", () => {
  const page = createPageInstance();
  let appliedPatch = null;
  let closed = false;

  page.data.visibleRegionOptions = [
    {
      key: "cn_tibetan",
      value: "cn_tibetan",
      label: "藏区",
      image: "tibetan.jpg",
      count: 1,
      countText: "1 条旅程",
      available: true,
      selected: false
    }
  ];
  page.applyJourneyFilters = (patch) => {
    appliedPatch = patch;
  };
  page.closeRegionSheet = () => {
    closed = true;
  };

  page.onRegionTap({
    currentTarget: {
      dataset: {
        region: "cn_tibetan"
      }
    }
  });

  assert.deepEqual(appliedPatch, {
    destinationRegionCode: "cn_tibetan"
  });
  assert.equal(closed, true);
});

test("journey page normalizes legacy destination region filters to the current region code", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "qinghai-loop",
      destinationRegionCodes: ["cn_great_northwest"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 3999
        }
      ]
    })
  ];
  page.regionOptions = [
    { label: "西北", value: "cn_great_northwest", image: "" }
  ];

  page.applyJourneyFilters({
    destinationRegionCode: "cn_northwest"
  });

  assert.equal(page.data.selectedDestinationRegionCode, "cn_great_northwest");
  assert.equal(page.data.selectedDestinationRegionLabel, "西北");
  assert.equal(page.data.resultCountText, "共 1 条符合条件的旅程");
  assert.equal(page.data.displayJourneys.length, 1);
});
