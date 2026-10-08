const app = getApp();
const TOKEN_KEY = "sports_session";
let inflightLogin = null;
function raw(path, options = {}) {
  return new Promise((resolve, reject) => wx.request({
    url: `${app.globalData.apiBaseUrl}${path}`, method: options.method || "GET",
    timeout: options.timeout || 20000, data: options.data || {},
    header: { "content-type": "application/json", ...(options.anonymous ? {} : { authorization: `Bearer ${wx.getStorageSync(TOKEN_KEY) || ""}` }) },
    success(res) {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
      else reject({ ...(res.data || {}), statusCode: res.statusCode });
    }, fail: reject
  }));
}
function wxCode() {
  return new Promise((resolve, reject) => wx.login({
    success(res) { res.code ? resolve(res.code) : reject({ error: "微信登录失败，请重试" }); }, fail: reject
  }));
}
async function login(bindingCode) {
  const ticket = bindingCode ? "" : app.globalData.pendingTicket;
  let result;
  try {
    result = await raw("/api/sports-app/login", { anonymous: true, method: "POST", data: { code: await wxCode(), ...(ticket ? { ticket } : {}), ...(bindingCode ? { bindingCode } : {}) } });
  } catch (error) {
    if (!ticket || error.statusCode !== 410) throw error;
    // 首次兑换成功但网络丢失响应时，用已建立的身份关联恢复登录。
    result = await raw("/api/sports-app/login", { anonymous: true, method: "POST", data: { code: await wxCode() } });
  }
  wx.setStorageSync(TOKEN_KEY, result.token);
  if (bindingCode || app.globalData.pendingTicket === ticket) app.globalData.pendingTicket = "";
  return result;
}
function ensureLogin() {
  if (inflightLogin) return inflightLogin;
  if (!app.globalData.pendingTicket && wx.getStorageSync(TOKEN_KEY)) return Promise.resolve();
  if (!inflightLogin) inflightLogin = login().finally(() => { inflightLogin = null; });
  return inflightLogin;
}
function linkAccount(bindingCode) {
  if (inflightLogin) return Promise.reject({ error: "正在登录，请稍后重试" });
  inflightLogin = login(bindingCode).finally(() => { inflightLogin = null; });
  return inflightLogin;
}
async function request(path, options = {}) {
  await ensureLogin();
  try { return await raw(path, options); }
  catch (error) {
    if (error.statusCode !== 401 || options.retried) throw error;
    wx.removeStorageSync(TOKEN_KEY);
    await ensureLogin();
    return request(path, { ...options, retried: true });
  }
}
module.exports = { request, ensureLogin, linkAccount, getConfig: async () => {
  try { return await raw("/api/sports-app/config", { anonymous: true }); }
  catch (error) {
    if (error.statusCode === 401 || error.statusCode === 404) throw { error: "运动服务尚未开放，请稍后再来" };
    throw error;
  }
} };
