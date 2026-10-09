import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { previewMedia, validateMediaUrl, validateOptions, createMediaFile, openDownload, removeFile, cleanupDownloads } from './media.js';

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT || 5000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const io = new Server(server, { cors: { origin: frontendOrigin, methods: ['GET', 'POST'] } });
const jobs = new Map();
const files = new Map();
const active = new Set();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: frontendOrigin }));
app.use(express.json({ limit: '16kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 25, standardHeaders: true, legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ClipSave Pro API' }));

app.post('/api/preview', async (req, res) => {
  try {
    const url = validateMediaUrl(req.body?.url);
    const info = await previewMedia(url);
    res.json(info);
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.post('/api/jobs', async (req, res) => {
  let url;
  let options;
  try {
    url = validateMediaUrl(req.body?.url);
    options = validateOptions(req.body ?? {});
  } catch (error) { return res.status(400).json({ error: safeMessage(error) }); }
  const maxActive = Math.max(1, Number(process.env.MAX_ACTIVE_JOBS || 2));
  if (active.size >= maxActive) return res.status(429).json({ error: `The converter is busy. Please wait for one of the ${maxActive} active jobs to finish.` });

  const id = randomUUID();
  const job = { id, status: 'queued', percent: 0, stage: 'queued', speed: null, eta: null, createdAt: Date.now(), error: null, downloadUrl: null, filename: null };
  jobs.set(id, job);
  active.add(id);
  res.status(202).json({ jobId: id, status: job.status });
  runJob(job, { url, options }).catch(() => {});
});

async function runJob(job, payload) {
  const controller = new AbortController();
  job.controller = controller;
  job.status = 'processing';
  emitProgress(job);
  try {
    const output = await createMediaFile({ ...payload, signal: controller.signal, onProgress: (update) => {
      Object.assign(job, update);
      job.status = update.stage === 'complete' ? 'complete' : 'processing';
      emitProgress(job);
    }});
    files.set(output.token, { ...output, createdAt: Date.now(), consumed: false });
    job.status = 'complete';
    job.percent = 100;
    job.filename = output.filename;
    job.downloadUrl = `${process.env.PUBLIC_BASE_URL || `http://localhost:${port}`}/api/files/${output.token}`;
    job.completedAt = Date.now();
    emitProgress(job);
    io.to(job.id).emit('job:complete', publicJob(job));
  } catch (error) {
    job.status = 'error';
    job.error = safeMessage(error);
    emitProgress(job);
    io.to(job.id).emit('job:error', publicJob(job));
  } finally {
    active.delete(job.id);
    delete job.controller;
  }
}

function publicJob(job) {
  return { id: job.id, status: job.status, percent: job.percent, stage: job.stage, speed: job.speed, eta: job.eta, error: job.error, downloadUrl: job.downloadUrl, filename: job.filename };
}
function emitProgress(job) { io.to(job.id).emit('job:progress', publicJob(job)); }
function safeMessage(error) {
  const message = String(error?.message || 'Something went wrong.');
  if (/spawn (yt-dlp|ffmpeg) ENOENT/i.test(message)) return 'The server needs yt-dlp and FFmpeg installed and available on PATH.';
  return message.slice(0, 600);
}

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found. History is kept in memory and clears on server restart.' });
  res.json(publicJob(job));
});

app.get('/api/files/:token', async (req, res) => {
  const file = files.get(req.params.token);
  if (!file) return res.status(404).json({ error: 'This download has expired or does not exist.' });
  try {
    await fs.access(file.path);
    res.setHeader('Content-Type', file.format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', String(file.size));
    const stream = openDownload(file.path);
    stream.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });
    stream.pipe(res);
    res.on('finish', () => {
      file.consumed = true;
      setTimeout(async () => { await removeFile(file.path); files.delete(req.params.token); }, 5_000).unref();
    });
  } catch { files.delete(req.params.token); res.status(404).json({ error: 'This download has expired or does not exist.' }); }
});

io.on('connection', (socket) => {
  socket.on('job:subscribe', (jobId) => {
    if (typeof jobId !== 'string' || !jobs.has(jobId)) return;
    socket.join(jobId);
    socket.emit('job:progress', publicJob(jobs.get(jobId)));
  });
});

app.use((error, _req, res, _next) => {
  console.error('Request error:', error?.message || error);
  if (!res.headersSent) res.status(500).json({ error: 'Unexpected server error.' });
});

setInterval(async () => {
  await cleanupDownloads();
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff && !active.has(id)) jobs.delete(id);
  for (const [token, file] of files) if (file.createdAt < Date.now() - Number(process.env.FILE_TTL_MINUTES || 30) * 60_000) { await removeFile(file.path); files.delete(token); }
}, 60_000).unref();

server.listen(port, () => console.log(`ClipSave Pro API listening on http://localhost:${port}`));
