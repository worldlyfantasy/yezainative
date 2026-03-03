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
    }
  },
  data: {
    expanded: false
  },
  methods: {
    onToggle() {
      this.setData({
        expanded: !this.data.expanded
      });
    }
  }
});
