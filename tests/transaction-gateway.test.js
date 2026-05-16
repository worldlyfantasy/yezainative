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
    orderContactName: "新联系人",
    orderContactPhone: "13900000000",
    travelerName: "旧联系人",
    travelerPhone: "13800000000",
    emergencyContactName: "紧急联系人",
    emergencyContactPhone: "13700000000",
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
  assert.equal(mapped.orderContactName, "新联系人");
  assert.equal(mapped.contact.name, "新联系人");
  assert.equal(mapped.contact.emergencyName, "紧急联系人");
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
      profileId: "",
      travelerRecordId: "",
      source: "",
      name: "扎哥",
      documents: [{ documentType: "passport", documentNumber: "E12345678" }],
      documentType: "passport",
      documentTypeLabel: "护照",
      documentNumber: "E12345678",
      documentDisplayText: "护照 E12345678",
      idCard: "E12345678",
      phone: "13800000000",
      wechat: "zhayeye",
      email: "",
      gender: "",
      birthday: "",
      note: "靠窗"
    }
  ]);
  assert.equal(snapshot.roomingMode, "random");
  assert.equal(snapshot.roommateName, "");
  assert.equal(snapshot.roomType, "twin");
  assert.deepEqual(snapshot.singleRoom, {
    requested: false,
    price: 0,
    status: "",
    notice: ""
  });
  assert.equal(snapshot.allergyNotes, "");
  assert.equal(snapshot.couponId, "");
});

test("transactionGateway supports compact traveler snapshots for two travelers", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const travelers = [
    {
      profileId: "profile_1",
      travelerRecordId: "traveler_doc_1",
      source: "traveler_profile",
      name: "出行人1",
      documentType: "idCard",
      documentNumber: "500227198606090019",
      phone: "13800000001",
      gender: "male",
      birthday: "1986-06-09",
      wechat: "wx_a"
    },
    {
      profileId: "profile_2",
      source: "manual",
      name: "出行人2",
      documentType: "idCard",
      documentNumber: "500227198606090019",
      phone: "13800000002",
      gender: "female",
      birthday: "1987-07-09",
      wechat: "wx_b"
    }
  ];

  const persisted = __test__.buildPersistedTravelers(travelers, 4096);
  assert.ok(persisted.length <= 4096);

  const mapped = __test__.mapSqlOrder({
    orderNo: "yz202604030001",
    userOpenid: "openid-compact",
    serviceSlug: "compact-service",
    serviceName: "紧凑结构路线",
    travelersJson: persisted,
    travelerName: "联系人",
    travelerPhone: "13800000000",
    peopleCountInt: 2,
    amountDec: "300",
    payableDec: "300",
    createdAtTs: Date.UTC(2026, 3, 3, 10, 0, 0),
    status: "pending"
  });

  assert.equal(mapped.travelers.length, 2);
  assert.equal(mapped.travelers[0].name, "出行人1");
  assert.equal(mapped.travelers[0].documentNumber, "500227198606090019");
  assert.equal(mapped.travelers[0].phone, "13800000001");
  assert.equal(mapped.travelers[0].profileId, "profile_1");
  assert.equal(mapped.travelers[0].travelerRecordId, "traveler_doc_1");
  assert.equal(mapped.travelers[0].source, "traveler_profile");
  assert.equal(mapped.travelers[1].source, "manual");
});

test("transactionGateway detects paid order traveler date overlaps inclusively", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const conflict = __test__.findTravelerAvailabilityConflictFromRecords(
    [
      {
        orderNo: "yz_paid_overlap",
        status: "paid",
        travelDateStart: "2026-06-10",
        travelDateEnd: "2026-06-12",
        travelersJson: JSON.stringify([
          {
            n: "阿野",
            t: "passport",
            i: "E12345678"
          }
        ])
      },
      {
        orderNo: "yz_pending_overlap",
        status: "pending",
        travelDateStart: "2026-06-11",
        travelDateEnd: "2026-06-13",
        travelersJson: JSON.stringify([
          {
            n: "阿青",
            t: "passport",
            i: "P99887766"
          }
        ])
      }
    ],
    [
      {
        name: "阿野",
        documents: [{ documentType: "passport", documentNumber: "E12345678" }]
      }
    ],
    {
      dateStart: "2026-06-12",
      dateEnd: "2026-06-15"
    }
  );

  assert.equal(conflict.order.orderNo, "yz_paid_overlap");
  assert.equal(__test__.hasTravelPeriodOverlap(
    { dateStart: "2026-06-01", dateEnd: "2026-06-03" },
    { dateStart: "2026-06-04", dateEnd: "2026-06-06" }
  ), false);
});

