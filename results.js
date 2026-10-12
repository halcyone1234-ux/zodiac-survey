/* 開獎：統計、圖表（Chart.js）、Excel 匯出（SheetJS） */
(function () {
  'use strict';
  const Z = window.ZS;
  const mount = (el, ...c) => window.ZSmount(el, ...c);

  /* ---------- 統計 ---------- */
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const numeric = (q, v) => (q.type === 'choice' ? null : (v === undefined || v === null || v === '' ? null : Number(v)));
  const isNum = (v) => v !== null && !Number.isNaN(v);
  const targetElement = (concept) => (concept === '愛家' ? '土' : concept === '浪漫' ? '水' : '');

  function compute(ctx) {
    const S = ctx.S;
    const rs = Z.toList(S.responses, 'at');
    const r1 = rs.filter((r) => r.round === 1);
    const qs = ctx.finalQuestions;
    const codeOf = (q, i) => 'Q' + (i + 1);
    /* ① 各題依元素 */
    const byElement = qs.map((q, i) => {
      const cells = {};
      Z.ELEMENTS.forEach((el) => {
        const vals = r1.filter((r) => r.element === el).map((r) => numeric(q, r.answers && r.answers[q.id])).filter(isNum);
        cells[el] = { mean: mean(vals), n: vals.length };
      });
      const all = r1.map((r) => numeric(q, r.answers && r.answers[q.id])).filter(isNum);
      const props = {};
      if (q.type === 'choice') {
        (q.options || []).forEach((o) => { props[o] = {}; Z.ELEMENTS.forEach((el) => { const sub = r1.filter((r) => r.element === el); props[o][el] = sub.length ? sub.filter((r) => r.answers && r.answers[q.id] === o).length / sub.length : null; }); });
      }
      return { q, code: codeOf(q, i), cells, overall: { mean: mean(all), n: all.length }, props, target: targetElement(q.concept) };
    });
    /* ② 同構面：比率題 vs 李克特題（各自 min–max 正規化後比較元素排序） */
    const dims = {};
    byElement.forEach((b) => { if (b.q.type === 'choice') return; (dims[b.q.dimId] = dims[b.q.dimId] || []).push(b); });
    const pairs = [];
    Object.keys(dims).forEach((dimId) => {
      const ratio = dims[dimId].filter((b) => b.q.type === 'ratio'); const lik = dims[dimId].filter((b) => b.q.type === 'likert');
      ratio.forEach((a) => lik.forEach((b) => pairs.push({ dimId, dimName: ctx.dimName(dimId), a, b, na: normalize(a), nb: normalize(b) })));
    });
    function normalize(b) {
      const vals = Z.ELEMENTS.map((el) => b.cells[el].mean).filter(isNum);
      const lo = Math.min(...vals), hi = Math.max(...vals); const out = {};
      Z.ELEMENTS.forEach((el) => { const m = b.cells[el].mean; out[el] = !isNum(m) ? null : hi === lo ? 0.5 : (m - lo) / (hi - lo); });
      return out;
    }
    /* ③ 自評 vs 代答 */
    const targets = [...new Set(rs.filter((r) => r.round === 2).map((r) => r.targetSign))];
    const selfProxy = targets.map((t) => {
      const selfRs = r1.filter((r) => r.mySign === t); const proxyRs = rs.filter((r) => r.round === 2 && r.targetSign === t);
      const rows = qs.map((q, i) => {
        const sv = selfRs.map((r) => numeric(q, r.answers && r.answers[q.id])).filter(isNum);
        const pv = proxyRs.map((r) => numeric(q, r.answers && r.answers[q.id])).filter(isNum);
        return { q, code: codeOf(q, i), self: { mean: mean(sv), n: sv.length }, proxy: { mean: mean(pv), n: pv.length } };
      });
      return { target: t, rows, nSelf: selfRs.length, nProxy: proxyRs.length, element: Z.signElement(t) };
    });
    /* ④ 相信程度 */
    const belief = Z.BELIEF.map((b) => {
      const counts = [1, 2, 3, 4, 5].map((v) => r1.filter((r) => r.answers && Number(r.answers[b.id]) === v).length);
      const n = counts.reduce((a, c) => a + c, 0);
      return { id: b.id, text: b.text, counts, n, mid: n ? counts[2] / n : 0 };
    });
    const nJoined = Object.keys(S.joined || {}).length;
    return { rs, r1, qs, byElement, pairs, selfProxy, belief, nJoined, nR1: r1.length };
  }

  /* ---------- 圖表 ---------- */
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const elColor = (el) => css({ 火: '--fire', 土: '--earth', 風: '--air', 水: '--water' }[el]);
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart; ctx.save();
      ctx.font = '600 11px ' + css('--body'); ctx.fillStyle = css('--text'); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const v = ds.data[i]; if (v === null || v === undefined) return;
          const label = ds.labels && ds.labels[i] !== undefined ? ds.labels[i] : (Math.round(v * 100) / 100).toString();
          if (chart.options.indexAxis === 'y') { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, bar.x + 4, bar.y); }
          else ctx.fillText(label, bar.x, bar.y - 3);
        });
      });
      ctx.restore();
    },
  };
  function barChart(canvas, labels, datasets, opts) {
    const o = opts || {};
    const grid = css('--line'); const muted = css('--muted');
    return new Chart(canvas, {
      type: 'bar', plugins: [valueLabels],
      data: { labels, datasets: datasets.map((d) => Object.assign({ borderRadius: 4, borderSkipped: 'start', barPercentage: 0.6, categoryPercentage: 0.6, borderWidth: 0 }, d)) },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: o.horizontal ? 'y' : 'x',
        layout: { padding: { top: 16, right: o.horizontal ? 36 : 4 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.dataset.label + '：' + (c.raw === null ? '–' : Math.round(c.raw * 100) / 100) + (c.dataset.ns ? '（n=' + c.dataset.ns[c.dataIndex] + '）' : '') } } },
        scales: {
          x: { grid: { display: o.horizontal, color: grid }, ticks: { color: muted, font: { size: 11 } }, min: o.horizontal ? o.min : undefined, max: o.horizontal ? o.max : undefined, border: { display: false } },
          y: { grid: { display: !o.horizontal, color: grid }, ticks: { color: muted, font: { size: 11 }, precision: 0 }, min: o.horizontal ? undefined : o.min, max: o.horizontal ? undefined : o.max, beginAtZero: true, border: { display: false } },
        },
      },
    });
  }
  function legend(h, items) { return h('div', { class: 'legend' }, items.map(([label, color]) => h('span', null, h('i', { style: 'background:' + color }), label))); }

  /* ---------- 畫面 ---------- */
  function render(root, ctx, opts) {
    const h = ctx.h, fmt = ctx.fmt; const R = compute(ctx); const board = opts && opts.board;
    const charts = [];
    const box = (cls) => { const c = h('canvas'); const b = h('div', { class: 'chart-box' + (cls ? ' ' + cls : '') }, c); return { b, c }; };
    const small = R.nR1 < 10;
    const sec = (title, sub, ...kids) => h('div', { class: 'card stack' }, h('div', null, h('h2', null, title), sub ? h('p', { class: 'muted', style: 'font-size:.9rem' }, sub) : null), ...kids);

    mount(root, h('div', { class: 'row' },
      h('span', { class: 'tag' }, '第一輪自評 n＝' + R.nR1), R.selfProxy.map((sp) => h('span', { class: 'tag' }, '代答 ' + sp.target + '座 n＝' + sp.nProxy)),
      small ? h('span', { class: 'tag', style: 'color:var(--warn);border-color:var(--warn)' }, 'N 很小：小樣本的平均值很會跳舞') : null,
    ));
    if (!R.qs.length || !R.nR1) { mount(root, h('div', { class: 'empty' }, '還沒有定稿題目或作答資料。')); return; }

    /* ① 元素分組 */
    const g1 = h('div', { class: 'board-grid' });
    R.byElement.forEach((b) => {
      if (b.q.type === 'choice') {
        mount(g1, h('div', { class: 'card flat stack' }, h('div', null, h('span', { class: 'q-code' }, b.code + ' '), b.q.text, ' ', h('span', { class: 'tag concept' }, b.q.concept)),
          h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, '選項'), Z.ELEMENTS.map((el) => h('th', { class: 'num' }, el + '象 (n=' + b.cells[el].n + ')')))),
            h('tbody', null, (b.q.options || []).map((o) => h('tr', null, h('td', null, o), Z.ELEMENTS.map((el) => h('td', { class: 'num' }, b.props[o][el] === null ? '–' : ctx.pct(b.props[o][el]))))))))));
        return;
      }
      const { b: bx, c } = box();
      const colors = Z.ELEMENTS.map((el) => elColor(el));
      mount(g1, h('div', { class: 'card flat stack' },
        h('div', null, h('span', { class: 'q-code' }, b.code + ' '), b.q.text, ' ', h('span', { class: 'tag concept' }, b.q.concept), ' ', h('span', { class: 'tag' }, ctx.qTypeDesc(b.q)), b.target ? h('span', { class: 'tag el-' + b.target }, '傳說預測：' + b.target + '象較高') : null),
        bx,
        h('p', { class: 'muted', style: 'font-size:.8rem' }, Z.ELEMENTS.map((el) => el + '象 n=' + b.cells[el].n).join('　') + '　全班平均 ' + fmt(b.overall.mean)),
      ));
      charts.push(() => barChart(c, Z.ELEMENTS.map((el) => el + '象'), [{ label: '平均', data: Z.ELEMENTS.map((el) => b.cells[el].mean), backgroundColor: colors, ns: Z.ELEMENTS.map((el) => b.cells[el].n), labels: Z.ELEMENTS.map((el) => (b.cells[el].n ? fmt(b.cells[el].mean, b.q.type === 'likert' ? 2 : 1) : '無資料')) }], { min: 0, max: b.q.type === 'likert' ? 5 : undefined }));
    });
    mount(root, sec('① 元素分組比較', '土象（金牛／處女／摩羯）的「愛家」分數，有沒有高於其他元素？水象的「浪漫」呢？看平均值差距，不只看誰高。', legend(h, Z.ELEMENTS.map((el) => [el + '象：' + Z.ELEMENT_SIGNS[el], elColor(el)])), g1));

    /* ② 比率 vs 李克特 */
    if (R.pairs.length) {
      const g2 = h('div', { class: 'board-grid' });
      R.pairs.forEach((p) => {
        const { b: bx, c } = box();
        mount(g2, h('div', { class: 'card flat stack' },
          h('div', null, h('b', null, '構面「' + p.dimName + '」'), h('div', { class: 'muted', style: 'font-size:.85rem' }, p.a.code + '（比率）' + p.a.q.text, h('br'), p.b.code + '（李克特）' + p.b.q.text)),
          bx,
        ));
        charts.push(() => barChart(c, Z.ELEMENTS.map((el) => el + '象'), [
          { label: p.a.code + ' 比率題', data: Z.ELEMENTS.map((el) => p.na[el]), backgroundColor: css('--s1'), labels: Z.ELEMENTS.map((el) => fmt(p.a.cells[el].mean, 1) + (p.a.q.unit ? '' : '')) },
          { label: p.b.code + ' 李克特', data: Z.ELEMENTS.map((el) => p.nb[el]), backgroundColor: css('--s2'), labels: Z.ELEMENTS.map((el) => fmt(p.b.cells[el].mean, 2)) },
        ], { min: 0, max: 1.15 }));
      });
      mount(root, sec('② 比率題 vs 李克特題', '同一構面、同一群人，兩種題的結論一致嗎？各題在四個元素間做 min–max 正規化（最高＝1、最低＝0），長條上標的是原始平均。行為與態度互證＝最陽春的收斂效度。', legend(h, [['比率題（行為）', css('--s1')], ['李克特題（態度）', css('--s2')]]), g2));
    } else {
      mount(root, sec('② 比率題 vs 李克特題', '沒有同一構面下同時有比率題與李克特題的組合，無法對照。'));
    }

    /* ③ 自評 vs 代答 */
    if (R.selfProxy.length) {
      const g3 = h('div', { class: 'stack' });
      R.selfProxy.forEach((sp) => {
        const lik = sp.rows.filter((r) => r.q.type === 'likert' && (isNum(r.self.mean) || isNum(r.proxy.mean)));
        const { b: bx, c } = box(lik.length > 4 ? 'tall' : '');
        mount(g3, h('div', { class: 'card flat stack' },
          h('div', { class: 'row between' }, h('h3', null, '目標星座：' + sp.target + '座（' + sp.element + '象）'), h('span', { class: 'muted', style: 'font-size:.85rem' }, '真' + sp.target + '自評 n＝' + sp.nSelf + '　代答 n＝' + sp.nProxy)),
          lik.length ? bx : null,
          h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, '題目'), h('th', { class: 'num' }, '真' + sp.target + '自評'), h('th', { class: 'num' }, '大家代答'), h('th', { class: 'num' }, '代答−自評'))),
            h('tbody', null, sp.rows.filter((r) => r.q.type !== 'choice').map((r) => h('tr', null, h('td', null, h('span', { class: 'q-code' }, r.code + ' '), r.q.text, h('span', { class: 'muted' }, r.q.unit ? '（' + r.q.unit + '）' : '')),
              h('td', { class: 'num' }, fmt(r.self.mean) + ' (' + r.self.n + ')'), h('td', { class: 'num' }, fmt(r.proxy.mean) + ' (' + r.proxy.n + ')'),
              h('td', { class: 'num', style: isNum(r.self.mean) && isNum(r.proxy.mean) && r.proxy.mean > r.self.mean ? 'color:var(--s2);font-weight:600' : '' }, isNum(r.self.mean) && isNum(r.proxy.mean) ? (r.proxy.mean - r.self.mean > 0 ? '+' : '') + fmt(r.proxy.mean - r.self.mean) : '–')))))),
        ));
        if (lik.length) charts.push(() => barChart(c, lik.map((r) => r.code), [
          { label: '真' + sp.target + '自評', data: lik.map((r) => r.self.mean), backgroundColor: css('--s1'), ns: lik.map((r) => r.self.n) },
          { label: '大家代答', data: lik.map((r) => r.proxy.mean), backgroundColor: css('--s2'), ns: lik.map((r) => r.proxy.n) },
        ], { horizontal: true, min: 0, max: 5 }));
      });
      mount(root, sec('③ 自評 vs 代答', '「真金牛的自評」跟「大家代答的金牛」，哪邊比較愛家？這格先看著，別急著解釋。圖只畫李克特題（同 1–5 尺度），比率題看表。', legend(h, [['自評（行為）', css('--s1')], ['代答（印象）', css('--s2')]]), g3));
    } else {
      mount(root, sec('③ 自評 vs 代答', '還沒有第二輪（代答）的資料。'));
    }

    /* ④ 相信程度 */
    if (ctx.session.belief.enabled && R.belief.some((b) => b.n)) {
      const { b: bx, c } = box();
      const midAll = R.belief.reduce((a, b) => a + b.counts[2], 0) / Math.max(1, R.belief.reduce((a, b) => a + b.n, 0));
      mount(root, sec('④ 星座相信程度 B1–B3', '如果三題全班都擠在 3 分：趨中傾向現場直播。該不該改用 4 點量表逼大家選邊？',
        legend(h, R.belief.map((b, i) => [b.id + ' ' + b.text, [css('--s1'), css('--s2'), css('--earth')][i]])), bx,
        h('p', { class: 'muted', style: 'font-size:.85rem' }, '選 3 分的比例：' + ctx.pct(midAll) + (midAll >= 0.5 ? '　← 一半以上選「普通」' : '')),
      ));
      charts.push(() => barChart(c, ['1', '2', '3', '4', '5'], R.belief.map((b, i) => ({ label: b.id, data: b.counts, backgroundColor: [css('--s1'), css('--s2'), css('--earth')][i] })), { min: 0 }));
    }

    /* 下載 */
    mount(root, h('div', { class: 'card stack' }, h('h2', null, '下載全班資料'), h('p', { class: 'muted', style: 'font-size:.9rem' }, 'Excel 含題目、投票、原始作答（寬表與長表）、構面表與摘要。匿名，只有星座與組別。'),
      h('button', { class: 'primary', onclick: () => downloadExcel(ctx) }, '下載 Excel（.xlsx）')));

    /* 畫圖（等 DOM 進入文件後） */
    requestAnimationFrame(() => charts.forEach((f) => { try { f(); } catch (e) { console.error(e); } }));
  }

  /* ---------- Excel ---------- */
  function downloadExcel(ctx) {
    if (!window.XLSX) return alert('Excel 模組尚未載入，請稍後再試。');
    const S = ctx.S; const R = compute(ctx); const codes = ctx.codes;
    const ts = (t) => (t ? new Date(t).toLocaleString('zh-TW', { hour12: false }) : '');
    const wb = XLSX.utils.book_new();
    const sheet = (name, rows) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '（無資料）': '' }]); XLSX.utils.book_append_sheet(wb, ws, name); };
    /* 題目 */
    sheet('題目', ctx.questions.map((q) => { const st = ctx.voteStats(q.id); return {
      代碼: codes[q.id], 題目: q.text, 概念: q.concept, 構面: ctx.dimName(q.dimId), 題型: ctx.qTypeDesc(q), 單位或選項: q.type === 'choice' ? (q.options || []).join('／') : q.unit || (q.anchors ? '1=' + q.anchors.low + '，5=' + q.anchors.high : ''),
      出題者: q.by || '', 用了哪一招: (q.techniques || []).join('；'), 版本: q.version || 1,
      列入問卷: S.survey && S.survey.included && S.survey.included[q.id] ? '是' : '否', 列入票: st.ok, 不列入票: st.no, 同意率: st.n ? Math.round(st.rate * 100) / 100 : '',
      開刀標籤: Object.entries(st.tags).map(([t, n]) => t + '×' + n).join('；'), 講評: st.notes.join('；'),
    }; }));
    /* 作答寬表 */
    const finalQs = R.qs;
    sheet('作答_寬表', R.rs.map((r) => {
      const row = { 作答ID: r.id, 輪次: r.round, 代答星座: r.targetSign || '', 自己星座: r.mySign, 元素: r.element, 時間: ts(r.at) };
      finalQs.forEach((q, i) => { row['Q' + (i + 1) + ' ' + q.text] = r.answers ? r.answers[q.id] ?? '' : ''; });
      Z.BELIEF.forEach((b) => { row[b.id + ' ' + b.text] = r.answers ? r.answers[b.id] ?? '' : ''; });
      return row;
    }));
    /* 作答長表 */
    const long = [];
    R.rs.forEach((r) => {
      finalQs.forEach((q, i) => long.push({ 作答ID: r.id, 輪次: r.round, 代答星座: r.targetSign || '', 自己星座: r.mySign, 元素: r.element, 題目代碼: 'Q' + (i + 1), 題目: q.text, 答案: r.answers ? r.answers[q.id] ?? '' : '' }));
      Z.BELIEF.forEach((b) => long.push({ 作答ID: r.id, 輪次: r.round, 代答星座: r.targetSign || '', 自己星座: r.mySign, 元素: r.element, 題目代碼: b.id, 題目: b.text, 答案: r.answers ? r.answers[b.id] ?? '' : '' }));
    });
    sheet('作答_長表', long);
    /* 投票 */
    const votes = [];
    ctx.questions.forEach((q) => Object.entries((S.votes || {})[q.id] || {}).forEach(([dev, v]) => votes.push({ 題目代碼: codes[q.id], 題目: q.text, 投票者: v.by || dev.slice(0, 8), 列入: v.ok === true ? '是' : v.ok === false ? '否' : '', 七宗罪: (v.sins || []).join('；'), 四把刀: (v.knives || []).join('；'), 講評: v.note || '' })));
    sheet('投票紀錄', votes);
    /* 構面表 */
    sheet('構面表', Z.toList(S.dimensions, 'at').map((d) => ({ 概念: d.concept, 構面: d.name, 指標: d.indicators || '', 提出者: d.by || '' })));
    /* 摘要 */
    const sum = [];
    R.byElement.forEach((b) => { if (b.q.type === 'choice') return; const row = { 題目代碼: b.code, 題目: b.q.text, 概念: b.q.concept, 題型: ctx.qTypeDesc(b.q) }; Z.ELEMENTS.forEach((el) => { row[el + '象平均'] = b.cells[el].mean === null ? '' : Math.round(b.cells[el].mean * 100) / 100; row[el + '象n'] = b.cells[el].n; }); row['全班平均'] = b.overall.mean === null ? '' : Math.round(b.overall.mean * 100) / 100; sum.push(row); });
    R.selfProxy.forEach((sp) => sp.rows.forEach((r) => { if (r.q.type === 'choice') return; sum.push({ 題目代碼: r.code, 題目: r.q.text, 概念: r.q.concept, 題型: '自評 vs 代答（' + sp.target + '）', 真星座自評平均: r.self.mean === null ? '' : Math.round(r.self.mean * 100) / 100, 自評n: r.self.n, 代答平均: r.proxy.mean === null ? '' : Math.round(r.proxy.mean * 100) / 100, 代答n: r.proxy.n }); }));
    sheet('摘要', sum);
    sheet('進場名單', Z.toList(S.joined, 'at').map((j) => ({ ID: j.id || '', 星座: j.sign, 元素: j.element, 進場時間: ts(j.at) })));
    const d = new Date(); const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, '星座問卷_' + Z.classId + '_' + stamp + '.xlsx');
  }

  window.ZSR = { render, downloadExcel, compute };
})();
