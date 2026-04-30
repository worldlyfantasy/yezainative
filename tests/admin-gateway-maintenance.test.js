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
  const collectionData = options.collectionData || {};
  const collectionUpdates = [];
  const collectionAdds = [];

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        callFunction: async () => ({
          result: {
            ok: true,
            data: {}
          }
        }),
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
                    get: async () => ({
                      data: readCollectionRows().find((item) => item && item._id === id) || null
                    }),
                    update: async ({ data } = {}) => {
                      collectionUpdates.push({ name, id, data: data || {} });
                      const rows = readCollectionRows();
                      const rowIndex = rows.findIndex((item) => item && item._id === id);
                      if (rowIndex >= 0) {
                        rows[rowIndex] = Object.assign({}, rows[rowIndex], data || {});
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
                  rows.push(nextDoc);
                  collectionAdds.push({ name, data: nextDoc });
                  return { _id: id };
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
            auth() {
              return {
                getUserInfo() {
                  return {};
                },
                async getEndUserInfo() {
                  return {};
                }
              };
            },
            models: {
              $runSQL: async () => ({
                data: {
                  executeResultList: []
                }
              })
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
        collectionUpdates
      }
    });
  } finally {
    Module._load = originalLoad;
  }
}

test("maintenanceBackfillServiceCreatorMessages patches only missing creatorMessage values", async () => {
  const previousToken = process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN;
  process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN = "test-maintenance-token";

  try {
    const { main, __mocks__ } = loadAdminGatewayModule({
      collectionData: {
        services: [
          {
            _id: "service-1",
            slug: "ridge-journal",
            name: "高原谷地徒步手帐",
            creatorMessage: "",
            summary: "以手绘地图串联牧场、寺院与峡谷。",
            travelDetail: {
              overview: {
                whyJoinText: "把徒步从“走完”变成“看见”。\n\n第二段保留在概况里。"
              }
            }
          },
          {
            _id: "service-2",
            slug: "wuyi-ink-trail",
            name: "武夷古道静心行",
            creatorMessage: "已有文案",
            summary: "武夷山里慢慢走。"
          }
        ]
      }
    });

    const result = await main({
      action: "maintenanceBackfillServiceCreatorMessages",
      payload: {
        accessToken: "test-maintenance-token"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.scannedServices, 2);
    assert.equal(result.data.updatedServices, 1);
    assert.equal(result.data.skippedServices, 1);
    assert.deepEqual(__mocks__.collectionUpdates, [
      {
        name: "services",
        id: "service-1",
        data: {
          creatorMessage: "把徒步从“走完”变成“看见”。",
          updatedBy: "maintenance:backfill-service-creator-message",
          updatedAt: __mocks__.collectionUpdates[0].data.updatedAt
        }
      }
    ]);
  } finally {
    process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN = previousToken;
  }
});

test("maintenanceRestoreServices merges the provided backup payload into an existing service doc", async () => {
  const previousToken = process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN;
  process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN = "test-maintenance-token";

  try {
    const damagedServices = [
      {
        _id: "33956e3d69c10e5e0143540c3077b209",
        creatorMessage: "把徒步从“走完”变成“看见”。"
      }
    ];
    const backupService = {
      _id: "33956e3d69c10e5e0143540c3077b209",
      id: "svc-ridge-journal",
      slug: "ridge-journal",
      name: "高原谷地徒步手帐",
      creatorId: "creator-linyue",
      creatorRoles: ["创作者", "带领者"],
      destinationSlugs: ["aba-highlands", "lancang-source"],
      summary: "以手绘地图串联牧场、寺院与峡谷，步行与露营结合。",
      cover: "https://example.com/ridge-journal-cover.jpg",
      gallery: ["https://example.com/ridge-journal-gallery-01.jpg"],
      tags: ["户外", "山野", "研学"],
      creatorMessage: "把徒步从“走完”变成“看见”。",
      travelDetail: {
        overview: {
          whyJoinText: "把徒步从“走完”变成“看见”。"
        }
      }
    };

    const { main, __mocks__ } = loadAdminGatewayModule({
      collectionData: {
        services: damagedServices
      }
    });

    const result = await main({
      action: "maintenanceRestoreServices",
      payload: {
        accessToken: "test-maintenance-token",
        services: [backupService]
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.updatedServices, 1);
    assert.equal(damagedServices[0].slug, "ridge-journal");
    assert.equal(damagedServices[0].summary, "以手绘地图串联牧场、寺院与峡谷，步行与露营结合。");
    assert.equal(damagedServices[0].cover, "https://example.com/ridge-journal-cover.jpg");
    assert.equal(damagedServices[0].updatedBy, "maintenance:restore-service-document");
    assert.equal(__mocks__.collectionUpdates.length, 1);
    assert.equal(__mocks__.collectionUpdates[0].name, "services");
    assert.equal(__mocks__.collectionUpdates[0].id, "33956e3d69c10e5e0143540c3077b209");
  } finally {
    process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN = previousToken;
  }
});

test("maintenance actions reject an invalid access token", async () => {
  const previousToken = process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN;
  process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN = "test-maintenance-token";

  try {
    const { main, __mocks__ } = loadAdminGatewayModule({
      collectionData: {
        services: [
          {
            _id: "service-1",
            slug: "ridge-journal",
            summary: "以手绘地图串联牧场、寺院与峡谷。"
          }
        ]
      }
    });

    const result = await main({
      action: "maintenanceBackfillServiceCreatorMessages",
      payload: {
        accessToken: "wrong-token"
      }
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /maintenance access denied/);
    assert.deepEqual(__mocks__.collectionUpdates, []);
  } finally {
    process.env.ADMIN_GATEWAY_MAINTENANCE_TOKEN = previousToken;
  }
});
