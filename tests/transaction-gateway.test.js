const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/transactionGateway/index.js"
);

function loadTransactionGatewayModule(options = {}) {
  const originalLoad = Module._load;
  const originalEnableClientPayOrder = process.env.ENABLE_CLIENT_PAY_ORDER;

  if (Object.prototype.hasOwnProperty.call(options, "enableClientPayOrder")) {
    process.env.ENABLE_CLIENT_PAY_ORDER = options.enableClientPayOrder ? "true" : "false";
  } else {
    delete process.env.ENABLE_CLIENT_PAY_ORDER;
  }

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      if (options.wxServerSdk) {
        return options.wxServerSdk;
      }
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        database() {
          return {
            collection() {
              return {
                where() {
                  return this;
                },
                skip() {
                  return this;
                },
                limit() {
                  return this;
                },
                get: async () => ({ data: [] })
              };
            }
          };
        },
        getWXContext() {
          return { OPENID: "test-openid" };
        }
      };
    }

    if (request === "@cloudbase/node-sdk") {
      if (options.cloudbaseSdk) {
        return options.cloudbaseSdk;
      }
      return {
        init() {
          return {
            rdb() {
              return {
                from() {
                  return {
                    insert: async () => ({ error: null }),
                    update: () => ({
                      eq: async () => ({ error: null })
                    }),
                    delete: () => ({
                      eq: async () => ({ error: null })
                    })
                  };
                }
              };
            },
            models: {}
          };
        }
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[gatewayModulePath];

  try {
    return require(gatewayModulePath);
  } finally {
    Module._load = originalLoad;
    if (originalEnableClientPayOrder == null) {
      delete process.env.ENABLE_CLIENT_PAY_ORDER;
    } else {
      process.env.ENABLE_CLIENT_PAY_ORDER = originalEnableClientPayOrder;
    }
  }
}

test("transactionGateway maps SQL order records into miniapp-friendly order objects", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const mapped = __test__.mapSqlOrder({
    _id: "sql-1",
    orderNo: "yz202603260001",
    userOpenid: "openid-1",
    serviceSlug: "wuyi-ink-trail",
    serviceName: "武夷墨迹",
    serviceType: "长途旅行",
    serviceCover: "cover.jpg",
    versionName: "清明团",
    servicePeriodCode: "WY20260401",
    peopleCountInt: 2,
    amountDec: "1998.00",
    discountDec: "100",
    payableDec: "1898.00",
    createdAtTs: Date.UTC(2026, 2, 26, 4, 0, 0),
    travelerName: "联系人",
    travelerPhone: "13800000000",
    travelersJson: JSON.stringify([
      {
        name: "联系人",
        phone: "13800000000",
        note: "不吃辣"
      }
    ]),
    serviceSnapshotJson: JSON.stringify({
      serviceSlug: "wuyi-ink-trail",
      serviceName: "武夷墨迹",
      cover: "cloud://cover",
      versionName: "清明团",
      travelPeriod: {
        dateStart: "2026-04-01",
        dateEnd: "2026-04-03"
      },
      creatorRoles: ["创作者", "带领者"]
    }),
    creatorSnapshotJson: JSON.stringify({
      name: "山野向导",
      avatar: "avatar.jpg"
    }),
    status: "paid"
  });

  assert.equal(mapped.id, "yz202603260001");
  assert.equal(mapped.payable, 1898);
  assert.equal(mapped.peopleCount, 2);
  assert.deepEqual(mapped.travelPeriod, {
    dateStart: "2026-04-01",
    dateEnd: "2026-04-03"
  });
  assert.equal(mapped.serviceSnapshot.cover, "cloud://cover");
  assert.equal(mapped.creatorSnapshot.name, "山野向导");
  assert.equal(mapped.traveler.note, "不吃辣");
  assert.equal(mapped.contact.name, "联系人");
});

