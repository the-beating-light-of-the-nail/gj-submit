// MCP stdio 探针（不联网）：initialize 握手 → tools/list（应 5 工具）→ call submission_guidelines
// 跑法：node test/mcp-probe.mjs
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["src/cli.mjs", "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
child.stderr.on("data", (d) => process.stderr.write("[mcp-stderr] " + d));

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
const pending = new Map();
let buf = "";
child.stdout.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
const call = (id, method, params) =>
  new Promise((res) => {
    pending.set(id, res);
    send({ jsonrpc: "2.0", id, method, params });
  });

const t = (name, ok, extra) => {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? " :: " + extra : ""));
  if (!ok) process.exitCode = 1;
};

const init = await call(1, "initialize", {
  protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "0" },
});
t("initialize 握手（serverInfo.name=gj-submit）", init.result?.serverInfo?.name === "gj-submit", JSON.stringify(init.result?.serverInfo));
send({ jsonrpc: "2.0", method: "notifications/initialized" });

const tools = await call(2, "tools/list", {});
const names = (tools.result?.tools || []).map((x) => x.name).sort();
t(
  "tools/list 恰好 5 个工具",
  names.join(",") === "check_status,submission_guidelines,submit_chat,submit_meme,submit_persona",
  names.join(","),
);

const guide = await call(3, "tools/call", { name: "submission_guidelines", arguments: {} });
const text = guide.result?.content?.[0]?.text || "";
t("submission_guidelines 返回规范全文（含隐私红线）", !guide.result?.isError && text.includes("隐私红线") && text.includes("三条投稿线"), "len=" + text.length);

// 参数校验路径：submit_chat 给白名单外 model → 应返回 isError 的校验错误（不联网、不读文件）
const bad = await call(4, "tools/call", { name: "submit_chat", arguments: { image_path: "nope.png", title: "t", model: "gpt5" } });
t("submit_chat 白名单外 model → isError 校验失败", bad.result?.isError === true && /model/.test(bad.result?.content?.[0]?.text || ""), (bad.result?.content?.[0]?.text || "").slice(0, 80));

child.kill();
console.log(process.exitCode ? "MCP 探针有失败" : "MCP 探针全绿");
process.exit(process.exitCode || 0);
