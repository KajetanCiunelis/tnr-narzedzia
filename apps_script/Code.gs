/**
 * Tablica wyników do protokołu reakcji TNR (05_ankieta/web/speedtest/).
 * Arkusz Google → Rozszerzenia → Apps Script → wklej ten plik → Wdróż jako aplikację internetową.
 * Instrukcja: README.md obok.
 *
 * POST (body: JSON jako text/plain): {nick, kod, sport, ua, wyniki:[{mod, score, disp, det}]} → dopisuje wiersze.
 *   sport: 'T' = trenuje sport z reakcją na bodziec (piłka, rywal), 'N' = nie, '' = nie podał.
 * GET ?kod=WT → {ok, rows:[{kod, nick, mod, score, disp}]}: najlepszy wynik każdej osoby w każdym zadaniu.
 * GET ?tryb=grupa&kod=WT → {ok, rows:[{p, mod, det, s}]}: ostatnie podejście każdej osoby do wykresów, bez pseudonimów
 *   (s = sport T/N/'').
 * Moderacja: usuń wiersz w arkuszu „wyniki”.
 *
 * Ochrona zapisu: wynik przyjmowany tylko z PIN-em, a PIN wyznacza grupę (kod z linku jest ignorowany).
 * PIN-y wylosuje funkcja utworzPiny() (lista GRUPY niżej) albo wpisz ręcznie w Ustawieniach projektu →
 * Właściwości skryptu, klucz PINY, np. 482193=WT,730511=CZ:Kowalska (po dwukropku opcjonalny opis).
 * Pusta właściwość = tablica wyłączona.
 * Odczyt rankingu (GET) zostaje otwarty, bo pokazuje tylko pseudonimy i wyniki.
 */

const SHEET = 'wyniki';
// grupy do utworzPiny(): kod grupy (litery/cyfry, do 8 znaków), opcjonalnie ':' i opis, np. prowadzący
const GRUPY = ['WT:gr 03 wtorek 11:30', 'CZ:gr 01 czwartek 15:00'];
const ADRES_STRONY = 'https://tnr.ciunelis.com/speedtest/';
const DAYS = 30;            // tablica pokazuje wyniki z ostatnich N dni
const CACHE_S = 10;         // ranking w pamięci podręcznej (s), żeby rzutnik i telefony nie czytały arkusza co chwilę
const LIMIT_OSOBA = 10;     // wysyłek jednej osoby (kod + pseudonim) na 10 min
const LIMIT_MINUTA = 300;   // wszystkich wysyłek na minutę
const LIMIT_ZLY_PIN = 30;   // błędnych PIN-ów na 10 min, potem blokada zapisu na 10 min

// dopuszczalny zakres wyniku rankingowego (ms, z karami) dla każdego zadania
const MODS = {
  prosty: [100, 3000], wybor2: [100, 3500], wybor4: [100, 4000],
  odliczanie: [0, 3500], rytm: [0, 2500], cel: [0, 2500],
  gonogo: [100, 5000], ksztalt: [100, 5000], szukanie: [100, 12000], stroop: [100, 6000]
};

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['czas', 'kod', 'nick', 'sport', 'modul', 'wynik', 'opis', 'szczegoly', 'urzadzenie', 'opis_pinu']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// bez znaczników, znaków sterujących i bez wiodących = + - @ (arkusz potraktowałby tekst jak formułę)
function clean_(s, n) {
  return String(s == null ? '' : s)
    .replace(/[<>"'`\\]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .replace(/^[=+\-@]+/, '')
    .slice(0, n);
}

// PINY = "482193=WT,730511=CZ:Kowalska" → { '482193': {kod:'WT', opis:''}, '730511': {kod:'CZ', opis:'Kowalska'} }
function pins_() {
  const raw = PropertiesService.getScriptProperties().getProperty('PINY') || '';
  const m = {};
  raw.split(',').forEach(function (x) {
    const i = x.indexOf('=');
    if (i < 1) return;
    const pin = x.slice(0, i).trim(), rest = x.slice(i + 1).trim(), c = rest.indexOf(':');
    const kod = (c < 0 ? rest : rest.slice(0, c)).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    if (pin && kod) m[pin] = { kod: kod, opis: c < 0 ? '' : clean_(rest.slice(c + 1), 40) };
  });
  return m;
}

// Uruchom raz z edytora: losuje 6-cyfrowy PIN dla każdej grupy z GRUPY, zapisuje PINY
// i tworzy arkusz „piny” z linkami dla studentów (do QR) i na rzutnik. Ponowne uruchomienie = nowe PIN-y.
function utworzPiny() {
  const used = {}, pary = [], sh = SpreadsheetApp.getActiveSpreadsheet();
  const tab = sh.getSheetByName('piny') || sh.insertSheet('piny');
  tab.clear();
  tab.appendRow(['grupa', 'PIN', 'opis', 'link dla studentów (QR)', 'link na rzutnik']);
  GRUPY.forEach(function (g) {
    const c = g.indexOf(':'), kod = (c < 0 ? g : g.slice(0, c)).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8), opis = c < 0 ? '' : g.slice(c + 1);
    let pin;
    do { pin = String(100000 + Math.floor(Math.random() * 900000)); } while (used[pin]);
    used[pin] = 1;
    pary.push(pin + '=' + kod + (opis ? ':' + opis : ''));
    tab.appendRow([kod, "'" + pin, opis, ADRES_STRONY + '?kod=' + kod + '&pin=' + pin, ADRES_STRONY + '?tablica&kod=' + kod]);
  });
  PropertiesService.getScriptProperties().setProperty('PINY', pary.join(','));
  tab.autoResizeColumns(1, 5);
  Logger.log('Zapisano PINY: ' + pary.join(','));
}

// licznik w pamięci podręcznej; wołać pod blokadą
function bump_(cache, key, ttl) {
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), ttl);
  return n;
}

