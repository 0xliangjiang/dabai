const UNIT_GROUPS = [
  { name: "长度", units: [
    { name: "米 m", symbol: "m", factor: 1 }, { name: "厘米 cm", symbol: "cm", factor: 0.01 },
    { name: "毫米 mm", symbol: "mm", factor: 0.001 }, { name: "千米 km", symbol: "km", factor: 1000 },
    { name: "英寸 in", symbol: "in", factor: 0.0254 }, { name: "英尺 ft", symbol: "ft", factor: 0.3048 }
  ] },
  { name: "质量", units: [
    { name: "千克 kg", symbol: "kg", factor: 1 }, { name: "克 g", symbol: "g", factor: 0.001 },
    { name: "毫克 mg", symbol: "mg", factor: 0.000001 },
    { name: "磅 lb", symbol: "lb", factor: 0.45359237 }, { name: "盎司 oz", symbol: "oz", factor: 0.028349523125 }
  ] }
];
function convert(value, groupIndex, fromIndex, toIndex) {
  const raw = String(value).trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) throw new Error("请输入非负数字，例如 12.5");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount > 1e12) throw new Error("请输入不超过 1 万亿的数值");
  const group = UNIT_GROUPS[groupIndex];
  const from = group && group.units[fromIndex]; const to = group && group.units[toIndex];
  if (!from || !to) throw new Error("请重新选择换算单位");
  const result = amount * from.factor / to.factor;
  return { input: String(amount), output: String(Number(result.toPrecision(12))), from: from.symbol, to: to.symbol };
}
const DAY = 86400000;
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效日期");
  const parts = value.split("-").map(Number);
  if (parts[0] < 1900 || parts[0] > 2100) throw new Error("日期范围为 1900–2100 年");
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) throw new Error("请选择有效日期");
  return date.getTime();
}
function dateDifference(start, end) { return (parseDate(end) - parseDate(start)) / DAY; }
function addDays(start, value) {
  const raw = String(value).trim();
  if (!/^-?\d+$/.test(raw) || Math.abs(Number(raw)) > 36500) throw new Error("请输入 −36,500 至 36,500 之间的整数天数");
  const date = new Date(parseDate(start) + Number(raw) * DAY);
  const result = date.toISOString().slice(0, 10);
  parseDate(result);
  return result;
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
module.exports = { UNIT_GROUPS, convert, dateDifference, addDays, today };
