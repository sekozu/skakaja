import express from 'express';
import * as arnime from './api/arnime/index.js';

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

// Root API (Dokumentasi)
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 🚀 JALANKAN SERVER
// ==========================================
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n✦ Server jalan di http://localhost:${PORT}`);
    console.log(`✦ Tes Home: http://localhost:${PORT}/api/home`);
    console.log(`✦ Tes Detail: http://localhost:${PORT}/api/anime/426`);
    console.log(`✦ Tes Kategori: http://localhost:${PORT}/api/kategori?genre=Romance&status=ongoing&sort=update\n`);
  });
}

export default app;