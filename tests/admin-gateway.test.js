const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/adminGateway/index.js"
);

function loadAdminGatewayModule(options = {}) {
  const originalLoad = Module._load;
  const docStore = new Map(Object.entries(options.userDocs || {}));
  const collectionData = options.collectionData || {};
  const delayedAddVisibilityCollections = new Set(options.delayedAddVisibilityCollections || []);
  const authDirectory = options.authDirectory || {};
  const removedDocIds = [];
  const collectionUpdates = [];
  const collectionAdds = [];
  const cloudFunctionCalls = [];
  const sqlCalls = [];
  const sentMails = [];
  const transportConfigs = [];
  const cloudAuthApiCalls = [];
  const authCallerInfo = options.authCallerInfo || {
    uid: "admin-1",
    username: "ops",
    displayName: "运营管理员",
    roles: ["admin"]
  };
  const authUserInfo = options.authUserInfo || {
    userInfo: {
      id: "admin-1",
      email: "ops@example.com",
      roles: ["admin"],
      role: "admin",
      roleName: "admin"
    }
  };
  const runSQL = async (sql, params) => {
    sqlCalls.push({ sql, params });

    if (options.runSQL) {
      return options.runSQL(sql, params);
    }

    return {
      data: {
        executeResultList: []
      }
    };
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        getWXContext() {
          return {
            OPENID: "admin-openid"
          };
        },
        callFunction: async (payload) => {
          cloudFunctionCalls.push(payload);

          if (options.callFunction) {
            return options.callFunction(payload);
          }

          return {
            result: {
              ok: true,
              data: {}
            }
          };
        },
        database() {
          return {
            command: {
              remove() {
                return {
                  __op: "remove"
                };
              }
            },
            collection(name) {
              const readCollectionRows = () => {
                const rows = collectionData[name];
                return Array.isArray(rows) ? rows : [];
              };
              const findCollectionDoc = (id) => readCollectionRows().find((item) => item && item._id === id) || null;

              return {
                doc(id) {
                  return {
                    get: async () => ({ data: docStore.get(id) || findCollectionDoc(id) || null }),
                    update: async ({ data } = {}) => {
                      collectionUpdates.push({ name, id, data: data || {} });

                      if (docStore.has(id)) {
                        docStore.set(id, Object.assign({}, docStore.get(id), data || {}));
                      }

                      const rows = readCollectionRows();
                      const rowIndex = rows.findIndex((item) => item && item._id === id);
                      if (rowIndex >= 0) {
                        rows[rowIndex] = Object.assign({}, rows[rowIndex], data || {});
                      }

                      return {};
                    },
                    remove: async () => {
                      removedDocIds.push(id);
                      const rows = readCollectionRows();
                      const rowIndex = rows.findIndex((item) => item && item._id === id);
                      if (rowIndex >= 0) {
                        rows.splice(rowIndex, 1);
                      }
                      return {};
                    }
                  };
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
                get: async () => ({ data: readCollectionRows() }),
                add: async ({ data } = {}) => {
                  const rows = readCollectionRows();
                  const id = data && data._id ? data._id : `${name}_${rows.length + 1}`;
                  const nextDoc = Object.assign({ _id: id }, data || {});
                  if (!delayedAddVisibilityCollections.has(name)) {
                    rows.push(nextDoc);
                  }
                  collectionAdds.push({ name, data: nextDoc });
                  return { _id: id };
                }
              };
            }
          };
        },
        getUserInfo() {
          return authCallerInfo;
        },
        getEndUserInfo: async () => authUserInfo
      };
    }

    if (request === "@cloudbase/node-sdk") {
      return {
        getCloudbaseContext: () => ({
          TENCENTCLOUD_SECRETID: "AKIDEXAMPLE",
          TENCENTCLOUD_SECRETKEY: "SECRETEXAMPLE",
          TENCENTCLOUD_SESSIONTOKEN: "TOKENEXAMPLE"
        }),
        request: async (payload) => {
          cloudAuthApiCalls.push({
            action: payload && payload.headers && payload.headers["X-TC-Action"],
            body: payload && payload.body
          });

          if (options.cloudAuthApi) {
            return options.cloudAuthApi(payload);
          }

          return {
            body: {
              Response: {
                RequestId: "mock-tcb-request-id"
              }
            }
          };
        },
        init() {
          return {
            config: {
              envName: "test-env",
              region: "ap-shanghai",
              secretId: "AKIDEXAMPLE",
              secretKey: "SECRETEXAMPLE",
              sessionToken: "TOKENEXAMPLE"
            },
            auth() {
              return {
                getUserInfo() {
                  return authCallerInfo;
                },
                getEndUserInfo: async (uid) => {
                  if (!uid) {
                    return authUserInfo;
                  }

                  return {
                    userInfo: authDirectory[uid] || null
                  };
                },
                queryUserInfo: async ({ platform, platformId } = {}) => {
                  if (platform === "EMAIL") {
                    const matchedUser = Object.values(authDirectory).find(
                      (item) => String(item && item.email || "").trim().toLowerCase()
                        === String(platformId || "").trim().toLowerCase()
                    );
                    return {
                      userInfo: matchedUser || null
                    };
                  }

                  return {
                    userInfo: null
                  };
                }
              };
            },
            models: {
              $runSQL: runSQL
            },
            rdb() {
              return {
                from() {
                  return {
                    insert: async () => ({ error: null }),
                    update() {
                      return {
                        eq: async () => ({ error: null })
                      };
                    },
                    delete() {
                      return {
                        eq: async () => ({ error: null })
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }

    if (request === "nodemailer") {
      return {
        createTransport(config) {
          transportConfigs.push(config);
          return {
            sendMail: async (mail) => {
              sentMails.push(mail);

              if (options.sendMail) {
                return options.sendMail(mail, config);
              }

              return { messageId: "mock-message-id" };
            }
          };
        }
      };
    }

    if (request === "./image-assets") {
      return {
        dedupeImageValues: (value) => value,
        ensureImageAssetValue: (value) => value,
        getCloudFilePath: () => "",
        getImageAssetOriginal: (value) => value,
        getImageAssetVariant: () => "",
        isCloudFileId: () => false,
        listImageAssetRefs: () => [],
        looksLikeHttpUrl: () => false,
        normalizeImageAssetValue: (value) => value
      };
    }

    if (request === "./destination-regions") {
      return {
        normalizeDestinationRegionCode: (value) => value || "",
        resolveDestinationRegionCode: (value) => value || "",
        getDestinationRegionLabel: () => ""
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[gatewayModulePath];

  try {
    const moduleExports = require(gatewayModulePath);
    return Object.assign({}, moduleExports, {
      __mocks__: {
        collectionAdds,
        collectionUpdates,
        cloudFunctionCalls,
        cloudAuthApiCalls,
        removedDocIds,
        sqlCalls,
        sentMails,
        transportConfigs
      }
    });
  } finally {
    Module._load = originalLoad;
  }
}

test("adminGateway creates SQL service period records with a generated _id", () => {
  const { __test__ } = loadAdminGatewayModule();
  const record = __test__.buildServicePeriodCreateRecord(
    {
      periodCode: "qinghai-loop-20260405-01",
      serviceSlug: "qinghai-loop",
      serviceName: "湖岸环线体感",
      versionName: "湖岸环线6日",
      singleRoomEnabled: true,
      singleRoomPrice: 500,
      singleRoomNotice: "房态有限，需人工确认"
    },
    "admin-openid",
    1775318400000
  );

  assert.match(record._id, /^sp_[a-z0-9]+$/);
  assert.equal(record.createdAt, 1775318400000);
  assert.equal(record.createBy, "admin-openid");
  assert.equal(record.owner, "admin-openid");
  assert.equal(record._openid, "admin-openid");
  assert.equal(record.periodCode, "qinghai-loop-20260405-01");
  assert.equal(record.singleRoomEnabled, true);
  assert.equal(record.singleRoomPrice, 500);
  assert.equal(record.singleRoomNotice, "房态有限，需人工确认");
});

test("adminGateway freezes the CloudBase auth user when an account is set inactive", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        },
        {
          _id: "target-account",
          uid: "target-uid",
          email: "target@example.com",
          displayName: "目标账号",
          accountType: "admin",
          level: "admin",
          status: "active"
        }
      ]
    }
  });

  const result = await gateway.main({
    action: "saveAdminAccount",
    payload: {
      _id: "target-account",
      status: "inactive"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "inactive");
  assert.deepEqual(gateway.__mocks__.cloudAuthApiCalls, [
    {
      action: "ModifyUser",
      body: {
        EnvId: "test-env",
        Uid: "target-uid",
        UserStatus: "BLOCKED"
      }
    }
  ]);
});

test("adminGateway reactivates the CloudBase auth user and can resolve uid by email", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        },
        {
          _id: "target-account",
          email: "target@example.com",
          displayName: "目标账号",
          accountType: "admin",
          level: "admin",
          status: "inactive"
        }
      ]
    },
    authDirectory: {
      "target-uid": {
        uid: "target-uid",
        email: "target@example.com"
      }
    }
  });

  const result = await gateway.main({
    action: "saveAdminAccount",
    payload: {
      _id: "target-account",
      status: "active"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "active");
  assert.deepEqual(gateway.__mocks__.cloudAuthApiCalls, [
    {
      action: "ModifyUser",
      body: {
        EnvId: "test-env",
        Uid: "target-uid",
        UserStatus: "ACTIVE"
      }
    }
  ]);
});

test("adminGateway deletes the CloudBase auth user before removing the admin account", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        },
        {
          _id: "target-account",
          uid: "target-uid",
          email: "target@example.com",
          displayName: "目标账号",
          accountType: "admin",
          level: "admin",
          status: "active"
        }
      ]
    }
  });

  const result = await gateway.main({
    action: "deleteAdminAccount",
    payload: {
      _id: "target-account"
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    _id: "target-account",
    removed: true
  });
  assert.deepEqual(gateway.__mocks__.cloudAuthApiCalls, [
    {
      action: "DeleteUsers",
      body: {
        EnvId: "test-env",
        Uids: ["target-uid"]
      }
    }
  ]);
  assert.deepEqual(gateway.__mocks__.removedDocIds, ["target-account"]);
});

test("service period manual status only keeps available or inactive while soldout remains inventory-driven", () => {
  const { __test__ } = loadAdminGatewayModule();

  assert.equal(__test__.resolveServicePeriodStatus("soldout", { status: "active" }, 6), "available");
  assert.equal(__test__.resolveServicePeriodStatus("available", { status: "active" }, 0), "soldout");
  assert.equal(__test__.resolveServicePeriodStatus("confirmed", { status: "active" }, 6), "available");
  assert.equal(__test__.resolveServicePeriodStatus("available", { status: "inactive" }, 6), "inactive");
});

test("slug helpers follow legacy-style creator, destination, and service patterns", () => {
  const { __test__ } = loadAdminGatewayModule();

  assert.equal(__test__.buildCreatorSlugBase("林越"), "linyue");
  assert.equal(__test__.buildDestinationSlugBase("阿坝高地"), "aba-highlands");
  assert.equal(__test__.buildServiceSlugBase("武夷古道静心行"), "wuyi-ink-trail");
});

test("generateCreatorSlug uses pinyin and appends a numeric suffix only on collision", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        { slug: "linyue" },
        { slug: "linyue-02" }
      ]
    }
  });

  const slug = await __test__.generateCreatorSlug("林越");
  assert.equal(slug, "linyue-03");
});

