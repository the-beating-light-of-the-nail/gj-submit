---
name: gj-submit
description: 向梗鲸（aigengtu.com，AI meme 表情包图库）投稿：图片表情包、人设卡、AI 聊天截图三线投稿与状态回查。当用户说「投稿 / 发到梗鲸 / 传表情包上去 / 把这张图投给梗鲸 / 提交人设卡 / 投聊天截图」时使用本技能。
---

# 梗鲸投稿（gj-submit）

通过 `gj-submit` CLI 向梗鲸投稿。CLI 由 Node 驱动，零配置：`npx -y gj-submit@latest <命令>`。

## 第一步：读规范

投稿前先跑一次，拿到完整标注口径（收录范围、每条线字段怎么填、隐私红线、限频）：

```bash
npx -y gj-submit@latest guide
```

要点速览（详见 guide 输出）：

- **收录口径**：全部 AI meme。大肥鱼（DeepSeek）是主体，Claude 娘 / GPT 娘 / 豆包 / Kimi / 通义 / 智谱 / Gemini / Grok 等拟人梗图同等收录；与 AI 无关的图不收
- **限频 3 次/时/IP**：一次会话投 1–3 张合适，绝不批量刷
- **SFW**：全年龄向内容
- **聊天截图隐私红线**：真人头像 / 昵称 / 群名必须先打码，未打码必驳

## 三条投稿线

### 图片表情包（终审通过入馆藏）

```bash
npx -y gj-submit@latest image ./表情包.png --quote "图内台词照抄优先" --nickname "作者" --note "出处链接"
```

`--quote` ≤60 字：图里印着文字就**照抄图内文字**（保留原样）；没文字才写一句梗点概括。不要写描述文。

### 人设卡（终审通过上人设卡页社区区）

```bash
# 直接传正文
npx -y gj-submit@latest persona --title "傲娇深海研究员鲸鱼娘" --prompt "<人设提示词全文>" --tags "傲娇 群聊"

# 或传 .md（YAML frontmatter 里的 title/description/tags/author 自动预填）
npx -y gj-submit@latest persona ./人设卡.md
```

正文 500B–100KB；`--tags` 最多 4 个、每个 ≤12 字。

### AI 聊天截图（终审通过上「鲸言鲸语」）

```bash
npx -y gj-submit@latest chat ./截图.png --title "一句话概括笑点" --model deepseek --scene qqgroup
```

`--model` 七选一：deepseek/doubao/dsh/kimi/glm/qwen/other；`--scene` 五选一：qqgroup/qq/wechat/web/other。

## 投完之后：回查结果

投稿成功返回编号（sub_ / psub_ / csub_ 前缀）。收录由维护者**人工终审**，隔一段时间回查：

```bash
npx -y gj-submit@latest status sub_0123456789ab
```

状态：pending（待审）→ approved（已收录）/ rejected（未收录）。

## 错误处理

- `429 too many`：限频到顶，等 1 小时
- `429 pending queue`：在队待审太多，等管理员消化
- `409 duplicate`：同图/同文投过了，**不要原样重试**（感知判重连改字差分都拦）
- `413`：文件太大（原图 ≤10MB）
- 全部命令加 `--json` 可拿机器可读输出

## 本地调试与项目

- 站点：https://aigengtu.com ｜ 投稿页：https://aigengtu.com/submit
- CLI 源码：https://github.com/the-beating-light-of-the-nail/gj-submit（MIT）
