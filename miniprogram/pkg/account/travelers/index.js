const cloudUserApi = require("../../../api/cloud/user");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");

const GENDER_OPTIONS = ["女", "男"];
const GENDER_VALUE_MAP = ["female", "male"];
const DOCUMENT_OPTIONS = ["身份证", "护照", "港澳台居住证", "其他证件"];
const DOCUMENT_VALUE_MAP = ["idCard", "passport", "hkmtResidencePermit", "other"];

function buildEmptyForm() {
  return {
    profileId: "",
    name: "",
    phone: "",
    gender: "",
    genderIndex: 0,
    birthday: "",
    documentType: "",
    documentTypeIndex: 0,
    documentNumber: "",
    wechat: "",
    email: ""
  };
}

function resolveOptionIndex(options, value) {
  const index = options.indexOf(value);
  return index >= 0 ? index : 0;
}

function normalizeTravelerForm(form) {
  const source = form && typeof form === "object" ? form : buildEmptyForm();
  return {
    profileId: String(source.profileId || "").trim(),
    name: String(source.name || "").trim(),
    phone: String(source.phone || "").replace(/\s+/g, ""),
    gender: String(source.gender || "").trim(),
    genderIndex: typeof source.genderIndex === "number" ? source.genderIndex : resolveOptionIndex(GENDER_VALUE_MAP, String(source.gender || "").trim()),
    birthday: String(source.birthday || "").trim(),
    documentType: String(source.documentType || "").trim(),
    documentTypeIndex: typeof source.documentTypeIndex === "number" ? source.documentTypeIndex : resolveOptionIndex(DOCUMENT_VALUE_MAP, String(source.documentType || "").trim()),
    documentNumber: String(source.documentNumber || "").trim().toUpperCase(),
    wechat: String(source.wechat || "").trim(),
    email: String(source.email || "").trim()
  };
}

function buildFormFromTraveler(traveler) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const firstDocument = Array.isArray(source.documents) && source.documents.length ? source.documents[0] : null;
  return normalizeTravelerForm({
    profileId: source.profileId || "",
    name: source.name || "",
    phone: source.phone || "",
    gender: source.gender || "",
    birthday: source.birthday || "",
    documentType: firstDocument && firstDocument.documentType ? firstDocument.documentType : "",
    documentNumber: firstDocument && firstDocument.documentNumber ? firstDocument.documentNumber : "",
    wechat: source.wechat || "",
    email: source.email || ""
  });
}

