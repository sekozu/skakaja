import axios from 'axios';

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

const list = (rscText) => {
  const out = [], seen = new Set();
  const regex = /"animeId":"(\d+)".*?"title":"([^"]+)".*?"poster":"([^"]+)".*?"backdrop":"([^"]+)".*?"rating":"([^"]*)".*?"status":"([^"]*)".*?"type":"([^"]*)".*?"releaseDay":"([^"]*)".*?"year":"([^"]*)".*?"url":"([^"]*)".*?"synopsis":\{"paragraphs":\[(.*?)\]\}.*?"genreList":\[(.*?)\].*?"airedStart":"([^"]*)".*?"score":"([^"]*)"/g;
  let match;

  while ((match = regex.exec(rscText)) !== null) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const fixImg = (url) => url ? url.replace(/%2F/gi, '/').replace(/=/g, '') : null;

    out.push({
      id,
      title: match[2],
      image: fixImg(match[3]),
      backdrop: fixImg(match[4]),
      rating: match[5] || null,
      status: match[6] || null,
      type: match[7] || null,
      day: match[8] || null,
      year: match[9] || null,
      url: match[10] || null,
      sinopsis: match[11] ? match[11].split('","').map(s => s.replace(/^"|"$/g, '').replace(/\\r\\n/g, ' ').replace(/\\n/g, ' ').replace(/"/g, "'")) : [],
      genre: match[12] ? JSON.parse(`[${match[12]}]`).map(g => g.title) : [],
      airedStart: match[13] || null,
      score: match[14] || null
    });
  }
  return out;
};

