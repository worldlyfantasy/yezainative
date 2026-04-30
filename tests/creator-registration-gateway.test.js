const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/creatorRegistrationGateway/index.js"
);

function hashActivationTokenForTest(token) {
  return crypto.createHash("sha256").update(String(token || "").trim()).digest("hex");
}

function loadCreatorRegistrationGatewayModule(options = {}) {
  const originalLoad = Module._load;
  const docs = new Map(Object.entries(options.docs || {}));
  const collectionAdds = [];
  const collectionUpdates = [];
  const collectionReads = [];
  const authCalls = [];
  const uploadCalls = [];

  const endUserInfo = options.endUserInfo || {
    userInfo: {
      id: "applicant-001",
      email: "Applicant@Example.com"
    }
  };
  const callerInfo = options.callerInfo || {};
  const rejectMissingDocGets = options.rejectMissingDocGets === true;

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        uploadFile: async ({ cloudPath, fileContent } = {}) => {
          uploadCalls.push({
            cloudPath,
            fileContent
          });
          return {
            fileID: `cloud://test-env/${cloudPath}`
          };
        },
        database() {
          return {
            command: {},
            collection(name) {
              const getRows = () => {
                const rowsById = new Map();
                const rows = options.collections && options.collections[name];
                if (Array.isArray(rows)) {
                  rows.forEach((item) => {
                    if (item && item._id) {
                      rowsById.set(item._id, item);
                    }
                  });
                }
                docs.forEach((item, id) => {
                  if (item && id) {
                    rowsById.set(id, item);
                  }
                });
                return Array.from(rowsById.values());
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
                      const doc = findDoc(id);
                      if (!doc && rejectMissingDocGets) {
                        throw new Error(`document with _id ${id} does not exist`);
                      }
                      return { data: doc };
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
                getUserInfo: () => callerInfo,
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
        uploadCalls,
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

test("creatorRegistrationGateway uploadImageFile uploads image payload for verified applicants", async () => {
  const gateway = loadCreatorRegistrationGatewayModule();

  const result = await gateway.main({
    action: "uploadImageFile",
    payload: {
      folder: "content/creator-registrations/avatar/applicant@example.com",
      fileName: "avatar.png",
      contentType: "image/png",
      base64: "data:image/png;base64,aGVsbG8="
    }
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.data.fileID,
    "cloud://test-env/content/creator-registrations/avatar/applicant-example.com/avatar.png"
  );
  assert.equal(
    result.data.cloudPath,
    "content/creator-registrations/avatar/applicant-example.com/avatar.png"
  );
  assert.equal(gateway.__mocks__.uploadCalls.length, 1);
  assert.equal(
    gateway.__mocks__.uploadCalls[0].cloudPath,
    "content/creator-registrations/avatar/applicant-example.com/avatar.png"
  );
  assert.ok(Buffer.isBuffer(gateway.__mocks__.uploadCalls[0].fileContent));
});

test("creatorRegistrationGateway uploadImageFile accepts uid-based auth sessions", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    endUserInfo: {
      userInfo: {
        uid: "applicant-uid-001",
        email: "applicant@example.com"
      }
    }
  });

  const result = await gateway.main({
    action: "uploadImageFile",
    payload: {
      folder: "content/creator-registrations/avatar/applicant@example.com",
      fileName: "avatar.png",
      contentType: "image/png",
      base64: "data:image/png;base64,aGVsbG8="
    }
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.data.fileID,
    "cloud://test-env/content/creator-registrations/avatar/applicant-example.com/avatar.png"
  );
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

test("creatorRegistrationGateway checkEmailAvailability blocks approved creator registration emails", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    collections: {
      creator_registrations: [
        {
          _id: "approved-001",
          authUserId: "approved-001",
          authEmail: "creator@example.com",
          contactEmail: "creator@example.com",
          linkedAdminAccountId: "creator-account-001",
          status: "approved"
        }
      ],
      admin_accounts: [
        {
          _id: "creator-account-001",
          accountType: "creator_portal",
          status: "active",
          uid: "approved-001",
          email: "creator@example.com"
        }
      ]
    }
  });

  const result = await gateway.main({
    action: "checkEmailAvailability",
    payload: {
      email: " Creator@Example.com "
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.email, "creator@example.com");
  assert.equal(result.data.available, false);
  assert.equal(result.data.message, gateway.__test__.REGISTERED_CREATOR_EMAIL_MESSAGE);
});

test("creatorRegistrationGateway checkEmailAvailability ignores approved registration after portal account deletion", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    collections: {
      creator_registrations: [
        {
          _id: "approved-001",
          authUserId: "approved-001",
          authEmail: "creator@example.com",
          contactEmail: "creator@example.com",
          linkedAdminAccountId: "deleted-account-001",
          status: "approved"
        }
      ],
      admin_accounts: []
    }
  });

  const result = await gateway.__test__.checkEmailAvailability({
    email: "creator@example.com"
  });

  assert.equal(result.available, true);
  assert.equal(result.message, "");
});

test("creatorRegistrationGateway checkEmailAvailability blocks active creator portal account emails", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    collections: {
      admin_accounts: [
        {
          _id: "creator-account-001",
          accountType: "creator_portal",
          status: "active",
          email: "creator@example.com",
          boundCreatorId: "creator-linyue"
        }
      ]
    }
  });

  const result = await gateway.__test__.checkEmailAvailability({
    email: "creator@example.com"
  });

  assert.equal(result.available, false);
  assert.equal(result.message, gateway.__test__.REGISTERED_CREATOR_EMAIL_MESSAGE);
});