function validateForm(form) {
  const errors = {};
  if (!form.name) {
    errors.name = "请填写与证件一致的姓名";
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    errors.phone = "请填写 11 位常用手机号";
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "邮箱格式不正确";
  }
  if (form.documentNumber && !form.documentType) {
    errors.documentType = "请先选择证件类型";
  }
  if (form.documentType && !form.documentNumber) {
    errors.documentNumber = "请填写证件号码";
  }
  return errors;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    errorText: "",
    travelers: [],
    editorVisible: false,
    editorMode: "create",
    saving: false,
    deletingProfileId: "",
    form: buildEmptyForm(),
    formErrors: {},
    genderOptions: GENDER_OPTIONS,
    documentOptions: DOCUMENT_OPTIONS
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const user = await getCurrentUser();
      if (!user) {
        this.setData({
          loading: false,
          loggedIn: false,
          travelers: []
        });
        return;
      }

      const travelers = await cloudUserApi.listTravelerProfiles();
      this.setData({
        loading: false,
        loggedIn: true,
        travelers: Array.isArray(travelers) ? travelers : []
      });
    } catch (error) {
      console.error("Failed to load travelers", error);
      this.setData({
        loading: false,
        loggedIn: true,
        errorText: "出行人加载失败，请稍后重试。"
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        goTopLevel(TOP_LEVEL_ROUTES.profile);
      }
    });
  },

  openCreateEditor() {
    this.setData({
      editorVisible: true,
      editorMode: "create",
      form: buildEmptyForm(),
      formErrors: {}
    });
  },

  openEditEditor(event) {
    const profileId = String(event.currentTarget.dataset.profileId || "").trim();
    const traveler = (this.data.travelers || []).find((item) => item.profileId === profileId);
    if (!traveler) {
      return;
    }

    this.setData({
      editorVisible: true,
      editorMode: "edit",
      form: buildFormFromTraveler(traveler),
      formErrors: {}
    });
  },

  closeEditor() {
    if (this.data.saving) {
      return;
    }

    this.setData({
      editorVisible: false,
      editorMode: "create",
      form: buildEmptyForm(),
      formErrors: {}
    });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    const value = event.detail ? event.detail.value || "" : "";
    const form = normalizeTravelerForm({
      ...this.data.form,
      [field]: value
    });
    const formErrors = {
      ...this.data.formErrors,
      [field]: ""
    };
    this.setData({
      form,
      formErrors
    });
  },

  onGenderChange(event) {
    const index = Number(event.detail && event.detail.value);
    const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    this.setData({
      form: normalizeTravelerForm({
        ...this.data.form,
        genderIndex: safeIndex,
        gender: GENDER_VALUE_MAP[safeIndex] || ""
      }),
      formErrors: {
        ...this.data.formErrors,
        gender: ""
      }
    });
  },

  onBirthdayChange(event) {
    const value = event.detail ? event.detail.value || "" : "";
    this.setData({
      form: normalizeTravelerForm({
        ...this.data.form,
        birthday: value
      })
    });
  },

  onDocumentTypeChange(event) {
    const index = Number(event.detail && event.detail.value);
    const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    this.setData({
      form: normalizeTravelerForm({
        ...this.data.form,
        documentTypeIndex: safeIndex,
        documentType: DOCUMENT_VALUE_MAP[safeIndex] || ""
      }),
      formErrors: {
        ...this.data.formErrors,
        documentType: ""
      }
    });
  },

  async saveTraveler() {
    if (this.data.saving) {
      return;
    }
    const form = normalizeTravelerForm(this.data.form);
    const formErrors = validateForm(form);
    if (Object.keys(formErrors).length) {
      this.setData({
        formErrors
      });
      wx.showToast({
        title: Object.values(formErrors)[0],
        icon: "none"
      });
      return;
    }

    this.setData({
      saving: true,
      formErrors: {}
    });

    try {
      await cloudUserApi.upsertTravelerProfile({
        profileId: form.profileId,
        name: form.name,
        phone: form.phone,
        gender: form.gender,
        birthday: form.birthday,
        wechat: form.wechat,
        email: form.email,
        documents: form.documentType && form.documentNumber
          ? [
              {
                documentType: form.documentType,
                documentNumber: form.documentNumber
              }
            ]
          : []
      });
      this.setData({
        saving: false,
        editorVisible: false,
        form: buildEmptyForm()
      });
      wx.showToast({
        title: this.data.editorMode === "edit" ? "出行人已更新" : "出行人已保存",
        icon: "none"
      });
      await this.refresh();
    } catch (error) {
      console.error("Failed to save traveler", error);
      this.setData({
        saving: false
      });
      wx.showToast({
        title: "保存失败，请稍后重试",
        icon: "none"
      });
    }
  },

  async confirmDelete(event) {
    const profileId = String(event.currentTarget.dataset.profileId || "").trim();
    if (!profileId || this.data.deletingProfileId) {
      return;
    }

    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: "删除出行人",
        content: "删除后，该档案不会再出现在报名页快捷选择中。",
        confirmColor: "#993921",
        success: resolve,
        fail: () => resolve({ confirm: false })
      });
    });

    if (!modalResult || !modalResult.confirm) {
      return;
    }

    this.setData({
      deletingProfileId: profileId
    });

    try {
      await cloudUserApi.deleteTravelerProfile(profileId);
      wx.showToast({
        title: "已删除",
        icon: "none"
      });
      await this.refresh();
    } catch (error) {
      console.error("Failed to delete traveler", error);
      wx.showToast({
        title: "删除失败，请稍后重试",
        icon: "none"
      });
    } finally {
      this.setData({
        deletingProfileId: ""
      });
    }
  }
});