test("transactionGateway createOrder rejects travelers already booked on overlapping paid trips", async () => {
  const insertCalls = [];
  const periodRecord = {
    _id: "sp_overlap_001",
    serviceSlug: "overlap-service",
    serviceName: "重叠校验路线",
    serviceType: "长途旅行",
    periodCode: "overlap-2026-06-12",
    versionName: "端午团",
    dateStart: "2026-06-12",
    dateEnd: "2026-06-15",
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
              list: async ({ filter }) => {
                const status = filter && filter.where && filter.where.status
                  ? filter.where.status.$eq
                  : "";
                return {
                  data: {
                    records: status === "paid"
                      ? [
                          {
                            orderNo: "yz_paid_overlap",
                            status: "paid",
                            travelDateStart: "2026-06-10",
                            travelDateEnd: "2026-06-12",
                            travelersJson: JSON.stringify([
                              {
                                n: "阿野",
                                t: "passport",
                                i: "E12345678"
                              }
                            ])
                          }
                        ]
                      : []
                  }
                };
              }
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
              update: async () => {
                throw new Error("service period seats should not be reserved");
              }
            }
          }
        };
      }
    }
  });

  await assert.rejects(
    () => __test__.createOrder({
      serviceSlug: "overlap-service",
      travelDateStart: "2026-06-12",
      peopleCount: 1,
      contactName: "测试4",
      contactPhone: "13122276786",
      emergencyContactName: "紧急联系4",
      emergencyContactPhone: "13811112222",
      travelers: [
        {
          name: "阿野",
          documents: [{ documentType: "passport", documentNumber: "E12345678" }],
          phone: "13800000001",
          gender: "male",
          birthday: "1990-01-01"
        }
      ]
    }),
    /阿野在该时间段已经有下单的旅程，该订单无法提交/
  );
  assert.equal(insertCalls.length, 0);
  assert.equal(periodRecord.remainingSeats, 8);
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
    dateStart: "2026-12-10",
    dateEnd: "2026-12-12",
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
    travelDateStart: "2026-12-10",
    peopleCount: 2,
    contactName: "测试4",
    contactPhone: "13122276786",
    emergencyContactName: "紧急联系4",
    emergencyContactPhone: "13811112222",
    roomingMode: "singleRoomRequest",
    roomType: "king",
    singleRoomPrice: 600,
    singleRoomNotice: "房态有限，需人工确认",
    travelers: [
      {
        profileId: "profile_create_1",
        travelerRecordId: "traveler_doc_create_1",
        source: "traveler_profile",
        name: "出行人1",
        documents: [{ documentType: "idCard", documentNumber: "11010519491231002X" }],
        phone: "13800000001",
        gender: "male",
        birthday: "1990-01-01",
        wechat: "wx_one"
      },
      {
        name: "出行人2",
        documents: [{ documentType: "idCard", documentNumber: "11010519491231002X" }],
        phone: "13800000002",
        gender: "female",
        birthday: "1991-02-02",
        wechat: "wx_two"
      }
    ]
  });

  assert.equal(insertCalls.length, 1);
  assert.match(insertCalls[0]._id, /^order_[a-z0-9]+$/);
  assert.equal(insertCalls[0]._openid, "test-openid");
  assert.equal(insertCalls[0].peopleCountInt, 2);
  assert.equal(insertCalls[0].orderContactName, "测试4");
  assert.equal(insertCalls[0].orderContactPhone, "13122276786");
  assert.equal(insertCalls[0].travelerName, "测试4");
  assert.equal(insertCalls[0].emergencyContactName, "紧急联系4");
  assert.equal(insertCalls[0].roomingMode, "singleRoomRequest");
  assert.equal(insertCalls[0].amount, 2598);
  assert.equal(insertCalls[0].payable, 2598);
  assert.equal(insertCalls[0].singleRoomPrice, 600);
  assert.equal(insertCalls[0].singleRoomStatus, "pending");
  assert.equal(insertCalls[0].singleRoomNotice, "房态有限，需人工确认");
  assert.match(insertCalls[0].travelersJson, /\"pid\":\"profile_create_1\"/);
  assert.match(insertCalls[0].travelersJson, /\"rid\":\"traveler_doc_create_1\"/);
  assert.match(insertCalls[0].travelersJson, /\"src\":\"traveler_profile\"/);
  assert.equal(result._id, insertCalls[0]._id);
  assert.equal(result.roomingMode, "singleRoomRequest");
  assert.equal(result.singleRoomPrice, 600);
  assert.equal(result.singleRoomStatus, "pending");
  assert.equal(periodRecord.remainingSeats, 6);
  assert.equal(orderEvents.length, 1);
});

test("transactionGateway rejects orders above the single-order people limit", async () => {
  const { __test__ } = loadTransactionGatewayModule();

  await assert.rejects(
    () =>
      __test__.createOrder({
        serviceSlug: "compact-service",
        travelDateStart: "2026-04-10",
        peopleCount: 3
      }),
    /peopleCount exceeds max allowed/
  );
});

test("transactionGateway validates traveler document type and emergency contact only", () => {
  const { __test__ } = loadTransactionGatewayModule();

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      emergencyContact: {
        name: "阿急",
        phone: "13122276786"
      },
      travelers: [
        {
          name: "阿野",
          documents: [{ documentType: "passport", documentNumber: "E12345678" }],
          phone: "13800000000",
          gender: "male",
          birthday: "1990-01-01",
          wechat: "wx_test"
        }
      ]
    }),
    ""
  );

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      orderContact: {
        name: "海森",
        phone: "010-12345678"
      },
      emergencyContact: {
        name: "阿急",
        phone: "13122276786"
      },
      travelers: [
        {
          name: "阿野",
          documents: [{ documentType: "passport", documentNumber: "E12345678" }],
          phone: "13800000000",
          gender: "male",
          birthday: "1990-01-01",
          wechat: "wx_test"
        }
      ]
    }),
    ""
  );

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      orderContact: {
        name: "海森",
        phone: "13800000000"
      },
      emergencyContact: {
        name: "阿急",
        phone: "12345"
      },
      travelers: [
        {
          name: "阿野",
          documents: [{ documentType: "passport", documentNumber: "E12345678" }],
          phone: "13800000000",
          gender: "male",
          birthday: "1990-01-01",
          wechat: "wx_test"
        }
      ]
    }),
    "请输入正确的紧急联系人手机号"
  );

  assert.equal(
    __test__.validateOrderParticipants({
      peopleCount: 1,
      orderContact: {
        name: "海森",
        phone: "13800000000"
      },
      emergencyContact: {
        name: "阿急",
        phone: "13122276786"
      },
      travelers: [
        {
          name: "阿野",
          documents: [{ documentType: "idCard", documentNumber: "E12345678" }],
          phone: "13800000000",
          gender: "male",
          birthday: "1990-01-01",
          wechat: "wx_test"
        }
      ]
    }),
    "出行人1请输入正确的身份证号"
  );
});