test("transactionGateway falls back to legacy fields when snapshots are incomplete", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const mapped = __test__.mapSqlOrder({
    orderNo: "yz202603260002",
    serviceSlug: "legacy-service",
    serviceName: "老数据路线",
    serviceType: "短途旅行",
    serviceCover: "legacy-cover.jpg",
    versionName: "旧版",
    travelDateStartDate: "2026-05-10",
    travelDateEndDate: "2026-05-12",
    amount: 500,
    discount: 50,
    payable: 450,
    peopleCount: 1,
    serviceSnapshotJson: "{}",
    creatorSnapshotJson: "{}",
    travelersJson: "[]",
    travelerName: "旧联系人",
    travelerPhone: "13900000000",
    status: "pending"
  });

  assert.equal(mapped.serviceSnapshot.serviceName, "老数据路线");
  assert.equal(mapped.serviceSnapshot.cover, "legacy-cover.jpg");
  assert.deepEqual(mapped.travelPeriod, {
    dateStart: "2026-05-10",
    dateEnd: "2026-05-12"
  });
  assert.deepEqual(mapped.travelers, []);
  assert.equal(mapped.contact.phone, "13900000000");
});

test("transactionGateway includes contact and traveler snapshots in order service snapshot", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const snapshot = __test__.buildOrderServiceSnapshot({
    payload: {
      serviceSlug: "miao-night-walk",
      versionName: "山谷夜步4日"
    },
    periodRecord: {
      serviceName: "山谷夜步与寨子谈话",
      versionName: "山谷夜步4日",
      dateStart: "2026-04-26",
      dateEnd: "2026-04-29"
    },
    requestedTravelPeriod: {
      dateStart: "2026-04-26",
      dateEnd: "2026-04-29"
    },
    serviceSnapshot: {
      serviceType: "长途旅行",
      cover: "cover.jpg",
      creatorRoles: ["创作者", "带领者"]
    },
    contact: {
      name: "海森",
      phone: "13122276786"
    },
    travelers: [
      {
        name: "扎哥",
        documentType: "passport",
        documentNumber: "E12345678",
        phone: "13800000000",
        wechat: "zhayeye",
        note: "靠窗"
      }
    ]
  });

  assert.deepEqual(snapshot.contact, {
    name: "海森",
    phone: "13122276786"
  });
  assert.deepEqual(snapshot.travelers, [
    {
      name: "扎哥",
      documentType: "passport",
      documentTypeLabel: "护照",
      documentNumber: "E12345678",
      documentDisplayText: "护照 E12345678",
      idCard: "E12345678",
      phone: "13800000000",
      wechat: "zhayeye",
      note: "靠窗"
    }
  ]);
});

test("transactionGateway supports compact traveler snapshots and keeps three travelers within legacy limits", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const travelers = [
    {
      name: "出行人1",
      documentType: "idCard",
      documentNumber: "500227198606090019",
      phone: "13800000001"
    },
    {
      name: "出行人2",
      documentType: "idCard",
      documentNumber: "500227198606090019",
      phone: "13800000002"
    },
    {
      name: "出行人3",
      documentType: "idCard",
      documentNumber: "500227198606090019",
      phone: "13800000003"
    }
  ];

  const persisted = __test__.buildPersistedTravelers(travelers, 256);
  assert.ok(persisted.length <= 256);

  const mapped = __test__.mapSqlOrder({
    orderNo: "yz202604030001",
    userOpenid: "openid-compact",
    serviceSlug: "compact-service",
    serviceName: "紧凑结构路线",
    travelersJson: persisted,
    travelerName: "联系人",
    travelerPhone: "13800000000",
    peopleCountInt: 3,
    amountDec: "300",
    payableDec: "300",
    createdAtTs: Date.UTC(2026, 3, 3, 10, 0, 0),
    status: "pending"
  });

  assert.equal(mapped.travelers.length, 3);
  assert.equal(mapped.travelers[0].name, "出行人1");
  assert.equal(mapped.travelers[0].documentNumber, "500227198606090019");
  assert.equal(mapped.travelers[0].phone, "13800000001");
});

