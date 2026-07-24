const { request } = require("../utils/api");

// 完整 tab 列表；订单 tab 可在审核期间由后台开关隐藏
const FULL_LIST = [
  { pagePath: "/pages/home/index", label: "优惠", icon: "/assets/tab/badge-percent.svg", activeClass: "active" },
  { pagePath: "/pages/deals/index", label: "线报", icon: "/assets/tab/newspaper.svg", activeClass: "" },
  { pagePath: "/pages/orders/index", label: "订单", icon: "/assets/tab/receipt-text.svg", activeClass: "" },
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
      this.applyConfig();
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },

  methods: {
    // 拉取功能开关（每次启动缓存一份），订单 tab 关闭时从列表中剔除（审核期间隐藏）
    async applyConfig() {
      const app = getApp();
      let enabled = app.globalData.ordersTabEnabled;
      if (enabled === undefined) {
        try {
          const cfg = await request("/api/app-config");
          enabled = cfg.ordersTabEnabled !== false; // 默认展示
        } catch (_e) {
          enabled = true;
        }
        app.globalData.ordersTabEnabled = enabled;
      }
      const list = enabled
        ? FULL_LIST
        : FULL_LIST.filter((item) => item.pagePath !== "/pages/orders/index");
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