test("generateServicePeriodCode uses service slug plus departure date as the primary code", async () => {
  const { __test__ } = loadAdminGatewayModule({
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: []
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

  const periodCode = await __test__.generateServicePeriodCode("qinghai-loop", "2026-04-05");
  assert.equal(periodCode, "qinghai-loop-20260405");
});

test("generateServicePeriodCode keeps incrementing when the same route and date already exist", async () => {
  const { __test__ } = loadAdminGatewayModule({
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              { periodCode: "qinghai-loop-20260405-01" },
              { periodCode: "qinghai-loop-20260405-02" }
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

  const periodCode = await __test__.generateServicePeriodCode("qinghai-loop", "2026-04-05");
  assert.equal(periodCode, "qinghai-loop-20260405-03");
});

test("admin account matching does not reuse a scoped account through shared weak identifiers", () => {
  const { __test__ } = loadAdminGatewayModule();

  const matchedAccount = __test__.findAdminAccountForUser(
    [
      {
        _id: "admin-account-1",
        uid: "legacy-uid",
        customUserId: "legacy-custom-user",
        username: "legacy-admin",
        email: "shared@example.com",
        phone: "13800000000",
        accountType: "creator_portal"
      }
    ],
    {
      id: "new-auth-user",
      uid: "new-uid",
      customUserId: "new-custom-user",
      username: "fresh-admin",
      email: "shared@example.com",
      phone: "13800000000"
    }
  );

  assert.equal(matchedAccount, null);
});

test("admin account matching still supports legacy records that only carry weak identifiers", () => {
  const { __test__ } = loadAdminGatewayModule();

  const matchedAccount = __test__.findAdminAccountForUser(
    [
      {
        _id: "admin-account-legacy",
        username: "legacy-admin",
        email: "shared@example.com",
        phone: "13800000000",
        accountType: "admin"
      }
    ],
    {
      id: "new-auth-user",
      uid: "new-uid",
      customUserId: "new-custom-user",
      username: "fresh-admin",
      email: "shared@example.com",
      phone: "13800000000"
    }
  );

  assert.deepEqual(matchedAccount, {
    _id: "admin-account-legacy",
    username: "legacy-admin",
    email: "shared@example.com",
    phone: "13800000000",
    accountType: "admin"
  });
});

test("creator portal dashboard summary only includes owned services, periods, and orders", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["dashboard:read:owned"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      services: [
        {
          _id: "service-1",
          id: "service-1",
          slug: "owned-route",
          name: "我的路线",
          creatorId: "creator-1",
          status: "active",
          summary: "内容完整",
          gallery: []
        },
        {
          _id: "service-2",
          id: "service-2",
          slug: "other-route",
          name: "别人的路线",
          creatorId: "creator-2",
          status: "active",
          summary: "内容完整",
          gallery: []
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "owned-route",
                serviceName: "我的路线",
                periodCode: "owned-period",
                versionName: "标准版",
                dateStart: "2099-05-01",
                remainingSeats: 2,
                minGroup: 4,
                status: "available",
                creatorId: "creator-1"
              },
              {
                serviceSlug: "other-route",
                serviceName: "别人的路线",
                periodCode: "other-period",
                versionName: "标准版",
                dateStart: "2099-05-02",
                remainingSeats: 1,
                minGroup: 4,
                status: "available",
                creatorId: "creator-2"
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                orderNo: "owned-order",
                serviceSlug: "owned-route",
                serviceName: "我的路线",
                travelDateStart: "2099-05-01",
                status: "pending",
                versionName: "标准版",
                peopleCountInt: 1,
                createdAtTs: 1770000000000,
                updatedAt: 1770000001000,
                creatorSnapshotJson: JSON.stringify({ id: "creator-1", slug: "creator-one" })
              },
              {
                orderNo: "other-order",
                serviceSlug: "other-route",
                serviceName: "别人的路线",
                travelDateStart: "2099-05-02",
                status: "pending",
                versionName: "标准版",
                peopleCountInt: 1,
                createdAtTs: 1770000002000,
                updatedAt: 1770000003000,
                creatorSnapshotJson: JSON.stringify({ id: "creator-2", slug: "creator-two" })
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

  const result = await __test__.getDashboardSummary(creatorAdmin);

  assert.equal(result.workbench[0].value, 1);
  assert.equal(result.workbench[2].value, 1);
  assert.equal(result.workbench[2].items[0].key, "owned-order");
});

test("creator portal listServicePeriods only returns periods for the bound creator", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-creator-1",
          uid: "creator-user-1",
          username: "creator_portal_1",
          email: "creator1@example.com",
          accountType: "creator_portal",
          boundCreatorId: "creator-1",
          status: "active",
          level: ""
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        },
        {
          _id: "creator-doc-2",
          id: "creator-2",
          slug: "other",
          name: "别人"
        }
      ],
      services: [
        {
          _id: "service-doc-1",
          id: "service-1",
          slug: "owned-route",
          name: "我的路线",
          creatorId: "creator-1"
        },
        {
          _id: "service-doc-2",
          id: "service-2",
          slug: "other-route",
          name: "别人的路线",
          creatorId: "creator-2"
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-1",
      username: "creator_portal_1",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-1",
        uid: "creator-user-1",
        email: "creator1@example.com",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "owned-route",
                serviceName: "我的路线",
                periodCode: "owned-period",
                versionName: "标准版",
                durationDays: 3,
                dateStart: "2099-05-01",
                dateEnd: "2099-05-03",
                price: 1999,
                minGroup: 4,
                remainingSeats: 6,
                status: "available",
                creatorId: "creator-1",
                updatedAt: 1770000001000
              },
              {
                serviceSlug: "other-route",
                serviceName: "别人的路线",
                periodCode: "other-period",
                versionName: "标准版",
                durationDays: 2,
                dateStart: "2099-05-10",
                dateEnd: "2099-05-11",
                price: 2999,
                minGroup: 4,
                remainingSeats: 6,
                status: "available",
                creatorId: "creator-2",
                updatedAt: 1770000002000
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: []
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
    action: "listServicePeriods",
    payload: {
      page: 1,
      pageSize: 10,
      sortBy: "updatedAt",
      sortDirection: "desc"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].periodCode, "owned-period");
});

test("listServicePeriods retries transient SQL timeouts before failing the page", async () => {
  let servicePeriodQueryCount = 0;
  const gateway = loadAdminGatewayModule({
    collectionData: {
      services: [
        {
          _id: "service-doc-1",
          id: "service-1",
          slug: "wuyi-ink-trail",
          name: "武夷墨迹",
          creatorId: "creator-1"
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        servicePeriodQueryCount += 1;
        if (servicePeriodQueryCount === 1) {
          throw new Error("ETIMEDOUT while querying SQL gateway");
        }

        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "wuyi-ink-trail",
                serviceName: "武夷墨迹",
                periodCode: "wuyi-20260405",
                versionName: "标准版",
                durationDays: 3,
                dateStart: "2099-05-01",
                dateEnd: "2099-05-03",
                price: 1999,
                minGroup: 4,
                totalSeats: 12,
                remainingSeats: 8,
                status: "available",
                updatedAt: 1770000001000
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                servicePeriodCode: "wuyi-20260405",
                soldCount: 4
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
    action: "listServicePeriods",
    payload: {
      page: 1,
      pageSize: 10
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items[0].periodCode, "wuyi-20260405");
  assert.equal(result.data.items[0].soldCount, 4);
  assert.equal(servicePeriodQueryCount, 2);
});

test("listServicePeriods keeps loading when optional order aggregation SQL fails", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      services: [
        {
          _id: "service-doc-1",
          id: "service-1",
          slug: "wuyi-ink-trail",
          name: "武夷墨迹",
          creatorId: "creator-1"
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "wuyi-ink-trail",
                serviceName: "武夷墨迹",
                periodCode: "wuyi-20260405",
                versionName: "标准版",
                durationDays: 3,
                dateStart: "2099-05-01",
                dateEnd: "2099-05-03",
                price: 1999,
                minGroup: 4,
                totalSeats: 12,
                remainingSeats: 8,
                status: "available",
                updatedAt: 1770000001000
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        throw new Error("Gateway timeout while querying TravelOrder");
      }

      return {
        data: {
          executeResultList: []
        }
      };
    }
  });

  const result = await gateway.main({
    action: "listServicePeriods",
    payload: {
      page: 1,
      pageSize: 10
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items[0].periodCode, "wuyi-20260405");
  assert.equal(result.data.items[0].soldCount, 0);
  assert.equal(result.data.items[0].totalSeats, 12);
  assert.equal(result.data.items[0].remainingSeats, 8);
});

test("listServicePeriods supports legacy period rows without totalSeats", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      services: [
        {
          _id: "service-doc-1",
          id: "service-1",
          slug: "wuyi-ink-trail",
          name: "武夷墨迹",
          creatorId: "creator-1"
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        assert.equal(sql.includes("`totalSeats`"), false);
        return {
          data: {
            executeResultList: [
              {
                serviceSlug: "wuyi-ink-trail",
                serviceName: "武夷墨迹",
                periodCode: "wuyi-20260405",
                versionName: "标准版",
                durationDays: 3,
                dateStart: "2099-05-01",
                dateEnd: "2099-05-03",
                price: 1999,
                minGroup: 4,
                remainingSeats: 8,
                status: "available",
                updatedAt: 1770000001000
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                servicePeriodCode: "wuyi-20260405",
                soldCount: 4
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
    action: "listServicePeriods",
    payload: {
      page: 1,
      pageSize: 10
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items[0].periodCode, "wuyi-20260405");
  assert.equal(result.data.items[0].soldCount, 4);
  assert.equal(result.data.items[0].totalSeats, 12);
  assert.equal(result.data.items[0].remainingSeats, 8);
});

test("creator portal getServicePeriodDetail rejects periods outside the bound creator scope", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-creator-1",
          uid: "creator-user-1",
          username: "creator_portal_1",
          email: "creator1@example.com",
          accountType: "creator_portal",
          boundCreatorId: "creator-1",
          status: "active",
          level: ""
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        },
        {
          _id: "creator-doc-2",
          id: "creator-2",
          slug: "other",
          name: "别人"
        }
      ],
      services: [
        {
          _id: "service-doc-2",
          id: "service-2",
          slug: "other-route",
          name: "别人的路线",
          creatorId: "creator-2"
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-1",
      username: "creator_portal_1",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-1",
        uid: "creator-user-1",
        email: "creator1@example.com",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    },
    runSQL: async (sql, params) => {
      if (sql.includes("FROM `ServicePeriod` WHERE `periodCode` =")) {
        return {
          data: {
            executeResultList: params && params.periodCode === "other-period"
              ? [
                  {
                    _id: "period-doc-2",
                    serviceId: "service-2",
                    serviceSlug: "other-route",
                    serviceName: "别人的路线",
                    periodCode: "other-period",
                    versionName: "标准版",
                    durationDays: 2,
                    dateStart: "2099-05-10",
                    dateEnd: "2099-05-11",
                    price: 2999,
                    minGroup: 4,
                    remainingSeats: 6,
                    status: "available",
                    creatorId: "creator-2",
                    updatedAt: 1770000002000
                  }
                ]
              : []
          }
        };
      }

      if (sql.includes("SUM(COALESCE(`peopleCountInt`, `peopleCount`, 0)) AS `soldCount`")) {
        return {
          data: {
            executeResultList: [
              {
                soldCount: 0
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
    action: "getServicePeriodDetail",
    payload: {
      periodCode: "other-period"
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /未找到对应团期/);
});

test("creator portal permissions include read-only story access", () => {
  const { __test__ } = loadAdminGatewayModule();

  const permissions = __test__.buildAdminPermissions({
    account: {
      accountType: "creator_portal"
    }
  });

  assert.equal(permissions.includes("ideas:read"), true);
  assert.equal(permissions.includes("ideas:write"), false);
  assert.equal(permissions.includes("ideas:write:owned"), false);
  assert.equal(permissions.includes("destinations:read"), false);
  assert.equal(permissions.includes("destinations:write:owned"), false);
});

test("adminGateway lists referral relations with inviter and invitee nicknames", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user_inviter_1", nickname: "林越" },
        { _id: "user_invitee_1", nickname: "海森" }
      ],
      referral_relations: [
        {
          _id: "relation_1",
          inviterUserId: "user_inviter_1",
          inviteeUserId: "user_invitee_1",
          firstValidScanCode: "ABCD1234",
          status: "active",
          firstValidScanAt: 1776240000000,
          createdAt: 1776240000000
        }
      ]
    }
  });

  const result = await __test__.listReferralRelations({
    page: 1,
    pageSize: 10
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].inviterNickname, "林越");
  assert.equal(result.items[0].inviteeNickname, "海森");
  assert.equal(result.items[0].referralCode, "ABCD1234");
});

test("adminGateway collapses duplicate referral relations by inviter invitee and code", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user_inviter_1", nickname: "林越" },
        { _id: "user_invitee_1", nickname: "海森" }
      ],
      referral_relations: [
        {
          _id: "relation_late",
          inviterUserId: "user_inviter_1",
          inviteeUserId: "user_invitee_1",
          firstValidScanCode: "ABCD1234",
          status: "active",
          firstValidScanAt: 1776243600000,
          createdAt: 1776243600000
        },
        {
          _id: "relation_early",
          inviterUserId: "user_inviter_1",
          inviteeUserId: "user_invitee_1",
          firstValidScanCode: "ABCD1234",
          status: "active",
          firstValidScanAt: 1776240000000,
          createdAt: 1776240000000
        }
      ]
    }
  });

  const result = await __test__.listReferralRelations({
    page: 1,
    pageSize: 10
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].relationId, "relation_early");
  assert.equal(result.items[0].firstValidScanAt, 1776240000000);
});

test("adminGateway lists reward ledgers with related user info and payout status", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user_inviter_1", nickname: "林越" },
        { _id: "user_invitee_1", nickname: "海森" }
      ],
      cash_reward_ledgers: [
        {
          _id: "ledger_1",
          inviterUserId: "user_inviter_1",
          inviteeUserId: "user_invitee_1",
          sourceOrderNo: "yz202604160001",
          serviceName: "春山慢行",
          rewardAmount: 100,
          status: "awaiting_account",
          settlementMonth: "2026-04",
          earnedAt: 1776240000000,
          updatedAt: 1776240000000
        },
        {
          _id: "ledger_2",
          inviterUserId: "user_inviter_1",
          inviteeUserId: "user_invitee_1",
          sourceOrderNo: "yz202604160002",
          serviceName: "旧状态奖励",
          rewardAmount: 100,
          status: "earned",
          settlementMonth: "2026-04",
          earnedAt: 1776240001000,
          updatedAt: 1776240001000
        }
      ]
    }
  });

  const result = await __test__.listReferralRewardLedgers({
    page: 1,
    pageSize: 10
  });

  assert.equal(result.total, 2);
  assert.equal(result.items[0].inviterNickname, "林越");
  assert.equal(result.items[0].inviteeNickname, "海森");
  assert.equal(result.items[0].serviceName, "旧状态奖励");
  assert.equal(result.items[0].status, "awaiting_account");
});

test("adminGateway lists payout accounts with masked fields", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user_inviter_1", nickname: "林越" }
      ],
      payout_accounts: [
        {
          _id: "payout_1",
          userId: "user_inviter_1",
          campaignKey: "yezai_share_referral",
          accountName: "林越",
          phone: "13800138000",
          bankName: "招商银行杭州分行",
          bankAccountNo: "6225888888881234",
          idNumberLast4: "1234",
          status: "under_review",
          submittedAt: 1776240000000,
          updatedAt: 1776240000000
        }
      ]
    }
  });

  const result = await __test__.listReferralPayoutAccounts({
    page: 1,
    pageSize: 10
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].userNickname, "林越");
  assert.equal(result.items[0].accountName, "林越");
  assert.equal(result.items[0].accountNameMasked, "林*");
  assert.equal(result.items[0].phone, "13800138000");
  assert.equal(result.items[0].phoneMasked, "138****8000");
  assert.equal(result.items[0].bankAccountNo, "6225888888881234");
  assert.equal(result.items[0].bankAccountMasked, "************1234");
  assert.equal(result.items[0].idNumberLast4, "1234");
  assert.equal(result.items[0].status, "payable");
});

test("adminGateway manually marks payable reward ledger as paid or failed", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      cash_reward_ledgers: [
        {
          _id: "ledger_1",
          inviterUserId: "user_inviter_1",
          status: "payable"
        }
      ]
    }
  });

  const result = await __test__.updateReferralRewardLedgerPayoutStatus({
    ledgerId: "ledger_1",
    status: "paid"
  }, {
    id: "admin-1",
    username: "ops"
  });

  assert.equal(result.status, "paid");
  assert.equal(__mocks__.collectionUpdates.some((item) => item.name === "cash_reward_ledgers" && item.id === "ledger_1" && item.data.status === "paid"), true);
});

test("adminGateway allows correcting a paid reward ledger back to failed", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      cash_reward_ledgers: [
        {
          _id: "ledger_1",
          inviterUserId: "user_inviter_1",
          status: "paid"
        }
      ]
    }
  });

  const result = await __test__.updateReferralRewardLedgerPayoutStatus({
    ledgerId: "ledger_1",
    status: "failed",
    note: "用户反馈未到账"
  }, {
    id: "admin-1",
    username: "ops"
  });

  assert.equal(result.status, "failed");
  assert.equal(__mocks__.collectionUpdates.some((item) => (
    item.name === "cash_reward_ledgers"
    && item.id === "ledger_1"
    && item.data.status === "failed"
    && item.data.payoutFailureReason === "用户反馈未到账"
  )), true);
});

