// Unit tests for lib.js — run with `npm test` (Node's built-in test runner, no deps).
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

test('date keys round-trip in local time', () => {
  assert.equal(L.toKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(L.toKey(L.parseKey('2026-12-31')), '2026-12-31');
  assert.equal(L.toKey(L.addDays(L.parseKey('2026-02-28'), 1)), '2026-03-01');
});

test('time formatting', () => {
  assert.equal(L.fmtTime('00:05'), '12:05 AM');
  assert.equal(L.fmtTime('15:30'), '3:30 PM');
  assert.equal(L.fmtTime(''), '');
  assert.equal(L.shortTime('11:00'), '11a');
  assert.equal(L.shortTime('19:45'), '7:45p');
});

test('esc neutralises HTML', () => {
  assert.equal(L.esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(L.esc(null), '');
});

test('safeColor only allows 6-digit hex', () => {
  assert.equal(L.safeColor('#FF4D1C'), '#FF4D1C');
  assert.equal(L.safeColor('red;background:url(x)'), '#64748b');
});

test('buildEventFields: defaults and auto titles', () => {
  const base = { type: 'game', teamId: 't1', date: '2026-10-10', start: '11:00', end: '13:00' };
  assert.equal(L.buildEventFields({ ...base, opponent: 'Eagles', home: 'home' }).fields.title, 'vs Eagles');
  assert.equal(L.buildEventFields({ ...base, opponent: 'Eagles', home: 'away' }).fields.title, '@ Eagles');
  assert.equal(L.buildEventFields({ ...base, type: 'practice', opponent: 'Ignored' }).fields.opponent, '');
  assert.equal(L.buildEventFields({ ...base, type: 'meeting' }).fields.title, 'Team Meeting');
  assert.equal(L.buildEventFields({ ...base, title: '  Senior Night ' }).fields.title, 'Senior Night');
});

test('buildEventFields: validation errors', () => {
  const ok = { type: 'practice', teamId: 't1', date: '2026-10-10' };
  assert.ok(L.buildEventFields({ ...ok, type: 'party' }).error);
  assert.ok(L.buildEventFields({ ...ok, teamId: '' }).error);
  assert.ok(L.buildEventFields({ ...ok, date: '' }).error);
  assert.ok(L.buildEventFields({ ...ok, start: '17:00', end: '16:00' }).error);
  assert.ok(L.buildEventFields({ ...ok, type: 'game', scoreUs: '2', scoreThem: '' }).error);
  assert.ok(L.buildEventFields({ ...ok, type: 'game', scoreUs: '-1', scoreThem: '2' }).error);
  assert.equal(L.buildEventFields(ok).error, undefined);
});

test('buildEventFields: scores only kept for games', () => {
  const g = L.buildEventFields({ type: 'game', teamId: 't1', date: '2026-10-10', scoreUs: '3', scoreThem: '1' }).fields;
  assert.deepEqual([g.scoreUs, g.scoreThem], [3, 1]);
  const p = L.buildEventFields({ type: 'practice', teamId: 't1', date: '2026-10-10', scoreUs: '3', scoreThem: '1' }).fields;
  assert.deepEqual([p.scoreUs, p.scoreThem], [null, null]);
});

test('expandWeekly repeats every 7 days with unique ids, capped at 26', () => {
  const f = { type: 'practice', teamId: 't1', date: '2026-10-26', title: 'Practice' };
  const four = L.expandWeekly(f, 4);
  assert.deepEqual(four.map((e) => e.date), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  assert.equal(new Set(four.map((e) => e.id)).size, 4);
  assert.equal(L.expandWeekly(f, 99).length, 26);
  assert.equal(L.expandWeekly(f, undefined).length, 1);
});

test('teamStats computes record, pct and streak', () => {
  const g = (date, us, them, teamId = 't1') => ({ teamId, type: 'game', date, scoreUs: us, scoreThem: them });
  const events = [
    g('2026-09-01', 2, 1), g('2026-09-08', 0, 3), g('2026-09-15', 1, 1),
    g('2026-09-22', 4, 0), g('2026-09-29', 2, 0),
    g('2026-09-29', 9, 0, 't2'),
    { teamId: 't1', type: 'game', date: '2026-10-06', scoreUs: null, scoreThem: null },
    { teamId: 't1', type: 'practice', date: '2026-10-07' },
  ];
  const s = L.teamStats(events, 't1');
  assert.deepEqual([s.w, s.l, s.t], [3, 1, 1]);
  assert.equal(s.pct, 0.7);
  assert.equal(s.streak, 'W2');
  assert.deepEqual([s.pf, s.pa], [9, 5]);
  assert.equal(L.teamStats(events, 'nobody').pct, null);
});

test('migrate accepts valid data, rejects junk and future versions', () => {
  assert.equal(L.migrate(null), null);
  assert.equal(L.migrate({ teams: 'x', events: [] }), null);
  assert.equal(L.migrate({ version: L.SCHEMA_VERSION + 1, teams: [], events: [] }), null);
  const m = L.migrate({ teams: [], events: [{ type: 'game', date: '2026-10-10' }, { type: 'bogus', date: 'x' }] });
  assert.equal(m.version, 1);
  assert.deepEqual(m.prefs, {});
  assert.equal(m.events.length, 1);
});

test('seed is deterministic in shape and valid', () => {
  const today = new Date(2026, 9, 5);
  const d = L.seed(today);
  assert.equal(d.version, L.SCHEMA_VERSION);
  assert.equal(d.teams.length, 3);
  const teamIds = new Set(d.teams.map((t) => t.id));
  for (const e of d.events) {
    assert.ok(L.TYPES[e.type], `bad type ${e.type}`);
    assert.ok(teamIds.has(e.teamId));
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    if (e.date >= L.toKey(today)) assert.ok(!L.hasScore(e), 'future games must not have scores');
  }
  const pending = d.events.filter((e) => e.type === 'game' && !L.hasScore(e) && e.date < L.toKey(today));
  assert.equal(pending.length, 1, 'demo should leave exactly one past game unscored');
  assert.equal(L.seed(today).events.length, d.events.length);
});
