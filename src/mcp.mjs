// stdio MCP server：把三线投稿 + 状态回查 + 标注规范暴露为 5 个 MCP 工具。
// 供 Claude Code / Cursor / 任意 MCP 客户端接入：claude mcp add gj-submit -- npx -y gj-submit mcp
// 注意：stdio 传输下 stdout 是协议流，本模块严禁 console.log（错误走 stderr / 工具返回）。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { submitMeme, submitPersona, submitChat, checkStatus, describeFailure, STATUS_LABELS } from "./api.mjs";
import { GUIDE } from "./guide.mjs";
import {
  ValidateError, validateImageFile, validateMemeFields, validatePersonaFields, validateChatFields,
  validatePersonaFile, SUBMIT_STATUS_ID_RE, CHAT_MODELS, CHAT_SCENES,
} from "./validate.mjs";
import { makePreview } from "./preview.mjs";

// 工具返回统一 { content: [{type:"text", text}] }；result.ok 决定 isError
function reply(ok, text) {
  return { content: [{ type: "text", text }], isError: !ok };
}

async function tryRun(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidateError) return reply(false, `❌ 参数校验失败：${e.message}`);
    console.error("[gj-submit]", e); // stderr，不污染 stdio 协议流
    return reply(false, `❌ 执行失败：${e.message}`);
  }
}

