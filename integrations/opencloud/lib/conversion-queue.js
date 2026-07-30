/**
 * Conversion Queue — in-memory job tracking for document conversions.
 *
 * Jobs flow: queued → processing → done / error
 * Results are stored temporarily in data/conversions/ for download.
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// ── Constants ─────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'conversions');
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// ── Job statuses ──────────────────────────────────────────────────────

const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  DONE: 'done',
  ERROR: 'error',
};

// ── In-memory store ───────────────────────────────────────────────────

const jobs = new Map();
let nextId = 1;

// ── Periodic cleanup ──────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === JOB_STATUS.DONE || job.status === JOB_STATUS.ERROR) {
      if (now - job.completedAt > MAX_AGE_MS) {
        jobs.delete(id);
        // Clean up temp files
        if (job.sourcePath) {
          fs.unlink(job.sourcePath).catch(() => {});
        }
        if (job.resultPath) {
          fs.unlink(job.resultPath).catch(() => {});
        }
      }
    }
  }
}, CLEANUP_INTERVAL_MS);

// ── Job class ─────────────────────────────────────────────────────────

class ConversionJob {
  constructor(sourceFormat, targetFormat, sourcePath, originalName) {
    this.id = String(nextId++);
    this.status = JOB_STATUS.QUEUED;
    this.sourceFormat = sourceFormat;
    this.targetFormat = targetFormat;
    this.sourcePath = sourcePath;
    this.originalName = originalName;
    this.resultPath = null;
    this.error = null;
    this.durationMs = 0;
    this.createdAt = Date.now();
    this.completedAt = null;
  }
}

// ── Queue operations ─────────────────────────────────────────────────

/**
 * Create a new conversion job.
 *
 * @param {string} sourceFormat
 * @param {string} targetFormat
 * @param {string} sourcePath - path to uploaded file
 * @param {string} originalName - original filename for display
 * @returns {ConversionJob}
 */
async function createJob(sourceFormat, targetFormat, sourcePath, originalName) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const job = new ConversionJob(sourceFormat, targetFormat, sourcePath, originalName);
  jobs.set(job.id, job);
  return job;
}

/**
 * Get a job by ID.
 */
function getJob(id) {
  return jobs.get(id) || null;
}

/**
 * List all jobs, newest first.
 */
function listJobs(limit = 50) {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Update job status to processing.
 */
function markProcessing(id) {
  const job = jobs.get(id);
  if (job) job.status = JOB_STATUS.PROCESSING;
  return job;
}

/**
 * Update job status to done.
 */
function markDone(id, resultPath, durationMs) {
  const job = jobs.get(id);
  if (job) {
    job.status = JOB_STATUS.DONE;
    job.resultPath = resultPath;
    job.durationMs = durationMs;
    job.completedAt = Date.now();
  }
  return job;
}

/**
 * Update job status to error.
 */
function markError(id, error, durationMs) {
  const job = jobs.get(id);
  if (job) {
    job.status = JOB_STATUS.ERROR;
    job.error = error;
    job.durationMs = durationMs;
    job.completedAt = Date.now();
  }
  return job;
}

/**
 * Serialize a job for API responses (strip internal paths).
 */
function serializeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    sourceFormat: job.sourceFormat,
    targetFormat: job.targetFormat,
    originalName: job.originalName,
    error: job.error,
    durationMs: job.durationMs,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    hasResult: job.status === JOB_STATUS.DONE,
  };
}

module.exports = {
  JOB_STATUS,
  createJob,
  getJob,
  listJobs,
  markProcessing,
  markDone,
  markError,
  serializeJob,
};
