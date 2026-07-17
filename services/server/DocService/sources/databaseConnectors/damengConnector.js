"use strict"

const db = require("dmdb")
const connectorUtilities = require("./connectorUtilities")
const config = require("config")

const configSql = config.get("services.CoAuthoring.sql")
const cfgDbHost = configSql.get("dbHost")
const cfgDbPort = configSql.get("dbPort")
const cfgDbUser = configSql.get("dbUser")
const cfgDbPass = configSql.get("dbPass")
const cfgConnectionLimit = configSql.get("connectionlimit")
const cfgTableResult = configSql.get("tableResult")
const cfgDamengExtraOptions = config.util.cloneDeep(configSql.get("damengExtraOptions"))
const forceClosingCountdownMs = 2000

// dmdb VARCHAR limit — strings >= this need TO_CLOB chunking
const VARCHAR_PREC = 8188

// dmdb driver separates PoolAttributes and ConnectionAttributes.
// For some reason if you use pool you must define connection attributes in
// connectString, they are not included in config object, and
// pool.getConnection() can't configure it.
const poolHostInfo = `dm://${cfgDbUser}:${cfgDbPass}@${cfgDbHost}:${cfgDbPort}`
const connectionOptions = Object.entries(cfgDamengExtraOptions)
  .map((option) => option.join("="))
  .join("&")

let pool = null
const poolConfig = {
  // String format dm://username:password@host:port[?prop1=val1[&prop2=val2]]
  connectString: `${poolHostInfo}${connectionOptions.length > 0 ? "?" : ""}${connectionOptions}`,
  poolMax: cfgConnectionLimit,
  poolMin: 0,
}

function readLob(lob) {
  return new Promise((resolve, reject) => {
    let blobData = Buffer.alloc(0)
    let totalLength = 0

    lob.on("data", (chunk) => {
      totalLength += chunk.length
      blobData = Buffer.concat([blobData, chunk], totalLength)
    })

    lob.on("error", (err) => {
      reject(err)
    })

    lob.on("end", () => {
      resolve(blobData)
    })
  })
}

async function formatResult(result) {
  const res = []

  if (result?.rows && result?.metaData) {
    for (let i = 0; i < result.rows.length; ++i) {
      const row = result.rows[i]
      const out = {}

      for (let j = 0; j < result.metaData.length; ++j) {
        const columnName = result.metaData[j].name

        if (row[j]?.on) {
          const buf = await readLob(row[j])
          out[columnName] = buf.toString("utf8")
        } else {
          out[columnName] = row[j]
        }
      }

      res.push(out)
    }
  }

  return res
}

function sqlQuery(
  ctx,
  sqlCommand,
  callbackFunction,
  opt_noModifyRes = false,
  opt_noLog = false,
  opt_values = [],
) {
  return executeQuery(ctx, sqlCommand, opt_values, opt_noModifyRes, opt_noLog).then(
    (result) => callbackFunction?.(null, result),
    (error) => callbackFunction?.(error),
  )
}

async function executeQuery(ctx, sqlCommand, values = [], noModifyRes = false, noLog = false) {
  let connection = null

  try {
    if (!pool) {
      pool = await db.createPool(poolConfig)
    }

    connection = await pool.getConnection()
    const result = await connection.execute(sqlCommand, values, { resultSet: false })

    let output = result

    if (!noModifyRes) {
      if (result?.rows) {
        output = await formatResult(result)
      } else if (result?.rowsAffected) {
        output = { affectedRows: result.rowsAffected }
      } else {
        output = { rows: [], affectedRows: 0 }
      }
    }

    return output
  } catch (error) {
    if (!noLog) {
      ctx.logger.error(`sqlQuery() error while executing query: ${sqlCommand}\n${error.stack}`)
    }

    throw error
  } finally {
    if (connection) {
      try {
        connection.close()
      } catch (error) {
        if (!noLog) {
          ctx.logger.error(
            `connection.close() error while executing query: ${sqlCommand}\n${error.stack}`,
          )
        }
      }
    }
  }
}

function closePool() {
  return pool?.close(forceClosingCountdownMs)
}

function healthCheck(ctx) {
  return executeQuery(ctx, "SELECT 1 FROM DUAL")
}

/**
 * @param {any} val - value to bind
 * @param {Array} values - bind parameters array
 * @returns {string} placeholder like :1, :2, etc.
 */
function addSqlParameter(val, values) {
  if (typeof val === "string") {
    const len = val.length

    // 2000 chars * 4 bytes (max utf8) = 8000 < 8188. Safe for all.
    if (len >= 2000) {
      if (len >= VARCHAR_PREC || Buffer.byteLength(val, "utf8") >= VARCHAR_PREC) {
        // Workaround for dmdb 8188 byte limit.
        // Tried: {type: db.CLOB} (failed), TO_CLOB wrappers (verbose).
        // Implemented: Split into 2000-char chunks and concatenate (:1 || :2).
        // Future: Use native CLOB binding when driver support improves.
        const CHUNK_SIZE = 2000
        const placeholders = []

        for (let i = 0; i < len; i += CHUNK_SIZE) {
          const chunk = val.slice(i, i + CHUNK_SIZE)
          values.push({ val: chunk })
          placeholders.push(`:${values.length}`)
        }

        if (placeholders.length === 1) {
          return placeholders[0]
        }

        return placeholders.join(" || ")
      }
    }
  }

  values.push({ val })
  return `:${values.length}`
}

