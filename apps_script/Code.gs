/**
 * Tablica wyników do protokołu reakcji TNR (05_ankieta/web/speedtest/).
 * Arkusz Google → Rozszerzenia → Apps Script → wklej ten plik → Wdróż jako aplikację internetową.
 * Instrukcja: README.md obok.
 *
 * POST (body: JSON jako text/plain): {nick, kod, sport, ua, wyniki:[{mod, score, disp, det}]} → dopisuje wiersze.
 *   sport: 'T' = trenuje sport z reakcją na bodziec (piłka, rywal), 'N' = nie, '' = nie podał.
 * GET ?pin=… → {ok, kod, rows:[{kod, nick, mod, score, disp}]}: najlepszy wynik każdej osoby w każdym zadaniu.
 * GET ?tryb=grupa&pin=… → {ok, kod, rows:[{p, mod, det, s}]}: ostatnie podejście każdej osoby do wykresów, bez pseudonimów
 *   (s = sport T/N/'').
 * Oba GET-y: &runda=N pokazuje wybraną rundę, &runda=wszystkie wszystkie rundy (domyślnie bieżąca);
 *   odpowiedź ma runda (bieżąca), widok (pokazana) i w tablicy rundy:[{n, od}].
 * Moderacja: usuń wiersz w arkuszu „wyniki”.
 *
 * Ochrona zapisu: wynik przyjmowany tylko z PIN-em, a PIN wyznacza grupę (kod z linku jest ignorowany).
 * PIN-y wylosuje funkcja utworzPiny() (lista GRUPY niżej) albo wpisz ręcznie w Ustawieniach projektu →
 * Właściwości skryptu, klucz PINY, np. 482193=WT,730511=CZ:Kowalska (po dwukropku opcjonalny opis).
 * Pusta właściwość = tablica wyłączona.
 * Odczyt tablicy (GET) też wymaga PIN-u i pokazuje tylko grupę z tego PIN-u (kod z linku jest ignorowany).
 * Błędne PIN-y przy odczycie liczą się do tego samego limitu co przy zapisie.
 */

const SHEET = 'wyniki';
// grupy do utworzPiny(): kod grupy (litery/cyfry, do 8 znaków), opcjonalnie ':' i opis, np. prowadzący
const GRUPY = ['WT:gr 03 wtorek 11:30', 'CZ:gr 01 czwartek 15:00', 'MO:Monika', 'AG:Agnieszka'];
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
    sh.appendRow(['czas', 'kod', 'nick', 'sport', 'modul', 'wynik', 'opis', 'szczegoly', 'urzadzenie', 'opis_pinu', 'runda']);
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
// i tworzy arkusz „piny” z linkami dla studentów (do QR) i na rzutnik. Ponowne uruchomienie = nowe PIN-y
// dla WSZYSTKICH grup (stare linki przestają działać). Nowa grupa bez ruszania starych: dodajPiny().
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

