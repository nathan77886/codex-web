#!/usr/bin/env node
"use strict";

const net = require("node:net");
const readline = require("node:readline");
const WebSocket = require("ws");

const args = process.argv.slice(2);
while (args[0] === "-c" || args[0] === "--config") {
  if (args.length < 2) {
    console.error("app-server-proxy: config option requires a value");
    process.exit(64);
  }
  args.splice(0, 2);
}
if (args[0] !== "app-server") {
  console.error("app-server-proxy only supports app-server mode");
  process.exit(64);
}

const socketPath = process.env.CODEX_UNIX_SOCKET;
if (!socketPath) {
  console.error("app-server-proxy: CODEX_UNIX_SOCKET is required");
  process.exit(64);
}

// Connect to the existing host daemon. Never start another app-server in Docker.
const socket = new WebSocket("ws://localhost/rpc", {
  createConnection: () => net.connect(socketPath),
  handshakeTimeout: 10_000,
  maxPayload: 100 * 1024 * 1024,
});
let input;
let closing = false;

socket.on("open", () => {
  input = readline.createInterface({ input: process.stdin, terminal: false });
  input.on("line", (line) => {
    if (!line.trim()) return;
    socket.send(line, (error) => {
      if (error) {
        console.error(`app-server-proxy: ${error.message}`);
        process.exitCode = 1;
        socket.terminate();
      }
    });
  });
  input.on("close", () => {
    closing = true;
    socket.close();
  });
});
socket.on("message", (data) => {
  if (!process.stdout.write(`${data.toString()}\n`)) socket.pause();
});
process.stdout.on("drain", () => socket.resume());
process.stdout.on("error", (error) => {
  process.exitCode = error.code === "EPIPE" ? 0 : 1;
  closing = true;
  socket.terminate();
});
socket.on("error", (error) => {
  console.error(`app-server-proxy: ${error.message}`);
  process.exitCode = 1;
});
socket.on("close", () => {
  if (!closing) process.exitCode = 1;
  input?.close();
  process.stdin.destroy();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    closing = true;
    socket.terminate();
  });
}