function concatParams(val1, val2) {
  return `${val1} || ${val2} || ""`
}

function getTableColumns(ctx, tableName) {
  const values = []
  const sqlParam = addSqlParameter(tableName.toUpperCase(), values)

  return executeQuery(
    ctx,
    `SELECT column_name FROM DBA_TAB_COLUMNS WHERE table_name = ${sqlParam};`,
    values,
  ).then((result) => {
    return result.map((row) => {
      return { column_name: row.column_name.toLowerCase() }
    })
  })
}

function getDocumentsWithChanges(ctx) {
  const values = []
  const table = addSqlParameter(cfgTableResult, values)
  const existingId = `SELECT id FROM ${cfgTableChanges} WHERE tenant=${table}.tenant AND id = ${table}.id AND ROWNUM <= 1`
  const sqlCommand = `SELECT * FROM ${cfgTableResult} WHERE EXISTS(${existingId})`

  return executeQuery(ctx, sqlCommand)
}

function getExpired(ctx, maxCount, expireSeconds) {
  const expireDate = new Date()

  const values = []
  const date = addSqlParameter(expireDate, values)
  const count = addSqlParameter(maxCount, values)
  const notExistingTenantAndId = `SELECT tenant, id FROM ${cfgTableChanges} WHERE ${cfgTableChanges}.tenant = ${cfgTableResult}.tenant AND ${cfgTableChanges}.id = ${cfgTableResult}.id AND ROWNUM <= 1`
  const sqlCommand = `SELECT * FROM ${cfgTableResult} WHERE last_open_date <= ${date} AND NOT EXISTS(${notExistingTenantAndId}) AND ROWNUM <= ${count}`

  return executeQuery(ctx, sqlCommand, values)
}

function getEmptyCallbacks(ctx) {
  const joinCondition = "ON t2.tenant = t1.tenant AND t2.id = t1.id AND t2.callback IS NULL"
  const sqlCommand = `SELECT DISTINCT t1.tenant, t1.id FROM ${cfgTableChanges} t1 INNER JOIN ${cfgTableResult} t2 ${joinCondition}`

  return executeQuery(ctx, sqlCommand)
}

async function upsert(ctx, task) {
  task.completeDefaults()
  const dateNow = new Date()
  const values = []

  let cbInsert = task.callback

  if (task.callback) {
    const userCallback = new connectorUtilities.UserCallback()
    userCallback.fromValues(task.userIndex, task.callback)
    cbInsert = userCallback.toSQLInsert()
  }

  const p0 = addSqlParameter(task.tenant, values)
  const p1 = addSqlParameter(task.key, values)
  const p2 = addSqlParameter(task.status, values)
  const p3 = addSqlParameter(task.statusInfo, values)
  const p4 = addSqlParameter(dateNow, values)
  const p5 = addSqlParameter(task.userIndex, values)
  const p6 = addSqlParameter(task.changeId, values)
  const p7 = addSqlParameter(cbInsert, values)
  const p8 = addSqlParameter(task.baseurl, values)
  const p9 = addSqlParameter(dateNow, values)

  let sqlCommand = `MERGE INTO ${cfgTableResult} USING dual ON (tenant = ${p0} AND id = ${p1}) `
  sqlCommand += `WHEN NOT MATCHED THEN INSERT (tenant, id, status, status_info, last_open_date, user_index, change_id, callback, baseurl) `
  sqlCommand += `VALUES (${p0}, ${p1}, ${p2}, ${p3}, ${p4}, ${p5}, ${p6}, ${p7}, ${p8}) `
  sqlCommand += `WHEN MATCHED THEN UPDATE SET last_open_date = ${p9}`

  if (task.callback) {
    const p10 = addSqlParameter(JSON.stringify(task.callback), values)
    sqlCommand += `, callback = CONCAT(callback , '${connectorUtilities.UserCallback.prototype.delimiter}{"userIndex":' , (user_index + 1) , ',"callback":', ${p10}, '}')`
  }

  if (task.baseurl) {
    const p11 = addSqlParameter(task.baseurl, values)
    sqlCommand += `, baseurl = ${p11}`
  }

  sqlCommand += ", user_index = user_index + 1"
  sqlCommand += ";"
  sqlCommand += `SELECT user_index FROM ${cfgTableResult} WHERE tenant = ${p0} AND id = ${p1};`

  const out = {}
  const result = await executeQuery(ctx, sqlCommand, values)

  if (result?.length > 0) {
    const first = result[0]
    out.isInsert = task.userIndex === first.user_index
    out.insertId = first.user_index
  }

  return out
}

/**
 * Generate SQL condition to check if a field is not empty
 * Dameng-specific: NCLOB cannot be compared with != operator
 * @param {string} fieldName - Name of the field to check
 * @returns {string} SQL condition string
 */
function getNotEmptyCondition(fieldName) {
  return `${fieldName} IS NOT NULL`
}

module.exports = {
  sqlQuery,
  closePool,
  healthCheck,
  addSqlParameter,
  concatParams,
  getTableColumns,
  getDocumentsWithChanges,
  getExpired,
  getEmptyCallbacks,
  upsert,
  getNotEmptyCondition,
}
