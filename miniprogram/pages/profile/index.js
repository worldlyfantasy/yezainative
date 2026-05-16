const { getMyPageData, getMyPageInitialState, login, updateProfile, logout } = require("../../services/user");
const { getShareReferralEntryStatus } = require("../../api/cloud/referral");
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

function deleteCloudFile(fileID) {
  return new Promise((resolve) => {
    if (!fileID || !wx.cloud || typeof wx.cloud.deleteFile !== "function") {
      resolve();
      return;
    }

    wx.cloud.deleteFile({
      fileList: [fileID],
      complete: resolve
    });
  });
}

/** 已落在云存储 fileID 或本站静态图上的地址，无需再上传 */
function isPersistentAvatarUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return false;
  }
  if (raw.startsWith("cloud://")) {
    return true;
  }
  if (/^https?:\/\//.test(raw)) {
    return raw.includes("tcb.qcloud.la") || raw.includes(".myqcloud.com");
  }
  return false;
}

function isWechatTempAvatarPath(value) {
  const raw = String(value || "").trim();
  return /^wxfile:\/\//.test(raw) || /^https?:\/\/tmp\//.test(raw);
}

function downloadAvatarToTemp(url) {
  return new Promise((resolve, reject) => {
    const href = String(url || "").trim();
    if (!/^https?:\/\//.test(href)) {
      reject(new Error("Avatar download url invalid"));
      return;
    }

    wx.downloadFile({
      url: href,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error(`Avatar download failed: ${res.statusCode}`));
      },
      fail: reject
    });
  });
}

/**
 * 将 chooseAvatar 等来源的头像统一落到云存储 fileID。
 * 此前若把临时 https 当「永久地址」写入库，链接过期后头像会「消失」。
 */
async function persistAvatarToStableStorage(source) {
  const raw = String(source || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return await uploadAvatarToCloud(raw);
  } catch (firstError) {
    if (!/^https?:\/\//.test(raw) || isWechatTempAvatarPath(raw)) {
      throw firstError;
    }
  }

  const tempPath = await downloadAvatarToTemp(raw);
  return uploadAvatarToCloud(tempPath);
}

function buildShortcutRows(shortcuts) {
  const source = Array.isArray(shortcuts) ? shortcuts : [];
  const rows = [];

  for (let index = 0; index < source.length; index += 2) {
    rows.push(source.slice(index, index + 2));
  }

  return rows;
}

function buildProfileDraftNickname(user) {
  const nickname = String(user && user.nickname ? user.nickname : "").trim();
  if (!nickname || (!user.profileConfigured && nickname === "旅人")) {
    return "";
  }

  return nickname;
}

function hasShareReferralCoupon(assetOverview) {
  if (assetOverview && (assetOverview.shouldOpenAssets || assetOverview.hasCoupon)) {
    return true;
  }

  const coupons = Array.isArray(assetOverview && assetOverview.coupons) ? assetOverview.coupons : [];
  if (coupons.length) {
    return true;
  }

  const totalAmount = Number(
    assetOverview && assetOverview.couponTotalAmount
      ? assetOverview.couponTotalAmount
      : assetOverview && assetOverview.couponSummary && assetOverview.couponSummary.totalAmount
  );
  return Number.isFinite(totalAmount) && totalAmount > 0;
}

async function resolveShareReferralEntryUrl() {
  try {
    const entryStatus = await getShareReferralEntryStatus();
    return hasShareReferralCoupon(entryStatus)
      ? "/pkg/account/assets/index"
      : "/pkg/activity/share-referral/index";
  } catch (error) {
    console.error("Failed to resolve share referral entry", error);
    return "/pkg/activity/share-referral/index";
  }
}

