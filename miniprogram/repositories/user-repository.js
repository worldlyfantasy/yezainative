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

async function login() {
  const repository = getRepository();

  try {
    const payload = await repository.login();
    const user = mapUser(payload);
    legacyUserRepository.setSessionActive(true);
    legacyUserRepository.setCachedUser(user);
    return user;
  } catch (error) {
    if (!isCloudFallbackEnabled()) {
      throw error;
    }
    const fallbackUser = await legacyUserRepository.login();
    return mapUser(fallbackUser);
  }
}

async function updateProfile(profile) {
  const repository = getRepository();

  try {
    const payload = await repository.updateProfile(profile);
    const user = mapUser(payload);
    legacyUserRepository.setCachedUser(user);
    return user;
  } catch (error) {
    if (!isCloudFallbackEnabled()) {
      throw error;
    }

    const fallbackUser = await legacyUserRepository.updateProfile(profile);
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
  updateProfile,
  logout
};
