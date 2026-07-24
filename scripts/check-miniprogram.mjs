import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("miniprogram");
const files = walk(root);
const jsFiles = files.filter((file) => file.endsWith(".js"));
const jsonFiles = files.filter((file) => file.endsWith(".json"));
const wxssFiles = files.filter((file) => file.endsWith(".wxss"));

for (const file of jsFiles) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

for (const file of jsonFiles) {
  JSON.parse(readFileSync(file, "utf8"));
}

for (const file of wxssFiles) {
  const source = readFileSync(file, "utf8");
  const opens = (source.match(/{/g) || []).length;
  const closes = (source.match(/}/g) || []).length;
  if (opens !== closes) throw new Error(`${file} has unbalanced CSS blocks`);
}

const projectConfig = JSON.parse(readFileSync(path.join(root, "project.config.json"), "utf8"));
if (!projectConfig.libVersion || projectConfig.libVersion === "latest") {
  throw new Error("miniprogram/project.config.json must pin a tested libVersion");
}

console.log(
  `Mini program checks passed: ${jsFiles.length} JS files, ${jsonFiles.length} JSON files, ${wxssFiles.length} WXSS files.`
);

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}
