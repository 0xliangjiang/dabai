const STORAGE_KEY = "liangjiang_toolbox_goals_v1";
const LIMIT = 100;
function validateTitle(value) {
  const title = String(value).trim();
  if (!title || title.length > 80) throw new Error("请输入 1–80 个字符的目标");
  return title;
}
function validateRecords(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items) || value.items.length > LIMIT) throw new Error("目标记录暂时无法读取，请重试；原记录未被覆盖");
  const ids = new Set();
  value.items.forEach(item => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 80 || typeof item.done !== "boolean" || !Number.isFinite(item.createdAt)) throw new Error("目标记录暂时无法读取，请重试；原记录未被覆盖");
    ids.add(item.id);
  });
  return value.items.map(item => ({ id: item.id, title: item.title, done: item.done, createdAt: item.createdAt }));
}
function readGoals() {
  let value;
  try { value = wx.getStorageSync(STORAGE_KEY); }
  catch (_) { throw new Error("无法读取本机目标记录，请重试"); }
  if (value === "" || value === undefined || value === null) return [];
  return validateRecords(value);
}
function writeGoals(items) {
  const clean = validateRecords({ version: 1, items });
  try { wx.setStorageSync(STORAGE_KEY, { version: 1, items: clean }); }
  catch (_) { throw new Error("保存失败，请检查设备存储空间后重试；此次修改未保存"); }
  return clean;
}
module.exports = { STORAGE_KEY, LIMIT, validateTitle, readGoals, writeGoals };
