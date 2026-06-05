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
          status: "已生成"
        }))
      });
    } catch (_error) {
      this.setData({ records: [] });
    }
  }
});
