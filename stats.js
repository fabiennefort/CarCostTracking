// Reine Berechnungslogik – keine Abhängigkeiten, im Browser und in Node testbar.

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function parseDate(s) {
  // 'YYYY-MM-DD' -> Date (lokale Mitternacht)
  if (s instanceof Date) return s;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addMonths(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last));
  return r;
}
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Alle fälligen Zahlungen eines Vertrags bis einschließlich `until`.
 * Mit `from` (Kauf-/Startdatum) zählen nur Zahlungen ab diesem Tag; eine Zahlung,
 * deren Zeitraum den Start überspannt, zählt anteilig (z. B. Jahresbeitrag im Januar,
 * Erfassung ab November → 2/12 des Beitrags).
 */
export function contractPayments(c, until, from = null) {
  const out = [];
  const start = parseDate(c.start_date);
  const end = c.end_date ? parseDate(c.end_date) : null;
  const step = Number(c.interval_months) || 12;
  for (let i = 0; i < 1200; i++) {
    const d = addMonths(start, i * step);
    if (d > until) break;
    if (end && d > end) break;
    let amount = Number(c.amount);
    if (from && d < from) {
      const periodEnd = addMonths(start, (i + 1) * step);
      if (periodEnd <= from) continue;
      amount *= (periodEnd - from) / (periodEnd - d);
      out.push({ date: from, amount, partial: true });
      continue;
    }
    out.push({ date: d, amount });
  }
  return out;
}

/**
 * Aktuell laufende Verträge zum Stichtag: begonnen und nicht beendet.
 * Ein Vertrag, der erst in der Zukunft beginnt, zählt nur, wenn es keinen
 * laufenden Vorgänger gleichen Namens in derselben Kategorie gibt
 * (sonst würde eine angekündigte Beitragsänderung doppelt gezählt).
 */
export function runningContracts(contracts, at) {
  const active = (c) => !c.end_date || parseDate(c.end_date) >= new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const started = contracts.filter((c) => active(c) && parseDate(c.start_date) <= at);
  const future = contracts.filter((c) => active(c) && parseDate(c.start_date) > at
    && !started.some((x) => x.name === c.name && x.category_id === c.category_id));
  return [...started, ...future];
}
export const monthlyShare = (c) => Number(c.amount) / (Number(c.interval_months) || 12);

/** Aktueller km-Stand: höchster bekannter Wert. */
export function currentKm(car, expenses = [], odometer = []) {
  let km = Number(car.start_km) || 0;
  for (const o of odometer) if (num(o.km) !== null) km = Math.max(km, Number(o.km));
  for (const e of expenses) if (num(e.km) !== null) km = Math.max(km, Number(e.km));
  return km;
}

/**
 * Verbrauch aus Tankungen ohne "vollgetankt"-Angabe:
 * Liter aller Tankungen außer der ersten / km zwischen erster und letzter Tankung.
 * Über längere Zeiträume mittelt sich der Tankfüllstand heraus.
 */
export function consumption(fills) {
  const f = fills
    .filter((x) => num(x.km) !== null && num(x.liters) !== null && Number(x.liters) > 0)
    .sort((a, b) => Number(a.km) - Number(b.km) || parseDate(a.date) - parseDate(b.date));
  if (f.length < 2) return null;
  const km = Number(f[f.length - 1].km) - Number(f[0].km);
  if (km <= 0) return null;
  const liters = f.slice(1).reduce((s, x) => s + Number(x.liters), 0);
  const cost = f.slice(1).reduce((s, x) => s + Number(x.amount || 0), 0);
  return { liters, km, per100: (liters / km) * 100, costPer100: (cost / km) * 100, fills: f.length };
}

export function consumptionWindow(fills, from, to) {
  return consumption(fills.filter((x) => {
    const d = parseDate(x.date);
    return d >= from && d <= to;
  }));
}