test("getSystemHealth reports env mismatch risk and downstream probe status", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    callFunction: async ({ name, data }) => ({
      result: {
        ok: true,
        data: {
          journeys: [
            { slug: "wuyi-ancient" },
            { slug: "qinghai-loop" }
          ]
        }
      }
    }),
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        return {
          data: {
            executeResultList: [
              {
                servicePeriodCount: 42,
                futurePeriodCount: 22
              }
            ]
          }
        };
      }

      if (sql.includes("FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                travelOrderCount: 26,
                latestOrderUpdatedAt: "2026-04-16 08:33:09"
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

  const result = await __test__.getSystemHealth();

  assert.equal(result.envId, "test-env");
  assert.equal(result.isCanonicalEnvId, false);
  assert.match(result.envWarning, /完整环境 ID/);
  assert.equal(result.adminGateway.ok, true);
  assert.equal(result.contentGateway.ok, true);
  assert.equal(result.contentGateway.journeyCount, 2);
  assert.equal(result.sql.ok, true);
  assert.equal(result.sql.servicePeriodCount, 42);
  assert.equal(result.sql.futurePeriodCount, 22);
  assert.equal(result.sql.travelOrderCount, 26);
  assert.equal(result.sql.latestOrderUpdatedAt, "2026-04-16 08:33:09");
  assert.deepEqual(__mocks__.cloudFunctionCalls, [
    {
      name: "contentGateway",
      data: {
        action: "getJourneyPageData",
        payload: {}
      }
    }
  ]);
});

test("saveIdea allows wechat mode without excerptBody", async () => {
  const { __test__ } = loadAdminGatewayModule({
    userDocs: {
      "idea-doc-1": {
        _id: "idea-doc-1",
        id: "idea-1",
        slug: "modu-lookbook",
        title: "魔都看展合集",
        theme: "小野旅记",
        themeKey: "xiaoye-travel-notes",
        themeLabel: "小野旅记",
        isCustomTheme: false,
        sourceType: "wechat",
        summary: "原有摘要",
        cover: "cloud://cover.jpg",
        authorId: "creator-1",
        destinationSlugs: [],
        relatedServiceSlugs: [],
        body: "",
        excerptBody: "",
        wechatArticleUrl: "https://mp.weixin.qq.com/s/original",
        status: "active"
      }
    },
    collectionData: {
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "cen-gu",
          name: "岑谷"
        }
      ],
      ideas: [
        {
          _id: "idea-doc-1",
          id: "idea-1",
          slug: "modu-lookbook",
          title: "魔都看展合集",
          theme: "小野旅记",
          themeKey: "xiaoye-travel-notes",
          themeLabel: "小野旅记",
          isCustomTheme: false,
          sourceType: "wechat",
          summary: "原有摘要",
          cover: "cloud://cover.jpg",
          authorId: "creator-1",
          destinationSlugs: [],
          relatedServiceSlugs: [],
          body: "",
          excerptBody: "",
          wechatArticleUrl: "https://mp.weixin.qq.com/s/original",
          status: "active"
        }
      ]
    }
  });

  await assert.doesNotReject(() =>
    __test__.saveIdea(
      {
        _id: "idea-doc-1",
        id: "idea-1",
        slug: "modu-lookbook",
        title: "魔都看展合集",
        theme: "小野旅记",
        themeKey: "xiaoye-travel-notes",
        themeLabel: "小野旅记",
        isCustomTheme: false,
        sourceType: "wechat",
        status: "active",
        summary: "更新后的摘要",
        cover: "cloud://cover.jpg",
        authorId: "creator-1",
        destinationSlugs: [],
        relatedServiceSlugs: [],
        body: "",
        excerptBody: "",
        wechatArticleUrl: "https://mp.weixin.qq.com/s/updated",
        wechatArticleTitle: "",
        readMoreText: "阅读全文"
      },
      { uid: "admin-1" }
    )
  );
});

test("saveIdea still requires excerptBody for hybrid mode", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "cen-gu",
          name: "岑谷"
        }
      ],
      ideas: [
        {
          _id: "idea-doc-1",
          id: "idea-1",
          slug: "modu-lookbook",
          title: "魔都看展合集",
          theme: "小野旅记",
          themeKey: "xiaoye-travel-notes",
          themeLabel: "小野旅记",
          isCustomTheme: false,
          sourceType: "hybrid",
          summary: "原有摘要",
          cover: "cloud://cover.jpg",
          authorId: "creator-1",
          destinationSlugs: [],
          relatedServiceSlugs: [],
          body: "",
          excerptBody: "",
          wechatArticleUrl: "https://mp.weixin.qq.com/s/original",
          status: "active"
        }
      ]
    }
  });

  await assert.rejects(
    () =>
      __test__.saveIdea(
        {
          _id: "idea-doc-1",
          id: "idea-1",
          slug: "modu-lookbook",
          title: "魔都看展合集",
          theme: "小野旅记",
          themeKey: "xiaoye-travel-notes",
          themeLabel: "小野旅记",
          isCustomTheme: false,
          sourceType: "hybrid",
          status: "active",
          summary: "更新后的摘要",
          cover: "cloud://cover.jpg",
          authorId: "creator-1",
          destinationSlugs: [],
          relatedServiceSlugs: [],
          body: "",
          excerptBody: "",
          wechatArticleUrl: "https://mp.weixin.qq.com/s/updated",
          wechatArticleTitle: "",
          readMoreText: "阅读全文"
        },
        { uid: "admin-1" }
      ),
    /混合模式必须填写小程序导读/
  );
});

test("saveIdea maps legacy idea themes into the new fixed theme set", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "cen-gu",
          name: "岑谷"
        }
      ],
      ideas: [
        {
          _id: "idea-doc-1",
          id: "idea-1",
          slug: "modu-lookbook",
          title: "魔都看展合集",
          theme: "徒步自然",
          themeKey: "hiking-nature",
          themeLabel: "徒步自然",
          isCustomTheme: false,
          sourceType: "wechat",
          summary: "原有摘要",
          cover: "cloud://cover.jpg",
          authorId: "creator-1",
          destinationSlugs: [],
          relatedServiceSlugs: [],
          body: "",
          excerptBody: "",
          wechatArticleUrl: "https://mp.weixin.qq.com/s/original",
          status: "active"
        }
      ]
    }
  });

  await __test__.saveIdea(
    {
      _id: "idea-doc-1",
      id: "idea-1",
      slug: "modu-lookbook",
      title: "魔都看展合集",
      theme: "徒步自然",
      themeKey: "hiking-nature",
      themeLabel: "徒步自然",
      isCustomTheme: false,
      sourceType: "wechat",
      status: "active",
      summary: "更新后的摘要",
      cover: "cloud://cover.jpg",
      authorId: "creator-1",
      destinationSlugs: [],
      relatedServiceSlugs: [],
      body: "",
      excerptBody: "",
      wechatArticleUrl: "https://mp.weixin.qq.com/s/updated",
      wechatArticleTitle: "",
      readMoreText: "阅读全文"
    },
    { uid: "admin-1" }
  );

  const ideaUpdate = __mocks__.collectionUpdates.find((item) => item.name === "ideas" && item.id === "idea-doc-1");
  assert.ok(ideaUpdate);
  assert.equal(ideaUpdate.data.theme, "小野旅记");
  assert.equal(ideaUpdate.data.themeKey, "xiaoye-travel-notes");
  assert.equal(ideaUpdate.data.themeLabel, "小野旅记");
  assert.equal(ideaUpdate.data.isCustomTheme, false);
});

test("saveService requires creatorMessage", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          id: "creator-b",
          slug: "creator-b",
          name: "创作者 B",
          status: "active"
        }
      ],
      services: []
    }
  });

  await assert.rejects(
    () =>
      __test__.saveService(
        {
          slug: "songhua-dock",
          name: "松花泊行",
          type: "短途旅行",
          status: "active",
          creatorId: "creator-b",
          creatorRoles: ["创作者"],
          creatorMessage: "",
          regionCodes: ["cn_northeast_region"],
          destinationSlugs: ["harbin"],
          summary: "沿着松花江慢慢走。",
          cover: "",
          gallery: [],
          galleryGroups: [],
          tags: ["城市"],
          travelDetail: {
            overview: {
              coverImage: "",
              whyJoinText: "从江风和码头开始重新进入这座城市。",
              suitableTitle: "这段旅程适合谁",
              suitableText: "适合想慢下来观察城市纹理的人。"
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
          }
        },
        { uid: "admin-1", permissions: ["services:write"] }
      ),
    /请填写创作者的话/
  );
});

test("saveService clears route-level consult qr and keeps system-config strategy", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-b",
          slug: "creator-b",
          name: "创作者 B",
          status: "active"
        }
      ],
      services: [
        {
          _id: "service-doc-1",
          id: "service-songhua-dock",
          slug: "songhua-dock",
          name: "松花泊行",
          type: "短途旅行",
          status: "active",
          creatorId: "creator-b",
          creatorRoles: ["创作者"],
          creatorMessage: "沿着松花江慢慢走。",
          regionCodes: ["cn_northeast_region"],
          destinationSlugs: ["harbin"],
          summary: "沿着松花江慢慢走。",
          cover: "cloud://cover.jpg",
          gallery: [],
          galleryGroups: [],
          tags: ["城市"],
          styles: ["城市"],
          travelDetail: {
            id: "travel-songhua-dock",
            title: "松花泊行",
            defaultVersionName: "标准版",
            consultWeChatQr: "cloud://legacy-consult-qr.jpg",
            sections: [],
            overview: {
              coverImage: "cloud://overview.jpg",
              whyJoinText: "从江风和码头开始重新进入这座城市。",
              suitableTitle: "这段旅程适合谁",
              suitableText: "适合想慢下来观察城市纹理的人。"
            },
            highlights: [],
            itinerary: {
              days: []
            },
            itineraryVersions: [],
            costs: {
              include: [],
              exclude: [],
              refundRules: []
            },
            notices: []
          }
        }
      ]
    }
  });

  await __test__.saveService(
    {
      _id: "service-doc-1",
      slug: "songhua-dock",
      name: "松花泊行",
      type: "短途旅行",
      status: "active",
      creatorId: "creator-b",
      creatorRoles: ["创作者"],
      creatorMessage: "沿着松花江慢慢走。",
      regionCodes: ["cn_northeast_region"],
      destinationSlugs: ["harbin"],
      summary: "沿着松花江慢慢走。",
      cover: "cloud://cover.jpg",
      gallery: [],
      galleryGroups: [],
      tags: ["城市"],
      travelDetail: {
        overview: {
          coverImage: "cloud://overview.jpg",
          whyJoinText: "从江风和码头开始重新进入这座城市。",
          suitableTitle: "这段旅程适合谁",
          suitableText: "适合想慢下来观察城市纹理的人。"
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
      }
    },
    { uid: "admin-1", permissions: ["services:write", "services:read"] }
  );

  const serviceUpdate = __mocks__.collectionUpdates.find((item) => item.name === "services" && item.id === "service-doc-1");
  assert.ok(serviceUpdate);
  assert.equal(serviceUpdate.data.travelDetail.consultWeChatQr, "");
});

test("deleteUser removes a user when no travel orders are linked", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    userDocs: {
      "user-1": {
        _id: "user-1",
        openid: "openid-1"
      }
    },
    runSQL: async () => {
      return {
        data: {
          executeResultList: [{ total: 0 }]
        }
      };
    }
  });

  const result = await __test__.deleteUser({ _id: "user-1" });

  assert.deepEqual(result, { _id: "user-1", removed: true });
  assert.deepEqual(__mocks__.removedDocIds, ["user-1"]);
  assert.equal(__mocks__.sqlCalls.length, 1);
  assert.equal(__mocks__.sqlCalls[0].params.openid, "openid-1");
});

test("deleteUser blocks deletion when the user still has travel orders", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    userDocs: {
      "user-2": {
        _id: "user-2",
        openid: "openid-2"
      }
    },
    runSQL: async () => {
      return {
        data: {
          executeResultList: [{ total: 2 }]
        }
      };
    }
  });

  await assert.rejects(
    __test__.deleteUser({ _id: "user-2" }),
    /该用户仍有关联订单，不能直接删除/
  );
  assert.deepEqual(__mocks__.removedDocIds, []);
});

test("deleteUser also checks CloudBase _openid when openid is absent", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    userDocs: {
      "user-3": {
        _id: "user-3",
        _openid: "openid-3"
      }
    },
    runSQL: async () => {
      return {
        data: {
          executeResultList: [{ total: 1 }]
        }
      };
    }
  });

  await assert.rejects(
    __test__.deleteUser({ _id: "user-3" }),
    /该用户仍有关联订单，不能直接删除/
  );
  assert.equal(__mocks__.sqlCalls[0].params.openid, "openid-3");
  assert.deepEqual(__mocks__.removedDocIds, []);
});

test("listOrders filters by exact userId while keeping keyword search within that user scope", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" },
        { _id: "user-2", openid: "openid-2", nickname: "山雀" }
      ]
    },
    runSQL: async () => {
      return {
        data: {
          executeResultList: [
            {
              orderNo: "yz202603280001",
              userOpenid: "openid-1",
              serviceSlug: "miao-night-walk",
              serviceName: "山谷夜步",
              travelDateStart: "2026-04-26",
              status: "paid",
              versionName: "山谷夜步4日",
              peopleCountInt: 2,
              createdAtTs: 1770000000000,
              updatedAt: 1770000001000
            },
            {
              orderNo: "yz202603280002",
              userOpenid: "openid-2",
              serviceSlug: "miao-night-walk",
              serviceName: "山谷夜步",
              travelDateStart: "2026-04-27",
              status: "pending",
              versionName: "山谷夜步4日",
              peopleCountInt: 1,
              createdAtTs: 1770000002000,
              updatedAt: 1770000003000
            }
          ]
        }
      };
    }
  });

  const result = await __test__.listOrders({ keyword: "山谷", userId: "user-1" });

  assert.equal(result.length, 1);
  assert.equal(result[0].orderNo, "yz202603280001");
  assert.equal(result[0].userId, "user-1");
  assert.equal(result[0].userNickname, "海森");
});

test("listOrders matches completed orders by Chinese status keyword", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" },
        { _id: "user-2", openid: "openid-2", nickname: "山雀" }
      ]
    },
    runSQL: async () => {
      return {
        data: {
          executeResultList: [
            {
              orderNo: "yz202603280001",
              userOpenid: "openid-1",
              serviceSlug: "miao-night-walk",
              serviceName: "山谷夜步",
              travelDateStart: "2026-04-26",
              status: "completed",
              versionName: "山谷夜步4日",
              peopleCountInt: 2,
              createdAtTs: 1770000000000,
              updatedAt: 1770000001000
            },
            {
              orderNo: "yz202603280002",
              userOpenid: "openid-2",
              serviceSlug: "miao-night-walk",
              serviceName: "山谷夜步",
              travelDateStart: "2026-04-27",
              status: "pending",
              versionName: "山谷夜步4日",
              peopleCountInt: 1,
              createdAtTs: 1770000002000,
              updatedAt: 1770000003000
            }
          ]
        }
      };
    }
  });

  const result = await __test__.listOrders({ keyword: "已完成", status: "all" });

  assert.equal(result.length, 1);
  assert.equal(result[0].orderNo, "yz202603280001");
  assert.equal(result[0].status, "completed");
});

