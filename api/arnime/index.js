import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://arnime.my.id';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
};

// ==========================================
// 🕹 HELPER
// ==========================================

function extractRsc(html) {
  const chunks = html.split('self.__next_f.push([1,');
  let fullRsc = '';
  for (let i = 1; i < chunks.length; i++) {
    let c = chunks[i];
    const end = c.lastIndexOf('])');
    if (end !== -1) c = c.slice(0, end);
    try {
      const parsed = JSON.parse(c);
      if (typeof parsed === 'string') fullRsc += parsed;
    } catch (_) {}
  }
  return fullRsc;
}

function parseAnimeCard($, el) {
  const $el = $(el);
  const link = $el.closest('a').attr('href') || $el.find('a').attr('href');
  if (!link || !link.includes('/anime/')) return null;

  const id = link.match(/\/anime\/(\d+)/)?.[1];
  const title = $el.find('.line-clamp-2').first().text().trim();
  const image = $el.find('img').first().attr('src');
  const badge = $el.find('.uppercase.tracking-wider').first().text().trim();
  const rating = $el.find('.text-amber-400').first().text().replace('★', '').trim();
  const jadwal = $el.find('.truncate').last().text().trim();

  if (!id || !title) return null;
  return {
    id,
    title,
    url: `${BASE_URL}/anime/${id}`,
    image,
    badge,
    rating: rating || null,
    jadwal: jadwal || null
  };
}

// ==========================================
// 1. LATEST
// ==========================================
export async function getLatest() {
  try {
    const { data } = await axios.get(`${BASE_URL}/terbaru`, { headers: HEADERS });
    const $ = cheerio.load(data);
    const animeList = [];

    $('.perf-card').each((_, el) => {
      const card = parseAnimeCard($, el);
      if (card && !animeList.some(a => a.id === card.id)) animeList.push(card);
    });

    return { status: true, total: animeList.length, data: animeList };
  } catch (err) {
    return { status: false, message: err.message };
  }
}

// ==========================================
// 2. POPULER
// ==========================================

export async function getPopuler() {
  try {
    const { data } = await axios.get(`${BASE_URL}/populer`, { headers: HEADERS });
    const $ = cheerio.load(data);
    const animeList = [];

    $('.perf-card').each((_, el) => {
      const card = parseAnimeCard($, el);
      if (card && !animeList.some(a => a.id === card.id)) animeList.push(card);
    });

    return { status: true, total: animeList.length, data: animeList };
  } catch (err) {
    return { status: false, message: err.message };
  }
}

// ==========================================
// 3. DETAIL & EPISODE
// ==========================================
export async function getAnimeDetail(id) {
  try {
    const { data: html } = await axios.get(`${BASE_URL}/anime/${id}`, { headers: HEADERS });
    const $ = cheerio.load(html);
    const rsc = extractRsc(html);

    const title = $('h1').first().text().trim();
    const image = $('img.object-cover').first().attr('src');
    const rating = $('.lucide-star').first().parent().text().replace('★', '').trim();
    const badge = $('.bg-emerald-600\\/80, .bg-red-600\\/80').first().text().replace(/[^A-Z]/g, '').trim() || 'UNKNOWN';
    
    const alternatif = $('span').filter((_, el) => $(el).text().trim() === 'Alternatif:').next('span').text().trim();

    const paraSplit = rsc.split('"paragraphs":[');
    let synopsis = paraSplit.length > 1 
      ? paraSplit[1].split(']')[0].split(/","/)[0].replace(/^"|"$/g, '').replace(/\\"/g, '"')
      : $('meta[name="description"]').attr('content') || '';

    const genres = [];
    $('a[href*="/kategori?genre="]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const episodes = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const jsonData = JSON.parse($(el).html());
        (Array.isArray(jsonData) ? jsonData : [jsonData]).forEach(item => {
          if (item['@type'] === 'ItemList' && item.itemListElement) {
            item.itemListElement.forEach(ep => {
              const epNum = ep.name.match(/\d+/)?.[0];
              if (ep.url && epNum && !episodes.some(e => e.episode === epNum)) {
                episodes.push({ episode: epNum, url: ep.url });
              }
            });
          }
        });
      } catch (e) {}
    });
    episodes.sort((a, b) => parseInt(a.episode) - parseInt(b.episode));

    let relatedAnime = [];
    const relatedMatch = rsc.match(/"animeList":\s*(\[[\s\S]*?\])(?=,\s*"id":"related-anime")/);
    if (relatedMatch) {
      try {
        relatedAnime = JSON.parse(relatedMatch[1])
          .filter(item => String(item.animeId || item.id) !== String(id))
          .map(item => ({
            id: String(item.animeId || item.id),
            title: item.title,
            image: item.poster,
            rating: item.rating || null,
            badge: item.status || 'UNKNOWN',
            jadwal: item.releaseDay || 'Random'
          }));
      } catch (e) {}
    }

    return {
      status: true,
      data: {
        id: String(id),
        title,
        alternatif,
        synopsis: synopsis.replace(/\\+"/g, '"').replace(/\s+/g, ' ').trim(),
        image,
        rating,
        badge,
        genres,
        totalEpisode: episodes.length,
        episodes,
        relatedAnime
      }
    };
  } catch (err) {
    return { status: false, message: err.message };
  }
}