/** Hauptauswertung */
export function computeStats({ car, categories = [], expenses = [], odometer = [], contracts = [], today = new Date() }) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const end = car.sale_date ? new Date(Math.min(parseDate(car.sale_date), today)) : today;
  const purchase = parseDate(car.purchase_date);

  const kmNow = currentKm(car, expenses, odometer);
  const kmDriven = Math.max(0, kmNow - (Number(car.start_km) || 0));
  const days = Math.max(1, Math.round((end - purchase) / 86400000));
  const months = days / (365.25 / 12);

  // Summen nach Kategorie
  const byCat = new Map();
  const bump = (catId, amount, kind) => {
    const c = catById[catId] || { id: catId, name: '–', kind: kind || 'variabel', icon: '•' };
    const row = byCat.get(catId) || { id: catId, name: c.name, icon: c.icon, kind: c.kind, sum: 0, count: 0 };
    row.sum += amount; row.count += 1;
    byCat.set(catId, row);
  };

  let variable = 0, fix = 0, income = 0, fixSingle = 0;
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (catById[e.category_id]?.kind === 'einnahme') { income += amt; bump(e.category_id, amt, 'einnahme'); continue; }
    const kind = e.kind_override || catById[e.category_id]?.kind || 'variabel';
    if (kind === 'fix') { fix += amt; fixSingle += amt; } else variable += amt;
    bump(e.category_id, amt, kind);
  }
  let contractTotal = 0;
  const contractRows = [];
  for (const c of contracts) {
    const pays = contractPayments(c, end, purchase);
    const s = pays.reduce((a, p) => a + p.amount, 0);
    contractTotal += s;
    const kind = catById[c.category_id]?.kind || 'fix';
    if (kind === 'einnahme') income += s; else if (kind === 'fix') fix += s; else variable += s;
    if (pays.length) {
      const row = byCat.get(c.category_id) || {
        id: c.category_id, name: catById[c.category_id]?.name || c.name,
        icon: catById[c.category_id]?.icon || '•', kind, sum: 0, count: 0,
      };
      row.sum += s; row.count += pays.length;
      byCat.set(c.category_id, row);
    }
    contractRows.push({ ...c, kind, paid: s, payments: pays.length, perMonth: monthlyShare(c) });
  }
  // Laufende Verträge (Monatsanteil) – Grundlage für "pro Monat"
  const running = runningContracts(contracts, end);
  const runningIds = new Set(running.map((c) => c.id));
  contractRows.forEach((r) => { r.running = runningIds.has(r.id); });
  const kindOf = (c) => catById[c.category_id]?.kind || 'fix';
  const contractFixMonthly = running.filter((c) => kindOf(c) === 'fix').reduce((a, c) => a + monthlyShare(c), 0);
  const contractVarMonthly = running.filter((c) => kindOf(c) === 'variabel').reduce((a, c) => a + monthlyShare(c), 0);
  const contractIncMonthly = running.filter((c) => kindOf(c) === 'einnahme').reduce((a, c) => a + monthlyShare(c), 0);
  // Einzelne Fixkosten (z. B. TÜV) über mindestens 12 Monate verteilen,
  // damit ein frisch angelegtes Auto keine aufgeblähten Monatswerte zeigt.
  const spread = Math.max(12, months);
  const fixPerMonth = contractFixMonthly + fixSingle / spread;

  const operating = variable + fix;
  const pp = Number(car.purchase_price) || 0;
  const remaining = num(car.sale_price) !== null ? Number(car.sale_price)
    : num(car.residual_value) !== null ? Number(car.residual_value) : null;
  const depreciation = remaining === null ? null : pp - remaining;

  const perKm = (v) => (kmDriven > 0 ? v / kmDriven : null);

  // Verbrauch
  const fuelCatIds = new Set(categories.filter((c) => c.is_fuel).map((c) => c.id));
  const fills = expenses.filter((e) => fuelCatIds.has(e.category_id));
  const fuelTotal = consumption(fills);
  const sixAgo = addMonths(end, -6);
  const fuel6 = consumptionWindow(fills, sixAgo, end);
  const litersTotal = fills.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const fuelCost = fills.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Gleitender 6-Monats-Verbrauch je Monat (für Verlaufsdiagramm)
  const fuelSeries = [];
  if (fills.length >= 2) {
    const first = parseDate(fills.map((f) => f.date).sort()[0]);
    let m = new Date(first.getFullYear(), first.getMonth() + 1, 0); // Monatsende
    while (m <= new Date(end.getFullYear(), end.getMonth() + 1, 0)) {
      const c = consumptionWindow(fills, addMonths(m, -6), m);
      if (c && c.km >= 300) fuelSeries.push({ month: monthKey(m), per100: c.per100 });
      m = new Date(m.getFullYear(), m.getMonth() + 2, 0);
    }
  }

  // Monatskosten der letzten 12 Monate (Verträge zeitanteilig verteilt)
  const monthly = [];
  const startM = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  const idx = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(startM.getFullYear(), startM.getMonth() + i, 1);
    if (d < new Date(purchase.getFullYear(), purchase.getMonth(), 1)) continue;
    const row = { month: monthKey(d), fix: 0, variabel: 0, einnahme: 0 };
    idx[row.month] = row; monthly.push(row);
  }
  for (const e of expenses) {
    const r = idx[monthKey(parseDate(e.date))];
    if (!r) continue;
    if (catById[e.category_id]?.kind === 'einnahme') { r.einnahme += Number(e.amount) || 0; continue; }
    const kind = e.kind_override || catById[e.category_id]?.kind || 'variabel';
    r[kind === 'fix' ? 'fix' : 'variabel'] += Number(e.amount) || 0;
  }
  for (const c of contracts) {
    const step = Number(c.interval_months) || 12;
    const ck = catById[c.category_id]?.kind;
    const kind = ck === 'variabel' ? 'variabel' : ck === 'einnahme' ? 'einnahme' : 'fix';
    for (const p of contractPayments(c, end, purchase)) {
      for (let k = 0; k < step; k++) {
        const r = idx[monthKey(addMonths(new Date(p.date.getFullYear(), p.date.getMonth(), 1), k))];
        if (r) r[kind] += p.amount / step;
      }
    }
  }

  return {
    kmNow, kmDriven, days, months,
    variable, fix, operating, contractTotal, income,
    purchasePrice: pp, remaining, depreciation,
    perKm: {
      operating: perKm(operating),
      variable: perKm(variable),
      fix: perKm(fix),
      withDepreciation: depreciation === null ? null : perKm(operating + depreciation),
      withPurchase: perKm(operating + pp),
    },
    fixPerMonth,
    contractMonthly: { fix: contractFixMonthly, variabel: contractVarMonthly, einnahme: contractIncMonthly },
    byCategory: [...byCat.values()].sort((a, b) => b.sum - a.sum),
    contracts: contractRows,
    fuel: { total: fuelTotal, last6: fuel6, litersTotal, fuelCost, series: fuelSeries, count: fills.length },
    monthly,
  };
}