test("listOrderDebugTestOrders lists only active test order marks", async () => {
  const originalEnabled = process.env.ENABLE_ORDER_DEBUG_TOOL;
  process.env.ENABLE_ORDER_DEBUG_TOOL = "true";
  const orderRows = {
    yz202604160001: {
      orderNo: "yz202604160001",
      userOpenid: "openid-1",
      serviceName: "雨林晨雾观察",
      servicePeriodCode: "gp-rain-2",
      travelDateStart: "2026-05-10",
      travelDateEnd: "2026-05-14",
      status: "completed"
    }
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      order_debug_records: [
        {
          _id: "debug_1",
          orderNo: "yz202604160001",
          isTestOrder: true,
          markedAt: 1776240000000,
          updatedAt: 1776240001000
        },
        {
          _id: "debug_2",
          orderNo: "yz202604160002",
          isTestOrder: false,
          markedAt: 1776240002000,
          updatedAt: 1776240003000
        }
      ]
    },
    runSQL: async (_sql, params) => ({
      data: {
        executeResultList: orderRows[params.orderNo] ? [orderRows[params.orderNo]] : []
      }
    })
  });

  try {
    const result = await __test__.listOrderDebugTestOrders({}, {
      id: "admin-1",
      uid: "admin-1",
      username: "ops",
      adminLevel: "owner",
      accountType: "admin",
      permissions: ["ops:read"]
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].orderNo, "yz202604160001");
    assert.equal(result[0].serviceName, "雨林晨雾观察");
    assert.equal(result[0].status, "completed");
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_ORDER_DEBUG_TOOL;
    } else {
      process.env.ENABLE_ORDER_DEBUG_TOOL = originalEnabled;
    }
  }
});

test("listOrderDebugTestOrders allows admin-level platform admins", async () => {
  const originalEnabled = process.env.ENABLE_ORDER_DEBUG_TOOL;
  process.env.ENABLE_ORDER_DEBUG_TOOL = "true";
  const { __test__ } = loadAdminGatewayModule();

  try {
    const result = await __test__.listOrderDebugTestOrders({}, {
      id: "admin-2",
      uid: "admin-2",
      username: "ops-admin",
      adminLevel: "admin",
      accountType: "admin",
      permissions: ["ops:read"]
    });

    assert.deepEqual(result, []);
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_ORDER_DEBUG_TOOL;
    } else {
      process.env.ENABLE_ORDER_DEBUG_TOOL = originalEnabled;
    }
  }
});

test("order debug mock payout rejects paying status", async () => {
  const originalEnabled = process.env.ENABLE_ORDER_DEBUG_TOOL;
  process.env.ENABLE_ORDER_DEBUG_TOOL = "true";
  const { __test__ } = loadAdminGatewayModule();

  try {
    await assert.rejects(
      () => __test__.handleOrderDebugToolAction({
        action: "mockPayout",
        ledgerId: "ledger_1",
        payoutStatus: "paying"
      }, {
        id: "admin-1",
        uid: "admin-1",
        username: "ops",
        adminLevel: "owner",
        accountType: "admin",
        permissions: ["ops:read"]
      }),
      /不支持的模拟打款状态/
    );
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_ORDER_DEBUG_TOOL;
    } else {
      process.env.ENABLE_ORDER_DEBUG_TOOL = originalEnabled;
    }
  }
});

test("listOrders returns paged results when page arguments are provided", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" },
        { _id: "user-2", openid: "openid-2", nickname: "山雀" }
      ]
    },
    runSQL: async () => {
      return {
        data: {
          executeResultList: [
            {
              orderNo: "yz202603280001",
              userOpenid: "openid-1",
              serviceSlug: "miao-night-walk",
              serviceName: "山谷夜步",
              travelDateStart: "2026-04-26",
              status: "paid",
              versionName: "山谷夜步4日",
              peopleCountInt: 2,
              createdAtTs: 1770000000000,
              updatedAt: 1770000001000
            },
            {
              orderNo: "yz202603280002",
              userOpenid: "openid-2",
              serviceSlug: "miao-night-walk",
              serviceName: "山谷夜步",
              travelDateStart: "2026-04-27",
              status: "pending",
              versionName: "山谷夜步4日",
              peopleCountInt: 1,
              createdAtTs: 1770000002000,
              updatedAt: 1770000003000
            }
          ]
        }
      };
    }
  });

  const result = await __test__.listOrders({
    page: 2,
    pageSize: 1,
    sortBy: "updatedAtTs",
    sortDirection: "desc"
  });

  assert.deepEqual(result, {
    items: [
      {
        orderNo: "yz202603280001",
        serviceSlug: "miao-night-walk",
        serviceName: "山谷夜步",
        travelDateStart: "2026-04-26",
        status: "paid",
        versionName: "山谷夜步4日",
        userId: "user-1",
        userNickname: "海森",
        peopleCount: 2,
        updatedAtTs: 1770000001000
      }
    ],
    total: 2,
    page: 2,
    pageSize: 1
  });
});

test("creator portal listOrders only returns orders for the bound creator", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["orders:read:owned"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "owned-order",
            userOpenid: "openid-1",
            serviceSlug: "owned-route",
            serviceName: "我的路线",
            travelDateStart: "2026-05-01",
            status: "paid",
            versionName: "标准版",
            peopleCountInt: 1,
            createdAtTs: 1770000000000,
            updatedAt: 1770000001000,
            creatorSnapshotJson: JSON.stringify({ id: "creator-1", slug: "creator-one" })
          },
          {
            orderNo: "other-order",
            userOpenid: "openid-1",
            serviceSlug: "other-route",
            serviceName: "别人的路线",
            travelDateStart: "2026-05-02",
            status: "paid",
            versionName: "标准版",
            peopleCountInt: 1,
            createdAtTs: 1770000002000,
            updatedAt: 1770000003000,
            creatorSnapshotJson: JSON.stringify({ id: "creator-2", slug: "creator-two" })
          }
        ]
      }
    })
  });

  const result = await __test__.listOrders({}, creatorAdmin);

  assert.equal(result.length, 1);
  assert.equal(result[0].orderNo, "owned-order");
});

test("getCreatorRelationSummaries returns region, route-compatible destination, service, and idea links for selected creators", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          id: "creator-1",
          slug: "linyue",
          destinationSlugs: ["wuyi", "fujian"]
        }
      ],
      destinations: [
        { slug: "wuyi", name: "武夷山" },
        { slug: "fujian", name: "福建" }
      ],
      services: [
        {
          slug: "wuyi-ink-trail",
          name: "武夷墨迹",
          creatorId: "creator-1",
          regionCodes: ["cn_jiang_zhe_hu"],
          destinationSlugs: ["wuyi", "fujian"]
        }
      ],
      ideas: [
        { slug: "modu-lookbook", title: "魔都看展合集", authorId: "linyue" }
      ]
    }
  });

  const result = await __test__.getCreatorRelationSummaries({
    creatorSlugs: ["linyue"]
  });

  assert.deepEqual(result, {
    linyue: {
      regionCount: 1,
      regions: [
        { code: "cn_jiang_zhe_hu", label: "江浙沪" }
      ],
      destinationCount: 2,
      destinations: [
        { slug: "wuyi", name: "武夷山" },
        { slug: "fujian", name: "福建" }
      ],
      serviceCount: 1,
      services: [
        { slug: "wuyi-ink-trail", name: "武夷墨迹" }
      ],
      ideaCount: 1,
      ideas: [
        { slug: "modu-lookbook", title: "魔都看展合集" }
      ]
    }
  });
});

test("listCreators includes idea counts and applies requested sorting", async () => {
  const adminUser = {
    accountType: "admin",
    permissions: ["creators:read"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          id: "creator-1",
          slug: "linyue",
          name: "林越",
          status: "active",
          destinationSlugs: ["wuyi"],
          updatedAt: 1770000001000
        },
        {
          id: "creator-2",
          slug: "heyu",
          name: "何语",
          status: "active",
          destinationSlugs: [],
          updatedAt: 1770000002000
        }
      ],
      services: [
        { slug: "wuyi-ink-trail", creatorId: "creator-1" }
      ],
      ideas: [
        { slug: "idea-1", authorId: "creator-1" },
        { slug: "idea-2", authorId: "linyue" },
        { slug: "idea-3", authorId: "creator-2" }
      ]
    }
  });

  const result = await __test__.listCreators({
    page: 1,
    pageSize: 2,
    sortBy: "ideaCount",
    sortDirection: "desc"
  }, adminUser);

  assert.deepEqual(result, {
    items: [
      {
        id: "creator-1",
        slug: "linyue",
        name: "林越",
        status: "active",
        stance: "",
        tags: [],
        regionCodes: [],
        regionCount: 0,
        destinationSlugs: [],
        destinationCount: 0,
        serviceCount: 1,
        ideaCount: 2,
        access: {
          canEdit: false,
          canDelete: false,
          canEditSelf: false
        },
        createdAt: 0,
        updatedAt: 1770000001000
      },
      {
        id: "creator-2",
        slug: "heyu",
        name: "何语",
        status: "active",
        stance: "",
        tags: [],
        regionCodes: [],
        regionCount: 0,
        destinationSlugs: [],
        destinationCount: 0,
        serviceCount: 0,
        ideaCount: 1,
        access: {
          canEdit: false,
          canDelete: false,
          canEditSelf: false
        },
        createdAt: 0,
        updatedAt: 1770000002000
      }
    ],
    total: 2,
    page: 1,
    pageSize: 2
  });
});

test("creator portal listCreators keeps the bound creator visible under active filter while leaving others read-only", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-baibaihe",
    permissions: ["creators:read", "creators:write:self"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-baibaihe",
          slug: "baibaihe",
          name: "白百合",
          status: "inactive",
          updatedAt: 1770000001000
        },
        {
          _id: "creator-doc-2",
          id: "creator-other",
          slug: "other",
          name: "别人",
          status: "active",
          updatedAt: 1770000002000
        }
      ],
      services: [],
      ideas: []
    }
  });

  const result = await __test__.listCreators({
    status: "active",
    page: 1,
    pageSize: 10
  }, creatorAdmin);

  assert.deepEqual(result, {
    items: [
      {
        id: "creator-other",
        slug: "other",
        name: "别人",
        status: "active",
        stance: "",
        tags: [],
        regionCodes: [],
        regionCount: 0,
        destinationSlugs: [],
        destinationCount: 0,
        serviceCount: 0,
        ideaCount: 0,
        access: {
          canEdit: false,
          canDelete: false,
          canEditSelf: false
        },
        createdAt: 0,
        updatedAt: 1770000002000
      },
      {
        id: "creator-baibaihe",
        slug: "baibaihe",
        name: "白百合",
        status: "inactive",
        stance: "",
        tags: [],
        regionCodes: [],
        regionCount: 0,
        destinationSlugs: [],
        destinationCount: 0,
        serviceCount: 0,
        ideaCount: 0,
        access: {
          canEdit: true,
          canDelete: false,
          canEditSelf: true
        },
        createdAt: 0,
        updatedAt: 1770000001000
      }
    ],
    total: 2,
    page: 1,
    pageSize: 10
  });
});

test("creator portal mine scope narrows creator and service lists and blocks destination data", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-linyue",
    permissions: ["creators:read", "services:read", "destinations:read"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      creators: [
        {
          id: "creator-linyue",
          slug: "linyue",
          name: "林越",
          status: "active",
          destinationSlugs: ["manual-destination"],
          updatedAt: 1770000001000
        },
        {
          id: "creator-other",
          slug: "other",
          name: "别人",
          status: "active",
          destinationSlugs: ["other-destination"],
          updatedAt: 1770000002000
        }
      ],
      services: [
        {
          id: "service-own",
          slug: "own-route",
          name: "自己的路线",
          status: "active",
          creatorId: "creator-linyue",
          destinationSlugs: ["wuyi"],
          gallery: [],
          updatedAt: 1770000003000
        },
        {
          id: "service-other",
          slug: "other-route",
          name: "别人的路线",
          status: "active",
          creatorId: "creator-other",
          destinationSlugs: ["other-destination"],
          gallery: [],
          updatedAt: 1770000004000
        }
      ],
      destinations: [
        { id: "destination-wuyi", slug: "wuyi", name: "武夷", status: "active", updatedAt: 1770000005000 },
        { id: "destination-manual", slug: "manual-destination", name: "手动关联", status: "active", updatedAt: 1770000006000 },
        { id: "destination-other", slug: "other-destination", name: "别人的目的地", status: "active", updatedAt: 1770000007000 }
      ],
      ideas: []
    }
  });

  const creators = await __test__.listCreators({ scope: "mine", page: 1, pageSize: 10 }, creatorAdmin);
  const services = await __test__.listServices({ scope: "mine", page: 1, pageSize: 10 }, creatorAdmin);

  assert.deepEqual(creators.items.map((item) => item.slug), ["linyue"]);
  assert.deepEqual(services.items.map((item) => item.slug), ["own-route"]);
  await assert.rejects(
    () => __test__.listDestinations({ scope: "mine", page: 1, pageSize: 10 }, creatorAdmin),
    /当前账号没有查看目的地的权限/
  );
});

test("listOrders filters by exact traveler linkage when traveler ids are provided", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ]
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "yz202604100001",
            userOpenid: "openid-1",
            serviceSlug: "wuyi-ink-trail",
            serviceName: "武夷墨迹",
            travelDateStart: "2026-04-20",
            status: "paid",
            versionName: "春季线",
            peopleCountInt: 1,
            travelersJson: JSON.stringify([
              {
                name: "阿野",
                documentType: "passport",
                documentNumber: "E12345678",
                phone: "13800000000"
              }
            ]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          },
          {
            orderNo: "yz202604100002",
            userOpenid: "openid-1",
            serviceSlug: "other-route",
            serviceName: "别的路线",
            travelDateStart: "2026-05-01",
            status: "pending",
            versionName: "体验版",
            peopleCountInt: 1,
            travelersJson: JSON.stringify([
              {
                name: "另一个人",
                documentType: "passport",
                documentNumber: "P99887766",
                phone: "13900000000"
              }
            ]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786404000
          }
        ]
      }
    })
  });

  const result = await __test__.listOrders({
    travelerRecordId: "traveler_doc_1",
    travelerProfileId: "profile_1"
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].orderNo, "yz202604100001");
});

