const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const serviceDetailPageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/explore/service-detail/index.js"
);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWxMock() {
  return {
    createSelectorQuery() {
      return {
        selectViewport() {
          return this;
        },
        scrollOffset() {
          return this;
        },
        select() {
          return this;
        },
        boundingClientRect() {
          return this;
        },
        exec(callback) {
          if (typeof callback === "function") {
            callback([]);
          }
        }
      };
    },
    showToast() {},
    navigateTo() {}
  };
}

function loadPageDefinition(loader) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  const originalWx = global.wx;
  let capturedDefinition = null;

  global.wx = createWxMock();
  global.Page = function registerPage(definition) {
    capturedDefinition = definition;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    return loader(request, parent, isMain, originalLoad);
  };

  delete require.cache[serviceDetailPageModulePath];

  try {
    require(serviceDetailPageModulePath);
  } finally {
    Module._load = originalLoad;
    if (originalPage === undefined) {
      delete global.Page;
    } else {
      global.Page = originalPage;
    }

    if (originalWx === undefined) {
      delete global.wx;
    } else {
      global.wx = originalWx;
    }
  }

  return capturedDefinition;
}

function createPageInstance(definition) {
  const instance = {
    data: cloneData(definition.data),
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

test("service detail prefers creatorMessage over overview and summary", async () => {
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceDetailSummaryData: async () => ({
          service: {
            slug: "ridge-journal",
            name: "高原谷地徒步手帐",
            type: "长途旅行",
            summary: "这是摘要文案",
            creatorMessage: "这是创作者的话",
            creatorRoles: ["创作者", "带领者"],
            tags: ["户外"]
          },
          creator: {
            slug: "linyue",
            name: "林越",
            avatar: ""
          },
          relatedDestinations: [],
          heroCover: "",
          photoGallery: [],
          photoTotal: 0
        }),
        getServiceDetailContentData: async () => ({
          travelDetail: {
            sections: [],
            overview: {
              whyJoinText: "这是概况区首段，不应该覆盖创作者的话。"
            },
            itinerary: {
              days: []
            },
            costs: {
              include: [],
              exclude: [],
              refundRules: []
            },
            notices: []
          },
          groupPeriods: []
        }),
        getServiceGalleryData: async () => null,
        getServiceGalleryOriginalData: async () => null
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getServiceDetailPageConfig: async () => ({
          consultWeChatQr: "",
          consultSheetTitle: "",
          consultCardLabel: "",
          consultCardDesc: "",
          consultFollowupNote: "",
          suitableTitleText: "",
          timelineTitleText: "",
          refundTitleText: "",
          serviceNoticeTitle: "",
          serviceNoticeBody: ""
        })
      };
    }

    if (request === "../../../repositories/transaction-repository") {
      return {
        isFavorited: async () => false,
        toggleFavorite: async () => false
      };
    }

    if (request === "../../../services/user") {
      return {
        getCurrentUser: async () => null
      };
    }

    if (request === "../../../services/navigation") {
      return {
        goTopLevel() {},
        setPendingJourneyFilter() {},
        TOP_LEVEL_ROUTES: {
          journeys: "/pages/destinations/index"
        }
      };
    }

    if (request === "../utils/favorite-notice") {
      return {
        clearFavoriteNotice() {},
        showFavoriteNotice() {}
      };
    }

    if (request === "../../../utils/audit") {
      return {
        isAuditMode() {
          return false;
        },
        pickAuditText(primary) {
          return primary;
        }
      };
    }

    if (request === "../period-seat") {
      return {
        getExceededOrderPeopleLimitMessage() {
          return "";
        },
        getInsufficientSeatsMessage() {
          return "";
        },
        getOrderPeopleLimitMessage() {
          return "";
        },
        hasEnoughSeats() {
          return true;
        },
        normalizeOrderPeopleCount(value) {
          return Number(value) || 1;
        }
      };
    }

    if (request === "./version-state") {
      return {
        normalizeVersionName(value) {
          return value || "";
        },
        resolveItineraryVersionState(travelDetail) {
          return {
            itineraryVersions: [],
            activeItineraryVersionKey: "",
            activeItineraryVersionName: "",
            displayItinerary: travelDetail && travelDetail.itinerary ? travelDetail.itinerary : null
          };
        }
      };
    }

    if (request === "./duration-state") {
      return {
        calcDurationLabel() {
          return "行程待确认";
        }
      };
    }

    if (request === "../../../utils/share") {
      return {
        enablePageShareMenus() {},
        createShareAppMessage() {
          return {};
        },
        createShareTimeline() {
          return {};
        }
      };
    }

    if (request === "../../../constants/journey") {
      return {
        normalizeRouteTypeLabel(value) {
          return value;
        }
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  await page.onLoad({ slug: "ridge-journal" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(page.data.creatorQuoteText, "这是创作者的话");
});