test("transactionGateway aliases emergency contact into legacy order contact fields", () => {
  const { __test__ } = loadTransactionGatewayModule();

  assert.deepEqual(
    __test__.normalizeOrderContact({
      emergencyContactName: "阿急",
      emergencyContactPhone: "13122276786"
    }),
    {
      name: "阿急",
      phone: "13122276786"
    }
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
    payable: 1998,
    couponId: ""
  });
});

test("transactionGateway builds a cash reward ledger draft when an invited user completes an order", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const draft = __test__.buildShareReferralRewardLedger(
    {
      orderNo: "yz202604150001",
      userOpenid: "invitee-openid",
      serviceSlug: "spring-hill",
      serviceName: "春山慢行",
      travelDateStart: "2026-04-20",
      travelDateEnd: "2026-04-23"
    },
    {
      _id: "relation_1",
      inviterUserId: "user_inviter_1",
      inviteeUserId: "user_invitee_1"
    },
    {
      campaignKey: "yezai_share_referral",
      campaignName: "野哉分享家",
      cashRewardAmount: 100,
      monthlySettlementDay: 20
    },
    1776240000000
  );

  assert.equal(draft.campaignKey, "yezai_share_referral");
  assert.equal(draft.rewardAmount, 100);
  assert.equal(draft.status, "awaiting_account");
  assert.equal(draft.inviterUserId, "user_inviter_1");
  assert.equal(draft.inviteeUserId, "user_invitee_1");
  assert.equal(draft.sourceOrderNo, "yz202604150001");
  assert.equal(draft.settlementMonth, "2026-04");
  assert.equal(draft.settlementPlannedDay, 20);
});

