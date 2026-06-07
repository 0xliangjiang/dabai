const app = getApp();

function getToken() {
  return wx.getStorageSync("token") || "";
}

function getCurrentUser() {
  return wx.getStorageSync("user") || null;
}

function request(path, options = {}) {
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
        reject(res.data || { error: "request failed" });
      },
      fail: reject
    });
  });
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

async function loginWithWechat() {
  const code = await wxLogin();
  const data = await request("/api/auth/wechat-login", {
    method: "POST",
    data: { code },
    header: { authorization: "" }
  });
  wx.setStorageSync("token", data.token);
  wx.setStorageSync("user", data.user);
  return data;
}

async function ensureLogin() {
  if (getToken()) {
    return { token: getToken(), user: getCurrentUser() };
  }
  return loginWithWechat();
}

function logout() {
  wx.removeStorageSync("token");
  wx.removeStorageSync("user");
}

module.exports = {
  request,
  ensureLogin,
  getCurrentUser,
  loginWithWechat,
  logout
};
