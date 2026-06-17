const { ensureLogin, request } = require("../../utils/api");

const STATUS_TEXT = {
  pending: "审核中",
  paid: "已发放",
  rejected: "已驳回"
};

Page({
  data: {
    list: [],
    availablePoints: 0,
    loading: true,
    showEmpty: false
  },

  onShow() {
    this.load();
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    try {
      await ensureLogin();
      const { withdrawals, availableBalance } = await request("/api/withdrawals/me");
      const list = (withdrawals || []).map((w) => ({
        ...w,
        points: w.amountCents,
        dateText: formatDateTime(w.createdAt),
        statusText: STATUS_TEXT[w.status] || w.status
      }));
      this.setData({
        list,
        availablePoints: availableBalance || 0,
        loading: false,
        showEmpty: list.length === 0
      });
    } catch (_error) {
      this.setData({ loading: false, showEmpty: this.data.list.length === 0 });
      wx.showToast({ title: "加载失败，下拉重试", icon: "none" });
    }
  }
});

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
