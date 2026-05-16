const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const RealDate = Date;
const FIXED_NOW = new RealDate("2026-03-01T00:00:00.000Z");

global.Date = class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length) {
      super(...args);
      return;
    }

    super(FIXED_NOW.getTime());
  }

  static now() {
    return FIXED_NOW.getTime();
  }
};

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
      const command = {
        in(values) {
          return {
            __op: "in",
            values: Array.isArray(values) ? values : []
          };
        }
      };

      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        database() {
          return {
            command,
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
                        : (Array.isArray(data.list)
                          ? data.list.filter((item) => (
                            item
                            && Object.keys(query || {}).every((key) => {
                              const expected = query[key];
                              if (expected && typeof expected === "object" && expected.__op === "in") {
                                return expected.values.includes(item[key]);
                              }
                              return item[key] === expected;
                            })
                          ))
                          : []);
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
        normalizeImageRef: (value) => {
          if (typeof value === "string") {
            return value;
          }

          if (value && typeof value === "object") {
            return value.original || value.detail || value.card || value.image || "";
          }

          return "";
        },
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

test("contentGateway service booking sold count excludes unpaid pending orders", async () => {
  const sqlCalls = [];
  const gateway = loadContentGatewayModule({
    collections: {
      services: {
        bySlug: [
          {
            slug: "route-a",
            name: "测试路线",
            status: "active",
            destinationSlugs: []
          }
        ]
      }
    },
    runSQL: async (sql) => {
      sqlCalls.push(String(sql));

      if (String(sql).includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "route-a",
                periodCode: "P1",
                dateStart: "2099-04-01",
                dateEnd: "2099-04-02",
                price: 100,
                minGroup: 1,
                remainingSeats: 4,
                status: "available"
              }
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
    action: "getServiceBookingData",
    payload: {
      slug: "route-a"
    }
  });

  assert.equal(result.ok, true);
  const soldCountSql = sqlCalls.find((sql) => sql.includes("FROM `TravelOrder`"));
  assert.ok(soldCountSql);
  assert.match(soldCountSql, /IN \('paid', 'traveling', 'completed'\)/);
  assert.doesNotMatch(soldCountSql, /<> 'canceled'/);
});

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
        list: [{ slug: "harbor-city", name: "港城", regionCode: "cn_jiang_zhe_hu" }]
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
  assert.deepEqual(result.data.relatedDestinations, []);
  assert.deepEqual(result.data.relatedRegions.map((item) => item.label), ["江浙沪"]);
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
            regionCodes: ["cn_jiang_zhe_hu"],
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
  assert.deepEqual(result.data.relatedDestinations, []);
  assert.deepEqual(result.data.relatedRegions.map((item) => item.label), ["江浙沪"]);
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

test("contentGateway separates regular and custom service groups", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "guide-a", name: "领队A" }]
      },
      destinations: {
        list: [{ slug: "qinghai-lake", name: "青海湖畔", regionCode: "cn_tibetan" }]
      },
      services: {
        list: [
          {
            id: "service-regular",
            slug: "regular-loop",
            name: "常规环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            groupType: "regular",
            tags: ["山野"],
            groupPeriods: [
              {
                periodCode: "REG-20260501",
                dateStart: "2026-05-01",
                dateEnd: "2026-05-05",
                price: 3980,
                status: "available"
              }
            ]
          },
          {
            id: "service-custom",
            slug: "custom-loop",
            name: "定制环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            groupType: "custom",
            tags: ["山野"]
          },
          {
            id: "service-custom-period",
            slug: "custom-period-loop",
            name: "有团期定制环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            groupType: "custom",
            tags: ["山野"],
            groupPeriods: [
              {
                periodCode: "CUS-20260515",
                dateStart: "2026-05-15",
                dateEnd: "2026-05-19",
                price: 4980,
                status: "available"
              }
            ]
          },
          {
            id: "service-custom-expired",
            slug: "custom-expired-loop",
            name: "已过期定制环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            groupType: "custom",
            tags: ["山野"],
            groupPeriods: [
              {
                periodCode: "CUS-20260215",
                dateStart: "2026-02-15",
                dateEnd: "2026-02-19",
                price: 4980,
                status: "available"
              }
            ]
          },
          {
            id: "service-regular-expired",
            slug: "regular-expired-loop",
            name: "已过期常规环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            groupType: "regular",
            tags: ["山野"],
            groupPeriods: [
              {
                periodCode: "REG-20260215",
                dateStart: "2026-02-15",
                dateEnd: "2026-02-19",
                price: 3980,
                status: "available"
              }
            ]
          },
          {
            id: "service-legacy",
            slug: "legacy-loop",
            name: "旧数据环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            tags: ["户外"],
            groupPeriods: [
              {
                periodCode: "LEG-20260501",
                dateStart: "2026-06-01",
                dateEnd: "2026-06-05",
                price: 4280,
                status: "available"
              }
            ]
          }
        ]
      },
      app_configs: {
        list: [
          {
            key: "customJourneyPage",
            value: {
              exampleServiceSlugs: ["custom-loop", "custom-expired-loop", "custom-period-loop"]
            }
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

  const [regularResult, customResult] = await Promise.all([
    gateway.main({
      action: "getJourneyPageData",
      payload: {}
    }),
    gateway.main({
      action: "getCustomJourneyPageData",
      payload: {}
    })
  ]);

  assert.equal(regularResult.ok, true);
  assert.deepEqual(regularResult.data.journeys.map((item) => item.slug), ["regular-loop", "custom-period-loop", "legacy-loop"]);
  assert.equal(customResult.ok, true);
  assert.deepEqual(customResult.data.journeys.map((item) => item.slug), ["custom-loop", "custom-expired-loop", "custom-period-loop"]);
  assert.equal(customResult.data.journeys[0].displayStatusText, "支持定制");
});

test("contentGateway includes single room fields in booking periods", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "author-a", name: "作者A" }]
      },
      services: {
        list: [
          {
            id: "service-1",
            slug: "miao-night-walk",
            name: "苗寨夜行",
            creatorId: "creator-1",
            type: "短途旅行",
            groupPeriods: []
          }
        ]
      }
    },
    runSQL: async (sql) => {
      if (String(sql).includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                periodCode: "MIAO-20260426",
                dateStart: "2026-04-26",
                dateEnd: "2026-04-29",
                price: 4280,
                remainingSeats: 8,
                minGroup: 1,
                status: "available",
                singleRoomEnabled: 1,
                singleRoomPriceDec: "600.00",
                singleRoomNotice: "房态有限，需人工确认"
              }
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
    action: "getServiceBookingData",
    payload: { slug: "miao-night-walk" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.groupPeriods[0].singleRoomEnabled, true);
  assert.equal(result.data.groupPeriods[0].singleRoomPrice, 600);
  assert.equal(result.data.groupPeriods[0].singleRoomNotice, "房态有限，需人工确认");
});

