// 本地预校验：限频 3 次/时/IP 很宝贵，能在本地拦的绝不浪费一次请求。
// 全部约束与站点 worker（aigengtu.com worker.js）对齐：超长服务端是静默截断落库，
// CLI 选择提前报错——让投稿人/AI 有机会改文案而不是悄悄丢内容。

import { open } from "node:fs/promises";

// 与 worker.js 常量同步（改动需两边一起）
export const LIMITS = {
  imageMaxBytes: 10 * 1024 * 1024,   // 原图 ≤10MB（image/chat 两线同）
  previewMaxBytes: 1024 * 1024,      // 预览 webp ≤1MB
  nicknameMax: 20,
  quoteMax: 60,
  noteMax: 300,
  titleMax: 40,
  descriptionMax: 80,
  tagMaxCount: 4,
  tagMaxLen: 12,
  authorMax: 20,
  personaFileMax: { md: 1024 * 1024, zip: 5 * 1024 * 1024 },
  promptMinBytes: 500,
  promptMaxBytes: 100 * 1024,
  metaJsonMax: 8 * 1024,
};

export const CHAT_MODELS = ["deepseek", "doubao", "dsh", "kimi", "glm", "qwen", "other"];
export const CHAT_SCENES = ["qqgroup", "qq", "wechat", "web", "other"];

// 魔数嗅探（与 worker sniffImageExt 同款：扩展名/MIME 都可伪造，只认文件头）
export function sniffImageExt(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "gif";
  if (
    bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  return null;
}

export class ValidateError extends Error {}

function fail(msg) {
  throw new ValidateError(msg);
}

// 字段长度：worker cleanText 按 UTF-16 码元 slice，这里按同口径计数
function checkLen(name, v, max, { required = false } = {}) {
  const s = String(v == null ? "" : v);
  if (!s.trim()) {
    if (required) fail(`${name} 必填`);
    return;
  }
  if (s.length > max) fail(`${name} 超长：${s.length} > ${max} 字（服务端会静默截断，请先精简）`);
}

// 读文件头做魔数嗅探 + 大小校验；返回归一化扩展名
export async function validateImageFile(path, { maxBytes = LIMITS.imageMaxBytes, label = "image" } = {}) {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (e) {
    fail(`打不开 ${label} 文件 ${path}：${e.code || e.message}`);
  }
  try {
    const { size: bytes } = await handle.stat();
    if (!bytes) fail(`${label} 是空文件`);
    if (bytes > maxBytes) fail(`${label} ${bytes} 字节超上限 ${maxBytes}（${(maxBytes / 1024 / 1024).toFixed(0)}MB）`);
    const buf = new Uint8Array(16);
    const { bytesRead } = await handle.read(buf, 0, 16, 0);
    const ext = sniffImageExt(buf.subarray(0, bytesRead));
    if (!ext) fail(`${label} 不是支持的图片格式（认文件头：jpeg/png/gif/webp）`);
    return { ext, size: bytes };
  } finally {
    await handle.close();
  }
}

export function validateMemeFields({ quote, nickname, note } = {}) {
  checkLen("quote(台词)", quote, LIMITS.quoteMax);
  checkLen("nickname(署名)", nickname, LIMITS.nicknameMax);
  checkLen("note(出处)", note, LIMITS.noteMax);
}

export function validatePersonaFields({ prompt, title, description, tags, author } = {}) {
  checkLen("title(人设名)", title, LIMITS.titleMax, { required: true });
  checkLen("description(简介)", description, LIMITS.descriptionMax);
  checkLen("author(署名)", author, LIMITS.authorMax);
  const promptStr = String(prompt || "");
  const bytes = Buffer.byteLength(promptStr, "utf8");
  if (bytes < LIMITS.promptMinBytes || bytes > LIMITS.promptMaxBytes) {
    fail(`prompt(人设正文) 需为 ${LIMITS.promptMinBytes}B - ${Math.floor(LIMITS.promptMaxBytes / 1024)}KB（当前 ${bytes}B）`);
  }
  if (tags != null && String(tags).trim()) {
    const list = String(tags).split(/[\s,，、]+/).filter(Boolean);
    if (list.length > LIMITS.tagMaxCount) fail(`tags 最多 ${LIMITS.tagMaxCount} 个（当前 ${list.length}）`);
    for (const t of list) {
      if (t.length > LIMITS.tagMaxLen) fail(`tag「${t}」超长（>${LIMITS.tagMaxLen} 字）`);
    }
  }
  return { tags: tags == null ? undefined : String(tags).trim() || undefined };
}

export function validateChatFields({ title, model, scene, author } = {}) {
  checkLen("title(标题)", title, LIMITS.titleMax, { required: true });
  checkLen("author(署名)", author, LIMITS.authorMax);
  if (model != null && !CHAT_MODELS.includes(model)) {
    fail(`model 需为七选一：${CHAT_MODELS.join(" / ")}（当前 ${model}）`);
  }
  if (scene != null && !CHAT_SCENES.includes(scene)) {
    fail(`scene 需为五选一：${CHAT_SCENES.join(" / ")}（当前 ${scene}）`);
  }
}

// 人设原件：扩展名 + 大小 + zip 魔数（对齐 worker 口径）
export async function validatePersonaFile(path) {
  const nameExt = String(path).split(".").pop().toLowerCase();
  if (nameExt !== "md" && nameExt !== "zip") fail("人设原件需为 .md 或 .zip");
  let handle;
  try {
    handle = await open(path, "r");
  } catch (e) {
    fail(`打不开人设原件 ${path}：${e.code || e.message}`);
  }
  try {
    const { size: bytes } = await handle.stat();
    if (bytes > LIMITS.personaFileMax[nameExt]) {
      fail(`.${nameExt} 超上限 ${(LIMITS.personaFileMax[nameExt] / 1024 / 1024).toFixed(0)}MB（当前 ${bytes}B）`);
    }
    if (nameExt === "zip") {
      const buf = new Uint8Array(4);
      const { bytesRead } = await handle.read(buf, 0, 4, 0);
      if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
        fail("不是有效的 zip 文件");
      }
    }
    return { ext: nameExt, size: bytes };
  } finally {
    await handle.close();
  }
}

export const SUBMIT_STATUS_ID_RE = /^(sub|psub|csub)_[0-9a-f]{12}$/;
