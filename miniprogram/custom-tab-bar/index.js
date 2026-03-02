const { resolveTopLevelRoute, goTopLevel, TOP_LEVEL_ROUTES } = require("../services/navigation");

Component({
  data: {
    selectedPath: TOP_LEVEL_ROUTES.home,
    list: [
      {
        pagePath: TOP_LEVEL_ROUTES.home,
        text: "首页"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.creators,
        text: "人物"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.destinations,
        text: "土地"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.ideas,
        text: "故事"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.profile,
        text: "我的"
      }
    ]
  },
  lifetimes: {
    attached() {
      this.syncSelected();
    }
  },
  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },
  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (!current) {
        return;
      }

      this.setData({
        selectedPath: resolveTopLevelRoute(current.route)
      });
    },
    onSwitchTab(event) {
      const pagePath = event.currentTarget.dataset.path;
      if (!pagePath || pagePath === this.data.selectedPath) {
        return;
      }

      goTopLevel(pagePath);
    }
  }
});
