"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = "estudio_norte_session";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const usernameSetting = process.env.KANBAN_USERNAME?.trim();
const passwordHashSetting = process.env.KANBAN_PASSWORD_HASH;
const TEST_ACCOUNT_HASH = "scrypt$569a42ddc41a7242feffba04523fb1af$3d3665f97c1fd46a5f5e29eecefba5fe69dc17094214878c96b856a17f6e41a8d3f017b79101b2887b7c3fb6c54938c9729ad7fa9c24770f4d7a63059d4ba01b";
const sessions = new Map();

function parsePasswordHash(value) {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(value || "");
  if (!match) return null;
  return { salt: Buffer.from(match[1], "hex"), key: Buffer.from(match[2], "hex") };
}

const configuredPasswordHash = parsePasswordHash(passwordHashSetting);
const configuredAccount = usernameSetting && configuredPasswordHash
  ? { username: usernameSetting, passwordHash: configuredPasswordHash }
  : null;
const testAccount = !IS_PRODUCTION
  ? { username: "kaua", passwordHash: parsePasswordHash(TEST_ACCOUNT_HASH) }
  : null;
const accounts = [configuredAccount, testAccount].filter(Boolean);

if (!accounts.length) {
  console.error("Em producao, configure KANBAN_USERNAME e KANBAN_PASSWORD_HASH antes de iniciar.");
  process.exit(1);
}

function sendJson(response, status, data, headers = {}) {
  const body = JSON.stringify(data);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), ...headers });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 16_384) oversized = true;
    });
    request.on("end", () => {
      if (oversized) return reject(Object.assign(new Error("Corpo muito grande"), { status: 413 }));
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(Object.assign(new Error("JSON inválido"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function getCookie(request, name) {
  const prefix = `${name}=`;
  const cookie = (request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : "";
}

function tokenKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getSession(request) {
  const token = getCookie(request, COOKIE_NAME);
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const key = tokenKey(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return { key, ...session };
}

function cookieHeader(token, maxAge) {
  const parts = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function originIsAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; }
  catch { return false; }
}

function verifyPassword(candidate, passwordHash) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(candidate, passwordHash.salt, passwordHash.key.length, { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(crypto.timingSafeEqual(derivedKey, passwordHash.key));
    });
  });
}

function sameUsername(candidate, username) {
  const candidateDigest = crypto.createHash("sha256").update(candidate.trim().toLowerCase()).digest();
  const expectedDigest = crypto.createHash("sha256").update(username.toLowerCase()).digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
  if (process.env.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

async function handleApi(request, response, url) {
  if (!originIsAllowed(request)) return sendJson(response, 403, { message: "Origem não permitida." });

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const session = getSession(request);
    if (!session) return sendJson(response, 401, { authenticated: false });
    return sendJson(response, 200, { authenticated: true, username: session.username });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    let body;
    try { body = await readJson(request); }
    catch (error) { return sendJson(response, error.status || 400, { message: "Requisição inválida." }); }
    const candidateUsername = typeof body.username === "string" ? body.username.trim() : "";
    const candidatePassword = typeof body.password === "string" ? body.password : "";
    if (!candidateUsername || !candidatePassword || candidateUsername.length > 254 || candidatePassword.length > 1024) {
      return sendJson(response, 400, { message: "Preencha o usuário e a senha." });
    }
    const account = accounts.find((item) => sameUsername(candidateUsername, item.username));
    const passwordHash = (account || accounts[0]).passwordHash;
    let validPassword = false;
    try { validPassword = await verifyPassword(candidatePassword, passwordHash); }
    catch { return sendJson(response, 500, { message: "Não foi possível validar o acesso." }); }
    if (!account || !validPassword) return sendJson(response, 401, { message: "Credenciais inválidas." });

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(tokenKey(token), { username: account.username, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(response, 200, { username: account.username }, { "Set-Cookie": cookieHeader(token, SESSION_TTL_MS / 1000) });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const session = getSession(request);
    if (session) sessions.delete(session.key);
    response.writeHead(204, { "Cache-Control": "no-store", "Set-Cookie": cookieHeader("", 0) });
    return response.end();
  }

  return sendJson(response, 404, { message: "Rota não encontrada." });
}

const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"]
};

const server = http.createServer(async (request, response) => {
  securityHeaders(response);
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(request, response, url);
  if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { message: "Método não permitido." });
  const file = publicFiles[url.pathname];
  if (!file) return sendJson(response, 404, { message: "Página não encontrada." });
  const filePath = path.join(ROOT, file[0]);
  fs.readFile(filePath, (error, contents) => {
    if (error) return sendJson(response, 500, { message: "Não foi possível carregar a página." });
    response.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-cache", "Content-Length": contents.length });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});

server.listen(PORT, HOST, () => console.log(`Estúdio Norte disponível em http://${HOST}:${PORT}`));
