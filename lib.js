/*
 * GameDay core logic — pure functions with no DOM access.
 * Loaded by the browser as a classic script (exposes window.GameDayLib)
 * and by Node tests via require() (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameDayLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Bump SCHEMA_VERSION whenever the stored shape of teams/events changes,
  // and add a step to migrate() that upgrades older data.
  const STORE_KEY = 'gameday.v1';
  const SCHEMA_VERSION = 1;

  const TYPES = {
    game: { label: 'Game', short: 'GAME' },
    practice: { label: 'Practice', short: 'PRAC' },
    meeting: { label: 'Meeting', short: 'MTG' },
  };
  const DEFAULT_TITLES = { game: 'Game', practice: 'Practice', meeting: 'Team Meeting' };
  const TEAM_COLORS = ['#ff4d1c', '#1e88e5', '#16a34a', '#9333ea', '#f59e0b', '#e11d48', '#0891b2', '#475569'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- Small helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#64748b');

  const fmtTime = (t) => {
    if (!t) return '';
    let [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  };
  const shortTime = (t) => {
    let [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
  };
  const eventStart = (e) => {
    const d = parseKey(e.date);
    if (e.start) { const [h, m] = e.start.split(':').map(Number); d.setHours(h, m); }
    return d;
  };
  const sortEvents = (a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''));
  const hasScore = (e) => e.scoreUs != null && e.scoreThem != null;
  const resultOf = (e) => (e.scoreUs > e.scoreThem ? 'W' : e.scoreUs < e.scoreThem ? 'L' : 'T');

  // ---------- Event building / validation ----------
  // Takes raw form strings and returns { fields } or { error }.
  function buildEventFields(input) {
    const s = (k) => String(input[k] ?? '').trim();
    const type = s('type');
    if (!TYPES[type]) return { error: 'Pick an event type' };
    if (!s('teamId')) return { error: 'Pick a team' };
    const date = s('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick a date' };
    const start = s('start'), end = s('end');
    if (start && end && end <= start) return { error: 'End time must be after the start time' };

    const opponent = type === 'game' ? s('opponent') : '';
    const home = s('home') !== 'away';
    const su = s('scoreUs'), st = s('scoreThem');
    if (type === 'game' && (su === '') !== (st === '')) return { error: 'Enter both scores, or leave both empty' };
    const scored = type === 'game' && su !== '' && st !== '';
    if (scored && (!(Number(su) >= 0) || !(Number(st) >= 0))) return { error: 'Scores must be zero or more' };

    const title = s('title') || (type === 'game' && opponent ? `${home ? 'vs' : '@'} ${opponent}` : DEFAULT_TITLES[type]);
    return {
      fields: {
        teamId: s('teamId'), type, title, date, start, end, location: s('location'), opponent, home,
        notes: s('notes'), scoreUs: scored ? Number(su) : null, scoreThem: scored ? Number(st) : null,
      },
    };
  }

  // Expands one event into `weeks` weekly copies (1 = no repeat, capped at 26).
  function expandWeekly(fields, weeks) {
    const n = Math.min(26, Math.max(1, Number(weeks) || 1));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ id: uid(), ...fields, date: toKey(addDays(parseKey(fields.date), 7 * i)) });
    return out;
  }

  // ---------- Stats ----------
  function teamStats(events, teamId) {
    const games = events.filter((e) => e.teamId === teamId && e.type === 'game' && hasScore(e)).sort(sortEvents);
    let w = 0, l = 0, t = 0, pf = 0, pa = 0;
    games.forEach((g) => {
      pf += g.scoreUs; pa += g.scoreThem;
      const r = resultOf(g);
      if (r === 'W') w++; else if (r === 'L') l++; else t++;
    });
    let streak = '–';
    if (games.length) {
      const last = resultOf(games[games.length - 1]);
      let n = 0;
      for (let i = games.length - 1; i >= 0 && resultOf(games[i]) === last; i--) n++;
      streak = `${last}${n}`;
    }
    const pct = games.length ? (w + t * 0.5) / games.length : null;
    return { games, w, l, t, pf, pa, pct, streak };
  }

  // ---------- Persistence shape ----------
  // Accepts whatever was in storage; returns valid current-schema data or null.
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.teams) || !Array.isArray(raw.events)) return null;
    const d = { prefs: {}, ...raw };
    if (!d.version) d.version = 1; // pre-versioned data is schema 1
    // Future steps go here, e.g. if (d.version < 2) { ...; d.version = 2; }
    if (d.version > SCHEMA_VERSION) return null;
    d.events = d.events.filter((e) => e && TYPES[e.type] && typeof e.date === 'string');
    return d;
  }

  // ---------- Demo data ----------
  function seed(today = new Date()) {
    today = new Date(today); today.setHours(0, 0, 0, 0);
    const teams = [
      { id: 't1', name: 'Varsity Soccer', sport: 'Soccer', color: '#ff4d1c' },
      { id: 't2', name: 'JV Basketball', sport: 'Basketball', color: '#1e88e5' },
      { id: 't3', name: 'Girls Volleyball', sport: 'Volleyball', color: '#9333ea' },
    ];
    const opps = ['Eagles', 'Wildcats', 'Rams', 'Titans', 'Hornets', 'Falcons', 'Bulldogs', 'Lions', 'Panthers', 'Spartans', 'Mustangs', 'Cougars'];
    let r = 11;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const events = [];
    const add = (o) => events.push({ id: uid(), location: '', opponent: '', home: true, notes: '', scoreUs: null, scoreThem: null, ...o });
    const game = (teamId, date, start, end, homeLoc, score) => {
      const home = rnd() > 0.45;
      const opponent = pick(opps);
      add({ teamId, type: 'game', title: `${home ? 'vs' : '@'} ${opponent}`, date, start, end, opponent, home,
        location: home ? homeLoc : `${opponent} Stadium`, ...(score || {}) });
    };
    const score = (sport) => {
      if (sport === 'soccer') return { scoreUs: Math.floor(rnd() * 4), scoreThem: Math.floor(rnd() * 3.4) };
      if (sport === 'bball') return { scoreUs: 42 + Math.floor(rnd() * 30), scoreThem: 40 + Math.floor(rnd() * 28) };
      const win = rnd() > 0.38;
      const other = Math.floor(rnd() * 3);
      return win ? { scoreUs: 3, scoreThem: other } : { scoreUs: other, scoreThem: 3 };
    };

    let leftOneUnscored = false;
    for (let i = -42; i <= 42; i++) {
      const d = addDays(today, i);
      const k = toKey(d);
      const dow = d.getDay();
      const past = i < 0;

      // Varsity Soccer: practice Mon/Wed/Thu, film every other Fri, game Sat
      if (dow === 1 || dow === 3 || dow === 4) add({ teamId: 't1', type: 'practice', title: 'Practice', date: k, start: '15:30', end: '17:30', location: 'North Field' });
      if (dow === 5 && ((i % 14) + 14) % 14 < 7) add({ teamId: 't1', type: 'meeting', title: 'Film Session', date: k, start: '15:15', end: '16:00', location: 'Room 204', notes: 'Review last game footage.' });
      if (dow === 6) game('t1', k, '11:00', '13:00', 'North Field', past ? score('soccer') : null);

      // JV Basketball: practice Tue/Thu, game Fri, meeting every other Mon
      if (dow === 2 || dow === 4) add({ teamId: 't2', type: 'practice', title: 'Practice', date: k, start: '18:00', end: '19:45', location: 'Main Gym' });
      if (dow === 5) {
        const s = past ? score('bball') : null;
        if (past && i > -7 && !leftOneUnscored) { leftOneUnscored = true; game('t2', k, '19:00', '20:30', 'Main Gym', null); }
        else game('t2', k, '19:00', '20:30', 'Main Gym', s);
      }
      if (dow === 1 && Math.floor((i + 42) / 7) % 2 === 0) add({ teamId: 't2', type: 'meeting', title: 'Team Meeting', date: k, start: '12:15', end: '12:45', location: 'Coach Office' });

      // Girls Volleyball: practice Mon/Wed, match every Tue
      if (dow === 1 || dow === 3) add({ teamId: 't3', type: 'practice', title: 'Practice', date: k, start: '16:00', end: '18:00', location: 'Aux Gym' });
      if (dow === 2) game('t3', k, '17:30', '19:00', 'Aux Gym', past ? score('vb') : null);
    }
    add({ teamId: 't1', type: 'meeting', title: 'Parent Night', date: toKey(addDays(today, 9)), start: '18:30', end: '19:30', location: 'Library', notes: 'Season overview and travel plans.' });
    return { version: SCHEMA_VERSION, teams, events, prefs: {} };
  }

  return {
    STORE_KEY, SCHEMA_VERSION, TYPES, DEFAULT_TITLES, TEAM_COLORS, MONTHS, DOW,
    esc, uid, pad, toKey, parseKey, addDays, safeColor, fmtTime, shortTime,
    eventStart, sortEvents, hasScore, resultOf,
    buildEventFields, expandWeekly, teamStats, migrate, seed,
  };
});
