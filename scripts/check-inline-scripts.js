#!/usr/bin/env node
const fs = require("fs");

const htmlPath = process.argv[2] || "index.html";
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const failures = [];

scripts.forEach((match, index) => {
  try {
    new Function(match[1]);
  } catch (error) {
    failures.push(`Inline script ${index + 1}: ${error.message}`);
  }
});

if (failures.length) {
  console.error(`Publish stopped: ${htmlPath} contains invalid JavaScript.`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`JavaScript check passed: ${scripts.length} inline scripts parsed successfully.`);
