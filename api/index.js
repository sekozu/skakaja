import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as arnime from './arnime/index.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cache = new Map();
const CACHE_KEY = 'botak';

const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const c = async (key, fn) => {
  const hit = cache.get(key);
  if (hit) {
    hit.hits = (hit.hits || 0) + 1;
    return hit.data;
  }
  const data = await fn();
  cache.set(key, { time: Date.now(), data, hits: 0 });
  return data;
};

router.get('/api/home', async (req, res) => {
  res.json(await c('home', () => arnime.getHome()));
});

router.get('/api/latest', async (req, res) => {
  res.json(await c('latest', () => arnime.getLatest()));
});

router.get('/api/anime/:id', async (req, res) => {
  res.json(await c(`anime:${req.params.id}`, () => arnime.getAnimeDetail(req.params.id)));
});

router.get('/api/search', async (req, res) => {
  const { q, page, ...filter } = req.query;
  const data = await c(`search:${JSON.stringify({ q, page, filter })}`, () => arnime.getSearch(q, page, filter));
  res.status(data.status ? 200 : data.code || 500).json(data);
});

router.get('/api/kategori', async (req, res) => {
  res.json(await c(`kategori:${JSON.stringify(req.query)}`, () => arnime.getKategori(req.query)));
});

router.get('/api/filter', async (req, res) => {
  res.json(await c('filter', () => arnime.getFilter()));
});

router.get('/api/popular', async (req, res) => {
  res.json(await c('populer', () => arnime.getPopuler()));
});

router.get('/api/watch/:id', async (req, res) => {
  const ep = req.query.ep || 1;
  res.json(await c(`watch:${req.params.id}:${ep}`, () => arnime.getVideoPlayer(req.params.id, ep)));
});

router.get('/api/jadwal', async (req, res) => {
  res.json(await c('jadwal', () => arnime.getSchedule()));
});

router.get('/cache', (req, res) => {
  const now = Date.now();
  const list = [];
  let totalBytes = 0;
  
  for (const [key, v] of cache) {
    const bytes = JSON.stringify(v.data).length;
    totalBytes += bytes;
    
    let sizeStr;
    if (bytes < 1024) {
      sizeStr = `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      sizeStr = `${(bytes / 1024).toFixed(2)} KB`;
    } else {
      sizeStr = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    list.push({
      key,
      size: sizeStr,
      age: fmt(now - v.time) + ' yang lalu',
      hits: v.hits || 0,
    });
  }
  
  // Format total size
  let totalSizeStr;
  if (totalBytes < 1024) {
    totalSizeStr = `${totalBytes} B`;
  } else if (totalBytes < 1024 * 1024) {
    totalSizeStr = `${(totalBytes / 1024).toFixed(2)} KB`;
  } else {
    totalSizeStr = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  
  res.json({ 
    total: list.length, 
    total_size: totalSizeStr,
    data: list 
  });
});

router.get('/cache/clear', (req, res) => {
  if (req.query.key !== CACHE_KEY) {
    if (req.query.key) return res.redirect('/cache/clear?error=1');
    return res.sendFile(path.join(__dirname, 'locked.html'));
  }
  const total = cache.size;
  cache.clear();
  res.json({ status: true, message: `Cache cleared (${total} key)`, cleared: total });
});

export default router;