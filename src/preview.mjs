// webp 预览生成：与站内前端 submit.html makePreview 同参数——
// EXIF 自动转向 + 长边缩到 512 只缩不放 + webp quality 78；>1MB 降 q 重试一次。
// 服务端只验「魔数是 webp + ≤1MB」，参数对齐只为预览观感一致。

import sharp from "sharp";
import { LIMITS, ValidateError } from "./validate.mjs";

const PREVIEW_EDGE = 512;
const PREVIEW_QUALITY = 78;

function render(imagePath, quality) {
  return sharp(imagePath, { pages: 1 }) // 动图取第一帧（站内前端 canvas 同款行为）
    .rotate() // EXIF auto-orient，对齐前端 imageOrientation:"from-image"
    .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
}

// 返回 { preview: Buffer, width, height }（width/height = 原图 EXIF 归正后的自然尺寸，chat 线防 CLS 用）
export async function makePreview(imagePath) {
  // EXIF 归正后的自然尺寸：rotate 是管道操作、metadata 不带方向修正，
  // 站内前端 createImageBitmap(imageOrientation:"from-image") 拿到的是归正后尺寸，这里对齐
  const oriented = await sharp(imagePath, { pages: 1 }).rotate().metadata();

  let out = await render(imagePath, PREVIEW_QUALITY);
  if (out.data.length > LIMITS.previewMaxBytes) {
    out = await render(imagePath, 60); // 极端大图降档重试一次（512px webp 几乎不会到 1MB）
  }
  if (out.data.length > LIMITS.previewMaxBytes) {
    throw new ValidateError(`预览 webp 生成后仍 >1MB（${out.data.length}B），源图异常，请检查`);
  }
  return { preview: out.data, width: oriented.width || 0, height: oriented.height || 0 };
}
