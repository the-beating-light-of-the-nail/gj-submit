// 三条投稿线 + 状态回查的 HTTP 层：multipart 构造、错误语义标准化。
// 返回值统一 { ok, httpStatus, id?, status?, duplicate?, code?, error?, retryAfter? }——
// CLI 与 MCP 两个入口共用同一结果对象，错误文案在这里一次写好。

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export const DEFAULT_API = "https://aigengtu.com";

async function post(api, path, form) {
  let res;
  try {
    res = await fetch(api.replace(/\/$/, "") + path, { method: "POST", body: form });
  } catch (e) {
    return { ok: false, httpStatus: 0, error: `网络请求失败：${e.cause?.code || e.message}（检查网络或 --api 地址）` };
  }
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok && body.ok === true,
    httpStatus: res.status,
    id: body.id,
    status: body.status,
    duplicate: body.duplicate === true,
    code: body.code,
    error: body.error,
    dedup: body.dedup,
    retryAfter: Number(res.headers.get("Retry-After") || 0) || undefined,
  };
}

// 给 AI/脚本读的错语义（中文）：后续 CLI/MCP 直接展示
export function describeFailure(r) {
  if (r.httpStatus === 0) return r.error;
  if (r.httpStatus === 429) {
    return r.error && r.error.includes("pending")
      ? "在队待审件数到上限（每 IP 同时待审有限），等管理员消化后再投"
      : `投稿限频到顶（每 IP 每小时 3 次）${r.retryAfter ? `，${r.retryAfter} 秒后可再试` : ""}`;
  }
  if (r.httpStatus === 409) {
    return r.duplicate
      ? `重复投稿被拦（${r.code}）：同图/同正文已经投过，不要原样重试`
      : `冲突：${r.error || "409"}`;
  }
  if (r.httpStatus === 413) return `文件太大：${r.error || "超过上限"}`;
  if (r.httpStatus === 400) return `字段/格式问题：${r.error || "400"}`;
  if (r.httpStatus === 404) return `投稿 id 不存在：${r.error || "404"}`;
  return `服务端错误（HTTP ${r.httpStatus}）：${r.error || "请稍后重试"}`;
}

function filePart(buffer, name, type) {
  return new File([buffer], name, { type });
}

// 图片表情包投稿。fields: { imagePath, quote?, nickname?, note? }；preview 由 preview.mjs 生成
export async function submitMeme({ api = DEFAULT_API, imagePath, quote, nickname, note, preview, ext }) {
  const image = await readFile(imagePath);
  const form = new FormData();
  form.append("image", filePart(image, basename(imagePath), `image/${ext === "jpeg" ? "jpeg" : ext}`));
  form.append("preview", filePart(preview, "preview.webp", "image/webp"));
  if (nickname) form.append("nickname", nickname);
  if (quote) form.append("quote", quote);
  if (note) form.append("note", note);
  form.append("source", "cli");
  return post(api, "/api/submit", form);
}

// 人设卡投稿。file 与 prompt 至少其一（CLI 层已保证）；metaJson 可选（zip 内 persona.json 原文）
export async function submitPersona({ api = DEFAULT_API, filePath, prompt, title, description, tags, author, metaJson }) {
  const form = new FormData();
  if (filePath) {
    const buf = await readFile(filePath);
    const ext = filePath.split(".").pop().toLowerCase();
    form.append("file", filePart(buf, basename(filePath), ext === "zip" ? "application/zip" : "text/markdown"));
  }
  form.append("prompt", prompt);
  form.append("title", title);
  if (description) form.append("description", description);
  if (tags) form.append("tags", tags);
  if (author) form.append("author", author);
  if (metaJson) form.append("meta_json", metaJson);
  form.append("source", "cli");
  return post(api, "/api/persona-submit", form);
}

// AI 聊天截图投稿。width/height 由 preview.mjs 读出（原图自然尺寸，防瀑布流 CLS）
export async function submitChat({ api = DEFAULT_API, imagePath, title, model, scene, author, preview, ext, width, height }) {
  const image = await readFile(imagePath);
  const form = new FormData();
  form.append("image", filePart(image, basename(imagePath), `image/${ext === "jpeg" ? "jpeg" : ext}`));
  form.append("preview", filePart(preview, "preview.webp", "image/webp"));
  form.append("title", title);
  if (model) form.append("model", model);
  if (scene) form.append("scene", scene);
  if (author) form.append("author", author);
  if (width && height) {
    form.append("width", String(width));
    form.append("height", String(height));
  }
  form.append("source", "cli");
  return post(api, "/api/chat-submit", form);
}

// 投稿状态回查（公开端点，60s 边缘缓存）
export async function checkStatus({ api = DEFAULT_API, id }) {
  let res;
  try {
    res = await fetch(`${api.replace(/\/$/, "")}/api/submit-status/${id}`);
  } catch (e) {
    return { ok: false, httpStatus: 0, error: `网络请求失败：${e.cause?.code || e.message}` };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, httpStatus: res.status, id: body.id, status: body.status, error: body.error };
}

export const STATUS_LABELS = {
  pending: "待审（维护者人工终审中）",
  quarantine: "待审（转人工复核）",
  approved: "已收录 🎉",
  rejected: "未收录（维护者驳回）",
};
