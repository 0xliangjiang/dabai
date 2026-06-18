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
        reject({ statusCode: res.statusCode, ...(res.data || { error: "request failed" }) });
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
      logout();
      await loginWithWechat();
      return request(path, { ...options, _retried: true });
    }
    throw error;
  }
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

async function doLogin() {
  const code = await wxLogin();
  // 二级分销：把暂存的邀请人带上（仅新用户首次注册会被后端绑定）
  const inviterId = wx.getStorageSync("pending_inviter") || "";
  const data = await request("/api/auth/wechat-login", {
    method: "POST",
    data: inviterId ? { code, inviterId } : { code },
    header: { authorization: "" }
  });
  wx.setStorageSync("token", data.token);
  wx.setStorageSync("user", data.user);
  // 用过即清，避免后续登录重复携带
  try {
    wx.removeStorageSync("pending_inviter");
  } catch (_e) {
    // ignore
  }
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
  return loginWithWechat();
}

function rawUploadFile(path, filePath) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${app.globalData.apiBaseUrl}${path}`,
      filePath,
      name: "file",
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

function logout() {
  wx.removeStorageSync("token");
  wx.removeStorageSync("user");
}

module.exports = {
  request,
  uploadFile,
  ensureLogin,
  getToken,
  getCurrentUser,
  loginWithWechat,
  logout
};
