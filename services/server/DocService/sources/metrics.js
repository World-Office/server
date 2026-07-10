const client = require("prom-client")
const config = require("./../../Common/sources/config")

// Create a Registry which registers the metrics
const register = new client.Registry()

// Add a default labels which is added to all metrics
client.collectDefaultMetrics({ register })

// Custom metrics
const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 10],
  registers: [register],
})

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "code"],
  registers: [register],
})

const activeConnections = new client.Gauge({
  name: "active_connections",
  help: "Number of active connections",
  registers: [register],
})

const fileOperations = new client.Counter({
  name: "file_operations_total",
  help: "Total number of file operations",
  labelNames: ["operation", "status"],
  registers: [register],
})

const conversionOperations = new client.Counter({
  name: "conversions_total",
  help: "Total number of conversion operations",
  labelNames: ["format", "status"],
  registers: [register],
})

const conversionDuration = new client.Histogram({
  name: "conversion_duration_seconds",
  help: "Duration of conversion operations in seconds",
  labelNames: ["format"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [register],
})

const memoryUsage = new client.Gauge({
  name: "nodejs_memory_usage_bytes",
  help: "Node.js memory usage in bytes",
  labelNames: ["type"],
  registers: [register],
})

const eventLoopLag = new client.Gauge({
  name: "nodejs_eventloop_lag_seconds",
  help: "Node.js event loop lag in seconds",
  registers: [register],
})

// Update memory metrics periodically
setInterval(() => {
  const memoryUsageData = process.memoryUsage()
  memoryUsage.set({ type: "rss" }, memoryUsageData.rss)
  memoryUsage.set({ type: "heapTotal" }, memoryUsageData.heapTotal)
  memoryUsage.set({ type: "heapUsed" }, memoryUsageData.heapUsed)
  memoryUsage.set({ type: "external" }, memoryUsageData.external)
}, 5000)

// Update event loop lag periodically
setInterval(() => {
  const start = process.hrtime()
  setImmediate(() => {
    const delta = process.hrtime(start)
    const lag = delta[0] + delta[1] / 1e9
    eventLoopLag.set(lag)
  })
}, 1000)

module.exports = {
  register,
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
  activeConnections,
  fileOperations,
  conversionOperations,
  conversionDuration,
  incrementActiveConnections: () => activeConnections.inc(),
  decrementActiveConnections: () => activeConnections.dec(),
  incrementFileOperation: (operation, status) => fileOperations.labels(operation, status).inc(),
  incrementConversion: (format, status) => conversionOperations.labels(format, status).inc(),
  observeConversionDuration: (format, duration) =>
    conversionDuration.labels(format).observe(duration),
  observeHttpRequest: (method, route, code, duration) => {
    httpRequestDurationMicroseconds.labels(method, route, code).observe(duration)
    httpRequestsTotal.labels(method, route, code).inc()
  },
}