export async function runMcpServer() {
  const server = new McpServer({ name: "gj-submit", version: "0.1.0" });

  server.registerTool("submission_guidelines", {
    title: "Submission guidelines",
    description:
      "Full submission guidelines for the GengJing AI meme gallery (aigengtu.com): what is accepted, " +
      "how to annotate memes / persona cards / AI chat screenshots, privacy rules and rate limits. " +
      "ALWAYS call this before submitting anything for the first time.",
    inputSchema: {},
  }, async () => reply(true, GUIDE));

  server.registerTool("submit_meme", {
    title: "Submit a meme image",
    description:
      "Submit a meme image to the GengJing AI meme gallery (aigengtu.com). Image file (jpeg/png/gif/webp, <=10MB). " +
      "quote: transcribe text printed in the image if any, else a short punchline (<=60 chars). " +
      "nickname: artist credit (<=20). note: source/attribution (<=300). Moderated by a human; check later via check_status.",
    inputSchema: {
      image_path: z.string().describe("Absolute or relative path to the meme image file"),
      quote: z.string().optional().describe("Text printed in the image (transcribe verbatim), or a short punchline. <=60 chars"),
      nickname: z.string().optional().describe("Artist name for credit, <=20 chars"),
      note: z.string().optional().describe("Source/attribution note (link, platform, context), <=300 chars"),
    },
  }, async ({ image_path, quote, nickname, note }) => tryRun(async () => {
    validateMemeFields({ quote, nickname, note });
    const { ext } = await validateImageFile(image_path);
    const { preview } = await makePreview(image_path);
    const r = await submitMeme({ imagePath: image_path, quote, nickname, note, preview, ext });
    if (!r.ok) return reply(false, describeFailure(r));
    return reply(true, `投稿成功，编号 ${r.id}（收录由维护者人工终审，稍后用 check_status 查询）`);
  }));

  server.registerTool("submit_persona", {
    title: "Submit a persona card",
    description:
      "Submit a character persona card (prompt text) to the GengJing persona gallery. Provide prompt text directly, " +
      "or a .md file (YAML frontmatter auto-fills title/tags) or a .zip persona pack (prompt must still be given via prompt). " +
      "prompt: full persona prompt, 500B-100KB UTF-8. title required (<=40). tags: max 4, each <=12 chars.",
    inputSchema: {
      prompt: z.string().optional().describe("Full persona prompt text (500B-100KB UTF-8)"),
      file_path: z.string().optional().describe("Optional .md (body becomes prompt) or .zip persona pack file path"),
      title: z.string().describe("Persona name, required, <=40 chars"),
      description: z.string().optional().describe("One-line summary, <=80 chars"),
      tags: z.string().optional().describe("Space/comma separated tags, max 4, each <=12 chars"),
      author: z.string().optional().describe("Credit, <=20 chars"),
    },
  }, async ({ prompt, file_path, title, description, tags, author }) => tryRun(async () => {
    let finalPrompt = prompt;
    let meta;
    if (file_path) {
      await validatePersonaFile(file_path);
      if (file_path.toLowerCase().endsWith(".md")) {
        const { readFileSync } = await import("node:fs");
        const raw = readFileSync(file_path, "utf8");
        const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
        meta = {};
        if (m) {
          for (const line of m[1].split(/\r?\n/)) {
            const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
            if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
          }
        }
        if (!finalPrompt) finalPrompt = m ? raw.slice(m[0].length).replace(/^\s+/, "") : raw;
      } else if (!finalPrompt) {
        throw new ValidateError("zip 人设包只作附件上传，正文需另给 prompt（或解包取 prompt.txt 后用 .md 投）");
      }
    } else if (!finalPrompt) {
      throw new ValidateError("需给 prompt 或 file_path 其一");
    }
    const fields = {
      prompt: finalPrompt,
      title: title || meta?.title,
      description: description || meta?.description,
      tags: tags || meta?.tags,
      author: author || meta?.author,
    };
    validatePersonaFields(fields);
    const r = await submitPersona({ filePath: file_path, ...fields });
    if (!r.ok) return reply(false, describeFailure(r));
    return reply(true, `投稿成功，编号 ${r.id}（收录由维护者人工终审，稍后用 check_status 查询）`);
  }));

  server.registerTool("submit_chat", {
    title: "Submit an AI chat screenshot",
    description:
      "Submit a funny AI chat screenshot (QQ group bot / DM / web UI) to the Whale Talk wall. PRIVACY RULE (hard reject): " +
      "real human avatars, nicknames and group names MUST be blurred/masked before submitting. title: one-line summary of the joke, required. " +
      `model one of [${CHAT_MODELS.join(", ")}]; scene one of [${CHAT_SCENES.join(", ")}].`,
    inputSchema: {
      image_path: z.string().describe("Path to the screenshot file (<=10MB)"),
      title: z.string().describe("One-line summary of the joke, <=40 chars"),
      model: z.enum(CHAT_MODELS).optional().describe("Which AI model"),
      scene: z.enum(CHAT_SCENES).optional().describe("Chat scene"),
      author: z.string().optional().describe("Credit, <=20 chars"),
    },
  }, async ({ image_path, title, model, scene, author }) => tryRun(async () => {
    validateChatFields({ title, model, scene, author });
    const { ext } = await validateImageFile(image_path);
    const { preview, width, height } = await makePreview(image_path);
    const r = await submitChat({ imagePath: image_path, title, model, scene, author, preview, ext, width, height });
    if (!r.ok) return reply(false, describeFailure(r));
    return reply(true, `投稿成功，编号 ${r.id}（收录由维护者人工终审，稍后用 check_status 查询）`);
  }));

  server.registerTool("check_status", {
    title: "Check submission status",
    description:
      "Check the moderation status of a previous submission by its id (sub_/psub_/csub_ + 12 hex chars). " +
      "Returns pending / quarantine / approved / rejected.",
    inputSchema: {
      id: z.string().describe("Submission id, e.g. sub_0123456789ab"),
    },
  }, async ({ id }) => tryRun(async () => {
    if (!SUBMIT_STATUS_ID_RE.test(id)) throw new ValidateError(`id 格式不对：${id}`);
    const r = await checkStatus({ id });
    if (!r.ok) return reply(false, describeFailure(r));
    return reply(true, `${r.id} → ${r.status}（${STATUS_LABELS[r.status] || r.status}）`);
  }));

  await server.connect(new StdioServerTransport());
}
