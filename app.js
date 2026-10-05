(() => {
  'use strict';

  const {
    STORE_KEY, TYPES, DEFAULT_TITLES, TEAM_COLORS, MONTHS, DOW,
    esc, uid, pad, toKey, parseKey, addDays, safeColor, fmtTime, shortTime,
    eventStart, sortEvents, hasScore, resultOf,
    buildEventFields, expandWeekly, teamStats, migrate, seed,
  } = window.GameDayLib;

  const $ = (s, el = document) => el.querySelector(s);
  const todayKey = () => toKey(new Date());
  const TITLE_HINTS = { ...DEFAULT_TITLES, game: 'Auto: "vs Opponent"' };
  const fmtDate = (k, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
    parseKey(k).toLocaleDateString(undefined, opts);

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = migrate(JSON.parse(raw));
        if (d) return d;
      }
    } catch (e) { /* storage unavailable */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }

  let data = load();
  const now = new Date();
  const ui = {
    view: ['schedule', 'edit', 'stats'].includes(data.prefs.view) ? data.prefs.view : 'schedule',
    team: data.teams.some((t) => t.id === data.prefs.team) ? data.prefs.team : 'all',
    cursor: new Date(now.getFullYear(), now.getMonth(), 1),
    selected: todayKey(),
    editingId: null,
    prefillDate: null,
    listMode: 'upcoming',
    query: '',
  };

  const teamOf = (id) => data.teams.find((t) => t.id === id) || { name: 'Unknown team', color: '#64748b', sport: '' };
  const visibleEvents = () => data.events.filter((e) => ui.team === 'all' || e.teamId === ui.team);
  const setPrefs = () => { data.prefs = { view: ui.view, team: ui.team }; save(); };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Render: shell ----------
  function render() {
    document.querySelectorAll('.tab').forEach((b) => {
      if (b.dataset.view === ui.view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#teamFilter').innerHTML =
      `<button class="chip" data-action="team" data-team="all" aria-pressed="${ui.team === 'all'}">All teams</button>` +
      data.teams.map((t) => `<button class="chip" data-action="team" data-team="${t.id}" aria-pressed="${ui.team === t.id}" style="--c:${safeColor(t.color)}"><i></i>${esc(t.name)}</button>`).join('');

    const app = $('#app');
    if (ui.view === 'schedule') app.innerHTML = renderSchedule();
    else if (ui.view === 'edit') { app.innerHTML = renderEdit(); bindEdit(); }
    else app.innerHTML = renderStats();
  }

  // ---------- Render: schedule ----------
  function nextGame() {
    const t = new Date();
    return visibleEvents().filter((e) => e.type === 'game' && eventStart(e) >= t).sort(sortEvents)[0];
  }

  function nextUpHTML() {
    const g = nextGame();
    if (!g) {
      return `<div class="card nextup" id="nextup"><div><div class="eyebrow">Next game</div><h2>No games scheduled</h2>
        <div class="meta">Add a game to start the countdown.</div></div>
        <button class="btn btn-primary" data-action="new-event">+ Add game</button></div>`;
    }
    const team = teamOf(g.teamId);
    const diff = Math.max(0, eventStart(g) - new Date());
    const dd = Math.floor(diff / 864e5), hh = Math.floor((diff % 864e5) / 36e5), mm = Math.floor((diff % 36e5) / 6e4);
    return `<div class="card nextup" id="nextup" style="--c:${safeColor(team.color)}">
      <div>
        <div class="eyebrow">Next game · <span class="teamtag"><i></i>${esc(team.name)}</span></div>
        <h2>${esc(g.title)}</h2>
        <div class="meta"><b>${fmtDate(g.date, { weekday: 'long', month: 'short', day: 'numeric' })}</b>${g.start ? ` · ${fmtTime(g.start)}` : ''}${g.location ? ` · ${esc(g.location)}` : ''}</div>
      </div>
      <div class="countdown" aria-label="Countdown">
        <div><b>${dd}</b><span>Days</span></div><div><b>${pad(hh)}</b><span>Hrs</span></div><div><b>${pad(mm)}</b><span>Min</span></div>
      </div>
    </div>`;
  }

  function pillHTML(e) {
    const c = safeColor(teamOf(e.teamId).color);
    return `<span class="pill ${e.type}" style="--c:${c}" title="${esc(e.title)}">${e.start ? `<b>${shortTime(e.start)}</b> ` : ''}${esc(e.title)}</span>`;
  }

  function evCardHTML(e) {
    const team = teamOf(e.teamId);
    const c = safeColor(team.color);
    const score = e.type === 'game' && hasScore(e)
      ? `<div class="ev-score"><span class="res ${resultOf(e)}">${resultOf(e)}</span> ${e.scoreUs} – ${e.scoreThem}</div>` : '';
    const meta = [e.type === 'game' ? (e.home ? 'Home' : 'Away') : '', e.location].filter(Boolean).map(esc).join(' · ');
    return `<article class="ev" style="--c:${c}">
      <div class="ev-time">${e.start ? fmtTime(e.start) : 'All day'}${e.end ? `<small>to ${fmtTime(e.end)}</small>` : ''}</div>
      <div>
        <div class="ev-top"><span class="badge ${e.type}">${TYPES[e.type].short}</span><span class="teamtag"><i></i>${esc(team.name)}</span></div>
        <h4>${esc(e.title)}</h4>
        ${meta ? `<p class="ev-meta">${meta}</p>` : ''}
        ${e.notes ? `<p class="ev-meta">${esc(e.notes)}</p>` : ''}
        ${score}
      </div>
      <button class="btn btn-sm" data-action="edit-event" data-id="${e.id}">Edit</button>
    </article>`;
  }

  function renderSchedule() {
    const evs = visibleEvents();
    const byDate = {};
    evs.forEach((e) => (byDate[e.date] ||= []).push(e));

    // This week (Sun–Sat)
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const ws = toKey(addDays(t0, -t0.getDay())), we = toKey(addDays(t0, 6 - t0.getDay()));
    const wk = { game: 0, practice: 0, meeting: 0 };
    evs.forEach((e) => { if (e.date >= ws && e.date <= we) wk[e.type]++; });

    // Month grid
    const y = ui.cursor.getFullYear(), m = ui.cursor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
    const start = addDays(first, -first.getDay());
    const tk = todayKey();
    let cells = '';
    for (let i = 0; i < rows * 7; i++) {
      const d = addDays(start, i);
      const k = toKey(d);
      const list = (byDate[k] || []).sort(sortEvents);
      const cls = ['day', d.getMonth() !== m && 'out', k === tk && 'today', k === ui.selected && 'selected'].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-action="select-day" data-date="${k}" aria-label="${fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' })}, ${list.length} events">
        <span class="num">${d.getDate()}</span>
        <span class="pills">${list.slice(0, 3).map(pillHTML).join('')}${list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : ''}</span>
      </button>`;
    }

    const dayList = (byDate[ui.selected] || []).sort(sortEvents);
    return `<section>
      <div class="hero-row">
        ${nextUpHTML()}
        <div class="card week">
          <div class="eyebrow">This week · ${fmtDate(ws, { month: 'short', day: 'numeric' })} – ${fmtDate(we, { month: 'short', day: 'numeric' })}</div>
          <div class="week-tiles">
            <div><b>${wk.game}</b><span>Games</span></div>
            <div><b>${wk.practice}</b><span>Practices</span></div>
            <div><b>${wk.meeting}</b><span>Meetings</span></div>
          </div>
        </div>
      </div>
      <div class="sched-grid">
        <div class="card cal">
          <div class="cal-head">
            <h2 class="section-title">${MONTHS[m]} ${y}</h2>
            <button class="btn btn-sm" data-action="today">Today</button>
            <button class="btn btn-icon" data-action="month" data-dir="-1" aria-label="Previous month">‹</button>
            <button class="btn btn-icon" data-action="month" data-dir="1" aria-label="Next month">›</button>
          </div>
          <div class="legend">
            <span><span class="badge game">GAME</span></span>
            <span><span class="badge practice">PRAC</span></span>
            <span><span class="badge meeting">MTG</span></span>
            <span>Colors = teams</span>
          </div>
          <div class="cal-dow">${DOW.map((d) => `<div>${d}</div>`).join('')}</div>
          <div class="cal-days">${cells}</div>
        </div>
        <aside class="card daypanel">
          <div class="daypanel-head">
            <div>
              <div class="eyebrow">${ui.selected === tk ? 'Today' : fmtDate(ui.selected, { weekday: 'long' })}</div>
              <h3 class="section-title">${fmtDate(ui.selected, { month: 'long', day: 'numeric' })}</h3>
            </div>
            <button class="btn btn-primary btn-sm" data-action="new-event" data-date="${ui.selected}">+ Add</button>
          </div>
          <div class="ev-list">${dayList.length ? dayList.map(evCardHTML).join('') : '<div class="empty">Nothing scheduled. Rest day!</div>'}</div>
        </aside>
      </div>
    </section>`;
  }

  // ---------- Render: add & edit ----------
  function renderEdit() {
    const editing = ui.editingId ? data.events.find((e) => e.id === ui.editingId) : null;
    if (ui.editingId && !editing) ui.editingId = null;
    const e = editing || {
      type: 'practice',
      teamId: ui.team !== 'all' ? ui.team : (data.teams[0] && data.teams[0].id) || '',
      title: '', date: ui.prefillDate || ui.selected || todayKey(),
      start: '15:30', end: '17:00', location: '', opponent: '', home: true, notes: '', scoreUs: null, scoreThem: null,
    };

    const form = !data.teams.length
      ? `<div class="card form"><h2 class="section-title">Add an event</h2><div class="empty">Create a team below first, then you can schedule events for it.</div></div>`
      : `<form class="card form ${e.type === 'game' ? 'is-game' : ''}" id="eventForm" autocomplete="off">
        <div class="form-head">
          <div><div class="eyebrow">${editing ? 'Editing' : 'Create'}</div><h2 class="section-title">${editing ? 'Edit event' : 'New event'}</h2></div>
          ${editing ? '<button type="button" class="btn btn-sm" data-action="cancel-edit">+ New instead</button>' : ''}
        </div>
        <div class="field">
          <span class="label">Type</span>
          <div class="seg" role="radiogroup">
            ${Object.entries(TYPES).map(([k, v]) => `<input type="radio" name="type" id="type-${k}" value="${k}" ${e.type === k ? 'checked' : ''}><label for="type-${k}">${v.label}</label>`).join('')}
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="f-team">Team</label>
            <select id="f-team" name="teamId">${data.teams.map((t) => `<option value="${t.id}" ${t.id === e.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="f-title">Title</label>
            <input id="f-title" name="title" value="${esc(e.title)}" placeholder="${esc(TITLE_HINTS[e.type])}" maxlength="60">
          </div>
        </div>
        <div class="row game-only">
          <div class="field">
            <label for="f-opp">Opponent</label>
            <input id="f-opp" name="opponent" value="${esc(e.opponent)}" placeholder="e.g. Wildcats" maxlength="40">
          </div>
          <div class="field">
            <span class="label">Venue</span>
            <div class="seg small">
              <input type="radio" name="home" id="h-home" value="home" ${e.home ? 'checked' : ''}><label for="h-home">Home</label>
              <input type="radio" name="home" id="h-away" value="away" ${!e.home ? 'checked' : ''}><label for="h-away">Away</label>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="field"><label for="f-date">Date</label><input id="f-date" type="date" name="date" value="${e.date}" required></div>
          <div class="field"><label for="f-start">Start</label><input id="f-start" type="time" name="start" value="${e.start || ''}"></div>
          <div class="field"><label for="f-end">End</label><input id="f-end" type="time" name="end" value="${e.end || ''}"></div>
        </div>
        <div class="field">
          <label for="f-loc">Location</label>
          <input id="f-loc" name="location" value="${esc(e.location)}" placeholder="e.g. North Field" maxlength="60">
        </div>
        <div class="field game-only">
          <span class="label">Final score <span class="hint">(optional, fill in after the game)</span></span>
          <div class="score-inputs">
            <input type="number" min="0" max="999" name="scoreUs" value="${e.scoreUs ?? ''}" placeholder="Us" aria-label="Our score">
            <span>–</span>
            <input type="number" min="0" max="999" name="scoreThem" value="${e.scoreThem ?? ''}" placeholder="Them" aria-label="Opponent score">
          </div>
        </div>
        ${editing ? '' : `<div class="field">
          <label for="f-repeat">Repeat weekly</label>
          <select id="f-repeat" name="repeat">
            ${[1, 2, 4, 6, 8, 10, 12].map((n) => `<option value="${n}">${n === 1 ? 'Does not repeat' : `For ${n} weeks`}</option>`).join('')}
          </select>
        </div>`}
        <div class="field">
          <label for="f-notes">Notes</label>
          <textarea id="f-notes" name="notes" maxlength="300" placeholder="Bring water, wear away jerseys…">${esc(e.notes)}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Add to calendar'}</button>
          ${editing ? '<button type="button" class="btn" data-action="cancel-edit">Cancel</button><span class="spacer"></span><button type="button" class="btn btn-danger" data-action="delete-event" data-id="' + editing.id + '">Delete</button>' : ''}
        </div>
      </form>`;

    return `<section>
      <div class="edit-grid">
        ${form}
        <div class="card list">
          <div class="eyebrow">${ui.team === 'all' ? 'All teams' : esc(teamOf(ui.team).name)}</div>
          <h2 class="section-title">Events</h2>
          <div class="list-tools">
            <input type="search" id="listSearch" placeholder="Search title, opponent, place…" value="${esc(ui.query)}" aria-label="Search events">
            <div class="seg small">
              <input type="radio" name="listMode" id="lm-up" value="upcoming" ${ui.listMode === 'upcoming' ? 'checked' : ''}><label for="lm-up">Upcoming</label>
              <input type="radio" name="listMode" id="lm-past" value="past" ${ui.listMode === 'past' ? 'checked' : ''}><label for="lm-past">Past</label>
            </div>
          </div>
          <div class="rows" id="eventRows">${eventRowsHTML()}</div>
        </div>
      </div>
      ${teamsHTML()}
    </section>`;
  }

  function eventRowsHTML() {
    const tk = todayKey();
    const q = ui.query.trim().toLowerCase();
    let list = visibleEvents().filter((e) => (ui.listMode === 'upcoming' ? e.date >= tk : e.date < tk));
    if (q) list = list.filter((e) => [e.title, e.opponent, e.location, e.notes, teamOf(e.teamId).name].join(' ').toLowerCase().includes(q));
    list.sort(sortEvents);
    if (ui.listMode === 'past') list.reverse();
    if (!list.length) return `<div class="empty">${q ? 'No events match your search.' : 'No events here yet.'}</div>`;
    return list.map((e) => {
      const team = teamOf(e.teamId);
      const d = parseKey(e.date);
      const result = e.type === 'game' && hasScore(e) ? ` <span class="res ${resultOf(e)}">${resultOf(e)} ${e.scoreUs}–${e.scoreThem}</span>` : '';
      return `<div class="erow ${e.id === ui.editingId ? 'active' : ''}" style="--c:${safeColor(team.color)}">
        <div class="datebox"><small>${MONTHS[d.getMonth()].slice(0, 3).toUpperCase()}</small><b>${d.getDate()}</b></div>
        <div>
          <h4><span class="badge ${e.type}">${TYPES[e.type].short}</span>${esc(e.title)}${result}</h4>
          <p>${DOW[d.getDay()]}${e.start ? ` · ${fmtTime(e.start)}` : ''}${e.location ? ` · ${esc(e.location)}` : ''} · ${esc(team.name)}</p>
        </div>
        <button class="btn btn-sm" data-action="edit-event" data-id="${e.id}">Edit</button>
      </div>`;
    }).join('');
  }

  function teamsHTML() {
    const counts = {};
    data.events.forEach((e) => { counts[e.teamId] = (counts[e.teamId] || 0) + 1; });
    const used = new Set(data.teams.map((t) => t.color));
    const defColor = TEAM_COLORS.find((c) => !used.has(c)) || TEAM_COLORS[0];
    return `<div class="card teams">
      <div class="eyebrow">Manage</div>
      <h2 class="section-title">Teams</h2>
      <div class="team-list">
        ${data.teams.map((t) => `<div class="team-item" style="--c:${safeColor(t.color)}">
          <span class="sw"></span>
          <div><b>${esc(t.name)}</b><span>${esc(t.sport || 'Team')} · ${counts[t.id] || 0} events</span></div>
          <button class="btn btn-sm btn-danger" data-action="delete-team" data-id="${t.id}" aria-label="Delete ${esc(t.name)}">Remove</button>
        </div>`).join('') || '<div class="empty">No teams yet.</div>'}
      </div>
      <form class="team-form" id="teamForm" autocomplete="off">
        <div class="field"><label for="t-name">Team name</label><input id="t-name" name="name" placeholder="e.g. Varsity Baseball" maxlength="40" required></div>
        <div class="field"><label for="t-sport">Sport</label><input id="t-sport" name="sport" placeholder="e.g. Baseball" maxlength="30"></div>
        <div class="field"><span class="label">Color</span>
          <div class="swatches">${TEAM_COLORS.map((c, i) => `<input type="radio" name="color" id="sw-${i}" value="${c}" ${c === defColor ? 'checked' : ''}><label for="sw-${i}" style="--c:${c}" title="${c}"></label>`).join('')}</div>
        </div>
        <button class="btn btn-primary" type="submit">+ Add team</button>
      </form>
      <div class="teams-foot">
        <span class="hint">Everything is saved in this browser only.</span>
        <button class="btn btn-sm" data-action="reset">Reset to demo data</button>
      </div>
    </div>`;
  }

  function bindEdit() {
    const form = $('#eventForm');
    if (form) {
      form.addEventListener('change', (ev) => {
        if (ev.target.name === 'type') {
          form.classList.toggle('is-game', ev.target.value === 'game');
          $('#f-title').placeholder = TITLE_HINTS[ev.target.value];
        }
      });
      form.addEventListener('submit', onSaveEvent);
    }
    $('#teamForm').addEventListener('submit', onAddTeam);
    $('#listSearch').addEventListener('input', (ev) => { ui.query = ev.target.value; $('#eventRows').innerHTML = eventRowsHTML(); });
    document.querySelectorAll('input[name="listMode"]').forEach((r) =>
      r.addEventListener('change', (ev) => { ui.listMode = ev.target.value; $('#eventRows').innerHTML = eventRowsHTML(); }));
  }

  function onSaveEvent(ev) {
    ev.preventDefault();
    const input = Object.fromEntries(new FormData(ev.target));
    const { fields, error } = buildEventFields(input);
    if (error) return toast(error);
    const date = fields.date;

    const existing = ui.editingId && data.events.find((e) => e.id === ui.editingId);
    if (existing) {
      Object.assign(existing, fields);
      toast('Event updated');
    } else {
      const added = expandWeekly(fields, input.repeat);
      data.events.push(...added);
      toast(added.length > 1 ? `Added ${added.length} events` : 'Added to calendar');
    }
    save();
    ui.editingId = null;
    ui.prefillDate = null;
    ui.selected = date;
    const d = parseKey(date);
    ui.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    ui.listMode = date >= todayKey() ? 'upcoming' : 'past';
    render();
  }

  function onAddTeam(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) return toast('Give the team a name');
    data.teams.push({ id: uid(), name, sport: String(fd.get('sport') || '').trim(), color: safeColor(String(fd.get('color'))) });
    save();
    toast(`${name} added`);
    render();
  }

  // ---------- Render: stats ----------
  function renderStats() {
    const teams = ui.team === 'all' ? data.teams : data.teams.filter((t) => t.id === ui.team);
    const boards = teams.map((team) => {
      const s = teamStats(data.events, team.id);
      const n = s.games.length;
      const last5 = s.games.slice(-5);
      const boxes = last5.map((g) => `<span class="res ${resultOf(g)}" title="${esc(g.title)} ${g.scoreUs}–${g.scoreThem}">${resultOf(g)}</span>`).join('') +
        '<span class="none"></span>'.repeat(5 - last5.length);
      const rows = s.games.slice().reverse().map((g) => `<tr>
          <td>${fmtDate(g.date, { month: 'short', day: 'numeric' })}</td>
          <td>${esc(g.opponent || g.title)}</td>
          <td>${g.home ? 'H' : 'A'}</td>
          <td class="score">${g.scoreUs} – ${g.scoreThem}</td>
          <td><span class="res ${resultOf(g)}">${resultOf(g)}</span></td>
        </tr>`).join('');
      return `<article class="card board" style="--c:${safeColor(team.color)}">
        <div class="board-top">
          <div class="eyebrow">${esc(team.sport || 'Team')} · Season record</div>
          <h3>${esc(team.name)}</h3>
          <div class="record">
            <div class="w"><b>${s.w}</b><span>Wins</span></div>
            <div class="l"><b>${s.l}</b><span>Losses</span></div>
            <div><b>${s.t}</b><span>Ties</span></div>
          </div>
        </div>
        <div class="board-body">
          <div class="tiles">
            <div><b>${s.pct == null ? '–' : s.pct.toFixed(3).replace(/^0/, '')}</b><span>Win %</span></div>
            <div><b>${n ? (s.pf / n).toFixed(1) : '–'}</b><span>Avg scored</span></div>
            <div><b>${n ? (s.pa / n).toFixed(1) : '–'}</b><span>Avg allowed</span></div>
            <div><b>${s.streak}</b><span>Streak</span></div>
          </div>
          <div class="form-row"><span class="eyebrow">Last 5</span><div class="form-boxes">${boxes}</div></div>
          ${n ? `<div class="results-wrap"><table class="results">
            <thead><tr><th>Date</th><th>Opponent</th><th>H/A</th><th>Score</th><th></th></tr></thead>
            <tbody>${rows}</tbody></table></div>` : '<div class="empty">No results yet. Scores you enter show up here.</div>'}
        </div>
      </article>`;
    }).join('');

    const t = new Date();
    const pending = visibleEvents().filter((e) => e.type === 'game' && !hasScore(e) && eventStart(e) < t).sort(sortEvents).reverse();
    const pendingHTML = pending.map((g) => {
      const team = teamOf(g.teamId);
      const d = parseKey(g.date);
      return `<div class="pending-row" style="--c:${safeColor(team.color)}">
        <div class="datebox"><small>${MONTHS[d.getMonth()].slice(0, 3).toUpperCase()}</small><b>${d.getDate()}</b></div>
        <div><h4>${esc(g.title)}</h4><p><span class="teamtag"><i></i>${esc(team.name)}</span></p></div>
        <div class="quick-score">
          <input type="number" min="0" max="999" id="su-${g.id}" placeholder="Us" aria-label="Our score">
          <span>–</span>
          <input type="number" min="0" max="999" id="st-${g.id}" placeholder="Them" aria-label="Opponent score">
          <button class="btn btn-primary btn-sm" data-action="save-score" data-id="${g.id}">Save</button>
        </div>
      </div>`;
    }).join('');

    return `<section>
      <div class="stats-head">
        <div><div class="eyebrow">Results</div><h2 class="section-title">Season stats</h2>
        <p>Records update automatically from the game scores you enter.</p></div>
      </div>
      ${pending.length ? `<div class="card pending" style="margin:0 0 16px">
        <div class="eyebrow">Needs a score</div><h2 class="section-title">${pending.length} game${pending.length > 1 ? 's' : ''} awaiting results</h2>
        ${pendingHTML}</div>` : ''}
      <div class="board-grid">${boards || '<div class="card empty">Add a team to see stats.</div>'}</div>
    </section>`;
  }

  // ---------- Events ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;

    if (a === 'view') {
      ui.view = el.dataset.view;
      if (ui.view !== 'edit') { ui.editingId = null; ui.prefillDate = null; }
      setPrefs(); render(); window.scrollTo(0, 0);
    } else if (a === 'team') {
      ui.team = el.dataset.team; setPrefs(); render();
    } else if (a === 'month') {
      ui.cursor = new Date(ui.cursor.getFullYear(), ui.cursor.getMonth() + Number(el.dataset.dir), 1); render();
    } else if (a === 'today') {
      const n = new Date(); ui.cursor = new Date(n.getFullYear(), n.getMonth(), 1); ui.selected = todayKey(); render();
    } else if (a === 'select-day') {
      ui.selected = el.dataset.date;
      const d = parseKey(ui.selected);
      if (d.getMonth() !== ui.cursor.getMonth()) ui.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
      if (window.innerWidth <= 1000) $('.daypanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (a === 'new-event') {
      ui.view = 'edit'; ui.editingId = null; ui.prefillDate = el.dataset.date || null;
      setPrefs(); render(); window.scrollTo(0, 0);
    } else if (a === 'edit-event') {
      ui.view = 'edit'; ui.editingId = el.dataset.id;
      const e = data.events.find((x) => x.id === el.dataset.id);
      if (e) ui.listMode = e.date >= todayKey() ? 'upcoming' : 'past';
      setPrefs(); render(); window.scrollTo(0, 0);
    } else if (a === 'cancel-edit') {
      ui.editingId = null; render();
    } else if (a === 'delete-event') {
      const e = data.events.find((x) => x.id === el.dataset.id);
      if (e && confirm(`Delete "${e.title}" on ${fmtDate(e.date)}?`)) {
        data.events = data.events.filter((x) => x.id !== e.id);
        ui.editingId = null; save(); toast('Event deleted'); render();
      }
    } else if (a === 'delete-team') {
      const t = data.teams.find((x) => x.id === el.dataset.id);
      if (t && confirm(`Remove ${t.name} and all of its events?`)) {
        data.teams = data.teams.filter((x) => x.id !== t.id);
        data.events = data.events.filter((x) => x.teamId !== t.id);
        if (ui.team === t.id) ui.team = 'all';
        ui.editingId = null; setPrefs(); toast(`${t.name} removed`); render();
      }
    } else if (a === 'save-score') {
      const id = el.dataset.id;
      const su = $(`#su-${id}`).value, st = $(`#st-${id}`).value;
      if (su === '' || st === '') return toast('Enter both scores');
      const g = data.events.find((x) => x.id === id);
      if (g) { g.scoreUs = Number(su); g.scoreThem = Number(st); save(); toast(`Final: ${resultOf(g)} ${g.scoreUs}–${g.scoreThem}`); render(); }
    } else if (a === 'reset') {
      if (confirm('Replace all teams and events with the demo data?')) {
        data = seed(); ui.team = 'all'; ui.editingId = null; setPrefs(); toast('Demo data restored'); render();
      }
    }
  });

  // Keep the countdown fresh
  setInterval(() => {
    const el = $('#nextup');
    if (ui.view === 'schedule' && el) el.outerHTML = nextUpHTML();
  }, 30000);

  render();
})();