// Uruchom z edytora po dopisaniu grupy do GRUPY: losuje PIN tylko dla grup, których jeszcze nie ma w PINY,
// i dopisuje je do arkusza „piny”. Istniejące PIN-y (i linki/QR) zostają bez zmian.
function dodajPiny() {
  const props = PropertiesService.getScriptProperties();
  const stare = pins_(), maKod = {}, used = {};
  Object.keys(stare).forEach(function (pin) { used[pin] = 1; maKod[stare[pin].kod] = 1; });
  const pary = (props.getProperty('PINY') || '').split(',').filter(function (x) { return x.trim(); });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let tab = ss.getSheetByName('piny');
  if (!tab) { tab = ss.insertSheet('piny'); tab.appendRow(['grupa', 'PIN', 'opis', 'link dla studentów (QR)', 'link na rzutnik']); }
  const nowe = [];
  GRUPY.forEach(function (g) {
    const c = g.indexOf(':'), kod = (c < 0 ? g : g.slice(0, c)).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8), opis = c < 0 ? '' : g.slice(c + 1);
    if (!kod || maKod[kod]) return;
    let pin;
    do { pin = String(100000 + Math.floor(Math.random() * 900000)); } while (used[pin]);
    used[pin] = 1; maKod[kod] = 1;
    pary.push(pin + '=' + kod + (opis ? ':' + opis : ''));
    tab.appendRow([kod, "'" + pin, opis, ADRES_STRONY + '?kod=' + kod + '&pin=' + pin, ADRES_STRONY + '?tablica&kod=' + kod]);
    nowe.push(kod);
  });
  props.setProperty('PINY', pary.join(','));
  tab.autoResizeColumns(1, 5);
  Logger.log(nowe.length ? 'Dodano grupy: ' + nowe.join(', ') + ' (pozostałe PIN-y bez zmian)' : 'Wszystkie grupy z GRUPY mają już PIN.');
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
    if (d.akcja) return admin_(d);
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
      const nr = runda_(kod).n;
      rows.forEach(function (r) { r[1] = kod; r.push(grupa.opis, nr); });
      const shr = sheet_();
      if (!shr.getRange(1, 11).getValue()) shr.getRange(1, 11).setValue('runda');
      const sh = sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    } finally {
      lock.releaseLock();
    }
    cache.removeAll(klucze_(kod));
    return json_({ ok: true, n: rows.length, kod: kod });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const cache = CacheService.getScriptCache();
    if (Number(cache.get('zly_pin') || 0) >= LIMIT_ZLY_PIN) return json_({ ok: false, code: 'locked', error: 'za dużo błędnych PIN-ów' });
    const pin = String(p.pin == null ? '' : p.pin).trim(), pins = pins_();
    const grupa = Object.prototype.hasOwnProperty.call(pins, pin) ? pins[pin] : null;
    if (!grupa) {
      if (pin) bump_(cache, 'zly_pin', 600);   // pusty PIN (np. stara wersja strony) nie zużywa limitu
      return json_({ ok: false, code: 'pin', error: 'zły PIN' });
    }
    const kod = grupa.kod, rs = rundy_(kod), z = zakres_(rs, p.runda);
    if (p.tryb === 'grupa') return group_(kod, cache, z, rs);
    const key = 'b_' + kod + '_' + z.klucz;
    const hit = cache.get(key);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

    const vals = sheet_().getDataRange().getValues();
    vals.shift();
    const best = {};
    vals.forEach(function (r) {
      const czas = r[0], k = String(r[1] || ''), nick = String(r[2] || ''), mod = String(r[4] || ''), score = Number(r[5]), disp = String(r[6] || '');
      if (!nick || !MODS[mod] || !isFinite(score)) return;
      if (kod && k !== kod) return;
      const t = new Date(czas).getTime();
      if (t < z.od || t >= z.do) return;
      const id = k + '|' + nick.toLowerCase() + '|' + mod;
      if (!best[id] || score < best[id].score) best[id] = { kod: k, nick: nick, mod: mod, score: score, disp: disp };
    });
    const out = JSON.stringify({ ok: true, kod: kod, runda: rs[rs.length - 1].n, widok: z.klucz, rundy: rs, rows: Object.keys(best).map(function (id) { return best[id]; }) });
    if (out.length < 90000) cache.put(key, out, CACHE_S);
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ostatnie podejście każdej osoby w każdym zadaniu; osoba jako numer, bez pseudonimu
function group_(kod, cache, z, rs) {
  const key = 'g_' + kod + '_' + z.klucz;
  const hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const vals = sheet_().getDataRange().getValues();
  vals.shift();
  const last = {}, ids = {};
  vals.forEach(function (r) {
    const t = new Date(r[0]).getTime(), k = String(r[1] || ''), nick = String(r[2] || '').toLowerCase(), mod = String(r[4] || '');
    if (!nick || !MODS[mod] || (kod && k !== kod) || t < z.od || t >= z.do) return;
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
  const out = JSON.stringify({ ok: true, kod: kod, runda: rs[rs.length - 1].n, widok: z.klucz, rows: rows });
  if (out.length < 90000) cache.put(key, out, CACHE_S);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

/* ================= DANE TESTOWE (grupa TEST) =================
   wstawDaneTestowe(): 20 fikcyjnych osób z wyraźnymi efektami, żeby obejrzeć wykresy na rzutniku.
   usunDaneTestowe(): kasuje grupę TEST razem z jej PIN-em. Inne grupy i ich PIN-y zostają bez zmian. */
const KOD_TEST = 'TEST';

function kodPary_(x) {
  const i = x.indexOf('=');
  return i < 0 ? '' : x.slice(i + 1).split(':')[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function wstawDaneTestowe() {
  const props = PropertiesService.getScriptProperties(), pins = pins_();
  let pin = Object.keys(pins).filter(function (p) { return pins[p].kod === KOD_TEST; })[0];
  if (!pin) {
    const pary = (props.getProperty('PINY') || '').split(',').filter(function (x) { return x.trim(); });
    do { pin = String(100000 + Math.floor(Math.random() * 900000)); } while (pins[pin]);
    pary.push(pin + '=' + KOD_TEST + ':dane testowe');
    props.setProperty('PINY', pary.join(','));
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let tab = ss.getSheetByName('piny');
    if (!tab) { tab = ss.insertSheet('piny'); tab.appendRow(['grupa', 'PIN', 'opis', 'link dla studentów (QR)', 'link na rzutnik']); }
    tab.appendRow([KOD_TEST, "'" + pin, 'dane testowe', ADRES_STRONY + '?kod=' + KOD_TEST + '&pin=' + pin, ADRES_STRONY + '?tablica&kod=' + KOD_TEST]);
  }
  const R = function (a, b) { return a + Math.random() * (b - a); }, r0 = Math.round;
  const med = function (a) { const s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : r0((s[m - 1] + s[m]) / 2); };
  const avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
  const sd = function (a) { const m = avg(a); return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1)); };
  const five = function (m, spread) { const a = []; for (let k = 0; k < 5; k++) a.push(r0(m + R(-spread, spread))); return a; };
  const rows = [], now = new Date();
  for (let i = 1; i <= 20; i++) {
    const nick = 'test' + (i < 10 ? '0' : '') + i, sport = i % 2 ? 'T' : 'N';
    const dev = R(-30, 40) + (sport === 'T' ? -12 : 12);     // osoby trenujące sport z reakcją trochę szybsze
    const add = function (mod, score, disp, det) {
      rows.push([now, KOD_TEST, nick, sport, mod, r0(score), disp, JSON.stringify(det_(det, 0)), 'dane testowe', 'dane testowe']);
    };
    const rt = function (mod, m) {
      const t = five(m, 25), md = med(t), err = Math.random() < 0.2 ? 1 : 0;
      add(mod, md + 100 * err, md + ' ms', { med: md, rts: t, err: err });
      return md;
    };
    const prosty = rt('prosty', 260 + dev);
    rt('wybor2', 260 + dev + R(30, 60));
    rt('wybor4', 260 + dev + R(80, 130));
    rt('odliczanie', prosty - R(-15, 55));                   // u większości przewidywanie skraca reakcję
    const e = five(R(-20, 30), 50), ae = r0(avg(e.map(Math.abs)));
    add('rytm', ae, 'AE ' + ae + ' ms', { ae: ae, ce: r0(avg(e)), ve: r0(sd(e)), e: e, err: 0 });
    const rec = [0, 1, 2, 0, 1, 2].map(function (sp) { return { sp: sp, e: r0([-40, -5, 30][sp] + R(-35, 35)) }; });
    const es = rec.map(function (x) { return x.e; }), aeC = r0(avg(es.map(Math.abs)));
    add('cel', aeC, 'AE ' + aeC + ' ms', { ae: aeC, ce: r0(avg(es)), rec: rec, err: 0 });
    const g = five(300 + dev, 30), gm = med(g), comm = Math.random() < 0.3 ? 1 : 0;
    add('gonogo', gm + 100 * comm, gm + ' ms', { med: gm, rts: g, comm: comm, omis: 0, prem: 0 });
    const base = R(330, 450) + dev, sl = R(15, 35);
    const recS = [6, 12, 24, 6, 12, 24].map(function (n) { return { n: n, rt: r0(base + sl * n + R(-40, 40)) }; });
    const sm = med(recS.map(function (x) { return x.rt; }));
    add('szukanie', sm, sm + ' ms', { med: sm, slope: r0(sl), rec: recS, err: 0 });
    const mc = r0(R(520, 640) + dev), cost = r0(R(-20, 150)), mi = mc + cost, st = r0((mc + mi) / 2);
    add('stroop', st, st + ' ms', { med: st, mc: mc, mi: mi, cost: cost, err: 0, early: 0 });
  }
  const sh = sheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  CacheService.getScriptCache().removeAll(klucze_(KOD_TEST));
  Logger.log('Dodano ' + rows.length + ' wierszy (20 osób) w grupie ' + KOD_TEST + '. Rzutnik: ' + ADRES_STRONY + '?tablica&kod=' + KOD_TEST + '&pin=' + pin);
}

function usunDaneTestowe() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // usuwa wiersze z danym kodem w kolumnie kol (0 = pierwsza), od dołu, całymi blokami
  const usun = function (sh, kol) {
    if (!sh) return 0;
    const vals = sh.getDataRange().getValues();
    let n = 0, r = vals.length - 1;
    while (r >= 1) {
      if (String(vals[r][kol]) !== KOD_TEST) { r--; continue; }
      let start = r;
      while (start - 1 >= 1 && String(vals[start - 1][kol]) === KOD_TEST) start--;
      sh.deleteRows(start + 1, r - start + 1);
      n += r - start + 1; r = start - 1;
    }
    return n;
  };
  const n = usun(ss.getSheetByName(SHEET), 1);
  usun(ss.getSheetByName('piny'), 0);
  const props = PropertiesService.getScriptProperties();
  const pary = (props.getProperty('PINY') || '').split(',').filter(function (x) { return x.trim() && kodPary_(x) !== KOD_TEST; });
  props.setProperty('PINY', pary.join(','));
  props.setProperty('PINY_ADMIN', (props.getProperty('PINY_ADMIN') || '').split(',').filter(function (x) { return x.trim() && kodPary_(x) !== KOD_TEST; }).join(','));
  props.deleteProperty('RUNDY_' + KOD_TEST);
  CacheService.getScriptCache().removeAll(klucze_(KOD_TEST));
  Logger.log('Usunięto ' + n + ' wierszy grupy ' + KOD_TEST + ' i jej PIN. Pozostałe grupy bez zmian.');
}

/* ================= RUNDY I PIN PROWADZĄCEGO =================
   „Nowa runda” na tablicy: tablica i wykresy liczą tylko wyniki od początku bieżącej rundy.
   Nic nie jest kasowane: stare wiersze zostają w arkuszu (kolumna „runda”), rundę można cofnąć.
   Do zmiany rundy potrzebny jest PIN prowadzącego (PINY_ADMIN: 'pin=KOD,…'), którego studenci nie znają.
   PIN-y prowadzących tworzy dodajPinyProwadzacych() i wpisuje je do kolumny F arkusza „piny”. */

// historia rund grupy: [{n:1, od:0}, {n:2, od:<ms>}, …]; ostatni element = bieżąca runda
function rundy_(kod) {
  try {
    const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('RUNDY_' + kod) || '[]');
    if (Array.isArray(a) && a.length) return a;
  } catch (err) {}
  return [{ n: 1, od: 0 }];
}
function runda_(kod) { const a = rundy_(kod); return a[a.length - 1]; }

// klucze pamięci podręcznej tablicy i wykresów grupy: każda runda osobno plus „wszystkie” (i stare klucze bez rundy)
function klucze_(kod, rs) {
  const k = ['b_' + kod, 'g_' + kod, 'b_', 'g_'];
  (rs || rundy_(kod)).map(function (r) { return String(r.n); }).concat(['wszystkie']).forEach(function (x) { k.push('b_' + kod + '_' + x, 'g_' + kod + '_' + x); });
  return k;
}

// okno czasu do odczytu tablicy: bieżąca runda (domyślnie), wybrana runda (?runda=1) albo wszystkie (?runda=wszystkie);
// zawsze najwyżej DAYS dni wstecz. klucz = do pamięci podręcznej i jako „widok” w odpowiedzi.
function zakres_(rs, wyb) {
  const min = Date.now() - DAYS * 864e5;
  if (wyb === 'wszystkie') return { od: min, do: Infinity, klucz: 'wszystkie' };
  let i = rs.length - 1;
  for (let j = 0; j < rs.length; j++) if (String(rs[j].n) === String(wyb)) i = j;
  return { od: Math.max(min, rs[i].od), do: i + 1 < rs.length ? rs[i + 1].od : Infinity, klucz: String(rs[i].n) };
}

// PINY_ADMIN = "915302=WT,448190=MO" → { '915302': 'WT', '448190': 'MO' }
function adminPins_() {
  const m = {};
  (PropertiesService.getScriptProperties().getProperty('PINY_ADMIN') || '').split(',').forEach(function (x) {
    const i = x.indexOf('='), pin = i < 0 ? '' : x.slice(0, i).trim(), kod = kodPary_(x);
    if (pin && kod) m[pin] = kod;
  });
  return m;
}

// POST {akcja: 'nowa_runda' | 'cofnij_runde', pin: <PIN grupy>, adminPin: <PIN prowadzącego>}
function admin_(d) {
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (Number(cache.get('zly_pin') || 0) >= LIMIT_ZLY_PIN) return json_({ ok: false, code: 'locked', error: 'za dużo błędnych PIN-ów' });
    const grupa = pins_()[String(d.pin == null ? '' : d.pin).trim()];
    const kodAdm = adminPins_()[String(d.adminPin == null ? '' : d.adminPin).trim()];
    if (!grupa || !kodAdm || kodAdm !== grupa.kod) { bump_(cache, 'zly_pin', 600); return json_({ ok: false, code: 'admin', error: 'zły PIN prowadzącego' }); }
    const kod = grupa.kod, a = rundy_(kod);
    if (d.akcja === 'nowa_runda') a.push({ n: a[a.length - 1].n + 1, od: Date.now() });
    else if (d.akcja === 'cofnij_runde') { if (a.length > 1) a.pop(); }
    else return json_({ ok: false, error: 'nieznana akcja' });
    PropertiesService.getScriptProperties().setProperty('RUNDY_' + kod, JSON.stringify(a.slice(-50)));
    cache.removeAll(klucze_(kod, a));
    return json_({ ok: true, kod: kod, runda: a[a.length - 1].n });
  } finally {
    lock.releaseLock();
  }
}

