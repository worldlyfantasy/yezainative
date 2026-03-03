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