test("listOrders filters by servicePeriodCode", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" },
        { _id: "user-2", openid: "openid-2", nickname: "山雀" }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "yz202604100001",
            userOpenid: "openid-1",
            serviceSlug: "miao-night-walk",
            serviceName: "山谷夜步",
            servicePeriodCode: "MNW20260426",
            travelDateStart: "2026-04-26",
            status: "paid",
            versionName: "山谷夜步4日",
            peopleCountInt: 2,
            createdAtTs: 1775786400000,
            updatedAt: 1775786401000
          },
          {
            orderNo: "yz202604100002",
            userOpenid: "openid-2",
            serviceSlug: "miao-night-walk",
            serviceName: "山谷夜步",
            servicePeriodCode: "MNW20260427",
            travelDateStart: "2026-04-27",
            status: "pending",
            versionName: "山谷夜步4日",
            peopleCountInt: 1,
            createdAtTs: 1775786402000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  const result = await __test__.listOrders({ servicePeriodCode: "MNW20260426" });

  assert.equal(result.length, 1);
  assert.equal(result[0].orderNo, "yz202604100001");
  assert.equal(result[0].servicePeriodCode, "MNW20260426");
});

test("getOrderDetail prefers new order contact fields and keeps traveler profile linkage", async () => {
  const orderRow = {
    orderNo: "yz202604100001",
    shortId: "0001",
    userOpenid: "openid-1",
    orderContactName: "新联系人",
    orderContactPhone: "13900000000",
    travelerName: "旧联系人",
    travelerPhone: "13800000000",
    emergencyContactName: "紧急联系人",
    emergencyContactPhone: "13700000000",
    travelersJson: JSON.stringify([
      {
        n: "阿野",
        p: "13800000000",
        t: "passport",
        i: "E12345678",
        pid: "profile_1",
        rid: "traveler_doc_1",
        src: "traveler_profile"
      }
    ]),
    serviceSnapshotJson: JSON.stringify({
      serviceSlug: "wuyi-ink-trail",
      serviceName: "武夷墨迹",
      travelers: [
        {
          name: "阿野",
          phone: "13800000000",
          documentType: "passport",
          documentNumber: "E12345678",
          profileId: "profile_1",
          travelerRecordId: "traveler_doc_1",
          source: "traveler_profile"
        }
      ]
    }),
    creatorSnapshotJson: "{}",
    serviceSlug: "wuyi-ink-trail",
    serviceName: "武夷墨迹",
    serviceType: "长途旅行",
    serviceCover: "cover.jpg",
    servicePeriodCode: "WY20260401",
    versionName: "清明团",
    travelDate: "2026-04-20",
    travelDateStart: "2026-04-20",
    travelDateEnd: "2026-04-22",
    peopleCountInt: 1,
    amountDec: 1998,
    discountDec: 100,
    payableDec: 1898,
    status: "paid",
    createdAtText: "2026/04/10 10:00:00",
    createdAtTs: 1775786400000,
    updatedAt: 1775786401000
  };

  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [orderRow]
      }
    })
  });

  const result = await __test__.getOrderDetail({
    orderNo: "yz202604100001"
  });

  assert.equal(result.orderContactName, "新联系人");
  assert.equal(result.orderContactPhone, "13900000000");
  assert.equal(result.emergencyContactName, "紧急联系人");
  assert.equal(result.serviceSnapshot.contact.name, "新联系人");
  assert.equal(result.travelers[0].profileId, "profile_1");
  assert.equal(result.travelers[0].travelerRecordId, "traveler_doc_1");
  assert.equal(result.travelers[0].source, "traveler_profile");
  assert.equal(result.travelers[0].matchedTravelerRecordId, "traveler_doc_1");
  assert.equal(result.travelers[0].matchedProfileId, "profile_1");
  assert.equal(result.travelers[0].isLinkedToTravelerProfile, true);
});

test("creator portal getOrderDetail rejects orders outside the bound creator scope", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["orders:detail:owned"]
  };
  const orderRow = {
    orderNo: "yz202604100099",
    shortId: "0099",
    userOpenid: "openid-1",
    travelersJson: "[]",
    serviceSnapshotJson: "{}",
    creatorSnapshotJson: JSON.stringify({ id: "creator-2", slug: "creator-two" }),
    serviceSlug: "other-route",
    serviceName: "别人的路线",
    serviceType: "长途旅行",
    serviceCover: "cover.jpg",
    servicePeriodCode: "OTHER20260401",
    versionName: "外部团",
    travelDate: "2026-04-20",
    travelDateStart: "2026-04-20",
    travelDateEnd: "2026-04-22",
    peopleCountInt: 1,
    amountDec: 1998,
    discountDec: 0,
    payableDec: 1998,
    status: "paid",
    createdAtText: "2026/04/10 10:00:00",
    createdAtTs: 1775786400000,
    updatedAt: 1775786401000
  };
  const { __test__ } = loadAdminGatewayModule({
    runSQL: async () => ({
      data: {
        executeResultList: [orderRow]
      }
    })
  });

  await assert.rejects(
    __test__.getOrderDetail({ orderNo: "yz202604100099" }, creatorAdmin),
    /未找到对应订单/
  );
});

test("getUserDetail returns traveler record ids for saved traveler profiles", async () => {
  const { __test__ } = loadAdminGatewayModule({
    userDocs: {
      "user-1": {
        _id: "user-1",
        openid: "openid-1",
        nickname: "海森",
        createdAt: 1775786400000,
        updatedAt: 1775786400000
      }
    },
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [
            {
              documentType: "passport",
              documentNumber: "E12345678"
            }
          ],
          status: "active",
          source: "traveler_profile",
          updatedAt: 1775786401000,
          createdAt: 1775786400000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: []
      }
    })
  });

  const result = await __test__.getUserDetail({
    userId: "user-1"
  });

  assert.equal(result.travelers.length, 1);
  assert.equal(result.travelers[0].travelerRecordId, "traveler_doc_1");
  assert.equal(result.travelers[0].profileId, "profile_1");
});

test("listTravelers returns paged traveler summaries with related order stats", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ],
          status: "active",
          source: "traveler_profile",
          updatedAt: 1775786401000,
          lastUsedAt: 1775786402000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "yz202604100001",
            userOpenid: "openid-1",
            serviceSlug: "wuyi-ink-trail",
            serviceName: "武夷墨迹",
            servicePeriodCode: "WY20260420",
            versionName: "古道静心4日",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            travelersJson: JSON.stringify([
              {
                pid: "profile_1",
                rid: "traveler_doc_1",
                src: "traveler_profile",
                n: "阿野"
              }
            ]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  const result = await __test__.listTravelers({
    page: 1,
    pageSize: 10,
    keyword: "阿野"
  });

  assert.deepEqual(result, {
    items: [
      {
        travelerRecordId: "traveler_doc_1",
        travelerId: "profile_1",
        profileId: "profile_1",
        name: "阿野",
        phoneMasked: "138****0000",
        wechat: "",
        email: "",
        idType: "passport",
        idNumberMasked: "E12***678",
        gender: "",
        birthday: "",
        status: "active",
        source: "traveler_profile",
        version: 1,
        updatedAt: 1775786401000,
        lastUsedAt: 1775786402000,
        documents: [
          {
            documentType: "passport",
            documentNumberMasked: "E12***678"
          }
        ],
        relatedOrderCount: 1,
        lastRelatedOrderNo: "yz202604100001",
        lastRelatedOrderStatus: "paid",
        lastRelatedOrderAt: 1775786403000,
        lastRelatedServiceName: "武夷墨迹",
        userId: "user-1",
        userOpenid: "openid-1",
        userNickname: "海森"
      }
    ],
    total: 1,
    page: 1,
    pageSize: 10
  });
});

test("creator portal listTravelers only returns travelers linked to owned orders", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["travelers:read:owned"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [{ documentType: "passport", documentNumber: "E12345678" }],
          status: "active",
          source: "traveler_profile",
          updatedAt: 1775786401000
        },
        {
          _id: "traveler_doc_2",
          travelerId: "profile_2",
          profileId: "profile_2",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿青",
          phone: "13900000000",
          documents: [{ documentType: "passport", documentNumber: "P99887766" }],
          status: "active",
          source: "traveler_profile",
          updatedAt: 1775786402000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "owned-order",
            userOpenid: "openid-1",
            serviceSlug: "owned-route",
            serviceName: "我的路线",
            servicePeriodCode: "OWNED-1",
            versionName: "标准版",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            creatorSnapshotJson: JSON.stringify({ id: "creator-1", slug: "creator-one" }),
            travelersJson: JSON.stringify([{ pid: "profile_1", rid: "traveler_doc_1", src: "traveler_profile", n: "阿野" }]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          },
          {
            orderNo: "other-order",
            userOpenid: "openid-1",
            serviceSlug: "other-route",
            serviceName: "别人的路线",
            servicePeriodCode: "OTHER-1",
            versionName: "标准版",
            status: "paid",
            travelDateStart: "2026-04-21",
            travelDateEnd: "2026-04-23",
            creatorSnapshotJson: JSON.stringify({ id: "creator-2", slug: "creator-two" }),
            travelersJson: JSON.stringify([{ pid: "profile_2", rid: "traveler_doc_2", src: "traveler_profile", n: "阿青" }]),
            createdAtTs: 1775786401000,
            updatedAt: 1775786404000
          }
        ]
      }
    })
  });

  const result = await __test__.listTravelers({ page: 1, pageSize: 10 }, creatorAdmin);

  assert.equal(result.total, 1);
  assert.equal(result.items[0].travelerRecordId, "traveler_doc_1");
});

test("creator portal listTravelers ignores persisted relation counters without visible owned orders", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["travelers:read:owned"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "黎海森",
          phone: "13800000000",
          documents: [{ documentType: "passport", documentNumber: "E12345678" }],
          status: "active",
          source: "traveler_profile",
          relatedOrderCount: 1,
          lastRelatedOrderNo: "foreign-order",
          updatedAt: 1775786401000
        },
        {
          _id: "traveler_doc_2",
          travelerId: "profile_2",
          profileId: "profile_2",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "测试",
          phone: "13900000000",
          documents: [{ documentType: "passport", documentNumber: "P99887766" }],
          status: "inactive",
          source: "traveler_profile",
          relatedOrderCount: 1,
          lastRelatedOrderNo: "foreign-order",
          updatedAt: 1775786402000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "owned-order",
            userOpenid: "openid-1",
            serviceSlug: "owned-route",
            serviceName: "我的路线",
            servicePeriodCode: "OWNED-1",
            versionName: "标准版",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            creatorSnapshotJson: JSON.stringify({ id: "creator-1", slug: "creator-one" }),
            travelersJson: JSON.stringify([{ pid: "profile_1", rid: "traveler_doc_1", src: "traveler_profile", n: "黎海森" }]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  const result = await __test__.listTravelers({ page: 1, pageSize: 10 }, creatorAdmin);

  assert.equal(result.total, 1);
  assert.equal(result.items[0].travelerRecordId, "traveler_doc_1");
});

test("listTravelers matches related orders for legacy traveler snapshots without explicit refs", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ],
          idType: "passport",
          idNumber: "E12345678",
          status: "active",
          source: "traveler_profile",
          updatedAt: 1775786401000,
          lastUsedAt: 1775786402000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "yz202604100002",
            userOpenid: "openid-1",
            serviceSlug: "wuyi-ink-trail",
            serviceName: "武夷墨迹",
            servicePeriodCode: "WY20260420",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            travelersJson: JSON.stringify([
              {
                name: "阿野",
                documentType: "passport",
                documentNumber: "E12345678",
                phone: "13800000000"
              }
            ]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  const result = await __test__.listTravelers({
    page: 1,
    pageSize: 10,
    keyword: "阿野"
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].relatedOrderCount, 1);
  assert.equal(result.items[0].lastRelatedOrderNo, "yz202604100002");
  assert.equal(result.items[0].lastRelatedOrderStatus, "paid");
});

test("listTravelers does not match legacy traveler snapshots by name only", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ],
          idType: "passport",
          idNumber: "E12345678",
          status: "active",
          source: "traveler_profile",
          updatedAt: 1775786401000,
          lastUsedAt: 1775786402000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "yz202604100003",
            userOpenid: "openid-1",
            serviceSlug: "wuyi-ink-trail",
            serviceName: "武夷墨迹",
            servicePeriodCode: "WY20260420",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            travelersJson: JSON.stringify([
              {
                name: "阿野"
              }
            ]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  const result = await __test__.listTravelers({
    page: 1,
    pageSize: 10,
    keyword: "阿野"
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].relatedOrderCount, 0);
  assert.equal(result.items[0].lastRelatedOrderNo, "");
});

test("getTravelerDetail returns full traveler info and related orders", async () => {
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          phoneMasked: "138****0000",
          wechat: "wild_yezai",
          email: "a@example.com",
          note: "靠窗",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ],
          idType: "passport",
          idNumber: "E12345678",
          status: "active",
          source: "traveler_profile",
          version: 3,
          createdAt: 1775786400000,
          updatedAt: 1775786401000,
          lastUsedAt: 1775786402000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "yz202604100001",
            userOpenid: "openid-1",
            serviceSlug: "wuyi-ink-trail",
            serviceName: "武夷墨迹",
            servicePeriodCode: "WY20260420",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            travelersJson: JSON.stringify([
              {
                pid: "profile_1",
                rid: "traveler_doc_1",
                src: "traveler_profile",
                n: "阿野"
              }
            ]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  const result = await __test__.getTravelerDetail({
    travelerId: "traveler_doc_1"
  });

  assert.equal(result.travelerRecordId, "traveler_doc_1");
  assert.equal(result.profileId, "profile_1");
  assert.equal(result.userNickname, "海森");
  assert.equal(result.phone, "13800000000");
  assert.equal(result.wechat, "wild_yezai");
  assert.equal(result.documents[0].documentNumber, "E12345678");
  assert.equal(result.relatedOrderCount, 1);
  assert.equal(result.relatedOrders[0].orderNo, "yz202604100001");
  assert.equal(result.relatedOrders[0].versionName, "古道静心4日");
});

test("creator portal getTravelerDetail rejects travelers without owned related orders", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["travelers:detail:owned", "travelers:sensitive:read:owned"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          phoneMasked: "138****0000",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ],
          status: "active",
          source: "traveler_profile",
          createdAt: 1775786400000,
          updatedAt: 1775786401000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "other-order",
            userOpenid: "openid-1",
            serviceSlug: "other-route",
            serviceName: "别人的路线",
            servicePeriodCode: "OTHER-1",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            creatorSnapshotJson: JSON.stringify({ id: "creator-2", slug: "creator-two" }),
            travelersJson: JSON.stringify([{ pid: "profile_1", rid: "traveler_doc_1", src: "traveler_profile", n: "阿野" }]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  await assert.rejects(
    __test__.getTravelerDetail({ travelerId: "traveler_doc_1" }, creatorAdmin),
    /未找到对应出行人/
  );
});

