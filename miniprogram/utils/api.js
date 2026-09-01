const app = getApp();

function getToken() {
  return wx.getStorageSync("token") || "";
}

function getCurrentUser() {
  return wx.getStorageSync("user") || null;
}

function rawRequest(path, options = {}) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || "GET",
      timeout: options.timeout || 20000,
      data: options.data || {},
      header: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.header || {})
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject({
          statusCode: res.statusCode,
          ...(res.data || { error: "request failed" }),
          _authToken: token
        });
      },
      fail: reject
    });
  });
}

async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    // 登录态过期：清除本地凭证，静默重新登录后重试一次
    const isLoginCall = path === "/api/auth/wechat-login";
    if (error && error.statusCode === 401 && !isLoginCall && !options._retried) {
      // 并发请求中，较晚返回的旧 token 401 不应清掉刚登录得到的新 token。
      const currentToken = getToken();
      if (currentToken && error._authToken && currentToken !== error._authToken) {
        return request(path, { ...options, _retried: true });
      }
      logout();
      await loginWithWechat();
      return request(path, { ...options, _retried: true });
    }
    throw error;
  }
}

const APP_CONFIG_CACHE_MS = 1000;
let appConfigCache = null;
let appConfigCachedAt = 0;
let inflightAppConfig = null;

function getAppConfig() {
  const now = Date.now();
  if (appConfigCache && now - appConfigCachedAt < APP_CONFIG_CACHE_MS) {
    return Promise.resolve(appConfigCache);
  }
  if (inflightAppConfig) return inflightAppConfig;

  inflightAppConfig = request("/api/app-config")
    .then((config) => {
      appConfigCache = config;
      appConfigCachedAt = Date.now();
      return config;
    })
    .finally(() => {
      inflightAppConfig = null;
    });
  return inflightAppConfig;
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error("微信登录失败"));
      },
      fail: reject
    });
  });
}

let inflightLogin = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryLogin(error) {
  // wx.login / wx.request 网络失败没有 statusCode；微信 code 偶发失效返回 401；
  // 服务端临时不可用返回 5xx。参数错误等确定性问题不重试。
  return (
    !error ||
    !error.statusCode ||
    error.statusCode === 401 ||
    error.statusCode >= 500
  );
}

async function loginOnce() {
  const code = await wxLogin();
  // 二级分销：把暂存的邀请人带上（仅新用户首次注册会被后端绑定）
  let inviterId = (app.globalData && app.globalData.pendingInviter) || "";
  try {
    inviterId = wx.getStorageSync("pending_inviter") || inviterId;
  } catch (_error) {
    // 使用 App 在朋友圈入口保留的邀请参数。
  }
  return request("/api/auth/wechat-login", {
    method: "POST",
    data: inviterId ? { code, inviterId } : { code },
    header: { authorization: "" }
  });
}

async function doLogin() {
  const retryDelays = [0, 400, 1000];
  let lastError = null;
  let data = null;

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) await wait(retryDelays[attempt]);
    try {
      // 微信 code 只能使用一次，每次重试都必须重新调用 wx.login。
      data = await loginOnce();
      break;
    } catch (error) {
      lastError = error;
      if (!shouldRetryLogin(error) || attempt === retryDelays.length - 1) throw error;
      console.warn(`微信登录第 ${attempt + 1} 次失败，准备重试`, error && error.errMsg ? error.errMsg : error && error.statusCode);
    }
  }

  if (!data) throw lastError || new Error("微信登录失败");
  wx.setStorageSync("token", data.token);
  wx.setStorageSync("user", data.user);
  // 用过即清，避免后续登录重复携带
  try {
    wx.removeStorageSync("pending_inviter");
  } catch (_e) {
    // ignore
  }
  if (app.globalData) app.globalData.pendingInviter = "";
  return data;
}

// 去抖：多个页面/请求同时 401 时只发起一次登录，其余复用同一次结果
function loginWithWechat() {
  if (inflightLogin) return inflightLogin;
  inflightLogin = doLogin().finally(() => {
    inflightLogin = null;
  });
  return inflightLogin;
}

async function ensureLogin() {
  if (getToken()) {
    return { token: getToken(), user: getCurrentUser() };
  }
  if (app.globalData && app.globalData.singlePageMode) {
    throw { code: "TIMELINE_SINGLE_PAGE", error: "请进入完整小程序后登录" };
  }
  return loginWithWechat();
}

function isTimelineSinglePage() {
  return Boolean(app.globalData && app.globalData.singlePageMode);
}

function rawUploadFile(path, filePath) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${app.globalData.apiBaseUrl}${path}`,
      filePath,
      name: "file",
      timeout: 60000,
      header: token ? { authorization: `Bearer ${token}` } : {},
      success(res) {
        let data = {};
        try {
          data = JSON.parse(res.data || "{}");
        } catch (_error) {
          // 非 JSON 响应
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        reject({ statusCode: res.statusCode, ...data });
      },
      fail: reject
    });
  });
}

async function uploadFile(path, filePath, _retried = false) {
  try {
    return await rawUploadFile(path, filePath);
  } catch (error) {
    // 登录态过期：与 request 一致，静默重新登录后重试一次
    if (error && error.statusCode === 401 && !_retried) {
      logout();
      await loginWithWechat();
      return uploadFile(path, filePath, true);
    }
    throw error;
  }
}

function rawDownloadFile(path) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${app.globalData.apiBaseUrl}${path}`,
      timeout: 30000,
      header: token ? { authorization: `Bearer ${token}` } : {},
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject({ statusCode: res.statusCode, error: "download failed", _authToken: token });
      },
      fail: reject
    });
  });
}

async function downloadFile(path, _retried = false) {
  try {
    return await rawDownloadFile(path);
  } catch (error) {
    if (error && error.statusCode === 401 && !_retried) {
      const currentToken = getToken();
      if (!currentToken || !error._authToken || currentToken === error._authToken) {
        logout();
        await loginWithWechat();
      }
      return downloadFile(path, true);
    }
    throw error;
  }
}

function logout() {
  wx.removeStorageSync("token");
  wx.removeStorageSync("user");
  wx.removeStorageSync("orders_page_1_cache");
  wx.removeStorageSync("orders_page_1_cache_v2");
  wx.removeStorageSync("orders_page_1_cache_v3");
}

module.exports = {
  request,
  getAppConfig,
  uploadFile,
  downloadFile,
  ensureLogin,
  getToken,
  getCurrentUser,
  isTimelineSinglePage,
  loginWithWechat,
  logout
};
