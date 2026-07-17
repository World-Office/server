const os = require("node:os")
const cluster = require("node:cluster")
const path = require("node:path")
const crypto = require("node:crypto")
const config = require("config")
const utils = require("../utils")
const commonDefines = require("../commondefines")
const constants = require("../constants")
const ms = require("ms")
const tenantManager = require("../tenantManager")
const operationContext = require("../operationContext")
const storageFs = require("./storage-fs")
const storageS3 = require("./storage-s3")
const storageAz = require("./storage-az")
const storageSeaweedfs = require("./storage-seaweedfs")

const cfgExpSessionAbsolute = ms(config.get("services.CoAuthoring.expire.sessionabsolute"))
const cfgCacheStorage = config.get("storage")
const cfgPersistentStorage = operationContext.normalizePersistentStorageCfg(
  cfgCacheStorage,
  config.get("persistentStorage"),
)

// Stubs are needed until integrators pass these parameters to all requests
let shardKeyCached
let wopiSrcCached

const HEALTH_CHECK_KEY_MAX = 10000

function getStoragePath(ctx, strPath, opt_specialDir) {
  opt_specialDir = opt_specialDir || cfgCacheStorage.cacheFolderName
  return `${opt_specialDir}/${tenantManager.getTenantPathPrefix(ctx)}${strPath.replace(/\\/g, "/")}`
}
function getStorage(storageCfg) {
  switch (storageCfg.name) {
    case "storage-s3":
      return storageS3
    case "storage-seaweedfs":
      return storageSeaweedfs
    case "storage-az":
      return storageAz
    default:
      return storageFs
  }
}
function getStorageCfg(ctx, opt_specialDir) {
  const configKey =
    opt_specialDir && opt_specialDir !== cfgCacheStorage.cacheFolderName
      ? "persistentStorage"
      : "storage"
  const defaultCfg = configKey === "persistentStorage" ? cfgPersistentStorage : cfgCacheStorage
  return ctx ? ctx.getCfg(configKey, defaultCfg) : defaultCfg
}
function canCopyBetweenStorage(storageCfgSrc, storageCfgDst) {
  return (
    storageCfgSrc.name === storageCfgDst.name && storageCfgSrc.endpoint === storageCfgDst.endpoint
  )
}
function isDifferentPersistentStorage() {
  return !canCopyBetweenStorage(cfgCacheStorage, cfgPersistentStorage)
}