Page({
  data: Object.assign(
    {
      refreshPending: false,
      profileIncomplete: false,
      profilePromptVisible: false,
      profilePromptDismissed: false,
      profilePromptNicknameFocus: false,
      profilePromptKeyboardActive: false,
      profileSaving: false,
      profileNicknameEditing: false,
      nicknameInputFocus: false,
      profileDraftNickname: "",
      profileDraftAvatarUrl: "",
      shortcutRows: []
    },
    getMyPageInitialState()
  ),

  onLoad() {
    const initialState = getMyPageInitialState();
    this.setData(
      Object.assign(
        {
          profileIncomplete: false,
          profilePromptVisible: false,
          profilePromptDismissed: false,
          profilePromptNicknameFocus: false,
          profilePromptKeyboardActive: false,
          profileSaving: false,
          profileNicknameEditing: false,
          nicknameInputFocus: false,
          profileDraftNickname: "",
          profileDraftAvatarUrl: "",
          shortcutRows: buildShortcutRows(initialState.shortcuts)
        },
        initialState
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
    const profilePromptVisible = Boolean(profileIncomplete && !this.data.profilePromptDismissed);
    const keepProfileDraft = Boolean(
      profileIncomplete && (this.data.profilePromptVisible || this.data.profileNicknameEditing || this.data.profileSaving)
    );
    const currentDraftNickname = String(this.data.profileDraftNickname || "");
    const currentDraftAvatarUrl = String(this.data.profileDraftAvatarUrl || "");
    const nextDraftNickname = profileIncomplete
      ? keepProfileDraft && currentDraftNickname
        ? currentDraftNickname
        : buildProfileDraftNickname(user)
      : user && user.profileConfigured
        ? user.nickname
        : "";
    const nextDraftAvatarUrl = keepProfileDraft ? currentDraftAvatarUrl : "";

    this.setData(
      Object.assign(
        {
          refreshPending: false
        },
        pageData,
        {
          profileIncomplete,
          profilePromptVisible,
          profilePromptNicknameFocus: false,
          profilePromptKeyboardActive: false,
          profileSaving: Boolean(this.data.profileSaving),
          profileNicknameEditing: false,
          nicknameInputFocus: false,
          profileDraftNickname: nextDraftNickname,
          profileDraftAvatarUrl: nextDraftAvatarUrl,
          shortcutRows: buildShortcutRows(pageData && pageData.shortcuts)
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
    this.setData({
      profilePromptDismissed: false
    });

    await login();
    await this.refresh();

    if (!this.data.profilePromptVisible) {
      wx.showToast({
        title: pickAuditText("登录成功", "登录成功"),
        icon: "none"
      });
    }
  },

  async handleLogout() {
    await logout();
    this.setData({
      profilePromptVisible: false,
      profilePromptDismissed: false,
      profilePromptNicknameFocus: false,
      profilePromptKeyboardActive: false
    });
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

  handleProfilePromptChooseAvatar(event) {
    const avatarUrl = event && event.detail ? event.detail.avatarUrl || "" : "";
    if (!avatarUrl) {
      return;
    }

    this.setData({
      profileDraftAvatarUrl: avatarUrl,
      profilePromptNicknameFocus: !String(this.data.profileDraftNickname || "").trim()
    });
  },

  handleProfilePromptDismiss() {
    this.setData({
      profilePromptVisible: false,
      profilePromptDismissed: true,
      profilePromptNicknameFocus: false,
      profilePromptKeyboardActive: false,
      profileDraftAvatarUrl: ""
    });
  },

  handleProfilePromptNicknameFocus() {
    this.setData({
      profilePromptKeyboardActive: true
    });
  },

  handleProfilePromptNicknameBlur() {
    this.setData({
      profilePromptKeyboardActive: false
    });
  },

  async handleProfilePromptSave() {
    await this.saveProfile(this.data.profileDraftNickname, {
      requireAvatar: true
    });
  },

  async handleProfilePromptConfirm(event) {
    const nickname = event && event.detail ? event.detail.value || "" : "";
    await this.saveProfile(nickname, {
      requireAvatar: true
    });
  },

  noop() {},

  async saveProfile(nicknameInput, options) {
    if (this.data.profileSaving) {
      return null;
    }

    const config = Object.assign(
      {
        requireAvatar: false
      },
      options || {}
    );
    const user = this.data.user || null;
    const fallbackNickname = config.requireAvatar ? "" : (user && user.nickname) || "";
    const nickname = String(nicknameInput || this.data.profileDraftNickname || fallbackNickname).trim();
    const selectedAvatarUrl = String(this.data.profileDraftAvatarUrl || (user && user.avatarUrl) || "").trim();
    if (!nickname) {
      wx.showToast({
        title: "请输入昵称",
        icon: "none"
      });
      return null;
    }

    if (config.requireAvatar && !selectedAvatarUrl) {
      wx.showToast({
        title: "请选择头像",
        icon: "none"
      });
      return null;
    }

    this.setData({
      profileSaving: true
    });

    let uploadedAvatarFileId = "";

    try {
      let avatarUrl = "";
      if (!selectedAvatarUrl) {
        avatarUrl = "";
      } else if (isPersistentAvatarUrl(selectedAvatarUrl)) {
        avatarUrl = selectedAvatarUrl;
      } else {
        avatarUrl = await persistAvatarToStableStorage(selectedAvatarUrl);
      }
      uploadedAvatarFileId = avatarUrl !== selectedAvatarUrl ? avatarUrl : "";
      const nextUser = await updateProfile({
        nickname,
        avatarUrl
      });

      this.setData({
        user: nextUser,
        profileIncomplete: !nextUser.profileConfigured,
        profilePromptVisible: !nextUser.profileConfigured && this.data.profilePromptVisible,
        profilePromptDismissed: nextUser.profileConfigured ? false : this.data.profilePromptDismissed,
        profilePromptNicknameFocus: false,
        profilePromptKeyboardActive: false,
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

      return nextUser;
    } catch (error) {
      await deleteCloudFile(uploadedAvatarFileId);
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
      return null;
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

  async onShortcutTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "orders") {
      wx.navigateTo({
        url: "/pkg/account/orders/index"
      });
      return;
    }

    if (key === "favorites") {
      wx.navigateTo({
        url: "/pkg/account/favorites/index"
      });
      return;
    }

    if (key === "assets") {
      if (typeof wx.showLoading === "function") {
        wx.showLoading({
          title: "确认中",
          mask: true
        });
      }
      const url = await resolveShareReferralEntryUrl();
      if (typeof wx.hideLoading === "function") {
        wx.hideLoading();
      }
      wx.navigateTo({ url });
      return;
    }

    if (key === "travelers") {
      wx.navigateTo({
        url: "/pkg/account/travelers/index"
      });
      return;
    }

    showOfflineOrderNotice();
  },

  onCustomTripEntryTap() {
    wx.navigateTo({
      url: "/pkg/explore/custom-services/index"
    });
  }
});
