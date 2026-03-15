const { DATA_SOURCE_TYPES, getUserDataSource, isCloudFallbackEnabled } = require("../constants/data-source");
const cloudUserApi = require("../api/cloud/user");
const legacyUserRepository = require("./legacy/user-repository");
const { mapUser } = require("../mappers/user");

function getRepository() {
  return getUserDataSource() === DATA_SOURCE_TYPES.CLOUD ? cloudUserApi : legacyUserRepository;
}

function getSessionSnapshot() {
  const sessionActive = legacyUserRepository.isSessionActive();
  const cachedUser = legacyUserRepository.getCachedUser();
  const user = sessionActive ? mapUser(cachedUser || {}) : null;

  return {
    loggedIn: Boolean(sessionActive),
    user
  };
}

async function getCurrentUser() {
  if (!legacyUserRepository.isSessionActive()) {
    return null;
  }

  const repository = getRepository();

  try {
    const payload = await repository.getCurrentUser();
    const user = mapUser(payload);
    if (user) {
      legacyUserRepository.setCachedUser(user);
    }
    return user;
  } catch (error) {
    return legacyUserRepository.getCachedUser();
  }
}

function requestWechatProfile() {
  return new Promise((resolve) => {
    if (typeof wx.getUserProfile !== "function") {
      resolve({});
      return;
    }

    wx.getUserProfile({
      desc: "用于完善个人资料与订单联系信息",
      success: (result) => {
        resolve(result && result.userInfo ? result.userInfo : {});
      },
      fail: () => {
        resolve({});
      }
    });
  });
}

async function login() {
  const repository = getRepository();
  const profile = await requestWechatProfile();

  try {
    const payload = await repository.login(profile);
    const user = mapUser(payload);
    legacyUserRepository.setSessionActive(true);
    legacyUserRepository.setCachedUser(user);
    return user;
  } catch (error) {
    if (!isCloudFallbackEnabled()) {
      throw error;
    }
    const fallbackUser = await legacyUserRepository.login(profile);
    return mapUser(fallbackUser);
  }
}

async function logout() {
  legacyUserRepository.setSessionActive(false);
  legacyUserRepository.setCachedUser(null);
}

module.exports = {
  getCurrentUser,
  getSessionSnapshot,
  login,
  logout
};
