const { ensureLogin, request } = require("../../utils/api");
const { centsToPoints } = require("../../utils/points");

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
    loadingMore: false,
    showEmpty: false,
    errorMsg: "",
    loadMoreError: "",
    page: 1,
    hasMore: false
  },

  onShow() {
    this.load(true);
  },

  async onPullDownRefresh() {
    await this.load(true);
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loadMoreError) return;
    await this.load(false);
  },

  async load(reset = true) {
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = (this.fetchRequestId || 0) + 1;
    this.fetchRequestId = requestId;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset
      ? { loading: true, errorMsg: "", loadMoreError: "" }
      : { loadingMore: true, loadMoreError: "" });
    try {
      await ensureLogin();
      const { withdrawals, availableBalance, availablePoints, hasMore } = await request(
        `/api/withdrawals/me?page=${page}&pageSize=20`
      );
      if (requestId !== this.fetchRequestId) return;
      const incoming = (withdrawals || []).map((w) => ({
        ...w,
        points: centsToPoints(w.amountCents),
        dateText: formatDateTime(w.createdAt),
        statusText: STATUS_TEXT[w.status] || w.status
      }));
      const list = reset ? incoming : this.data.list.concat(incoming);
      this.setData({
        list,
        availablePoints: availablePoints ?? centsToPoints(availableBalance),
        loading: false,
        loadingMore: false,
        showEmpty: list.length === 0,
        errorMsg: "",
        loadMoreError: "",
        page,
        hasMore: Boolean(hasMore)
      });
    } catch (_error) {
      if (requestId !== this.fetchRequestId) return;
      if (reset) {
        this.setData({
          loading: false,
          loadingMore: false,
          showEmpty: false,
          errorMsg: "兑换记录加载失败，请检查网络后重试",
          loadMoreError: ""
        });
      } else {
        this.setData({ loadingMore: false, loadMoreError: "加载更多失败" });
      }
    }
  },

  retryLoad() {
    this.load(true);
  },

  retryLoadMore() {
    this.load(false);
  }
});

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
