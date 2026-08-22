const { request } = require("../utils/api");

// 完整 tab 列表；订单和运动入口可由后台全局开关控制
const FULL_LIST = [
  { pagePath: "/pages/home/index", label: "优惠", icon: "/assets/tab/badge-percent.svg", activeClass: "active" },
  { pagePath: "/pages/deals/index", label: "线报", icon: "/assets/tab/newspaper.svg", activeClass: "" },
  { pagePath: "/pages/orders/index", label: "订单", icon: "/assets/tab/receipt-text.svg", activeClass: "" },
  { pagePath: "/pages/sports/index", label: "运动", icon: "/assets/tab/activity.svg", activeClass: "" },
  { pagePath: "/pages/profile/index", label: "我的", icon: "/assets/tab/user-round.svg", activeClass: "" }
];

Component({
  data: {
    hidden: false,
    selected: 0,
    list: FULL_LIST
  },

  lifetimes: {
    attached() {
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.applyConfig();
    }
  },

  methods: {
    // 每次页面展示都刷新开关，使后台调整能在下次切页时生效。
    async applyConfig() {
      const app = getApp();
      let ordersEnabled = app.globalData.ordersTabEnabled !== false;
      let sportsEnabled = app.globalData.sportsEnabled !== false;
      try {
        const cfg = await request("/api/app-config");
        ordersEnabled = cfg.ordersTabEnabled !== false;
        sportsEnabled = cfg.sportsEnabled !== false;
      } catch (_e) {
        // 网络失败时沿用最近一次配置；首次启动默认展示。
      }
      app.globalData.ordersTabEnabled = ordersEnabled;
      app.globalData.sportsEnabled = sportsEnabled;
      const list = FULL_LIST.filter((item) => {
        if (!ordersEnabled && item.pagePath === "/pages/orders/index") return false;
        if (!sportsEnabled && item.pagePath === "/pages/sports/index") return false;
        return true;
      });
      this.setData({ list }, () => this.syncSelected());
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    },

    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (!current) return;

      const route = `/${current.route}`;
      const selected = this.data.list.findIndex((item) => item.pagePath === route);
      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({
          selected,
          list: this.data.list.map((item, index) => ({
            ...item,
            activeClass: index === selected ? "active" : ""
          }))
        });
      }
    }
  }
});