test("transactionGateway records only the first completed invited order as a cash reward", async () => {
  const collectionAdds = [];
  const collectionUpdates = [];
  const collectionData = {
    users: [
      {
        _id: "user_invitee_1",
        openid: "invitee-openid",
        effectiveOrderCount: 0,
        effectiveRouteCount: 0,
        lastTravelAt: 0
      }
    ],
    referral_relations: [
      {
        _id: "relation_1",
        inviterUserId: "user_inviter_1",
        inviteeUserId: "user_invitee_1",
        status: "active"
      }
    ],
    app_configs: [
      {
        _id: "config_1",
        key: "shareReferralCampaign",
        value: {
          campaignKey: "yezai_share_referral",
          campaignName: "野哉分享家",
          cashRewardAmount: 100,
          monthlySettlementDay: 20
        }
      }
    ],
    cash_reward_ledgers: []
  };

  const { __test__ } = loadTransactionGatewayModule({
    wxServerSdk: {
      DYNAMIC_CURRENT_ENV: "test-env",
      init() {},
      database() {
        function matchesWhere(doc, query) {
          if (!query || typeof query !== "object") {
            return true;
          }
          return Object.entries(query).every(([key, expected]) => {
            const actual = doc && doc[key];
            if (expected && typeof expected === "object" && Object.prototype.hasOwnProperty.call(expected, "$eq")) {
              return actual === expected.$eq;
            }
            return actual === expected;
          });
        }
        return {
          collection(name) {
            let query = null;
            let limit = 0;
            const readRows = () => collectionData[name] || [];
            return {
              where(value) {
                query = value || null;
                return this;
              },
              limit(value) {
                limit = Number(value) || 0;
                return this;
              },
              doc(id) {
                return {
                  update: async ({ data } = {}) => {
                    const rows = readRows();
                    const index = rows.findIndex((item) => item._id === id);
                    if (index >= 0) {
                      rows[index] = Object.assign({}, rows[index], data || {});
                    }
                    collectionUpdates.push({ name, id, data: data || {} });
                    return {};
                  }
                };
              },
              add: async ({ data } = {}) => {
                const rows = readRows();
                const id = data && data._id ? data._id : `${name}_${rows.length + 1}`;
                const doc = Object.assign({ _id: id }, data || {});
                rows.push(doc);
                collectionAdds.push({ name, data: doc });
                return { _id: id };
              },
              get: async () => {
                const rows = readRows().filter((item) => matchesWhere(item, query));
                return {
                  data: limit ? rows.slice(0, limit) : rows
                };
              }
            };
          }
        };
      },
      getWXContext() {
        return { OPENID: "invitee-openid" };
      }
    }
  });

  const first = await __test__.syncShareReferralRewardForCompletedOrder({
    orderNo: "order_1",
    userOpenid: "invitee-openid",
    serviceName: "春山慢行"
  });
  const second = await __test__.syncShareReferralRewardForCompletedOrder({
    orderNo: "order_2",
    userOpenid: "invitee-openid",
    serviceName: "夏野入谷"
  });

  assert.equal(first.sourceOrderNo, "order_1");
  assert.equal(second.sourceOrderNo, "order_1");
  assert.equal(collectionAdds.filter((item) => item.name === "cash_reward_ledgers").length, 1);
  assert.equal(collectionUpdates.some((item) => item.name === "users" && item.id === "user_invitee_1" && item.data.effectiveOrderCount === 1), true);
});

