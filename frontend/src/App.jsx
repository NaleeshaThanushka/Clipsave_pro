import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioLines, ArrowDownToLine, Check, ChevronDown, CircleHelp, Clock3, Download, Film, Headphones, Link2, LoaderCircle, Music2, Pause, Play, ShieldCheck, Sparkles, Scissors, Settings2, Shield, Zap, X, Youtube, Instagram, Facebook, AudioWaveform } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const api = axios.create({ baseURL: API_BASE, timeout: 120000 });
const socketUrl = API_BASE || window.location.origin;
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '--:--';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
};
const prettySize = (bytes) => bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function App() {
  const [url, setUrl] = useState('');
  const [media, setMedia] = useState(null);
  const [format, setFormat] = useState('mp3');
  const [quality, setQuality] = useState('1080');
  const [bitrate, setBitrate] = useState('320');
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('00:30');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !job?.jobId) return;
    const onProgress = (next) => setJob((old) => old?.jobId === next.id ? { ...old, ...next } : old);
    const onComplete = (next) => {
      setJob((old) => old?.jobId === next.id ? { ...old, ...next } : old);
      setHistory((old) => [{ id: next.id, title: media?.title || 'Converted media', format, date: new Date(), status: 'Ready', filename: next.filename, downloadUrl: next.downloadUrl }, ...old].slice(0, 5));
    };
    const onError = (next) => setJob((old) => old?.jobId === next.id ? { ...old, ...next } : old);
    socket.emit('job:subscribe', job.jobId);
    socket.on('job:progress', onProgress);
    socket.on('job:complete', onComplete);
    socket.on('job:error', onError);
    return () => { socket.off('job:progress', onProgress); socket.off('job:complete', onComplete); socket.off('job:error', onError); };
  }, [job?.jobId, media?.title, format]);

  const validUrl = useMemo(() => /^https?:\/\//i.test(url.trim()), [url]);

  async function analyze(event) {
    event?.preventDefault();
    if (!validUrl) { setError('Paste a valid public video URL to get started.'); return; }
    setError(''); setLoadingPreview(true); setMedia(null); setJob(null);
    try {
      const { data } = await api.post('/api/preview', { url: url.trim() });
      setMedia(data);
      setStartTime('00:00');
      setEndTime(formatTime(data.duration || 30));
    } catch (err) { setError(err.response?.data?.error || 'Could not read this link. Check that it is public and supported.'); }
    finally { setLoadingPreview(false); }
  }

  async function startConversion() {
    if (!media) return;
    setError(''); setJob({ status: 'queued', percent: 0, stage: 'queued' });
    try {
      const { data } = await api.post('/api/jobs', { url: media.webpageUrl || url.trim(), format, quality, bitrate: Number(bitrate), startTime: trimEnabled ? startTime : '', endTime: trimEnabled ? endTime : '' });
      setJob({ jobId: data.jobId, status: data.status, percent: 0, stage: 'queued' });
    } catch (err) { setError(err.response?.data?.error || 'Could not start conversion. Please try again.'); setJob(null); }
  }

  function handleDrop(event) {
    event.preventDefault(); setDragActive(false);
    const dropped = event.dataTransfer.getData('text/plain');
    if (dropped) setUrl(dropped.trim());
  }

  function downloadFile(downloadUrl) {
    if (!downloadUrl) {
      setError('The download link is not ready yet. Please wait for conversion to finish.');
      return;
    }

    // Use a real browser navigation link. The API responds with
    // Content-Disposition: attachment, so the browser saves the file
    // instead of rendering the MP3/MP4 in the current tab.
    const target = new URL(downloadUrl, API_BASE || window.location.origin).toString();
    const link = document.createElement('a');
    link.href = target;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const isWorking = job && ['queued', 'processing'].includes(job.status);
  const done = job?.status === 'complete';
  const progressLabel = job?.stage === 'processing' ? 'Finishing your file' : job?.stage === 'queued' ? 'Getting things ready' : 'Converting your media';

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar page-width">
      <a href="#top" className="brand" aria-label="ClipSave Pro home"><span className="brand-icon"><AudioWaveform size={22} strokeWidth={2.4} /></span><span>ClipSave<span className="brand-pro"> Pro</span></span></a>
      <nav className="nav-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><button className="nav-help" onClick={() => setShowFaq(true)}><CircleHelp size={16}/> Help</button></nav>
      <div className="safe-pill"><span className="safe-dot"/> Private by design</div>
    </header>

    <main id="top" className="page-width">
      <section className="hero">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }} className="hero-copy">
          <div className="eyebrow"><Sparkles size={14}/> YOUR MEDIA, YOUR WAY</div>
          <h1>Save the moments.<br/><span>Keep the quality.</span></h1>
          <p className="hero-subtitle">Convert videos you have permission to download into MP3 audio or MP4 video — with the quality and clip length you choose.</p>
          <div className="hero-trust"><span><ShieldCheck size={16}/> No account needed</span><i/><span><Zap size={16}/> Fast processing</span><i/><span><Shield size={16}/> Temporary files</span></div>
        </motion.div>

        <motion.div className="converter-card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .12 }}>
          <div className="card-heading"><div><div className="card-title">Start converting</div><div className="card-subtitle">Paste a public video link below</div></div><div className="supported-icons" aria-label="Supported platforms"><span title="YouTube"><Youtube size={17}/></span><span title="TikTok" className="tiktok-mark">♪</span><span title="Instagram"><Instagram size={16}/></span><span title="Facebook"><Facebook size={16}/></span></div></div>
          <form onSubmit={analyze}>
            <label className={`url-box ${dragActive ? 'drag-active' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
              <Link2 size={19} className="url-icon"/><input aria-label="Video URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste your video link here..." type="url" />
              {url && <button type="button" className="clear-url" aria-label="Clear URL" onClick={() => { setUrl(''); setMedia(null); setError(''); }}><X size={16}/></button>}
            </label>
            <button className="analyze-btn" type="submit" disabled={loadingPreview || !url.trim()}>{loadingPreview ? <><LoaderCircle size={17} className="spin"/> Analyzing link...</> : <>Analyze link <span>→</span></>}</button>
          </form>
          <div className="url-hint"><span className="hint-lock"><ShieldCheck size={13}/></span> Only use links to content you own or are allowed to download.</div>
          <AnimatePresence>{error && <motion.div className="error-message" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><X size={15}/>{error}</motion.div>}</AnimatePresence>

          <AnimatePresence>{media && <motion.div className="media-result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <div className="result-divider"><span>VIDEO FOUND</span><span className="found-check"><Check size={12}/> Ready to convert</span></div>
            <div className="media-summary">{media.thumbnail ? <img className="video-thumb" src={media.thumbnail} alt="Video thumbnail" referrerPolicy="no-referrer"/> : <div className="video-thumb thumb-fallback"><Film size={30}/></div>}<div className="media-info"><div className="media-title" title={media.title}>{media.title}</div><div className="media-meta"><span>{media.uploader}</span><i/>{media.duration ? <span><Clock3 size={12}/>{formatTime(media.duration)}</span> : <span>Duration unknown</span>}</div></div></div>
            <div className="format-label">CHOOSE YOUR FORMAT</div>
            <div className="format-switch" role="tablist" aria-label="Output format"><button role="tab" aria-selected={format === 'mp3'} className={format === 'mp3' ? 'active' : ''} onClick={() => setFormat('mp3')}><Music2 size={17}/><span>MP3 Audio</span><small>Audio only</small></button><button role="tab" aria-selected={format === 'mp4'} className={format === 'mp4' ? 'active' : ''} onClick={() => setFormat('mp4')}><Film size={17}/><span>MP4 Video</span><small>Video + audio</small></button></div>
            {format === 'mp3' ? <div className="option-row"><label htmlFor="bitrate">Audio quality</label><div className="select-wrap"><select id="bitrate" value={bitrate} onChange={(e) => setBitrate(e.target.value)}><option value="128">128 kbps · Standard</option><option value="192">192 kbps · High</option><option value="256">256 kbps · Very high</option><option value="320">320 kbps · Best</option></select><ChevronDown size={15}/></div></div> : <div className="option-row"><label htmlFor="quality">Video quality</label><div className="select-wrap"><select id="quality" value={quality} onChange={(e) => setQuality(e.target.value)}><option value="360">360p · Low</option><option value="480">480p · SD</option><option value="720">720p · HD</option><option value="1080">1080p · Full HD</option></select><ChevronDown size={15}/></div></div>}
            <div className="trim-panel">
              <div className="trim-header"><div className="trim-icon"><Scissors size={15}/></div><div className="trim-title-wrap"><div className="trim-title">Trim {format === 'mp3' ? 'audio' : 'video'}</div><div className="trim-subtitle">Download just the section you need</div></div><button className={`toggle ${trimEnabled ? 'on' : ''}`} role="switch" aria-checked={trimEnabled} aria-label="Enable trimming" onClick={() => setTrimEnabled(!trimEnabled)}><span/></button></div>
              <AnimatePresence>{trimEnabled && <motion.div className="trim-controls" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><div className="time-inputs"><label>Start time<input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="00:00" aria-label="Trim start time"/></label><span className="time-arrow">→</span><label>End time<input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="01:30" aria-label="Trim end time"/></label></div><div className="waveform" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <span key={i} style={{ height: `${14 + ((i * 19 + 13) % 31)}%` }}/>)}</div><div className="trim-tip"><AudioLines size={13}/> Format: MM:SS or HH:MM:SS</div></motion.div>}</AnimatePresence>
            </div>
            {isWorking ? <div className="progress-card"><div className="progress-top"><span><LoaderCircle size={15} className="spin"/>{progressLabel}</span><strong>{Math.round(job.percent || 0)}%</strong></div><div className="progress-track"><motion.div className="progress-fill" animate={{ width: `${Math.max(3, job.percent || 0)}%` }} transition={{ duration: .3 }}/></div><div className="progress-bottom"><span>{job.speed || 'Preparing media...'}</span><span>{job.eta ? `ETA ${job.eta}` : 'Please keep this tab open'}</span></div></div> : done ? <div className="complete-card"><div className="complete-icon"><Check size={17}/></div><div className="complete-copy"><strong>Your file is ready</strong><span>{job.filename || 'Conversion complete'}</span></div><button className="download-ready" onClick={() => downloadFile(job.downloadUrl)}><Download size={16}/> Download</button></div> : <button className="download-btn" onClick={startConversion}><span className="download-btn-icon"><ArrowDownToLine size={18}/></span> Convert & Download <span className="btn-format">{format.toUpperCase()}</span></button>}
            {job?.status === 'error' && <div className="error-message job-error"><X size={15}/>{job.error || 'Conversion failed. Please try another link.'}<button onClick={() => setJob(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
          </motion.div>}</AnimatePresence>
        </motion.div>
      </section>

      <section className="feature-strip" id="features"><div className="feature-item"><span className="feature-icon purple"><Headphones size={19}/></span><div><strong>MP3 & MP4</strong><p>Choose your format</p></div></div><div className="feature-item"><span className="feature-icon blue"><Film size={19}/></span><div><strong>Up to 1080p</strong><p>When source supports it</p></div></div><div className="feature-item"><span className="feature-icon pink"><Scissors size={19}/></span><div><strong>Precision trim</strong><p>Pick your exact clip</p></div></div><div className="feature-item"><span className="feature-icon green"><ShieldCheck size={19}/></span><div><strong>Auto-cleanup</strong><p>Temporary files expire</p></div></div></section>

      <section className="how-section" id="how-it-works"><div className="section-heading"><div className="eyebrow"><Sparkles size={13}/> SIMPLE BY DESIGN</div><h2>Three steps. <span>That's it.</span></h2><p>From a link to a file in just a few clicks.</p></div><div className="steps-grid"><div className="step-card"><span className="step-number">01</span><div className="step-icon"><Link2 size={22}/></div><h3>Paste your link</h3><p>Copy a supported public video URL and paste it into the converter.</p></div><div className="step-card"><span className="step-number">02</span><div className="step-icon"><Settings2 size={22}/></div><h3>Choose your settings</h3><p>Pick MP3 or MP4, select quality, and trim the part you want.</p></div><div className="step-card"><span className="step-number">03</span><div className="step-icon"><Download size={22}/></div><h3>Convert & save</h3><p>Watch the progress and download your converted file when it's ready.</p></div></div></section>

      {history.length > 0 && <section className="history-section"><div className="history-heading"><div><h2>Recent conversions</h2><p>This list is stored in this tab only.</p></div><button onClick={() => setHistory([])} className="clear-history">Clear history</button></div>{history.map((item) => <div className="history-item" key={item.id}><div className="history-file-icon">{item.format === 'mp3' ? <Music2 size={17}/> : <Film size={17}/>}</div><div className="history-details"><strong>{item.title}</strong><span>{item.format.toUpperCase()} · {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><span className="history-ready"><Check size={13}/> Ready</span><button className="history-download" onClick={() => downloadFile(item.downloadUrl)} aria-label={`Download ${item.title}`}><Download size={16}/></button></div>)}</section>}

      <section className="notice-card"><div className="notice-icon"><ShieldCheck size={19}/></div><div><strong>Use media responsibly</strong><p>Only download content you own or have permission to use. Availability depends on each platform's terms and the source's accessible formats. ClipSave Pro does not bypass private access controls or DRM.</p></div></section>
      <footer className="footer"><a href="#top" className="brand footer-brand"><span className="brand-icon"><AudioWaveform size={18}/></span><span>ClipSave<span className="brand-pro"> Pro</span></span></a><span>Made for your media workflow.</span><button onClick={() => setShowFaq(true)}>FAQ & support</button><span className="copyright">© {new Date().getFullYear()} ClipSave Pro</span></footer>
    </main>

    <AnimatePresence>{showFaq && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowFaq(false)}><motion.div className="faq-modal glass" initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowFaq(false)} aria-label="Close FAQ"><X size={19}/></button><div className="eyebrow"><CircleHelp size={14}/> QUICK HELP</div><h2>Frequently asked questions</h2><div className="faq-entry"><strong>Why didn't a link work?</strong><p>Platforms may change their systems or block a format. The link must be public, supported, and accessible without signing in.</p></div><div className="faq-entry"><strong>Will every video download in 1080p?</strong><p>No. The output can only use quality the source makes available. The converter cannot increase the original resolution.</p></div><div className="faq-entry"><strong>Can I trim both formats?</strong><p>Yes. Turn on Trim before converting and enter start and end times. The output will contain only that range.</p></div><div className="faq-entry"><strong>How long are files kept?</strong><p>Temporary files are removed after download or when their 30-minute expiry is reached.</p></div><div className="faq-entry"><strong>Is downloading allowed?</strong><p>Only use this tool for media you own or are authorized to download. Follow the source platform's terms and applicable copyright laws.</p></div><button className="analyze-btn modal-done" onClick={() => setShowFaq(false)}>Got it</button></motion.div></motion.div>}</AnimatePresence>
  </div>;
}