// Uruchom z edytora: każda grupa z PINY bez PIN-u prowadzącego dostaje go (6 cyfr, różny od PIN-ów grup).
// Istniejące PIN-y prowadzących zostają. Wpisuje je do kolumny F arkusza „piny”.
function dodajPinyProwadzacych() {
  const props = PropertiesService.getScriptProperties(), pins = pins_(), adm = adminPins_();
  const zKodu = {}, used = {};
  Object.keys(adm).forEach(function (p) { zKodu[adm[p]] = p; used[p] = 1; });
  Object.keys(pins).forEach(function (p) { used[p] = 1; });
  const pary = (props.getProperty('PINY_ADMIN') || '').split(',').filter(function (x) { return x.trim(); });
  const nowe = [];
  Object.keys(pins).forEach(function (p) {
    const kod = pins[p].kod;
    if (zKodu[kod]) return;
    let a;
    do { a = String(100000 + Math.floor(Math.random() * 900000)); } while (used[a]);
    used[a] = 1; zKodu[kod] = a; pary.push(a + '=' + kod); nowe.push(kod);
  });
  props.setProperty('PINY_ADMIN', pary.join(','));
  const tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('piny');
  if (tab) {
    tab.getRange(1, 6).setValue('PIN prowadzącego (nowa runda)');
    const vals = tab.getDataRange().getValues();
    for (let r = 1; r < vals.length; r++) { const k = String(vals[r][0]); if (zKodu[k]) tab.getRange(r + 1, 6).setValue("'" + zKodu[k]); }
    tab.autoResizeColumns(1, 6);
  }
  Logger.log(nowe.length ? 'PIN prowadzącego dla grup: ' + nowe.join(', ') + ' (kolumna F w arkuszu „piny”)' : 'Wszystkie grupy mają już PIN prowadzącego.');
}
