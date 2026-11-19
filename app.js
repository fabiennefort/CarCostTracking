import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { ic, iconKey, CAT_ICONS, REM_ICONS } from './icons.js';
import { computeStats, parseDate, isoDate, kmPerDay, reminderStatus, nextReminder, costView, DEFAULT_FILTER } from './stats.js';

// ---------------------------------------------------------------------------
//  Hilfsfunktionen
// ---------------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => isoDate(new Date());
const nf = (d) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n) ? '–' : nf(d).format(n));
const eur = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? '–' : `${fmt(n, d)} €`);
const perKm = (n) => (n === null || n === undefined ? '–' : `${fmt(n, 2)} €`);
const dDate = (s) => (s ? parseDate(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const mLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''); };
const parseNum = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const numIn = (n) => (n === null || n === undefined || n === '' ? '' : String(Number(n)).replace('.', ','));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const INTERVALS = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };

// Farbwelten
const THEMES = [['salbei', 'Salbei', ['#f4f2ee', '#1e6b5c', '#c25f1c']], ['klar', 'Klar', ['#f5f6f8', '#1f5fbf', '#eb6834']], ['graphit', 'Graphit', ['#17191c', '#e2b04a', '#3987e5']]];
const currentTheme = () => document.documentElement.dataset.theme || 'salbei';
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* egal */ }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function fail(err) {
  console.error(err);
  toast(err?.message ? `Fehler: ${err.message}` : 'Etwas ist schiefgelaufen', 4000);
}

// ---------------------------------------------------------------------------
//  Supabase & Zustand
// ---------------------------------------------------------------------------
const configured = !SUPABASE_URL.includes('DEIN-PROJEKT') && !SUPABASE_ANON_KEY.includes('DEIN-ANON');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const S = {
  session: null,
  cars: [],
  carId: localStorage.getItem('carId'),
  d: { categories: [], expenses: [], odometer: [], contracts: [], moments: [], photos: [], members: [], reminders: [] },
  tab: 'home',
  page: null,
  wiz: null,
  sub: { costs: 'stats', fuel: 'stats' },
  filter: 'all',
  authMode: 'login',
};
const car = () => S.cars.find((c) => c.id === S.carId);
const unit = () => (car()?.fuel_unit === 'kWh' ? 'kWh' : 'l');
const unitLong = () => (car()?.fuel_unit === 'kWh' ? 'kWh' : 'Liter');
const catById = (id) => S.d.categories.find((c) => c.id === id);
const activeCats = () => S.d.categories.filter((c) => !c.archived).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

async function loadCars() {
  S.cars = await q(sb.from('cars').select('*').order('created_at'));
  if (!S.cars.find((c) => c.id === S.carId)) S.carId = S.cars[0]?.id || null;
  if (S.carId) localStorage.setItem('carId', S.carId);
}

async function loadCarData() {
  if (!S.carId) return;
  const id = S.carId;
  const [categories, expenses, odometer, contracts, moments, photos, members, reminders] = await Promise.all([
    q(sb.from('categories').select('*').eq('car_id', id)),
    q(sb.from('expenses').select('*').eq('car_id', id).order('date', { ascending: false }).order('created_at', { ascending: false })),
    q(sb.from('odometer').select('*').eq('car_id', id).order('date', { ascending: false })),
    q(sb.from('contracts').select('*').eq('car_id', id).order('start_date')),
    q(sb.from('moments').select('*').eq('car_id', id).order('date', { ascending: false })),
    q(sb.from('moment_photos').select('*').eq('car_id', id).order('created_at')),
    q(sb.from('car_members').select('*').eq('car_id', id).order('joined_at')),
    q(sb.from('reminders').select('*').eq('car_id', id)),
  ]);
  S.d = { categories, expenses, odometer, contracts, moments, photos, members, reminders };
}

async function refresh() {
  try { await loadCars(); await loadCarData(); render(); } catch (e) { fail(e); }
}