test("transactionGateway settlement includes single-room surcharge in order amount", () => {
  const { __test__ } = loadTransactionGatewayModule();
  const settlement = __test__.resolveOrderSettlement(999, { singleRoomPrice: 200 });

  assert.deepEqual(settlement, {
    amount: 1199,
    discount: 0,
    payable: 1199,
    couponId: ""
  });
});

test("transactionGateway settlement ignores legacy global coupon rules", () => {
  const { __test__ } = loadTransactionGatewayModule();

  const reachedThreshold = __test__.resolveOrderSettlement(3200, { couponId: "GROUP100" });
  assert.deepEqual(reachedThreshold, {
    amount: 3200,
    discount: 0,
    payable: 3200,
    couponId: ""
  });

  const reachedBySingleRoom = __test__.resolveOrderSettlement(900, {
    couponId: "WELCOME50",
    singleRoomPrice: 200
  });
  assert.deepEqual(reachedBySingleRoom, {
    amount: 1100,
    discount: 0,
    payable: 1100,
    couponId: ""
  });
});

test("transactionGateway settlement validates and stacks share referral coupon assets", async () => {
  const welcomeCouponId = "1234567890abcdef1234567890abcdef";
  const bonusCouponId = "abcdef1234567890abcdef1234567890";
  const collectionData = {
    users: [
      {
        _id: "user_1",
        openid: "test-openid"
      }
    ],
    user_coupon_assets: [
      {
        _id: welcomeCouponId,
        userId: "user_1",
        userOpenid: "test-openid",
        couponType: "share_referral_welcome_100",
        title: "野哉分享家新人券",
        amount: 100,
        threshold: 1000,
        stackGroup: "share_referral_phase2",
        status: "active",
        expiresAt: Date.UTC(2027, 0, 1, 0, 0, 0)
      },
      {
        _id: bonusCouponId,
        userId: "user_1",
        userOpenid: "test-openid",
        couponType: "share_referral_bonus_50",
        title: "野哉分享家加码券",
        amount: 50,
        threshold: 1000,
        stackGroup: "share_referral_phase2",
        status: "active",
        expiresAt: Date.UTC(2027, 0, 1, 0, 0, 0)
      }
    ]
  };
  const { __test__ } = loadTransactionGatewayModule({
    wxServerSdk: {
      DYNAMIC_CURRENT_ENV: "test-env",
      init() {},
      database() {
        function matchesWhere(doc, query) {
          if (!query || typeof query !== "object") {
            return true;
          }
          return Object.entries(query).every(([key, expected]) => {
            const actual = doc && doc[key];
            if (expected && typeof expected === "object" && Object.prototype.hasOwnProperty.call(expected, "$eq")) {
              return actual === expected.$eq;
            }
            return actual === expected;
          });
        }
        return {
          collection(name) {
            let query = null;
            let limit = 0;
            return {
              where(value) {
                query = value || null;
                return this;
              },
              limit(value) {
                limit = Number(value) || 0;
                return this;
              },
              doc(id) {
                return {
                  get: async () => ({
                    data: (collectionData[name] || []).find((item) => item._id === id) || null
                  })
                };
              },
              get: async () => {
                const rows = (collectionData[name] || []).filter((item) => matchesWhere(item, query));
                return {
                  data: limit ? rows.slice(0, limit) : rows
                };
              }
            };
          }
        };
      },
      getWXContext() {
        return { OPENID: "test-openid" };
      }
    }
  });

  const settlement = await __test__.resolveOrderSettlementForUser(1200, {
    couponId: `${welcomeCouponId}+${bonusCouponId}`,
    userOpenid: "test-openid"
  });

  assert.equal(settlement.amount, 1200);
  assert.equal(settlement.discount, 150);
  assert.equal(settlement.payable, 1050);
  assert.equal(settlement.couponId, "share_referral_phase2_combo");
  assert.equal(settlement.couponId.length <= 64, true);
  assert.deepEqual(settlement.couponAssetIds.sort(), [bonusCouponId, welcomeCouponId].sort());
  assert.equal(settlement.couponSnapshot.id, "share_referral_phase2_combo");
  assert.equal(settlement.couponSnapshot.amountOff, 150);
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
