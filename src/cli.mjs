#!/usr/bin/env node
// gj-submit —— 梗鲸（aigengtu.com）投稿 CLI：图片表情包 / 人设卡 / AI 聊天截图三线投稿 + 状态回查。
// 给人用（交互式输出）也给 AI agent 用（--json 机器可读）；`gj-submit mcp` 可作为 MCP server 接入。
// 规范全文：gj-submit guide（标注口径见 src/guide.mjs）。

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { DEFAULT_API, describeFailure, STATUS_LABELS, submitMeme, submitPersona, submitChat, checkStatus } from "./api.mjs";
import { GUIDE } from "./guide.mjs";
import {
  ValidateError, validateImageFile, validateMemeFields, validatePersonaFields, validateChatFields,
  validatePersonaFile, SUBMIT_STATUS_ID_RE, CHAT_MODELS, CHAT_SCENES,
} from "./validate.mjs";
import { makePreview } from "./preview.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const program = new Command();
program
  .name("gj-submit")
  .description("梗鲸 aigengtu.com 投稿 CLI（AI meme 表情包图库）——给人和 AI agent 用")
  .version(pkg.version)
  .option("--api <url>", "站点地址（默认 https://aigengtu.com，本地联调可换）", DEFAULT_API)
  .option("--json", "输出纯 JSON（给 AI/脚本读，替代人读文案）");

const opts = () => program.opts();
const out = (obj) => {
  if (opts().json) console.log(JSON.stringify(obj, null, 2));
  return obj;
};

function die(r) {
  out({ ok: false, ...r, message: describeFailure(r) });
  if (!opts().json) console.error("❌ " + describeFailure(r));
  process.exitCode = 1;
}

function done(r, kind) {
  const message = `✅ 投稿成功，编号 ${r.id}。收录与否由维护者人工终审；之后用 gj-submit status ${r.id} 回查结果。`;
  out({ ok: true, kind, id: r.id, dedup: r.dedup, message });
  if (!opts().json) console.log(message);
}

// 简易 frontmatter 解析（.md 人设卡自动预填 title/tags 等；CLI 显式参数优先）
function parseFrontmatter(text) {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length).replace(/^\s+/, "") };
}

program
  .command("image")
  .description("投稿图片表情包 → 终审通过入馆藏（原图 jpeg/png/gif/webp ≤10MB，台词≤60字）")
  .argument("<image>", "图片路径")
  .option("--quote <text>", "台词：图内印着文字就照抄，没文字才写一句梗点概括")
  .option("--nickname <text>", "作者署名（≤20 字）")
  .option("--note <text>", "出处说明：链接/平台/背景（≤300 字）")
  .action(async (image, cmd) => {
    try {
      validateMemeFields(cmd);
      const { ext } = await validateImageFile(image);
      const { preview } = await makePreview(image);
      const r = await submitMeme({ ...opts(), imagePath: image, quote: cmd.quote, nickname: cmd.nickname, note: cmd.note, preview, ext });
      if (!r.ok) return die(r);
      done(r, "meme");
    } catch (e) {
      if (e instanceof ValidateError) return die({ error: e.message });
      throw e;
    }
  });

program
  .command("persona")
  .description("投稿人设卡 → 终审通过上人设卡页社区区（.md 带 frontmatter 自动预填，或 --prompt 传正文）")
  .argument("[file]", "人设文件路径：.md（正文即 prompt）或 .zip（仅作附件，prompt 需另给）")
  .option("--prompt <text>", "人设提示词全文（UTF-8 500B–100KB；与 file 二选一）")
  .option("--title <text>", "人设名（≤40 字，必填）")
  .option("--description <text>", "一句话简介（≤80 字）")
  .option("--tags <text>", "标签，空格/逗号分隔，最多 4 个、每个 ≤12 字")
  .option("--author <text>", "署名（≤20 字）")
  .action(async (file, cmd) => {
    try {
      let prompt = cmd.prompt;
      let metaJson;
      let meta = {};
      if (file && file.toLowerCase().endsWith(".zip")) {
        await validatePersonaFile(file);
        if (!prompt) throw new ValidateError("zip 人设包只作附件上传，正文需另给 --prompt（或解包取 prompt.txt 后用 .md 投）");
      } else if (file) {
        await validatePersonaFile(file);
        const { meta: fm, body } = parseFrontmatter(readFileSync(file, "utf8"));
        meta = fm;
        if (!prompt) prompt = body;
        if (fm.persona) metaJson = String(fm.persona).slice(0, 8192); // 与前端一致：meta_json ≤8KB 可选
      } else if (!prompt) {
        throw new ValidateError("需给 [file]（.md/.zip）或 --prompt 其一");
      }
      const fields = {
        prompt,
        title: cmd.title || meta.title,
        description: cmd.description || meta.description,
        tags: cmd.tags || meta.tags,
        author: cmd.author || meta.author,
      };
      validatePersonaFields(fields);
      const r = await submitPersona({ ...opts(), filePath: file, ...fields, metaJson });
      if (!r.ok) return die(r);
      done(r, "persona");
    } catch (e) {
      if (e instanceof ValidateError) return die({ error: e.message });
      throw e;
    }
  });

program
  .command("chat")
  .description("投稿 AI 聊天截图 → 终审通过上「鲸言鲸语」（隐私红线：真人头像/昵称/群名必须先打码）")
  .argument("<image>", "截图路径（≤10MB）")
  .requiredOption("--title <text>", "一句话概括笑点（≤40 字）")
  .option("--model <m>", `AI 型号七选一：${CHAT_MODELS.join("/")}`)
  .option("--scene <s>", `场景五选一：${CHAT_SCENES.join("/")}`)
  .option("--author <text>", "署名（≤20 字）")
  .action(async (image, cmd) => {
    try {
      validateChatFields(cmd);
      const { ext } = await validateImageFile(image);
      const { preview, width, height } = await makePreview(image);
      const r = await submitChat({ ...opts(), imagePath: image, title: cmd.title, model: cmd.model, scene: cmd.scene, author: cmd.author, preview, ext, width, height });
      if (!r.ok) return die(r);
      done(r, "chat");
    } catch (e) {
      if (e instanceof ValidateError) return die({ error: e.message });
      throw e;
    }
  });

program
  .command("status")
  .description("回查投稿状态（id = 投稿成功返回的 sub_/psub_/csub_ 编号）")
  .argument("<id>", "投稿编号，如 sub_0123456789ab")
  .action(async (id) => {
    if (!SUBMIT_STATUS_ID_RE.test(id)) {
      return die({ error: `id 格式不对（需 sub_/psub_/csub_ + 12 位十六进制）：${id}` });
    }
    const r = await checkStatus({ ...opts(), id });
    if (!r.ok) return die(r);
    const label = STATUS_LABELS[r.status] || r.status;
    out({ ok: true, id: r.id, status: r.status, message: `${r.id}：${label}` });
    if (!opts().json) console.log(`${r.id} → ${r.status}（${label}）`);
  });

program
  .command("guide")
  .description("输出投稿标注规范全文（给 AI 读：收录口径 / 三线字段怎么填 / 隐私红线）")
  .action(() => {
    console.log(GUIDE);
  });

program
  .command("mcp")
  .description("启动 stdio MCP server（接入示例：claude mcp add gj-submit -- npx -y gj-submit mcp）")
  .action(async () => {
    // 动态加载：普通 CLI 用法不初始化 MCP 依赖；stdio 模式下严禁 stdout 杂音，各模块无 console 依赖
    const { runMcpServer } = await import("./mcp.mjs");
    await runMcpServer();
  });

program.parseAsync(process.argv);