// ---------------------------------------------------------------------------
//  Fotos: verkleinern, hochladen, signierte URLs
// ---------------------------------------------------------------------------
async function compressImage(file, max = 1600, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}
async function uploadPhoto(file) {
  const blob = await compressImage(file);
  const path = `${S.carId}/${uuid()}.jpg`;
  await q(sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
  return path;
}
const urlCache = new Map();
async function hydratePhotos(root = document) {
  const imgs = $$('img[data-path]', root).filter((i) => !i.src);
  const need = [...new Set(imgs.map((i) => i.dataset.path).filter((p) => !urlCache.has(p)))];
  if (need.length) {
    try {
      const res = await q(sb.storage.from('photos').createSignedUrls(need, 60 * 60 * 6));
      res.forEach((r) => r.signedUrl && urlCache.set(r.path, r.signedUrl));
    } catch (e) { console.warn(e); }
  }
  imgs.forEach((i) => { const u = urlCache.get(i.dataset.path); if (u) i.src = u; });
}
function viewPhoto(path) {
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = `<img alt="" data-path="${esc(path)}">`;
  v.onclick = () => v.remove();
  document.body.appendChild(v);
  hydratePhotos(v);
}

// ---------------------------------------------------------------------------
//  Bottom-Sheet
// ---------------------------------------------------------------------------
function openSheet(title, html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div>
      <h3><span>${esc(title)}</span><button type="button" data-close aria-label="Schließen">${ic('x')}</button></h3>
      <div class="sheet-body">${html}</div>
    </div>`;
  $('.backdrop', root).onclick = closeSheet;
  $('[data-close]', root).onclick = closeSheet;
  const body = $('.sheet-body', root);
  onMount?.(body);
  hydratePhotos(body);
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }

function busy(form, on) { $$('button', form).forEach((b) => (b.disabled = on)); }
async function submitWith(form, fn) {
  busy(form, true);
  try { await fn(); closeSheet(); await refresh(); }
  catch (e) { fail(e); }
  finally { busy(form, false); }
}

// ---------------------------------------------------------------------------
//  Anmeldung
// ---------------------------------------------------------------------------
function renderNotConfigured() {
  $('#app').innerHTML = `<div class="auth">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Fast geschafft</h1>
    <p class="sub">Trage in <b>config.js</b> die Projekt-URL und den anon-Schlüssel deines Supabase-Projekts ein (siehe Anleitung, Schritt 3).</p>
  </div>`;
}

function renderAuth() {
  const login = S.authMode === 'login';
  $('#app').innerHTML = `<div class="auth">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Autokosten</h1>
    <p class="sub">Was kostet unser Auto wirklich?</p>
    <div class="seg"><button data-m="login" class="${login ? 'on' : ''}">Anmelden</button><button data-m="signup" class="${login ? '' : 'on'}">Registrieren</button></div>
    <form id="auth">
      <label class="f"><span>E-Mail</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="f"><span>Passwort</span><input name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" minlength="6" required></label>
      <div class="btns"><button class="btn" type="submit">${login ? 'Anmelden' : 'Konto erstellen'}</button></div>
    </form>
  </div>`;
  $$('.seg button').forEach((b) => (b.onclick = () => { S.authMode = b.dataset.m; renderAuth(); }));
  $('#auth').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const email = f.get('email').trim(), password = f.get('password');
    busy(ev.target, true);
    try {
      if (login) {
        await q(sb.auth.signInWithPassword({ email, password }));
      } else {
        const data = await q(sb.auth.signUp({ email, password }));
        if (!data.session) toast('Konto erstellt. Bitte E-Mail bestätigen und dann anmelden.', 5000);
      }
    } catch (e) {
      fail(e.message?.includes('Invalid login') ? { message: 'E-Mail oder Passwort falsch' } : e);
    } finally { busy(ev.target, false); }
  };
}

// ---------------------------------------------------------------------------
//  Begrüßung, Einrichtungsassistent, Beitreten
// ---------------------------------------------------------------------------
function joinForm() {
  return `<form id="join">
    <label class="f"><span>Einladungscode</span><input name="code" autocapitalize="characters" autocomplete="off" placeholder="z. B. 7F3A9C21" required></label>
    <div class="btns"><button class="btn" type="submit">Beitreten</button></div>
  </form>`;
}
function bindJoin(root) {
  $('#join', root).onsubmit = async (ev) => {
    ev.preventDefault();
    busy(ev.target, true);
    try {
      const id = await q(sb.rpc('join_car', { p_code: new FormData(ev.target).get('code') }));
      S.carId = id; localStorage.setItem('carId', id); S.tab = 'home'; S.page = null;
      S.wiz = { mode: 'joined', step: 0 };
      closeSheet(); await refresh();
    } catch (e) { fail(/ungültig|abgelaufen/.test(e.message || '') ? { message: 'Code ungültig oder abgelaufen – bitte um einen neuen Code.' } : e); }
    finally { busy(ev.target, false); }
  };
}
function startWizard() { closeSheet(); S.wiz = { mode: 'new', step: 1 }; render(); window.scrollTo(0, 0); }

function renderOnboarding() {
  $('#app').innerHTML = `<div class="wiz welcome">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Willkommen bei Autokosten</h1>
    <p class="sub">Was kostet euer Auto wirklich – pro km, pro Monat, über die ganze Zeit?</p>
    <ul class="feat">
      <li><span>${ic('wallet')}</span><div><b>Alle Kosten an einem Ort</b><br>nach Kategorien, fix oder nutzungsabhängig</div></li>
      <li><span>${ic('fuel')}</span><div><b>Echter Verbrauch</b><br>aus euren Tankbelegen, über Monate gemittelt</div></li>
      <li><span>${ic('bell')}</span><div><b>Fristen im Blick</b><br>TÜV, Ölwechsel und Reifen nach Datum oder km</div></li>
      <li><span>${ic('users')}</span><div><b>Gemeinsam nutzen</b><br>beide tragen ein, beide sehen alles</div></li>
      <li><span>${ic('images')}</span><div><b>Erlebnisse</b><br>Fotos von Urlauben und Ausflügen</div></li>
    </ul>
    <div class="btns">
      <button class="btn" id="start">Unser Auto anlegen</button>
      <button class="btn secondary" id="code">Ich habe einen Einladungscode</button>
    </div>
    <p class="small muted" style="text-align:center;margin-top:24px">Angemeldet als ${esc(S.session.user.email)} · <button class="linklike" id="logout">Abmelden</button></p>
  </div>`;
  $('#start').onclick = startWizard;
  $('#code').onclick = () => openSheet('Einladungscode', `<p class="small muted" style="margin-top:0">Den Code bekommst du von jemandem, der das Auto schon nutzt (in der App unter Einstellungen → Gemeinsam nutzen). Er ist 24 Stunden gültig und nur einmal verwendbar.</p>${joinForm()}`, bindJoin);
  $('#logout').onclick = () => sb.auth.signOut();
}

const EXTRA_CATS = [
  { name: 'Bußgelder', icon: 'siren', kind: 'variabel', hint: 'Strafzettel, Blitzer' },
  { name: 'Mitgliedschaften', icon: 'id-card', kind: 'fix', hint: 'ADAC, Automobilclub' },
  { name: 'Bewohnerparken', icon: 'house', kind: 'fix', hint: 'Anwohnerparkausweis' },
  { name: 'Zubehör', icon: 'package', kind: 'variabel', hint: 'Matten, Halter, Kindersitz' },
  { name: 'Finanzierung/Leasing', icon: 'banknote', kind: 'fix', hint: 'Raten, Zinsen' },
  { name: 'Erstattungen', icon: 'receipt-euro', kind: 'einnahme', hint: 'z. B. Versicherung zahlt Schaden' },
];
const WIZ_STEPS = ['auto', 'fix', 'remind', 'cats', 'share', 'done'];
const catByName = (part) => S.d.categories.find((c) => c.name.toLowerCase().includes(part.toLowerCase()));
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function renderWizard() {
  const w = S.wiz;
  if (w.mode === 'joined') return renderJoinedWelcome();
  const key = WIZ_STEPS[w.step - 1];
  const c = car();
  const step = WIZ[key](c);
  const n = WIZ_STEPS.length - 1; // "Fertig" zählt nicht
  $('#app').innerHTML = `<div class="wiz">
    ${key !== 'done' ? `<div class="wiztop"><div class="prog"><i style="width:${(w.step / n) * 100}%"></i></div>
      <div class="small muted">Schritt ${w.step} von ${n}</div></div>` : ''}
    <h1>${step.title}</h1>
    <p class="sub">${step.sub}</p>
    <form id="wiz" novalidate>${step.html}
      <div class="btns">
        <button class="btn" type="submit">${step.next || 'Weiter'}</button>
        ${step.skip !== false ? `<button class="btn secondary" type="button" id="skip">${step.skipLabel || 'Überspringen'}</button>` : ''}
        ${w.step === 1 && S.cars.length ? '<button class="btn danger" type="button" id="cancel">Abbrechen</button>' : ''}
      </div>
    </form>
  </div>`;
  const form = $('#wiz');
  step.bind?.(form);
  const next = () => {
    if (w.step >= WIZ_STEPS.length) { S.wiz = null; S.tab = 'home'; S.page = null; render(); }
    else { w.step += 1; render(); }
    window.scrollTo(0, 0);
  };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    busy(form, true);
    try { await step.save?.(form); next(); } catch (e) { fail(e); } finally { busy(form, false); }
  };
  $('#skip')?.addEventListener('click', next);
  $('#cancel')?.addEventListener('click', () => { S.wiz = null; render(); });
}

const WIZ = {
  auto: (c) => ({
    title: 'Euer Auto',
    sub: 'Ab hier zählt jeder Euro und jeder Kilometer. Ihr habt das Auto schon länger? Dann startet ihr einfach mit einem geschätzten Wert.',
    skip: false,
    html: `
      <div class="seg" role="radiogroup" style="grid-template-columns:1fr 1fr">
        <button type="button" data-start="new" class="on">Gerade gekauft</button>
        <button type="button" data-start="existing">Haben wir schon länger</button>
      </div>
      <p class="small muted" id="starthint" style="margin:-6px 2px 12px"></p>
      <label class="f"><span>Wie nennt ihr es?</span><input name="name" value="${esc(c?.name)}" placeholder="z. B. Golf, der Blaue, Emma …" required></label>
      <div class="grid2">
        <label class="f"><span id="l-date">Kaufdatum</span><input name="date" type="date" value="${c?.purchase_date ?? today()}" required></label>
        <label class="f"><span id="l-price">Kaufpreis (€)</span><input name="price" inputmode="decimal" value="${numIn(c?.purchase_price)}" placeholder="8.500" required></label>
      </div>
      <label class="f"><span id="l-km">km-Stand beim Kauf</span><input name="km" inputmode="numeric" value="${c?.start_km ?? ''}" placeholder="120.000" required></label>
      <label class="f"><span>Antrieb</span><select name="unit"><option value="l">Benzin / Diesel / Gas (Liter)</option><option value="kWh" ${c?.fuel_unit === 'kWh' ? 'selected' : ''}>Elektro (kWh)</option></select></label>
      <div id="resbox"><label class="f"><span>Was ist es heute ungefähr wert? (optional)</span><input name="res" inputmode="decimal" value="${numIn(c?.residual_value)}" placeholder="z. B. Schätzung von mobile.de"></label>
      <p class="small muted" style="margin:-4px 2px 8px">Mit dem Restwert rechnet die App den Wertverlust ein – oft der größte Kostenblock. Kannst du jederzeit nachtragen.</p></div>`,
    bind: (f) => {
      const T = {
        new: { hint: 'Kaufpreis und km-Stand beim Kauf sind euer Startpunkt.', date: 'Kaufdatum', price: 'Kaufpreis (€)', km: 'km-Stand beim Kauf' },
        existing: { hint: 'Kein Problem: Gib einfach den heutigen km-Stand und einen geschätzten Wert des Autos an (z. B. von mobile.de oder der DAT-Bewertung). Ab diesem Ausgangswert rechnet die App – alles davor bleibt außen vor.', date: 'Ab wann erfassen?', price: 'Geschätzter Wert zum Start (€)', km: 'km-Stand zum Start' },
      };
      const set = (m) => {
        $$('[data-start]', f).forEach((b) => b.classList.toggle('on', b.dataset.start === m));
        const t = T[m];
        $('#starthint', f).textContent = t.hint; $('#l-date', f).textContent = t.date; $('#l-price', f).textContent = t.price; $('#l-km', f).textContent = t.km;
        f.price.placeholder = m === 'new' ? '8.500' : 'z. B. 6.000';
        if (m === 'existing' && !S.wiz.carId) f.date.value = today();
        $('#resbox', f).hidden = m === 'existing';
        if (m === 'existing') f.res.value = '';
      };
      $$('[data-start]', f).forEach((b) => (b.onclick = () => set(b.dataset.start)));
      set('new');
    },
    save: async (f) => {
      const price = parseNum(f.price.value), km = parseNum(f.km.value), res = parseNum(f.res.value);
      if (!f.name.value.trim()) throw new Error('Bitte einen Namen eingeben');
      if (price === null || km === null || [price, km, res].some(Number.isNaN)) throw new Error('Bitte Preis bzw. Wert und km-Stand prüfen');
      if (S.wiz.carId) {
        await q(sb.from('cars').update({ name: f.name.value.trim(), purchase_date: f.date.value, purchase_price: price, start_km: Math.round(km), fuel_unit: f.unit.value, residual_value: res }).eq('id', S.wiz.carId));
      } else {
        const id = await q(sb.rpc('create_car', { p_name: f.name.value.trim(), p_purchase_date: f.date.value, p_purchase_price: price, p_start_km: Math.round(km), p_fuel_unit: f.unit.value }));
        S.wiz.carId = id; S.carId = id; localStorage.setItem('carId', id);
        if (res !== null) await q(sb.from('cars').update({ residual_value: res }).eq('id', id));
      }
      await loadCars(); await loadCarData();
    },
  }),

  fix: (c) => ({
    title: 'Laufende Kosten',
    sub: 'Versicherung und Steuer einmal eintragen – die App zählt jede Zahlung automatisch mit.',
    html: `
      <div class="card wizcard"><div class="wizlabel">${ic('shield')} Versicherung</div>
        <div class="grid2">
          <label class="f"><span>Betrag je Zahlung (€)</span><input name="ins" inputmode="decimal" placeholder="z. B. 52,30"></label>
          <label class="f"><span>Zahlweise</span><select name="insint">${Object.entries(INTERVALS).map(([m, l]) => `<option value="${m}" ${m === '1' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="f"><span>Erste Zahlung am</span><input name="insdate" type="date" value="${c.purchase_date}"></label>
        <div class="small muted">Steht auf der Beitragsrechnung.</div></div>
      <div class="card wizcard"><div class="wizlabel">${ic('landmark')} Kfz-Steuer</div>
        <div class="grid2">
          <label class="f"><span>Betrag pro Jahr (€)</span><input name="tax" inputmode="decimal" placeholder="z. B. 148"></label>
          <label class="f"><span>Abbuchung am</span><input name="taxdate" type="date" value="${c.purchase_date}"></label>
        </div>
        <div class="small muted">Steht im Steuerbescheid vom Hauptzollamt.</div></div>
      <p class="small muted" style="margin:4px 2px">ADAC, Leasing & Co. kannst du später unter Kosten → Laufend ergänzen.</p>`,
    save: async (f) => {
      const ins = parseNum(f.ins.value), tax = parseNum(f.tax.value);
      if ([ins, tax].some(Number.isNaN)) throw new Error('Bitte Beträge prüfen');
      const rows = [];
      if (ins) rows.push({ car_id: S.carId, category_id: catByName('Versicherung')?.id, name: 'Kfz-Versicherung', amount: ins, interval_months: Number(f.insint.value), start_date: f.insdate.value || c.purchase_date });
      if (tax) rows.push({ car_id: S.carId, category_id: catByName('Steuer')?.id, name: 'Kfz-Steuer', amount: tax, interval_months: 12, start_date: f.taxdate.value || c.purchase_date });
      if (rows.some((r) => !r.category_id)) throw new Error('Kategorie fehlt – bitte später unter Kosten → Laufend anlegen');
      if (rows.length) { await q(sb.from('contracts').insert(rows)); await loadCarData(); }
    },
  }),

  remind: (c) => ({
    title: 'Erinnerungen',
    sub: 'Die App meldet sich, bevor etwas fällig wird. Alles optional – trag ein, was du weißt.',
    html: `
      <label class="f"><span>Nächster TÜV</span><input name="tuv" type="month" min="${today().slice(0, 7)}"><small class="help">Der Monat steht auf der Plakette am hinteren Kennzeichen.</small></label>
      <label class="f"><span>Nächster Ölwechsel bei km</span><input name="oil" inputmode="numeric" placeholder="z. B. ${fmt(Math.ceil(((Number(c.start_km) || 0) + 15000) / 1000) * 1000)}"><small class="help">Steht meist auf einem Aufkleber im Motorraum oder im Serviceheft.</small></label>
      <label class="check"><input type="checkbox" name="tires" checked><span>An den Reifenwechsel erinnern (Mitte Oktober und Mitte April)</span></label>
      <label class="check"><input type="checkbox" name="insc" checked><span>Jährlich Anfang November an den Versicherungsvergleich erinnern (Stichtag 30.11.)</span></label>`,
    save: async (f) => {
      const oil = parseNum(f.oil.value);
      if (Number.isNaN(oil)) throw new Error('Bitte km prüfen');
      const cid = (n) => catByName(n)?.id || null;
      const rows = [];
      if (f.tuv.value) { const [y, m] = f.tuv.value.split('-').map(Number); rows.push({ title: 'TÜV / HU', icon: 'clipboard-check', category_id: cid('TÜV'), due_date: isoDate(new Date(y, m, 0)), repeat_months: 24 }); }
      if (oil) rows.push({ title: 'Ölwechsel', icon: 'droplet', category_id: cid('Öl'), due_km: Math.round(oil), repeat_km: 15000, repeat_months: 12 });
      if (f.tires.checked) {
        rows.push({ title: 'Winterreifen drauf', icon: 'snowflake', category_id: cid('Reifen'), due_date: nextOn(10, 15), repeat_months: 12 });
        rows.push({ title: 'Sommerreifen drauf', icon: 'sun', category_id: cid('Reifen'), due_date: nextOn(4, 15), repeat_months: 12 });
      }
      if (f.insc.checked) rows.push({ title: 'Versicherung vergleichen', icon: 'shield', category_id: cid('Versicherung'), due_date: nextOn(11, 1), repeat_months: 12, note: 'Wechselstichtag ist meist der 30.11.' });
      if (rows.length) { await q(sb.from('reminders').insert(rows.map((r) => ({ car_id: S.carId, ...r })))); await loadCarData(); }
    },
  }),

  cats: () => {
    const have = new Set(S.d.categories.map((c) => c.name.toLowerCase()));
    return {
      title: 'Kategorien',
      sub: 'Diese sind schon da: ' + S.d.categories.filter((c) => !c.archived).map((c) => esc(c.name)).join(', ') + '. Brauchst du noch mehr?',
      html: `<div class="pick">${EXTRA_CATS.filter((x) => !have.has(x.name.toLowerCase())).map((x, i) => `
          <label class="pickitem"><input type="checkbox" name="x${i}" value="${esc(x.name)}"><span class="pi">${ic(x.icon)}</span><span><b>${esc(x.name)}</b><br><span class="small muted">${esc(x.hint)} · ${({ fix: 'Fixkosten', einnahme: 'Einnahme', variabel: 'Nutzung' })[x.kind]}</span></span></label>`).join('')}</div>
        <p class="small muted" style="margin:10px 2px">Eigene Kategorien kannst du jederzeit unter Einstellungen → Kategorien anlegen.</p>`,
      save: async (f) => {
        const picked = $$('input[type=checkbox]:checked', f).map((i) => EXTRA_CATS.find((x) => x.name === i.value));
        if (picked.length) {
          await q(sb.from('categories').insert(picked.map((x, i) => ({ car_id: S.carId, name: x.name, icon: x.icon, kind: x.kind, sort: 150 + i }))));
          await loadCarData();
        }
      },
    };
  },

  share: (c) => ({
    title: 'Gemeinsam nutzen',
    sub: 'Erzeuge einen Einladungscode und schick ihn deiner Partnerin. Sie öffnet die App, registriert sich und tippt auf „Ich habe einen Einladungscode“.',
    html: `<div class="card wizcard" id="invbox">${inviteBox(c)}</div>
      <p class="small muted" style="margin:10px 2px">Das geht auch später unter Einstellungen → Gemeinsam nutzen.</p>`,
    skipLabel: 'Später',
    bind: (f) => { const upd = () => { $('#invbox', f).innerHTML = inviteBox(car()); bindInviteBox(f, car(), upd); }; bindInviteBox(f, c, upd); },
  }),

  done: (c) => ({
    title: 'Alles eingerichtet',
    sub: `„${esc(c.name)}“ ist eingerichtet. Ab jetzt einfach bei jedem Tanken und jeder Rechnung unten auf <b>+</b> tippen.`,
    skip: false,
    next: 'Los geht’s',
    html: `${isStandalone() ? '' : `<div class="card wizcard"><div class="wizlabel">${ic('smartphone')} Als App auf den Home-Bildschirm</div>
        <div class="small">In Safari unten auf <b>Teilen</b> (Quadrat mit Pfeil) → <b>„Zum Home-Bildschirm“</b>. Danach die App immer über das neue Symbol öffnen.</div></div>`}
      <div class="card wizcard"><div class="wizlabel">So geht’s weiter</div>
        <ul class="steps small"><li><b>Tanken:</b> Betrag, Liter und km-Stand – daraus entsteht euer echter Verbrauch.</li>
        <li><b>Kosten und Einnahmen:</b> Werkstatt, Parken, Spritgeld von Mitfahrern.</li>
        <li><b>Auswertung:</b> unter „Kosten“. Mit den Filtern legst du fest, was mitzählt.</li></ul></div>`,
  }),
};

function renderJoinedWelcome() {
  const c = car();
  const others = S.d.members.filter((m) => m.user_id !== S.session.user.id).map((m) => esc(m.email || 'jemand')).join(', ');
  const st = stats();
  $('#app').innerHTML = `<div class="wiz welcome">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Willkommen bei „${esc(c.name)}“</h1>
    <p class="sub">Du teilst dir dieses Auto jetzt${others ? ` mit ${others}` : ''}. Alles, was ihr eintragt, sehen beide sofort.</p>
    <div class="tiles" style="margin-bottom:14px">
      <div class="tile"><div class="k">Bisher eingetragen</div><div class="v num">${S.d.expenses.length}</div><div class="s">Einträge</div></div>
      <div class="tile"><div class="k">km seit Kauf</div><div class="v num">${fmt(st.kmDriven)}</div><div class="s">Stand ${fmt(st.kmNow)} km</div></div>
    </div>
    ${isStandalone() ? '' : `<div class="card wizcard"><div class="wizlabel">${ic('smartphone')} Als App auf den Home-Bildschirm</div><div class="small">In Safari auf <b>Teilen</b> → <b>„Zum Home-Bildschirm“</b>.</div></div>`}
    <div class="btns"><button class="btn" id="go">Los geht’s</button></div>
  </div>`;
  $('#go').onclick = () => { S.wiz = null; S.tab = 'home'; S.page = null; render(); };
}

const inviteActive = (c) => !!(c?.invite_code && c.invite_expires_at && new Date(c.invite_expires_at) > new Date());
const inviteUntil = (c) => new Date(c.invite_expires_at).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
async function createInvite(c) {
  await q(sb.rpc('new_invite_code', { p_car: c.id }));
  await loadCars();
}
function inviteBox(c) {
  return inviteActive(c)
    ? `<div class="code">${esc(c.invite_code)}</div>
       <div class="small muted" style="text-align:center;margin-top:6px">gültig bis ${inviteUntil(c)} Uhr · nur einmal verwendbar</div>
       <div class="grid2" style="margin-top:10px"><button type="button" class="btn secondary small" id="sharecode" style="width:100%">Code teilen</button><button type="button" class="btn secondary small" id="cancelcode" style="width:100%">Zurückziehen</button></div>`
    : `<div class="small muted" style="margin-bottom:10px">Der Code ist <b>24 Stunden gültig</b> und funktioniert <b>nur einmal</b> – danach verfällt er automatisch. Erzeuge ihn erst, wenn du ihn gleich verschickst.</div>
       <button type="button" class="btn" id="newcode">Einladungscode erzeugen</button>`;
}
function bindInviteBox(root, c, after) {
  $('#sharecode', root)?.addEventListener('click', () => shareInvite(car()));
  $('#newcode', root)?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try { await createInvite(c); after(); } catch (e) { fail(e); ev.target.disabled = false; }
  });
  $('#cancelcode', root)?.addEventListener('click', async () => {
    try { await q(sb.rpc('cancel_invite', { p_car: c.id })); await loadCars(); toast('Einladung zurückgezogen'); after(); } catch (e) { fail(e); }
  });
}
async function shareInvite(c) {
  const text = `Tritt unserem Auto „${c.name}“ in der Autokosten-App bei: ${location.origin}${location.pathname}\nCode: ${c.invite_code}\n(gültig bis ${inviteUntil(c)} Uhr, nur einmal verwendbar)`;
  try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Kopiert'); } } catch { /* abgebrochen */ }
}

