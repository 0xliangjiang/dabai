const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");
const { readCache, writeCache } = require("../../utils/cache");
const { centsToPoints } = require("../../utils/points");
const { inviterSuffix, inviterQuery } = require("../../utils/share");

const ORDERS_CACHE_KEY = "orders_page_1_cache_v3";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS_TABS = [
  { id: "all", label: "全部" },
  { id: "paid", label: "已付款" },
  { id: "settled", label: "已结算" },
  { id: "refunded", label: "已退款" }
];

Page({
  onShareAppMessage() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      path: `/pages/home/index${inviterSuffix(getCurrentUser())}`
    };
  },

  onShareTimeline() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      query: inviterQuery(getCurrentUser())
    };
  },

  data: {
    statusTabs: STATUS_TABS,
    activeStatus: "all",
    activeStatusLabel: "全部",
    orders: [],
    loading: true,
    loadingMore: false,
    showEmpty: false,
    errorMsg: "",
    loadMoreError: "",
    cacheNotice: "",
    page: 1,
    hasMore: false,
    settledPoints: 0,
    pendingPoints: 0
  },

  async onShow() {
    syncTabBar(this);
    try {
      await ensureLogin();
    } catch (_e) {
      // 登录失败下方 fetchOrders 会再处理
    }
    await this.fetchOrders(true);
  },

  async onPullDownRefresh() {
    await this.fetchOrders(true);
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loadMoreError) {
      await this.fetchOrders(false);
    }
  },

  retryLoad() {
    this.fetchOrders(true);
  },

  retryLoadMore() {
    this.fetchOrders(false);
  },

  goClaim() {
    wx.navigateTo({ url: "/pages/claim/index" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/index" });
  },

  selectStatus(event) {
    const status = event.currentTarget.dataset.status;
    if (!status || status === this.data.activeStatus || this.data.loading) return;
    const tab = STATUS_TABS.find((item) => item.id === status);
    this.setData({
      activeStatus: status,
      activeStatusLabel: tab ? tab.label : "全部"
    });
    this.fetchOrders(true);
  },

  async fetchOrders(reset = true) {
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = (this.fetchRequestId || 0) + 1;
    this.fetchRequestId = requestId;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset
      ? { loading: true, errorMsg: "", loadMoreError: "" }
      : { loadingMore: true, loadMoreError: "" });
    try {
      await ensureLogin();
      const statusQuery = this.data.activeStatus === "all"
        ? ""
        : `&status=${encodeURIComponent(this.data.activeStatus)}`;
      const data = await request(`/api/orders/me?page=${page}&pageSize=50${statusQuery}`);
      if (requestId !== this.fetchRequestId) return;
      const incoming = data.orders.map((order) => decorateOrder(order));
      const orders = reset ? incoming : this.data.orders.concat(incoming);
      this.setData({
        orders,
        settledPoints: data.totals?.settledPoints || 0,
        pendingPoints: data.totals?.pendingPoints || 0,
        loading: false,
        loadingMore: false,
        showEmpty: orders.length === 0,
        errorMsg: "",
        loadMoreError: "",
        cacheNotice: "",
        page,
        hasMore: Boolean(data.hasMore)
      });
      if (reset && this.data.activeStatus === "all") {
        const user = getCurrentUser();
        writeCache(ORDERS_CACHE_KEY, {
          userId: user && user.id,
          orders,
          settledPoints: data.totals?.settledPoints || 0,
          pendingPoints: data.totals?.pendingPoints || 0,
          page,
          hasMore: Boolean(data.hasMore)
        });
      }
    } catch (_error) {
      if (requestId !== this.fetchRequestId) return;
      if (reset) {
        const cached = readCache(ORDERS_CACHE_KEY, CACHE_MAX_AGE_MS);
        const user = getCurrentUser();
        if (
          this.data.activeStatus === "all" &&
          cached &&
          user &&
          cached.userId === user.id &&
          cached.orders &&
          cached.orders.length > 0
        ) {
          this.setData({
            orders: cached.orders,
            settledPoints: cached.settledPoints || 0,
            pendingPoints: cached.pendingPoints || 0,
            showEmpty: false,
            loading: false,
            loadingMore: false,
            errorMsg: "",
            loadMoreError: "",
            cacheNotice: "当前展示最近一次成功加载的数据",
            page: cached.page || 1,
            hasMore: Boolean(cached.hasMore)
          });
          return;
        }
        this.setData({
          orders: [],
          showEmpty: false,
          loading: false,
          loadingMore: false,
          errorMsg: "订单加载失败，请检查网络后重试",
          loadMoreError: "",
          cacheNotice: ""
        });
      } else {
        this.setData({
          loadingMore: false,
          loadMoreError: "加载更多失败"
        });
      }
    }
  },

  // 刷新返利：后台已结算但这里仍显示待返利时，点一下重算台账（已结算→奖励值到账）
  async refreshRebate(event) {
    const { id, index } = event.currentTarget.dataset;
    if (this.data.orders[index] && this.data.orders[index].refreshing) return;
    this.setData({ [`orders[${index}].refreshing`]: true });
    try {
      const { order, totals } = await request(`/api/orders/me/${id}/recheck`, { method: "POST" });
      if (!order) {
        wx.showToast({ title: "未找到该订单", icon: "none" });
        return;
      }
      const before = this.data.orders[index] ? this.data.orders[index].rebateStatus : "pending";
      const decorated = decorateOrder(order);
      this.setData({
        [`orders[${index}]`]: decorated,
        settledPoints: totals?.settledPoints || 0,
        pendingPoints: totals?.pendingPoints || 0
      });
      if (decorated.rebateStatus === "available" && before !== "available") {
        wx.showToast({ title: `奖励值已到账 +${decorated.points}`, icon: "success" });
      } else if (decorated.rebateStatus === "available") {
        wx.showToast({ title: "返利已到账", icon: "success" });
      } else if (decorated.rebateStatus === "reversed") {
        wx.showToast({ title: "该订单已退款，无返利", icon: "none" });
      } else {
        wx.showToast({ title: "订单仍在结算中，确认收货后约 7-15 天到账", icon: "none" });
      }
    } catch (error) {
      wx.showToast({ title: (error && error.error) || "刷新失败，请重试", icon: "none" });
    } finally {
      if (this.data.orders[index]) this.setData({ [`orders[${index}].refreshing`]: false });
    }
  },

  copyOrderNumber(event) {
    const no = event.currentTarget.dataset.no;
    if (!no) return;
    wx.setClipboardData({ data: String(no) }); // 系统自带「已复制」提示
  },

});

function decorateOrder(order) {
  const points = centsToPoints(order.userRebateCents);
  const rebateStatus = order.rebateStatus || (order.status === "settled" ? "available" : "pending");
  return {
    ...order,
    points,
    rebateStatus,
    settled: rebateStatus === "available",
    canRefresh: rebateStatus === "pending",
    refreshing: false,
    rebateLabel: REBATE_LABEL[rebateStatus] || "预估",
    statusLabel: STATUS_LABEL[order.status] || "处理中",
    statusClass: STATUS_CLASS[order.status] || "orange",
    payTimeText: formatTime(order.payTime),
    payAmountText: ((order.payAmountCents || 0) / 100).toFixed(2)
  };
}

const REBATE_LABEL = {
  available: "已结算",
  pending: "待结算",
  reversed: "已退款",
  none: "待匹配"
};

const STATUS_LABEL = {
  paid: "已付款",
  received: "已收货",
  settled: "已结算",
  refunded: "已退款",
  invalid: "已失效"
};

const STATUS_CLASS = {
  paid: "orange",
  received: "blue",
  settled: "green",
  refunded: "gray",
  invalid: "gray"
};

function formatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
