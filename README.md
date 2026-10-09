# ClipSave Pro

A runnable React + Vite frontend and Node.js/Express backend for converting media the user owns or is authorized to download. It supports public video URLs from YouTube, TikTok, Instagram and Facebook when permitted by the source platform, MP3/MP4 output, up to 1080p source quality, optional start/end trimming, Socket.IO progress, and temporary output cleanup.

## Requirements
- Node.js 20+
- FFmpeg and FFprobe installed and available on PATH
- yt-dlp installed and available on PATH (`yt-dlp --version`)

The backend invokes `yt-dlp` with `execFile` (never a shell), validates URL schemes and allowed hostnames, rejects private/local destinations, limits input length and request rate, and only handles publicly accessible URLs. Do not add cookie scraping, DRM bypass, or access-control circumvention. Respect platform terms and copyright.

## Run locally
1. Install FFmpeg and yt-dlp using their official instructions for your OS.
2. From this directory run:
   ```bash
   npm install
   npm run install:all
   ```
3. Copy `backend/.env.example` to `backend/.env` and adjust values if needed.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:5000`.

## How it works
- `POST /api/preview` returns metadata for a supported, publicly accessible URL.
- `POST /api/jobs` starts a conversion and returns a job ID.
- Socket.IO emits `job:progress`, `job:complete`, and `job:error` events. The UI subscribes to the job ID.
- `GET /api/jobs/:id` reports current status.
- `GET /api/files/:token` streams a completed file with `Content-Disposition: attachment`, so clicking Download saves it to the user’s device instead of opening it in the tab; the server schedules deletion after the response completes. Unclaimed files are deleted after 30 minutes.
- The history is in-memory only; restarting the server clears it.

## Deployment notes
- Deploy the frontend as a static Vite site (for example Vercel) with `VITE_API_BASE_URL` pointing to your backend URL.
- Deploy the backend on a host that permits FFmpeg and yt-dlp binaries and supports long-running jobs plus WebSockets. Set `FRONTEND_ORIGIN` to your frontend origin and `PUBLIC_BASE_URL` to the backend URL.
- Persistent disks are not required for this in-memory starter, but temporary downloads require writable disk space. Many serverless hosts are unsuitable for long media jobs.
- Free hosts may sleep, limit CPU/runtime, or disallow media downloading. Check current provider rules and quotas.
- Use HTTPS in production, restrict CORS to your site, configure a reverse proxy/body/time limit, and consider a durable queue, worker isolation, disk quotas, and persistent job storage before public launch.

## API environment
See `backend/.env.example`. The backend defaults to port 5000 and permits the Vite dev origin on localhost.

## Notes
- MP4 quality is capped at 1080p where the source exposes that quality; it cannot improve the original quality.
- MP3 bitrate is selectable up to 320 kbps; re-encoding cannot restore audio detail absent from the source.
- Trimming requires both start and end times in `HH:MM:SS` or `MM:SS` format, with end greater than start.
- This is a starter project, not a guarantee that every social-media URL will work. Platforms change their systems and may disallow downloading. Only use it with content you have permission to download.

## Run the backend in Docker
From the project root, run `docker compose up --build`. This starts the API and installs FFmpeg/yt-dlp inside the image. Run the frontend locally in a separate terminal using `npm run dev --prefix frontend`. For a public deployment, update `FRONTEND_ORIGIN` and `PUBLIC_BASE_URL` to your HTTPS domains.