async function headObject(ctx, strPath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.headObject(storageCfg, getStoragePath(ctx, strPath, opt_specialDir))
}
async function getObject(ctx, strPath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.getObject(storageCfg, getStoragePath(ctx, strPath, opt_specialDir))
}
async function createReadStream(ctx, strPath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.createReadStream(storageCfg, getStoragePath(ctx, strPath, opt_specialDir))
}
async function putObject(ctx, strPath, buffer, contentLength, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.putObject(
    storageCfg,
    getStoragePath(ctx, strPath, opt_specialDir),
    buffer,
    contentLength,
  )
}
async function uploadObject(ctx, strPath, filePath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.uploadObject(
    storageCfg,
    getStoragePath(ctx, strPath, opt_specialDir),
    filePath,
  )
}
async function copyObject(ctx, sourceKey, destinationKey, opt_specialDirSrc, opt_specialDirDst) {
  const storageCfgSrc = getStorageCfg(ctx, opt_specialDirSrc)
  const storageCfgDst = getStorageCfg(ctx, opt_specialDirDst)
  const storageSrc = getStorage(storageCfgSrc)
  const storagePathSrc = getStoragePath(ctx, sourceKey, opt_specialDirSrc)
  const storagePathDst = getStoragePath(ctx, destinationKey, opt_specialDirDst)
  if (canCopyBetweenStorage(storageCfgSrc, storageCfgDst)) {
    return await storageSrc.copyObject(storageCfgSrc, storageCfgDst, storagePathSrc, storagePathDst)
  }
  const storageDst = getStorage(storageCfgDst)
  //todo stream
  const buffer = await storageSrc.getObject(storageCfgSrc, storagePathSrc)
  return await storageDst.putObject(storageCfgDst, storagePathDst, buffer, buffer.length)
}
async function copyPath(ctx, sourcePath, destinationPath, opt_specialDirSrc, opt_specialDirDst) {
  const list = await listObjects(ctx, sourcePath, opt_specialDirSrc)
  await Promise.all(
    list.map((curValue) => {
      return copyObject(
        ctx,
        curValue,
        `${destinationPath}/${getRelativePath(sourcePath, curValue)}`,
        opt_specialDirSrc,
        opt_specialDirDst,
      )
    }),
  )
}
async function listObjects(ctx, strPath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  const prefix = getStoragePath(ctx, "", opt_specialDir)
  try {
    const list = await storage.listObjects(storageCfg, getStoragePath(ctx, strPath, opt_specialDir))
    return list.map((currentValue) => {
      return currentValue.substring(prefix.length)
    })
  } catch (e) {
    ctx.logger.error("storage.listObjects: %s", e.stack)
    return []
  }
}
async function deleteObject(ctx, strPath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.deleteObject(storageCfg, getStoragePath(ctx, strPath, opt_specialDir))
}
async function deletePath(ctx, strPath, opt_specialDir) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  return await storage.deletePath(storageCfg, getStoragePath(ctx, strPath, opt_specialDir))
}
async function getSignedUrl(
  ctx,
  baseUrl,
  strPath,
  urlType,
  optFilename,
  opt_creationDate,
  opt_specialDir,
  useDirectStorageUrls,
) {
  const storageCfg = getStorageCfg(ctx, opt_specialDir)
  const storage = getStorage(storageCfg)
  const storagePath = getStoragePath(ctx, strPath, opt_specialDir)
  const directUrlsEnabled = useDirectStorageUrls ?? storageCfg.useDirectStorageUrls

  if (directUrlsEnabled && storage.getDirectSignedUrl) {
    return await storage.getDirectSignedUrl(
      ctx,
      storageCfg,
      baseUrl,
      storagePath,
      urlType,
      optFilename,
      opt_creationDate,
    )
  }
  const storageSecretString = storageCfg.fs.secretString
  const storageUrlExpires = storageCfg.fs.urlExpires
  //use fixed bucket name because it hard-coded in nginx
  const bucketName = storageCfg.name === "storage-fs" ? "cache" : "storage-cache"
  const storageFolderName = storageCfg.storageFolderName
  //replace '/' with %2f before encodeURIComponent becase nginx determine %2f as '/' and get wrong system path
  const userFriendlyName = optFilename
    ? encodeURIComponent(optFilename.replace(/\//g, "%2f"))
    : path.basename(strPath)
  const uri = `/${bucketName}/${storageFolderName}/${storagePath}/${userFriendlyName}`
  //RFC 1123 does not allow underscores https://stackoverflow.com/questions/2180465/can-domain-name-subdomains-have-an-underscore-in-it
  let url = utils.checkBaseUrl(ctx, baseUrl, storageCfg).replace(/_/g, "%5f")
  url += uri

  const date = Date.now()
  const creationDate = opt_creationDate || date
  const expiredAfter =
    (commonDefines.c_oAscUrlTypes.Session === urlType
      ? cfgExpSessionAbsolute / 1000
      : storageUrlExpires) || 31536000
  //todo creationDate can be greater because mysql CURRENT_TIMESTAMP uses local time, not UTC
  let expires =
    creationDate + Math.ceil(Math.abs(date - creationDate) / expiredAfter) * expiredAfter
  expires = Math.ceil(expires / 1000)
  expires += expiredAfter
  let md5 = crypto
    .createHash("md5")
    .update(expires + decodeURIComponent(uri) + storageSecretString)
    .digest("base64")
  md5 = md5.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")

  url += `?md5=${encodeURIComponent(md5)}`
  url += `&expires=${encodeURIComponent(expires)}`
  if (ctx.shardKey) {
    shardKeyCached = ctx.shardKey
    url += `&${constants.SHARD_KEY_API_NAME}=${encodeURIComponent(ctx.shardKey)}`
  } else if (ctx.wopiSrc) {
    wopiSrcCached = ctx.wopiSrc
    url += `&${constants.SHARD_KEY_WOPI_NAME}=${encodeURIComponent(ctx.wopiSrc)}`
  } else if (shardKeyCached) {
    //Add stubs for shardkey params until integrators pass these parameters to all requests
    url += `&${constants.SHARD_KEY_API_NAME}=${encodeURIComponent(shardKeyCached)}`
  } else if (wopiSrcCached) {
    url += `&${constants.SHARD_KEY_WOPI_NAME}=${encodeURIComponent(wopiSrcCached)}`
  } else if (process.env.DEFAULT_SHARD_KEY) {
    //todo in fact DEFAULT_SHARD_KEY it's not present in shard map
    //Set DEFAULT_SHARD_KEY from environment as shardkey in case of integrator did not pass this param
    url += `&${constants.SHARD_KEY_API_NAME}=${encodeURIComponent(process.env.DEFAULT_SHARD_KEY)}`
  }
  url += `&filename=${userFriendlyName}`
  return url
}
async function getSignedUrls(ctx, baseUrl, strPath, urlType, opt_creationDate, opt_specialDir) {
  const list = await listObjects(ctx, strPath, opt_specialDir)
  const outputMap = {}
  for (let i = 0; i < list.length; ++i) {
    outputMap[getRelativePath(strPath, list[i])] = await getSignedUrl(
      ctx,
      baseUrl,
      list[i],
      urlType,
      undefined,
      opt_creationDate,
      opt_specialDir,
    )
  }
  return outputMap
}
async function getSignedUrlsArrayByArray(ctx, baseUrl, list, urlType, opt_specialDir) {
  return await Promise.all(
    list.map((curValue) => {
      return getSignedUrl(ctx, baseUrl, curValue, urlType, undefined, undefined, opt_specialDir)
    }),
  )
}
async function getSignedUrlsByArray(ctx, baseUrl, list, optPath, urlType, opt_specialDir) {
  const urls = await getSignedUrlsArrayByArray(ctx, baseUrl, list, urlType, opt_specialDir)
  const outputMap = {}
  for (let i = 0; i < list.length && i < urls.length; ++i) {
    if (optPath) {
      const storagePathSrc = getStoragePath(ctx, optPath, opt_specialDir)
      outputMap[getRelativePath(storagePathSrc, list[i])] = urls[i]
    } else {
      outputMap[list[i]] = urls[i]
    }
  }
  return outputMap
}
function getRelativePath(strBase, strPath) {
  return strPath.substring(strBase.length + 1)
}
async function healthCheck(ctx, opt_specialDir) {
  const clusterId = cluster.isWorker ? cluster.worker.id : ""
  const tempName = `hc_${os.hostname()}_${clusterId}_${Math.round(Math.random() * HEALTH_CHECK_KEY_MAX)}`
  const tempBuffer = Buffer.from([1, 2, 3, 4, 5])
  try {
    //It's proper to putObject one tempName
    await putObject(ctx, tempName, tempBuffer, tempBuffer.length, opt_specialDir)
    //try to prevent case, when another process can remove same tempName
    await deleteObject(ctx, tempName, opt_specialDir)
  } catch (err) {
    ctx.logger.warn("healthCheck storage(%s) error %s", opt_specialDir, err.stack)
  }
}
function needServeStatic(opt_specialDir) {
  const storageCfg = getStorageCfg(null, opt_specialDir)
  const storage = getStorage(storageCfg)
  return storage.needServeStatic()
}

module.exports = {
  headObject,
  getObject,
  createReadStream,
  putObject,
  uploadObject,
  copyObject,
  copyPath,
  listObjects,
  deleteObject,
  deletePath,
  getSignedUrl,
  getSignedUrls,
  getSignedUrlsArrayByArray,
  getSignedUrlsByArray,
  getRelativePath,
  isDifferentPersistentStorage,
  healthCheck,
  needServeStatic,
}