// ---------------------------------------------------------------------------
//  Meine Autos (Verwaltung)
// ---------------------------------------------------------------------------
function viewGarage(v) {
  const me = S.session.user.id;
  v.innerHTML = `
    <section><div class="list">${S.cars.map((x) => `<button class="row" data-car="${x.id}">
      <div class="ic">${ic(x.fuel_unit === 'kWh' ? 'plug-zap' : 'car-front')}</div>
      <div class="main"><div class="t">${esc(x.name)}${x.id === S.carId ? ' <span class="small muted">· ausgewählt</span>' : ''}</div>
      <div class="d">seit ${dDate(x.purchase_date)}${x.sale_date ? ` · verkauft ${dDate(x.sale_date)}` : ''}${x.created_by === me ? '' : ' · geteilt mit dir'}</div></div>
      <div class="amt">${ic(x.id === S.carId ? 'check' : 'chevron-right', 'chev-i')}</div></button>`).join('')}</div></section>
    <div class="btns">
      <button class="btn" id="newcar">+ Neues Auto anlegen</button>
      <button class="btn secondary" id="joincar">Mit Einladungscode beitreten</button>
    </div>
    ${car() && car().created_by !== me ? `<section><h2>„${esc(car().name)}“</h2><div class="btns"><button class="btn danger" id="leave">Dieses Auto verlassen</button></div>
      <p class="small muted" style="margin:0 4px">Du verlierst den Zugriff, die Daten bleiben für die anderen erhalten.</p></section>` : ''}`;
  $$('[data-car]', v).forEach((b) => (b.onclick = async () => {
    S.carId = b.dataset.car; localStorage.setItem('carId', S.carId); S.page = null; S.tab = 'home';
    await refresh(); window.scrollTo(0, 0);
  }));
  $('#newcar', v).onclick = startWizard;
  $('#joincar', v).onclick = () => openSheet('Einladungscode', joinForm(), bindJoin);
  $('#leave', v)?.addEventListener('click', async () => {
    if (!confirm(`„${car().name}“ wirklich verlassen?`)) return;
    try {
      await q(sb.from('car_members').delete().eq('car_id', S.carId).eq('user_id', me));
      localStorage.removeItem('carId'); S.carId = null; S.page = null; S.tab = 'home';
      await refresh();
    } catch (e) { fail(e); }
  });
}

// ---------------------------------------------------------------------------
//  Hauptansicht & Navigation
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'home', icon: 'house', label: 'Übersicht' },
  { id: 'costs', icon: 'wallet', label: 'Kosten' },
  { id: 'add', icon: '+', label: '' },
  { id: 'fuel', icon: 'fuel', label: 'Verbrauch' },
  { id: 'album', icon: 'images', label: 'Erlebnisse' },
];
const PAGE_TITLES = { costs: 'Kosten', fuel: 'Verbrauch', album: 'Erlebnisse', settings: 'Einstellungen', reminders: 'Erinnerungen', garage: 'Meine Autos' };

function go(tab, sub) {
  S.page = null; S.tab = tab;
  if (sub) S.sub[tab] = sub;
  render(); window.scrollTo(0, 0);
}
function openPage(p) { S.page = p; render(); window.scrollTo(0, 0); }

function render() {
  if (!S.session) return renderAuth();
  if (S.wiz) return renderWizard();
  if (!S.cars.length) return renderOnboarding();
  const c = car();
  const key = S.page || S.tab;
  let head;
  if (S.page) head = `<button class="back" id="back" aria-label="Zurück">${ic('chevron-left')}</button><h1>${PAGE_TITLES[S.page]}</h1>`;
  else if (key !== 'home') head = `<h1>${PAGE_TITLES[key]}</h1>`;
  else head = `<button class="carbtn" data-page="garage" aria-label="Autos verwalten"><h1>${esc(c.name)}</h1><span class="caret">${ic('chevron-down')}</span></button>`;
  $('#app').innerHTML = `
    <header class="top"><div class="ttl">${head}</div>${S.page ? '' : `<button class="gear" id="gear" aria-label="Einstellungen">${ic('settings')}</button>`}</header>
    <main id="view"></main>
    <nav class="tabs">${TABS.map((t) => t.id === 'add'
      ? `<button data-tab="add" aria-label="Neuer Eintrag"><span class="plus">${ic('plus')}</span></button>`
      : `<button data-tab="${t.id}" class="${!S.page && S.tab === t.id ? 'on' : ''}"><span class="i">${ic(t.icon)}</span>${t.label}</button>`).join('')}</nav>`;
  $$('nav.tabs button').forEach((b) => (b.onclick = () => (b.dataset.tab === 'add' ? openAddChooser() : go(b.dataset.tab))));
  $('#gear')?.addEventListener('click', () => openPage('settings'));
  $('#back')?.addEventListener('click', () => { S.page = null; render(); window.scrollTo(0, 0); });
  const v = $('#view');
  ({ home: viewHome, costs: viewCosts, fuel: viewFuel, album: viewAlbum, settings: viewSettings, reminders: viewReminders, garage: viewGarage })[key](v);
  bindNav(v);
  bindNav($('header.top'));
  hydratePhotos(v);
  updateBadge();
}

/** Elemente mit data-go="tab[:sub]" oder data-page="…" werden zu Links. */
function bindNav(root) {
  $$('[data-go]', root).forEach((el) => (el.onclick = () => { const [t, s] = el.dataset.go.split(':'); go(t, s); }));
  $$('[data-page]', root).forEach((el) => (el.onclick = () => openPage(el.dataset.page)));
}
function segment(name, opts) {
  return `<div class="seg" style="grid-template-columns:repeat(${opts.length},1fr)">${opts.map(([id, l]) => `<button data-sub="${name}:${id}" class="${S.sub[name] === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function bindSegment(root) {
  $$('[data-sub]', root).forEach((b) => (b.onclick = () => { const [n, id] = b.dataset.sub.split(':'); S.sub[n] = id; render(); }));
}
const stats = () => computeStats({ car: car(), ...S.d });
const FKEY = 'costFilter';
function getFilter() { try { return { ...DEFAULT_FILTER, ...JSON.parse(localStorage.getItem(FKEY) || '{}') }; } catch { return { ...DEFAULT_FILTER }; } }
function setFilter(f) { try { localStorage.setItem(FKEY, JSON.stringify(f)); } catch { /* egal */ } }
const FILTER_CHIPS = [['variabel', 'Nutzung'], ['fix', 'Fixkosten'], ['wertverlust', 'Wertverlust'], ['einnahmen', 'Einnahmen']];
function filterChips() {
  const f = getFilter();
  return `<div class="chips fchips" role="group" aria-label="Was soll in die Auswertung?">${FILTER_CHIPS.map(([k, l]) => `<button class="chip toggle ${f[k] ? 'on' : ''}" data-fk="${k}" aria-pressed="${f[k]}">${f[k] ? ic('check') : ''}${l}</button>`).join('')}</div>`;
}
function bindFilterChips(v) {
  $$('[data-fk]', v).forEach((b) => (b.onclick = () => { const f = getFilter(); f[b.dataset.fk] = !f[b.dataset.fk]; setFilter(f); render(); }));
}
function filterLabel(f) {
  const plus = [f.variabel && 'Nutzung', f.fix && 'Fixkosten', f.wertverlust && 'Wertverlust'].filter(Boolean);
  if (!plus.length && !f.einnahmen) return 'nichts ausgewählt';
  return (plus.join(' + ') || '0') + (f.einnahmen ? ' − Einnahmen' : '');
}
const sectionHead = (title, link) => `<div class="shead"><h2>${title}</h2>${link || ''}</div>`;

// ---------------------------------------------------------------------------
//  Übersicht (kompakt)
// ---------------------------------------------------------------------------
function viewHome(v) {
  const c = car();
  const st = stats();
  const u = unit();
  const f = getFilter();
  const cv = costView(st, f);
  const rem = reminderRows().filter((r) => !r.done_at);
  const urgent = rem.filter((r) => r.st.level !== 'ok');
  const lastMoment = S.d.moments[0];
  const lastPhoto = lastMoment && S.d.photos.find((p) => p.moment_id === lastMoment.id);

  v.innerHTML = `
    <section>
      <button class="card hero tap" data-go="costs:stats">
        <div class="label">Was kostet uns das Auto pro km?</div>
        <div class="value num">${st.kmDriven > 0 ? fmt(cv.perKm, 2) : '–'} <small>€/km</small></div>
        <div class="hint">${st.kmDriven <= 0 ? 'Sobald ein neuer km-Stand eingetragen ist, geht’s los.'
          : `${filterLabel(f)}${cv.missingDepreciation ? ' (Restwert fehlt noch)' : ''} · ${fmt(st.kmDriven)} km`}</div>
        <span class="chev">${ic('chevron-right')}</span>
      </button>
    </section>

    <section>
      ${sectionHead('Erinnerungen', '<button class="linklike" data-page="reminders">Alle</button>')}
      ${rem.length === 0
        ? `<button class="card tap emptycta" data-page="reminders">${ic('bell')}<span>TÜV, Ölwechsel und Reifenwechsel rechtzeitig im Blick behalten</span><span class="chev">${ic('chevron-right')}</span></button>`
        : `<div class="list">${(urgent.length ? urgent.slice(0, 3) : rem.slice(0, 1)).map(reminderRow).join('')}</div>
           ${urgent.length ? '' : '<div class="small muted" style="margin:6px 4px 0">Aktuell ist nichts fällig.</div>'}`}
    </section>

    <section class="tiles">
      <button class="tile tap" data-go="fuel:km"><div class="k">Gefahren</div><div class="v num">${fmt(st.kmDriven)} km</div><div class="s">Stand ${fmt(st.kmNow)} km</div></button>
      <button class="tile tap" data-go="costs:contracts"><div class="k">Fixkosten</div><div class="v num">${eur(st.fixPerMonth, 0)}<span class="small"> /Monat</span></div><div class="s">Versicherung, Steuer, TÜV</div></button>
      <button class="tile tap" data-go="costs:stats"><div class="k">Nutzungskosten</div><div class="v num">${perKm(st.perKm.variable)}<span class="small"> /km</span></div><div class="s">Sprit, Reparaturen …</div></button>
      <button class="tile tap" data-go="fuel:stats"><div class="k">Verbrauch (6 Mon.)</div><div class="v num">${st.fuel.last6 ? fmt(st.fuel.last6.per100, 1) : '–'}<span class="small"> ${u}/100</span></div><div class="s">Ø gesamt ${st.fuel.total ? fmt(st.fuel.total.per100, 1) : '–'}</div></button>
    </section>

    <section>
      ${sectionHead('Zuletzt eingetragen', '<button class="linklike" data-go="costs:entries">Alle</button>')}
      ${entryList(allEntries().slice(0, 3))}
    </section>

    ${lastMoment ? `<section>${sectionHead('Zuletzt erlebt', '<button class="linklike" data-go="album">Album</button>')}
      <button class="card tap memo" data-go="album">${lastPhoto ? `<img data-path="${esc(lastPhoto.path)}" alt="">` : `<div class="ph">${ic('camera')}</div>`}
        <div><div class="t">${esc(lastMoment.title)}</div><div class="d">${dDate(lastMoment.date)}</div></div></button></section>` : ''}`;
  bindEntryRows(v);
  bindReminderRows(v);
}

// ---------------------------------------------------------------------------
//  Kosten
// ---------------------------------------------------------------------------
function viewCosts(v) {
  const sub = S.sub.costs;
  v.innerHTML = segment('costs', [['stats', 'Auswertung'], ['entries', 'Einträge'], ['contracts', 'Laufend']]) + '<div id="sub"></div>';
  bindSegment(v);
  const s = $('#sub', v);
  ({ stats: costsStats, entries: costsEntries, contracts: costsContracts })[sub](s);
}

