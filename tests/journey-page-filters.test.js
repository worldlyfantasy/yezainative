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
    type: options.type || "",
    routeTypes: options.routeTypes || [],
    durationTag: options.durationTag || "",
    priceLabel: options.priceLabel || "",
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

test("journey page sorts journey cards by departure date before confirmed status", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "confirmed-later",
      activePeriods: [
        {
          dateStart: "2026-05-21",
          status: "confirmed",
          price: 4280
        }
      ]
    }),
    createJourney({
      slug: "available-sooner",
      activePeriods: [
        {
          dateStart: "2026-05-20",
          status: "available",
          price: 3980
        }
      ]
    })
  ];

  page.applyJourneyFilters({
    status: "all"
  });

  assert.deepEqual(
    page.data.displayJourneys.map((item) => item.slug),
    ["available-sooner", "confirmed-later"]
  );
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

test("journey page shows only supported result route type chips with matched journeys", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "domestic-long",
      type: "长途旅行",
      routeTypes: ["文化"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 3999
        }
      ]
    }),
    createJourney({
      slug: "domestic-short",
      type: "短途旅行",
      routeTypes: ["户外"],
      activePeriods: [
        {
          dateStart: "2026-05-02",
          status: "available",
          price: 1299
        }
      ]
    }),
    createJourney({
      slug: "city-event",
      type: "在地体验",
      routeTypes: ["城市"],
      activePeriods: [
        {
          dateStart: "2026-05-03",
          status: "confirmed",
          price: 299
        }
      ]
    }),
    createJourney({
      slug: "old-tag",
      type: "定制规划",
      routeTypes: ["文化"],
      activePeriods: [
        {
          dateStart: "2026-05-04",
          status: "available",
          price: 1999
        }
      ]
    })
  ].map((journey) => page.normalizeJourney(journey));
  page.routeTypeOrder = page.buildRouteTypeOrder([], page.allJourneys);

  page.applyJourneyFilters({
    status: "all"
  });

  assert.deepEqual(
    page.data.resultRouteTypeOptions.map((item) => item.value),
    ["长途", "短途", "城市"]
  );
  assert.deepEqual(
    page.data.primaryResultRouteTypeOptions.map((item) => item.value),
    ["长途", "短途"]
  );
  assert.deepEqual(
    page.data.secondaryResultRouteTypeOptions.map((item) => item.value),
    ["城市"]
  );

  page.applyJourneyFilters({
    routeType: "文化",
    status: "all"
  });

  assert.equal(page.data.statusOptions.find((item) => item.key === "all").active, true);

  page.applyJourneyFilters({
    journeyType: "长途"
  });

  assert.equal(page.data.statusOptions.find((item) => item.key === "all").active, false);
  assert.equal(page.data.resultRouteTypeOptions.find((item) => item.value === "长途").selected, true);
  assert.equal(page.data.visibleRouteTypeOptions.find((item) => item.value === "文化").available, true);
  assert.equal(page.data.visibleRouteTypeOptions.find((item) => item.value === "城市").available, false);

  page.applyJourneyFilters({
    journeyType: "",
    status: "confirmed"
  });

  assert.equal(page.data.statusOptions.find((item) => item.key === "all").active, true);
  assert.equal(page.data.selectedFilterChips.find((item) => item.key === "status").label, "已成行");
});

test("journey page hides absent primary result route type tabs", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "domestic-long",
      type: "长途旅行",
      routeTypes: ["山野"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 3999
        }
      ]
    }),
    createJourney({
      slug: "city-event",
      type: "在地体验",
      routeTypes: ["城市"],
      activePeriods: [
        {
          dateStart: "2026-05-02",
          status: "available",
          price: 299
        }
      ]
    })
  ].map((journey) => page.normalizeJourney(journey));
  page.routeTypeOrder = page.buildRouteTypeOrder([], page.allJourneys);

  page.applyJourneyFilters({
    status: "all"
  });

  assert.deepEqual(
    page.data.resultRouteTypeOptions.map((item) => item.value),
    ["长途", "城市"]
  );
  assert.deepEqual(
    page.data.primaryResultRouteTypeOptions.map((item) => item.value),
    ["长途"]
  );
  assert.deepEqual(
    page.data.secondaryResultRouteTypeOptions.map((item) => item.value),
    ["城市"]
  );
});

