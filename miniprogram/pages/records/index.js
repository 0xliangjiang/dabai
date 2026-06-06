const { request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  data: {
    records: [],
    showEmpty: true
  },

  async onShow() {
    syncTabBar(this);

    try {
      const data = await request("/api/conversions");
      const records = data.conversions.map((item) => ({
          ...item,
          status: "已生成",
          commissionPercent: `${Math.round((item.commissionRate || 0) * 100)}%`,
          createdAtText: item.createdAt ? item.createdAt.slice(0, 10) : "刚刚"
        }));
      this.setData({
        records,
        showEmpty: records.length === 0
      });
    } catch (_error) {
      this.setData({ records: [], showEmpty: true });
    }
  }
});
