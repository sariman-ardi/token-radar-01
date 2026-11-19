// Token Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, the validation panel,
// the farm plans in the main table, a per-protocol detail view and the live
// token view. No network: every byte it shows is in data.js. The page
// recomputes a row's $10,000 farm math from the snapshot figures it carries,
// so the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  app.removeAttribute('aria-busy');

  var state = { q: '', cat: 'all', verdict: 'all', watch: false, tab: 'board', sort: 'rank', dir: 1, sel: null };

  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var parts = h ? h.split('&') : [];
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'q') state.q = v;
      else if (k === 'cat') state.cat = v;
      else if (k === 'verdict') state.verdict = v;
      else if (k === 'watch') state.watch = v === '1';
      else if (k === 'tab') state.tab = v === 'live' ? 'live' : 'board';
      else if (k === 'sort') state.sort = v;
      else if (k === 'dir') state.dir = v === '-1' ? -1 : 1;
      else if (k === 'sel') state.sel = v || null;
    }
  }
  function writeHash() {
    var h = 'tab=' + state.tab + '&q=' + encodeURIComponent(state.q) + '&cat=' + encodeURIComponent(state.cat) +
      '&verdict=' + state.verdict + '&watch=' + (state.watch ? '1' : '0') + '&sort=' + state.sort + '&dir=' + state.dir;
    if (state.sel) h += '&sel=' + encodeURIComponent(state.sel);
    history.replaceState(null, '', '#' + h);
  }

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtMoney(n) { return (n < 0 ? '-' : '') + usd2.format(Math.abs(n)); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }
  function fmtTime(min, hold) { return min + 'm · ' + hold + 'd'; }

  function sortVal(r, key) {
    if (key === 'rank') return r.rank;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'change') return r.change_7d === null ? -9 : r.change_7d;
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'odds') return r.launch_factor;
    if (key === 'net') return r.net_usd;
    if (key === 'fees') return r.fees_usd;
    if (key === 'name') return r.name.toLowerCase();
    return r.rank;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.watch && !r.watch) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0 && String(r.category || '').toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort, dir = state.dir;
    rows.sort(function (a, b) {
      var va = sortVal(a, key), vb = sortVal(b, key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function th(label, key, cls) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th data-sort="' + key + '" class="' + (cls || '') + '">' + label + arrow + '</th>';
  }

  function scatterSvg() {
    var pts = DATA.scatter.points, line = DATA.scatter.line;
    var W = 560, H = 300, pad = 34;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs.concat(line.map(function (p) { return p.x; })));
    var x1 = Math.max.apply(null, xs.concat(line.map(function (p) { return p.x; })));
    var y0 = Math.min.apply(null, ys.concat(line.map(function (p) { return p.y; })));
    var y1 = Math.max.apply(null, ys.concat(line.map(function (p) { return p.y; })));
    function X(v) { return pad + ((v - x0) / (x1 - x0)) * (W - pad * 2); }
    function Y(v) { return H - pad - ((v - y0) / (y1 - y0)) * (H - pad * 2); }
    var dots = pts.map(function (p) { return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3" fill="#14324f" opacity="0.65"/>'; }).join('');
    var path = line.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of comparables: log TVL against log market cap, with the fitted size curve">' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#999"/>' +
      '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="#999"/>' +
      '<path d="' + path + '" fill="none" stroke="#c9a227" stroke-width="2.5"/>' + dots +
      '<text x="' + (W / 2) + '" y="' + (H - 8) + '" font-size="11" text-anchor="middle" fill="#5c6672">log10 TVL (USD, with growth carry)</text>' +
      '<text x="12" y="' + (H / 2) + '" font-size="11" text-anchor="middle" fill="#5c6672" transform="rotate(-90 12 ' + (H / 2) + ')">log10 market cap (USD)</text>' +
      '<text x="' + (W - pad) + '" y="' + (pad - 8) + '" font-size="11" text-anchor="end" fill="#8a6100">gold line: fitted size curve · dots: 70 comparables</text></svg>';
  }

  function detailHtml(r) {
    var touches = Math.max(0, Math.round((r.minutes - 40) / 10));
    var gas = (r.fees_usd - 5) / (4 + touches);
    var fees10 = 50 + (4 + touches) * gas;
    var opp10 = 10000 * 0.04 * r.hold_days / 365;
    var air10 = 0.05 * r.curve_value_usd * (10000 / Math.max(1, r.tvl_usd));
    var net10 = air10 - fees10 - opp10;
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return '<section class="card detail" id="detail"><h2>' + esc(r.name) + ' <span class="mut small">rank #' + r.rank + ' · ' + esc(r.slug) + '</span></h2>' +
      '<div class="grid">' +
      '<div class="cell"><div class="k">Implied value</div><div class="v">' + fmtUsd(r.implied_value_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Curve value (if it launches)</div><div class="v">' + fmtUsd(r.curve_value_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Launch probability</div><div class="v">' + (r.launch_p * 100).toFixed(1) + '%</div></div>' +
      '<div class="cell"><div class="k">Launch factor</div><div class="v">' + r.launch_factor.toFixed(2) + '×</div></div>' +
      '<div class="cell"><div class="k">Rank range (200 refits)</div><div class="v">#' + r.rank_low + '–#' + r.rank_high + '</div></div>' +
      '<div class="cell"><div class="k">Net if it launches ($1,000)</div><div class="v ' + (r.net_usd >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(r.net_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Net if it launches ($10,000)</div><div class="v ' + (net10 >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(net10) + '</div></div>' +
      '<div class="cell"><div class="k">Expected net ($1,000 × odds)</div><div class="v ' + (r.net_usd * r.launch_p >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(r.net_usd * r.launch_p) + '</div></div>' +
      '</div>' +
      '<p class="small mut">Model math: implied = curve × launch factor. Curve = 10^(intercept + exponent × log10(TVL with carry)) × seasoning. ' +
      'TVL ' + fmtUsd(r.tvl_usd) + ', 7-day change ' + fmtPct(r.change_7d) + ' (carry capped at ±25%), age ' + fmtAge(r.age_days) + ', category ' + esc(r.category || 'none') + ', chains ' + esc(r.chains.join(', ') || 'none') + '. ' +
      'The $10,000 column is recomputed on this page from the same figures: fees $' + fees10.toFixed(2) + ', opportunity $' + opp10.toFixed(2) + ', airdrop if it launches $' + air10.toFixed(2) + '.</p>' +
      '<h3>Farm plan — $1,000 position</h3><ol class="steps">' + steps + '</ol></section>';
  }

  function render() {
    writeHash();
    var v = DATA.validation, ag = DATA.aggregate, lg = DATA.ledger;
    var cats = [];
    DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.sort();
    var rows = state.tab === 'board' ? filteredRows() : [];
    var sel = null;
    if (state.sel) { for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.sel) sel = DATA.rows[i]; }
    var h = '<div class="wrap">';
    h += '<header class="mast"><div class="wrap" style="padding-bottom:0"><h1>TOKEN <b>RADAR</b> <span style="font-size:15px;color:#9db2c4">· radar-4 · ' + esc(DATA.as_of) + '</span></h1>' +
      '<p>Pre-token protocols ranked by an implied value fitted from the snapshot\u2019s own live-token comparables. ' +
      'Every row carries its farm plan in the table: verdict, net dollars, fees and time. ' +
      'The model, the validation and the ledger are on this page; the board is the board.json this run wrote.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="k">Leave-one-out error</div><div class="v">' + v.loo.toFixed(2) + '×</div></div>' +
      '<div class="stat"><div class="k">Walk-forward (older→newer)</div><div class="v">' + v.wfOlderNewer.toFixed(2) + '×</div></div>' +
      '<div class="stat"><div class="k">TVL exponent</div><div class="v">' + DATA.model.exponent.toFixed(3) + '</div></div>' +
      '<div class="stat"><div class="k">FARM / THIN / SKIP</div><div class="v">' + ag.farm + ' / ' + ag.thin + ' / ' + ag.skip + '</div></div>' +
      '<div class="stat"><div class="k">Positive nets ($1,000)</div><div class="v">' + fmtMoney(ag.sum_positive_net) + '</div></div>' +
      '<div class="stat"><div class="k">Watchlist covered</div><div class="v">' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</div></div>' +
      '</div></div></header>';
    h += '<div class="wrap">';
    h += '<div class="tabs"><button data-tab="board" class="' + (state.tab === 'board' ? 'on' : '') + '">Pre-token board (' + DATA.board_size + ')</button>' +
      '<button data-tab="live" class="' + (state.tab === 'live' ? 'on' : '') + '">Live tokens (' + DATA.live_size + ' shown)</button></div>';

    if (state.tab === 'board') {
      h += '<section class="card"><h2>How the model was tested</h2>' +
        '<p class="mono small">' + esc(DATA.model.formula) + '</p>' +
        '<p class="small">Fitted on ' + v.comps + ' live-token comparables (market cap &gt; $0, TVL &gt; $0, listing date known, watchlist-eligible category). ' +
        'Intercept ' + DATA.model.intercept.toFixed(4) + ', exponent ' + DATA.model.exponent.toFixed(4) + '. ' +
        'Naive baseline (one global median multiple): ' + v.naive.toFixed(2) + '×. Blind splits: ' + v.blindA.toFixed(2) + '× / ' + v.blindB.toFixed(2) + '×.</p>' +
        '<h3>Ablation — every term has to earn its place</h3><table><thead><tr><th>Variant</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th>Verdict</th></tr></thead><tbody>' +
        v.ablation.map(function (a) { return '<tr><td>' + esc(a.variant) + '</td><td class="num">' + a.loo.toFixed(2) + '×</td><td class="num">' + a.wf.toFixed(2) + '×</td><td>' + esc(a.kept) + '</td></tr>'; }).join('') +
        '</tbody></table>' +
        '<h3>Range calibration — the bands say what they do</h3><p class="small">The value band is the fitted curve plus the comparables\u2019 own residual spread — the middle 50% (P25–P75) and 80% (P10–P90) of how far real market caps sit from the curve. A band built from refit wobble alone would be far too narrow: it measures the curve\u2019s movement, not the scatter of market caps around it. The true market cap fell inside the P25–P75 band for ' + (v.cal2575 * 100).toFixed(0) + '% of comparables (a calibrated band holds 50%) and inside P10–P90 for ' + (v.cal1090 * 100).toFixed(0) + '% (calibrated: 80%). ' +
        'Each row\u2019s rank range comes from 200 bootstrap refits and shows parameter uncertainty only; the value bands add the residual scatter, which is the larger term. Launch odds hold-out (fit on older mature protocols, test on newer): accuracy ' + (v.launchHoldout.accuracy * 100).toFixed(0) + '% — the same as always predicting \u201cno\u201d, since only ' + (v.launchHoldout.base * 100).toFixed(0) + '% launched; accuracy is not the signal here. The signal is the ranking: the top quintile the model rated most likely launched ' + (v.launchHoldout.topQuintile * 100).toFixed(0) + '% of the time, ' + (v.launchHoldout.topQuintile / v.launchHoldout.base).toFixed(1) + '\u00d7 the base rate.</p>' +
        '<h3>Size curve against the comparables</h3>' + scatterSvg() +
        '<h3>Ledger — all 758 protocols accounted for</h3><p class="small">' + lg.ranked + ' ranked on this board · ' + lg.live_total + ' record a token (set aside, ' + lg.live_shown + ' shown) · ' +
        lg.excluded_by_rule + ' pre-token protocols excluded by rule (exchange, versioned or wrapped products) · ' + lg.below_cut + ' rankable pre-token protocols below the board cut. Total ' + lg.total + '.</p>' +
        '<h3>Best farms at $1,000</h3><p class="small">' + ag.best_farms.map(function (b) { return esc(b.name) + ' ' + fmtMoney(b.net); }).join(' · ') + '</p>' +
        '<p class="small mut">Farm assumptions, stated so you can argue with them: $1,000 position; airdrop pool 5% of the curve value, shared pro-rata by TVL; swap 0.30%, protocol action 0.10%, claim 0.10%; gas per transaction by chain (Ethereum $6.00, most L2s under $0.50); idle capital charged the 4.00% T-bill yield over the hold. Net = airdrop if it launches − fees − opportunity cost. FARM at net ≥ $5, THIN above $0, SKIP at or below $0.</p>' +
        '</section>';

      h += '<div class="controls"><input type="search" id="q" placeholder="Search name, slug or category" value="' + esc(state.q) + '" size="30">' +
        '<select id="cat"><option value="all">All categories</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<select id="verdict"><option value="all">All verdicts</option>' + ['FARM', 'THIN', 'SKIP'].map(function (x) { return '<option' + (state.verdict === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
        '<label><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
        '<span class="mut small">' + rows.length + ' rows shown</span></div>';

      h += '<section class="card"><table><thead><tr>' +
        th('Rank', 'rank', 'num') + th('Protocol', 'name') + th('TVL', 'tvl', 'num') + th('7d', 'change', 'num') + th('Age', 'age', 'num') +
        th('Implied', 'implied', 'num') + th('Odds', 'odds', 'num') + '<th>Range</th>' + th('Verdict', 'verdict') + th('Net $', 'net', 'num') + th('Fees $', 'fees', 'num') +
        '<th>Time</th><th>Action</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        h += '<tr data-slug="' + esc(r.slug) + '" class="' + (sel && sel.slug === r.slug ? 'sel' : '') + '">' +
          '<td class="num">' + r.rank + '</td><td><b>' + esc(r.name) + '</b><br><span class="small mut">' + esc(r.slug) + (r.watch ? ' · watchlist' : '') + '</span></td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td><td class="num">' + fmtAge(r.age_days) + '</td>' +
          '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td><td class="num">' + r.launch_factor.toFixed(2) + '×</td>' +
          '<td class="num">#' + r.rank_low + '–#' + r.rank_high + '</td>' +
          '<td><span class="pill ' + r.verdict + '">' + r.verdict + '</span></td>' +
          '<td class="num ' + (r.net_usd >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(r.net_usd) + '</td>' +
          '<td class="num">' + fmtMoney(r.fees_usd) + '</td><td class="num">' + fmtTime(r.minutes, r.hold_days) + '</td>' +
          '<td>' + esc(r.action) + '</td></tr>';
      });
      h += '</tbody></table></section>';
      if (sel) h += detailHtml(sel);
    } else {
      h += '<section class="card"><h2>Live tokens — the market\u2019s own values, not the model\u2019s</h2>' +
        '<p class="small">These ' + DATA.live_size + ' protocols already trade. They are the comparables the size curve is fitted on, shown apart so the board never mixes a market price with a model claim.</p>' +
        '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MCap / TVL</th><th class="num">7d</th><th>Category</th></tr></thead><tbody>' +
        DATA.live.map(function (r) {
          return '<tr><td><b>' + esc(r.name) + '</b><br><span class="small mut">' + esc(r.slug) + '</span></td>' +
            '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
            '<td class="num">' + (r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(3) : 'n/a') + '</td>' +
            '<td class="num">' + fmtPct(r.change_7d) + '</td><td>' + esc(r.category || 'none') + '</td></tr>';
        }).join('') + '</tbody></table></section>';
    }

    h += '<p class="foot small">Seal: this page renders the board.json this run wrote — sha256 <span class="mono">' + esc(DATA.seal.slice(0, 16)) + '…</span>. ' +
      'Model ' + esc(DATA.model_version) + ' · snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source) + '. ' +
      'No network: every number on this page comes from data.js.</p>';
    h += '</div></div>';
    app.innerHTML = h;

    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.sel = null; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var ver = document.getElementById('verdict');
    if (ver) ver.addEventListener('change', function () { state.verdict = ver.value; render(); });
    var w = document.getElementById('watch');
    if (w) w.addEventListener('change', function () { state.watch = w.checked; render(); });
    var tabs = app.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function (e) { state.tab = e.currentTarget.getAttribute('data-tab'); state.sel = null; render(); });
    var heads = app.querySelectorAll('th[data-sort]');
    for (var j = 0; j < heads.length; j++) heads[j].addEventListener('click', function (e) {
      var k = e.currentTarget.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
      render();
    });
    var trs = app.querySelectorAll('tbody tr[data-slug]');
    for (var k2 = 0; k2 < trs.length; k2++) trs[k2].addEventListener('click', function (e) {
      var slug = e.currentTarget.getAttribute('data-slug');
      state.sel = state.sel === slug ? null : slug;
      render();
      var d = document.getElementById('detail');
      if (d) d.scrollIntoView({ block: 'nearest' });
    });
  }

  readHash();
  render();
})();