// ==========================================
// 4. KATEGORI (FILTER & LIST)
// ==========================================
export async function getKategori(query = {}) {
  try {
    const params = new URLSearchParams();
    ['type', 'genre', 'status', 'sort', 'page'].forEach(k => query[k] && params.append(k, query[k]));
    const url = `${BASE_URL}/kategori${params.toString() ? '?' + params.toString() : ''}`;
    
    const { data } = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);

    const animeList = [];
    $('.perf-card').each((_, el) => {
      const card = parseAnimeCard($, el);
      if (card && !animeList.some(a => a.id === card.id)) animeList.push(card);
    });

    const filters = { type: [], genre: [], status: [], sort: [] };
    $('div.flex.items-start.gap-2').each((_, el) => {
      const $el = $(el);
      const label = $el.find('span').first().text().trim().toLowerCase();
      const items = [];
      $el.find('a').each((_, a) => {
        if ($(a).text().trim() !== 'Semua' && $(a).attr('href')) {
          items.push({ name: $(a).text().trim(), url: $(a).attr('href') });
        }
      });
      if (label === 'tipe') filters.type = items;
      if (label === 'genre') filters.genre = items;
      if (label === 'status') filters.status = items;
      if (label === 'urutkan') filters.sort = items;
    });

    return { status: true, total: animeList.length, filters, data: animeList };
  } catch (err) {
    return { status: false, message: err.message };
  }
}

// ==========================================
// 5. GET IFRAME & STREAM MP4
// ==========================================
export async function getVideoPlayer(id) {
  try {
    const url = `${BASE_URL}/watch/${id}`;
    const { data: html } = await axios.get(url, { headers: HEADERS });

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    let rawTitle = titleMatch ? titleMatch[1] : '';
    
    rawTitle = rawTitle
      .replace(/^Nonton\s+/i, '')
      .replace(/\s+Sub Indo\s*\|.*$/i, '')
      .replace(/\s+Sub\s+Indo/gi, '')
      .replace(/\s*\|.*$/, '')
      .trim();
    
    const episodeMatch = rawTitle.match(/(.*)\s+(Episode\s+\d+.*)$/i);
    
    let title = rawTitle;
    let episode = '';
    
    if (episodeMatch) {
      title = episodeMatch[1].trim();
      episode = episodeMatch[2].trim();
    }

    const regex = /https:\\?\/\\?\/storage-v2\.arnime\.my\.id\\?\/storage\\?\/stream\\?\/[^"\\]+/g;
    const matches = html.match(regex) || [];
    const streams = [...new Set(matches.map(m => m.replace(/\\/g, '')))];

    if (streams.length === 0) {
      return { status: false, message: 'Link video tidak ditemukan' };
    }

    const result = streams.map(link => {
      const quality = link.match(/q=(\d+p)/)?.[1] || 'unknown';
      return { quality, url: link };
    });

    return { 
      status: true, 
      data: { 
        id: String(id), 
        title: title,
        episode: episode,
        streams: result 
      } 
    };
  } catch (err) {
    return { status: false, message: err.message };
  }
}