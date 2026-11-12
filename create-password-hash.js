"use strict";

const crypto = require("node:crypto");

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Execute este comando em um terminal interativo para digitar a senha sem exibi-la.");
  process.exit(1);
}

process.stdout.write("Nova senha: ");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
let password = "";

process.stdin.on("data", (character) => {
  if (character === "\u0003") {
    process.stdout.write("\nCancelado.\n");
    process.exit(1);
  }
  if (character === "\r" || character === "\n") {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
    if (password.length < 12) {
      console.error("Use uma senha com pelo menos 12 caracteres.");
      process.exit(1);
    }
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
    password = "";
    console.log(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`);
    return;
  }
  if (character === "\u007f" || character === "\b") {
    password = password.slice(0, -1);
    return;
  }
  password += character;
});