test("creator portal getTravelerDetail ignores persisted relation counters when no owned orders match", async () => {
  const creatorAdmin = {
    accountType: "creator_portal",
    boundCreatorId: "creator-1",
    permissions: ["travelers:detail:owned", "travelers:sensitive:read:owned"]
  };
  const { __test__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_2",
          travelerId: "profile_2",
          profileId: "profile_2",
          userId: "user-1",
          userOpenid: "openid-1",
          name: "测试",
          phone: "13900000000",
          phoneMasked: "139****0000",
          documents: [{ documentType: "passport", documentNumber: "P99887766" }],
          status: "inactive",
          source: "traveler_profile",
          relatedOrderCount: 1,
          lastRelatedOrderNo: "foreign-order",
          createdAt: 1775786400000,
          updatedAt: 1775786401000
        }
      ]
    },
    runSQL: async () => ({
      data: {
        executeResultList: [
          {
            orderNo: "owned-order",
            userOpenid: "openid-1",
            serviceSlug: "owned-route",
            serviceName: "我的路线",
            servicePeriodCode: "OWNED-1",
            versionName: "标准版",
            status: "paid",
            travelDateStart: "2026-04-20",
            travelDateEnd: "2026-04-22",
            creatorSnapshotJson: JSON.stringify({ id: "creator-1", slug: "creator-one" }),
            travelersJson: JSON.stringify([{ pid: "profile_1", rid: "traveler_doc_1", src: "traveler_profile", n: "黎海森" }]),
            createdAtTs: 1775786400000,
            updatedAt: 1775786403000
          }
        ]
      }
    })
  });

  await assert.rejects(
    __test__.getTravelerDetail({ travelerId: "traveler_doc_2" }, creatorAdmin),
    /未找到对应出行人/
  );
});

test("backfillOrderContactFields fills new contact fields from legacy traveler columns", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    runSQL: async (sql, params) => {
      if (sql.includes("SELECT `orderNo`, `orderContactName`, `orderContactPhone`, `travelerName`, `travelerPhone` FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                orderNo: "yz202604100001",
                orderContactName: "",
                orderContactPhone: "",
                travelerName: "旧联系人",
                travelerPhone: "13800000000"
              },
              {
                orderNo: "yz202604100002",
                orderContactName: "新联系人",
                orderContactPhone: "13900000000",
                travelerName: "旧联系人",
                travelerPhone: "13800000000"
              }
            ]
          }
        };
      }

      if (sql.startsWith("UPDATE `TravelOrder` SET `orderContactName`")) {
        return {
          data: {
            executeResultList: []
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

  const result = await __test__.backfillOrderContactFields({
    limit: 20
  });

  assert.equal(result.scannedOrders, 2);
  assert.equal(result.updatedOrders, 1);
  assert.equal(result.skippedOrders, 1);
  assert.equal(result.errorCount, 0);
  assert.deepEqual(result.updatedSamples[0], {
    orderNo: "yz202604100001",
    orderContactName: "旧联系人",
    orderContactPhone: "13800000000"
  });
  assert.deepEqual(__mocks__.sqlCalls[1], {
    sql: "UPDATE `TravelOrder` SET `orderContactName` = {{orderContactName}}, `orderContactPhone` = {{orderContactPhone}} WHERE `orderNo` = {{orderNo}} LIMIT 1",
    params: {
      orderNo: "yz202604100001",
      orderContactName: "旧联系人",
      orderContactPhone: "13800000000"
    }
  });
});

test("backfillOrderTravelerProfileRefs only writes unique traveler matches into order snapshots", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      user_travelers: [
        {
          _id: "traveler_doc_1",
          travelerId: "profile_1",
          profileId: "profile_1",
          userOpenid: "openid-1",
          name: "阿野",
          phone: "13800000000",
          documents: [
            { documentType: "passport", documentNumber: "E12345678" }
          ],
          source: "traveler_profile"
        },
        {
          _id: "traveler_doc_2",
          travelerId: "profile_2",
          profileId: "profile_2",
          userOpenid: "openid-1",
          name: "重名",
          phone: "13811110000",
          source: "traveler_profile"
        },
        {
          _id: "traveler_doc_3",
          travelerId: "profile_3",
          profileId: "profile_3",
          userOpenid: "openid-1",
          name: "重名",
          phone: "13822220000",
          source: "traveler_profile"
        },
        {
          _id: "traveler_doc_4",
          travelerId: "profile_4",
          profileId: "profile_4",
          userOpenid: "openid-1",
          name: "已关联",
          phone: "13833330000",
          source: "traveler_profile"
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("SELECT `orderNo`, `userOpenid`, `travelersJson` FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                orderNo: "yz202604100010",
                userOpenid: "openid-1",
                travelersJson: JSON.stringify([
                  {
                    n: "阿野",
                    i: "E12345678",
                    p: "13800000000"
                  },
                  {
                    n: "重名"
                  },
                  {
                    n: "已关联",
                    pid: "profile_4",
                    rid: "traveler_doc_4",
                    src: "traveler_profile"
                  }
                ])
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

  const result = await __test__.backfillOrderTravelerProfileRefs({
    limit: 20
  });

  assert.equal(result.scannedOrders, 1);
  assert.equal(result.scannedTravelers, 3);
  assert.equal(result.updatedOrders, 1);
  assert.equal(result.updatedTravelerRefs, 1);
  assert.equal(result.alreadyLinkedTravelers, 1);
  assert.equal(result.multiMatchedTravelers, 1);
  assert.equal(result.unmatchedTravelers, 0);
  assert.equal(result.errorCount, 0);
  assert.deepEqual(result.updatedSamples[0], {
    orderNo: "yz202604100010",
    travelerIndex: 0,
    name: "阿野",
    profileId: "profile_1",
    travelerRecordId: "traveler_doc_1",
    reason: "document_name"
  });
  const updateCall = __mocks__.sqlCalls.find((item) => item.sql.startsWith("UPDATE `TravelOrder` SET `travelersJson`"));
  assert.ok(updateCall);
  const updatedTravelers = JSON.parse(updateCall.params.travelersJson);
  assert.deepEqual(updatedTravelers[0], {
    n: "阿野",
    i: "E12345678",
    p: "13800000000",
    pid: "profile_1",
    rid: "traveler_doc_1",
    src: "traveler_profile"
  });
  assert.deepEqual(updatedTravelers[1], {
    n: "重名"
  });
  assert.deepEqual(updatedTravelers[2], {
    n: "已关联",
    pid: "profile_4",
    rid: "traveler_doc_4",
    src: "traveler_profile"
  });
});

test("backfillOrderTravelerProfileRefs ignores inactive non-profile traveler records", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_old",
          travelerId: "profile_old",
          profileId: "profile_old",
          userOpenid: "openid-1",
          name: "登顶云",
          phone: "13122276786",
          documents: [
            { documentType: "idCard", documentNumber: "500227198706090016" },
            { documentType: "passport", documentNumber: "E1231231" }
          ],
          source: "miniapp_checkout",
          status: "inactive"
        },
        {
          _id: "traveler_doc_new",
          travelerId: "profile_new",
          profileId: "profile_new",
          userOpenid: "openid-1",
          name: "登顶云",
          phone: "13122276786",
          documents: [
            { documentType: "idCard", documentNumber: "500227198706090016" },
            { documentType: "passport", documentNumber: "E11111111" }
          ],
          source: "traveler_profile",
          status: "active"
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("SELECT `orderNo`, `userOpenid`, `travelersJson` FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                orderNo: "yz202604110001",
                userOpenid: "openid-1",
                travelersJson: JSON.stringify([
                  {
                    n: "登顶云",
                    i: "500227198706090016",
                    ds: [
                      { t: "idCard", i: "500227198706090016" },
                      { t: "passport", i: "E11111111" }
                    ],
                    p: "13122276786"
                  }
                ])
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

  const result = await __test__.backfillOrderTravelerProfileRefs({
    limit: 20
  });

  assert.equal(result.updatedOrders, 1);
  assert.equal(result.updatedTravelerRefs, 1);
  assert.equal(result.multiMatchedTravelers, 0);
  assert.equal(result.unmatchedTravelers, 0);
  assert.deepEqual(result.updatedSamples[0], {
    orderNo: "yz202604110001",
    travelerIndex: 0,
    name: "登顶云",
    profileId: "profile_new",
    travelerRecordId: "traveler_doc_new",
    reason: "document_name"
  });
  const updateCall = __mocks__.sqlCalls.find((item) => item.sql.startsWith("UPDATE `TravelOrder` SET `travelersJson`"));
  assert.ok(updateCall);
  const updatedTravelers = JSON.parse(updateCall.params.travelersJson);
  assert.deepEqual(updatedTravelers[0], {
    n: "登顶云",
    i: "500227198706090016",
    ds: [
      { t: "idCard", i: "500227198706090016" },
      { t: "passport", i: "E11111111" }
    ],
    p: "13122276786",
    pid: "profile_new",
    rid: "traveler_doc_new",
    src: "traveler_profile"
  });
});

test("backfillTravelerOrderStats syncs traveler order aggregates onto user_travelers", async () => {
  const { __test__, __mocks__ } = loadAdminGatewayModule({
    collectionData: {
      users: [
        { _id: "user-1", openid: "openid-1", nickname: "海森" }
      ],
      user_travelers: [
        {
          _id: "traveler_doc_1",
          profileId: "profile_1",
          travelerId: "",
          userOpenid: "openid-1",
          userId: "",
          relatedOrderCount: 0,
          lastRelatedOrderNo: "",
          lastRelatedOrderStatus: "",
          lastRelatedOrderAt: 0,
          lastRelatedServiceName: "",
          lastUsedAt: 0
        },
        {
          _id: "traveler_doc_2",
          profileId: "profile_2",
          travelerId: "profile_2",
          userOpenid: "openid-1",
          userId: "user-1",
          relatedOrderCount: 0,
          lastRelatedOrderNo: "",
          lastRelatedOrderStatus: "",
          lastRelatedOrderAt: 0,
          lastRelatedServiceName: "",
          lastUsedAt: 0
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("SELECT `orderNo`, `userOpenid`, `serviceSlug`, `serviceName`, `servicePeriodCode`, `status`, `travelDateStart`, `travelDateEnd`, `travelersJson`, `createdAtTs`, `updatedAt` FROM `TravelOrder`")) {
        return {
          data: {
            executeResultList: [
              {
                orderNo: "yz202604100099",
                userOpenid: "openid-1",
                serviceSlug: "wuyi-ink-trail",
                serviceName: "武夷墨迹",
                servicePeriodCode: "WY20260420",
                status: "paid",
                travelDateStart: "2026-04-20",
                travelDateEnd: "2026-04-22",
                travelersJson: JSON.stringify([
                  {
                    pid: "profile_1",
                    rid: "traveler_doc_1",
                    src: "traveler_profile",
                    n: "阿野"
                  }
                ]),
                createdAtTs: 1775786400000,
                updatedAt: 1775786403000
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

  const result = await __test__.backfillTravelerOrderStats({});

  assert.equal(result.scannedTravelers, 2);
  assert.equal(result.scannedOrders, 1);
  assert.equal(result.updatedTravelers, 1);
  assert.equal(result.skippedTravelers, 1);
  assert.equal(result.errorCount, 0);
  assert.deepEqual(__mocks__.collectionUpdates, [
    {
      name: "user_travelers",
      id: "traveler_doc_1",
      data: {
        travelerId: "profile_1",
        userId: "user-1",
        relatedOrderCount: 1,
        lastRelatedOrderNo: "yz202604100099",
        lastRelatedOrderStatus: "paid",
        lastRelatedOrderAt: 1775786403000,
        lastRelatedServiceName: "武夷墨迹",
        lastUsedAt: 1775786403000
      }
    }
  ]);
});

test("buildSyntheticOrderStatusLogs does not duplicate the initial pending status", () => {
  const { __test__ } = loadAdminGatewayModule();
  const logs = __test__.buildSyntheticOrderStatusLogs({
    status: "pending",
    createdAtTs: 1774868400000,
    createdAtText: "2026/03/23 19:00:00",
    updatedAt: 1774868400999
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "pending");
  assert.equal(logs[0].source, "create");
});

test("creator registration review lists applicants by status and keyword", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-1",
          authUserId: "applicant-1",
          authEmail: "creator@example.com",
          contactEmail: "creator@example.com",
          applicantName: "林越",
          phone: "13800000000",
          stance: "带人靠近地方",
          status: "submitted",
          updatedAt: 1775318400000,
          approvalEmailStatus: "pending"
        },
        {
          _id: "registration-2",
          authUserId: "applicant-2",
          authEmail: "other@example.com",
          contactEmail: "other@example.com",
          applicantName: "阿岚",
          phone: "13900000000",
          stance: "山野观察",
          status: "draft",
          updatedAt: 1775318300000,
          approvalEmailStatus: "pending"
        }
      ]
    }
  });

  const result = await gateway.main({
    action: "listCreatorRegistrations",
    payload: {
      status: "submitted",
      keyword: "林"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].registrationId, "registration-1");
  assert.equal(result.data[0].status, "submitted");
  assert.equal(result.data[0].approvalEmailStatus, "pending");
});

test("listServices skips SQL aggregation for lightweight option lists", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      services: [
        {
          _id: "service-doc-1",
          id: "service-1",
          slug: "wuyi-ink-trail",
          name: "武夷墨迹",
          type: "multi_day",
          status: "active",
          creatorId: "creator-1",
          creatorMessage: "一起走进茶山里。",
          destinationSlugs: ["wuyi"],
          tags: ["山野"],
          summary: "岩茶与山径",
          cover: "cloud://service-cover.jpg",
          gallery: [],
          galleryGroups: [],
          travelDetail: {
            overview: {
              coverImage: "cloud://service-cover.jpg",
              whyJoinText: "看山，也看制茶的人。",
              suitableText: "适合第一次走进武夷山腹地的人。"
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
          }
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        }
      ]
    },
    runSQL: async () => {
      throw new Error("listServices option list should not hit SQL");
    }
  });

  const result = await gateway.main({
    action: "listServices",
    payload: {
      keyword: "",
      limit: 200
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].slug, "wuyi-ink-trail");
  assert.equal(result.data[0].periodCount, 0);
  assert.equal(result.data[0].remainingSeats, 0);
  assert.equal(gateway.__mocks__.sqlCalls.length, 0);
});

test("listServices page degrades gracefully when period SQL is unavailable", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      services: [
        {
          _id: "service-doc-1",
          id: "service-1",
          slug: "wuyi-ink-trail",
          name: "武夷墨迹",
          type: "multi_day",
          status: "active",
          creatorId: "creator-1",
          creatorMessage: "一起走进茶山里。",
          destinationSlugs: ["wuyi"],
          tags: ["山野"],
          summary: "岩茶与山径",
          cover: "cloud://service-cover.jpg",
          gallery: [],
          galleryGroups: [],
          travelDetail: {
            overview: {
              coverImage: "cloud://service-cover.jpg",
              whyJoinText: "看山，也看制茶的人。",
              suitableText: "适合第一次走进武夷山腹地的人。"
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
          updatedAt: 1775318400000
        }
      ],
      creators: [
        {
          _id: "creator-doc-1",
          id: "creator-1",
          slug: "linyue",
          name: "林越"
        }
      ]
    },
    runSQL: async (sql) => {
      if (sql.includes("FROM `ServicePeriod`")) {
        throw new Error("serverless instance is resuming");
      }

      return {
        data: {
          executeResultList: []
        }
      };
    }
  });

  const result = await gateway.main({
    action: "listServices",
    payload: {
      keyword: "",
      status: "active",
      page: 1,
      pageSize: 10,
      sortBy: "updatedAt",
      sortDirection: "desc"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].slug, "wuyi-ink-trail");
  assert.equal(result.data.items[0].periodCount, 0);
  assert.equal(result.data.items[0].remainingSeats, 0);
  assert.equal(gateway.__mocks__.sqlCalls.length, 1);
});

test("creator registration approve auto-provisions creator portal access and sends activation mail when applicant has no password", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-1" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-001",
          authUserId: "applicant-001",
          authEmail: "creator@example.com",
          contactEmail: "creator@example.com",
          applicantName: "林越",
          phone: "13800000000",
          gender: "female",
          birthday: "1990-01-01",
          documentType: "id_card",
          documentNumber: "310101199001010000",
          wechat: "linyue_01",
          avatar: "cloud://creator/avatar.png",
          stance: "把人带进地方内部。",
          about: ["长期做田野旅行。"],
          status: "submitted",
          updatedAt: 1775318400000,
          approvalEmailStatus: "pending"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-001": {
        id: "applicant-001",
        email: "creator@example.com",
        user_metadata: { hasPassword: false }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-001",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.rejectionReason, "");
  assert.equal(result.data.linkedCreatorId.startsWith("creator-"), true);
  assert.equal(Boolean(result.data.linkedCreatorSlug), true);
  assert.equal(result.data.accessProvisionStatus, "activation_pending");
  assert.equal(result.data.linkedAdminAccountId.startsWith("admin_accounts_"), true);
  assert.match(result.data.activationTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(typeof result.data.activationExpiresAt, "number");
  assert.equal(result.data.activationConsumedAt, 0);
  assert.equal(result.data.activationEmailStatus, "sent");
  assert.equal(typeof result.data.activationEmailSentAt, "number");
  assert.equal(result.data.activationEmailError, "");
  assert.equal(result.data.approvalEmailStatus, "pending");
  assert.equal(result.data.approvalEmailSentAt, 0);
  assert.equal(result.data.approvalEmailError, "");
  assert.equal(result.data.accessProvisionError, "");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "creators"), true);
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), true);
  const accountAdd = gateway.__mocks__.collectionAdds.find((entry) => entry.name === "admin_accounts");
  assert.equal(accountAdd.data.realName, "林越");
  assert.equal(accountAdd.data.phone, "13800000000");
  assert.equal(accountAdd.data.gender, "female");
  assert.equal(accountAdd.data.birthday, "1990-01-01");
  assert.equal(accountAdd.data.documentType, "id_card");
  assert.equal(accountAdd.data.documentNumber, "310101199001010000");
  assert.deepEqual(accountAdd.data.documents, [
    { documentType: "id_card", documentNumber: "310101199001010000" }
  ]);
  assert.equal(accountAdd.data.wechat, "linyue_01");
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.equal(gateway.__mocks__.sentMails[0].to, "creator@example.com");
});

test("creator registration approve lets non-owner admins provision creator portal access", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-non-owner" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-non-owner",
          authUserId: "applicant-non-owner",
          authEmail: "non-owner-creator@example.com",
          contactEmail: "non-owner-creator@example.com",
          applicantName: "普通管理员审核",
          phone: "13800000012",
          status: "submitted"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "admin",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-non-owner": {
        id: "applicant-non-owner",
        email: "non-owner-creator@example.com",
        user_metadata: { hasPassword: true }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-non-owner",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "provisioned");
  assert.equal(result.data.accessProvisionError, "");
  assert.equal(result.data.approvalEmailStatus, "sent");
  assert.equal(result.data.linkedAdminAccountId.startsWith("admin_accounts_"), true);
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), true);
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.equal(gateway.__mocks__.sentMails[0].to, "non-owner-creator@example.com");
});

