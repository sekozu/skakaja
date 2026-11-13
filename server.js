import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as arnime from './api/arnime/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1111;

// ==========================================
// 🌐 ENDPOINT API
// ==========================================

app.get('/api/latest', async (req, res) => {
  const data = await arnime.getLatest();
  res.json(data);
});

app.get('/api/anime/:id', async (req, res) => {
  const data = await arnime.getAnimeDetail(req.params.id);
  res.json(data);
});

app.get('/api/kategori', async (req, res) => {
  const data = await arnime.getKategori(req.query);
  res.json(data);
});

app.get('/api/popular', async (req, res) => {
  res.json(await arnime.getPopuler());
});

app.get('/api/watch/:id', async (req, res) => {
  res.json(await arnime.getVideoPlayer(req.params.id));
});

// ==========================================
// 🌍 STATIC & INDEX
// ==========================================

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 🚀 SERVER
// ==========================================

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n✦ Server jalan di http://localhost:${PORT}`);
  });
}

export default app;