// ---------------------------------------------------------------------------
//  Erinnerungen
// ---------------------------------------------------------------------------

/** Durchschnittliche km pro Tag (möglichst aus dem letzten Jahr). */
export function kmPerDay(car, expenses = [], odometer = [], today = new Date()) {
  const pts = [{ date: parseDate(car.purchase_date), km: Number(car.start_km) || 0 }];
  for (const x of [...odometer, ...expenses]) if (num(x.km) !== null && x.date) pts.push({ date: parseDate(x.date), km: Number(x.km) });
  pts.sort((a, b) => a.date - b.date || a.km - b.km);
  const last = pts[pts.length - 1];
  const yearAgo = addMonths(today, -12);
  const first = pts.find((p) => p.date >= yearAgo && last.date - p.date >= 30 * 86400000) || pts[0];
  const days = (last.date - first.date) / 86400000;
  if (days < 14 || last.km <= first.km) return null;
  return (last.km - first.km) / days;
}

/** Status einer Erinnerung: überfällig / bald / ok, inkl. geschätztem Datum bei km-Fälligkeit. */
export function reminderStatus(r, { kmNow, perDay, today = new Date() }) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let byDate = null, byKm = null, kmLeft = null;
  if (r.due_date) byDate = Math.round((parseDate(r.due_date) - t0) / 86400000);
  if (num(r.due_km) !== null) {
    kmLeft = Number(r.due_km) - kmNow;
    if (perDay) byKm = Math.round(kmLeft / perDay);
  }
  const cands = [byDate, byKm].filter((x) => x !== null);
  const daysLeft = cands.length ? Math.min(...cands) : null;
  const viaKm = byKm !== null && (byDate === null || byKm < byDate);
  const overdue = (byDate !== null && byDate < 0) || (kmLeft !== null && kmLeft < 0);
  const soon = !overdue && ((daysLeft !== null && daysLeft <= 30) || (kmLeft !== null && kmLeft <= 1000));
  const dueDate = daysLeft === null ? null : new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + daysLeft);
  return { level: overdue ? 'overdue' : soon ? 'soon' : 'ok', daysLeft, kmLeft, viaKm, dueDate, estimated: viaKm };
}

/** Nächste Fälligkeit nach "Erledigt" (oder null, wenn nicht wiederkehrend). */
export function nextReminder(r, doneDate, kmAtDone) {
  const rm = num(r.repeat_months), rk = num(r.repeat_km);
  if (!rm && !rk) return null;
  const next = { due_date: null, due_km: null };
  if (rm) next.due_date = isoDate(addMonths(parseDate(doneDate), rm));
  if (rk) next.due_km = Math.round(kmAtDone + rk);
  if (!next.due_date && !next.due_km) return null;
  return next;
}

// ---------------------------------------------------------------------------
//  Auswertung mit wählbaren Bestandteilen (Filter-Chips)
// ---------------------------------------------------------------------------
export const DEFAULT_FILTER = { variabel: true, fix: true, wertverlust: true, einnahmen: true };

export function costView(st, f = DEFAULT_FILTER) {
  let total = 0;
  if (f.variabel) total += st.variable;
  if (f.fix) total += st.fix;
  if (f.wertverlust && st.depreciation !== null) total += st.depreciation;
  if (f.einnahmen) total -= st.income;
  // Pro Monat: Fixkosten als laufender Monatswert, alles andere als Durchschnitt
  // seit Start (mindestens über einen Monat gerechnet).
  const m = Math.max(1, st.months);
  let perMonth = 0;
  if (f.variabel) perMonth += st.variable / m;
  if (f.fix) perMonth += st.fixPerMonth;
  if (f.wertverlust && st.depreciation !== null) perMonth += st.depreciation / m;
  if (f.einnahmen) perMonth -= st.income / m;
  return {
    total,
    perKm: st.kmDriven > 0 ? total / st.kmDriven : null,
    perMonth,
    missingDepreciation: !!f.wertverlust && st.depreciation === null,
  };
}
