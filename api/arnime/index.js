import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://arnime.my.id';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// 🌐 Fetch + error handling (1 tempat)
async function get(path) {
  try {
    const res = await axios.get(BASE_URL + path, { headers: HEADERS, validateStatus: () => true });
    
    if (res.status !== 200) {
      const defaultMessages = {
        400: 'bad request',
        401: 'unauthorized',
        403: 'forbidden',
        404: 'not found',
        429: 'too many requests',
        500: 'internal server error',
        502: 'bad gateway',
        503: 'service unavailable',
      };
      return { 
        ok: false, 
        code: res.status, 
        message: defaultMessages[res.status] || 'request failed' 
      };
    }
    
    return { ok: true, html: res.data };
  } catch (e) {
    return { 
      ok: false, 
      code: e.response?.status || 500, 
      message: e.response?.statusText || e.message || 'network error' 
    };
  }
}

// 🧰 Helper
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

const filters = ($) => {
  const f = { type: [], genre: [], status: [], sort: [] };
  const map = { tipe: 'type', genre: 'genre', status: 'status', urutkan: 'sort' };
  $('div.flex.items-start.gap-2').each((_, el) => {
    const $el = $(el), key = map[$el.find('span').first().text().trim().toLowerCase()];
    if (!key) return;
    $el.find('a').each((_, a) => {
      const name = $(a).text().trim();
      if (name !== 'Semua') f[key].push(name);
    });
  });
  return f;
};

const pageFromHtml = (html) => {
  const x = rsc(html);
  const match = x.match(/"children":\s*\[\s*"Halaman\s*",\s*(\d+)\s*\]/i);
  return match ? parseInt(match[1], 10) : 1;
};

// 🚀 Endpoint
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
  const r = await get('/kategori' + (p.toString() ? '?' + p : ''));
  if (!r.ok) return { status: false, ...r };
  
  const $ = cheerio.load(r.html), data = list($);
  const realPage = pageFromHtml(r.html); 
  
  return { status: true, page: realPage, total: data.length, filters: filters($), data };
}

export async function getSearch(q = '', page, filter = {}) {
  if (!q || !q.trim()) {
    return { status: false, code: 400, message: 'query "q" wajib diisi' };
  }

  const p = new URLSearchParams({ q: q.trim() });

  for (const key of ['genre', 'status', 'type', 'sort']) {
    const v = filter[key];
    if (v) p.set(key, String(v));
  }

  if (Number.isFinite(+page) && +page > 0) p.set('page', Math.floor(+page));

  const r = await get('/search?' + p);
  if (!r.ok) return { status: false, ...r };

  const $ = cheerio.load(r.html);
  const data = list($);
  const realPage = pageFromHtml(r.html);

  return { status: true, query: q.trim(), page: realPage, total: data.length, data };
}

export async function getAnimeDetail(id) {
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid) || tid < 1) return { status: false, code: 400, message: 'invalid id' };

  const r = await get(`/anime/${tid}`);
  if (!r.ok) return { status: false, ...r };

  const $ = cheerio.load(r.html), x = rsc(r.html);
  const kw = $('meta[name="keywords"]').attr('content') || '';
  const title = kw.split(',')[0].trim() || $('h1').first().text().trim();

  const para = x.split('"paragraphs":[')[1];
  let synopsis = para ? para.split(']')[0].split(/","/)[0].replace(/^"|"$/g, '').replace(/\\"/g, '"') : ($('meta[name="description"]').attr('content') || '');
  synopsis = synopsis.replace(/\\+"/g, '"').replace(/\s+/g, ' ').trim();
  if (!synopsis || /^Nonton anime subtitle Indonesia terlengkap/i.test(synopsis)) return { status: false, code: 404, message: 'not found' };

  const episodes = [], seenEp = new Set();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const items = [].concat(JSON.parse($(el).html()));
      items.forEach(i => (i.itemListElement || []).forEach(ep => {
        const n = ep.name?.match(/\d+/)?.[0];
        if (ep.url && n && !seenEp.has(n)) { seenEp.add(n); episodes.push({ episode: n, url: ep.url }); }
      }));
    } catch {}
  });
  episodes.sort((a, b) => a.episode - b.episode);

  const relMatch = x.match(/"animeList":\s*(\[[\s\S]*?\])(?=,\s*"id":"related-anime")/);
  let relatedAnime = [];
  if (relMatch) try {
    relatedAnime = JSON.parse(relMatch[1]).filter(i => String(i.animeId || i.id) !== String(tid)).map(i => ({
      id: String(i.animeId || i.id), title: i.title, image: i.poster,
      rating: i.rating || null, badge: i.status || 'UNKNOWN', jadwal: i.releaseDay || 'Random',
    }));
  } catch {}

  let stream = [];
  if (episodes.length > 0) {
    const ep1 = episodes[0].episode;
    const vp = await getVideoPlayer(tid, ep1);
    if (vp.status && vp.data) {
      stream = vp.data;
    }
  }

  return {
    status: true, id: String(tid), req_id: String(id),
    data: {
      title,
      alternatif: $('span').filter((_, el) => $(el).text().trim() === 'Alternatif:').next('span').text().trim(),
      synopsis,
      image: $('img.object-cover').first().attr('src'),
      rating: $('.lucide-star').first().parent().text().replace('★', '').trim(),
      badge: $('.bg-emerald-600\\/80, .bg-red-600\\/80').first().text().replace(/[^A-Z]/g, '').trim() || 'UNKNOWN',
      genres: [...new Set($('a[href*="/kategori?genre="]').map((_, e) => $(e).text().trim()).get().filter(Boolean))],
      totalEpisode: episodes.length, episodes, relatedAnime,
      stream: stream,
    },
  };
}

export async function getVideoPlayer(id, ep = 1) {
  const sid = parseInt(id, 10);
  if (!Number.isFinite(sid) || sid < 1) return { status: false, code: 400, message: 'invalid id' };

  const epString = String(ep).trim();
  if (!/^\d+$/.test(epString) || parseInt(epString, 10) < 1) {
    return { status: false, code: 400, message: 'invalid episode' };
  }

  const epNumToFetch = parseInt(epString, 10);

  const r = await get(`/watch/${sid}?ep=${epNumToFetch}`);
  if (!r.ok) return { status: false, ...r };

  const x = rsc(r.html);
  const animeTitle = x.match(/"animeTitle":"([^"]+)"/)?.[1];
  const epTitle = x.match(/"episodeTitle":"([^"]+)"/)?.[1];
  const epId = x.match(/"episodeId":"(\d+)"/)?.[1];
  const epNum = x.match(/"episodeNumber":(\d+)/)?.[1];

  if (!animeTitle || !epId || !epNum) return { status: false, code: 404, message: 'not found' };

  const streams = [...new Set((r.html.match(/https:\\?\/\\?\/storage-v2\.arnime\.my\.id\\?\/storage\\?\/stream\\?\/[^"\\]+/g) || []).map(m => m.replace(/\\/g, '')))];
  if (!streams.length) return { status: false, code: 404, message: 'not found' };

  return {
    status: true,
    id: String(sid),
    epId,
    epNum: parseInt(epNum, 10),
    title: epTitle ? `${animeTitle} - ${epTitle}` : animeTitle,
    data: streams.map(url => ({ quality: url.match(/q=(\d+p)/)?.[1] || 'unknown', url })),
  };
}