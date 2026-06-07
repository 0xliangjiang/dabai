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
          platformLabel: platformLabel(item.platform),
          estimatedRebate: ((item.estimatedRebateCents || 0) / 100).toFixed(2),
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

function platformLabel(platform) {
  return {
    taobao: "淘宝",
    jd: "京东",
    pdd: "拼多多",
    vip: "唯品会"
  }[platform] || "商品";
}