function costsStats(v) {
  const c = car(), st = stats(), f = getFilter(), cv = costView(st, f);
  const pk = (x) => (st.kmDriven > 0 ? `${perKm(x / st.kmDriven)}/km` : '');
  const off = (k) => (f[k] ? '' : ' off');
  v.innerHTML = `
    ${filterChips()}
    <section style="margin-top:6px"><div class="list">
      <div class="row${off('variabel')}"><div class="ic"><span class="dot" style="background:var(--var)"></span></div><div class="main"><div class="t">Nutzungskosten</div><div class="d wrap">Tanken, Reparatur, Reifen … – steigen mit den km</div></div><div class="amt num">${eur(st.variable, 0)}<div class="d wrap">${pk(st.variable)}</div></div></div>
      <div class="row${off('fix')}"><div class="ic"><span class="dot" style="background:var(--fix)"></span></div><div class="main"><div class="t">Fixkosten</div><div class="d wrap">${eur(st.fixPerMonth, 0)} pro Monat – fallen auch im Stand an</div></div><div class="amt num">${eur(st.fix, 0)}<div class="d wrap">${pk(st.fix)}</div></div></div>
      <button class="row${off('wertverlust')}" id="dep"><div class="ic">${ic('trending-down')}</div><div class="main"><div class="t">Wertverlust</div><div class="d wrap">${st.depreciation === null ? 'Restwert eintragen →' : c.sale_price != null ? `Kauf ${eur(st.purchasePrice, 0)} → Verkauf ${eur(st.remaining, 0)}` : `Kauf ${eur(st.purchasePrice, 0)} → geschätzt ${eur(st.remaining, 0)}`}</div></div><div class="amt num">${st.depreciation === null ? '–' : eur(st.depreciation, 0)}<div class="d wrap">${st.depreciation === null ? '' : pk(st.depreciation)}</div></div></button>
      <div class="row${off('einnahmen')}"><div class="ic">${ic('hand-coins')}</div><div class="main"><div class="t">Einnahmen</div><div class="d wrap">${st.income ? 'z. B. Spritgeld von Mitfahrern – senkt die Kosten, nicht den Verbrauch' : 'Noch keine – z. B. Spritgeld von Mitfahrern'}</div></div><div class="amt num pos">${st.income ? `− ${eur(st.income, 0)}` : '–'}<div class="d wrap">${st.income ? pk(st.income) : ''}</div></div></div>
      <div class="row total"><div class="ic">${ic('sigma')}</div><div class="main"><div class="t">Ergebnis</div><div class="d wrap">${filterLabel(f)}</div></div><div class="amt num">${eur(cv.total, 0)}<div class="d wrap">${pk(cv.total)}</div></div></div>
    </div>
    <div class="small muted" style="margin:6px 4px 0">${fmt(st.kmDriven)} km in ${fmt(st.months, 0)} Monaten · ${eur(cv.perMonth, 0)} pro Monat. Tippe oben auf die Chips, um Bestandteile ein- oder auszublenden – die Übersicht rechnet genauso.</div></section>
    <section><h2>Kosten pro Monat</h2><div class="card">${monthlyChart(st.monthly, f, st.income > 0)}</div></section>
    <section><h2>Nach Kategorie</h2>${categoryList(st, f)}</section>
    ${st.income > 0 ? `<section><h2>Einnahmen</h2>${incomeList(st)}</section>` : ''}`;
  $('#dep', v).onclick = openValueEdit;
  bindFilterChips(v);
  bindChartTips(v);
}

function costsEntries(v) {
  const cats = activeCats().filter((c) => S.d.expenses.some((e) => e.category_id === c.id));
  if (S.filter !== 'all' && !cats.find((c) => c.id === S.filter)) S.filter = 'all';
  let items = allEntries().filter((i) => i.type === 'exp');
  if (S.filter !== 'all') items = items.filter((i) => i.e.category_id === S.filter);
  const isInc = (i) => catById(i.e.category_id)?.kind === 'einnahme';
  const sum = items.filter((i) => !isInc(i)).reduce((a, i) => a + Number(i.e.amount), 0);
  const inc = items.filter(isInc).reduce((a, i) => a + Number(i.e.amount), 0);
  v.innerHTML = `
    <div class="chips">
      <button class="chip ${S.filter === 'all' ? 'on' : ''}" data-f="all">Alle</button>
      ${cats.map((c) => `<button class="chip ${S.filter === c.id ? 'on' : ''}" data-f="${c.id}">${esc(c.name)}</button>`).join('')}
    </div>
    <div class="small muted" style="margin:0 4px 8px">${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}${sum ? ` · Kosten ${eur(sum)}` : ''}${inc ? ` · Einnahmen ${eur(inc)}` : ''}</div>
    ${entryList(items)}
    <div class="grid2" style="margin-top:14px"><button class="btn secondary" id="addexp">+ Kosten</button><button class="btn secondary" id="addinc">+ Einnahme</button></div>`;
  $$('.chip', v).forEach((b) => (b.onclick = () => { S.filter = b.dataset.f; render(); }));
  $('#addexp', v).onclick = () => openExpense();
  $('#addinc', v).onclick = () => openExpense(null, 'income');
  bindEntryRows(v);
}

function costsContracts(v) {
  const st = stats();
  const isEnded = (k) => k.end_date && parseDate(k.end_date) < new Date();
  const running = st.contracts.filter((k) => !isEnded(k)), ended = st.contracts.filter(isEnded);
  const perMonth = running.reduce((a, k) => a + (catById(k.category_id)?.kind === 'einnahme' ? -1 : 1) * k.perMonth, 0);
  const row = (k) => `<button class="row" data-k="${k.id}"><div class="ic">${ic(catById(k.category_id)?.icon || 'repeat')}</div><div class="main"><div class="t">${esc(k.name)}</div><div class="d">${eur(k.amount)} ${INTERVALS[k.interval_months]} · ab ${dDate(k.start_date)}${k.end_date ? ` bis ${dDate(k.end_date)}` : ''}</div></div><div class="amt num">${eur(k.perMonth)}<div class="d">pro Monat</div></div></button>`;
  v.innerHTML = `
    <p class="small muted" style="margin:4px 4px 12px">Versicherung, Steuer & Co. einmal anlegen – die Zahlungen zählen automatisch mit. Ändert sich der Beitrag, den Eintrag antippen und „Betrag ändert sich ab …“ wählen.</p>
    <section>${sectionHead('Laufend', running.length ? `<span class="small muted num">${eur(perMonth)} / Monat</span>` : '')}
      <div class="list">${running.length ? running.map(row).join('') : '<div class="empty">z. B. Versicherung, Kfz-Steuer, ADAC</div>'}</div>
      <div class="btns"><button class="btn secondary" id="addk">+ Wiederkehrende Kosten</button></div></section>
    ${ended.length ? `<section><h2>Frühere Beträge</h2><div class="list">${ended.map(row).join('')}</div></section>` : ''}`;
  $('#addk', v).onclick = () => openContract();
  $$('[data-k]', v).forEach((b) => (b.onclick = () => openContract(S.d.contracts.find((k) => k.id === b.dataset.k))));
}

// ---------------------------------------------------------------------------
//  Verbrauch
// ---------------------------------------------------------------------------
function viewFuel(v) {
  v.innerHTML = segment('fuel', [['stats', 'Auswertung'], ['fills', unit() === 'kWh' ? 'Ladungen' : 'Tankungen'], ['km', 'km-Stände']]) + '<div id="sub"></div>';
  bindSegment(v);
  ({ stats: fuelStats, fills: fuelFills, km: fuelKm })[S.sub.fuel]($('#sub', v));
}

function fuelStats(v) {
  const st = stats(), f = st.fuel, u = unit();
  const avgPrice = f.litersTotal > 0 ? f.fuelCost / f.litersTotal : null;
  // Durchschnittspreis je Monat
  const byM = {};
  for (const e of S.d.expenses) {
    if (!catById(e.category_id)?.is_fuel || !e.liters) continue;
    const k = e.date.slice(0, 7);
    byM[k] = byM[k] || { c: 0, l: 0 }; byM[k].c += Number(e.amount); byM[k].l += Number(e.liters);
  }
  const priceSeries = Object.keys(byM).sort().slice(-18).map((k) => ({ month: k, value: byM[k].c / byM[k].l }));
  v.innerHTML = f.count < 2 ? `<div class="card empty">Ab zwei ${u === 'kWh' ? 'Ladungen' : 'Tankungen'} mit km-Stand siehst du hier deinen echten Verbrauch.<div class="btns"><button class="btn" id="addf">${u === 'kWh' ? 'Laden' : 'Tanken'} eintragen</button></div></div>` : `
    <section class="tiles">
      <div class="tile"><div class="k">Ø gesamt</div><div class="v num">${f.total ? fmt(f.total.per100, 1) : '–'}<span class="small"> ${u}/100 km</span></div><div class="s">${f.total ? `über ${fmt(f.total.km)} km` : ''}</div></div>
      <div class="tile"><div class="k">Letzte 6 Monate</div><div class="v num">${f.last6 ? fmt(f.last6.per100, 1) : '–'}<span class="small"> ${u}/100 km</span></div><div class="s">${f.last6 ? `${fmt(f.last6.km)} km` : 'zu wenig Daten'}</div></div>
      <div class="tile"><div class="k">Spritkosten</div><div class="v num">${f.total ? eur(f.total.costPer100) : '–'}<span class="small"> /100 km</span></div><div class="s">${eur(f.fuelCost, 0)} gesamt</div></div>
      <div class="tile"><div class="k">Ø Preis</div><div class="v num">${avgPrice ? fmt(avgPrice, 3) : '–'}<span class="small"> €/${u}</span></div><div class="s">${fmt(f.litersTotal, 0)} ${u} in ${f.count} ${u === 'kWh' ? 'Ladungen' : 'Tankungen'}</div></div>
    </section>
    ${f.series.length >= 2 ? `<section><h2>Verbrauch (gleitend, 6 Monate)</h2><div class="card">${lineChart(f.series.map((s) => ({ month: s.month, value: s.per100 })), { unit: `${u}/100 km`, dec: 1, label: 'Verbrauchsverlauf' })}</div></section>` : ''}
    ${priceSeries.length >= 2 ? `<section><h2>Preis pro ${u === 'kWh' ? 'kWh' : 'Liter'} (Monatsschnitt)</h2><div class="card">${lineChart(priceSeries, { unit: `€/${u}`, dec: 3, axisDec: 2, label: 'Preisverlauf' })}</div></section>` : ''}
    <p class="small muted" style="margin:0 4px">So wird gerechnet: alle getankten ${u === 'kWh' ? 'kWh' : 'Liter'} (außer der allerersten Füllung) geteilt durch die km zwischen erster und letzter. Ob voll oder halb getankt wurde, mittelt sich über die Zeit heraus.</p>`;
  $('#addf', v)?.addEventListener('click', () => openFuel());
  bindChartTips(v);
}

function fuelFills(v) {
  const ids = new Set(S.d.categories.filter((c) => c.is_fuel).map((c) => c.id));
  const items = allEntries().filter((i) => i.type === 'exp' && ids.has(i.e.category_id));
  v.innerHTML = `${entryList(items)}<div class="btns"><button class="btn secondary" id="addf">+ ${unit() === 'kWh' ? 'Laden' : 'Tanken'}</button></div>`;
  $('#addf', v).onclick = () => openFuel();
  bindEntryRows(v);
}

function fuelKm(v) {
  const st = stats();
  const pd = kmPerDay(car(), S.d.expenses, S.d.odometer);
  const items = allEntries().filter((i) => i.type === 'km');
  v.innerHTML = `
    <section class="tiles">
      <div class="tile"><div class="k">Aktueller Stand</div><div class="v num">${fmt(st.kmNow)} km</div><div class="s">seit Kauf ${fmt(st.kmDriven)} km</div></div>
      <div class="tile"><div class="k">Fahrleistung</div><div class="v num">${pd ? fmt(pd * 365, 0) : '–'}<span class="small"> km/Jahr</span></div><div class="s">${pd ? `Ø ${fmt(pd, 0)} km pro Tag` : 'noch zu wenig Daten'}</div></div>
    </section>
    <p class="small muted" style="margin:0 4px 10px">Beim Tanken wird der km-Stand automatisch erfasst. Hier stehen nur die extra eingetragenen Stände.</p>
    ${entryList(items)}
    <div class="btns"><button class="btn secondary" id="addkm">+ km-Stand</button></div>`;
  $('#addkm', v).onclick = () => openKm();
  bindEntryRows(v);
}

