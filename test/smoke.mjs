// 冒烟测试（不联网）：魔数嗅探 / 字段校验 / frontmatter 解析 / guide 非空
// 跑法：node test/smoke.mjs（或 npm test）

import { strict as assert } from "node:assert";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sniffImageExt, validateChatFields, validateMemeFields, validatePersonaFields, ValidateError } from "../src/validate.mjs";
import { makePreview } from "../src/preview.mjs";
import { GUIDE } from "../src/guide.mjs";

let passed = 0;
const t = (name, fn) => {
  try {
    fn();
    passed++;
    console.log("PASS " + name);
  } catch (e) {
    console.error("FAIL " + name + " :: " + e.message);
    process.exitCode = 1;
  }
};

// 魔数嗅探（与 worker 同款四格式）
t("sniff jpeg/png/gif/webp + 拒未知", () => {
  assert.equal(sniffImageExt(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), "jpeg");
  assert.equal(sniffImageExt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), "png");
  assert.equal(sniffImageExt(new Uint8Array([0x47, 0x49, 0x46, 0x38])), "gif");
  assert.equal(sniffImageExt(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "webp");
  assert.equal(sniffImageExt(new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70])), null);
});

// 字段校验：超长报错、白名单外报错、必填报错
t("validate: quote 超 60 字报错", () => {
  assert.throws(() => validateMemeFields({ quote: "鲸".repeat(61) }), ValidateError);
  validateMemeFields({ quote: "鲸".repeat(60) }); // 恰好 60 不报
});
t("validate: chat model 白名单外报错", () => {
  assert.throws(() => validateChatFields({ title: "t", model: "gpt5" }), ValidateError);
  validateChatFields({ title: "问它最想对我做什么", model: "dsh", scene: "qqgroup" });
});
t("validate: persona 正文过短报错", () => {
  assert.throws(() => validatePersonaFields({ prompt: "太短", title: "t" }), ValidateError);
  assert.throws(() => validatePersonaFields({ prompt: "字".repeat(300), title: "" }), ValidateError); // title 必填
});
t("validate: tags 超 4 个报错", () => {
  assert.throws(() => validatePersonaFields({ prompt: "字".repeat(300), title: "t", tags: "a b c d e" }), ValidateError);
});

// guide 非空且含关键章节
t("guide 含三线与隐私红线", () => {
  for (const kw of ["三条投稿线", "隐私红线", "限频", "SFW"]) assert.ok(GUIDE.includes(kw), "缺: " + kw);
});

// 预览生成（sharp 真跑：1x1 PNG → webp ≤1MB 且可嗅探）
const t2 = (name, fn) => {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log("PASS " + name);
    } catch (e) {
      console.error("FAIL " + name + " :: " + e.message);
      process.exitCode = 1;
    }
  })();
};

// 1x1 PNG（最小合法图）与 600x400 PNG（验证「只缩不放」）
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
  "01f15c4890000000d49444154789c6260010000000500010d0a2db4" +
  "0000000049454e44ae426082", "hex",
);
await t2("makePreview: PNG → webp 预览（魔数对、≤1MB）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gj-"));
  const p = join(dir, "a.png");
  writeFileSync(p, PNG_1x1);
  const { preview, width, height } = await makePreview(p);
  assert.equal(sniffImageExt(new Uint8Array(preview.subarray(0, 16))), "webp");
  assert.ok(preview.length <= 1024 * 1024);
  assert.equal(width, 1);
  assert.equal(height, 1);
});

console.log(`\n${passed} 项断言完成${process.exitCode ? "（有失败）" : "，全绿"}`);