test("creatorRegistrationGateway submit rejects already approved creator registration email", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    collections: {
      creator_registrations: [
        {
          _id: "approved-001",
          authUserId: "approved-001",
          authEmail: "applicant@example.com",
          contactEmail: "applicant@example.com",
          linkedAdminAccountId: "creator-account-001",
          status: "approved"
        }
      ],
      admin_accounts: [
        {
          _id: "creator-account-001",
          accountType: "creator_portal",
          status: "active",
          uid: "approved-001",
          email: "applicant@example.com"
        }
      ]
    }
  });

  await assert.rejects(
    gateway.__test__.submit({
      contactEmail: "applicant@example.com",
      applicantName: "林越",
      phone: "13800000000",
      avatar: "cloud://avatar-1",
      stance: "带你进入地方生活",
      about: ["长期做田野旅行"]
    }),
    /该邮箱已经被注册过，可以用该邮箱作为用户名登录/
  );
  assert.equal(gateway.__mocks__.collectionAdds.length, 0);
  assert.equal(gateway.__mocks__.collectionUpdates.length, 0);
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

test("creatorRegistrationGateway submit accepts uid sessions without email metadata", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    endUserInfo: {
      userInfo: {
        uid: "applicant-uid-001"
      }
    }
  });

  const result = await gateway.main({
    action: "submit",
    payload: {
      contactEmail: "applicant@example.com",
      applicantName: "林越",
      phone: "13800000000",
      avatar: "cloud://avatar-1",
      stance: "带你进入地方生活",
      about: ["长期做田野旅行"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.registrationId, "applicant-uid-001");
  assert.equal(result.data.authEmail, "applicant@example.com");
  assert.equal(result.data.contactEmail, "applicant@example.com");
});

test("creatorRegistrationGateway submit creates a new registration when doc get reports missing document", async () => {
  const gateway = loadCreatorRegistrationGatewayModule({
    rejectMissingDocGets: true
  });

  const result = await gateway.main({
    action: "submit",
    payload: {
      contactEmail: "applicant@example.com",
      applicantName: "林越",
      phone: "13800000000",
      avatar: "cloud://avatar-1",
      stance: "带你进入地方生活",
      about: ["长期做田野旅行"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.registrationId, "applicant-001");
  assert.equal(gateway.__mocks__.collectionAdds.length, 1);
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

test("creatorRegistrationGateway getActivationDetail returns activation summary for a valid token", async () => {
  const token = "creator-activation-token";
  const gateway = loadCreatorRegistrationGatewayModule({
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "creator@example.com",
        contactEmail: "creator@example.com",
        applicantName: "林越",
        linkedCreatorSlug: "linyue",
        accessProvisionStatus: "activation_pending",
        activationTokenHash: hashActivationTokenForTest(token),
        activationExpiresAt: Date.now() + 60_000,
        activationConsumedAt: 0,
        status: "approved"
      }
    }
  });

  const result = await gateway.main({
    action: "getActivationDetail",
    payload: { token }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    registrationId: "applicant-001",
    applicantName: "林越",
    contactEmail: "creator@example.com",
    loginUsername: "applicant-001",
    linkedCreatorSlug: "linyue",
    status: "activation_pending",
    expiresAt: result.data.expiresAt
  });
  assert.equal(typeof result.data.expiresAt, "number");
  assert.equal(result.data.expiresAt > Date.now(), true);
});

test("creatorRegistrationGateway getActivationDetail rejects expired token", async () => {
  const token = "expired-activation-token";
  const gateway = loadCreatorRegistrationGatewayModule({
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "creator@example.com",
        contactEmail: "creator@example.com",
        accessProvisionStatus: "activation_pending",
        activationTokenHash: hashActivationTokenForTest(token),
        activationExpiresAt: Date.now() - 1_000,
        activationConsumedAt: 0,
        status: "approved"
      }
    }
  });

  const result = await gateway.main({
    action: "getActivationDetail",
    payload: { token }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /激活链接已过期/);
});

test("creatorRegistrationGateway getActivationDetail rejects consumed token", async () => {
  const token = "consumed-activation-token";
  const gateway = loadCreatorRegistrationGatewayModule({
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "creator@example.com",
        contactEmail: "creator@example.com",
        accessProvisionStatus: "activation_pending",
        activationTokenHash: hashActivationTokenForTest(token),
        activationExpiresAt: Date.now() + 60_000,
        activationConsumedAt: Date.now() - 1_000,
        status: "approved"
      }
    }
  });

  const result = await gateway.main({
    action: "getActivationDetail",
    payload: { token }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /激活链接已失效/);
});

test("creatorRegistrationGateway consumeActivation rejects mismatched session email", async () => {
  const token = "creator-activation-token";
  const gateway = loadCreatorRegistrationGatewayModule({
    endUserInfo: {
      userInfo: {
        id: "applicant-001",
        email: "other@example.com"
      }
    },
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "creator@example.com",
        contactEmail: "creator@example.com",
        accessProvisionStatus: "activation_pending",
        activationTokenHash: hashActivationTokenForTest(token),
        activationExpiresAt: Date.now() + 60_000,
        activationConsumedAt: 0,
        status: "approved"
      }
    }
  });

  const result = await gateway.main({
    action: "consumeActivation",
    payload: { token }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /请使用申请邮箱完成激活/);
});

test("creatorRegistrationGateway consumeActivation accepts uid sessions without email metadata", async () => {
  const token = "creator-activation-token";
  const gateway = loadCreatorRegistrationGatewayModule({
    endUserInfo: {
      userInfo: {
        uid: "applicant-001"
      }
    },
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "creator@example.com",
        contactEmail: "creator@example.com",
        applicantName: "林越",
        linkedCreatorId: "creator-linyue",
        linkedCreatorSlug: "linyue",
        accessProvisionStatus: "activation_pending",
        activationTokenHash: hashActivationTokenForTest(token),
        activationExpiresAt: Date.now() + 60_000,
        activationConsumedAt: 0,
        status: "approved"
      },
      "creator-doc-uid-1": {
        _id: "creator-doc-uid-1",
        id: "creator-linyue",
        slug: "linyue",
        name: "林越",
        status: "inactive"
      }
    }
  });

  const result = await gateway.main({
    action: "consumeActivation",
    payload: { token }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.registrationId, "applicant-001");
  assert.equal(result.data.status, "provisioned");
});

