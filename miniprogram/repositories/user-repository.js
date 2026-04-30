const cloudUserApi = require("../api/cloud/user");
const userSessionStore = require("./local/user-session-store");
const { mapUser } = require("../mappers/user");

function getSessionSnapshot() {
  const sessionActive = userSessionStore.isSessionActive();
  const cachedUser = userSessionStore.getCachedUser();
  const user = sessionActive ? mapUser(cachedUser || {}) : null;

  return {
    loggedIn: Boolean(sessionActive),
    user
  };
}

async function getCurrentUser() {
  if (!userSessionStore.isSessionActive()) {
    return null;
  }

  try {
    const payload = await cloudUserApi.getCurrentUser();
    const user = mapUser(payload);
    if (user) {
      userSessionStore.setCachedUser(user);
    }
    return user;
  } catch (error) {
    return userSessionStore.getCachedUser();
  }
}

async function login() {
  const payload = await cloudUserApi.login();
  const user = mapUser(payload);
  userSessionStore.setSessionActive(true);
  userSessionStore.setCachedUser(user);
  return user;
}

async function updateProfile(profile) {
  const payload = await cloudUserApi.updateProfile(profile);
  const user = mapUser(payload);
  userSessionStore.setCachedUser(user);
  return user;
}

async function logout() {
  userSessionStore.setSessionActive(false);
  userSessionStore.setCachedUser(null);
}

function activateSession(userPayload) {
  const user = mapUser(userPayload);
  if (!user) {
    return null;
  }

  userSessionStore.setSessionActive(true);
  userSessionStore.setCachedUser(user);
  return user;
}

module.exports = {
  getCurrentUser,
  getSessionSnapshot,
  login,
  updateProfile,
  logout,
  activateSession
};
