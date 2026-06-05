const app = getApp();

function getToken() {
  return wx.getStorageSync("token") || "local_user-1";
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
        authorization: `Bearer ${getToken()}`,
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

function loginWithMockCode() {
  return request("/api/auth/wechat-login", {
    method: "POST",
    data: { code: `mock-${Date.now()}` },
    header: { authorization: "" }
  }).then((data) => {
    wx.setStorageSync("token", data.token);
    return data;
  });
}

module.exports = {
  request,
  loginWithMockCode
};
