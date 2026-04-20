const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/creatorRegistrationGateway/index.js"
);

function loadCreatorRegistrationGatewayModule(options = {}) {
  const originalLoad = Module._load;
  const docs = new Map(Object.entries(options.docs || {}));
  const collectionAdds = [];
  const collectionUpdates = [];
  const collectionReads = [];
  const authCalls = [];

  const endUserInfo = options.endUserInfo || {
    userInfo: {
      id: "applicant-001",
      email: "Applicant@Example.com"
    }
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
              const getRows = () => {
                const rows = options.collections && options.collections[name];
                return Array.isArray(rows) ? rows : [];
              };
              const findDoc = (id) => {
                if (docs.has(id)) {
                  return docs.get(id);
                }

                return getRows().find((item) => item && item._id === id) || null;
              };
              const filterRows = (query) => getRows().filter((item) => (
                item
                && Object.keys(query || {}).every((key) => item[key] === query[key])
              ));

              return {
                doc(id) {
                  return {
                    get: async () => {
                      collectionReads.push({ type: "doc", name, id });
                      return { data: findDoc(id) };
                    },
                    update: async ({ data } = {}) => {
                      collectionUpdates.push({ name, id, data: data || {} });
                      const existing = findDoc(id);
                      const nextDoc = Object.assign({}, existing || { _id: id }, data || {});
                      docs.set(id, nextDoc);
                      return {};
                    },
                    remove: async () => {
                      docs.delete(id);
                      return {};
                    }
                  };
                },
                where(query) {
                  return {
                    limit() {
                      return {
                        get: async () => {
                          collectionReads.push({ type: "where", name, query: query || {} });
                          return { data: filterRows(query) };
                        }
                      };
                    }
                  };
                },
                add: async ({ data } = {}) => {
                  const id = data && data._id ? data._id : `${name}_${collectionAdds.length + 1}`;
                  const nextDoc = Object.assign({ _id: id }, data || {});
                  docs.set(id, nextDoc);
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
                getEndUserInfo: async () => {
                  authCalls.push(true);
                  return endUserInfo;
                }
              };
            }
          };
        }
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[gatewayModulePath];

  try {
    const moduleExports = require(gatewayModulePath);
    return Object.assign({}, moduleExports, {
      __mocks__: {
        authCalls,
        collectionAdds,
        collectionReads,
        collectionUpdates,
        docs
      }
    });
  } finally {
    Module._load = originalLoad;
  }
}

test("creatorRegistrationGateway returns detail contract fields with defaults", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "applicant@example.com",
        status: "draft",
        applicantName: "小野",
        contactEmail: "applicant@example.com",
        phone: "13800000000"
      }
    }
  });

  const result = await gateway.main({
    action: "getMyRegistration"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.registrationId, "applicant-001");
  assert.equal(result.data.authUserId, "applicant-001");
  assert.equal(result.data.authEmail, "applicant@example.com");
  assert.equal(result.data.status, "draft");
  assert.equal(result.data.rejectionReason, "");
  assert.equal(result.data.linkedCreatorId, "");
  assert.equal(result.data.linkedCreatorSlug, "");
  assert.equal(result.data.approvalEmailStatus, "pending");
});