const detail = (x) => {
  
  const regex = /"animeId":"(\d+)","title":"([^"]+)","poster":"([^"]+)"[\s\S]*?lucide-calendar[\s\S]*?\}\],"([^"]+)"/g;
  const resinop = /"paragraphs":\["(.*?)"]/g;
  const regenre = /"genre":\[(.*?)\]/g;
  const teps = /"Daftar Episode \(",(\d+),"\)"/g;
  const stats = /status":"([^"]+)","rating":"([^"]+)","year":"([^"]+)"/g;

  const fixImg = (url) => url ? url.replace(/%2F/gi, '/').replace(/=/g, '') : null;
  const match = regex.exec(x);
  if (!match) return null;

  const genres = regenre.exec(x);
  const syn = resinop.exec(x);
  const m = teps.exec(x);
  const t = stats.exec(x);
  
  return {
      id: match[1] || 0,
      title: match[2] || null,
      image: fixImg(match[3]) || null,
      genre: JSON.parse(`[${genres[1]}]`) || null,
      sinopsis: syn[1].split('","').map(s => s.replace(/^"|"$/g, '').replace(/\\r\\n/g, ' ').replace(/\\n/g, ' ').replace(/\\\"/g,"'")) || null,
      day: match[4],
      episode: m[1],
      status: t[1] || null,
      score: t[2] || null,
      year: t[3] || null,
  };
};

const pageFromHtml = (html) => {
  const match = rsc(html).match(/"children":\s*\[\s*"Halaman\s*",\s*(\d+)\s*\]/i);
  return match ? parseInt(match[1], 10) : 1;
};

export async function getHome() {
  const r = await get('/');
  if (!r.ok) return { status: false, ...r };

  const text = rsc(r.html).replace(/\\"/g, '"');
  const posT = text.indexOf('"id":"terbaru"');
  const posO = text.indexOf('"id":"ongoing"');
  const posP = text.indexOf('"id":"populer"');

  return {
    status: true,
    data: {
      latest: list(text.slice(text.indexOf('"animeList":[', posT), posO !== -1 ? posO : text.length)),
      ongoing: list(text.slice(text.indexOf('"animeList":[', posO), posP !== -1 ? posP : text.length)),
      popular: list(text.slice(text.indexOf('"animeList":[', posP)))
    }
  };
}

export async function getLatest() {
  const r = await get('/terbaru');
  if (!r.ok) return { status: false, ...r };
  
  const data = list(rsc(r.html));
  return { status: true, total: data.length, data };
}

export async function getPopuler() {
  const r = await get('/populer');
  if (!r.ok) return { status: false, ...r };
  
  const data = list(rsc(r.html));
  return { status: true, total: data.length, data };
}

export async function getKategori(query = {}) {
  const p = new URLSearchParams(
    Object.entries(query).filter(([k, v]) =>
      v && ['type', 'genre', 'status', 'sort', 'page'].includes(k)
    )
  );

  const r = await get('/kategori' + (p.size ? `?${p}` : ''));
  if (!r.ok) return { status: false, ...r };

  const data = list(rsc(r.html));
  return { status: true, page: pageFromHtml(r.html), total: data.length, data };
}

export async function getFilter() {
  const r = await get('/kategori');
  if (!r.ok) return { status: false, ...r };

  const x = rsc(r.html);
  const f = {
    type: [],
    genre: [],
    status: [],
    sort: []
  };

  const rows = {
    type: 'Tipe',
    genre: 'Genre',
    status: 'Status',
    sort: 'Urutkan'
  };

  for (const [key, title] of Object.entries(rows)) {
    const start = x.indexOf(`"children":"${title}"`);
    if (start === -1) continue;

    const next = Object.values(rows)
      .map(v => x.indexOf(`"children":"${v}"`, start + 1))
      .filter(i => i !== -1);

    const end = next.length ? Math.min(...next) : x.length;
    const section = x.slice(start, end);

    const refs = [...section.matchAll(/"\$L([a-z0-9]+)"/g)]
      .map(m => m[1]);

    const source = section + refs
      .map(id => x.match(new RegExp(`(?:^|\\n)${id}:([^\\n]+)`))?.[1] || '')
      .join('\n');

    for (const m of source.matchAll(
      /"href":"([^"]+)"[\s\S]*?"children":"([^"]+)"/g
    )) {
      const href = m[1].replace(/\\u0026/g, '&');
      const label = m[2];

      if (label === 'Semua') continue;

      const value = href.match(
        new RegExp(`[?&]${key}=([^&"]+)`)
      )?.[1];

      if (value && !f[key].some(item => item.value === decodeURIComponent(value))) {
        f[key].push({
          label,
          value: decodeURIComponent(value).toLowerCase()
        });
      }
    }
  }

  return {
    status: true,
    data: f
  };
}

export async function getSearch(q = '', page, filter = {}) {
  if (!q || !q.trim()) return { status: false, code: 400, message: 'query "q" wajib diisi' };
  
  filter = filter || {};
  const p = new URLSearchParams({ q: q.trim() });
  
  for (const key of ['genre', 'status', 'type', 'sort']) {
    if (filter[key]) p.set(key, String(filter[key]));
  }
  if (Number.isFinite(+page) && +page > 0) p.set('page', Math.floor(+page));
  
  const r = await get('/anime?' + p.toString());
  if (!r.ok) return { status: false, ...r };

  const text = rsc(r.html).replace(/\\"/g, '"');
  
  const isKosong = text.includes('Tidak ada anime yang cocok') || text.includes('0 judul ditampilkan');

  const rawData = list(text);
  
  return { 
    status: true, 
    query: q.trim(), 
    page: pageFromHtml(r.html), 
    total: isKosong ? 0 : rawData.length, 
    data: isKosong ? [] : rawData,
    ...(isKosong && { recommend: rawData })
  };
  
}

export async function getAnimeDetail(id) {
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid) || tid < 1) {
    return { status: false, code: 400, message: 'invalid id' };
  }

  const r = await get(`/anime/${tid}`);
  if (!r.ok) return { status: false, ...r };

  const text = rsc(r.html);
  const main = detail(text);

  if (!main) return { status: false, code: 404, message: 'Anime Tidak Ditemukan' };
  
  
  const posRelated = text.indexOf('"id":"related-anime"');
  const related = posRelated !== -1
    ? list(text.slice(text.lastIndexOf('"animeList":[', posRelated)))
    : [];
  return {
    status: true,
    data: {
      ...main,
      related
    }
  };
}

export async function getVideoPlayer(id, ep) {
  if (!/^\d+$/.test(String(id)) || +id < 1 || !/^\d+$/.test(String(ep)) || +ep < 1)
    return { status: false, code: 400, message: 'invalid id or episode' };

  const r = await get(`/watch/${id}?ep=${ep}`);
  if (!r.ok) return { status: false, ...r };

  const x = rsc(r.html);
  const episode = x.match(/"episode":\{"id":"(\d+)","title":"([^"]+)"\}/);
  if (!episode) return { status: false, code: 404, message: 'episode not found' };

  const servers = {};
  for (const m of x.matchAll(/"server_id":"arnimecdn([12])".*?"sources":\[(.*?)\]/g)) {
    const sources = [...m[2].matchAll(/"quality":"(\d+p)","url":"([^"]+)"/g)]
      .map(s => ({ quality: s[1], url: s[2] }));
    if (sources.length) servers[`cdn${m[1]}`] = sources;
  }

  if (!Object.keys(servers).length)
    return { status: false, code: 404, message: 'no stream found' };

  const getValue = k =>
  x.match(new RegExp(`"${k}":"([^"]*)"`))?.[1] || null;
  
  return {
    status: true,
    data: {
      id: String(id),
      animeTitle: getValue('animeTitle'),
      episode: { id: episode[1], title: episode[2] },
      nextEpisodeId: getValue('nextEpisodeId'),
      nextEpisodeUrl: getValue('nextEpisodeUrl'),
      nextEpisodeTitle: getValue('nextEpisodeTitle'),
      servers
    }
  };
}

export async function getSchedule() {
  const r = await get('/#jadwal');
  if (!r.ok) return { status: false, ...r };

  const rscText = rsc(r.html);
  const data = list(rscText);
  const hariMap = {};
  const regexHari = /"animeId":"(\d+)".*?"releaseDay":"([^"]*)"/g;
  let match;

  while ((match = regexHari.exec(rscText)) !== null) hariMap[match[1]] = match[2];

  const grouped = { Senin: [], Selasa: [], Rabu: [], Kamis: [], Jumat: [], Sabtu: [], Minggu: [] };

  data.forEach(item => {
    const hari = hariMap[item.id];
    if (hari && grouped[hari]) grouped[hari].push({ ...item, releaseDay: hari });
  });

  return { status: true, data: grouped };
}