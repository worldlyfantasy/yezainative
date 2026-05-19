const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const creatorsPageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pages/creators/index.js"
);
const creatorDetailPageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/explore/creator-detail/index.js"
);
const creatorDetailWxmlPath = path.resolve(
  __dirname,
  "../miniprogram/pkg/explore/creator-detail/index.wxml"
);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWxMock() {
  return {
    getStorageSync() {
      return "";
    },
    setStorageSync() {},
    showToast() {},
    navigateTo() {}
  };
}

function loadPageDefinition(modulePath, loader) {
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

  delete require.cache[modulePath];

  try {
    require(modulePath);
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

test("creators page keeps full tags for filtering and only exposes three display tags per creator", async () => {
  const definition = loadPageDefinition(creatorsPageModulePath, (request, parent, isMain, originalLoad) => {
    if (request === "../../repositories/content-repository") {
      return {
        getCreatorsPageData: async () => ({
          regionOptions: [{ label: "全部", value: "" }, { label: "藏区", value: "cn_tibetan", count: 2, image: "" }],
          regionLabels: ["全部"],
          styleOptions: [{ label: "全部", value: "" }, { label: "山野", value: "山野" }],
          styleLabels: ["全部", "山野"],
          creators: [
            {
              id: "creator-a",
              slug: "a",
              name: "阿野",
              avatar: "avatar-a.jpg",
              cardCover: "cover-a.jpg",
              locationText: "藏区・青海湖",
              stance: "和地方一起走路",
              tags: ["山野", "户外", "文化", "研学"]
            }
          ]
        })
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
  });

  const page = createPageInstance(definition);
  await page.onLoad({});

  assert.deepEqual(page.data.creators[0].tags, ["山野", "户外", "文化", "研学"]);
  assert.equal(page.data.creators[0].cardCover, "cover-a.jpg");
  assert.equal(page.data.creators[0].locationText, "藏区・青海湖");
  assert.deepEqual(page.data.creators[0].displayTags, ["山野", "户外", "文化"]);
  assert.deepEqual(page.data.creators[0].gridDisplayTags, ["山野", "户外"]);
  assert.equal(page.data.visibleStyleOptions.length, 9);
  assert.deepEqual(page.data.visibleStyleOptions.slice(0, 2).map((item) => item.value), ["山野", "城市"]);
  assert.equal(page.data.regionSheetColumns[0][0].countText, "2 位创作者");
});

test("creators page splits region sheet between domestic and international tabs", async () => {
  const definition = loadPageDefinition(creatorsPageModulePath, (request, parent, isMain, originalLoad) => {
    if (request === "../../repositories/content-repository") {
      return {
        getCreatorsPageData: async () => ({
          regionOptions: [
            { label: "全部", value: "" },
            { label: "藏区", value: "cn_tibetan", count: 2, image: "" },
            { label: "新疆", value: "cn_xinjiang", count: 1, image: "" },
            { label: "西北", value: "cn_great_northwest", count: 1, image: "" },
            { label: "欧洲", value: "intl_europe", count: 1, image: "" }
          ],
          regionLabels: ["全部", "藏区", "欧洲"],
          styleOptions: [],
          styleLabels: [],
          creators: []
        })
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
  });
  const page = createPageInstance(definition);

  await page.onLoad({});

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

test("creator detail page limits visible creator tags to three", async () => {
  const definition = loadPageDefinition(creatorDetailPageModulePath, (request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getCreatorDetailData: async () => ({
          creator: {
            slug: "a",
            name: "阿野",
            avatar: "",
            stance: "和地方一起走路",
            tags: ["山野", "户外", "文化", "研学"],
            about: [],
            reviews: []
          },
          relatedServices: [],
          creatorIdeas: []
        })
      };
    }

    if (request === "../../../repositories/transaction-repository") {
      return {
        isFavorited: async () => false,
        toggleFavorite: async () => false
      };
    }

    if (request === "../../../services/navigation") {
      return {
        goTopLevel() {},
        TOP_LEVEL_ROUTES: {
          creators: "/pages/creators/index"
        }
      };
    }

    if (request === "../../../services/idea-navigation") {
      return {
        openIdea() {}
      };
    }

    if (request === "../../../services/user") {
      return {
        getCurrentUser: async () => null
      };
    }

    if (request === "../utils/favorite-notice") {
      return {
        clearFavoriteNotice() {},
        showFavoriteNotice() {}
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

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  await page.onLoad({ slug: "a" });

  assert.deepEqual(page.data.creator.displayTags, ["山野", "户外", "文化"]);
});

test("creator detail page hides feedback section data when reviews have no content", async () => {
  const definition = loadPageDefinition(creatorDetailPageModulePath, (request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getCreatorDetailData: async () => ({
          creator: {
            slug: "a",
            name: "阿野",
            avatar: "",
            stance: "和地方一起走路",
            tags: ["山野", "户外", "文化", "研学"],
            about: [],
            reviews: [
              {
                content: "   ",
                audience: "旧旅人"
              },
              {
                content: "",
                audience: "新旅人"
              }
            ]
          },
          relatedServices: [],
          creatorIdeas: []
        })
      };
    }

    if (request === "../../../repositories/transaction-repository") {
      return {
        isFavorited: async () => false,
        toggleFavorite: async () => false
      };
    }

    if (request === "../../../services/navigation") {
      return {
        goTopLevel() {},
        TOP_LEVEL_ROUTES: {
          creators: "/pages/creators/index"
        }
      };
    }

    if (request === "../../../services/idea-navigation") {
      return {
        openIdea() {}
      };
    }

    if (request === "../../../services/user") {
      return {
        getCurrentUser: async () => null
      };
    }

    if (request === "../utils/favorite-notice") {
      return {
        clearFavoriteNotice() {},
        showFavoriteNotice() {}
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

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  await page.onLoad({ slug: "a" });

  assert.deepEqual(page.data.creator.reviews, []);
  assert.equal(page.data.creator.hasVisibleReviews, false);
});

test("creator detail feedback section is conditionally rendered", () => {
  const wxml = fs.readFileSync(creatorDetailWxmlPath, "utf8");

  assert.match(wxml, /<view wx:if="\{\{creator\.hasVisibleReviews\}\}" class="section-block creator-feedback">/);
});