function monthlyChart(rows, f = DEFAULT_FILTER, hasIncome = false) {
  if (!f.fix && !f.variabel) return '<div class="empty">Nutzung und Fixkosten sind ausgeblendet.</div>';
  rows = rows.map((r) => ({ ...r, fix: f.fix ? r.fix : 0, variabel: f.variabel ? r.variabel : 0 }));
  if (!rows.length || rows.every((r) => r.fix + r.variabel === 0)) return '<div class="empty">Noch keine Kosten erfasst.</div>';
  const W = 340, H = 170, pl = 34, pb = 20, pt = 8;
  const max = Math.max(...rows.map((r) => r.fix + r.variabel)) || 1;
  const nice = niceMax(max);
  const bw = (W - pl) / rows.length;
  const y = (v) => pt + (H - pt - pb) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  let g = ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 4}" y="${y(t) + 3}" text-anchor="end">${fmt(t)}</text>`).join('');
  rows.forEach((r, i) => {
    const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
    const yv = y(r.variabel), yt = y(r.variabel + r.fix), base = y(0);
    const tip = `${mLabel(r.month)} ${r.month.slice(0, 4)}: ${eur(r.fix + r.variabel, 0)} (fix ${eur(r.fix, 0)} · Nutzung ${eur(r.variabel, 0)})`;
    if (r.variabel > 0) g += `<path d="${roundedTop(x, yv, w, base - yv, r.fix > 0 ? 0 : 3)}" fill="var(--var)"/>`;
    if (r.fix > 0) g += `<path d="${roundedTop(x, yt, w, Math.max(0, yv - yt - (r.variabel > 0 ? 2 : 0)), 3)}" fill="var(--fix)"/>`;
    g += `<rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt}" fill="transparent" data-tip="${esc(tip)}" data-x="${((pl + i * bw + bw / 2) / W) * 100}" data-y="${(Math.min(yt, base - 4) / H) * 100}"/>`;
    g += `<text class="axis" x="${pl + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${mLabel(r.month)}</text>`;
  });
  return `<div class="legend">${f.fix ? '<span><i style="background:var(--fix)"></i>Fixkosten</span>' : ''}${f.variabel ? '<span><i style="background:var(--var)"></i>Nutzungskosten</span>' : ''}</div>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kosten pro Monat">${g}</svg><div class="tip"></div></div>
    <div class="small muted" style="margin-top:6px">Versicherung & Steuer sind auf die Monate verteilt${hasIncome ? ', Einnahmen sind hier nicht abgezogen' : ''}. Tippe auf einen Balken.</div>`;
}
function roundedTop(x, y, w, h, r) {
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function lineChart(series, { unit: un, dec = 1, axisDec = dec, label = '' }) {
  const W = 340, H = 150, pl = 34, pb = 20, pt = 10;
  const vals = series.map((s) => s.value);
  const span = Math.max(...vals) - Math.min(...vals);
  const pad = Math.max(span * 0.15, 10 ** -axisDec * 5);
  let lo = Math.min(...vals) - pad, hi = Math.max(...vals) + pad;
  if (lo < 0) lo = 0;
  const x = (i) => pl + (W - pl - 8) * (series.length === 1 ? 0.5 : i / (series.length - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1));
  const ticks = [lo, (lo + hi) / 2, hi];
  let g = ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 4}" y="${y(t) + 3}" text-anchor="end">${fmt(t, axisDec)}</text>`).join('');
  g += `<path d="${series.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.value)}`).join(' ')}" fill="none" stroke="var(--fix)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const every = Math.ceil(series.length / 6);
  series.forEach((s, i) => {
    g += `<circle cx="${x(i)}" cy="${y(s.value)}" r="3.5" fill="var(--fix)" stroke="var(--card)" stroke-width="2"/>`;
    g += `<rect x="${x(i) - 12}" y="${pt}" width="24" height="${H - pt}" fill="transparent" data-tip="${esc(`${mLabel(s.month)} ${s.month.slice(0, 4)}: ${fmt(s.value, dec)} ${un}`)}" data-x="${(x(i) / W) * 100}" data-y="${(y(s.value) / H) * 100}"/>`;
    if (i % every === 0 || i === series.length - 1) g += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${mLabel(s.month)} ${s.month.slice(2, 4)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg><div class="tip"></div></div>`;
}
function bindChartTips(root) {
  $$('.chart', root).forEach((ch) => {
    const tip = $('.tip', ch);
    $$('[data-tip]', ch).forEach((el) => {
      const show = () => {
        const x = Number(el.dataset.x);
        tip.textContent = el.dataset.tip; tip.style.top = `${el.dataset.y}%`; tip.style.display = 'block';
        tip.style.left = `${x}%`;
        tip.style.transform = `translate(${x > 65 ? '-100%' : x < 35 ? '0' : '-50%'}, -110%)`;
      };
      el.addEventListener('click', show);
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', () => (tip.style.display = 'none'));
    });
  });
}
function categoryList(st, f = DEFAULT_FILTER) {
  const rows = st.byCategory.filter((r) => r.sum > 0 && r.kind !== 'einnahme' && (r.kind === 'fix' ? f.fix : f.variabel));
  if (!rows.length) return '<div class="list"><div class="empty">Keine Kosten in der Auswahl.</div></div>';
  const max = rows[0].sum, total = rows.reduce((a, r) => a + r.sum, 0);
  return `<div class="list">${rows.map((r) => `<div class="row"><div class="ic">${ic(r.icon)}</div>
    <div class="main"><div class="t">${esc(r.name)} <span class="small muted">· ${r.kind === 'fix' ? 'fix' : 'Nutzung'}</span></div>
    <div class="catbar"><i style="width:${(r.sum / max) * 100}%"></i></div></div>
    <div class="amt num">${eur(r.sum, 0)}<div class="d">${fmt((r.sum / total) * 100)} %${st.kmDriven ? ` · ${fmt(r.sum / st.kmDriven * 100, 1)} ct/km` : ''}</div></div></div>`).join('')}</div>`;
}
function incomeList(st) {
  const rows = st.byCategory.filter((r) => r.kind === 'einnahme' && r.sum > 0);
  return `<div class="list">${rows.map((r) => `<div class="row"><div class="ic">${ic(r.icon)}</div><div class="main"><div class="t">${esc(r.name)}</div><div class="d">${r.count} ${r.count === 1 ? 'Eintrag' : 'Einträge'}</div></div><div class="amt num pos">+ ${eur(r.sum, 0)}</div></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
//  Einträge
// ---------------------------------------------------------------------------
function allEntries() {
  const ex = S.d.expenses.map((e) => ({ type: 'exp', date: e.date, created: e.created_at, e }));
  const od = S.d.odometer.map((o) => ({ type: 'km', date: o.date, created: o.created_at, o }));
  return [...ex, ...od].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created < b.created ? 1 : -1)));
}
function entryList(items) {
  if (!items.length) return '<div class="list"><div class="empty">Noch nichts eingetragen. Tippe unten auf <b>+</b>.</div></div>';
  const u = unit();
  return `<div class="list">${items.map((it) => {
    if (it.type === 'km') {
      return `<button class="row" data-km="${it.o.id}"><div class="ic">${ic('gauge')}</div><div class="main"><div class="t">km-Stand</div><div class="d">${dDate(it.date)}</div></div><div class="amt num">${fmt(it.o.km)} km</div></button>`;
    }
    const e = it.e, c = catById(e.category_id) || { name: '–', icon: '•' };
    const bits = [dDate(e.date)];
    if (e.liters) bits.push(`${fmt(e.liters, 2)} ${u} · ${fmt(e.amount / e.liters, 3)} €/${u}`);
    else if (e.km) bits.push(`${fmt(e.km)} km`);
    if (e.comment) bits.push(esc(e.comment));
    const inc = c.kind === 'einnahme';
    return `<button class="row" data-exp="${e.id}"><div class="ic">${ic(c.icon)}</div><div class="main"><div class="t">${esc(c.name)}${e.receipt_path ? ic('paperclip', 'inl') : ''}</div><div class="d">${bits.join(' · ')}</div></div><div class="amt num${inc ? ' pos' : ''}">${inc ? '+ ' : ''}${eur(e.amount)}</div></button>`;
  }).join('')}</div>`;
}
function bindEntryRows(root) {
  $$('[data-exp]', root).forEach((b) => (b.onclick = () => {
    const e = S.d.expenses.find((x) => x.id === b.dataset.exp);
    catById(e.category_id)?.is_fuel ? openFuel(e) : openExpense(e);
  }));
  $$('[data-km]', root).forEach((b) => (b.onclick = () => openKm(S.d.odometer.find((x) => x.id === b.dataset.km))));
}
// ---------------------------------------------------------------------------
//  Erfassen
// ---------------------------------------------------------------------------
function openAddChooser() {
  openSheet('Neuer Eintrag', `<div class="choose">
    <button data-a="fuel"><span class="i">${ic(car().fuel_unit === 'kWh' ? 'plug-zap' : 'fuel')}</span>${car().fuel_unit === 'kWh' ? 'Laden' : 'Tanken'}</button>
    <button data-a="exp"><span class="i">${ic('receipt')}</span>Kosten</button>
    <button data-a="km"><span class="i">${ic('gauge')}</span>km-Stand</button>
    <button data-a="inc"><span class="i">${ic('hand-coins')}</span>Einnahme</button>
    <button data-a="moment"><span class="i">${ic('camera')}</span>Erlebnis</button>
    <button data-a="rem"><span class="i">${ic('bell')}</span>Erinnerung</button>
  </div>`, (b) => {
    $$('[data-a]', b).forEach((x) => (x.onclick = () => ({ fuel: () => openFuel(), exp: () => openExpense(), km: () => openKm(), inc: () => openExpense(null, 'income'), moment: () => openMoment(), rem: () => openReminder() })[x.dataset.a]()));
  });
}
const lastKm = () => computeStats({ car: car(), ...S.d }).kmNow;

function receiptField(e) {
  return `<div class="f"><span>Beleg (optional)</span>
    <div class="thumbs" id="rc">${e?.receipt_path ? `<div class="th"><img data-path="${esc(e.receipt_path)}" alt="Beleg"><button type="button" class="x" id="rcx" aria-label="Beleg entfernen">${ic('x')}</button></div>` : ''}</div>
    <label class="filebtn">${ic('paperclip')} Beleg fotografieren oder auswählen<input type="file" name="receipt" accept="image/*"></label><div class="calc" id="rcname"></div></div>`;
}
function iconPicker(list, current) {
  if (!list.includes(current)) list = [current, ...list];
  return `<div class="f"><span class="flabel">Symbol</span><div class="iconpick" role="radiogroup">${list.map((k) => `<label title="${k}"><input type="radio" name="icon" value="${k}" ${k === current ? 'checked' : ''}>${ic(k)}</label>`).join('')}</div></div>`;
}
function deleteBtn(e) { return e ? '<button type="button" class="btn danger" id="del">Eintrag löschen</button>' : ''; }

function openFuel(e) {
  const u = unit(), ul = unitLong();
  const fuelCat = activeCats().find((c) => c.is_fuel) || S.d.categories.find((c) => c.is_fuel);
  if (!fuelCat) return toast('Keine Tank-Kategorie vorhanden – bitte unter „Auto“ anlegen.');
  const fuelCats = S.d.categories.filter((c) => c.is_fuel && (!c.archived || c.id === e?.category_id));
  openSheet(e ? 'Tankung bearbeiten' : (u === 'kWh' ? 'Laden' : 'Tanken'), `<form id="fuel">
    <div class="grid2">
      <label class="f"><span>Betrag (€)</span><input name="amount" inputmode="decimal" value="${numIn(e?.amount)}" required></label>
      <label class="f"><span>${ul}</span><input name="liters" inputmode="decimal" value="${numIn(e?.liters)}" required></label>
    </div>
    <div class="calc" id="ppl"></div>
    <label class="f"><span>km-Stand</span><input name="km" inputmode="numeric" value="${e?.km ?? ''}" placeholder="zuletzt ${fmt(lastKm())}" required></label>
    <div class="grid2">
      <label class="f"><span>Datum</span><input name="date" type="date" value="${e?.date ?? today()}" required></label>
      ${fuelCats.length > 1 ? `<label class="f"><span>Kategorie</span><select name="cat">${fuelCats.map((c) => `<option value="${c.id}" ${c.id === (e?.category_id ?? fuelCat.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : `<input type="hidden" name="cat" value="${fuelCat.id}">`}
    </div>
    <label class="f"><span>Kommentar (optional)</span><input name="comment" value="${esc(e?.comment)}" placeholder="z. B. Urlaubsfahrt, Autobahn"></label>
    ${receiptField(e)}
    <div class="btns"><button class="btn" type="submit">Speichern</button>${deleteBtn(e)}</div>
  </form>`, (b) => {
    const form = $('#fuel', b);
    const upd = () => {
      const a = parseNum(form.amount.value), l = parseNum(form.liters.value);
      $('#ppl', b).textContent = a > 0 && l > 0 ? `= ${fmt(a / l, 3)} € pro ${u}` : '';
    };
    form.amount.oninput = form.liters.oninput = upd; upd();
    bindExpenseCommon(b, form, e, () => {
      const amount = parseNum(form.amount.value), liters = parseNum(form.liters.value), km = parseNum(form.km.value);
      if ([amount, liters, km].some((x) => x === null || Number.isNaN(x))) throw new Error('Bitte Betrag, Menge und km-Stand prüfen');
      return { category_id: form.cat.value, amount, liters, km: Math.round(km), date: form.date.value, comment: form.comment.value.trim() || null };
    });
  });
}

async function ensureIncomeCategory() {
  let c = activeCats().find((x) => x.kind === 'einnahme');
  if (!c) {
    c = await q(sb.from('categories').insert({ car_id: S.carId, name: 'Spritgeld (Mitfahrer)', kind: 'einnahme', icon: 'hand-coins', sort: 300 }).select('*').single());
    S.d.categories.push(c);
  }
  return c;
}

function openExpense(e, mode) {
  const income = mode === 'income' || catById(e?.category_id)?.kind === 'einnahme';
  if (income && !e && !activeCats().some((c) => c.kind === 'einnahme')) {
    ensureIncomeCategory().then(() => openExpense(null, 'income')).catch(fail);
    return;
  }
  const cats = activeCats().filter((c) => (income ? c.kind === 'einnahme' : c.kind !== 'einnahme' && (!c.is_fuel || c.id === e?.category_id)));
  if (e && !cats.find((c) => c.id === e.category_id)) { const c = catById(e.category_id); if (c) cats.push(c); }
  const sel = e?.category_id ?? cats[0]?.id;
  const title = income ? (e ? 'Einnahme bearbeiten' : 'Einnahme erfassen') : (e ? 'Kosten bearbeiten' : 'Kosten erfassen');
  openSheet(title, `<form id="exp">
    ${income ? '<p class="small muted" style="margin:-4px 2px 12px">Einnahmen senken die Kosten pro km (abschaltbar in der Auswertung), den Verbrauch aber nicht.</p>' : ''}
    <label class="f"><span>${income ? 'Art der Einnahme' : 'Kategorie'}</span><select name="cat">${cats.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="f"><span>Betrag (€)</span><input name="amount" inputmode="decimal" value="${numIn(e?.amount)}" required></label>
      <label class="f"><span>Datum</span><input name="date" type="date" value="${e?.date ?? today()}" required></label>
    </div>
    ${income ? '' : `<label class="f"><span>km-Stand (optional)</span><input name="km" inputmode="numeric" value="${e?.km ?? ''}" placeholder="zuletzt ${fmt(lastKm())}"></label>`}
    <label class="f"><span>${income ? 'Von wem / wofür? (optional)' : 'Worum ging’s? (optional)'}</span><textarea name="comment" placeholder="${income ? 'z. B. Tim & Lea, Fahrt nach Hamburg' : 'z. B. Bremsbeläge vorne, Werkstatt Müller'}">${esc(e?.comment)}</textarea></label>
    ${income ? '' : '<label class="check"><input type="checkbox" name="other"><span id="otherlbl"></span></label>'}
    ${income ? '' : receiptField(e)}
    <div class="btns"><button class="btn" type="submit">Speichern</button>${deleteBtn(e)}</div>
  </form>`, (b) => {
    const form = $('#exp', b);
    if (!income) {
      const lbl = () => {
        const k = catById(form.cat.value)?.kind || 'variabel';
        $('#otherlbl', b).textContent = k === 'fix' ? 'Diesmal als Nutzungskosten zählen' : 'Diesmal als Fixkosten zählen';
      };
      form.cat.onchange = lbl; lbl();
      if (e?.kind_override && e.kind_override !== catById(e.category_id)?.kind) form.other.checked = true;
    }
    bindExpenseCommon(b, form, e, () => {
      const amount = parseNum(form.amount.value), km = income ? null : parseNum(form.km.value);
      if (amount === null || Number.isNaN(amount) || Number.isNaN(km)) throw new Error('Bitte Betrag und km prüfen');
      const kind = catById(form.cat.value)?.kind || 'variabel';
      return {
        category_id: form.cat.value, amount, km: km === null ? null : Math.round(km), liters: null,
        date: form.date.value, comment: form.comment.value.trim() || null,
        kind_override: !income && form.other.checked ? (kind === 'fix' ? 'variabel' : 'fix') : null,
      };
    });
  });
}

function bindExpenseCommon(b, form, e, collect) {
  let removeReceipt = false;
  const x = $('#rcx', b);
  if (x) x.onclick = () => { removeReceipt = true; $('#rc', b).innerHTML = ''; };
  $('#rc img', b)?.addEventListener('click', (ev) => viewPhoto(ev.target.dataset.path));
  if (form.receipt) form.receipt.onchange = () => { $('#rcname', b).textContent = form.receipt.files[0] ? 'Foto ausgewählt' : ''; };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    submitWith(form, async () => {
      const row = collect();
      const file = form.receipt?.files[0];
      if (file) { row.receipt_path = await uploadPhoto(file); removeReceipt = !!e?.receipt_path; }
      else if (removeReceipt) row.receipt_path = null;
      if (e) await q(sb.from('expenses').update(row).eq('id', e.id));
      else await q(sb.from('expenses').insert({ ...row, car_id: S.carId }));
      if (removeReceipt && e?.receipt_path) await sb.storage.from('photos').remove([e.receipt_path]);
      toast('Gespeichert');
    });
  };
  const del = $('#del', b);
  if (del) del.onclick = () => {
    if (!confirm('Eintrag wirklich löschen?')) return;
    submitWith(form, async () => {
      await q(sb.from('expenses').delete().eq('id', e.id));
      if (e.receipt_path) await sb.storage.from('photos').remove([e.receipt_path]);
      toast('Gelöscht');
    });
  };
}

function openKm(o) {
  openSheet(o ? 'km-Stand bearbeiten' : 'km-Stand eintragen', `<form id="km">
    <label class="f"><span>km-Stand</span><input name="km" inputmode="numeric" value="${o?.km ?? ''}" placeholder="zuletzt ${fmt(lastKm())}" required></label>
    <label class="f"><span>Datum</span><input name="date" type="date" value="${o?.date ?? today()}" required></label>
    <p class="small muted">Beim Tanken wird der km-Stand automatisch mit erfasst – extra eintragen lohnt sich vor allem, wenn ihr länger nicht tankt.</p>
    <div class="btns"><button class="btn" type="submit">Speichern</button>${o ? '<button type="button" class="btn danger" id="del">Löschen</button>' : ''}</div>
  </form>`, (b) => {
    const form = $('#km', b);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const km = parseNum(form.km.value);
      if (km === null || Number.isNaN(km)) return toast('Bitte km-Stand prüfen');
      submitWith(form, async () => {
        const row = { km: Math.round(km), date: form.date.value };
        if (o) await q(sb.from('odometer').update(row).eq('id', o.id));
        else await q(sb.from('odometer').insert({ ...row, car_id: S.carId }));
        toast('Gespeichert');
      });
    };
    const del = $('#del', b);
    if (del) del.onclick = () => confirm('km-Stand löschen?') && submitWith(form, () => q(sb.from('odometer').delete().eq('id', o.id)));
  });
}

// ---------------------------------------------------------------------------
//  Erlebnisse
// ---------------------------------------------------------------------------
function viewAlbum(v) {
  const ms = S.d.moments;
  v.innerHTML = `${ms.length ? '' : `<div class="card empty">Hier sammelt ihr, was euer Auto erlebt hat – Urlaube, Ausflüge, besondere Momente.<div class="btns"><button class="btn" id="addm">Erstes Erlebnis anlegen</button></div></div>`}
    ${ms.map((m) => {
      const ph = S.d.photos.filter((p) => p.moment_id === m.id);
      const shown = ph.slice(0, 6);
      return `<article class="moment" data-m="${m.id}">
        ${shown.length ? `<div class="photos n${Math.min(shown.length, 3)}">${shown.map((p) => `<img data-path="${esc(p.path)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        <div class="body"><div class="t">${esc(m.title)}</div>
        <div class="d">${dDate(m.date)}${m.km ? ` · ${fmt(m.km)} km` : ''}${ph.length > 6 ? ` · ${ph.length} Fotos` : ''}</div>
        ${m.text ? `<p>${esc(m.text)}</p>` : ''}</div></article>`;
    }).join('')}`;
  $('#addm', v)?.addEventListener('click', () => openMoment());
  $$('.moment', v).forEach((a) => {
    a.querySelector('.body').onclick = () => openMoment(S.d.moments.find((m) => m.id === a.dataset.m));
    $$('img', a).forEach((i) => (i.onclick = () => viewPhoto(i.dataset.path)));
  });
}

function openMoment(m) {
  const existing = m ? S.d.photos.filter((p) => p.moment_id === m.id) : [];
  openSheet(m ? 'Erlebnis bearbeiten' : 'Neues Erlebnis', `<form id="mom">
    <label class="f"><span>Titel</span><input name="title" value="${esc(m?.title)}" placeholder="z. B. Sommerurlaub Gardasee" required></label>
    <div class="grid2">
      <label class="f"><span>Datum</span><input name="date" type="date" value="${m?.date ?? today()}" required></label>
      <label class="f"><span>km-Stand (optional)</span><input name="km" inputmode="numeric" value="${m?.km ?? ''}"></label>
    </div>
    <label class="f"><span>Notiz (optional)</span><textarea name="text">${esc(m?.text)}</textarea></label>
    <div class="f"><span>Fotos</span><div class="thumbs" id="th">${existing.map((p) => `<div class="th" data-id="${p.id}"><img data-path="${esc(p.path)}" alt=""><button type="button" class="x" aria-label="Foto entfernen">${ic('x')}</button></div>`).join('')}</div>
    <label class="filebtn">${ic('image-plus')} Fotos hinzufügen<input type="file" name="files" accept="image/*" multiple></label></div>
    <div class="calc" id="prog"></div>
    <div class="btns"><button class="btn" type="submit">Speichern</button>${m ? '<button type="button" class="btn danger" id="del">Erlebnis löschen</button>' : ''}</div>
  </form>`, (b) => {
    const form = $('#mom', b);
    const removed = new Set();
    $$('.th .x', b).forEach((x) => (x.onclick = () => { const th = x.closest('.th'); removed.add(th.dataset.id); th.remove(); }));
    form.files.onchange = () => {
      const n = form.files.files.length;
      $('#prog', b).textContent = n ? `${n} neue${n === 1 ? 's' : ''} Foto${n === 1 ? '' : 's'} ausgewählt` : '';
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const km = parseNum(form.km.value);
      if (Number.isNaN(km)) return toast('Bitte km prüfen');
      submitWith(form, async () => {
        const row = { title: form.title.value.trim(), date: form.date.value, km: km === null ? null : Math.round(km), text: form.text.value.trim() || null };
        let id = m?.id;
        if (m) await q(sb.from('moments').update(row).eq('id', id));
        else id = (await q(sb.from('moments').insert({ ...row, car_id: S.carId }).select('id').single())).id;
        const files = [...form.files.files];
        for (let i = 0; i < files.length; i++) {
          $('#prog', b).textContent = `Lade Foto ${i + 1} von ${files.length} hoch …`;
          const path = await uploadPhoto(files[i]);
          await q(sb.from('moment_photos').insert({ moment_id: id, car_id: S.carId, path }));
        }
        if (removed.size) {
          const gone = existing.filter((p) => removed.has(p.id));
          await q(sb.from('moment_photos').delete().in('id', [...removed]));
          await sb.storage.from('photos').remove(gone.map((p) => p.path));
        }
        toast('Gespeichert');
      });
    };
    const del = $('#del', b);
    if (del) del.onclick = () => {
      if (!confirm('Erlebnis inkl. Fotos löschen?')) return;
      submitWith(form, async () => {
        await q(sb.from('moments').delete().eq('id', m.id));
        if (existing.length) await sb.storage.from('photos').remove(existing.map((p) => p.path));
      });
    };
  });
}

// ---------------------------------------------------------------------------
//  Einstellungen
// ---------------------------------------------------------------------------
function viewSettings(v) {
  const c = car();
  const me = S.session.user;
  v.innerHTML = `
    <section><h2>Auto</h2><div class="list">
      <button class="row" id="editcar"><div class="ic">${ic('car-front')}</div><div class="main"><div class="t">${esc(c.name)}</div><div class="d">Gekauft ${dDate(c.purchase_date)} · ${eur(c.purchase_price, 0)} · ${fmt(c.start_km)} km</div></div><div class="amt">${ic('chevron-right', 'chev-i')}</div></button>
      <button class="row" id="editval"><div class="ic">${ic('trending-down')}</div><div class="main"><div class="t">${c.sale_price != null ? 'Verkauft' : 'Restwert / Verkauf'}</div><div class="d">${c.sale_price != null ? `${dDate(c.sale_date)} für ${eur(c.sale_price, 0)}` : c.residual_value != null ? `Geschätzt ${eur(c.residual_value, 0)}` : 'Noch nicht eingetragen'}</div></div><div class="amt">${ic('chevron-right', 'chev-i')}</div></button>
    </div></section>

    <section><h2>Planen</h2><div class="list">
      <button class="row" data-page="reminders"><div class="ic">${ic('bell')}</div><div class="main"><div class="t">Erinnerungen</div><div class="d">TÜV, Ölwechsel, Reifenwechsel …</div></div><div class="amt">${ic('chevron-right', 'chev-i')}</div></button>
      <button class="row" data-go="costs:contracts"><div class="ic">${ic('repeat')}</div><div class="main"><div class="t">Wiederkehrende Kosten</div><div class="d">Versicherung, Steuer & Co.</div></div><div class="amt">${ic('chevron-right', 'chev-i')}</div></button>
    </div></section>

    <section><h2>Kategorien</h2><div class="list">
      ${[...S.d.categories].sort((a, b) => a.archived - b.archived || a.sort - b.sort).map((k) => `<button class="row" data-cat="${k.id}"><div class="ic">${ic(k.icon)}</div><div class="main"><div class="t">${esc(k.name)}${k.archived ? ' <span class="small muted">· ausgeblendet</span>' : ''}</div><div class="d">${({ fix: 'Fixkosten', einnahme: 'Einnahme' })[k.kind] || 'Nutzungskosten'}${k.is_fuel ? ' · Tanken/Laden' : ''}</div></div><div class="amt">${ic('chevron-right', 'chev-i')}</div></button>`).join('')}
    </div><div class="btns"><button class="btn secondary" id="addcat">+ Eigene Kategorie</button></div></section>

    <section><h2>Gemeinsam nutzen</h2><div class="card">
      ${inviteBox(c)}
      <div class="small" style="margin-top:14px"><b>Zugriff haben:</b><br>${S.d.members.map((m) => esc(m.email || 'Unbekannt') + (m.user_id === me.id ? ' (du)' : '')).join('<br>')}</div>
    </div></section>

    <section><h2>Darstellung</h2><div class="themes">${THEMES.map(([id, label, cols]) => `<button data-theme-set="${id}" class="${currentTheme() === id ? 'on' : ''}"><span class="sw">${cols.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${label}</button>`).join('')}</div></section>

    <section><h2>Daten</h2><div class="list">
      <button class="row" id="csv"><div class="ic">${ic('file-spreadsheet')}</div><div class="main"><div class="t">Einträge als Tabelle (CSV)</div><div class="d">Für Excel / Numbers</div></div></button>
      <button class="row" id="json"><div class="ic">${ic('database')}</div><div class="main"><div class="t">Komplette Sicherung (JSON)</div><div class="d">Alle Daten dieses Autos – regelmäßig machen!</div></div></button>
    </div></section>

    <section><h2>Konto</h2><div class="list">
      <button class="row" data-page="garage"><div class="ic">${ic('car')}</div><div class="main"><div class="t">Meine Autos</div><div class="d">Wechseln, neues Auto anlegen, beitreten</div></div><div class="amt">${ic('chevron-right', 'chev-i')}</div></button>
      <button class="row" id="logout"><div class="ic">${ic('log-out')}</div><div class="main"><div class="t">Abmelden</div><div class="d">${esc(me.email)}</div></div></button>
    </div></section>`;

  $('#editcar', v).onclick = openCarEdit;
  $('#editval', v).onclick = openValueEdit;
  $('#addcat', v).onclick = () => openCategory();
  $$('[data-cat]', v).forEach((b) => (b.onclick = () => openCategory(catById(b.dataset.cat))));
  bindInviteBox(v, c, render);
  $$('[data-theme-set]', v).forEach((b) => (b.onclick = () => { setTheme(b.dataset.themeSet); render(); }));
  $('#csv', v).onclick = exportCsv;
  $('#json', v).onclick = exportJson;
  $('#logout', v).onclick = async () => { if (confirm('Abmelden?')) await sb.auth.signOut(); };
}

function openCarEdit() {
  const c = car();
  openSheet('Auto bearbeiten', `<form id="car">
    <label class="f"><span>Name</span><input name="name" value="${esc(c.name)}" required></label>
    <div class="grid2">
      <label class="f"><span>Kaufdatum</span><input name="date" type="date" value="${c.purchase_date}" required></label>
      <label class="f"><span>Kaufpreis (€)</span><input name="price" inputmode="decimal" value="${numIn(c.purchase_price)}" required></label>
    </div>
    <label class="f"><span>km-Stand beim Kauf</span><input name="km" inputmode="numeric" value="${c.start_km}" required></label>
    <label class="f"><span>Antrieb</span><select name="unit"><option value="l" ${c.fuel_unit === 'l' ? 'selected' : ''}>Verbrenner (Liter)</option><option value="kWh" ${c.fuel_unit === 'kWh' ? 'selected' : ''}>Elektro (kWh)</option></select></label>
    <div class="btns"><button class="btn" type="submit">Speichern</button>${c.created_by === S.session.user.id ? '<button type="button" class="btn danger" id="del">Auto komplett löschen</button>' : ''}</div>
  </form>`, (b) => {
    const form = $('#car', b);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const price = parseNum(form.price.value), km = parseNum(form.km.value);
      if ([price, km].some((x) => x === null || Number.isNaN(x))) return toast('Bitte Zahlen prüfen');
      submitWith(form, () => q(sb.from('cars').update({ name: form.name.value.trim(), purchase_date: form.date.value, purchase_price: price, start_km: Math.round(km), fuel_unit: form.unit.value }).eq('id', c.id)));
    };
    const del = $('#del', b);
    if (del) del.onclick = async () => {
      const typed = prompt(`Wirklich ALLES zu „${c.name}“ löschen (auch für deine Partnerin)? Zum Bestätigen den Namen eintippen:`);
      if (typed !== c.name) return;
      submitWith(form, async () => {
        const paths = [...S.d.photos.map((p) => p.path), ...S.d.expenses.filter((e) => e.receipt_path).map((e) => e.receipt_path)];
        if (paths.length) await sb.storage.from('photos').remove(paths);
        await q(sb.from('cars').delete().eq('id', c.id));
        localStorage.removeItem('carId'); S.carId = null; S.tab = 'home'; S.page = null;
      });
    };
  });
}

function openValueEdit() {
  const c = car();
  openSheet('Restwert & Verkauf', `<form id="val">
    <p class="small muted" style="margin-top:0">Der Wertverlust ist oft der größte Kostenblock. Mit einem geschätzten Restwert (z. B. von mobile.de oder DAT) zeigt die Übersicht die echten Gesamtkosten pro km.</p>
    <label class="f"><span>Geschätzter Restwert heute (€)</span><input name="res" inputmode="decimal" value="${numIn(c.residual_value)}" placeholder="optional"></label>
    <h4 style="margin:18px 0 8px">Auto verkauft?</h4>
    <div class="grid2">
      <label class="f"><span>Verkaufsdatum</span><input name="sdate" type="date" value="${c.sale_date ?? ''}"></label>
      <label class="f"><span>Verkaufspreis (€)</span><input name="sprice" inputmode="decimal" value="${numIn(c.sale_price)}"></label>
    </div>
    <p class="small muted">Nach dem Verkauf wird die Auswertung zum Verkaufsdatum „eingefroren“ – das ist euer Endergebnis.</p>
    <div class="btns"><button class="btn" type="submit">Speichern</button></div>
  </form>`, (b) => {
    const form = $('#val', b);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const res = parseNum(form.res.value), sp = parseNum(form.sprice.value);
      if (Number.isNaN(res) || Number.isNaN(sp)) return toast('Bitte Zahlen prüfen');
      if ((sp === null) !== !form.sdate.value) return toast('Für den Verkauf bitte Datum und Preis angeben');
      submitWith(form, () => q(sb.from('cars').update({ residual_value: res, sale_price: sp, sale_date: form.sdate.value || null }).eq('id', c.id)));
    };
  });
}

function openContract(k) {
  const cats = activeCats().filter((c) => !c.is_fuel);
  const defCat = k?.category_id ?? cats.find((c) => c.name === 'Versicherung')?.id ?? cats[0]?.id;
  const running = k && (!k.end_date || parseDate(k.end_date) >= new Date());
  openSheet(k ? 'Wiederkehrende Kosten' : 'Neue wiederkehrende Kosten', `<form id="con">
    <label class="f"><span>Bezeichnung</span><input name="name" value="${esc(k?.name)}" placeholder="z. B. HUK Haftpflicht + TK" required></label>
    <label class="f"><span>Kategorie</span><select name="cat">${cats.map((c) => `<option value="${c.id}" ${c.id === defCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="f"><span>Betrag je Zahlung (€)</span><input name="amount" inputmode="decimal" value="${numIn(k?.amount)}" required></label>
      <label class="f"><span>Zahlweise</span><select name="int">${Object.entries(INTERVALS).map(([m, l]) => `<option value="${m}" ${Number(m) === (k?.interval_months ?? 12) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="grid2">
      <label class="f"><span>Erste Zahlung am</span><input name="start" type="date" value="${k?.start_date ?? today()}" required></label>
      <label class="f"><span>Endet (optional)</span><input name="end" type="date" value="${k?.end_date ?? ''}"></label>
    </div>
    <div class="calc" id="pm"></div>
    <div class="btns"><button class="btn" type="submit">Speichern</button>
      ${running ? '<button type="button" class="btn secondary" id="change">Betrag ändert sich ab …</button>' : ''}
      ${k ? '<button type="button" class="btn danger" id="del">Löschen</button>' : ''}</div>
    ${k ? '<p class="small muted">„Löschen“ entfernt auch alle bisherigen Zahlungen aus der Auswertung. Wenn der Vertrag nur ausläuft, trage stattdessen ein Enddatum ein.</p>' : ''}
  </form>`, (b) => {
    const form = $('#con', b);
    const upd = () => { const a = parseNum(form.amount.value); $('#pm', b).textContent = a > 0 ? `≈ ${eur(a / Number(form.int.value))} pro Monat` : ''; };
    form.amount.oninput = form.int.onchange = upd; upd();
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const amount = parseNum(form.amount.value);
      if (amount === null || Number.isNaN(amount)) return toast('Bitte Betrag prüfen');
      const row = { name: form.name.value.trim(), category_id: form.cat.value, amount, interval_months: Number(form.int.value), start_date: form.start.value, end_date: form.end.value || null };
      submitWith(form, () => (k ? q(sb.from('contracts').update(row).eq('id', k.id)) : q(sb.from('contracts').insert({ ...row, car_id: S.carId }))));
    };
    $('#change', b)?.addEventListener('click', () => openContractChange(k));
    const del = $('#del', b);
    if (del) del.onclick = () => confirm('Wirklich löschen?') && submitWith(form, () => q(sb.from('contracts').delete().eq('id', k.id)));
  });
}

function openContractChange(k) {
  openSheet('Neuer Betrag', `<form id="chg">
    <p class="small muted" style="margin-top:0">„${esc(k.name)}“: bisher ${eur(k.amount)} ${INTERVALS[k.interval_months]}. Die alten Zahlungen bleiben in der Auswertung erhalten.</p>
    <div class="grid2">
      <label class="f"><span>Neuer Betrag (€)</span><input name="amount" inputmode="decimal" required></label>
      <label class="f"><span>Zahlweise</span><select name="int">${Object.entries(INTERVALS).map(([m, l]) => `<option value="${m}" ${Number(m) === k.interval_months ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="f"><span>Erste Zahlung mit neuem Betrag am</span><input name="start" type="date" value="${today()}" required></label>
    <div class="btns"><button class="btn" type="submit">Übernehmen</button></div>
  </form>`, (b) => {
    const form = $('#chg', b);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const amount = parseNum(form.amount.value);
      if (amount === null || Number.isNaN(amount)) return toast('Bitte Betrag prüfen');
      const start = parseDate(form.start.value);
      if (start <= parseDate(k.start_date)) return toast('Datum muss nach der ersten Zahlung liegen');
      const dayBefore = isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1));
      submitWith(form, async () => {
        await q(sb.from('contracts').update({ end_date: dayBefore }).eq('id', k.id));
        await q(sb.from('contracts').insert({ car_id: S.carId, category_id: k.category_id, name: k.name, amount, interval_months: Number(form.int.value), start_date: form.start.value, end_date: k.end_date }));
        toast('Neuer Betrag gilt ab ' + dDate(form.start.value));
      });
    };
  });
}

function openCategory(k) {
  openSheet(k ? 'Kategorie bearbeiten' : 'Neue Kategorie', `<form id="cat">
    ${iconPicker(CAT_ICONS, iconKey(k?.icon))}
    <div>
      <label class="f"><span>Name</span><input name="name" value="${esc(k?.name)}" placeholder="z. B. Zubehör, Vignette" required></label>
    </div>
    <label class="f"><span>Art</span><select name="kind">
      <option value="variabel" ${k?.kind !== 'fix' ? 'selected' : ''}>Nutzungskosten (steigen mit den km)</option>
      <option value="fix" ${k?.kind === 'fix' ? 'selected' : ''}>Fixkosten (fallen auch im Stand an)</option>
      <option value="einnahme" ${k?.kind === 'einnahme' ? 'selected' : ''}>Einnahme (z. B. Spritgeld, Erstattung)</option></select></label>
    <label class="check"><input type="checkbox" name="fuel" ${k?.is_fuel ? 'checked' : ''}><span>Tank-/Ladekategorie (mit Liter/kWh, zählt für den Verbrauch)</span></label>
    ${k ? `<label class="check"><input type="checkbox" name="arch" ${k.archived ? 'checked' : ''}><span>Ausblenden (bleibt in der Auswertung)</span></label>` : ''}
    <div class="btns"><button class="btn" type="submit">Speichern</button>${k ? '<button type="button" class="btn danger" id="del">Löschen</button>' : ''}</div>
  </form>`, (b) => {
    const form = $('#cat', b);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const row = { name: form.name.value.trim(), icon: form.icon.value || 'tag', kind: form.kind.value, is_fuel: form.fuel.checked };
      if (k) row.archived = form.arch.checked;
      submitWith(form, () => (k ? q(sb.from('categories').update(row).eq('id', k.id))
        : q(sb.from('categories').insert({ ...row, car_id: S.carId, sort: 200 }))));
    };
    const del = $('#del', b);
    if (del) del.onclick = () => {
      const used = S.d.expenses.some((e) => e.category_id === k.id) || S.d.contracts.some((c) => c.category_id === k.id);
      if (used) return toast('Wird noch verwendet – stattdessen „Ausblenden“ nutzen.', 3500);
      if (confirm('Kategorie löschen?')) submitWith(form, () => q(sb.from('categories').delete().eq('id', k.id)));
    };
  });
}

// ---------------------------------------------------------------------------
//  Erinnerungen
// ---------------------------------------------------------------------------
const PRESETS = [
  { key: 'tuv', icon: 'clipboard-check', title: 'TÜV / HU', cat: 'TÜV', repeat_months: 24, hint: 'Monat steht auf der Plakette am Kennzeichen.' },
  { key: 'oil', icon: 'droplet', title: 'Ölwechsel', cat: 'Öl', repeat_km: 15000, repeat_months: 12, plusKm: 15000, hint: 'Steht meist auf dem Aufkleber im Motorraum oder im Serviceheft.' },
  { key: 'insp', icon: 'wrench', title: 'Inspektion', cat: 'Wartung', repeat_months: 12, repeat_km: 20000, plusMonths: 12 },
  { key: 'winter', icon: 'snowflake', title: 'Winterreifen drauf', cat: 'Reifen', repeat_months: 12, nextOn: [10, 15], hint: 'Faustregel: von O bis O – Oktober bis Ostern.' },
  { key: 'summer', icon: 'sun', title: 'Sommerreifen drauf', cat: 'Reifen', repeat_months: 12, nextOn: [4, 15] },
  { key: 'ins', icon: 'shield', title: 'Versicherung vergleichen', cat: 'Versicherung', repeat_months: 12, nextOn: [11, 1], note: 'Wechselstichtag ist meist der 30.11.' },
  { key: 'kit', icon: 'briefcase-medical', title: 'Verbandskasten prüfen', repeat_months: 24, plusMonths: 24 },
  { key: 'own', icon: 'bell', title: '', hint: '' },
];
function nextOn(month, day) {
  const t = new Date(); let d = new Date(t.getFullYear(), month - 1, day);
  if (d <= t) d = new Date(t.getFullYear() + 1, month - 1, day);
  return isoDate(d);
}
function reminderRows() {
  const st = stats();
  const pd = kmPerDay(car(), S.d.expenses, S.d.odometer);
  return S.d.reminders.map((r) => ({ ...r, st: reminderStatus(r, { kmNow: st.kmNow, perDay: pd }) }))
    .sort((a, b) => (a.done_at ? 1 : 0) - (b.done_at ? 1 : 0) || (a.st.daysLeft ?? 99999) - (b.st.daysLeft ?? 99999) || (a.st.kmLeft ?? 0) - (b.st.kmLeft ?? 0));
}
function dueText(r) {
  const s = r.st, bits = [];
  const days = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : n === -1 ? 'seit gestern' : n < 0 ? `seit ${-n} Tagen` : `in ${n} Tagen`);
  if (r.due_date && !(s.viaKm && r.due_km)) bits.push(`${dDate(r.due_date)} · ${days(Math.round((parseDate(r.due_date) - parseDate(today())) / 86400000))}`);
  if (r.due_km) {
    bits.push(s.kmLeft < 0 ? `bei ${fmt(r.due_km)} km · ${fmt(-s.kmLeft)} km drüber` : `bei ${fmt(r.due_km)} km · noch ${fmt(s.kmLeft)} km`);
    if (s.viaKm && s.dueDate && s.kmLeft >= 0) bits.push(`ca. ${s.dueDate.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}`);
  }
  return bits.join(' · ');
}
const LEVEL = { overdue: ['Überfällig', 'lv-over'], soon: ['Bald', 'lv-soon'], ok: ['', ''] };
function reminderRow(r) {
  const [label, cls] = r.done_at ? ['Erledigt', 'lv-done'] : LEVEL[r.st.level];
  return `<button class="row" data-rem="${r.id}"><div class="ic">${ic(r.icon)}</div>
    <div class="main"><div class="t">${esc(r.title)}</div><div class="d wrap">${r.done_at ? `erledigt am ${dDate(r.done_at)}` : dueText(r)}</div></div>
    ${label ? `<span class="pill ${cls}">${label}</span>` : `<div class="amt">${ic('chevron-right', 'chev-i')}</div>`}</button>`;
}
function bindReminderRows(root) {
  $$('[data-rem]', root).forEach((b) => (b.onclick = () => openReminder(S.d.reminders.find((r) => r.id === b.dataset.rem))));
}

function viewReminders(v) {
  const rows = reminderRows();
  const open = rows.filter((r) => !r.done_at), done = rows.filter((r) => r.done_at).sort((a, b) => (a.done_at < b.done_at ? 1 : -1)).slice(0, 10);
  const canBadge = 'setAppBadge' in navigator && 'Notification' in window && Notification.permission === 'default';
  v.innerHTML = `
    <section><div class="list">${open.length ? open.map(reminderRow).join('') : '<div class="empty">Noch keine Erinnerungen.</div>'}</div>
      <div class="btns"><button class="btn" id="addr">+ Erinnerung</button></div></section>
    <p class="small muted" style="margin:0 4px">Fällige Erinnerungen erscheinen oben in der Übersicht. Für eine Benachrichtigung auf dem iPhone die Erinnerung öffnen und „In den Kalender“ wählen.</p>
    ${canBadge ? '<div class="btns"><button class="btn secondary" id="badge">Zähler am App-Symbol einschalten</button></div>' : ''}
    ${done.length ? `<section><h2>Erledigt</h2><div class="list">${done.map(reminderRow).join('')}</div></section>` : ''}`;
  $('#addr', v).onclick = () => openReminder();
  $('#badge', v)?.addEventListener('click', async () => { await Notification.requestPermission(); updateBadge(); render(); });
  bindReminderRows(v);
}

function updateBadge() {
  if (!('setAppBadge' in navigator) || !S.d.reminders) return;
  try {
    const n = reminderRows().filter((r) => !r.done_at && r.st.level !== 'ok').length;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  } catch { /* nicht unterstützt */ }
}

function openReminder(r) {
  if (!r) {
    openSheet('Neue Erinnerung', `<div class="choose">${PRESETS.map((p) => `<button data-p="${p.key}"><span class="i">${ic(p.icon)}</span>${p.title || 'Eigene'}</button>`).join('')}</div>`, (b) => {
      $$('[data-p]', b).forEach((x) => (x.onclick = () => reminderForm(null, PRESETS.find((p) => p.key === x.dataset.p))));
    });
    return;
  }
  reminderForm(r);
}

function reminderForm(r, p = {}) {
  const km = lastKm();
  const cats = activeCats().filter((c) => c.kind !== 'einnahme');
  const catId = r ? r.category_id : (p.cat ? cats.find((c) => c.name.toLowerCase().includes(p.cat.toLowerCase()))?.id : null);
  const dueDate = r ? r.due_date : p.nextOn ? nextOn(...p.nextOn) : p.plusMonths ? isoDate(addMonthsLocal(new Date(), p.plusMonths)) : '';
  const dueKm = r ? r.due_km : p.plusKm ? Math.ceil((km + p.plusKm) / 100) * 100 : '';
  const st = r && reminderRows().find((x) => x.id === r.id)?.st;
  openSheet(r ? r.title : (p.title || 'Eigene Erinnerung'), `<form id="rem">
    ${iconPicker(REM_ICONS, iconKey(r?.icon ?? p.icon, 'bell'))}
    <div>
      <label class="f"><span>Was?</span><input name="title" value="${esc(r?.title ?? p.title ?? '')}" placeholder="z. B. Pickerl erneuern" required></label>
    </div>
    ${p.hint ? `<p class="small muted" style="margin:-4px 2px 12px">${esc(p.hint)}</p>` : ''}
    <div class="grid2">
      <label class="f"><span>Fällig am</span><input name="date" type="date" value="${dueDate ?? ''}"></label>
      <label class="f"><span>und/oder bei km</span><input name="km" inputmode="numeric" value="${dueKm ?? ''}" placeholder="z. B. ${fmt(Math.ceil((km + 10000) / 1000) * 1000)}"></label>
    </div>
    <div class="grid2">
      <label class="f"><span>Wiederholen alle … Monate</span><input name="rm" inputmode="numeric" value="${r?.repeat_months ?? p.repeat_months ?? ''}" placeholder="nicht"></label>
      <label class="f"><span>… oder alle … km</span><input name="rk" inputmode="numeric" value="${r?.repeat_km ?? p.repeat_km ?? ''}" placeholder="nicht"></label>
    </div>
    <label class="f"><span>Kategorie für die Kosten (optional)</span><select name="cat"><option value="">–</option>${cats.map((c) => `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Notiz (optional)</span><input name="note" value="${esc(r?.note ?? p.note ?? '')}"></label>
    <div class="btns">
      ${r && !r.done_at ? `<button type="button" class="btn" id="done">${ic('check')} Erledigt</button>` : ''}
      <button class="btn ${r && !r.done_at ? 'secondary' : ''}" type="submit">Speichern</button>
      ${r && !r.done_at && (r.due_date || st?.dueDate) ? `<button type="button" class="btn secondary" id="cal">${ic('calendar-plus')} In den Kalender</button>` : ''}
      ${r ? '<button type="button" class="btn danger" id="del">Löschen</button>' : ''}
    </div>
  </form>`, (b) => {
    const form = $('#rem', b);
    const collect = () => {
      const kmV = parseNum(form.km.value), rm = parseNum(form.rm.value), rk = parseNum(form.rk.value);
      if ([kmV, rm, rk].some((x) => Number.isNaN(x))) throw new Error('Bitte Zahlen prüfen');
      if (!form.date.value && kmV === null) throw new Error('Bitte ein Datum oder einen km-Stand angeben');
      return { icon: form.icon.value || 'bell', title: form.title.value.trim(), due_date: form.date.value || null, due_km: kmV === null ? null : Math.round(kmV),
        repeat_months: rm ? Math.round(rm) : null, repeat_km: rk ? Math.round(rk) : null, category_id: form.cat.value || null, note: form.note.value.trim() || null };
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      let row; try { row = collect(); } catch (e) { return toast(e.message); }
      submitWith(form, async () => {
        if (r) await q(sb.from('reminders').update(row).eq('id', r.id));
        else await q(sb.from('reminders').insert({ ...row, car_id: S.carId }));
        toast('Gespeichert');
      });
    };
    $('#done', b)?.addEventListener('click', () => reminderDone(r));
    $('#cal', b)?.addEventListener('click', () => addToCalendar(r, st));
    const del = $('#del', b);
    if (del) del.onclick = () => confirm('Erinnerung löschen?') && submitWith(form, () => q(sb.from('reminders').delete().eq('id', r.id)));
  });
}
function addMonthsLocal(d, n) { const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); return r; }

function reminderDone(r) {
  const km = lastKm();
  const cat = catById(r.category_id);
  openSheet(`${r.title} erledigt`, `<form id="rdone">
    <div class="grid2">
      <label class="f"><span>Erledigt am</span><input name="date" type="date" value="${today()}" required></label>
      <label class="f"><span>km-Stand</span><input name="km" inputmode="numeric" value="${km}" required></label>
    </div>
    ${cat ? `<label class="f"><span>Kosten (optional) → ${esc(cat.name)}</span><input name="amount" inputmode="decimal" placeholder="z. B. 139"></label>` : ''}
    <div class="calc" id="nx"></div>
    <div class="btns"><button class="btn" type="submit">Fertig</button></div>
  </form>`, (b) => {
    const form = $('#rdone', b);
    const prev = () => {
      const n = nextReminder(r, form.date.value || today(), parseNum(form.km.value) || km);
      $('#nx', b).textContent = n ? `Nächste Erinnerung: ${[n.due_date && dDate(n.due_date), n.due_km && `bei ${fmt(n.due_km)} km`].filter(Boolean).join(' oder ')}` : 'Wird nicht wiederholt.';
    };
    form.date.oninput = form.km.oninput = prev; prev();
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const kmV = parseNum(form.km.value), amount = form.amount ? parseNum(form.amount.value) : null;
      if (kmV === null || Number.isNaN(kmV) || Number.isNaN(amount)) return toast('Bitte Zahlen prüfen');
      submitWith(form, async () => {
        await q(sb.from('reminders').update({ done_at: form.date.value }).eq('id', r.id));
        const n = nextReminder(r, form.date.value, kmV);
        if (n) await q(sb.from('reminders').insert({ car_id: S.carId, title: r.title, icon: r.icon, category_id: r.category_id, note: r.note, repeat_months: r.repeat_months, repeat_km: r.repeat_km, ...n }));
        if (amount) await q(sb.from('expenses').insert({ car_id: S.carId, category_id: r.category_id, date: form.date.value, amount, km: Math.round(kmV), comment: r.title }));
        else await q(sb.from('odometer').insert({ car_id: S.carId, date: form.date.value, km: Math.round(kmV) }));
        toast('Erledigt');
      });
    };
  });
}

function addToCalendar(r, st) {
  const d = r.due_date ? parseDate(r.due_date) : st.dueDate;
  const p = (n) => String(n).padStart(2, '0');
  const ymd = (x) => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const txt = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const desc = [`${car().name}`, r.due_km ? `fällig bei ${fmt(r.due_km)} km` : '', r.note].filter(Boolean).join(' – ');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Autokosten//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${r.id}@autokosten`, `DTSTAMP:${stamp}`, `DTSTART:${ymd(d)}T090000`, `DTEND:${ymd(d)}T093000`,
    `SUMMARY:${txt(`${r.title} (${car().name})`)}`, `DESCRIPTION:${txt(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(r.title)}`, 'TRIGGER:-P7D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(r.title)}`, 'TRIGGER:-PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  // iOS öffnet .ics direkt mit „Zum Kalender hinzufügen“
  const a = document.createElement('a');
  a.href = url; a.download = `${r.title.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------------------------------------------------------------------------
//  Export
// ---------------------------------------------------------------------------
async function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = () => car().name.replace(/[^\wäöüÄÖÜß-]+/g, '_');
function exportCsv() {
  const u = unit();
  const cell = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = (v, d = 2) => (v === null || v === undefined ? '' : Number(v).toFixed(d).replace('.', ','));
  const rows = [['Datum', 'Kategorie', 'Art', 'Betrag €', `Menge ${u}`, 'km-Stand', 'Kommentar']];
  for (const e of [...S.d.expenses].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const c = catById(e.category_id);
    rows.push([e.date, c?.name, e.kind_override || c?.kind, n(e.amount), n(e.liters), e.km ?? '', e.comment]);
  }
  for (const k of computeStats({ car: car(), ...S.d }).contracts) rows.push(['', `${catById(k.category_id)?.name} – ${k.name}`, 'fix', n(k.paid), '', '', `${k.payments} Zahlungen bisher`]);
  for (const o of [...S.d.odometer].sort((a, b) => (a.date < b.date ? -1 : 1))) rows.push([o.date, 'km-Stand', '', '', '', o.km, '']);
  saveFile(`Autokosten_${slug()}_${today()}.csv`, '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n'), 'text/csv');
}
function exportJson() {
  const data = { exportiert: new Date().toISOString(), auto: car(), ...S.d };
  saveFile(`Autokosten_${slug()}_${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------
async function start() {
  if (!sb) return renderNotConfigured();
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((event, session) => {
    const changed = (S.session?.user?.id || null) !== (session?.user?.id || null);
    S.session = session;
    // setTimeout: Supabase-Aufrufe nicht direkt im Auth-Callback ausführen
    if (changed) setTimeout(() => { S.cars = []; S.tab = 'home'; S.page = null; S.wiz = null; closeSheet(); session ? refresh() : render(); }, 0);
  });
  if (S.session) await refresh(); else render();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.session && !S.wiz && !$('#sheet-root').innerHTML) refresh();
  });
}
start().catch(fail);
