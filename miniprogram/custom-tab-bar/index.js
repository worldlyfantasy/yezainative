const { resolveTopLevelRoute, goTopLevel, TOP_LEVEL_ROUTES } = require("../services/navigation");

Component({
  data: {
    selectedPath: TOP_LEVEL_ROUTES.home,
    list: [
      {
        pagePath: TOP_LEVEL_ROUTES.home,
        text: "首页",
        icon: "/images/panel/tab-home-inactive.svg",
        activeIcon: "/images/panel/tab-home-active.svg"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.creators,
        text: "人物",
        icon: "/images/panel/tab-creators-inactive.svg",
        activeIcon: "/images/panel/tab-creators-active.svg"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.journeys,
        text: "旅程",
        icon: "/images/panel/tab-destinations-inactive.svg",
        activeIcon: "/images/panel/tab-destinations-active.svg"
      },
      {
        pagePath: TOP_LEVEL_ROUTES.profile,
        text: "我的",
        icon: "/images/panel/tab-profile-inactive.svg",
        activeIcon: "/images/panel/tab-profile-active.svg"
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
