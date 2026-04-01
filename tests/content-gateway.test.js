const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/contentGateway/index.js"
);

function loadContentGatewayModule(options = {}) {
  const originalLoad = Module._load;
  const collections = options.collections || {};
  const runSQL =
    options.runSQL
    || (async () => ({
      data: {
        executeResultList: []
      }
    }));

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        database() {
          return {
            collection(name) {
              const data = collections[name] || {};
              return {
                skip() {
                  return this;
                },
                limit() {
                  return this;
                },
                get: async () => ({ data: Array.isArray(data.list) ? data.list : [] }),
                where(query) {
                  return {
                    limit() {
                      return this;
                    },
                    get: async () => {
                      const rows = Array.isArray(data.bySlug) && query && query.slug
                        ? data.bySlug.filter((item) => item && item.slug === query.slug)
                        : [];
                      return { data: rows };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }

    if (request === "@cloudbase/node-sdk") {
      return {
        init() {
          return {
            models: {
              $runSQL: runSQL
            }
          };
        }
      };
    }

    if (request === "./image-ref") {
      return {
        normalizeCreatorAssetFields: (value) => value,
        normalizeDestinationAssetFields: (value) => value,
        normalizeHeroSlides: (value) => value,
        normalizeIdeaAssetFields: (value) => value,
        normalizeServiceAssetFields: (value) => value
      };
    }

    if (request === "./destination-regions") {
      return {
        DESTINATION_REGION_OPTIONS: [],
        normalizeDestinationRegionCode: (value) => value || "",
        resolveDestinationRegionCode: (value) => value || "",
        getDestinationRegionLabel: () => ""
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[gatewayModulePath];

  try {
    return require(gatewayModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test("contentGateway hides inactive idea detail even if cached list still contains it", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ slug: "author-a", name: "作者A", id: "creator-1" }]
      },
      destinations: {
        list: [{ slug: "qiandongnan", name: "黔东南" }]
      },
      services: {
        list: [{ slug: "dummy-service", name: "示例路线", destinationSlugs: ["qiandongnan"] }]
      },
      ideas: {
        list: [
          {
            slug: "miao-dusk",
            title: "我把黔东南的黄昏一步步抹开",
            status: "active",
            authorId: "author-a",
            body: "旧缓存正文"
          }
        ],
        bySlug: [
          {
            slug: "miao-dusk",
            title: "我把黔东南的黄昏一步步抹开",
            status: "inactive",
            authorId: "author-a",
            body: "已下架正文"
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getIdeaDetailData",
    payload: { slug: "miao-dusk" }
  });

  assert.deepEqual(result, { ok: true, data: null });
});

test("contentGateway returns active idea detail from direct slug lookup", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ slug: "author-b", name: "作者B", id: "creator-2" }]
      },
      destinations: {
        list: [{ slug: "harbor-city", name: "港城" }]
      },
      services: {
        list: [{ slug: "dummy-service", name: "示例路线", destinationSlugs: ["harbor-city"] }]
      },
      ideas: {
        list: [
          {
            slug: "seed-idea",
            title: "种子文章",
            status: "active",
            authorId: "author-b",
            body: "种子正文"
          }
        ],
        bySlug: [
          {
            slug: "harbor-notes",
            title: "港口笔记",
            status: "active",
            authorId: "author-b",
            body: "第一段\n\n第二段"
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getIdeaDetailData",
    payload: { slug: "harbor-notes" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.idea.slug, "harbor-notes");
  assert.equal(result.data.idea.title, "港口笔记");
});

test("contentGateway falls back to legacy NoSQL groupPeriods when SQL periods are empty", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "author-a", name: "作者A" }]
      },
      destinations: {
        list: [{ slug: "qiandongnan", name: "黔东南" }]
      },
      services: {
        list: [
          {
            id: "service-1",
            slug: "miao-night-walk",
            name: "苗寨夜行",
            creatorId: "creator-1",
            destinationSlugs: ["qiandongnan"],
            type: "短途旅行",
            groupPeriods: [
              {
                periodCode: "MIAO-20260426",
                dateStart: "2026-04-26",
                dateEnd: "2026-04-29",
                price: 4280,
                status: "available"
              }
            ]
          }
        ]
      },
      ideas: {
        list: [
          {
            slug: "miao-story",
            title: "苗乡故事",
            status: "active",
            authorId: "author-a",
            body: "正文"
          }
        ]
      }
    },
    runSQL: async () => ({
      data: {
        executeResultList: []
      }
    })
  });

  const result = await gateway.main({
    action: "getHomePageData",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.featuredServicesByTab.featured[0].priceLabel, "¥4280 起");
  assert.equal(result.data.featuredServicesByTab.featured[0].durationTag, "4天");
});