test("creatorRegistrationGateway saveDraft stores about and personal-info fields", async () => {
  const gateway = loadCreatorRegistrationGatewayModule();

  const result = await gateway.main({
    action: "saveDraft",
    payload: {
      applicantName: "  山行者 ",
      contactEmail: " Creator@Example.com ",
      phone: " 138 0000 0000 ",
      gender: "female",
      birthday: "1992-08-10",
      documentType: "idCard",
      documentNumber: " 330102199208100022 ",
      wechat: " linyue-note ",
      avatar: " cloud://avatar-1 ",
      stance: "  帮人找到适合自己的路 ",
      about: [
        " 长期做田野旅行。 ",
        " 更关注关系和地方的连接。 "
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.registrationId, "applicant-001");
  assert.equal(result.data.status, "draft");
  assert.equal(result.data.contactEmail, "creator@example.com");
  assert.equal(result.data.gender, "female");
  assert.equal(result.data.birthday, "1992-08-10");
  assert.equal(result.data.documentType, "id_card");
  assert.equal(result.data.documentNumber, "330102199208100022");
  assert.equal(result.data.wechat, "linyue-note");
  assert.equal(result.data.avatar, "cloud://avatar-1");
  assert.deepEqual(result.data.about, [
    "长期做田野旅行。",
    "更关注关系和地方的连接。"
  ]);
  assert.equal(result.data.note, undefined);

  const storedDoc = gateway.__mocks__.docs.get("applicant-001");
  assert.deepEqual(storedDoc.about, [
    "长期做田野旅行。",
    "更关注关系和地方的连接。"
  ]);
  assert.equal(storedDoc.note, undefined);
  assert.equal(storedDoc.contactEmail, "creator@example.com");
  assert.equal(storedDoc.phone, "13800000000");
  assert.equal(storedDoc.gender, "female");
  assert.equal(storedDoc.birthday, "1992-08-10");
  assert.equal(storedDoc.documentType, "id_card");
  assert.equal(storedDoc.documentNumber, "330102199208100022");
  assert.equal(storedDoc.wechat, "linyue-note");
  assert.equal(storedDoc.avatar, "cloud://avatar-1");
});

test("creatorRegistrationGateway submit rejects blank contactEmail", async () => {
  const gateway = loadCreatorRegistrationGatewayModule();

  await assert.rejects(
    gateway.__test__.submit({
      contactEmail: "",
      applicantName: "林越",
      phone: "13800000000",
      stance: "观察地方关系"
    }),
    /请填写邮箱/
  );
});

test("creatorRegistrationGateway submit validates phone, document number, avatar, stance and about", async () => {
  const gateway = loadCreatorRegistrationGatewayModule();

  await assert.rejects(
    gateway.__test__.submit({
      contactEmail: "applicant@example.com",
      applicantName: "林越",
      phone: "12345",
      documentType: "id_card",
      documentNumber: "E12345678",
      avatar: "",
      stance: "",
      about: []
    }),
    /请输入正确的手机号/
  );

  await assert.rejects(
    gateway.__test__.submit({
      contactEmail: "applicant@example.com",
      applicantName: "林越",
      phone: "13800000000",
      documentType: "id_card",
      documentNumber: "E12345678",
      avatar: "cloud://avatar",
      stance: "田野旅行策划",
      about: ["长期做田野旅行"]
    }),
    /请输入正确的身份证号/
  );

  await assert.rejects(
    gateway.__test__.submit({
      contactEmail: "applicant@example.com",
      applicantName: "林越",
      phone: "13800000000",
      documentType: "passport",
      documentNumber: "E12345678",
      avatar: "",
      stance: "田野旅行策划",
      about: ["长期做田野旅行"]
    }),
    /请上传头像/
  );
});

test("creatorRegistrationGateway submit rejects mismatched verified email", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    endUserInfo: {
      userInfo: {
        id: "applicant-001",
        email: "verified@example.com"
      }
    }
  });

  await assert.rejects(
    gateway.__test__.submit({
      contactEmail: "changed@example.com",
      applicantName: "林越",
      phone: "13800000000",
      avatar: "cloud://avatar-1",
      stance: "带你进入地方生活",
      about: ["长期做田野旅行"]
    }),
    /联系邮箱已变更，请重新验证邮箱/
  );
});

test("creatorRegistrationGateway blocks edits to submitted, under_review, and approved registrations", async () => {
  const blockedStatuses = ["submitted", "under_review", "approved"];

  for (const status of blockedStatuses) {
    {
      const gateway = loadCreatorRegistrationGatewayModule({
        docs: {
          "applicant-001": {
            _id: "applicant-001",
            authUserId: "applicant-001",
            authEmail: "applicant@example.com",
            status,
            applicantName: "林越",
            contactEmail: "applicant@example.com",
            phone: "13800000000",
            rejectionReason: "reviewed"
          }
        }
      });

      await assert.rejects(
        gateway.__test__.saveDraft({
          applicantName: "更新姓名",
          contactEmail: "applicant@example.com",
          phone: "13800000000",
          stance: "新的定位"
        }),
        /不可修改|只允许/
      );
      assert.equal(gateway.__mocks__.collectionUpdates.length, 0);
      assert.equal(gateway.__mocks__.collectionAdds.length, 0);
    }
  }
});

test("creatorRegistrationGateway allows rejected registrations to be edited and clears rejectionReason", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "applicant@example.com",
        status: "rejected",
        applicantName: "林越",
        contactEmail: "applicant@example.com",
        phone: "13800000000",
        rejectionReason: "补充材料不足",
        linkedCreatorId: "",
        linkedCreatorSlug: "",
        approvalEmailStatus: "failed"
      }
    }
  });

  const result = await gateway.__test__.saveDraft({
    applicantName: "林越",
    contactEmail: "applicant@example.com",
    phone: "13800000000",
    stance: "重新申请",
    about: ["补齐后再次提交"]
  });

  assert.equal(result.registrationId, "applicant-001");
  assert.equal(result.status, "draft");
  assert.equal(result.rejectionReason, "");
  assert.equal(result.approvalEmailStatus, "pending");
  assert.deepEqual(result.about, ["补齐后再次提交"]);
});
