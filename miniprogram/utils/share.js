// 二级分销：分享时把当前用户 id 作为邀请人带上，新用户进来即可绑定为下线。

function inviterId(user) {
  return user && user.id ? user.id : "";
}

// 给 onShareAppMessage 的 path 追加 ?inviter=xxx 或 &inviter=xxx
function inviterSuffix(user, hasQuery = false) {
  const id = inviterId(user);
  if (!id) return "";
  return `${hasQuery ? "&" : "?"}inviter=${id}`;
}

// 给 onShareTimeline 的 query 追加 inviter=xxx（query 不含 ?）
function inviterQuery(user, existing = "") {
  const id = inviterId(user);
  if (!id) return existing;
  return existing ? `${existing}&inviter=${id}` : `inviter=${id}`;
}

module.exports = { inviterSuffix, inviterQuery };
