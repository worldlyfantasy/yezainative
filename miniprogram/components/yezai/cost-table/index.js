Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    title: {
      type: String,
      value: ""
    },
    content: {
      type: String,
      value: ""
    },
    rows: {
      type: Array,
      value: []
    },
    defaultExpanded: {
      type: Boolean,
      value: false
    }
  },
  data: {
    expanded: false
  },
  lifetimes: {
    attached() {
      this.setData({
        expanded: !!this.data.defaultExpanded
      });
    }
  },
  methods: {
    onToggle() {
      this.setData({
        expanded: !this.data.expanded
      });
    }
  }
});