test("contentGateway filters creator regions by existing routes and sorts region results by active departure date", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [
          { id: "creator-a", slug: "a", name: "阿野", tags: [] },
          { id: "creator-b", slug: "b", name: "北原", tags: [] },
          { id: "creator-c", slug: "c", name: "藏川", tags: [] },
          { id: "creator-d", slug: "d", name: "大漠", tags: [] }
        ]
      },
      destinations: {
        list: [
          { slug: "nanjiang-dune", name: "南疆", regionCode: "cn_xinjiang", cover: "xinjiang-cover" },
          { slug: "qinghai-lake", name: "青海湖", regionCode: "cn_tibetan", cover: "tibetan-cover" }
        ]
      },
      services: {
        list: [
          { slug: "xj-near", name: "南疆近线", creatorId: "creator-a", destinationSlugs: ["nanjiang-dune"], tags: ["山野"], cover: "xj-near-cover" },
          { slug: "xj-soldout", name: "南疆满位线", creatorId: "creator-b", destinationSlugs: ["nanjiang-dune"], tags: ["山野"] },
          { slug: "tibet-route", name: "藏区路线", creatorId: "creator-c", destinationSlugs: ["qinghai-lake"], tags: ["文化"] },
          { slug: "xj-far", name: "南疆远线", creatorId: "creator-d", destinationSlugs: ["nanjiang-dune"], tags: ["山野"] }
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
        style: "山野",
        regionCode: "cn_xinjiang"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.regionLabels, ["全部", "新疆"]);
  assert.deepEqual(result.data.regionOptions, [
    { label: "全部", value: "" },
    { label: "新疆", value: "cn_xinjiang", count: 3, image: "xinjiang-cover" }
  ]);
  assert.deepEqual(result.data.creators.map((item) => item.slug), ["a", "d", "b"]);
});