test("transactionGateway createOrder inserts a generated SQL _id for multi-traveler orders", async () => {
  const insertCalls = [];
  const orderEvents = [];
  const periodRecord = {
    _id: "sp_test_001",
    serviceSlug: "compact-service",
    serviceName: "紧凑结构路线",
    serviceType: "长途旅行",
    periodCode: "compact-2026-04-10",
    versionName: "清明团",
    dateStart: "2026-04-10",
    dateEnd: "2026-04-12",
    price: 999,
    remainingSeats: 8,
    status: "available"
  };

  const { __test__ } = loadTransactionGatewayModule({
    wxServerSdk: {
      DYNAMIC_CURRENT_ENV: "test-env",
      init() {},
      database() {
        return {
          collection() {
            return {
              add: async ({ data }) => {
                orderEvents.push(data);
                return { _id: "evt_1" };
              },
              where() {
                return this;
              },
              skip() {
                return this;
              },
              limit() {
                return this;
              },
              get: async () => ({ data: [] })
            };
          }
        };
      },
      getWXContext() {
        return { OPENID: "test-openid" };
      }
    },
    cloudbaseSdk: {
      init() {
        return {
          rdb() {
            return {
              from() {
                return {
                  insert: async (payload) => {
                    insertCalls.push(payload);
                    return { error: null };
                  },
                  update: () => ({
                    eq: async () => ({ error: null })
                  }),
                  delete: () => ({
                    eq: async () => ({ error: null })
                  })
                };
              }
            };
          },
          models: {
            TravelOrder: {
              list: async () => ({
                data: {
                  records: []
                }
              })
            },
            ServicePeriod: {
              list: async ({ filter }) => {
                const where = filter && filter.where ? filter.where : {};
                const matchesById = !where._id || where._id.$eq === periodRecord._id;
                const matchesBySlug = !where.serviceSlug || where.serviceSlug.$eq === periodRecord.serviceSlug;
                const matchesByDate = !where.dateStart || where.dateStart.$eq === periodRecord.dateStart;
                const matchesByCode = !where.periodCode || where.periodCode.$eq === periodRecord.periodCode;

                return {
                  data: {
                    records: matchesById && matchesBySlug && matchesByDate && matchesByCode
                      ? [Object.assign({}, periodRecord)]
                      : []
                  }
                };
              },
              update: async ({ data, filter }) => {
                const where = filter && filter.where ? filter.where : {};
                if (
                  where._id &&
                  where._id.$eq === periodRecord._id &&
                  (!where.remainingSeats || where.remainingSeats.$eq === periodRecord.remainingSeats) &&
                  (!where.status || where.status.$eq === periodRecord.status)
                ) {
                  Object.assign(periodRecord, data);
                  return {
                    data: {
                      count: 1
                    }
                  };
                }

                return {
                  data: {
                    count: 0
                  }
                };
              }
            }
          }
        };
      }
    }
  });

  const result = await __test__.createOrder({
    serviceSlug: "compact-service",
    travelDateStart: "2026-04-10",
    peopleCount: 3,
    contactName: "测试4",
    contactPhone: "13122276786",
    travelers: [
      {
        name: "出行人1",
        documentType: "idCard",
        documentNumber: "11010519491231002X",
        phone: "13800000001"
      },
      {
        name: "出行人2",
        documentType: "idCard",
        documentNumber: "11010519491231002X",
        phone: "13800000002"
      },
      {
        name: "出行人3",
        documentType: "idCard",
        documentNumber: "11010519491231002X",
        phone: "13800000003"
      }
    ]
  });

  assert.equal(insertCalls.length, 1);
  assert.match(insertCalls[0]._id, /^order_[a-z0-9]+$/);
  assert.equal(insertCalls[0]._openid, "test-openid");
  assert.equal(insertCalls[0].peopleCountInt, 3);
  assert.equal(result._id, insertCalls[0]._id);
  assert.equal(periodRecord.remainingSeats, 5);
  assert.equal(orderEvents.length, 1);
});

test("transactionGateway rejects orders above the single-order people limit", async () => {
  const { __test__ } = loadTransactionGatewayModule();

  await assert.rejects(
    () =>
      __test__.createOrder({
        serviceSlug: "compact-service",
        travelDateStart: "2026-04-10",
        peopleCount: 4
      }),
    /peopleCount exceeds max allowed/
  );
});

test("transactionGateway validates traveler document type, document number, and contact phone", () => {
  const { __test__ } = loadTransactionGatewayModule();

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      contact: {
        name: "海森",
        phone: "+86 138-0000-0000"
      },
      travelers: [
        {
          name: "阿野",
          documentType: "passport",
          documentNumber: "E12345678",
          phone: "13800000000"
        }
      ]
    }),
    ""
  );

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      contact: {
        name: "海森",
        phone: "010-12345678"
      },
      travelers: [
        {
          name: "阿野",
          documentType: "passport",
          documentNumber: "E12345678",
          phone: "13800000000"
        }
      ]
    }),
    "请输入正确的联系人手机号"
  );

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      contact: {
        name: "海森",
        phone: "12345"
      },
      travelers: [
        {
          name: "阿野",
          documentType: "passport",
          documentNumber: "E12345678",
          phone: "13800000000"
        }
      ]
    }),
    "请输入正确的联系人手机号"
  );

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      contact: {
        name: "海森",
        phone: "13800000000"
      },
      travelers: [
        {
          name: "阿野",
          documentType: "idCard",
          documentNumber: "E12345678",
          phone: "13800000000"
        }
      ]
    }),
    "出行人1请输入正确的身份证号"
  );
});

