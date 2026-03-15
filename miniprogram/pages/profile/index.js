const { getMyPageData, getMyPageInitialState, login, updateProfile, logout } = require("../../services/user");
const { showOfflineOrderNotice } = require("../../utils/offline");
const { pickAuditText } = require("../../utils/audit");

const USER_AVATAR_CLOUD_ROOT = "user_avatar";

function extractFileExtension(filePath) {
  const match = /(\.[A-Za-z0-9]+)(?:\?|$)/.exec(String(filePath || ""));
  return match ? match[1].toLowerCase() : ".png";
}

function createAvatarCloudPath(filePath) {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `${USER_AVATAR_CLOUD_ROOT}/${Date.now()}-${randomSuffix}${extractFileExtension(filePath)}`;
}

function uploadAvatarToCloud(filePath) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.uploadFile !== "function") {
      reject(new Error("wx.cloud.uploadFile is unavailable"));
      return;
    }

    wx.cloud.uploadFile({
      cloudPath: createAvatarCloudPath(filePath),
      filePath,
      success: (result) => {
        if (!result || !result.fileID) {
          reject(new Error("Avatar upload returned empty fileID"));
          return;
        }

        resolve(result.fileID);
      },
      fail: reject
    });
  });
}

Page({
  data: Object.assign(
    {
      refreshPending: false,
      profileIncomplete: false,
      profileSaving: false,
      profileNicknameEditing: false,
      nicknameInputFocus: false,
      profileDraftNickname: "",
      profileDraftAvatarUrl: ""
    },
    getMyPageInitialState()
  ),

  onLoad() {
    this.setData(
      Object.assign(
        {
          profileIncomplete: false,
          profileSaving: false,
          profileNicknameEditing: false,
          nicknameInputFocus: false,
          profileDraftNickname: "",
          profileDraftAvatarUrl: ""
        },
        getMyPageInitialState()
      )
    );
  },

  onShow() {
    this.refresh();
  },

  applyPageData(pageData) {
    const user = pageData && pageData.user ? pageData.user : null;
    const loggedIn = Boolean(pageData && pageData.loggedIn);
    const profileIncomplete = Boolean(loggedIn && user && !user.profileConfigured);

    this.setData(
      Object.assign(
        {
          refreshPending: false
        },
        pageData,
        {
          profileIncomplete,
          profileSaving: false,
          profileNicknameEditing: false,
          nicknameInputFocus: false,
          profileDraftNickname: user && user.profileConfigured ? user.nickname : "",
          profileDraftAvatarUrl: ""
        }
      )
    );
  },

  async refresh() {
    if (this.data.refreshPending) {
      return;
    }

    this.setData({
      refreshPending: true
    });

    try {
      this.applyPageData(await getMyPageData());
    } catch (error) {
      this.setData({
        refreshPending: false
      });
    }
  },

  async handleLogin() {
    await login();
    await this.refresh();
    wx.showToast({
      title: pickAuditText(this.data.profileIncomplete ? "点击头像设置资料" : "登录成功", this.data.profileIncomplete ? "点击头像设置资料" : "登录成功"),
      icon: "none"
    });
  },

  async handleLogout() {
    await logout();
    await this.refresh();
  },

  handleNicknameInput(event) {
    this.setData({
      profileDraftNickname: event && event.detail ? event.detail.value || "" : ""
    });
  },

  handleStartNicknameEdit() {
    const user = this.data.user || null;

    this.setData({
      profileNicknameEditing: true,
      nicknameInputFocus: true,
      profileDraftNickname: String(user && user.nickname ? user.nickname : "").trim(),
      profileDraftAvatarUrl: ""
    });
  },

  handleChooseAvatar(event) {
    const avatarUrl = event && event.detail ? event.detail.avatarUrl || "" : "";
    const user = this.data.user || null;
    if (!avatarUrl) {
      return;
    }

    const existingNickname = String(user && user.nickname ? user.nickname : "").trim();
    const canSaveAvatarDirectly = Boolean(existingNickname);

    this.setData(
      {
        profileDraftAvatarUrl: avatarUrl,
        profileDraftNickname: canSaveAvatarDirectly ? existingNickname : "",
        profileNicknameEditing: !canSaveAvatarDirectly,
        nicknameInputFocus: !canSaveAvatarDirectly
      },
      async () => {
        if (canSaveAvatarDirectly) {
          await this.saveProfile(existingNickname);
          return;
        }

        wx.showToast({
          title: "继续确认昵称",
          icon: "none"
        });
      }
    );
  },

  async saveProfile(nicknameInput) {
    if (this.data.profileSaving) {
      return;
    }

    const user = this.data.user || null;
    const nickname = String(nicknameInput || this.data.profileDraftNickname || user && user.nickname || "").trim();
    const selectedAvatarUrl = String(this.data.profileDraftAvatarUrl || user && user.avatarUrl || "").trim();
    if (!nickname) {
      wx.showToast({
        title: "请输入昵称",
        icon: "none"
      });
      return;
    }

    this.setData({
      profileSaving: true
    });

    try {
      const avatarUrl = !selectedAvatarUrl
        ? ""
        : selectedAvatarUrl.startsWith("cloud://") || /^https?:\/\//.test(selectedAvatarUrl)
          ? selectedAvatarUrl
          : await uploadAvatarToCloud(selectedAvatarUrl);
      const nextUser = await updateProfile({
        nickname,
        avatarUrl
      });

      this.setData({
        user: nextUser,
        profileIncomplete: !nextUser.profileConfigured,
        profileSaving: false,
        profileNicknameEditing: false,
        nicknameInputFocus: false,
        profileDraftNickname: nextUser.nickname || "",
        profileDraftAvatarUrl: ""
      });

      wx.showToast({
        title: "资料已保存",
        icon: "none"
      });
    } catch (error) {
      console.error("Failed to save profile", {
        error,
        selectedAvatarUrl,
        nickname
      });
      this.setData({
        profileSaving: false,
        nicknameInputFocus: false
      });
      wx.showToast({
        title: "保存失败，请稍后重试",
        icon: "none"
      });
    }
  },

  async handleNicknameBlur(event) {
    const nickname = event && event.detail ? event.detail.value || "" : "";
    this.setData({
      profileDraftNickname: nickname
    });
  },

  async handleNicknameConfirm(event) {
    const nickname = event && event.detail ? event.detail.value || "" : "";
    await this.saveProfile(nickname);
  },

  async handleNicknameSaveTap() {
    await this.saveProfile(this.data.profileDraftNickname);
  },

  handleNicknameCancel() {
    this.setData({
      profileNicknameEditing: false,
      nicknameInputFocus: false,
      profileDraftNickname: this.data.user && this.data.user.profileConfigured ? this.data.user.nickname : "",
      profileDraftAvatarUrl: ""
    });
  },

  onShortcutTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "orders") {
      wx.navigateTo({
        url: "/pages/orders/index"
      });
      return;
    }

    if (key === "favorites") {
      wx.navigateTo({
        url: "/pages/favorites/index"
      });
      return;
    }

    showOfflineOrderNotice();
  },

  onActiveTripTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/service-detail/index?slug=${slug}`
    });
  },

  onActiveTripCreatorTap(event) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${slug}`
    });
  },

  onOrderTap(event) {
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${event.currentTarget.dataset.id}`
    });
  }
});
