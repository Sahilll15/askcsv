// Seeded so the sample CSVs are reproducible: node scripts/gen-data.mjs
import { writeFileSync } from 'node:fs';

let seed = 20251003;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
const normal = (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const csv = (rows) => {
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
};

function saas() {
  const plans = { Starter: 29, Growth: 99, Scale: 299, Enterprise: 1200 };
  const prefixes = ['Acme', 'Northwind', 'Bluebird', 'Lumen', 'Kestrel', 'Orbit', 'Pine', 'Harbor', 'Atlas', 'Quill', 'Vela', 'Copper', 'Juniper', 'Nimbus', 'Fable'];
  const suffixes = ['Labs', 'Health', 'Logistics', 'Studio', 'Foods', 'Analytics', 'Systems', 'Retail', 'Partners', 'Works'];
  const rows = [];
  const start = Date.UTC(2024, 0, 1);
  const span = Date.UTC(2025, 11, 31) - start;
  const end = Date.UTC(2025, 11, 31);
  for (let i = 0; i < 3200; i++) {
    const t = Math.pow(rand(), 0.8) * span;
    const signup = new Date(start + t);
    const plan = weighted([['Starter', 45], ['Growth', 32], ['Scale', 16], ['Enterprise', 7]]);
    const billing = weighted([['monthly', 64], ['annual', 36]]);
    const seats = plan === 'Enterprise' ? 20 + Math.floor(rand() * 180) : plan === 'Scale' ? 5 + Math.floor(rand() * 40) : 1 + Math.floor(rand() * 10);
    const perSeat = plan === 'Starter' || plan === 'Growth' ? plans[plan] * (1 + (seats - 1) * 0.15) : plans[plan] + seats * (plan === 'Scale' ? 12 : 9);
    const mrr = Math.round(perSeat * (billing === 'annual' ? 0.85 : 1) * 100) / 100;
    const churnRate = { Starter: 0.042, Growth: 0.028, Scale: 0.016, Enterprise: 0.008 }[plan] * (billing === 'annual' ? 0.5 : 1);
    let status = 'active';
    let churn = null;
    const monthsAlive = (end - signup.getTime()) / (30 * 864e5);
    const trial = monthsAlive < 0.5 && rand() < 0.6;
    if (trial) status = 'trial';
    else {
      const m = Math.log(1 - rand()) / Math.log(1 - churnRate);
      if (m < monthsAlive) {
        status = 'churned';
        churn = day(new Date(signup.getTime() + Math.max(1, m) * 30 * 864e5));
      }
    }
    rows.push({
      subscription_id: `SUB-${10000 + i}`,
      company: `${pick(prefixes)} ${pick(suffixes)}`,
      plan,
      billing_cycle: billing,
      country: weighted([['United States', 38], ['United Kingdom', 12], ['Germany', 10], ['India', 11], ['Canada', 7], ['Australia', 6], ['France', 6], ['Brazil', 5], ['Japan', 5]]),
      acquisition_channel: weighted([['organic search', 30], ['paid search', 22], ['referral', 15], ['partner', 10], ['outbound sales', 13], ['content', 10]]),
      signup_date: day(signup),
      churn_date: churn,
      status,
      seats,
      mrr_usd: trial ? 0 : mrr,
    });
  }
  return rows.sort((a, b) => a.signup_date.localeCompare(b.signup_date));
}

function bikes() {
  const stations = ['Union Square', 'Harbor Front', 'Central Station', 'Museum Mile', 'Riverside Park', 'Tech Campus', 'Old Town', 'Stadium', 'University Ave', 'Market Hall', 'Lakeside', 'City Hall'];
  const monthlyTemp = [3, 4, 8, 13, 18, 23, 26, 25, 21, 15, 9, 4];
  const monthWeight = [3, 3.5, 6, 8, 10, 11.5, 12, 12, 10, 8, 5, 3];
  const rows = [];
  for (let i = 0; i < 4200; i++) {
    const m = weighted(monthWeight.map((w, idx) => [idx, w]));
    const d = 1 + Math.floor(rand() * 28);
    const rider = weighted([['member', 68], ['casual', 32]]);
    const hour = rider === 'member' ? weighted([[7, 9], [8, 14], [9, 8], [12, 6], [13, 5], [16, 8], [17, 14], [18, 11], [19, 6], [21, 3], [10, 4], [15, 5]]) : weighted([[10, 6], [11, 9], [12, 10], [13, 11], [14, 12], [15, 11], [16, 10], [17, 8], [18, 6], [19, 5], [20, 4]]);
    const minute = Math.floor(rand() * 60);
    const bike = weighted([['classic', 58], ['electric', 42]]);
    const startS = pick(stations);
    let endS = pick(stations);
    if (rand() < 0.08) endS = startS;
    const baseDur = rider === 'member' ? 11 : 22;
    const dur = Math.max(2, Math.round(Math.abs(normal(baseDur, baseDur * 0.55)) * (bike === 'electric' ? 0.85 : 1) * 10) / 10);
    const speed = bike === 'electric' ? 17 : 12.5;
    const dist = Math.round(Math.max(0.3, (dur / 60) * speed * (startS === endS ? 0.6 : 1) * (0.8 + rand() * 0.3)) * 100) / 100;
    rows.push({
      trip_id: `T${200000 + i}`,
      started_at: `2025-${pad(m + 1)}-${pad(d)} ${pad(hour)}:${pad(minute)}:00`,
      rider_type: rider,
      bike_type: bike,
      start_station: startS,
      end_station: endS,
      duration_min: dur,
      distance_km: dist,
      temperature_c: Math.round(normal(monthlyTemp[m], 3) * 10) / 10,
    });
  }
  return rows.sort((a, b) => a.started_at.localeCompare(b.started_at)).map((r, i) => ({ ...r, trip_id: `T${200000 + i}` }));
}

function coffee() {
  const menu = [
    ['Coffee', 'Espresso', 3.0], ['Coffee', 'Americano', 3.5], ['Coffee', 'Flat white', 4.5], ['Coffee', 'Latte', 4.75],
    ['Coffee', 'Cappuccino', 4.5], ['Coffee', 'Cold brew', 5.0], ['Tea', 'Chai latte', 4.75], ['Tea', 'Matcha latte', 5.5],
    ['Tea', 'Earl grey', 3.25], ['Bakery', 'Croissant', 3.75], ['Bakery', 'Banana bread', 4.0], ['Bakery', 'Cinnamon roll', 4.5],
    ['Food', 'Avocado toast', 9.5], ['Food', 'Breakfast sandwich', 8.75], ['Food', 'Granola bowl', 7.5],
  ];
  const weights = [6, 9, 12, 16, 10, 8, 6, 5, 3, 9, 4, 5, 4, 5, 3];
  const stores = [['Downtown', 45], ['Riverside', 32], ['Airport', 23]];
  const rows = [];
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 4800; i++) {
    const dayIdx = Math.floor(Math.pow(rand(), 0.9) * 273);
    const date = new Date(start + dayIdx * 864e5);
    const store = weighted(stores);
    const hour = weighted([[6, 4], [7, 12], [8, 16], [9, 12], [10, 9], [11, 8], [12, 10], [13, 8], [14, 6], [15, 6], [16, 4], [17, 3], [18, 2]]);
    const idx = weighted(menu.map((_, k) => [k, weights[k] * (hour >= 11 && hour <= 13 && menu[k][0] === 'Food' ? 3 : 1)]));
    const [category, product, price] = menu[idx];
    const size = category === 'Coffee' || category === 'Tea' ? weighted([['small', 30], ['medium', 45], ['large', 25]]) : 'regular';
    const unit = Math.round((price + (size === 'large' ? 0.75 : size === 'small' ? -0.5 : 0) + (store === 'Airport' ? 0.75 : 0)) * 100) / 100;
    const qty = weighted([[1, 78], [2, 17], [3, 4], [4, 1]]);
    rows.push({
      order_id: `ORD-${50000 + i}`,
      order_date: day(date),
      order_hour: hour,
      store,
      category,
      product,
      size,
      quantity: qty,
      unit_price: unit,
      line_total: Math.round(unit * qty * 100) / 100,
      payment: weighted([['card', 62], ['mobile', 28], ['cash', 10]]),
      loyalty_member: rand() < 0.38 ? 'yes' : 'no',
    });
  }
  return rows.sort((a, b) => a.order_date.localeCompare(b.order_date) || a.order_hour - b.order_hour).map((r, i) => ({ ...r, order_id: `ORD-${50000 + i}` }));
}

for (const [name, fn] of [['saas_subscriptions', saas], ['bike_trips', bikes], ['coffee_sales', coffee]]) {
  const rows = fn();
  writeFileSync(new URL(`../public/data/${name}.csv`, import.meta.url), csv(rows));
  console.log(name, rows.length);
}
