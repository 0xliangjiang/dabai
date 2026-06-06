Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/home/index",
        label: "转链",
        mark: "转",
        activeClass: "active"
      },
      {
        pagePath: "/pages/records/index",
        label: "记录",
        mark: "记",
        activeClass: ""
      },
      {
        pagePath: "/pages/orders/index",
        label: "订单",
        mark: "单",
        activeClass: ""
      },
      {
        pagePath: "/pages/profile/index",
        label: "我的",
        mark: "我",
        activeClass: ""
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
    switchTab(event) {
      const index = event.currentTarget.dataset.index;
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
