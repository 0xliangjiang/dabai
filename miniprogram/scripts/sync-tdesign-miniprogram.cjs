const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "node_modules", "tdesign-miniprogram", "miniprogram_dist");
const target = path.join(root, "miniprogram_npm", "tdesign-miniprogram");

if (!fs.existsSync(source)) {
  console.error(`Missing TDesign package source: ${source}`);
  console.error("Run: npm install --prefix miniprogram");
  process.exit(1);
}

fs.rmSync(target, { force: true, recursive: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });

console.log(`Synced TDesign MiniProgram components to ${target}`);