test("journey page clears journey type filters when tapping the all tab", () => {
  const page = createPageInstance();
  let appliedPatch = null;

  page.data.selectedRouteType = "文化";
  page.data.selectedJourneyType = "长途";
  page.data.selectedStatus = "all";
  page.applyJourneyFilters = (patch) => {
    appliedPatch = patch;
  };

  page.onStatusTap({
    currentTarget: {
      dataset: {
        status: "all"
      }
    }
  });

  assert.deepEqual(appliedPatch, {
    journeyType: "",
    status: "all"
  });
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

test("journey page splits region sheet between domestic and international tabs", () => {
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
          dateStart: "2026-05-01",
          status: "available",
          price: 4999
        }
      ]
    }),
    createJourney({
      slug: "northwest-road",
      destinationRegionCodes: ["cn_great_northwest"],
      activePeriods: [
        {
          dateStart: "2026-05-01",
          status: "available",
          price: 5999
        }
      ]
    }),
    createJourney({
      slug: "europe-field-note",
      destinationRegionCodes: ["intl_europe"],
      activePeriods: [
        {
          dateStart: "2026-06-01",
          status: "available",
          price: 12999
        }
      ]
    })
  ];
  page.regionOptions = [
    { label: "藏区", value: "cn_tibetan", image: "tibetan.jpg" },
    { label: "新疆", value: "cn_xinjiang", image: "xinjiang.jpg" },
    { label: "西北", value: "cn_great_northwest", image: "northwest.jpg" },
    { label: "欧洲", value: "intl_europe", image: "europe.jpg" }
  ];

  page.applyJourneyFilters();

  assert.equal(page.data.activeRegionScope, "domestic");
  assert.deepEqual(page.data.regionSheetColumns.map((column) => column.length), [2, 1]);
  assert.deepEqual(page.data.regionSheetColumns.flat().map((item) => item.value), ["cn_tibetan", "cn_xinjiang", "cn_great_northwest"]);

  page.onRegionScopeTabTap({
    currentTarget: {
      dataset: {
        scope: "international"
      }
    }
  });

  assert.equal(page.data.activeRegionScope, "international");
  assert.deepEqual(page.data.regionSheetColumns.flat().map((item) => item.value), ["intl_europe"]);
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

test("journey page ignores unavailable route type taps", () => {
  const page = createPageInstance();
  let appliedPatch = null;

  page.data.selectedRouteType = "";
  page.data.visibleRouteTypeOptions = [
    {
      key: "户外",
      value: "户外",
      label: "户外",
      available: false,
      selected: false
    }
  ];
  page.applyJourneyFilters = (patch) => {
    appliedPatch = patch;
  };

  page.onRouteTypeTap({
    currentTarget: {
      dataset: {
        value: "户外"
      }
    }
  });

  assert.equal(appliedPatch, null);
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
  assert.equal(page.data.displayJourneys.length, 1);
});

test("journey page displays list prices from period price instead of raw service price labels", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "rainforest-dawn",
      priceLabel: "¥3980 / 5天",
      activePeriods: [
        {
          dateStart: "2026-05-10",
          status: "confirmed",
          price: 3980
        }
      ]
    })
  ];

  page.applyJourneyFilters();

  assert.equal(page.data.displayJourneys.length, 1);
  assert.equal(page.data.displayJourneys[0].priceText, "¥3980 起");
});

test("journey page decorates cards with duration labels from period data", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "rainforest-dawn",
      activePeriods: [
        {
          dateStart: "2026-05-10",
          dateEnd: "2026-05-14",
          status: "available",
          price: 3980
        }
      ]
    })
  ];

  page.applyJourneyFilters();

  assert.equal(page.data.displayJourneys.length, 1);
  assert.equal(page.data.displayJourneys[0].displayDurationLabel, "5天");
});

test("journey page only shows the confirmed tag for confirmed bookable periods", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "rainforest-dawn",
      activePeriods: [
        {
          dateStart: "2026-05-10",
          status: "confirmed",
          statusText: "确定成行",
          price: 3980
        }
      ]
    })
  ];

  page.applyJourneyFilters();

  assert.deepEqual(
    page.data.displayJourneys[0].displayStatusTags.map((item) => item.label),
    ["确定成行"]
  );
});

test("journey page hides the available tag for available periods", () => {
  const page = createPageInstance();
  page.allJourneys = [
    createJourney({
      slug: "rainforest-dawn",
      activePeriods: [
        {
          dateStart: "2026-05-10",
          status: "available",
          statusText: "可报名",
          price: 3980
        }
      ]
    })
  ];

  page.applyJourneyFilters();

  assert.deepEqual(page.data.displayJourneys[0].displayStatusTags, []);
  assert.equal(page.data.displayJourneys[0].displayStatusText, "");
});

test("journey page builds stable two-column data for masonry journey cards", () => {
  const page = createPageInstance();
  const journeys = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));

  assert.deepEqual(
    page.buildJourneyColumns(journeys),
    [
      { key: "left", items: [{ slug: "a" }, { slug: "c" }, { slug: "e" }] },
      { key: "right", items: [{ slug: "b" }, { slug: "d" }] }
    ]
  );
});

test("journey page toggles image-mode summary expansion by journey slug", () => {
  const page = createPageInstance();
  page.data.displayJourneys = [
    { slug: "a", summaryExpanded: false },
    { slug: "b", summaryExpanded: false }
  ];

  page.onJourneySummaryToggle({
    detail: {
      slug: "a",
      expanded: true
    }
  });

  assert.equal(page.data.displayJourneys[0].summaryExpanded, true);
  assert.equal(page.data.displayJourneys[1].summaryExpanded, false);
  assert.deepEqual(page.data.displayJourneyColumns[0].items, [
    { slug: "a", summaryExpanded: true }
  ]);
});
