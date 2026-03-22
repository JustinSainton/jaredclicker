const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TARGET_DIRS = ["app", "components"].map((dir) => path.join(ROOT, dir));
const FILE_EXTENSIONS = new Set([".js", ".jsx"]);
const IGNORE_FILES = new Set([
  path.join(ROOT, "lib", "i18n.js"),
]);

const MATCHERS = [
  {
    name: "Alert.alert literal",
    regex: /Alert\.alert\(\s*["'`][^"'`]+["'`]/g,
  },
  {
    name: "placeholder literal",
    regex: /placeholder=\s*["'`][^"'`]+["'`]/g,
  },
  {
    name: "Text literal",
    regex: /<Text(?:\s+[^>]*)?>\s*[A-Za-z][^<{]*\s*<\/Text>/g,
  },
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (IGNORE_FILES.has(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function formatPath(filePath) {
  return path.relative(ROOT, filePath);
}

let findings = 0;

for (const dir of TARGET_DIRS) {
  if (!fs.existsSync(dir)) continue;

  for (const filePath of walk(dir)) {
    const source = fs.readFileSync(filePath, "utf8");

    for (const matcher of MATCHERS) {
      for (const match of source.matchAll(matcher.regex)) {
        findings += 1;
        const line = getLineNumber(source, match.index || 0);
        const snippet = match[0].trim().replace(/\s+/g, " ");
        console.log(`${formatPath(filePath)}:${line} [${matcher.name}] ${snippet}`);
      }
    }
  }
}

if (findings === 0) {
  console.log("No hardcoded copy candidates found.");
}
