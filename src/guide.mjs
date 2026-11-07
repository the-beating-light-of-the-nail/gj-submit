// 标注规范全文（单源三用：gj-submit guide 输出 / MCP submission_guidelines 工具 / skills SKILL.md 摘要引用）
// 内容口径与站点收录规则对齐（aigengtu.com）；改这里 = 改 CLI、MCP、Skill 三处的规范。

export const GUIDE = `# 梗鲸投稿指南（给 AI 看的标注规范）

## 这是什么站
梗鲸（aigengtu.com）是中英双语的 AI meme 表情包图库。收录口径：**全部 AI meme**——大肥鱼（DeepSeek 鲸鱼娘）是主体，Claude 娘、GPT 娘、豆包（豆大妈）、Kimi、通义千问、智谱清言、Gemini、Grok 等 AI 拟人 / 模型梗图同等收录。「非 AI meme 图」举报甄别的对象是混进来的无关图，不是「非 DeepSeek 图」。

## 三条投稿线
1. 图片表情包（\`gj-submit image\`）→ 终审通过后入馆藏，拿 /meme/编号 详情页
2. 人设卡（\`gj-submit persona\`）→ 终审通过后上人设卡页的「社区投稿」区
3. AI 聊天截图（\`gj-submit chat\`）→ 终审通过后上「鲸言鲸语」瀑布流

## 图片表情包怎么标注（image）
- image：原图路径，≤10MB，jpeg / png / gif / webp；动图 GIF 直传不转码
- quote（台词，≤60 字）：**图里印着文字就照抄图内文字**（保留原样，含错别字）；图里没文字才写一句最贴梗点的概括短语。不要写「这张图展示了…」式描述文
- nickname（≤20 字）：作品作者署名。有原作者就写原作者；不知道就空着，让用户补
- note（≤300 字）：出处说明——来源链接 / 平台 / 创作背景，能溯源就写
- 审核维度：画质（太糊太低清不收）、是否 AI meme、是否重复（感知指纹判重，同图加字改字的差分也会被拦——确定是同一张就别投第二遍）

## 人设卡怎么标注（persona）
- prompt：人设提示词全文（UTF-8 字节 500B–100KB），这是主体，别截断
- title（必填，≤40 字）：人设名，如「傲娇深海研究员鲸鱼娘」
- description（≤80 字）：一句话简介
- tags（最多 4 个、每个 ≤12 字）：如「傲娇 群聊 科学家」
- author（≤20 字）：署名
- 文件格式：.md（可带 YAML frontmatter）或 .zip 人设包；也可以直接 --prompt 传正文

## AI 聊天截图怎么标注（chat）
- image：截图路径，≤10MB
- title（必填，≤40 字）：一句话概括笑点，如「问它最想对我做什么」
- model 七选一：deepseek / doubao / dsh / kimi / glm / qwen / other
- scene 五选一：qqgroup / qq / wechat / web / other
- **隐私红线（必驳项）**：截图里的真人头像、昵称、群名必须先打码——没打码必被驳回。这是比色情更容易被投诉的维度，投稿前先向用户确认已打码

## 通用纪律（AI 必读）
- 内容必须 SFW（全年龄向）
- 限频：每 IP 每小时 3 次，**别批量刷**；一次会话投 1–3 张合适
- 同图 / 同文会被 SHA-256 快筛拦（409 duplicate），别原样重试
- 投稿成功返回 id（sub_ / psub_ / csub_ 前缀），记下来；之后用 \`gj-submit status <id>\` 回查（pending → approved / rejected）
- 录不收录由维护者人工终审，全程无感知等待即可

## 错误对照
- 429 too many submissions：限频到顶，等 1 小时再试（响应带 Retry-After: 3600）
- 429 pending queue limit：在队待审件数到上限，等管理员消化
- 409 duplicate：同图或同正文投过了，停止重试
- 413 too large：文件超限，压缩后再投
- 400：字段格式问题，看返回的 error 信息
`;
