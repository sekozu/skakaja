import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://arnime.my.id';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

async function get(path) {
  try {
    const res = await axios.get(BASE_URL + path, { headers: HEADERS, validateStatus: () => true });
    if (res.status !== 200) {
      const msg = { 400: 'bad request', 401: 'unauthorized', 403: 'forbidden', 404: 'not found', 429: 'too many requests', 500: 'internal server error', 502: 'bad gateway', 503: 'service unavailable' };
      return { ok: false, code: res.status, message: msg[res.status] || 'request failed' };
    }
    return { ok: true, html: res.data };
  } catch (e) {
    return { ok: false, code: e.response?.status || 500, message: e.response?.statusText || e.message || 'network error' };
  }
}

const rsc = (html) => html.split('self.__next_f.push([1,').slice(1).map(c => {
  const end = c.lastIndexOf('])');
  try { return JSON.parse(end !== -1 ? c.slice(0, end) : c); } catch { return ''; }
}).join('');

const list = ($) => {
  const out = [], seen = new Set();
  $('.perf-card').each((_, el) => {
    const $el = $(el);
    const link = $el.closest('a').attr('href') || $el.find('a').attr('href');
    if (!link?.includes('/anime/')) return;
    const id = link.match(/\/anime\/(\d+)/)?.[1];
    const title = $el.find('.line-clamp-2').first().text().trim();
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    out.push({
      id, title, url: `/anime/${id}`,
      image: $el.find('img').first().attr('src'),
      badge: $el.find('.uppercase.tracking-wider').first().text().trim(),
      rating: $el.find('.text-amber-400').first().text().replace('★', '').trim() || null,
      jadwal: $el.find('.truncate').last().text().trim() || null,
    });
  });
  return out;
};

const pageFromHtml = (html) => {
  const match = rsc(html).match(/"children":\s*\[\s*"Halaman\s*",\s*(\d+)\s*\]/i);
  return match ? parseInt(match[1], 10) : 1;
};

export async function getLatest() {
  const r = await get('/terbaru');
  if (!r.ok) return { status: false, ...r };
  const data = list(cheerio.load(r.html));
  return { status: true, total: data.length, data };
}

export async function getPopuler() {
  const r = await get('/populer');
  if (!r.ok) return { status: false, ...r };
  const data = list(cheerio.load(r.html));
  return { status: true, total: data.length, data };
}

export async function getKategori(query = {}) {
  const p = new URLSearchParams(Object.entries(query).filter(([k, v]) => v && ['type', 'genre', 'status', 'sort', 'page'].includes(k)));
  const qs = p.toString();
  const r = await get('/kategori' + (qs ? `?${qs}` : ''));
  if (!r.ok) return { status: false, ...r };
  const $ = cheerio.load(r.html), data = list($);
  return { status: true, page: pageFromHtml(r.html), total: data.length, data };
}

export async function getFilter() {
  const r = await get('/kategori');
  if (!r.ok) return { status: false, ...r };

  const $ = cheerio.load(r.html);
  const f = { type: [], genre: [], status: [], sort: [] };
  const map = { tipe: 'type', genre: 'genre', status: 'status', urutkan: 'sort' };

  $('div.flex.items-start.gap-2').each((_, el) => {
    const $el = $(el);
    const key = map[$el.find('span').first().text().trim().toLowerCase()];
    if (!key) return;

    $el.find('a').each((_, a) => {
      const label = $(a).text().trim();
      if (!label || label === 'Semua') return;

      // ambil nilai query dari href
      const href = $(a).attr('href') || '';
      const val = href.match(new RegExp(`[?&]${key}=([^&]+)`))?.[1];
      if (val) f[key].push({ label, value: decodeURIComponent(val) });
    });
  });

  return { status: true, data: f };
}

export async function getSearch(q = '', page, filter = {}) {
  if (!q || !q.trim()) return { status: false, code: 400, message: 'query "q" wajib diisi' };
  filter = filter || {};
  const p = new URLSearchParams({ q: q.trim() });
  for (const key of ['genre', 'status', 'type', 'sort']) {
    const v = filter[key];
    if (v) p.set(key, String(v));
  }
  if (Number.isFinite(+page) && +page > 0) p.set('page', Math.floor(+page));
  const qs = p.toString();
  const r = await get('/search?' + qs);
  if (!r.ok) return { status: false, ...r };
  const $ = cheerio.load(r.html), data = list($);
  return { status: true, query: q.trim(), page: pageFromHtml(r.html), total: data.length, data };
}

export async function getAnimeDetail(id) {
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid) || tid < 1) return { status: false, code: 400, message: 'invalid id' };
  const r = await get(`/anime/${tid}`);
  if (!r.ok) return { status: false, ...r };
  const $ = cheerio.load(r.html), title = $('h1').first().text().trim();
  const epMatch = r.html.match(/"numberOfEpisodes":(\d+)/);
  if (!title || !epMatch) return { status: false, code: 404, message: 'data not found' };
  const metaDiv = $('h1').first().next('div'), spans = metaDiv.find('span');
  const yearRaw = spans.eq(0).text().trim(), year = yearRaw && yearRaw !== 'UNKNOWN' ? yearRaw : null;
  const type = spans.eq(1).text().trim() || null, status = spans.eq(2).text().trim() || null, rating = spans.eq(3).text().trim() || null;
  let genre = [];
  const gMatch = r.html.match(/"genre":\s*\[([^\]]*)\]/);
  if (gMatch) { try { genre = JSON.parse(`[${gMatch[1]}]`); } catch { genre = []; } }
  let alternative = null, jadwal = null;
  $('span').each((_, el) => {
    const label = $(el).text().trim();
    if (label === 'Alternatif:') alternative = $(el).next('span').text().trim() || null;
    else if (label === 'Jadwal:') jadwal = $(el).next('span').text().trim() || null;
  });
  const synopsis = $('p.line-clamp-3, p.line-clamp-4').first().text().trim() || null;
  return { status: true, data: { id: String(tid), title, alternative, synopsis, year, type, status, rating, jadwal, total_episode: parseInt(epMatch[1], 10), genre } };
}

export async function getVideoPlayer(id, ep = 1) {
  const sid = parseInt(id, 10);
  if (!Number.isFinite(sid) || sid < 1) return { status: false, code: 400, message: 'invalid id' };
  const epString = String(ep).trim();
  if (!/^\d+$/.test(epString) || parseInt(epString, 10) < 1) return { status: false, code: 400, message: 'invalid episode' };
  const epNumToFetch = parseInt(epString, 10);
  const r = await get(`/watch/${sid}?ep=${epNumToFetch}`);
  if (!r.ok) return { status: false, ...r };
  const x = rsc(r.html);
  const stream = {}, serverRe = /\{"server_id":"arnimecdn([12])"[^}]*?"sources":\[([^\]]*)\]/g;
  for (const s of x.matchAll(serverRe)) {
    const key = `cdn${s[1]}`, urls = [];
    for (const src of s[2].matchAll(/\{"quality":"(\d+p)","url":"([^"]+)"\}/g)) urls.push(src[2]);
    if (urls.length) stream[key] = urls;
  }
  if (!Object.keys(stream).length) return { status: false, code: 404, message: 'no stream found' };
  return { status: true, data: { id: String(sid), stream } };
}