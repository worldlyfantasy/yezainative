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
  const removedDocIds = [];
  const sqlCalls = [];
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
        database() {
          return {
            command: {},
            collection(name) {
              const readCollectionRows = () => {
                const rows = collectionData[name];
                return Array.isArray(rows) ? rows : [];
              };

              return {
                doc(id) {
                  return {
                    get: async () => ({ data: docStore.get(id) || null }),
                    update: async () => ({}),
                    remove: async () => {
                      removedDocIds.push(id);
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
                get: async () => ({ data: readCollectionRows() })
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
            auth() {
              return {};
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

    if (request === "./image-assets") {
      return {
        dedupeImageValues: (value) => value,
        ensureImageAssetValue: (value) => value,
        getCloudFilePath: () => "",
        getImageAssetOriginal: () => "",
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
        removedDocIds,
        sqlCalls
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
      versionName: "湖岸环线6日"
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
