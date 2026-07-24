const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1200;

const POSTER_TEMPLATES = [
  {
    id: "toolbox",
    name: "清新工具箱",
    description: "品牌绿与暖金，适合好友和家庭群",
    colors: ["#087451", "#F3B63F", "#F4F8F5"]
  },
  {
    id: "checklist",
    name: "省钱清单",
    description: "明快清晰，适合朋友圈",
    colors: ["#171D1A", "#DDF247", "#F7F8F2"]
  },
  {
    id: "recommend",
    name: "好友推荐",
    description: "沉稳醒目，突出好友推荐",
    colors: ["#18231F", "#24C58B", "#FF7A66"]
  }
];

function renderPoster(ctx, templateId, options) {
  ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  if (templateId === "checklist") {
    drawChecklist(ctx, options);
    return;
  }
  if (templateId === "recommend") {
    drawRecommend(ctx, options);
    return;
  }
  drawToolbox(ctx, options);
}

function drawToolbox(ctx, { nickname, qrImage }) {
  fill(ctx, "#F4F8F5", 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  fill(ctx, "#087451", 0, 0, POSTER_WIDTH, 430);
  fill(ctx, "#F3B63F", 54, 62, 112, 10);
  text(ctx, "捷径一生工具箱", 54, 120, 28, 700, "#FFFFFF");
  text(ctx, "买东西前", 54, 218, 70, 800, "#FFFFFF");
  text(ctx, "先查一查", 54, 302, 70, 800, "#FFFFFF");
  text(ctx, "粘贴商品口令或链接，优惠和奖励一目了然", 56, 366, 25, 400, "#D8F2E7");

  const labels = [
    ["01", "粘贴商品"],
    ["02", "查看优惠"],
    ["03", "复制下单"]
  ];
  labels.forEach((item, index) => {
    const x = 42 + index * 226;
    roundedRect(ctx, x, 392, 210, 154, 18, "#FFFFFF");
    text(ctx, item[0], x + 24, 435, 22, 800, "#087451");
    text(ctx, item[1], x + 24, 495, 29, 700, "#1F3028");
  });

  text(ctx, "查优惠 · 看线报 · 领奖励", 54, 642, 42, 800, "#17251E");
  text(ctx, `${shortName(nickname)} 推荐你试试这个省钱工具`, 54, 698, 27, 500, "#64736B");
  divider(ctx, 54, 750, 696, "#DCE7E1");
  text(ctx, "微信扫码进入小程序", 54, 850, 28, 700, "#17251E");
  text(ctx, "首次加入会自动记录好友邀请", 54, 894, 22, 400, "#75847C");
  drawQr(ctx, qrImage, 474, 792, 210, "#FFFFFF");
  text(ctx, "奖励以平台实际结算为准", 54, 1112, 20, 400, "#829088");
  text(ctx, "GOOD DEALS, LESS GUESSWORK", 54, 1150, 17, 700, "#087451");
}

function drawChecklist(ctx, { nickname, qrImage }) {
  fill(ctx, "#F7F8F2", 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  fill(ctx, "#DDF247", 0, 0, POSTER_WIDTH, 92);
  text(ctx, "买东西前的省钱清单", 42, 59, 27, 800, "#171D1A");
  text(ctx, "别急着", 46, 220, 82, 900, "#171D1A");
  text(ctx, "下 单", 46, 316, 82, 900, "#087451");
  fill(ctx, "#171D1A", 520, 146, 184, 184);
  text(ctx, "3", 612, 244, 94, 900, "#DDF247", "center");
  text(ctx, "步省钱", 612, 296, 25, 700, "#FFFFFF", "center");

  divider(ctx, 46, 382, 704, "#171D1A", 3);
  const steps = [
    ["1", "粘贴", "商品口令、链接或分享文案"],
    ["2", "查询", "查看预估优惠与奖励值"],
    ["3", "下单", "复制口令后正常选规格付款"]
  ];
  steps.forEach((item, index) => {
    const y = 452 + index * 132;
    roundedRect(ctx, 46, y - 40, 56, 56, 8, index === 1 ? "#087451" : "#171D1A");
    text(ctx, item[0], 74, y - 1, 25, 800, "#FFFFFF", "center");
    text(ctx, item[1], 130, y, 31, 800, "#171D1A");
    text(ctx, item[2], 130, y + 42, 22, 400, "#68746E");
  });

  roundedRect(ctx, 42, 830, 666, 282, 20, "#FFFFFF");
  text(ctx, `${shortName(nickname)} 的省钱邀请`, 72, 892, 28, 800, "#171D1A");
  text(ctx, "扫码打开，买东西前先比一步", 72, 936, 22, 400, "#657169");
  drawQr(ctx, qrImage, 485, 852, 190, "#F7F8F2");
  text(ctx, "奖励以平台实际结算为准", 46, 1162, 19, 400, "#7D8982");
}

function drawRecommend(ctx, { nickname, qrImage }) {
  fill(ctx, "#18231F", 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  fill(ctx, "#FF7A66", 0, 0, 18, POSTER_HEIGHT);
  text(ctx, "FRIEND'S PICK", 54, 88, 20, 800, "#FF7A66");
  text(ctx, `${shortName(nickname)} 推荐`, 54, 168, 42, 700, "#FFFFFF");
  text(ctx, "一个认真帮你", 54, 260, 61, 800, "#FFFFFF");
  text(ctx, "查优惠的工具", 54, 336, 61, 800, "#24C58B");

  roundedRect(ctx, 42, 398, 666, 286, 18, "#24342D");
  text(ctx, "01", 72, 458, 20, 800, "#FF7A66");
  text(ctx, "粘贴商品内容", 126, 458, 29, 700, "#FFFFFF");
  divider(ctx, 72, 492, 678, "#3D5148");
  text(ctx, "02", 72, 548, 20, 800, "#FF7A66");
  text(ctx, "查看预估优惠", 126, 548, 29, 700, "#FFFFFF");
  divider(ctx, 72, 582, 678, "#3D5148");
  text(ctx, "03", 72, 638, 20, 800, "#FF7A66");
  text(ctx, "复制口令去下单", 126, 638, 29, 700, "#FFFFFF");

  text(ctx, "扫码进入小程序", 54, 804, 31, 800, "#FFFFFF");
  text(ctx, "首次加入会自动记录好友邀请", 54, 850, 22, 400, "#9FB3AA");
  drawQr(ctx, qrImage, 474, 760, 210, "#FFFFFF");
  fill(ctx, "#24C58B", 54, 944, 226, 8);
  text(ctx, "查优惠  看线报  领奖励", 54, 1010, 29, 700, "#FFFFFF");
  text(ctx, "捷径一生工具箱", 54, 1080, 24, 600, "#9FB3AA");
  text(ctx, "奖励以平台实际结算为准", 54, 1132, 19, 400, "#71847B");
}

function drawQr(ctx, image, x, y, size, frameColor) {
  roundedRect(ctx, x - 16, y - 16, size + 32, size + 32, 16, frameColor);
  ctx.drawImage(image, x, y, size, size);
}

function shortName(value) {
  const name = String(value || "好友").trim();
  return name.length > 8 ? `${name.slice(0, 8)}…` : name;
}

function text(ctx, value, x, y, size, weight, color, align = "left") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function fill(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function divider(ctx, x1, y, x2, color, width = 1) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function roundedRect(ctx, x, y, width, height, radius, color) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

module.exports = {
  POSTER_HEIGHT,
  POSTER_TEMPLATES,
  POSTER_WIDTH,
  renderPoster
};