test("contentGateway returns journey regions and configured region card images", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "guide-a", name: "领队A" }]
      },
      destinations: {
        list: [
          {
            slug: "qinghai-lake",
            name: "青海湖畔",
            regionCode: "cn_tibetan",
            cover: "destination-cover"
          }
        ]
      },
      services: {
        list: [
          {
            id: "service-1",
            slug: "qinghai-loop",
            name: "青海湖环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            cover: "journey-cover",
            groupPeriods: [
              {
                periodCode: "QH-20260501",
                dateStart: "2026-05-01",
                dateEnd: "2026-05-05",
                price: 3980,
                status: "available"
              }
            ]
          }
        ]
      },
      app_configs: {
        list: [
          {
            key: "journeyPage",
            value: {
              regionCards: [
                {
                  regionCode: "cn_tibetan",
                  image: { original: "region-card-image" }
                }
              ]
            }
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
    action: "getJourneyPageData",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.regionOptions, [
    {
      label: "藏区",
      value: "cn_tibetan",
      image: "region-card-image"
    }
  ]);
  assert.deepEqual(result.data.journeys[0].destinationRegionCodes, ["cn_tibetan"]);
});

test("contentGateway retries transient SQL resume errors before building journey page", async () => {
  const previousRetryDelays = process.env.CONTENT_GATEWAY_SQL_RETRY_DELAYS_MS;
  process.env.CONTENT_GATEWAY_SQL_RETRY_DELAYS_MS = "1";
  let servicePeriodQueryCount = 0;

  try {
    const gateway = loadContentGatewayModule({
      collections: {
        creators: {
          list: [{ id: "creator-1", slug: "guide-a", name: "领队A" }]
        },
        destinations: {
          list: []
        },
        services: {
          list: [
            {
              id: "service-1",
              slug: "qinghai-loop",
              name: "青海湖环线",
              creatorId: "creator-1",
              cover: "journey-cover",
              groupPeriods: []
            }
          ]
        }
      },
      runSQL: async (sql) => {
        if (String(sql).includes("FROM `ServicePeriod`")) {
          servicePeriodQueryCount += 1;
          if (servicePeriodQueryCount === 1) {
            throw new Error("CynosDB serverless instance is resuming, please try connecting again. Error 9449");
          }

          return {
            data: {
              executeResultList: [
                {
                  serviceSlug: "qinghai-loop",
                  periodCode: "QH-20260501",
                  dateStart: "2026-05-01",
                  dateEnd: "2026-05-05",
                  price: 3980,
                  minGroup: 1,
                  remainingSeats: 8,
                  status: "available"
                }
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
      action: "getJourneyPageData",
      payload: {}
    });

    assert.equal(result.ok, true);
    assert.equal(servicePeriodQueryCount, 2);
    assert.deepEqual(result.data.journeys.map((item) => item.slug), ["qinghai-loop"]);
  } finally {
    if (previousRetryDelays === undefined) {
      delete process.env.CONTENT_GATEWAY_SQL_RETRY_DELAYS_MS;
    } else {
      process.env.CONTENT_GATEWAY_SQL_RETRY_DELAYS_MS = previousRetryDelays;
    }
  }
});

test("contentGateway timer event keeps SQL alive", async () => {
  const sqlCalls = [];
  const gateway = loadContentGatewayModule({
    runSQL: async (sql) => {
      sqlCalls.push(String(sql));
      return {
        data: {
          executeResultList: [{ keepAlive: 1 }]
        }
      };
    }
  });

  const result = await gateway.main({
    Type: "Timer",
    TriggerName: "keep-sql-alive-every-5-min"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.ok, true);
  assert.deepEqual(sqlCalls, ["SELECT 1 AS `keepAlive`"]);
});

test("contentGateway uses service regionCodes before destination fallback for journeys", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "guide-a", name: "领队A" }]
      },
      destinations: {
        list: []
      },
      services: {
        list: [
          {
            id: "service-1",
            slug: "xinjiang-route",
            name: "新疆路线",
            creatorId: "creator-1",
            regionCodes: ["cn_xinjiang"],
            destinationSlugs: [],
            cover: "journey-cover",
            groupPeriods: [
              {
                periodCode: "XJ-20260501",
                dateStart: "2026-05-01",
                dateEnd: "2026-05-05",
                price: 3980,
                status: "available"
              }
            ]
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getJourneyPageData",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.regionOptions, [
    {
      label: "新疆",
      value: "cn_xinjiang",
      image: "journey-cover"
    }
  ]);
  assert.deepEqual(result.data.journeys[0].destinationRegionCodes, ["cn_xinjiang"]);
  assert.deepEqual(result.data.journeys[0].destinationRegionLabels, ["新疆"]);
});

test("contentGateway uses configured journey region card images for creators region filters", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "guide-a", name: "领队A", tags: ["山野"] }]
      },
      destinations: {
        list: [
          {
            slug: "qinghai-lake",
            name: "青海湖畔",
            regionCode: "cn_tibetan",
            cover: "destination-cover"
          }
        ]
      },
      services: {
        list: [
          {
            id: "service-1",
            slug: "qinghai-loop",
            name: "青海湖环线",
            creatorId: "creator-1",
            destinationSlugs: ["qinghai-lake"],
            tags: ["山野"],
            cover: "journey-cover",
            groupPeriods: [
              {
                periodCode: "QH-20260501",
                dateStart: "2026-05-01",
                dateEnd: "2026-05-05",
                price: 3980,
                status: "available"
              }
            ]
          }
        ]
      },
      ideas: {
        list: [{ slug: "seed-idea", title: "种子故事", status: "active", authorId: "creator-1", body: "正文" }]
      },
      app_configs: {
        list: [
          {
            key: "journeyPage",
            value: {
              regionCards: [
                {
                  regionCode: "cn_tibetan",
                  image: { original: "region-card-image" }
                }
              ]
            }
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
    action: "getCreatorsPageData",
    payload: { filters: {} }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.regionOptions, [
    { label: "全部", value: "" },
    { label: "藏区", value: "cn_tibetan", count: 1, image: "region-card-image" }
  ]);
});

test("contentGateway orders creator tags by bookable routes first and then by frequency", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-a", slug: "a", name: "阿野" }]
      },
      destinations: {
        list: [{ slug: "qinghai-lake", name: "青海湖", regionCode: "cn_tibetan" }]
      },
      services: {
        list: [
          {
            slug: "culture-route",
            name: "文化路线",
            creatorId: "creator-a",
            destinationSlugs: ["qinghai-lake"],
            tags: ["文化"],
            groupPeriods: [
              {
                periodCode: "culture-active",
                dateStart: "2099-05-01",
                dateEnd: "2099-05-03",
                price: 3999,
                remainingSeats: 6,
                minGroup: 2,
                status: "available"
              }
            ]
          },
          {
            slug: "mountain-route-a",
            name: "山野路线 A",
            creatorId: "creator-a",
            destinationSlugs: ["qinghai-lake"],
            tags: ["山野"],
            groupPeriods: [
              {
                periodCode: "mountain-active-a",
                dateStart: "2099-06-01",
                dateEnd: "2099-06-03",
                price: 4299,
                remainingSeats: 8,
                minGroup: 2,
                status: "available"
              }
            ]
          },
          {
            slug: "mountain-route-b",
            name: "山野路线 B",
            creatorId: "creator-a",
            destinationSlugs: ["qinghai-lake"],
            tags: ["山野"],
            groupPeriods: [
              {
                periodCode: "mountain-active-b",
                dateStart: "2099-07-01",
                dateEnd: "2099-07-03",
                price: 4599,
                remainingSeats: 10,
                minGroup: 2,
                status: "available"
              }
            ]
          },
          {
            slug: "outdoor-route-a",
            name: "户外路线 A",
            creatorId: "creator-a",
            destinationSlugs: ["qinghai-lake"],
            tags: ["户外"],
            groupPeriods: [
              {
                periodCode: "outdoor-soldout-a",
                dateStart: "2099-08-01",
                dateEnd: "2099-08-03",
                price: 4899,
                remainingSeats: 0,
                minGroup: 2,
                status: "available"
              }
            ]
          },
          {
            slug: "outdoor-route-b",
            name: "户外路线 B",
            creatorId: "creator-a",
            destinationSlugs: ["qinghai-lake"],
            tags: ["户外"],
            groupPeriods: [
              {
                periodCode: "outdoor-soldout-b",
                dateStart: "2099-09-01",
                dateEnd: "2099-09-03",
                price: 5199,
                remainingSeats: 0,
                minGroup: 2,
                status: "available"
              }
            ]
          }
        ]
      },
      ideas: {
        list: [{ slug: "seed-idea", title: "种子故事", status: "active", authorId: "creator-a", body: "正文" }]
      }
    }
  });

  const result = await gateway.main({
    action: "getCreatorsPageData",
    payload: { filters: {} }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.creators[0].tags, ["山野", "文化", "户外"]);
  assert.deepEqual(result.data.styleOptions.map((item) => item.value), ["", "山野", "户外", "文化"]);
});

