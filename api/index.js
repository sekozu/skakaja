import express from 'express';
import * as arnime from './arnime/index.js';

const router = express.Router();

router.get('/api/latest', async (req, res) => {
  const data = await arnime.getLatest();
  res.json(data);
});

router.get('/api/anime/:id', async (req, res) => {
  const data = await arnime.getAnimeDetail(req.params.id);
  res.json(data);
});

router.get('/api/kategori', async (req, res) => {
  const data = await arnime.getKategori(req.query);
  res.json(data);
});

router.get('/api/popular', async (req, res) => {
  res.json(await arnime.getPopuler());
});

router.get('/api/watch/:id', async (req, res) => {
  const ep = req.query.ep || 1;
  res.json(await arnime.getVideoPlayer(req.params.id, ep));
});

router.get('/api/search', async (req, res) => {
  const data = await arnime.getSearch(req.query.q);
  res.json(data);
});

export default router;