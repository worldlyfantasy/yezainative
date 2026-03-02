Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    favorited: {
      type: Boolean,
      value: false
    },
    noticeState: {
      type: String,
      value: ""
    }
  },
  methods: {
    handleToggle() {
      this.triggerEvent("toggle");
    },

    handleNavigateFavorites() {
      this.triggerEvent("navigatefavorites");
    }
  }
});
