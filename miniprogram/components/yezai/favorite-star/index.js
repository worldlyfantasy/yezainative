Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    favorited: {
      type: Boolean,
      value: false
    },
    showButton: {
      type: Boolean,
      value: true
    },
    noticeState: {
      type: String,
      value: ""
    },
    noticeLabel: {
      type: String,
      value: "收藏成功"
    },
    noticeActionLabel: {
      type: String,
      value: "进入我的收藏"
    },
    noticeMode: {
      type: String,
      value: "success"
    },
    noticeElevated: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    handleToggle() {
      this.triggerEvent("toggle");
    },

    handleNavigateFavorites() {
      this.triggerEvent("noticeaction");
      this.triggerEvent("navigatefavorites");
    }
  }
});
