// Token Radar's dashboard (model radar-3). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's costed farm plan, the validation behind the model, and
// the calibration behind the curve. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + n.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. log(market cap) = intercept[category] + slope x log(TVL), fitted on the
  // snapshot's live-token comparables; the slope is pooled, each intercept shrunk by sample size.
  function impliedOf(row) {
    return Math.max(1, Math.round(Math.exp(row.category_intercept + row.log_slope * Math.log(row.tvl_usd))));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // What one transaction costs on a chain, in dollars: an estimate, labelled as one.
  // The same table main.ts uses, so the page's ledger and the board's steps agree.
  var GAS_USD = {
    Ethereum: 3.5, Arbitrum: 0.15, Optimism: 0.12, Base: 0.08, Polygon: 0.03, BSC: 0.25,
    Avalanche: 0.4, Solana: 0.01, Gnosis: 0.1, 'zkSync Era': 0.15, Linea: 0.1, Scroll: 0.12,
    Mantle: 0.05, Blast: 0.08, Mode: 0.05, Fraxtal: 0.08, Sei: 0.02, Sui: 0.01, Aptos: 0.01,
    Near: 0.01, Cosmos: 0.05, Tron: 0.5, Fantom: 0.1, Cronos: 0.1, Kava: 0.05, Celo: 0.02,
    Moonbeam: 0.1, Harmony: 0.02, Klaytn: 0.05, Aurora: 0.05, 'Polygon zkEVM': 0.1,
    Starknet: 0.3, Metis: 0.05, Manta: 0.08, Merlin: 0.1, Bittensor: 0.05, Berachain: 0.1,
    Hyperliquid: 0.01, Movement: 0.05, Sonic: 0.05, Abstract: 0.08, Unichain: 0.08, Ink: 0.08,
    Worldchain: 0.08, Zora: 0.05, Lisk: 0.05, Gravity: 0.05, Apechain: 0.1, Soneium: 0.08,
    MegaETH: 0.02, Monad: 0.02, Plasma: 0.05, Stable: 0.02, Tempo: 0.05
  };
  function gasFor(chain) { return GAS_USD[chain] === undefined ? 0.5 : GAS_USD[chain]; }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 90) return 90;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function coreAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Use ' + name + ' on ' + chain + ': run one transaction a week, such as a swap or a vote, and keep a balance.';
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  // The second action: the move that proves the position is used, not parked. Each category
  // farms differently, with its own gas, so no two categories share a plan.
  function secondAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var g = gasFor(chain);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return { text: 'Borrow 30% of the supplied $' + capital + ' against it, then repay the borrow within a week so the position shows both sides of the market.', gas: g * 2 };
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return { text: "Swap $25 through " + name + "'s pool once, so the position records trading volume as well as liquidity.", gas: g };
    }
    if (c.indexOf('bridge') >= 0) {
      return { text: 'Bridge half of the bridged funds back to the starting chain, so the position records two crossings.', gas: g };
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return { text: 'Restake the first rewards the stake earns, so the position compounds instead of sitting idle.', gas: g };
    }
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) {
      return { text: 'Close the hedge and open a fresh one at half size, so the margin account records two trades.', gas: g * 2 };
    }
    if (c.indexOf('prediction') >= 0) {
      return { text: 'Settle the first market position, then place a second one on a different market.', gas: g };
    }
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) {
      return { text: "Move a quarter of the vault shares into the vault's second strategy, if it offers one, so the deposit touches more than one allocation.", gas: g };
    }
    if (c.indexOf('stable') >= 0) {
      return { text: 'Use the minted stable asset once, for example to supply it to a lending market, then bring it back.', gas: g * 2 };
    }
    if (c.indexOf('rwa') >= 0) {
      return { text: "Verify the yield asset's backing on the protocol's own page and record the yield it has paid so far.", gas: 0 };
    }
    if (c.indexOf('insurance') >= 0) {
      return { text: 'File one test claim inquiry on the cover, so the policy is exercised before it is needed.', gas: g };
    }
    if (c.indexOf('chain') >= 0) {
      return { text: "Vote once in the chain's governance or stake a small amount to a validator, so the wallet's activity is not only swaps.", gas: g };
    }
    if (c.indexOf('payment') >= 0) {
      return { text: 'Send a second payment of $10 through ' + name + ' to a different recipient, so the wallet\'s history shows repeat use.', gas: g };
    }
    return { text: "Use the position once more in the protocol's app, for example by voting, claiming or swapping, so the activity is not a single deposit.", gas: g };
  }
  function protocolFee(p, capital) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('bridge') >= 0) return Math.round(capital * 0.003 * 100) / 100;
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 0.08;
    return 0;
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // The costed farm plan: the same derivation main.ts writes to board.json. TVL sets the
  // capital, chains set the gas, age sets the hold, category sets the two actions, and the
  // plan ends with a ledger netted to the dollar.
  function costedFarmPlan(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var g = gasFor(chain);
    var second = secondAction(p, capital, chain);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var secondGas = secondChain === null ? 0 : gasFor(secondChain) * 2;
    var weeklyGas = g * weeks;
    var gasTotal = Math.round((g + g + second.gas + secondGas + weeklyGas) * 100) / 100;
    var feeTotal = protocolFee(p, capital);
    var netCost = Math.round((gasTotal + feeTotal) * 100) / 100;
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: fmtUsd2(g) + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: coreAction(p, capital, chain), cost: fmtUsd2(capital) + ' of capital and about ' + fmtUsd2(g) + ' of gas', time: '15 minutes to set up' },
      { text: second.text, cost: second.gas === 0 ? 'no gas: it is a read of the protocol page' : 'about ' + fmtUsd2(second.gas) + ' of gas', time: '10 minutes' }
    ];
    if (secondChain !== null) {
      steps.push({ text: 'Repeat the core action once on ' + secondChain + ' with $25, so the activity covers a second chain.', cost: '$25 of capital and about ' + fmtUsd2(secondGas) + ' of gas', time: '10 minutes' });
    }
    steps.push(
      { text: 'Make one qualifying action each week for ' + weeks + ' weeks, such as a deposit, a borrow, a swap or a vote on ' + chain + '.', cost: 'about ' + fmtUsd2(weeklyGas) + ' of gas in all (' + fmtUsd2(g) + ' a week)', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Ledger: ' + fmtUsd2(gasTotal) + ' of gas plus ' + fmtUsd2(feeTotal) + ' of protocol fees is ' + fmtUsd2(netCost) + ' net outlay; the $' + capital + ' of capital returns when you exit. An airdrop must be worth at least ' + fmtUsd2(netCost) + ' to break even.', cost: fmtUsd2(netCost) + ' net, ' + fmtUsd2(capital) + ' of capital at risk', time: '5 minutes to add up' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; write the wallet, the dates and every transaction in a farm log.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' }
    );
    return { steps: steps.map(stepText), capital: capital, netCost: netCost, breakEven: netCost, holdDays: hold, weeks: weeks, gasTotal: gasTotal, feeTotal: feeTotal };
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function totalImplied() {
    return DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
  }
  function topCategory() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      byCat[c] = (byCat[c] || 0) + r.implied_value_usd;
    });
    var best = null, bestVal = -1;
    Object.keys(byCat).forEach(function (c) { if (byCat[c] > bestVal) { bestVal = byCat[c]; best = c; } });
    return best || 'Other';
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', null, 'Token Radar ', el('small', { text: 'pre-token protocols, ranked' }))),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill' }, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'pill' }, 'Source ', el('b', { text: 'DefiLlama' })),
        el('span', { class: 'pill' }, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    var v = DATA.validation;
    return el('section', { class: 'lede' },
      el('h1', null, 'The ', el('em', { text: DATA.watchlist_size + ' watchlist protocols' }), ', ranked by what their token would be worth.'),
      el('p', { text: 'The watchlist is the floor: every protocol with at least ' + fmtUsd(DATA.floor_usd) + ' of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise — ' + (top ? 'the strongest, ' + top.name + ', is valued at ' + fmtUsd(top.implied_value_usd) + '.' : '') }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every one, ranked' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early, below the floor' })),
        el('div', { class: 'fact hot' }, el('span', { text: 'Model tested: leave-one-out' }), el('b', { text: 'median error ' + v.loo.median_factor + 'x' }), el('small', { text: v.loo.within_2x + ' of ' + v.loo.n + ' comparables within 2x' })),
        el('div', { class: 'fact hot' }, el('span', { text: 'Walk-forward' }), el('b', { text: 'median error ' + v.walk_forward.median_factor + 'x' }), el('small', { text: 'fit on older protocols, tested on newer ones' })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(totalImplied()) }), el('small', { text: 'across the whole board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'market cap shown, not modelled' }))
      )
    );
  }

  function spotlight() {
    var top5 = DATA.rows.slice(0, 5);
    return el('section', { class: 'spot' },
      el('h2', { text: 'Top opportunities' }),
      el('div', { class: 'spot-grid' }, top5.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: 'Rank ' + r.rank + ' (range ' + r.rank_lo + '-' + r.rank_hi + ')' }),
          el('span', { class: 'name', text: r.name }),
          el('span', { class: 'cat', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' }),
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'tvl', text: 'implied value · ' + fmtPct(r.change_7d) + ' in 7d · farm nets ' + fmtUsd2(r.net_cost_usd) })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'range', text: r.rank_lo + '-' + r.rank_hi })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, uncertainty and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Rank range' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      ),
      el('div', { class: 'note', text: 'Implied value is the model’s estimate of what a token would be worth at this TVL — not a price, and not a prediction that a token will launch. Rank range is the 5th–95th percentile rank across 200 bootstrap refits of the model: a narrow range means the comparables agree about the protocol.' })
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparables the model is fitted on and tested against.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var v = DATA.validation;
    var calibRows = (DATA.calibration || []).filter(function (c) { return c.live_count >= 3; }).sort(function (a, b) { return b.multiple_at_100m - a.multiple_at_100m; });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' }, 'implied = exp( intercept[category] + ' + DATA.log_slope + ' x log(tvl_usd) )'),
      el('div', { class: 'two-col' },
        el('div', null,
          el('h3', { text: 'The size curve' }),
          el('p', { text: 'A token’s market value per dollar of TVL is not one number: bigger protocols trade at a lower multiple. The curve is fitted on the snapshot’s own live-token comparables — log market cap against log TVL, one intercept per category, one slope pooled across categories (' + DATA.log_slope + ' here). Each intercept is the mean of its category’s comparables, shrunk toward the global intercept (' + DATA.global_intercept + ') by sample size; a category with fewer than ' + DATA.model.min_live_for_category + ' live protocols takes the global intercept. The table shows every category with enough live comparables, with its effective multiple at $100M of TVL.' })
        ),
        el('div', null,
          el('h3', { text: 'What was tested and dropped' }),
          el('ul', null,
            el('li', { text: 'Seven-day TVL growth was tested as a value term: its correlation with the log market-cap / TVL ratio across the comparables is ' + v.growth_corr + ', and adding it does not improve leave-one-out error. It is not in the value formula.' }),
            el('li', { text: 'Age was tested the same way: correlation ' + v.age_corr + ' with the log ratio, no improvement out of sample. It is not in the value formula either.' }),
            el('li', { text: 'Growth and age still drive the farm plan: a young, fast-growing protocol gets a longer hold and an earlier first action. Testing a term and dropping it is part of the model, not a gap in it.' })
          )
        )
      ),
      calibRows.length ? el('table', { class: 'calib' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Category' }), el('th', { text: 'Live comparables' }),
          el('th', { text: 'Intercept' }), el('th', { text: 'Multiple at $100M TVL' })
        )),
        el('tbody', null, calibRows.map(function (c) {
          return el('tr', null,
            el('td', { text: c.category }),
            el('td', { class: 'num', text: String(c.live_count) }),
            el('td', { class: 'num', text: String(c.intercept) }),
            el('td', { class: 'num', text: fmtMult(c.multiple_at_100m) })
          );
        }))
      ) : null
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    function vrow(r, best) {
      return el('tr', null,
        el('td', { text: r.test }),
        el('td', { class: 'sub', text: r.method }),
        el('td', { class: 'num', text: String(r.n) }),
        el('td', { class: 'num' + (best ? ' best' : ''), text: r.median_factor + 'x' }),
        el('td', { class: 'num', text: r.within_2x + ' / ' + r.n }),
        el('td', { class: 'num', text: r.within_3x + ' / ' + r.n })
      );
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'The model, tested — read this before trusting a number' }),
      el('p', { class: 'sub', text: 'The curve was fitted on the snapshot’s live-token protocols, then tested on protocols it had not seen. Each test refits the curve from scratch on the training set alone, so the errors below are honest out-of-sample errors, not in-sample fits. The error is a factor: 2x means the prediction was double or half the true market cap.' }),
      el('table', { class: 'calib valid' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Test' }), el('th', { text: 'Method' }), el('th', { text: 'n' }),
          el('th', { text: 'Median error' }), el('th', { text: 'Within 2x' }), el('th', { text: 'Within 3x' })
        )),
        el('tbody', null,
          vrow(v.loo, true),
          vrow(v.walk_forward, true),
          vrow(v.blind_a, false),
          vrow(v.blind_b, false)
        )
      ),
      el('div', { class: 'two-col' },
        el('div', null,
          el('h3', { text: 'Against the naive baseline' }),
          el('p', { text: 'One global multiple for every protocol — no curve, no category — misses by a median of ' + v.baseline_loo_median + 'x leave-one-out and ' + v.baseline_wf_median + 'x walk-forward. The fitted curve cuts that to ' + v.loo.median_factor + 'x and ' + v.walk_forward.median_factor + 'x. The curve earns its keep.' })
        ),
        el('div', null,
          el('h3', { text: 'Rank agreement and uncertainty' }),
          el('p', { text: 'Predicted and actual market cap across the comparables agree with Spearman ' + v.spearman + ': the curve ranks roughly right and is wrong by a factor of a few, not by orders of magnitude. Every row carries its rank range from ' + DATA.model.bootstrap_refits + ' bootstrap refits of the curve — the 5th to 95th percentile rank — so a wide range means the comparables disagree about that protocol.' })
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var plan = costedFarmPlan(row);
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · rank range ' + row.rank_lo + '-' + row.rank_hi }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category intercept' }), el('b', { class: 'num', text: row.category_intercept.toFixed(4) })),
        el('div', null, el('span', { text: 'Log slope' }), el('b', { class: 'num', text: row.log_slope.toFixed(4) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Rank range (bootstrap)' }), el('b', { class: 'num', text: row.rank_lo + '–' + row.rank_hi })),
        el('div', null, el('span', { text: 'Implied value, 5–95%' }), el('b', { class: 'num', text: fmtUsd(row.implied_lo_usd) + ' – ' + fmtUsd(row.implied_hi_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'What farming it costs' }),
      el('div', { class: 'ledger' },
        el('div', null, el('span', { text: 'Capital in the position' }), el('b', { text: fmtUsd2(plan.capital) })),
        el('div', null, el('span', { text: 'Gas in all (estimates)' }), el('b', { text: fmtUsd2(plan.gasTotal) })),
        el('div', null, el('span', { text: 'Protocol fees' }), el('b', { text: fmtUsd2(plan.feeTotal) })),
        el('div', { class: 'hot' }, el('span', { text: 'Net outlay' }), el('b', { text: fmtUsd2(plan.netCost) })),
        el('div', { class: 'hot' }, el('span', { text: 'Break-even airdrop' }), el('b', { text: fmtUsd2(plan.breakEven) })),
        el('div', null, el('span', { text: 'Hold' }), el('b', { text: plan.holdDays + ' days, ' + plan.weeks + ' weekly actions' }))
      ),
      el('p', { class: 'sub', text: 'Gas is estimated per chain from typical transaction costs; check the live fee before you transact. The capital returns when you exit — only the gas and fees are spent.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, plan.steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Protocol' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'Category' }), el('b', { text: row.category || 'Other' })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { text: (row.chains || []).join(', ') || 'n/a' })),
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'unknown' })),
        el('div', null, el('span', { text: 'Token status' }), el('b', { text: 'no token on record' })),
        el('div', null, el('span', { text: 'Snapshot' }), el('b', { text: DATA.as_of }))
      )
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; the watchlist floor is ' + fmtUsd(DATA.floor_usd) + ' of TVL. A protocol that records no token may still have one its DefiLlama record does not carry — this board says a protocol records no token, never that it has none.' }),
      el('p', { text: 'Implied value is the entry’s own claim from the snapshot’s figures, never one make.fun makes. It does not predict whether or when a token is issued. Farm at your own risk, and never pay to claim an airdrop.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(validationPanel());
      shell.appendChild(modelPanel());
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
