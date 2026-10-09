import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
const DOWNLOAD_DIR = path.resolve('downloads');
const ALLOWED_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  'instagram.com', 'www.instagram.com', 'm.instagram.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'web.facebook.com'
]);

export function validateMediaUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Enter a valid video URL (maximum 2048 characters).');
  let url;
  try { url = new URL(raw); } catch { throw new Error('That URL does not look valid.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (url.username || url.password) throw new Error('URLs containing embedded credentials are not allowed.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!ALLOWED_HOSTS.has(hostname)) throw new Error('Supported sites: YouTube, TikTok, Instagram and Facebook.');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || /^\d+(\.\d+){3}$/.test(hostname) || hostname.includes(':')) {
    throw new Error('Local and IP-address URLs are not allowed.');
  }
  return url.href;
}

function runYtDlp(args, options = {}) {
  return execFileAsync('yt-dlp', args, { timeout: options.timeout ?? 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}

export async function previewMedia(rawUrl) {
  const url = validateMediaUrl(rawUrl);
  const { stdout } = await runYtDlp(['--dump-single-json', '--no-playlist', '--no-warnings', '--skip-download', '--socket-timeout', '15', url]);
  const info = JSON.parse(stdout);
  return {
    id: String(info.id ?? ''),
    title: String(info.title ?? 'Untitled video').slice(0, 300),
    thumbnail: typeof info.thumbnail === 'string' && /^https:\/\//.test(info.thumbnail) ? info.thumbnail : null,
    duration: Number.isFinite(info.duration) ? info.duration : null,
    uploader: String(info.uploader ?? info.channel ?? 'Unknown creator').slice(0, 120),
    webpageUrl: url,
    formats: ['mp3', 'mp4']
  };
}

function parseTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{1,3}(:\d{1,2}){1,2}$/.test(value)) throw new Error('Use a time such as 01:25 or 00:01:25.');
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0) || parts.slice(1).some((part) => part >= 60)) throw new Error('Time values must be valid and non-negative.');
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function validateOptions(body) {
  const format = body.format === 'mp3' ? 'mp3' : body.format === 'mp4' ? 'mp4' : null;
  if (!format) throw new Error('Choose MP3 or MP4.');
  const start = parseTime(body.startTime);
  const end = parseTime(body.endTime);
  if ((start === null) !== (end === null)) throw new Error('Enter both start and end times to trim.');
  if (start !== null && (end <= start || end - start > 6 * 60 * 60)) throw new Error('End time must be after start time; trim length is limited to six hours.');
  const bitrate = [128, 192, 256, 320].includes(Number(body.bitrate)) ? Number(body.bitrate) : 192;
  const quality = ['360', '480', '720', '1080'].includes(String(body.quality)) ? String(body.quality) : '1080';
  return { format, start, end, bitrate, quality };
}

export async function createMediaFile({ url: rawUrl, options, onProgress, signal }) {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  const url = validateMediaUrl(rawUrl);
  const token = randomUUID();
  const sourcePath = path.join(DOWNLOAD_DIR, `${token}.source.%(ext)s`);
  const finalPath = path.join(DOWNLOAD_DIR, `${token}.${options.format}`);
  const formatSelector = options.format === 'mp3'
    ? 'bestaudio/best'
    : `bestvideo[height<=${options.quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${options.quality}][ext=mp4]/best[height<=${options.quality}]`;
  const args = ['--newline', '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--retries', '2', '--max-filesize', `${process.env.MAX_DOWNLOAD_MB || 1024}M`, '-f', formatSelector, '-o', sourcePath];
  if (options.format === 'mp4') args.push('--merge-output-format', 'mp4');
  args.push(url);

  const child = await new Promise((resolve, reject) => {
    const proc = (awaitImportSpawn())('yt-dlp', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let buffer = '';
    const abort = () => proc.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
      for (const line of lines) {
        const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%.*?(?:at\s+([^ ]+\/s))?.*?(?:ETA\s+([^ ]+))?/);
        if (match) onProgress({ percent: Math.min(99, Number(match[1])), speed: match[2] ?? null, eta: match[3] ?? null, stage: 'downloading' });
        else if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) onProgress({ percent: 99, stage: 'processing' });
      }
    });
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new Error('Conversion cancelled.'));
      if (code !== 0) return reject(new Error(stderr.split('\n').filter(Boolean).slice(-3).join(' ') || `yt-dlp exited with code ${code}`));
      resolve();
    });
  });
  void child;

  const files = await fs.readdir(DOWNLOAD_DIR);
  const source = files.filter((name) => name.startsWith(`${token}.source.`)).map((name) => path.join(DOWNLOAD_DIR, name))[0];
  if (!source) throw new Error('The media source file was not created. The platform may not provide a compatible format.');
  try {
    const trimArgs = ['-y'];
    if (options.start !== null) trimArgs.push('-ss', String(options.start));
    trimArgs.push('-i', source);
    if (options.start !== null && options.end !== null) trimArgs.push('-t', String(options.end - options.start));
    if (options.format === 'mp3') {
      trimArgs.push('-vn', '-codec:a', 'libmp3lame', '-b:a', `${options.bitrate}k`, finalPath);
    } else {
      trimArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', finalPath);
    }
    await execFileAsync('ffmpeg', trimArgs, { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const stat = await fs.stat(finalPath);
    if (!stat.size) throw new Error('The converted file is empty.');
    onProgress({ percent: 100, stage: 'complete' });
    return { token, path: finalPath, filename: `clipsave-${token.slice(0, 8)}.${options.format}`, size: stat.size, format: options.format };
  } finally {
    await fs.rm(source, { force: true }).catch(() => {});
  }
}

// Kept as a function to make the child-process dependency explicit and easy to test.
function awaitImportSpawn() {
  return spawn;
}
import { spawn } from 'node:child_process';

export function openDownload(filePath) { return createReadStream(filePath); }
export async function removeFile(filePath) { await fs.rm(filePath, { force: true }).catch(() => {}); }
export async function cleanupDownloads() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  const cutoff = Date.now() - Number(process.env.FILE_TTL_MINUTES || 30) * 60_000;
  for (const name of await fs.readdir(DOWNLOAD_DIR)) {
    if (name === '.gitkeep') continue;
    const file = path.join(DOWNLOAD_DIR, name);
    try { const stat = await fs.stat(file); if (stat.mtimeMs < cutoff) await fs.rm(file, { recursive: true, force: true }); } catch {}
  }
}
