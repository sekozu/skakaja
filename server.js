import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1111;

// ==========================================
// 🌐 ROUTER API
// ==========================================

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