test("creator registration approve allows applicant phone reused by an admin account", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-duplicate-phone" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-duplicate-phone",
          authUserId: "applicant-duplicate-phone",
          authEmail: "creator@example.com",
          contactEmail: "creator@example.com",
          applicantName: "林越",
          phone: "13800000000",
          status: "submitted"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          displayName: "海森",
          email: "ops@example.com",
          phone: "13800000000",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-duplicate-phone": {
        id: "applicant-duplicate-phone",
        email: "creator@example.com",
        user_metadata: { hasPassword: false }
      }
    }
  });

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-duplicate-phone",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "activation_pending");
  assert.equal(result.data.accessProvisionError, "");
  assert.equal(result.data.linkedAdminAccountId.startsWith("admin_accounts_"), true);
  const accountAdd = gateway.__mocks__.collectionAdds.find((entry) => entry.name === "admin_accounts");
  assert.ok(accountAdd);
  assert.equal(accountAdd.data.phone, "13800000000");
});

test("creator registration approve does not fail when a newly created creator is not immediately query-visible", async () => {
  const gateway = loadAdminGatewayModule({
    delayedAddVisibilityCollections: ["creators"],
    sendMail: async () => ({ messageId: "mail-delayed-creator" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-delayed-creator",
          authUserId: "applicant-delayed-creator",
          authEmail: "delayed-creator@example.com",
          contactEmail: "delayed-creator@example.com",
          applicantName: "新创作者",
          phone: "13800000011",
          avatar: "cloud://creator/avatar-delayed.png",
          stance: "带大家看见地方。",
          about: ["长期做地方内容。"],
          status: "submitted",
          updatedAt: 1775318400000,
          approvalEmailStatus: "pending"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-delayed-creator": {
        id: "applicant-delayed-creator",
        email: "delayed-creator@example.com",
        user_metadata: { hasPassword: false }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-delayed-creator",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "activation_pending");
  assert.equal(result.data.activationEmailStatus, "sent");
  assert.equal(result.data.accessProvisionError, "");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "creators"), true);
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), true);
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.equal(gateway.__mocks__.sentMails[0].to, "delayed-creator@example.com");
});

test("creator registration approve derives activation link from portal home url when activation url is missing", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-1b" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-001b",
          authUserId: "applicant-001b",
          authEmail: "creator-link@example.com",
          contactEmail: "creator-link@example.com",
          applicantName: "林越二号",
          phone: "13800000009",
          avatar: "cloud://creator/avatar-link.png",
          stance: "把人带进地方内部。",
          about: ["长期做田野旅行。"],
          status: "submitted",
          updatedAt: 1775318400000,
          approvalEmailStatus: "pending"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-001b": {
        id: "applicant-001b",
        email: "creator-link@example.com",
        user_metadata: { hasPassword: false }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";
  process.env.CREATOR_PORTAL_HOME_URL = "https://admin.yezai.test/login";
  delete process.env.CREATOR_PORTAL_ACTIVATION_URL;
  delete process.env.YEZAIADMIN_ACTIVATION_URL;

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-001b",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.activationEmailStatus, "sent");
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.match(
    gateway.__mocks__.sentMails[0].text,
    /https:\/\/admin\.yezai\.test\/creator-activate\?token=/
  );
});

test("creator registration approve keeps activation token inside hash route activation links", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-1c" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-001c",
          authUserId: "applicant-001c",
          authEmail: "creator-hash@example.com",
          contactEmail: "creator-hash@example.com",
          applicantName: "林越三号",
          phone: "13800000010",
          avatar: "cloud://creator/avatar-hash.png",
          stance: "把人带进地方内部。",
          about: ["长期做田野旅行。"],
          status: "submitted",
          updatedAt: 1775318400000,
          approvalEmailStatus: "pending"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-001c": {
        id: "applicant-001c",
        email: "creator-hash@example.com",
        user_metadata: { hasPassword: false }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";
  process.env.CREATOR_PORTAL_ACTIVATION_URL = "https://admin.yezai.test/#/creator-activate";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-001c",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.activationEmailStatus, "sent");
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.match(
    gateway.__mocks__.sentMails[0].text,
    /https:\/\/admin\.yezai\.test\/#\/creator-activate\?token=/
  );
});

test("creator registration approve auto-provisions creator portal access and sends direct-login mail when applicant already has a password", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-2" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-002",
          authUserId: "applicant-002",
          authEmail: "ready@example.com",
          contactEmail: "ready@example.com",
          applicantName: "山行者",
          phone: "13800000001",
          avatar: "cloud://creator/avatar-2.png",
          stance: "慢一点走进地方。",
          about: ["擅长小团路线。"],
          status: "submitted",
          updatedAt: 1775318300000,
          approvalEmailStatus: "pending"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-002": {
        id: "applicant-002",
        email: "ready@example.com",
        user_metadata: { hasPassword: true }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-002",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "provisioned");
  assert.equal(result.data.linkedAdminAccountId.startsWith("admin_accounts_"), true);
  assert.equal(result.data.activationTokenHash, "");
  assert.equal(result.data.activationExpiresAt, 0);
  assert.equal(result.data.activationConsumedAt, 0);
  assert.equal(result.data.activationEmailStatus, "pending");
  assert.equal(result.data.activationEmailSentAt, 0);
  assert.equal(result.data.activationEmailError, "");
  assert.equal(result.data.approvalEmailStatus, "sent");
  assert.equal(typeof result.data.approvalEmailSentAt, "number");
  assert.equal(result.data.approvalEmailError, "");
  assert.equal(result.data.accessProvisionError, "");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "creators"), true);
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), true);
});

test("creator registration approve marks conflict when the applicant auth identity is already bound to another creator portal account", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-3" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-003",
          authUserId: "applicant-003",
          authEmail: "conflict@example.com",
          contactEmail: "conflict@example.com",
          applicantName: "阿野",
          phone: "13800000002",
          avatar: "cloud://creator/avatar-3.png",
          stance: "看见地方里的关系。",
          about: ["做过社区研究。"],
          status: "submitted",
          updatedAt: 1775318200000,
          approvalEmailStatus: "pending"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        },
        {
          _id: "admins_1",
          uid: "applicant-003",
          email: "conflict@example.com",
          accountType: "creator_portal",
          boundCreatorId: "creator-other",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-003": {
        id: "applicant-003",
        email: "conflict@example.com",
        user_metadata: { hasPassword: true }
      }
    }
  });

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-003",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "conflict");
  assert.equal(result.data.linkedAdminAccountId, "");
  assert.match(result.data.accessProvisionError, /已绑定到其他创作者/);
  assert.equal(result.data.approvalEmailStatus, "pending");
  assert.equal(result.data.activationEmailStatus, "pending");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "creators"), true);
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), false);
  assert.equal(gateway.__mocks__.sentMails.length, 0);
});

test("creator registration approve marks conflict when a matched existing admin account is not creator_portal", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-4" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-004",
          authUserId: "applicant-004",
          authEmail: "owner@example.com",
          contactEmail: "owner@example.com",
          applicantName: "城野",
          phone: "13800000004",
          status: "submitted"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        },
        {
          _id: "admins_existing",
          uid: "applicant-004",
          email: "owner@example.com",
          accountType: "admin",
          level: "owner",
          status: "active",
          note: "existing owner"
        }
      ]
    },
    authDirectory: {
      "applicant-004": {
        id: "applicant-004",
        email: "owner@example.com",
        user_metadata: { hasPassword: true }
      }
    }
  });

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-004",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "conflict");
  assert.match(result.data.accessProvisionError, /已存在非创作者后台账号/);
  assert.equal(result.data.linkedAdminAccountId, "");
  assert.equal(gateway.__mocks__.collectionUpdates.some((entry) => entry.name === "admin_accounts"), false);
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), false);
  assert.equal(gateway.__mocks__.sentMails.length, 0);
});

test("creator registration approve reuses an unbound creator_portal account and backfills creator binding", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-4b" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-004b",
          authUserId: "applicant-004b",
          authEmail: "reuse@example.com",
          contactEmail: "reuse@example.com",
          applicantName: "复用账号",
          phone: "13800000044",
          status: "submitted"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        },
        {
          _id: "creator-portal-existing",
          uid: "applicant-004b",
          email: "reuse@example.com",
          accountType: "creator_portal",
          boundCreatorId: "",
          status: "active",
          note: "legacy unbound"
        }
      ]
    },
    authDirectory: {
      "applicant-004b": {
        id: "applicant-004b",
        email: "reuse@example.com",
        user_metadata: { hasPassword: true }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-004b",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "provisioned");
  assert.equal(result.data.linkedAdminAccountId, "creator-portal-existing");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), false);
  const accountUpdate = gateway.__mocks__.collectionUpdates.find((entry) => (
    entry.name === "admin_accounts" && entry.id === "creator-portal-existing"
  ));
  assert.ok(accountUpdate);
  assert.equal(Boolean(accountUpdate.data.boundCreatorId), true);
});

test("creator registration approve persists approved plus failed when access provisioning cannot proceed", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-005",
          authUserId: "",
          authEmail: "failed@example.com",
          contactEmail: "failed@example.com",
          applicantName: "半成功",
          phone: "13800000005",
          status: "submitted"
        }
      ],
      creators: [],
      admin_accounts: []
    }
  });

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-005",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "failed");
  assert.match(result.data.accessProvisionError, /认证身份/);
  assert.equal(result.data.linkedCreatorId.startsWith("creator-"), true);
  assert.equal(Boolean(result.data.linkedCreatorSlug), true);
  assert.equal(result.data.linkedAdminAccountId, "");
  assert.equal(result.data.approvalEmailStatus, "pending");
  assert.equal(result.data.activationEmailStatus, "pending");
  assert.equal(gateway.__mocks__.collectionAdds.filter((entry) => entry.name === "creators").length, 1);
  const registrationUpdate = gateway.__mocks__.collectionUpdates.find((entry) => entry.name === "creator_registrations");
  assert.ok(registrationUpdate);
  assert.equal(registrationUpdate.data.status, "approved");
  assert.equal(registrationUpdate.data.accessProvisionStatus, "failed");
  assert.equal(Boolean(registrationUpdate.data.linkedCreatorId), true);
  assert.equal(Boolean(registrationUpdate.data.linkedCreatorSlug), true);
});

