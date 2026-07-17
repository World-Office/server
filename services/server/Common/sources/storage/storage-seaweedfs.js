const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const httpAgent = new http.Agent({ keepAlive: true });

function getBaseUrl(storageCfg) {
  return storageCfg.filerUrl || "http://localhost:8888";
}

function getUrl(storageCfg, strPath) {
  const base = getBaseUrl(storageCfg);
  const fullPath = `${storageCfg.storageFolderName || "data"}/${strPath}`;
  return `${base}/${fullPath}`;
}

async function headObject(storageCfg, strPath) {
  const url = getUrl(storageCfg, strPath);
  const { headers } = await httpRequest(url, { method: "HEAD" });
  return { ContentLength: parseInt(headers["content-length"] || "0", 10) };
}

async function getObject(storageCfg, strPath) {
  const url = getUrl(storageCfg, strPath);
  return await httpRequest(url, { method: "GET", responseType: "buffer" });
}

async function createReadStream(storageCfg, strPath) {
  const buffer = await getObject(storageCfg, strPath);
  const { Readable } = require("node:stream");
  return {
    contentLength: buffer.length,
    readStream: Readable.from(buffer),
  };
}

async function putObject(storageCfg, strPath, buffer, contentLength) {
  const url = getUrl(storageCfg, strPath);
  await httpRequest(url, {
    method: "PUT",
    body: buffer,
    headers: { "Content-Type": getContentType(strPath) },
  });
}

async function uploadObject(storageCfg, strPath, filePath) {
  const buffer = await fs.promises.readFile(filePath);
  return await putObject(storageCfg, strPath, buffer, buffer.length);
}

async function copyObject(storageCfgSrc, storageCfgDst, sourceKey, destinationKey) {
  const data = await getObject(storageCfgSrc, sourceKey);
  await putObject(storageCfgDst, destinationKey, data, data.length);
}

async function listObjects(storageCfg, strPath) {
  const baseUrl = getBaseUrl(storageCfg);
  const prefix = `${storageCfg.storageFolderName || "data"}/`;
  const dirUrl = `${baseUrl}/${prefix}${strPath}/`;
  const { body } = await httpRequest(dirUrl, { method: "GET" });
  const entries = JSON.parse(body);
  return (entries.Entries || []).map((e) => e.Name || e.FullPath.replace(`/${prefix}`, ""));
}

async function deleteObject(storageCfg, strPath) {
  const url = getUrl(storageCfg, strPath);
  await httpRequest(url, { method: "DELETE" });
}

async function deletePath(storageCfg, strPath) {
  const list = await listObjects(storageCfg, strPath);
  for (const item of list) {
    await deleteObject(storageCfg, `${strPath}/${item}`);
  }
}

function needServeStatic() {
  return false;
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const mod = isHttps ? https : http;
    const req = mod.request(
      url,
      {
        method: options.method || "GET",
        agent: httpAgent,
        headers: options.headers || {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } else {
            reject(new Error(`SeaweedFS HTTP ${res.statusCode}: ${body.toString()}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".json": "application/json",
  };
  return map[ext] || "application/octet-stream";
}

module.exports = {
  headObject,
  getObject,
  createReadStream,
  putObject,
  uploadObject,
  copyObject,
  listObjects,
  deleteObject,
  deletePath,
  needServeStatic,
};
