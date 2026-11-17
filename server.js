import express from 'express';
import path from 'path';
import cors from 'cors'; 
import { fileURLToPath } from 'url';
import apiRouter from './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1111;

// ==========================================
// 🌐 REQUEST LOG
// ==========================================

import fs from 'fs';

app.use((req, res, next) => {
  const start = Date.now();
  const ip = req.socket.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || '-';
  const ua = req.headers['user-agent'] || '-';
  const time = new Date().toISOString();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const line = `[${time}] ${ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms | ${ua}\n`;
    console.log(line.trim());
    fs.appendFile('request.log', line, () => {});
  });

  next();
});

// ==========================================
// 🌐 ROUTER API
// ==========================================

app.use(cors()); 
app.use(apiRouter);

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