test("creator registration approve records failed and does not send mail when contact email differs from auth email", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-5" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "applicant-006",
          authUserId: "applicant-006",
          authEmail: "auth@example.com",
          contactEmail: "contact@example.com",
          applicantName: "邮箱不一致",
          phone: "13800000006",
          status: "submitted"
        }
      ],
      creators: [],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-006": {
        id: "applicant-006",
        email: "auth@example.com",
        user_metadata: { hasPassword: true }
      }
    }
  });

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "applicant-006",
      action: "approve"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.accessProvisionStatus, "failed");
  assert.match(result.data.accessProvisionError, /联系邮箱与登录邮箱不一致/);
  assert.equal(result.data.linkedAdminAccountId, "");
  assert.equal(result.data.approvalEmailStatus, "pending");
  assert.equal(result.data.activationEmailStatus, "pending");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "admin_accounts"), false);
  assert.equal(gateway.__mocks__.sentMails.length, 0);
});

test("creator registration review reject sends rejection email without creating creators", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-reject-1" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-3",
          authUserId: "applicant-3",
          authEmail: "reject@example.com",
          contactEmail: "reject@example.com",
          applicantName: "阿岚",
          phone: "13900000000",
          stance: "山野观察",
          status: "under_review",
          updatedAt: 1775318300000,
          approvalEmailStatus: "pending"
        }
      ]
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "reviewCreatorRegistration",
    payload: {
      registrationId: "registration-3",
      action: "reject",
      rejectionReason: "资料不全"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "rejected");
  assert.equal(result.data.rejectionReason, "资料不全");
  assert.equal(result.data.approvalEmailStatus, "sent");
  assert.equal(result.data.approvalEmailError, "");
  assert.equal(gateway.__mocks__.collectionAdds.some((entry) => entry.name === "creators"), false);
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.equal(gateway.__mocks__.sentMails[0].to, "reject@example.com");
  assert.match(gateway.__mocks__.sentMails[0].text, /资料不全/);
});

test("creator registration resend approval email updates delivery status for approved registrations", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-2" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-4",
          authUserId: "applicant-4",
          authEmail: "approved@example.com",
          contactEmail: "approved@example.com",
          applicantName: "青野",
          phone: "13700000000",
          stance: "地方采风",
          status: "approved",
          linkedCreatorId: "creator-qingye",
          linkedCreatorSlug: "qingye",
          accessProvisionStatus: "provisioned",
          approvalEmailStatus: "failed",
          approvalEmailError: "smtp unavailable",
          updatedAt: 1775318300000
        }
      ]
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "resendCreatorRegistrationApprovalEmail",
    payload: {
      registrationId: "registration-4"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.approvalEmailStatus, "sent");
  assert.equal(result.data.approvalEmailError, "");
  assert.equal(gateway.__mocks__.sentMails.length, 1);
});

test("creator registration resend approval email rejects non-provisioned registrations", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-6" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-5",
          authUserId: "applicant-5",
          authEmail: "waiting@example.com",
          contactEmail: "waiting@example.com",
          applicantName: "待激活",
          status: "approved",
          linkedCreatorId: "creator-waiting",
          linkedCreatorSlug: "waiting",
          accessProvisionStatus: "activation_pending",
          updatedAt: 1775318300000
        }
      ]
    }
  });

  const result = await gateway.main({
    action: "resendCreatorRegistrationApprovalEmail",
    payload: {
      registrationId: "registration-5"
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /仅已开通可直接登录的申请支持重发通知邮件/);
  assert.equal(gateway.__mocks__.sentMails.length, 0);
});

test("creator registration resend notification email supports rejected registrations", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-reject-resend" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-rejected-resend",
          authUserId: "applicant-rejected-resend",
          authEmail: "rejected@example.com",
          contactEmail: "rejected@example.com",
          applicantName: "被驳回申请人",
          status: "rejected",
          rejectionReason: "请补充个人介绍",
          approvalEmailStatus: "failed",
          approvalEmailError: "smtp unavailable",
          updatedAt: 1775318300000
        }
      ]
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "resendCreatorRegistrationApprovalEmail",
    payload: {
      registrationId: "registration-rejected-resend"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "rejected");
  assert.equal(result.data.approvalEmailStatus, "sent");
  assert.equal(result.data.approvalEmailError, "");
  assert.equal(gateway.__mocks__.sentMails.length, 1);
  assert.equal(gateway.__mocks__.sentMails[0].to, "rejected@example.com");
  assert.match(gateway.__mocks__.sentMails[0].text, /请补充个人介绍/);
});

test("creator registration retry access provisioning repairs approved registrations stuck in pending state", async () => {
  const gateway = loadAdminGatewayModule({
    sendMail: async () => ({ messageId: "mail-retry-1" }),
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-retry-1",
          authUserId: "applicant-retry-1",
          authEmail: "retry@example.com",
          contactEmail: "retry@example.com",
          applicantName: "白百合",
          phone: "13700000088",
          status: "approved",
          linkedCreatorId: "creator-baibaihe",
          linkedCreatorSlug: "baibaihe",
          accessProvisionStatus: "pending",
          activationEmailStatus: "pending",
          approvalEmailStatus: "pending",
          updatedAt: 1775318300000
        }
      ],
      creators: [
        {
          _id: "creator-baibaihe",
          id: "creator-baibaihe",
          slug: "baibaihe",
          name: "白百合",
          status: "draft"
        }
      ],
      admin_accounts: [
        {
          _id: "admin-account-1",
          uid: "admin-1",
          email: "ops@example.com",
          accountType: "admin",
          level: "owner",
          status: "active"
        }
      ]
    },
    authDirectory: {
      "applicant-retry-1": {
        id: "applicant-retry-1",
        email: "retry@example.com",
        user_metadata: { hasPassword: false }
      }
    }
  });

  process.env.CREATOR_APPROVAL_SMTP_HOST = "smtp.example.com";
  process.env.CREATOR_APPROVAL_SMTP_PORT = "465";
  process.env.CREATOR_APPROVAL_SMTP_SECURE = "true";
  process.env.CREATOR_APPROVAL_SMTP_USER = "notify@example.com";
  process.env.CREATOR_APPROVAL_SMTP_PASS = "secret";
  process.env.CREATOR_APPROVAL_SENDER = "野哉 <notify@example.com>";

  const result = await gateway.main({
    action: "retryCreatorRegistrationAccessProvision",
    payload: {
      registrationId: "registration-retry-1"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "approved");
  assert.equal(result.data.linkedCreatorId, "creator-baibaihe");
  assert.equal(result.data.linkedCreatorSlug, "baibaihe");
  assert.equal(result.data.accessProvisionStatus, "activation_pending");
  assert.equal(result.data.activationEmailStatus, "sent");
  assert.equal(result.data.approvalEmailStatus, "pending");
  assert.equal(result.data.linkedAdminAccountId.startsWith("admin_accounts_"), true);
  assert.match(result.data.activationTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(gateway.__mocks__.sentMails.length, 1);

  const registrationUpdate = gateway.__mocks__.collectionUpdates.find((entry) => (
    entry.name === "creator_registrations" && entry.id === "registration-retry-1"
  ));
  assert.ok(registrationUpdate);
  assert.equal(registrationUpdate.data.accessProvisionStatus, "activation_pending");
  assert.equal(registrationUpdate.data.activationEmailStatus, "sent");
});

test("creator portal getSession falls back to approved registration profile when account profile is empty", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      creator_registrations: [
        {
          _id: "registration-profile-fallback",
          authUserId: "creator-user-profile-fallback",
          authEmail: "profile-fallback@example.com",
          contactEmail: "profile-fallback@example.com",
          applicantName: "申请实名",
          phone: "13800000066",
          gender: "male",
          birthday: "1988-08-08",
          documentType: "passport",
          documentNumber: "E12345678",
          wechat: "profile_fallback",
          status: "approved",
          linkedAdminAccountId: "admin-account-profile-fallback",
          linkedCreatorId: "creator-profile-fallback",
          linkedCreatorSlug: "profile-fallback",
          accessProvisionStatus: "activation_pending"
        }
      ],
      admin_accounts: [
        {
          _id: "admin-account-profile-fallback",
          uid: "creator-user-profile-fallback",
          username: "creator_profile_fallback",
          email: "profile-fallback@example.com",
          accountType: "creator_portal",
          boundCreatorId: "creator-profile-fallback",
          status: "active",
          level: "",
          realName: "",
          gender: "",
          birthday: "",
          documentType: "",
          documentNumber: "",
          documents: [],
          phone: "",
          wechat: ""
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-profile-fallback",
      username: "creator_profile_fallback",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-profile-fallback",
        uid: "creator-user-profile-fallback",
        email: "profile-fallback@example.com",
        user_metadata: {
          username: "creator_profile_fallback"
        }
      }
    }
  });

  const result = await gateway.main({
    action: "getSession",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.user.realName, "申请实名");
  assert.equal(result.data.user.phone, "13800000066");
  assert.equal(result.data.user.gender, "male");
  assert.equal(result.data.user.birthday, "1988-08-08");
  assert.equal(result.data.user.documentType, "passport");
  assert.equal(result.data.user.documentNumber, "E12345678");
  assert.deepEqual(result.data.user.documents, [
    { documentType: "passport", documentNumber: "E12345678" }
  ]);
  assert.equal(result.data.user.wechat, "profile_fallback");
});

test("creator portal account can save own profile fields through saveCurrentAdminAccountProfile", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-creator-1",
          uid: "creator-user-1",
          username: "creator_portal_1",
          email: "old@example.com",
          phone: "13800138000",
          accountType: "creator_portal",
          boundCreatorId: "creator-1",
          status: "active",
          level: "",
          realName: "",
          gender: "",
          birthday: "",
          documentType: "",
          documentNumber: "",
          documents: [],
          wechat: ""
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-1",
      username: "creator_portal_1",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-1",
        email: "creator@example.com",
        role: "creator",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    }
  });

  const result = await gateway.main({
    action: "saveCurrentAdminAccountProfile",
    payload: {
      realName: "白百合",
      gender: "female",
      birthday: "1992-04-10",
      documentType: "id_card",
      documentNumber: "110101199204102233",
      documents: [
        { documentType: "id_card", documentNumber: "110101199204102233" },
        { documentType: "passport", documentNumber: "E12345678" }
      ],
      wechat: "baibaihe_01",
      email: "creator@example.com",
      phone: "13900139000",
      username: "creator_baibaihe"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data._id, "admin-account-creator-1");
  assert.equal(result.data.realName, "白百合");
  assert.equal(result.data.gender, "female");
  assert.equal(result.data.birthday, "1992-04-10");
  assert.equal(result.data.documentType, "id_card");
  assert.equal(result.data.documentNumber, "110101199204102233");
  assert.deepEqual(result.data.documents, [
    { documentType: "id_card", documentNumber: "110101199204102233" },
    { documentType: "passport", documentNumber: "E12345678" }
  ]);
  assert.equal(result.data.wechat, "baibaihe_01");
  assert.equal(result.data.email, "creator@example.com");
  assert.equal(result.data.phone, "13900139000");
  assert.equal(result.data.username, "creator_baibaihe");

  const profileUpdate = gateway.__mocks__.collectionUpdates.find((entry) => (
    entry.name === "admin_accounts" && entry.id === "admin-account-creator-1"
  ));
  assert.ok(profileUpdate);
  assert.equal(profileUpdate.data.realName, "白百合");
  assert.equal(profileUpdate.data.documentNumber, "110101199204102233");
  assert.deepEqual(profileUpdate.data.documents, [
    { documentType: "id_card", documentNumber: "110101199204102233" },
    { documentType: "passport", documentNumber: "E12345678" }
  ]);
  assert.equal(profileUpdate.data.username, "creator_baibaihe");
});

test("saveCurrentAdminAccountProfile rejects duplicated document types", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-creator-1",
          uid: "creator-user-1",
          username: "creator_portal_1",
          email: "creator@example.com",
          phone: "13800138000",
          accountType: "creator_portal",
          boundCreatorId: "creator-1",
          status: "active",
          level: ""
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-1",
      username: "creator_portal_1",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-1",
        email: "creator@example.com",
        role: "creator",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    }
  });

  const result = await gateway.main({
    action: "saveCurrentAdminAccountProfile",
    payload: {
      realName: "白百合",
      gender: "female",
      birthday: "1992-04-10",
      documentType: "id_card",
      documentNumber: "110101199204102233",
      documents: [
        { documentType: "id_card", documentNumber: "110101199204102233" },
        { documentType: "passport", documentNumber: "E12345678" },
        { documentType: "passport", documentNumber: "G12345678" }
      ],
      email: "creator@example.com"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "每种证件类型只能添加一条记录");
});

test("saveCurrentAdminAccountProfile rejects changed email before auth session verifies it", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-creator-1",
          uid: "creator-user-1",
          username: "creator_portal_1",
          email: "old@example.com",
          phone: "13800138000",
          accountType: "creator_portal",
          boundCreatorId: "creator-1",
          status: "active",
          level: ""
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-1",
      username: "creator_portal_1",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-1",
        email: "old@example.com",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    }
  });

  const result = await gateway.main({
    action: "saveCurrentAdminAccountProfile",
    payload: {
      email: "next@example.com"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "请先完成邮箱二次验证");
});

test("saveCurrentAdminAccountProfile accepts changed email after auth directory reflects the verified email", async () => {
  const gateway = loadAdminGatewayModule({
    collectionData: {
      admin_accounts: [
        {
          _id: "admin-account-creator-1",
          uid: "creator-user-1",
          username: "creator_portal_1",
          email: "old@example.com",
          phone: "13800138000",
          accountType: "creator_portal",
          boundCreatorId: "creator-1",
          status: "active",
          level: ""
        }
      ]
    },
    authCallerInfo: {
      uid: "creator-user-1",
      username: "creator_portal_1",
      roles: []
    },
    authUserInfo: {
      userInfo: {
        id: "creator-user-1",
        email: "old@example.com",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    },
    authDirectory: {
      "creator-user-1": {
        id: "creator-user-1",
        uid: "creator-user-1",
        email: "next@example.com",
        user_metadata: {
          username: "creator_portal_1"
        }
      }
    }
  });

  const result = await gateway.main({
    action: "saveCurrentAdminAccountProfile",
    payload: {
      email: "next@example.com"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.email, "next@example.com");
});
