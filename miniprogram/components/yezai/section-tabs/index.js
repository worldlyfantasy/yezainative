Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    sections: {
      type: Array,
      value: []
    },
    activeKey: {
      type: String,
      value: ""
    },
    compact: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onTabTap(event) {
      const key = event.currentTarget.dataset.key;
      if (!key) return;
      this.triggerEvent("tabtap", { key });
    }
  }
});