test("transactionGateway exposes deterministic status helpers for seat and order transitions", () => {
  const { __test__ } = loadTransactionGatewayModule();

  assert.equal(__test__.resolvePeriodStatus("available", 0), "soldout");
  assert.equal(__test__.resolvePeriodStatus("closed", 8), "closed");
  assert.equal(__test__.resolvePeriodStatus("confirmed", 3), "confirmed");
  assert.equal(__test__.resolvePeriodStatus("available", 5), "available");

  assert.deepEqual(__test__.filterOrdersByStatus([
    { status: "pending" },
    { status: "paid" },
    { status: "traveling" },
    { status: "completed" }
  ], "not_departed"), [{ status: "paid" }, { status: "traveling" }]);

  assert.equal(__test__.shouldRestoreSeatsForOrderStatus("pending"), true);
  assert.equal(__test__.shouldRestoreSeatsForOrderStatus("completed"), false);
});

test("transactionGateway normalizes favorite card assets and destination stats", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const creators = [
    __test__.buildFavoriteCreator({
      id: "creator-linyue",
      slug: "linyue",
      name: "林越",
      avatar: {
        card: "linyue-card.jpg",
        detail: "linyue-detail.jpg"
      },
      destinationSlugs: ["minbei-creek"]
    })
  ];
  const services = [
    __test__.buildFavoriteService(
      {
        slug: "ridge-journal",
        creatorId: "creator-linyue",
        cover: {
          card: "service-card.jpg",
          detail: "service-detail.jpg"
        },
        destinationSlugs: ["minbei-creek"],
        durationTag: "旧时长",
        priceLabel: "旧价格"
      },
      creators,
      {}
    )
  ];
  const destination = __test__.buildFavoriteDestination(
    {
      slug: "minbei-creek",
      cover: {
        card: "destination-card.jpg",
        detail: "destination-detail.jpg"
      }
    },
    creators,
    services
  );

  assert.equal(creators[0].avatar, "linyue-card.jpg");
  assert.equal(services[0].cover, "service-card.jpg");
  assert.equal(services[0].creatorName, "林越");
  assert.equal(destination.cover, "destination-card.jpg");
  assert.equal(destination.routeCount, 1);
  assert.equal(destination.creatorCount, 1);
});

test("transactionGateway preserves existing favorite service summary when SQL periods are unavailable", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const service = __test__.attachServicePeriodSummary(
    {
      slug: "ridge-journal",
      durationTag: "6天",
      priceLabel: "¥4280 起"
    },
    {}
  );

  assert.equal(service.durationTag, "6天");
  assert.equal(service.priceLabel, "¥4280 起");
});

test("transactionGateway settlement ignores client discount by design", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const settlement = __test__.resolveOrderSettlement(1998);

  assert.deepEqual(settlement, {
    amount: 1998,
    discount: 0,
    payable: 1998
  });
});

test("transactionGateway transition guard allows only intended status changes", () => {
  const { __test__ } = loadTransactionGatewayModule();

  assert.equal(__test__.isAllowedOrderTransition("pending", "paid"), true);
  assert.equal(__test__.isAllowedOrderTransition("paid", "paid"), true);
  assert.equal(__test__.isAllowedOrderTransition("completed", "paid"), false);
  assert.equal(__test__.isAllowedOrderTransition("completed", "canceled"), false);
  assert.equal(__test__.isAllowedOrderTransition("traveling", "canceled"), true);
});

test("transactionGateway disables client payOrder by default", async () => {
  const gateway = loadTransactionGatewayModule({ enableClientPayOrder: false });
  const result = await gateway.main({
    action: "payOrder",
    payload: { orderId: "yz202603260001" }
  });

  assert.deepEqual(result, {
    ok: false,
    error: "payOrder is disabled"
  });
});