test("contentGateway returns creator detail payload with related ideas", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-gesang", slug: "gesang", name: "格桑梅朵" }]
      },
      destinations: {
        list: [{ slug: "wuyi-ancient", name: "武夷古道", regionCode: "cn_jiang_zhe_hu" }]
      },
      services: {
        list: [
          {
            id: "svc-gesang",
            slug: "gesang-route",
            name: "格桑路线",
            creatorId: "creator-gesang",
            destinationSlugs: ["wuyi-ancient"],
            groupPeriods: []
          }
        ]
      },
      ideas: {
        list: [
          {
            slug: "gesang-notes",
            title: "格桑手记",
            authorId: "creator-gesang",
            body: "山里见闻"
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getCreatorDetailData",
    payload: { slug: "gesang" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.creator.slug, "gesang");
  assert.deepEqual(result.data.relatedServices.map((item) => item.slug), ["gesang-route"]);
  assert.deepEqual(result.data.creatorIdeas.map((item) => item.slug), ["gesang-notes"]);
});

test("contentGateway falls back creatorMessage to service summary for legacy routes", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [{ id: "creator-1", slug: "linyue", name: "林越" }]
      },
      destinations: {
        list: []
      },
      services: {
        list: [
          {
            slug: "ridge-journal",
            id: "svc-ridge-journal",
            name: "高原谷地徒步手帐",
            type: "长途旅行",
            creatorId: "creator-1",
            creatorRoles: ["创作者", "带领者"],
            creatorMessage: "",
            destinationSlugs: [],
            summary: "以手绘地图串联牧场、寺院与峡谷，步行与露营结合。",
            gallery: [],
            galleryGroups: [],
            tags: ["户外"],
            status: "active"
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getServiceDetailSummaryData",
    payload: { slug: "ridge-journal" }
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.data.service.creatorMessage,
    "以手绘地图串联牧场、寺院与峡谷，步行与露营结合。"
  );
});

test("contentGateway resolves inactive linked creator for active journeys and service detail", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [
          {
            id: "creator-baibaihe",
            slug: "baibaihe",
            name: "白百合",
            avatar: "baibaihe-avatar.jpg",
            stance: "我是白百合",
            status: "inactive"
          }
        ]
      },
      destinations: {
        list: [
          { slug: "wuyi-ancient", name: "武夷古道", cover: "wuyi-cover.jpg" }
        ]
      },
      services: {
        list: [
          {
            id: "svc-bai-bai-he",
            slug: "bai-bai-he-de-ce-shi-lu-xian",
            name: "白百合的测试路线",
            type: "长途旅行",
            creatorId: "creator-baibaihe",
            creatorMessage: "适合愿意慢下来的人。",
            creatorRoles: ["创作者", "带领者"],
            destinationSlugs: ["wuyi-ancient"],
            summary: "沿古道行走与茶农共制青茶。",
            tags: ["文化"],
            gallery: [],
            galleryGroups: [],
            groupPeriods: [
              {
                periodCode: "BAI-20260501",
                dateStart: "2026-05-01",
                dateEnd: "2026-05-04",
                price: 10000,
                remainingSeats: 6,
                minGroup: 1,
                status: "available"
              }
            ],
            status: "active"
          }
        ]
      },
      ideas: {
        list: [
          {
            slug: "seed-idea",
            title: "种子故事",
            status: "active",
            authorId: "creator-baibaihe",
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

  const [journeyResult, detailResult] = await Promise.all([
    gateway.main({
      action: "getJourneyPageData",
      payload: {}
    }),
    gateway.main({
      action: "getServiceDetailSummaryData",
      payload: { slug: "bai-bai-he-de-ce-shi-lu-xian" }
    })
  ]);

  assert.equal(journeyResult.ok, true);
  assert.equal(journeyResult.data.journeys[0].creatorName, "白百合");

  assert.equal(detailResult.ok, true);
  assert.equal(detailResult.data.creator.name, "白百合");
  assert.equal(detailResult.data.creator.avatar, "baibaihe-avatar.jpg");
});

test("contentGateway exposes structured gallery tabs in service detail summary", async () => {
  const gateway = loadContentGatewayModule({
    collections: {
      creators: {
        list: [
          {
            id: "creator-gallery",
            slug: "gallery-creator",
            name: "图集创作者",
            avatar: "creator.jpg",
            status: "active"
          }
        ]
      },
      destinations: {
        list: [
          { slug: "gallery-destination", name: "图集目的地", cover: "destination.jpg" }
        ]
      },
      services: {
        list: [
          {
            id: "svc-gallery",
            slug: "gallery-service",
            name: "多图集路线",
            type: "短途旅行",
            creatorId: "creator-gallery",
            destinationSlugs: ["gallery-destination"],
            summary: "多图集摘要",
            tags: ["文化"],
            cover: "cover.jpg",
            galleryGroups: [
              { key: "cover", label: "封面", images: ["cover-1.jpg", "cover-2.jpg"] },
              { key: "meal", label: "餐食", images: ["meal-1.jpg"] }
            ],
            galleryGroupsCard: [
              { sourceIndex: 0, key: "cover", label: "封面", images: ["cover-card-1.jpg"] },
              { sourceIndex: 1, key: "meal", label: "餐食", images: ["meal-card-1.jpg"] }
            ],
            status: "active"
          }
        ]
      }
    }
  });

  const result = await gateway.main({
    action: "getServiceDetailSummaryData",
    payload: { slug: "gallery-service" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasGalleryGroups, true);
  assert.deepEqual(result.data.mediaTabs.map((item) => ({
    label: item.label,
    imageCount: item.imageCount,
    images: item.images
  })), [
    { label: "封面", imageCount: 2, images: ["cover-card-1.jpg"] },
    { label: "餐食", imageCount: 1, images: ["meal-card-1.jpg"] }
  ]);
});