// szczegóły prób: tylko liczby, znane klucze, krótkie tablice (bez tekstu = nic do „podłożenia”)
const DET_KEYS = ['med', 'rts', 'err', 'ae', 'ce', 've', 'e', 'rec', 'sp', 'n', 'rt', 'comm', 'omis', 'prem', 'slope', 'mc', 'mi', 'cost', 'early'];
function det_(v, depth) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 10) / 10 : null;
  if (depth > 3 || v == null || typeof v !== 'object') return null;
  if (Array.isArray(v)) return v.slice(0, 30).map(function (x) { return det_(x, depth + 1); });
  const o = {};
  DET_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(v, k)) { const x = det_(v[k], depth + 1); if (x != null) o[k] = x; } });
  return o;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const pins = pins_();
    if (!Object.keys(pins).length) return json_({ ok: false, code: 'off', error: 'tablica wyłączona' });
    const nick = clean_(d.nick, 16);
    const pin = String(d.pin == null ? '' : d.pin).trim();
    const grupa = Object.prototype.hasOwnProperty.call(pins, pin) ? pins[pin] : null;
    const kod = grupa ? grupa.kod : '';
    const sport = (d.sport === 'T' || d.sport === 'N') ? d.sport : '';
    if (!nick) return json_({ ok: false, error: 'brak pseudonimu' });
    const now = new Date();
    const rows = [];
    (Array.isArray(d.wyniki) ? d.wyniki : []).slice(0, 12).forEach(function (w) {
      const lim = MODS[w && w.mod];
      const s = Number(w && w.score);
      if (!lim || !isFinite(s) || s < lim[0] || s > lim[1]) return;
      rows.push([now, kod, nick, sport, w.mod, Math.round(s), clean_(w.disp, 40), (function () { const j = JSON.stringify(det_(w.det || {}, 0) || {}); return j.length < 3000 ? j : '{}'; })(), clean_(d.ua, 80)]);
    });
    if (!rows.length) return json_({ ok: false, error: 'brak poprawnych wyników' });
    const cache = CacheService.getScriptCache();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (Number(cache.get('zly_pin') || 0) >= LIMIT_ZLY_PIN) return json_({ ok: false, code: 'locked', error: 'za dużo błędnych PIN-ów' });
      if (!grupa) { bump_(cache, 'zly_pin', 600); return json_({ ok: false, code: 'pin', error: 'zły PIN' }); }
      if (bump_(cache, 'm_' + Math.floor(Date.now() / 60000), 120) > LIMIT_MINUTA) return json_({ ok: false, code: 'limit', error: 'limit na minutę' });
      if (bump_(cache, 'o_' + kod + '|' + nick.toLowerCase(), 600) > LIMIT_OSOBA) return json_({ ok: false, code: 'limit', error: 'limit na osobę' });
      rows.forEach(function (r) { r[1] = kod; r.push(grupa.opis); });
      const sh = sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    } finally {
      lock.releaseLock();
    }
    cache.removeAll(['b_' + kod, 'b_', 'g_' + kod, 'g_']);
    return json_({ ok: true, n: rows.length, kod: kod });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const kod = clean_((e && e.parameter && e.parameter.kod) || '', 8).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const cache = CacheService.getScriptCache();
    if (e && e.parameter && e.parameter.tryb === 'grupa') return group_(kod, cache);
    const key = 'b_' + kod;
    const hit = cache.get(key);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

    const vals = sheet_().getDataRange().getValues();
    vals.shift();
    const since = Date.now() - DAYS * 864e5;
    const best = {};
    vals.forEach(function (r) {
      const czas = r[0], k = String(r[1] || ''), nick = String(r[2] || ''), mod = String(r[4] || ''), score = Number(r[5]), disp = String(r[6] || '');
      if (!nick || !MODS[mod] || !isFinite(score)) return;
      if (kod && k !== kod) return;
      if (new Date(czas).getTime() < since) return;
      const id = k + '|' + nick.toLowerCase() + '|' + mod;
      if (!best[id] || score < best[id].score) best[id] = { kod: k, nick: nick, mod: mod, score: score, disp: disp };
    });
    const out = JSON.stringify({ ok: true, rows: Object.keys(best).map(function (id) { return best[id]; }) });
    if (out.length < 90000) cache.put(key, out, CACHE_S);
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ostatnie podejście każdej osoby w każdym zadaniu; osoba jako numer, bez pseudonimu
function group_(kod, cache) {
  const key = 'g_' + kod;
  const hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const vals = sheet_().getDataRange().getValues();
  vals.shift();
  const since = Date.now() - DAYS * 864e5;
  const last = {}, ids = {};
  vals.forEach(function (r) {
    const t = new Date(r[0]).getTime(), k = String(r[1] || ''), nick = String(r[2] || '').toLowerCase(), mod = String(r[4] || '');
    if (!nick || !MODS[mod] || (kod && k !== kod) || t < since) return;
    const who = k + '|' + nick, id = who + '|' + mod;
    if (!last[id] || t >= last[id].t) last[id] = { t: t, who: who, mod: mod, det: r[7], s: String(r[3] || '') };
  });
  const rows = [];
  Object.keys(last).forEach(function (id) {
    const x = last[id];
    let det = null;
    try { det = JSON.parse(x.det); } catch (err) { return; }
    if (!(x.who in ids)) ids[x.who] = Object.keys(ids).length;
    rows.push({ p: ids[x.who], mod: x.mod, det: det, s: (x.s === 'T' || x.s === 'N') ? x.s : '' });
  });
  const out = JSON.stringify({ ok: true, rows: rows });
  if (out.length < 90000) cache.put(key, out, CACHE_S);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}
