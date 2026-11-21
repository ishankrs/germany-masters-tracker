/* Germany Master's Tracker. Static, no build step, no server.
   Programme data comes from data/*.js. The two profiles are stored by the small API in functions/api (Cloudflare Pages Functions + KV), so they follow you to any device. */
(function () {
  'use strict';
  var DATA_DATE = '21 November 2026';
  var KEY = 'germany-masters-tracker.v1';
  var FORMAT = 'germany-masters-tracker-profile';
  var P = (window.TRACKER_DATA && window.TRACKER_DATA.programmes) || [];
  var U = (window.TRACKER_DATA && window.TRACKER_DATA.universities) || [];
  var BYKEY = {}; P.forEach(function (p) { BYKEY[p.k] = p; });
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || '') ? u : ''; };
  var LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var TESTS = ['GRE', 'GATE', 'GMAT', 'TestAS'];
  var STATUS = [['', 'Not on my list'], ['saved', 'Saved'], ['applying', 'Applying'], ['submitted', 'Submitted'], ['admitted', 'Admitted'], ['rejected', 'Rejected']];
  var STATUS_PILL = { saved: 'idle', applying: 'warn', submitted: 'fair', admitted: 'good', rejected: 'bad' };

  /* ---------- storage: two fixed profiles, kept on the server so they are the same on every device ---------- */
  var IDS = [['ishan', 'Ishan'], ['riya', 'Riya']];
  var store = { active: 'ishan', profiles: {} };
  var pass = '', sync = 'loading', timer = null; // sync: loading | ok | locked | off
  try { var pr = JSON.parse(localStorage.getItem(KEY) || '{}'); if (pr.active) store.active = pr.active; pass = pr.pass || ''; } catch (e) { }
  function prefs() { try { localStorage.setItem(KEY, JSON.stringify({ active: store.active, pass: pass })); } catch (e) { } }
  function nameOf(id) { var x = IDS.filter(function (i) { return i[0] === id; })[0]; return x ? x[1] : id; }
  function blank(id) { return { id: id, name: nameOf(id), facts: { grade: '', tests: [], german: 'none', work: '0', english: '', notes: '' }, progs: {}, tasks: [] }; }
  function me() { return store.profiles[store.active] || null; }
  function clean(p) {
    p.facts = p.facts || {}; p.facts.tests = Array.isArray(p.facts.tests) ? p.facts.tests : [];
    p.facts.german = LEVELS.indexOf(p.facts.german) < 0 ? 'none' : p.facts.german;
    ['grade', 'work', 'english', 'notes'].forEach(function (k) { p.facts[k] = p.facts[k] == null ? '' : String(p.facts[k]); });
    p.progs = p.progs && typeof p.progs === 'object' ? p.progs : {};
    p.tasks = Array.isArray(p.tasks) ? p.tasks : [];
    return p;
  }
  function api(id, opt) {
    opt = opt || {}; opt.headers = { 'x-passcode': pass, 'content-type': 'application/json' }; opt.cache = 'no-store';
    return fetch('api/profile/' + id, opt);
  }
  function loadProfile(id) {
    sync = 'loading'; render();
    return api(id).then(function (r) {
      if (r.status === 401) { sync = 'locked'; return; }
      if (!r.headers.get('x-tracker')) throw new Error('no api');
      if (r.status === 404) { store.profiles[id] = blank(id); sync = 'ok'; return; }
      if (!r.ok) throw new Error('api ' + r.status);
      return r.json().then(function (d) { d.id = id; d.name = nameOf(id); store.profiles[id] = clean(d); sync = 'ok'; });
    }).catch(function () { if (!store.profiles[id]) store.profiles[id] = blank(id); sync = 'off'; }).then(render);
  }
  function status(t) { var el = $('#syncmsg'); if (el) el.textContent = t; }
  function save() {
    if (sync !== 'ok') return;
    var id = store.active; status('Saving…'); clearTimeout(timer);
    timer = setTimeout(function () {
      api(id, { method: 'PUT', body: JSON.stringify(store.profiles[id]) }).then(function (r) { status(r.ok ? 'Saved. Same on every device.' : 'Not saved (error ' + r.status + '). Export a copy to be safe.'); })
        .catch(function () { status('Not saved: no connection. Export a copy to be safe.'); });
    }, 500);
  }
  var SYNC_TEXT = { loading: 'Loading…', ok: 'Saved online. Same on every device.', locked: 'Enter the passcode to load profiles.', off: 'Sync is not set up here, so changes are not saved. See the README.' };

  /* ---------- rough automatic check ---------- */
  function assess(p, facts) {
    var f = p.f || {}, blocks = [], notes = [];
    if (f.test) {
      var need = f.test.split(' or ');
      if (!need.some(function (t) { return facts.tests.indexOf(t) >= 0; })) blocks.push('Asks for ' + f.test);
    }
    if (f.german && LEVELS.indexOf(facts.german) < LEVELS.indexOf(f.german)) blocks.push('Asks for German ' + f.german);
    if (f.work && !(parseFloat(facts.work) >= 1)) blocks.push('Asks for work experience');
    var g = parseFloat(String(facts.grade).replace(',', '.'));
    if (f.grade) {
      if (g && g > f.grade + 1e-9) blocks.push('Grade limit about ' + f.grade.toFixed(1) + ', yours ' + g.toFixed(1));
      else if (!g) notes.push('Grade limit about ' + f.grade.toFixed(1));
    }
    if (f.exam) notes.push('Has an entrance test or interview');
    return { blocks: blocks, notes: notes };
  }
  function ownPill(v) {
    var c = /^eligible/i.test(v) ? 'good' : /^likely/i.test(v) ? 'fair' : /^border/i.test(v) ? 'warn' : /^not/i.test(v) ? 'bad' : 'idle';
    return '<span class="pill p-' + c + '">' + esc(v) + '</span>';
  }
  function checkCell(p, prof) {
    var mine = prof.progs[p.k] || {}, a = assess(p, prof.facts), h = '';
    if (mine.verdict) h += ownPill(mine.verdict) + '<div class="flags"><span>Own check' + (mine.chance ? ', chance ' + esc(mine.chance.toLowerCase()) : '') + '</span></div>';
    else if (a.blocks.length) h += '<span class="pill p-bad">Possible blocker</span>';
    else h += '<span class="pill p-good">No blocker spotted</span>';
    if (!mine.verdict && (a.blocks.length || a.notes.length)) h += '<div class="flags">' + a.blocks.concat(a.notes).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    return h;
  }
  function clear(p, prof) { // true when nothing blocks, by own verdict if there is one, else by the rough check
    var mine = prof.progs[p.k] || {};
    if (mine.verdict) return !/^not/i.test(mine.verdict) && !/could not/i.test(mine.verdict);
    return assess(p, prof.facts).blocks.length === 0;
  }

  /* ---------- helpers ---------- */
  var SC = { open: ['good', 'Summer open'], closed: ['bad', 'Summer closed'], none: ['idle', 'Winter only'], check: ['warn', 'Check dates'] };
  function scPill(p) { var x = SC[p.sc] || SC.check; return '<span class="pill p-' + x[0] + '">' + x[1] + '</span>'; }
  function daysLeft(iso) { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null; var d = new Date(iso + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); }
  function daysHtml(iso) {
    var n = daysLeft(iso); if (n === null) return '';
    var c = n < 0 ? 'past' : n <= 10 ? 'soon' : n <= 35 ? 'near' : 'far';
    var d = new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return '<span class="days ' + c + '">' + d + (n < 0 ? '' : n === 0 ? ' · today' : ' · ' + n + ' d') + '</span>';
  }
  function statusSelect(p, prof) {
    var cur = (prof.progs[p.k] || {}).status || '';
    return '<select data-status="' + esc(p.k) + '" aria-label="My status for ' + esc(p.p) + '">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === cur ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>';
  }
  function setProg(k, field, val) {
    var prof = me(); if (!prof) return;
    var o = prof.progs[k] || (prof.progs[k] = {});
    if (val) o[field] = val; else delete o[field];
    if (!Object.keys(o).length) delete prof.progs[k];
    save();
  }
  var CAVEAT = '<p class="note"><b>Check the university page before you rely on anything here.</b> The programme data was collected on ' + DATA_DATE + '. Many deadlines are the usual yearly dates, not confirmed dates for this cycle. The quick check only matches keywords in the requirement text against your profile, so it can miss a rule or flag one that does not apply to you.</p>';

  /* ---------- views ---------- */
  var S = { q: '', chk: 'all', start: 'any', sum: 'any', st: 'any', open: {}, uq: '', ucs: 'yes', tq: 'open' };
  var V = {};

  V.overview = function (prof) {
    var okc = 0, openok = 0, listed = 0, sub = 0;
    P.forEach(function (p) {
      var c = clear(p, prof); if (c) okc++; if (c && p.sc === 'open') openok++;
      var s = (prof.progs[p.k] || {}).status; if (s) listed++; if (s === 'submitted' || s === 'admitted') sub++;
    });
    var openTasks = prof.tasks.filter(function (t) { return !t.done; });
    var dated = openTasks.filter(function (t) { return daysLeft(t.date) !== null && daysLeft(t.date) >= 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 8);
    var h = '<h1>Hello, ' + esc(prof.name) + '</h1><p class="lede">English-taught computer science and data science master\'s programmes at public universities in Germany, checked against your profile.</p>';
    h += '<div class="tiles">' +
      tile('Programmes in the list', P.length, U.length + ' public institutions') +
      tile('No blocker for you', okc, 'by your own check or the quick check') +
      tile('Of those, summer 2027 open', openok, 'as of ' + DATA_DATE) +
      tile('On your list', listed, sub + ' submitted or admitted') +
      tile('Open tasks', openTasks.length, '') + '</div>';
    if (!prof.facts.grade) h += '<h2>Start here</h2><p class="note">Add your German-scale grade, tests and German level under <a href="#profile">Profile and data</a>. The quick check uses them to flag likely blockers on each programme.</p>';
    h += '<h2>Next dates</h2>';
    h += dated.length ? '<div class="card">' + dated.map(taskRow).join('') + '</div>' : '<div class="card"><div class="empty">No dated tasks yet. Add them under <a href="#tasks">Tasks</a>.</div></div>';
    h += '<h2>Your list</h2>' + listTable(prof, 6);
    return h + '<h2>About the data</h2>' + CAVEAT;
  };
  function tile(k, v, s) { return '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }

  function progRows(prof) {
    var q = S.q.trim().toLowerCase();
    return P.filter(function (p) {
      if (q && (p.u + ' ' + p.p + ' ' + p.req + ' ' + p.langreq).toLowerCase().indexOf(q) < 0) return false;
      if (S.chk !== 'all' && clear(p, prof) !== (S.chk === 'ok')) return false;
      if (S.start === 'summer' && p.sc === 'none') return false;
      if (S.start === 'winter' && p.sc !== 'none') return false;
      if (S.sum !== 'any' && p.sc !== S.sum) return false;
      var st = (prof.progs[p.k] || {}).status || '';
      if (S.st === 'mine' && !st) return false;
      if (S.st === 'none' && st) return false;
      return true;
    });
  }
  function chips(name, cur, opts) {
    return '<div class="chips">' + opts.map(function (o) { return '<button class="chip" data-set="' + name + '" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function progTable(rows, prof) {
    if (!rows.length) return '<div class="card"><div class="empty">Nothing matches these filters.</div></div>';
    var h = '<div class="card scroll"><table><thead><tr><th>Programme</th><th>Summer 2027</th><th>Check</th><th>My status</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var op = !!S.open[p.k];
      h += '<tr class="row' + (op ? ' open' : '') + '" data-open="' + esc(p.k) + '"><td><b>' + esc(p.p) + '</b><div class="sub">' + esc(p.u) + '</div></td><td>' + scPill(p) + '<div class="sub">' + esc(p.start) + '</div></td><td>' + checkCell(p, prof) + '</td><td>' + statusSelect(p, prof) + '</td></tr>';
      if (op) h += '<tr class="detail"><td colspan="4">' + detail(p, prof) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function dd(t, v, wide) { return v ? '<div' + (wide ? ' class="wide"' : '') + '><h4>' + t + '</h4><p>' + esc(v) + '</p></div>' : ''; }
  function detail(p, prof) {
    var mine = prof.progs[p.k] || {}, h = '<div class="dgrid">';
    if (mine.verdict || mine.need || mine.check) {
      h += '<div class="wide own"><h4>Own check (private to this profile)</h4><p>' + esc([mine.verdict && ('Verdict: ' + mine.verdict + (mine.chance ? ', chance ' + mine.chance.toLowerCase() : '')), mine.need, mine.check, mine.dmat].filter(Boolean).join('\n\n')) + '</p></div>';
    }
    h += dd('Summer 2027', p.sum) + dd('Winter 2027/28', p.win) + dd('Are these dates confirmed for this cycle?', p.explicit) + dd('How to apply', p.route) + dd('Application fee', p.fee) + dd('Tuition and semester costs (non-EU)', p.tuition) +
      dd('Teaching language', p.lang) + dd('Minimum grade', p.grade) + dd('Tests', p.tests) + dd('Language requirements', p.langreq) + dd('Subject and credit requirements', p.req, true) + dd('Selection', p.sel, true) + dd('Confidence in this entry', p.conf);
    h += '<div class="wide"><h4>My notes</h4><textarea class="pnote" data-note="' + esc(p.k) + '" placeholder="Anything you want to remember about this programme">' + esc(mine.note || '') + '</textarea></div>';
    var src = (p.src || []).map(safeUrl).filter(Boolean);
    if (src.length) h += '<div class="wide"><h4>Sources</h4><div class="srcs">' + src.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>'; }).join('') + '</div></div>';
    return h + '</div>';
  }
  V.programmes = function (prof) {
    var rows = progRows(prof);
    return '<h1>Programmes</h1><p class="lede">Select a row to read the requirements, dates and sources. Set a status to put a programme on your list.</p>' + CAVEAT +
      '<div class="bar"><input type="search" id="q" placeholder="Search university, programme or requirement" value="' + esc(S.q) + '" aria-label="Search programmes"></div>' +
      '<div class="bar">' + chips('chk', S.chk, [['all', 'All'], ['ok', 'No blocker for me'], ['no', 'Has a blocker']]) + '</div>' +
      '<div class="bar">' + chips('start', S.start, [['any', 'Any start'], ['summer', 'Summer start possible'], ['winter', 'Winter only']]) + chips('sum', S.sum, [['any', 'Any status'], ['open', 'Summer open'], ['closed', 'Summer closed']]) + chips('st', S.st, [['any', 'Everything'], ['mine', 'On my list'], ['none', 'Not on my list']]) + '</div>' +
      '<p class="count" id="pcount">' + rows.length + ' of ' + P.length + ' programmes</p><div id="ptable">' + progTable(rows, prof) + '</div>';
  };

  function listTable(prof, limit) {
    var rows = P.filter(function (p) { return (prof.progs[p.k] || {}).status; });
    var order = ['applying', 'saved', 'submitted', 'admitted', 'rejected'];
    rows.sort(function (a, b) { return order.indexOf(prof.progs[a.k].status) - order.indexOf(prof.progs[b.k].status) || a.u.localeCompare(b.u); });
    var extra = (prof.apps || []).filter(function (a) { return !rows.some(function (p) { return p.u.indexOf(a.u) >= 0 || a.u.indexOf(p.u) >= 0; }); });
    if (!rows.length && !extra.length) return '<div class="card"><div class="empty">Nothing here yet. Open <a href="#programmes">Programmes</a> and set a status on the ones you like.</div></div>';
    var total = rows.length; if (limit) rows = rows.slice(0, limit);
    var h = '<div class="card scroll"><table><thead><tr><th>Programme</th><th>Status</th><th>Summer 2027</th><th>Check</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var st = prof.progs[p.k].status;
      h += '<tr><td><b>' + esc(p.p) + '</b><div class="sub">' + esc(p.u) + '</div>' + (prof.progs[p.k].note ? '<div class="sub">' + esc(prof.progs[p.k].note) + '</div>' : '') + '</td><td>' + (limit ? '<span class="pill p-' + STATUS_PILL[st] + '">' + esc(STATUS.filter(function (s) { return s[0] === st; })[0][1]) + '</span>' : statusSelect(p, prof)) + '</td><td>' + scPill(p) + '<div class="sub">' + esc((p.sum || '').slice(0, 110)) + '</div></td><td>' + checkCell(p, prof) + '</td></tr>';
    });
    if (!limit) extra.forEach(function (a) {
      h += '<tr><td><b>' + esc(a.p) + '</b><div class="sub">' + esc(a.u) + '</div><div class="sub">' + esc(a.note || '') + '</div></td><td><span class="pill p-fair">' + esc(a.st || '') + '</span><div class="sub">' + esc(a.sub || '') + '</div></td><td></td><td>' + (a.v ? ownPill(a.v) : '') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (limit && total > limit) h += '<p class="count" style="margin-top:8px"><a href="#mylist">See all ' + total + '</a></p>';
    return h;
  }
  V.mylist = function (prof) { return '<h1>My list</h1><p class="lede">Programmes you gave a status. Change a status to "Not on my list" to remove it.</p>' + listTable(prof, 0); };

  function taskRow(t) {
    var link = safeUrl(t.link);
    return '<div class="task' + (t.done ? ' done' : '') + '"><input type="checkbox" data-task="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + ' aria-label="Done: ' + esc(t.task) + '"><div><div class="t">' + esc(t.task) + '</div>' +
      (t.why ? '<div class="sub">' + esc(t.why) + '</div>' : '') + '<div class="sub">' + [daysHtml(t.date), esc(t.due || ''), link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open link</a>' : ''].filter(Boolean).join(' · ') + '</div></div>' +
      '<button class="btn small" data-deltask="' + esc(t.id) + '" aria-label="Delete task">Delete</button></div>';
  }
  V.tasks = function (prof) {
    var list = prof.tasks.filter(function (t) { return S.tq === 'all' || (S.tq === 'open' ? !t.done : t.done); });
    var h = '<h1>Tasks</h1><p class="lede">Your own to-do list. Give a task a date and it shows up on the overview.</p>' +
      '<form class="addtask" id="addtask"><input name="task" required placeholder="What needs doing" aria-label="Task"><input name="date" type="date" aria-label="Due date"><button class="btn primary">Add task</button></form>' +
      '<div class="bar">' + chips('tq', S.tq, [['open', 'Open'], ['done', 'Done'], ['all', 'All']]) + '</div>';
    if (!list.length) return h + '<div class="card"><div class="empty">No tasks in this view.</div></div>';
    var groups = {}, names = [];
    list.forEach(function (t) { var g = t.g || 'General'; if (!groups[g]) { groups[g] = []; names.push(g); } groups[g].push(t); });
    names.forEach(function (g) {
      var rows = groups[g]; if (g === 'Deadlines') rows.sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
      h += '<div class="group">' + esc(g) + '</div><div class="card">' + rows.map(taskRow).join('') + '</div>';
    });
    return h;
  };

  function uniRows() {
    var q = S.uq.trim().toLowerCase();
    return U.filter(function (u) { return (S.ucs === 'all' || u.cs === 'Yes') && (!q || (u.n + ' ' + u.city + ' ' + u.state + ' ' + u.progs).toLowerCase().indexOf(q) >= 0); });
  }
  function uniTable(rows) {
    if (!rows.length) return '<div class="card"><div class="empty">Nothing matches.</div></div>';
    return '<div class="card scroll"><table><thead><tr><th>Institution</th><th>Type</th><th>Where</th><th>English-taught programmes found</th></tr></thead><tbody>' + rows.map(function (u) {
      var w = safeUrl(u.web);
      return '<tr><td><b>' + (w ? '<a href="' + esc(w) + '" target="_blank" rel="noopener noreferrer">' + esc(u.n) + '</a>' : esc(u.n)) + '</b></td><td>' + esc(u.t) + '</td><td>' + esc(u.city) + '<div class="sub">' + esc(u.state) + '</div></td><td>' + (u.cs === 'Yes' ? esc(u.progs || 'Yes') : '<span class="sub">' + esc(u.cs) + '</span>') + (u.wo === 'Yes' ? '<div class="sub">Winter start only</div>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  V.universities = function () {
    var rows = uniRows();
    return '<h1>Universities</h1><p class="lede">Public institutions in Germany and whether an English-taught master\'s in computer science or a related field was found there. The list is close to complete but not guaranteed.</p>' +
      '<div class="bar"><input type="search" id="uq" placeholder="Search name, city or state" value="' + esc(S.uq) + '" aria-label="Search universities">' + chips('ucs', S.ucs, [['yes', 'With a programme'], ['all', 'All institutions']]) + '</div>' +
      '<p class="count" id="ucount">' + rows.length + ' of ' + U.length + ' institutions</p><div id="utable">' + uniTable(rows) + '</div>';
  };

  V.profile = function (prof) {
    var f = prof.facts;
    var h = '<h1>Profile and data</h1><p class="lede">There are two profiles, Ishan and Riya. Each is saved online behind the passcode, so it is the same on every device. Switch between them in the sidebar.</p>';
    if (sync === 'off') h += '<p class="note">Sync is not set up on this copy of the site, so changes are lost when you close the page. The README explains the three Cloudflare settings it needs.</p>';
    h += '<div class="card"><form class="form" id="facts">' +
            '<label class="field"><span>Bachelor grade on the German scale</span><input name="grade" inputmode="decimal" placeholder="for example 2.4" value="' + esc(f.grade) + '"><small>1.0 is best, 4.0 is the pass mark. Use the converter below if you only know your home grade.</small></label>' +
      '<label class="field"><span>German certificate</span><select name="german">' + LEVELS.map(function (l) { return '<option' + (l === f.german ? ' selected' : '') + ' value="' + l + '">' + (l === 'none' ? 'None' : l) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Relevant work experience (years)</span><input name="work" inputmode="decimal" value="' + esc(f.work) + '"></label>' +
      '<div class="field"><span>Tests you hold</span><div class="checks">' + TESTS.map(function (t) { return '<label><input type="checkbox" name="tests" value="' + t + '"' + (f.tests.indexOf(t) >= 0 ? ' checked' : '') + '> ' + t + '</label>'; }).join('') + '</div></div>' +
      '<label class="field"><span>English proof</span><input name="english" placeholder="for example IELTS 7.0" value="' + esc(f.english) + '"><small>For your own reference. Not used by the quick check.</small></label>' +
      '<label class="field wide"><span>Notes about your degree</span><textarea name="notes" rows="2">' + esc(f.notes || '') + '</textarea></label>' +
      '</form><div class="actions"><button class="btn primary" form="facts">Save profile</button><span class="sub" id="saved" role="status"></span></div></div>';
    h += '<h2>Grade converter</h2><div class="card"><form class="form" id="conv">' +
      '<label class="field"><span>Best possible grade</span><input name="max" inputmode="decimal" placeholder="10"></label>' +
      '<label class="field"><span>Lowest passing grade</span><input name="min" inputmode="decimal" placeholder="4"></label>' +
      '<label class="field"><span>Your grade</span><input name="mine" inputmode="decimal" placeholder="7.4"></label>' +
      '<div class="field"><span>German grade</span><div class="mono" id="convout" style="font-size:20px">–</div><small>Modified Bavarian formula. Universities and uni-assist may use a different pass mark and get a different result.</small></div>' +
      '</form><div class="actions"><button class="btn" id="useconv" type="button">Use this grade in my profile</button></div></div>';
    h += '<h2>Back up or load a file</h2><div class="card"><div class="form"><div class="field wide"><span>This profile</span><small>Export saves one file with your facts, list, notes and tasks. Import replaces everything in the profile you are on with the contents of such a file.</small></div></div>' +
      '<div class="actions"><button class="btn" id="export" type="button">Export this profile</button><button class="btn" id="import" type="button">Import a profile file</button><input type="file" id="file" accept="application/json,.json" hidden>' +
      '</div><p class="sub" id="iomsg" role="status" style="padding:0 18px 16px;margin:0"></p></div>';
    return h;
  };

  function gate() {
    if (sync === 'loading') return '<p class="lede">Loading…</p>';
    return '<h1>Germany Master\'s Tracker</h1><p class="lede">Enter the passcode to open the Ishan and Riya profiles. It is remembered on this device.</p>' +
      '<div class="card"><form class="form" id="gate"><label class="field"><span>Passcode</span><input name="pass" type="password" required autocomplete="current-password"></label></form><div class="actions"><button class="btn primary" form="gate">Open</button><span class="sub" role="status">' + (pass ? 'That passcode was not accepted.' : '') + '</span></div></div>';
  }

  /* ---------- rendering and events ---------- */
  function view() { var v = location.hash.slice(1); return V[v] ? v : 'overview'; }
  function render() {
    var prof = me(), main = $('#main'), sel = $('#who');
    sel.innerHTML = IDS.map(function (i) { return '<option value="' + i[0] + '"' + (i[0] === store.active ? ' selected' : '') + '>' + i[1] + '</option>'; }).join('');
    status(SYNC_TEXT[sync]);
    $('#updated').textContent = 'Data checked ' + DATA_DATE;
    var v = view();
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#n-progs').textContent = P.length; $('#n-unis').textContent = U.length;
    $('#n-list').textContent = prof ? Object.keys(prof.progs).filter(function (k) { return prof.progs[k].status && BYKEY[k]; }).length || '' : '';
    $('#n-tasks').textContent = prof ? prof.tasks.filter(function (t) { return !t.done; }).length || '' : '';
    main.innerHTML = prof && sync !== 'locked' && sync !== 'loading' ? V[v](prof) : gate();
  }
  function refreshTable() {
    var prof = me(); if (!prof) return;
    if (view() === 'programmes') { var r = progRows(prof); $('#ptable').innerHTML = progTable(r, prof); $('#pcount').textContent = r.length + ' of ' + P.length + ' programmes'; }
    if (view() === 'universities') { var u = uniRows(); $('#utable').innerHTML = uniTable(u); $('#ucount').textContent = u.length + ' of ' + U.length + ' institutions'; }
  }
  function msg(t) { var m = $('#iomsg'); if (m) m.textContent = t; }
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || d.format !== FORMAT) throw new Error('not a profile');
        if (!window.confirm('Replace everything in the ' + nameOf(store.active) + ' profile with this file?')) return;
        store.profiles[store.active] = clean({ id: store.active, name: nameOf(store.active), facts: d.facts, progs: d.progs, tasks: d.tasks, apps: Array.isArray(d.apps) ? d.apps : undefined });
        save(); location.hash = '#overview'; render();
      } catch (e) { msg('That file is not a tracker profile. Choose a file made with Export.'); }
    };
    r.readAsText(file);
  }
  function exportProfile() {
    var p = me(); if (!p) return;
    var out = { format: FORMAT, version: 1, exported: new Date().toISOString().slice(0, 10), id: p.id, name: p.name, facts: p.facts, progs: p.progs, tasks: p.tasks }; if (p.apps) out.apps = p.apps;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    a.download = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-profile.private.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    msg('Exported. Keep the file out of any public repository.');
  }
  function conv(form) {
    var n = function (k) { return parseFloat(String(form[k].value).replace(',', '.')); };
    var max = n('max'), min = n('min'), mine = n('mine');
    if (!(max > min) || !(mine >= min && mine <= max)) return null;
    return Math.round((1 + 3 * (max - mine) / (max - min)) * 10) / 10;
  }

  document.addEventListener('click', function (e) {
    var t = e.target, prof = me();
    var chip = t.closest('[data-set]');
    if (chip) { S[chip.dataset.set] = chip.dataset.val; render(); return; }
    if (t.id === 'import') { $('#file').click(); return; }
    if (t.id === 'export') return exportProfile();
    if (t.id === 'useconv' && prof) { var g = conv($('#conv')); if (g) { prof.facts.grade = g.toFixed(1); save(); render(); } return; }
    if (t.dataset.deltask && prof) { prof.tasks = prof.tasks.filter(function (x) { return x.id !== t.dataset.deltask; }); save(); render(); return; }
    if (t.closest('select,textarea,a,input,button')) return;
    var row = t.closest('tr[data-open]');
    if (row) { var k = row.dataset.open; if (S.open[k]) delete S.open[k]; else S.open[k] = 1; refreshTable(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, prof = me();
    if (t.id === 'who') {
      store.active = t.value; prefs(); S.open = {};
      if (store.profiles[t.value] && sync !== 'locked') render(); else loadProfile(t.value);
      return;
    }
    if (t.id === 'file' && t.files[0]) { importFile(t.files[0]); t.value = ''; return; }
    if (!prof) return;
    if (t.dataset.status) { setProg(t.dataset.status, 'status', t.value); if (view() === 'mylist') render(); else { $('#n-list').textContent = Object.keys(prof.progs).filter(function (k) { return prof.progs[k].status && BYKEY[k]; }).length || ''; } return; }
    if (t.dataset.note) { setProg(t.dataset.note, 'note', t.value.trim().slice(0, 2000)); return; }
    if (t.dataset.task) { prof.tasks.forEach(function (x) { if (x.id === t.dataset.task) x.done = t.checked; }); save(); render(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { S.q = t.value; refreshTable(); }
    if (t.id === 'uq') { S.uq = t.value; refreshTable(); }
    if (t.form && t.form.id === 'conv') { var g = conv(t.form); $('#convout').textContent = g ? g.toFixed(1) : '–'; }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, prof = me();
    if (f.id === 'gate') { pass = f.pass.value; prefs(); store.profiles = {}; loadProfile(store.active); return; }
    if (!prof) return;
    if (f.id === 'facts') {
      prof.facts = { grade: f.grade.value.trim().replace(',', '.'), german: f.german.value, work: f.work.value.trim().replace(',', '.'), english: f.english.value.trim(), notes: f.notes.value.trim(), tests: Array.prototype.filter.call(f.querySelectorAll('[name=tests]'), function (c) { return c.checked; }).map(function (c) { return c.value; }) };
      save(); render(); $('#saved').textContent = sync === 'ok' ? 'Saved.' : 'Not saved: sync is off.'; return;
    }
    if (f.id === 'addtask') {
      prof.tasks.unshift({ id: 't' + Date.now().toString(36), g: 'General', task: f.task.value.trim().slice(0, 300), date: f.date.value, done: false }); save(); render();
    }
  });
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  if (!IDS.some(function (i) { return i[0] === store.active; })) store.active = 'ishan';
  loadProfile(store.active);
})();