test("creatorRegistrationGateway consumeActivation persists provisioned status and activationConsumedAt", async () => {
  const token = "creator-activation-token";
  const beforeConsume = Date.now();
  const gateway = loadCreatorRegistrationGatewayModule({
    endUserInfo: {
      userInfo: {
        id: "applicant-001",
        email: "creator@example.com"
      }
    },
    docs: {
      "applicant-001": {
        _id: "applicant-001",
        authUserId: "applicant-001",
        authEmail: "creator@example.com",
        contactEmail: "creator@example.com",
        applicantName: "林越",
        linkedCreatorId: "creator-linyue",
        linkedCreatorSlug: "linyue",
        accessProvisionStatus: "activation_pending",
        activationTokenHash: hashActivationTokenForTest(token),
        activationExpiresAt: Date.now() + 60_000,
        activationConsumedAt: 0,
        status: "approved",
        updatedAt: beforeConsume - 10_000
      },
      "creator-doc-1": {
        _id: "creator-doc-1",
        id: "creator-linyue",
        slug: "linyue",
        name: "林越",
        status: "inactive",
        updatedAt: beforeConsume - 20_000
      }
    }
  });

  const result = await gateway.main({
    action: "consumeActivation",
    payload: { token }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.registrationId, "applicant-001");
  assert.equal(result.data.status, "provisioned");
  assert.equal(result.data.activationConsumedAt >= beforeConsume, true);

  const storedDoc = gateway.__mocks__.docs.get("applicant-001");
  assert.equal(storedDoc.accessProvisionStatus, "provisioned");
  assert.equal(storedDoc.activationConsumedAt, result.data.activationConsumedAt);
  assert.equal(storedDoc.updatedAt, result.data.activationConsumedAt);
  assert.equal(storedDoc.linkedCreatorId, "creator-linyue");
  assert.equal(storedDoc.linkedCreatorSlug, "linyue");

  const creatorDoc = gateway.__mocks__.docs.get("creator-doc-1");
  assert.equal(creatorDoc.status, "active");
  assert.equal(creatorDoc.updatedAt, result.data.activationConsumedAt);
  assert.equal(creatorDoc.updatedBy, "applicant-001");
});
