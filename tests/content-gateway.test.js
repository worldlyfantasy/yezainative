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
                field() {
                  return this;
                },
                skip() {
                  return this;
                },
                limit() {
                  return this;
                },
                get: async () => ({ data: Array.isArray(data.list) ? data.list : [] }),
                where(query) {
                  return {
                    field() {
                      return this;
                    },
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
            destinationSlugs: ["harbor-city"],
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
  assert.equal(result.data.idea.sourceType, "mini");
  assert.deepEqual(result.data.relatedDestinations.map((item) => item.slug), ["harbor-city"]);
});

test("contentGateway exposes hybrid idea detail fields for导读 and external article link", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ slug: "author-c", name: "作者C", id: "creator-3" }]
      },
      destinations: {
        list: [{ slug: "wuyi-ancient", name: "武夷古道" }]
      },
      services: {
        list: [{ slug: "dummy-service", name: "示例路线", destinationSlugs: ["wuyi-ancient"] }]
      },
      ideas: {
        list: [
          {
            slug: "seed-idea",
            title: "种子故事",
            status: "active",
            authorId: "creator-3",
            body: "种子正文"
          }
        ],
        bySlug: [
          {
            slug: "wuyi-writing",
            title: "在武夷古道写一封给自己的信",
            status: "active",
            authorId: "creator-3",
            sourceType: "hybrid",
            excerptBody: "这是小程序导读。",
            wechatArticleUrl: "https://mp.weixin.qq.com/s/example",
            readMoreText: "阅读全文",
            destinationSlugs: ["wuyi-ancient"],
            body: "归档正文"
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getIdeaDetailData",
    payload: { slug: "wuyi-writing" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.idea.sourceType, "hybrid");
  assert.equal(result.data.idea.excerptBody, "这是小程序导读。");
  assert.equal(result.data.idea.wechatArticleUrl, "https://mp.weixin.qq.com/s/example");
  assert.equal(result.data.idea.readMoreText, "阅读全文");
  assert.deepEqual(result.data.relatedDestinations.map((item) => item.name), ["武夷古道"]);
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

test("contentGateway filters creator regions by existing routes and sorts region results by active departure date", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [
          { id: "creator-a", slug: "a", name: "阿野", tags: ["自然野行"] },
          { id: "creator-b", slug: "b", name: "北原", tags: ["自然野行"] },
          { id: "creator-c", slug: "c", name: "藏川", tags: ["自然野行"] },
          { id: "creator-d", slug: "d", name: "大漠", tags: ["自然野行"] }
        ]
      },
      destinations: {
        list: [
          { slug: "nanjiang-dune", name: "南疆", regionCode: "cn_xinjiang" },
          { slug: "qinghai-lake", name: "青海湖", regionCode: "cn_tibetan" }
        ]
      },
      services: {
        list: [
          { slug: "xj-near", name: "南疆近线", creatorId: "creator-a", destinationSlugs: ["nanjiang-dune"] },
          { slug: "xj-soldout", name: "南疆满位线", creatorId: "creator-b", destinationSlugs: ["nanjiang-dune"] },
          { slug: "tibet-route", name: "藏区路线", creatorId: "creator-c", destinationSlugs: ["qinghai-lake"] },
          { slug: "xj-far", name: "南疆远线", creatorId: "creator-d", destinationSlugs: ["nanjiang-dune"] }
        ]
      },
      ideas: {
        list: [
          { slug: "seed-idea", title: "种子故事", status: "active", authorId: "creator-a", body: "正文" }
        ]
      }
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "xj-near",
                periodCode: "XJ-NEAR",
                dateStart: "2099-05-01",
                dateEnd: "2099-05-05",
                price: 4999,
                minGroup: 5,
                remainingSeats: 8,
                status: "available"
              },
              {
                serviceSlug: "xj-soldout",
                periodCode: "XJ-SOLDOUT",
                dateStart: "2099-04-15",
                dateEnd: "2099-04-19",
                price: 4999,
                minGroup: 5,
                remainingSeats: 0,
                status: "available"
              },
              {
                serviceSlug: "tibet-route",
                periodCode: "TB-SOLDOUT",
                dateStart: "2099-07-01",
                dateEnd: "2099-07-05",
                price: 6999,
                minGroup: 5,
                remainingSeats: 0,
                status: "available"
              },
              {
                serviceSlug: "xj-far",
                periodCode: "XJ-FAR",
                dateStart: "2099-06-01",
                dateEnd: "2099-06-05",
                price: 5999,
                minGroup: 5,
                remainingSeats: 6,
                status: "available"
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              { servicePeriodCode: "XJ-SOLDOUT", soldCount: 10 },
              { servicePeriodCode: "TB-SOLDOUT", soldCount: 10 }
            ]
          }
        };
      }

      return {
        data: {
          executeResultList: []
        }
      };
    }
  });

  const result = await gateway.main({
    action: "getCreatorsPageData",
    payload: {
      filters: {
        style: "自然野行",
        regionCode: "cn_xinjiang"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.regionLabels, ["全部", "藏区", "新疆"]);
  assert.deepEqual(result.data.creators.map((item) => item.slug), ["a", "d", "b"]);
});
