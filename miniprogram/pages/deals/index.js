const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");
const { inviterSuffix, inviterQuery } = require("../../utils/share");
const { subscribeDeals } = require("../../utils/subscribe");
const { readCache, writeCache } = require("../../utils/cache");

const DEALS_CACHE_KEY = "deals_page_1_cache";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

Page({
  onShareAppMessage(res) {
    const me = getCurrentUser();
    // 卡片上的「分享」按钮触发：分享对应的那条线报
    if (res && res.from === "button" && res.target) {
      const { id, title, kind } = res.target.dataset;
      if (id) {
        if (kind === "article") {
          return {
            title: title || "实用教程",
            path: `/pages/article-detail/index?id=${id}${inviterSuffix(me, true)}`
          };
        }
        return {
          title: title || "优惠线报",
          path: `/pages/deal-detail/index?id=${id}${inviterSuffix(me, true)}`
        };
      }
    }
    return {
      title: "最新优惠线报，按步骤照着做就行",
      path: `/pages/deals/index${inviterSuffix(me)}`
    };
  },

  onShareTimeline() {
    return {
      title: this.data.activeContent === "articles" ? "实用教程，一看就会" : "最新优惠线报，按步骤照着做就行",
      query: inviterQuery(getCurrentUser())
    };
  },

  noop() {},

  data: {
    activeContent: "deals",
    deals: [],
    loading: true,
    loadingMore: false,
    showEmpty: false,
    errorMsg: "",
    loadMoreError: "",
    cacheNotice: "",
    page: 1,
    hasMore: false,
    subscribeTemplateId: "",
    subscribeRemaining: 0,
    articles: [],
    articleLoading: false,
    articleLoadingMore: false,
    articleShowEmpty: false,
    articleErrorMsg: "",
    articleLoadMoreError: "",
    articlePage: 1,
    articleHasMore: false,
    articlesLoaded: false
  },

  async onShow() {
    syncTabBar(this);
    await this.fetchDeals(true);
    this.refreshSubscription();
  },

  async refreshSubscription() {
    try {
      await ensureLogin();
      const { templateId, remaining } = await request("/api/subscriptions/me");
      this.setData({ subscribeTemplateId: templateId, subscribeRemaining: remaining });
    } catch (_error) {
      // 静默失败
    }
  },

  async subscribe() {
    const { ok, remaining } = await subscribeDeals();
    if (ok) this.setData({ subscribeRemaining: remaining });
  },

  async onPullDownRefresh() {
    if (this.data.activeContent === "articles") {
      await this.fetchArticles(true);
    } else {
      await this.fetchDeals(true);
    }
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (this.data.activeContent === "articles") {
      if (this.data.articleHasMore && !this.data.articleLoadingMore && !this.data.articleLoadMoreError) {
        await this.fetchArticles(false);
      }
      return;
    }
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loadMoreError) {
      await this.fetchDeals(false);
    }
  },

  retryLoad() {
    this.fetchDeals(true);
  },

  retryLoadMore() {
    this.fetchDeals(false);
  },

  switchContent(event) {
    const activeContent = event.currentTarget.dataset.mode;
    if (activeContent === this.data.activeContent) return;
    this.setData({ activeContent });
    if (activeContent === "articles" && !this.data.articlesLoaded) {
      this.fetchArticles(true);
    }
  },

  retryArticles() {
    this.fetchArticles(true);
  },

  retryArticleLoadMore() {
    this.fetchArticles(false);
  },

  async fetchArticles(reset = true) {
    if (!reset && (this.data.articleLoadingMore || !this.data.articleHasMore)) return;
    const requestId = (this.articleRequestId || 0) + 1;
    this.articleRequestId = requestId;
    const page = reset ? 1 : this.data.articlePage + 1;
    this.setData(reset
      ? { articleLoading: true, articleErrorMsg: "", articleLoadMoreError: "" }
      : { articleLoadingMore: true, articleLoadMoreError: "" });
    try {
      const data = await request(`/api/articles?page=${page}&pageSize=20`);
      if (requestId !== this.articleRequestId) return;
      const incoming = data.articles.map((article) => ({
        ...article,
        coverUrl: toDisplayUrl(article.coverUrl),
        dateText: formatDate(article.publishedAt)
      }));
      const articles = reset ? incoming : this.data.articles.concat(incoming);
      this.setData({
        articles,
        articleLoading: false,
        articleLoadingMore: false,
        articleShowEmpty: articles.length === 0,
        articleErrorMsg: "",
        articleLoadMoreError: "",
        articlePage: page,
        articleHasMore: Boolean(data.hasMore),
        articlesLoaded: true
      });
    } catch (_error) {
      if (requestId !== this.articleRequestId) return;
      this.setData(reset
        ? {
            articles: [],
            articleLoading: false,
            articleLoadingMore: false,
            articleShowEmpty: false,
            articleErrorMsg: "教程加载失败，请检查网络后重试",
            articleLoadMoreError: "",
            articlesLoaded: false
          }
        : { articleLoadingMore: false, articleLoadMoreError: "加载更多失败" });
    }
  },

  async fetchDeals(reset = true) {
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = (this.fetchRequestId || 0) + 1;
    this.fetchRequestId = requestId;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset
      ? { loading: true, errorMsg: "", loadMoreError: "" }
      : { loadingMore: true, loadMoreError: "" });
    try {
      ensureLogin().catch(() => {});
      const data = await request(`/api/deals?page=${page}&pageSize=20`);
      if (requestId !== this.fetchRequestId) return;
      const incoming = data.deals.map((deal) => ({
        ...deal,
        dateText: formatDate(deal.publishedAt)
      }));
      const deals = reset ? incoming : this.data.deals.concat(incoming);
      this.setData({
        deals,
        loading: false,
        loadingMore: false,
        showEmpty: deals.length === 0,
        errorMsg: "",
        loadMoreError: "",
        cacheNotice: "",
        page,
        hasMore: Boolean(data.hasMore)
      });
      if (reset) {
        writeCache(DEALS_CACHE_KEY, {
          deals,
          page,
          hasMore: Boolean(data.hasMore)
        });
      }
    } catch (_error) {
      if (requestId !== this.fetchRequestId) return;
      if (reset) {
        const cached = readCache(DEALS_CACHE_KEY, CACHE_MAX_AGE_MS);
        if (cached && cached.deals && cached.deals.length > 0) {
          this.setData({
            deals: cached.deals,
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
          deals: [],
          showEmpty: false,
          loading: false,
          loadingMore: false,
          errorMsg: "线报加载失败，请检查网络后重试",
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

  openDeal(event) {
    wx.navigateTo({ url: `/pages/deal-detail/index?id=${event.currentTarget.dataset.id}` });
  },

  openArticle(event) {
    wx.navigateTo({ url: `/pages/article-detail/index?id=${event.currentTarget.dataset.id}` });
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}
