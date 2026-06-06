const { request } = require("../../utils/api");

Page({
  data: {
    records: []
  },

  async onShow() {
    try {
      const data = await request("/api/conversions");
      this.setData({
        records: data.conversions.map((item) => ({
          ...item,
          status: "已生成",
          commissionPercent: `${Math.round((item.commissionRate || 0) * 100)}%`,
          createdAtText: item.createdAt ? item.createdAt.slice(0, 10) : "刚刚"
        }))
      });
    } catch (_error) {
      this.setData({ records: [] });
    }
  }
});
