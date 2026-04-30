const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const userRepositoryModulePath = path.resolve(
  __dirname,
  "../miniprogram/repositories/user-repository.js"
);

function loadUserRepository(mocks) {
  const originalLoad = Module._load;

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../api/cloud/user") {
      return mocks.cloudUserApi;
    }

    if (request === "../api/cloud/referral") {
      return mocks.cloudReferralApi;
    }

    if (request === "./local/user-session-store") {
      return mocks.userSessionStore;
    }

    if (request === "../mappers/user") {
      return {
        mapUser: mocks.mapUser
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[userRepositoryModulePath];

  try {
    return require(userRepositoryModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test("user repository login does not bootstrap direct referral benefits", async () => {
  const calls = [];
  const repository = loadUserRepository({
    cloudUserApi: {
      async login() {
        calls.push("cloudUserApi.login");
        return {
          id: "user_1",
          nickname: "旅人"
        };
      }
    },
    cloudReferralApi: {
      async ensureDirectRegistrationBenefits() {
        calls.push("cloudReferralApi.ensureDirectRegistrationBenefits");
        return {
          currentUser: {
            id: "user_1",
            nickname: "海森"
          },
          ownReferralCode: "ABCD1234"
        };
      }
    },
    userSessionStore: {
      setSessionActive(value) {
        calls.push(`setSessionActive:${value}`);
      },
      setCachedUser(user) {
        calls.push(`setCachedUser:${user && user.nickname}`);
      }
    },
    mapUser(payload) {
      return payload ? Object.assign({ mapped: true }, payload) : null;
    }
  });

  const user = await repository.login();

  assert.equal(user.nickname, "旅人");
  assert.deepEqual(calls, [
    "cloudUserApi.login",
    "setSessionActive:true",
    "setCachedUser:旅人"
  ]);
});
