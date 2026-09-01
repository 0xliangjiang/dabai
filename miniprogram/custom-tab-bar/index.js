const { getAppConfig } = require("../utils/api");

// 完整 tab 列表；运动入口始终展示，后台开关只控制运动账号服务。
const FULL_LIST = [
  { pagePath: "/pages/home/index", label: "优惠", icon: "/assets/tab/badge-percent.svg" },
  { pagePath: "/pages/deals/index", label: "线报", icon: "/assets/tab/newspaper.svg" },
  { pagePath: "/pages/orders/index", label: "订单", icon: "/assets/tab/receipt-text.svg" },
  { pagePath: "/pages/sports/index", label: "运动", icon: "/assets/tab/activity.svg" },
  { pagePath: "/pages/profile/index", label: "我的", icon: "/assets/tab/user-round.svg" }
];

function getCurrentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current ? `/${current.route}` : "";
}

function createTabState(ordersEnabled) {
  const route = getCurrentRoute();
  const visibleList = FULL_LIST.filter((item) => {
    if (!ordersEnabled && item.pagePath === "/pages/orders/index") return false;
    return true;
  });
  const selected = visibleList.findIndex((item) => item.pagePath === route);
  return {
    selected,
    list: visibleList.map((item, index) => ({
      ...item,
      activeClass: index === selected ? "active" : ""
    }))
  };
}

const INITIAL_STATE = createTabState(true);

Component({
  data: {
    hidden: false,
    selected: INITIAL_STATE.selected,
    list: INITIAL_STATE.list
  },

  lifetimes: {
    attached() {
      // 首次挂载主动拉取配置，保证订单开关和运动账号服务状态及时同步。
      this.applyConfig();
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
        const cfg = await getAppConfig();
        ordersEnabled = cfg.ordersTabEnabled !== false;
        sportsEnabled = cfg.sportsEnabled !== false;
      } catch (_e) {
        // 网络失败时沿用最近一次配置；首次启动默认展示。
      }
      app.globalData.ordersTabEnabled = ordersEnabled;
      app.globalData.sportsEnabled = sportsEnabled;
      this.setData(createTabState(ordersEnabled));
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    }
  }
});
