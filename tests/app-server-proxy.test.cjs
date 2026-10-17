const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { once } = require("node:events");
const test = require("node:test");
const { WebSocketServer } = require("ws");

const proxy = path.resolve(__dirname, "../scripts/app-server-proxy.cjs");

test("bridges RPC and large audio payloads to the existing Unix socket", { timeout: 10_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-web-proxy-"));
  const socketPath = path.join(directory, "control.sock");
  const server = http.createServer();
  const sockets = new WebSocketServer({ server });
  t.after(async () => {
    for (const client of sockets.clients) client.terminate();
    sockets.close();
    server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  sockets.on("connection", (socket) => {
    socket.on("message", (data) => socket.send(data.toString()));
  });
  server.listen(socketPath);
  await once(server, "listening");
  const child = spawn(process.execPath, [proxy, "-c", "features.test=true", "app-server", "--analytics-default-enabled"], {
    env: { ...process.env, CODEX_UNIX_SOCKET: socketPath },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const lines = readline.createInterface({ input: child.stdout });
  const result = once(lines, "line");
  const message = JSON.stringify({ id: 1, method: "test/audio", params: { audio: "a".repeat(256 * 1024) } });
  child.stdin.write(`${message}\n`);
  assert.equal((await result)[0], message);
  const exited = once(child, "exit");
  child.stdin.end();
  assert.equal((await exited)[0], 0);
});

test("fails when the host daemon is unavailable instead of creating a new one", { timeout: 10_000 }, async () => {
  const child = spawn(process.execPath, [proxy, "app-server"], {
    env: { ...process.env, CODEX_UNIX_SOCKET: `/tmp/codex-web-missing-${process.pid}.sock` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let error = "";
  child.stderr.on("data", (data) => { error += data; });
  assert.equal((await once(child, "exit"))[0], 1);
  assert.match(error, /ENOENT/);
});
