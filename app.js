/* 星座問卷工作坊：路由與各畫面 */
(function () {
  'use strict';
  const Z = window.ZS;
  const B = Z.backend;
  const LS = Z.LS;

  /* ---------- 共用狀態 ---------- */
  const S = { session: null, dimensions: null, questions: null, votes: null, survey: null, responses: null, joined: null };
  const me = {
    id: LS.get('zs.id', ''),
    sign: LS.get('zs.sign', ''),
    pin: LS.get('zs.pin', ''),
  };
  const session = () => Object.assign({}, Z.DEFAULT_SESSION, S.session || {});
  const concepts = () => { const c = session().concepts; return Array.isArray(c) && c.length ? c : Z.DEFAULT_SESSION.concepts; };
  const isAdmin = () => me.pin === Z.adminPin;

  /* ---------- DOM 小工具 ---------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v);
    }
    mount(el, children);
    return el;
  }
  /* 跟 h() 一樣會略過 null／false，並展開陣列 */
  function mount(el, ...children) {
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    };
    children.forEach(add); return el;
  }
  window.ZSmount = mount;
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? '–' : Number(n).toFixed(d));
  const pct = (x) => Math.round(x * 100) + '%';

  /* ---------- 題目相關 ---------- */
  function questionList() { return Z.toList(S.questions, 'at'); }
  function dimList() { return Z.toList(S.dimensions, 'at'); }
  function dimName(id) { const d = S.dimensions && S.dimensions[id]; return d ? d.name : '（未指定構面）'; }
  const isMine = (obj) => !!obj && (obj.deviceId === Z.deviceId || (!!me.id && obj.by === me.id));
  /* 題目代碼：定稿後依 survey.order，否則依出題順序 */
  function qCodes() {
    const map = {};
    const order = (S.survey && S.survey.order) || questionList().map((q) => q.id);
    let i = 1;
    order.forEach((id) => { if (S.questions && S.questions[id]) map[id] = 'Q' + i++; });
    questionList().forEach((q) => { if (!map[q.id]) map[q.id] = 'Q' + i++; });
    return map;
  }
  function voteStats(qid) {
    const v = (S.votes && S.votes[qid]) || {};
    const list = Object.values(v);
    const ok = list.filter((x) => x.ok === true).length;
    const no = list.filter((x) => x.ok === false).length;
    const tags = {};
    list.forEach((x) => [].concat(x.sins || [], x.knives || []).forEach((t) => { tags[t] = (tags[t] || 0) + 1; }));
    const notes = list.filter((x) => x.note).map((x) => ({ note: x.note, by: x.by || '' }));
    return { ok, no, n: ok + no, rate: ok + no ? ok / (ok + no) : 0, tags, notes };
  }
  function suggestedIncluded() {
    const s = session(); const inc = {};
    questionList().forEach((q) => { const st = voteStats(q.id); inc[q.id] = st.n >= s.minVotes && st.rate >= s.voteThreshold; });
    return inc;
  }
  function qTypeDesc(q) {
    if (q.type === 'ratio') return '比率題' + (q.unit ? '（' + q.unit + '）' : '');
    if (q.type === 'likert') return '李克特 1–5';
    return '單選題';
  }
  function finalQuestions() {
    if (!S.survey || !S.survey.order) return [];
    return S.survey.order.filter((id) => S.questions && S.questions[id] && S.survey.included && S.survey.included[id]).map((id) => Object.assign({ id }, S.questions[id]));
  }
  function respId(round, target) { return Z.deviceId + '_r' + round + '_' + (round === 2 ? target : 'self'); }
  const joinedList = () => Z.toList(S.joined, 'at');

  /* ---------- 共用元件 ---------- */
  function signChips(selected, onPick) {
    return h('div', { class: 'chips' }, Z.SIGNS.map((s) => h('button', {
      type: 'button', class: 'chip' + (selected === s.name ? ' on' : ''), onclick: () => onPick(s.name),
    }, s.name + '座')));
  }
  function likertInput(name, value, anchors, onChange) {
    const a = anchors || { low: '非常不同意', high: '非常同意' };
    return h('div', { class: 'likert' }, [1, 2, 3, 4, 5].map((v) => h('label', null,
      h('input', { type: 'radio', name, value: v, checked: value === v, onchange: () => onChange(v) }),
      h('span', { class: 'num' }, v),
      h('span', { class: 'anchor' }, v === 1 ? a.low : v === 5 ? a.high : ' '),
    )));
  }
  function questionCard(q, code, extra) {
    return h('div', { class: 'card q-card' },
      h('div', { class: 'q-head' }, h('span', { class: 'q-code' }, code), h('span', { class: 'q-text' }, q.text), q.version > 1 ? h('span', { class: 'tag' }, 'v' + q.version) : null),
      h('div', { class: 'q-meta' },
        h('span', { class: 'tag concept' }, q.concept), h('span', { class: 'tag' }, dimName(q.dimId)), h('span', { class: 'tag' }, qTypeDesc(q)),
        q.by ? h('span', { class: 'tag' }, '出題：' + q.by) : null,
        (q.techniques || []).map((t) => h('span', { class: 'tag' }, '招：' + t.split('（')[0])),
      ),
      q.type === 'choice' && q.options ? h('div', { class: 'muted', style: 'font-size:.9rem' }, '選項：' + q.options.join('／')) : null,
      q.type === 'likert' && q.anchors ? h('div', { class: 'muted', style: 'font-size:.9rem' }, '1＝' + q.anchors.low + '，5＝' + q.anchors.high) : null,
      extra || null,
    );
  }
  function needJoin(root) {
    mount(root, h('div', { class: 'notice warn' }, '你還沒進場。請先回「進場」輸入 ID 與星座。 ', h('a', { href: '#join' }, '前往進場')));
  }

  /* ---------- 畫面：進場 ---------- */
  function viewJoin(root) {
    let sign = me.sign, id = me.id;
    const joined = () => S.joined && S.joined[Z.deviceId];
    const idTaken = (clean) => joinedList().some((j) => j.id === clean && j.id !== (joined() || {}).id);
    function render() {
      clear(root);
      const s = session();
      mount(root,
        h('div', { class: 'stack' },
          h('p', { class: 'eyebrow' }, '量化研究法（上）第 6 週'),
          h('h1', null, '金牛座真的愛家嗎？'),
          h('p', { class: 'muted' }, '今天由你們設計那把尺。進場後，老師推進每個階段，你的手機畫面會自動切換。出題與互評會顯示你的 ID；問卷作答一律匿名，只記星座。'),
        ),
        h('div', { class: 'card stack' },
          h('h2', null, '你的 ID'),
          h('label', { class: 'field' }, h('span', null, '暱稱或代號（投影與 Excel 會顯示）'),
            h('input', { type: 'text', id: 'join-id', maxlength: 20, placeholder: '例：小鹿', value: id, oninput: (e) => { id = e.target.value; } })),
        ),
        h('div', { class: 'card stack' },
          h('h2', null, '你的星座（太陽星座）'),
          signChips(sign, (v) => { sign = v; render(); }),
        ),
        h('button', { class: 'primary block', disabled: !sign, onclick: () => {
          const clean = id.trim();
          if (!clean) return toast('請輸入 ID');
          if (idTaken(clean)) return toast('這個 ID 已有人使用，換一個吧');
          me.sign = sign; me.id = clean; LS.set('zs.sign', sign); LS.set('zs.id', clean);
          B.set('joined/' + Z.deviceId, { id: clean, sign, element: Z.signElement(sign), at: joined() ? joined().at : B.now() }).then(() => { toast('已進場'); render(); });
        } }, joined() ? '更新資料' : '進場'),
        joined() ? h('div', { class: 'notice' }, h('b', null, joined().id), '，已進場。目前階段：', h('b', null, Z.phaseOf(s.phase).label), s.phase === 'lobby' ? '，等老師開始構面表。' : '。') : null,
        h('div', { class: 'card flat' }, h('p', { class: 'muted', style: 'font-size:.85rem' }, '已進場 ', h('b', { class: 'num' }, joinedList().length), ' 人'),
          h('div', { class: 'chips', style: 'margin-top:6px' }, joinedList().map((j) => h('span', { class: 'tag el-' + j.element }, j.id + '・' + j.sign)))),
        h('p', { class: 'muted', style: 'font-size:.8rem' }, h('a', { href: '#board' }, '投影畫面'), ' ・ ', h('a', { href: '#admin' }, '老師控制台')),
      );
    }
    render();
    return () => { if (document.activeElement && document.activeElement.id === 'join-id') return; render(); };
  }

  /* ---------- 畫面：構面表 ---------- */
  function viewDims(root) {
    const draft = { concept: '', name: '', indicators: '' };
    function render() {
      clear(root);
      if (!me.id) { mount(root, h('h1', null, '構面表：把概念拆開')); needJoin(root); return; }
      const cs = concepts(); if (!draft.concept || !cs.includes(draft.concept)) draft.concept = cs[0];
      const dims = dimList();
      mount(root,
        h('div', { class: 'stack' },
          h('h1', null, '構面表：把概念拆開'),
          h('p', { class: 'muted' }, '概念 → 構面 → 指標。每一題都要答得出「這題在量哪個構面」，答不出來的題是裝飾品。全班共用一張表，大家一起填。'),
        ),
        cs.map((c) => {
          const list = dims.filter((d) => d.concept === c);
          return h('div', { class: 'card stack' },
            h('div', { class: 'row between' }, h('h2', null, '概念「' + c + '」'), h('span', { class: 'tag' }, list.length + ' 個構面')),
            list.length ? list.map((d, i) => h('div', { class: 'card flat' },
              h('div', { class: 'row between' }, h('b', null, '構面 ' + (i + 1) + '：' + d.name),
                h('span', { class: 'row', style: 'gap:6px' }, d.by ? h('span', { class: 'tag' }, d.by) : null, isMine(d) ? h('button', { class: 'small', onclick: () => B.remove('dimensions/' + d.id) }, '刪除') : null)),
              d.indicators ? h('p', { style: 'white-space:pre-wrap;font-size:.95rem' }, '指標：' + d.indicators) : h('p', { class: 'muted' }, '（還沒寫指標）'),
            )) : h('div', { class: 'empty' }, '還沒有構面。'),
          );
        }),
        h('div', { class: 'card stack highlight' },
          h('h3', null, '新增構面'),
          h('div', { class: 'field' }, h('span', { style: 'font-weight:600' }, '概念'),
            h('div', { class: 'chips' }, cs.map((c) => h('button', { type: 'button', class: 'chip' + (draft.concept === c ? ' on' : ''), onclick: () => { draft.concept = c; render(); } }, c)))),
          h('label', { class: 'field' }, h('span', null, '構面名稱'), h('input', { type: 'text', id: 'dim-name', placeholder: '例：時間投入', value: draft.name, oninput: (e) => { draft.name = e.target.value; } })),
          h('label', { class: 'field' }, h('span', null, '指標想法（有自然單位就直接量：次數、金額、天數）'), h('textarea', { id: 'dim-ind', placeholder: '例：每週與家人共餐次數・每天與家人交談分鐘數', value: draft.indicators, oninput: (e) => { draft.indicators = e.target.value; } })),
          h('button', { class: 'primary', onclick: () => {
            if (!draft.name.trim()) return toast('先寫構面名稱');
            B.push('dimensions', { concept: draft.concept, name: draft.name.trim(), indicators: draft.indicators.trim(), by: me.id, at: B.now(), deviceId: Z.deviceId })
              .then(() => { draft.name = ''; draft.indicators = ''; toast('已新增構面'); render(); });
          } }, '新增'),
        ),
        h('div', { class: 'notice' }, '邊填邊想：① 構面之間會不會重疊？② 有沒有漏掉重要面向（內容效度）？③ 每個指標能收比率就收比率。'),
      );
    }
    render();
    return () => { if (document.activeElement && ['dim-name', 'dim-ind'].includes(document.activeElement.id)) return; render(); };
  }

  /* ---------- 畫面：出題 ---------- */
  function viewPropose(root) {
    const blank = () => ({ id: null, concept: concepts()[0], text: '', type: 'likert', unit: '', options: '', anchors: { low: '非常不同意', high: '非常同意' }, dimId: '', newDim: '', techniques: [], version: 1 });
    let d = blank();
    const formBox = h('div', { class: 'card stack' });
    const listBox = h('div', { class: 'stack' });
    mount(root,
      h('div', { class: 'stack' }, h('h1', null, '出題：把構面變成題目'), h('p', { class: 'muted' }, '每人至少出 1 題，全班目標 8–12 題，比率題與李克特題都要有。每題都要掛在一個構面下（追問測試）。')),
      formBox, listBox,
    );
    function renderForm() {
      clear(formBox);
      if (!me.id) { needJoin(formBox); return; }
      const cs = concepts(); if (!cs.includes(d.concept)) d.concept = cs[0];
      const dims = dimList().filter((x) => x.concept === d.concept);
      const typeRadio = (t, label) => h('label', null, h('input', { type: 'radio', name: 'qtype', value: t, checked: d.type === t, onchange: () => { d.type = t; renderForm(); } }), ' ' + label);
      mount(formBox,
        h('div', { class: 'row between' }, h('h2', null, d.id ? '修題（版本 ' + (d.version) + '）' : '新題目'), h('span', { class: 'tag' }, '出題：' + me.id)),
        h('div', { class: 'field' }, h('span', { style: 'font-weight:600' }, '概念'),
          h('div', { class: 'chips' }, cs.map((c) => h('button', { type: 'button', class: 'chip' + (d.concept === c ? ' on' : ''), onclick: () => { d.concept = c; d.dimId = ''; renderForm(); } }, c)))),
        h('label', { class: 'field' }, h('span', null, '這題在量哪個構面？'),
          h('select', { id: 'q-dim', onchange: (e) => { d.dimId = e.target.value; renderForm(); } },
            h('option', { value: '', selected: !d.dimId }, '－ 請選擇 －'),
            dims.map((x) => h('option', { value: x.id, selected: d.dimId === x.id }, x.name)),
            h('option', { value: '__new', selected: d.dimId === '__new' }, '＋ 新增一個構面'),
          )),
        d.dimId === '__new' ? h('label', { class: 'field' }, h('span', null, '新構面名稱'), h('input', { type: 'text', value: d.newDim, oninput: (e) => { d.newDim = e.target.value; } })) : null,
        h('label', { class: 'field' }, h('span', null, '題目（唸出聲一次：會卡、會笑、會想反問的，都有罪）'),
          h('textarea', { id: 'q-text', value: d.text, placeholder: '例：過去一週，你和家人一起吃飯幾次？', oninput: (e) => { d.text = e.target.value; } })),
        h('div', { class: 'field' }, h('span', { style: 'font-weight:600' }, '題型'),
          h('div', { class: 'row', style: 'gap:16px' }, typeRadio('ratio', '比率題（填數字）'), typeRadio('likert', '李克特 1–5'), typeRadio('choice', '單選題'))),
        d.type === 'ratio' ? h('label', { class: 'field' }, h('span', null, '單位'), h('input', { type: 'text', value: d.unit, placeholder: '例：次／週、元／月、分鐘／天', oninput: (e) => { d.unit = e.target.value; } })) : null,
        d.type === 'likert' ? h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', null, '1 分的錨點'), h('input', { type: 'text', value: d.anchors.low, oninput: (e) => { d.anchors.low = e.target.value; } })),
          h('label', { class: 'field' }, h('span', null, '5 分的錨點'), h('input', { type: 'text', value: d.anchors.high, oninput: (e) => { d.anchors.high = e.target.value; } })),
        ) : null,
        d.type === 'choice' ? h('label', { class: 'field' }, h('span', null, '選項（一行一個；要互斥且窮盡，記得留「其他」）'), h('textarea', { value: d.options, placeholder: '家庭聚會\n朋友邀約\n看情況\n其他', oninput: (e) => { d.options = e.target.value; } })) : null,
        h('div', { class: 'field' }, h('span', { style: 'font-weight:600' }, '用了哪一招？（上週問卷的工具箱，可複選）'),
          h('div', { class: 'chips' }, Z.TECHNIQUES.map((t) => h('button', { type: 'button', class: 'chip' + (d.techniques.includes(t) ? ' on' : ''), onclick: () => {
            d.techniques = d.techniques.includes(t) ? d.techniques.filter((x) => x !== t) : d.techniques.concat(t); renderForm();
          } }, t)))),
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: submit }, d.id ? '儲存修題' : '送出題目'),
          d.id ? h('button', { onclick: () => { d = blank(); renderForm(); } }, '取消') : null,
        ),
      );
    }
    async function submit() {
      if (!d.text.trim()) return toast('題目還沒寫');
      if (!d.dimId) return toast('請選構面（追問測試）');
      let dimId = d.dimId;
      if (dimId === '__new') {
        if (!d.newDim.trim()) return toast('請寫新構面名稱');
        dimId = await B.push('dimensions', { concept: d.concept, name: d.newDim.trim(), indicators: '', by: me.id, at: B.now(), deviceId: Z.deviceId });
      }
      const q = {
        concept: d.concept, dimId, text: d.text.trim(), type: d.type, by: me.id,
        unit: d.type === 'ratio' ? d.unit.trim() : '',
        anchors: d.type === 'likert' ? { low: d.anchors.low.trim() || '非常不同意', high: d.anchors.high.trim() || '非常同意' } : null,
        options: d.type === 'choice' ? d.options.split('\n').map((x) => x.trim()).filter(Boolean) : null,
        techniques: d.techniques, version: d.id ? (d.version || 1) + 1 : 1, deviceId: Z.deviceId,
      };
      if (q.type === 'choice' && (!q.options || q.options.length < 2)) return toast('單選題至少兩個選項');
      if (d.id) { q.at = d.at; q.updatedAt = B.now(); await B.update('questions/' + d.id, q); toast('已修題'); }
      else { q.at = B.now(); await B.push('questions', q); toast('已送出'); }
      d = blank(); renderForm();
    }
    function renderList() {
      clear(listBox);
      const codes = qCodes();
      const all = questionList();
      const mine = all.filter((q) => isMine(q));
      const others = all.filter((q) => !isMine(q));
      mount(listBox,
        h('h2', null, '我出的題目（' + mine.length + '）'),
        mine.length ? mine.map((q) => questionCard(q, codes[q.id], h('div', { class: 'row' },
          h('button', { class: 'small', onclick: () => {
            d = { id: q.id, at: q.at, concept: q.concept, text: q.text, type: q.type, unit: q.unit || '', options: (q.options || []).join('\n'), anchors: q.anchors || { low: '非常不同意', high: '非常同意' }, dimId: q.dimId, newDim: '', techniques: q.techniques || [], version: q.version || 1 };
            renderForm(); window.scrollTo({ top: 0, behavior: 'smooth' });
          } }, '修題'),
          h('button', { class: 'small danger', onclick: () => B.remove('questions/' + q.id).then(() => toast('已刪除')) }, '刪除'),
        ))) : h('div', { class: 'empty' }, '還沒有題目。'),
        h('details', null, h('summary', null, '大家的題目（' + others.length + '）'), h('div', { class: 'stack', style: 'margin-top:8px' }, others.map((q) => questionCard(q, codes[q.id])))),
        h('div', { class: 'notice' }, '交卷前自我健檢：□ 每題通過追問測試　□ 全班至少 1 題比率、1 題李克特　□ 七宗罪掃描通過　□ 用上上週問卷的招　□ 敏感題已匿名／置後'),
      );
    }
    renderForm(); renderList();
    let lastDims = dimList().length;
    return () => {
      renderList();
      if (dimList().length !== lastDims || (me.id && !formBox.querySelector('#q-dim'))) { lastDims = dimList().length; renderForm(); }
    };
  }

  /* ---------- 畫面：健檢互評 ---------- */
  function viewVote(root) {
    const noteTimers = {};
    function myVote(qid) { return (S.votes && S.votes[qid] && S.votes[qid][Z.deviceId]) || null; }
    function save(qid, patch) {
      const cur = myVote(qid) || { ok: null, sins: [], knives: [], note: '' };
      const next = Object.assign({}, cur, patch, { by: me.id, at: B.now() });
      return B.set('votes/' + qid + '/' + Z.deviceId, next);
    }
    function render() {
      clear(root);
      const codes = qCodes();
      const all = questionList();
      const done = all.filter((q) => { const v = myVote(q.id); return v && v.ok !== null && v.ok !== undefined; }).length;
      mount(root,
        h('div', { class: 'stack' },
          h('h1', null, '指標健檢：互評時間'),
          h('p', { class: 'muted' }, '逐題決定要不要列入問卷，順手用七宗罪與四把刀開刀。票數只有投影畫面看得到；講評會附上你的 ID。'),
          h('div', { class: 'notice' }, '已評 ', h('b', { class: 'num' }, done), ' / ', h('span', { class: 'num' }, all.length), ' 題'),
        ),
        !me.id ? h('div', { class: 'notice warn' }, '你還沒進場，投票不會記名。', h('a', { href: '#join' }, '前往進場')) : null,
        all.length ? all.map((q) => {
          const v = myVote(q.id) || { ok: null, sins: [], knives: [], note: '' };
          const chip = (t, kind) => {
            const arr = kind === 'sins' ? (v.sins || []) : (v.knives || []);
            return h('button', { type: 'button', class: 'chip ' + (kind === 'sins' ? 'sin' : 'knife') + (arr.includes(t) ? ' on' : ''), onclick: () => {
              const next = arr.includes(t) ? arr.filter((x) => x !== t) : arr.concat(t);
              save(q.id, { [kind]: next });
            } }, t);
          };
          return questionCard(q, codes[q.id], h('div', { class: 'stack' },
            isMine(q) ? h('span', { class: 'tag' }, '我出的題') : null,
            h('div', { class: 'vote-bar' },
              h('button', { class: v.ok === true ? 'on-ok' : '', onclick: () => save(q.id, { ok: true }) }, '👍 列入'),
              h('button', { class: v.ok === false ? 'on-no' : '', onclick: () => save(q.id, { ok: false }) }, '👎 不列入'),
            ),
            h('details', { open: (v.sins || []).length + (v.knives || []).length > 0 || !!v.note },
              h('summary', null, '開刀（七宗罪・四把刀・講評）'),
              h('div', { class: 'stack', style: 'margin-top:8px' },
                h('div', { class: 'chips' }, Z.SINS.map((t) => chip(t, 'sins'))),
                h('div', { class: 'chips' }, Z.KNIVES.map((t) => chip(t, 'knives'))),
                h('input', { type: 'text', placeholder: '一句講評（選填）', value: v.note || '', oninput: (e) => {
                  clearTimeout(noteTimers[q.id]); const val = e.target.value;
                  noteTimers[q.id] = setTimeout(() => save(q.id, { note: val }), 600);
                } }),
              )),
          ));
        }) : h('div', { class: 'empty' }, '還沒有題目可評。'),
      );
    }
    render();
    /* 重新渲染會打斷正在輸入的講評，所以只在非輸入狀態時重繪 */
    return () => { if (document.activeElement && document.activeElement.tagName === 'INPUT' && root.contains(document.activeElement)) return; render(); };
  }

  /* ---------- 畫面：作答 ---------- */
  function viewSurvey(root) {
    let answers = {}; let sign = me.sign; let lastKey = '';
    function render() {
      const s = session();
      const key = s.phase + '|' + s.round.n + '|' + s.round.targetSign;
      if (key !== lastKey) { answers = {}; lastKey = key; }
      clear(root);
      if (s.phase === 'finalize') { mount(root, h('div', { class: 'stack' }, h('h1', null, '老師定稿中'), h('div', { class: 'empty' }, '問卷正在定稿，馬上開始作答。'))); return; }
      if (s.phase !== 'survey') {
        mount(root, h('div', { class: 'stack' }, h('h1', null, '作答'), h('div', { class: 'empty' }, s.phase === 'results' ? '作答已結束，看開獎！' : '尚未開放作答，等老師定稿。')));
        return;
      }
      const qs = finalQuestions();
      const round = s.round.n; const target = s.round.targetSign;
      const rid = respId(round, target);
      const existing = S.responses && S.responses[rid];
      if (existing && !answers.__editing) {
        mount(root, h('div', { class: 'stack' }, h('h1', null, '已送出，謝謝'), h('div', { class: 'notice' }, round === 1 ? '第一輪（自評）' : '第二輪（代答・' + target + '座）', '已收到你的作答。等待老師開獎。'),
          h('button', { onclick: () => { answers = Object.assign({ __editing: true }, existing.answers); sign = existing.mySign; render(); } }, '修改我的作答')));
        return;
      }
      const beliefBlock = s.belief.enabled ? h('div', { class: 'card stack' },
        h('h2', null, '星座相信程度'),
        Z.BELIEF.map((b) => h('div', { class: 'stack', style: 'gap:6px' }, h('p', null, h('b', null, b.id + '　'), b.text), likertInput('a_' + b.id, answers[b.id], null, (v) => { answers[b.id] = v; }))),
      ) : null;
      mount(root,
        h('div', { class: 'stack' },
          h('p', { class: 'eyebrow' }, round === 1 ? '第一輪：自評' : '第二輪：代答'),
          h('h1', null, round === 1 ? '以「自己」作答' : '想一位你具體認識的「' + target + '座」朋友'),
          h('p', { class: 'muted' }, round === 1 ? '照你自己的實際行為與想法回答。這一輪匿名，只記星座，不記 ID。' : '以那位朋友的實際行為作答，不是「你覺得' + target + '座應該怎樣」。匿名。'),
        ),
        h('div', { class: 'card stack' },
          h('h2', null, round === 1 ? '你的星座' : '你自己的星座'),
          signChips(sign, (v) => { sign = v; render(); }),
        ),
        s.belief.position === 'start' ? beliefBlock : null,
        qs.length ? qs.map((q, i) => h('div', { class: 'card q-card' },
          h('div', { class: 'q-head' }, h('span', { class: 'q-code' }, 'Q' + (i + 1)), h('span', { class: 'q-text' }, q.text)),
          q.type === 'ratio' ? h('div', { class: 'ratio-input' }, h('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', value: answers[q.id] ?? '', oninput: (e) => { answers[q.id] = e.target.value === '' ? undefined : Number(e.target.value); } }), h('span', { class: 'muted' }, q.unit || '')) :
          q.type === 'likert' ? likertInput('a_' + q.id, answers[q.id], q.anchors, (v) => { answers[q.id] = v; }) :
          h('div', { class: 'choices' }, (q.options || []).map((o) => h('label', null, h('input', { type: 'radio', name: 'a_' + q.id, checked: answers[q.id] === o, onchange: () => { answers[q.id] = o; } }), o))),
        )) : h('div', { class: 'empty' }, '問卷沒有題目。'),
        s.belief.position !== 'start' ? beliefBlock : null,
        h('button', { class: 'primary block', onclick: () => {
          if (!sign) return toast('請選你的星座');
          const missing = qs.filter((q) => answers[q.id] === undefined || answers[q.id] === '' || Number.isNaN(answers[q.id]));
          if (missing.length) return toast('還有 ' + missing.length + ' 題沒答');
          if (s.belief.enabled && Z.BELIEF.some((b) => !answers[b.id])) return toast('星座相信程度三題還沒答完');
          const clean = {}; qs.forEach((q) => { clean[q.id] = answers[q.id]; }); Z.BELIEF.forEach((b) => { if (answers[b.id]) clean[b.id] = answers[b.id]; });
          B.set('responses/' + rid, { round, targetSign: round === 2 ? target : '', mySign: sign, element: Z.signElement(sign), answers: clean, deviceId: Z.deviceId, at: B.now() })
            .then(() => { answers = {}; toast('已送出'); render(); });
        } }, '送出'),
      );
    }
    render();
    return () => {
      const s = session(); const key = s.phase + '|' + s.round.n + '|' + s.round.targetSign;
      if (key !== lastKey) return render();
      /* 作答中不重繪，避免打斷；只在尚未開始作答時更新 */
      if (!Object.keys(answers).length) render();
    };
  }

  /* ---------- 畫面：開獎 ---------- */
  function viewResults(root) {
    function render() {
      clear(root);
      const s = session();
      if (!s.resultsOpen && !isAdmin()) {
        mount(root, h('div', { class: 'stack' }, h('h1', null, '開獎'), h('div', { class: 'empty' }, '老師還沒開放結果。先看投影畫面。')));
        return;
      }
      mount(root, h('div', { class: 'stack' }, h('h1', null, '立刻開獎：看三件事'), h('p', { class: 'muted' }, 'N 很小，一個人換邊站就能翻盤。差距小＝看不出來，不是「證明沒差」。')));
      window.ZSR.render(root, buildCtx(), { board: false });
    }
    render();
    return render;
  }
  function buildCtx() {
    return { S, session: session(), questions: questionList(), finalQuestions: finalQuestions(), codes: qCodes(), dimName, voteStats, qTypeDesc, h, fmt, pct };
  }

  /* ---------- 畫面：投影 ---------- */
  function viewBoard(root) {
    document.querySelector('main').classList.add('wide'); root.classList.add('board');
    let qrDone = false; const qrHolder = h('div', { class: 'qr-box' });
    function qr(size) {
      if (!window.QRCode) return;
      clear(qrHolder); new QRCode(qrHolder, { text: Z.siteUrl(), width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
      mount(qrHolder, h('p', { class: 'muted', style: 'font-size:.9rem;word-break:break-all' }, Z.siteUrl()));
    }
    function render() {
      clear(root);
      const s = session(); const codes = qCodes(); const cs = concepts();
      const joined = joinedList();
      mount(root, h('div', { class: 'row between' },
        h('div', null, h('p', { class: 'eyebrow' }, '問卷設計：星座的傳說'), h('h1', null, Z.phaseOf(s.phase).label)),
        h('div', { class: 'row' }, h('span', { class: 'phase-pill live' }, '已進場 ' + joined.length + ' 人'), h('a', { class: 'btn small', href: '#admin' }, '控制台')),
      ));
      if (s.phase === 'lobby') {
        const byEl = {}; joined.forEach((j) => { byEl[j.element] = (byEl[j.element] || 0) + 1; });
        mount(root, h('div', { class: 'board-grid' },
          h('div', { class: 'card', style: 'display:grid;place-items:center' }, qrHolder),
          h('div', { class: 'card stack' },
            h('h2', null, '掃碼進場'), h('div', { class: 'big num' }, joined.length), h('p', { class: 'muted' }, '人已進場'),
            h('div', { class: 'row' }, Z.ELEMENTS.map((e) => h('span', { class: 'tag el-' + e }, e + '象 ' + (byEl[e] || 0)))),
            h('div', { class: 'chips' }, joined.map((j) => h('span', { class: 'tag el-' + j.element, style: 'font-size:1rem' }, j.id + '・' + j.sign))),
          ),
        ));
        if (!qrDone) { qr(260); qrDone = true; }
        return;
      }
      if (s.phase === 'dimensions' || s.phase === 'propose') {
        const dims = dimList(); const qs = questionList();
        mount(root, h('div', { class: 'board-grid' }, cs.map((c) => h('div', { class: 'card stack' },
          h('div', { class: 'row between' }, h('h2', null, '概念「' + c + '」'), h('span', { class: 'tag concept' }, dims.filter((d) => d.concept === c).length + ' 構面・' + qs.filter((q) => q.concept === c).length + ' 題')),
          dims.filter((d) => d.concept === c).map((d) => h('div', null, h('b', null, d.name), d.indicators ? h('span', { class: 'muted' }, '：' + d.indicators) : null, d.by ? h('span', { class: 'tag', style: 'margin-left:6px' }, d.by) : null)),
          s.phase === 'propose' ? qs.filter((q) => q.concept === c).map((q) => h('div', { class: 'card flat' }, h('span', { class: 'q-code' }, codes[q.id] + ' '), q.text, ' ', h('span', { class: 'tag' }, qTypeDesc(q)), ' ', h('span', { class: 'tag' }, dimName(q.dimId)), q.by ? h('span', { class: 'tag' }, q.by) : null)) : null,
          !dims.filter((d) => d.concept === c).length && !qs.filter((q) => q.concept === c).length ? h('p', { class: 'muted' }, '還沒有內容') : null,
        ))));
        return;
      }
      if (s.phase === 'vote' || s.phase === 'finalize') {
        const qs = questionList().map((q) => Object.assign({ st: voteStats(q.id) }, q)).sort((a, b) => b.st.rate - a.st.rate || b.st.n - a.st.n);
        const tagTotals = {}; qs.forEach((q) => Object.entries(q.st.tags).forEach(([t, n]) => { tagTotals[t] = (tagTotals[t] || 0) + n; }));
        const voters = new Set(); Object.values(S.votes || {}).forEach((v) => Object.keys(v).forEach((d) => voters.add(d)));
        mount(root,
          h('p', { class: 'muted' }, '門檻：同意率 ≥ ' + pct(s.voteThreshold) + ' 且 ≥ ' + s.minVotes + ' 票列入。已有 ' + voters.size + ' 人投票。'),
          h('div', { class: 'board-grid' },
            h('div', { class: 'card tally' }, qs.map((q) => {
              const inc = S.survey && S.survey.included ? !!S.survey.included[q.id] : (q.st.n >= s.minVotes && q.st.rate >= s.voteThreshold);
              return h('div', { style: 'margin-bottom:10px' },
                h('div', { class: 'row between' }, h('span', null, h('span', { class: 'q-code' }, codes[q.id] + ' '), q.text, q.by ? h('span', { class: 'tag', style: 'margin-left:6px' }, q.by) : null), h('span', { class: 'num muted' }, q.st.ok + ' 👍 ' + q.st.no + ' 👎', inc ? ' ✓' : '')),
                h('div', { class: 'bar' }, h('div', { class: 'ok', style: 'width:' + (q.st.n ? (q.st.ok / q.st.n) * 100 : 0) + '%' }), q.st.n ? h('div', { class: 'gap' }) : null, h('div', { class: 'no', style: 'width:' + (q.st.n ? (q.st.no / q.st.n) * 100 : 0) + '%' })),
                Object.keys(q.st.tags).length ? h('div', { class: 'row', style: 'gap:4px' }, Object.entries(q.st.tags).sort((a, b) => b[1] - a[1]).map(([t, n]) => h('span', { class: 'tag' }, t + ' ×' + n))) : null,
              );
            })),
            h('div', { class: 'card stack' },
              h('h2', null, '開刀統計'),
              Object.keys(tagTotals).length ? h('div', { class: 'row' }, Object.entries(tagTotals).sort((a, b) => b[1] - a[1]).map(([t, n]) => h('span', { class: 'tag', style: 'font-size:1rem' }, t + ' ×' + n))) : h('p', { class: 'muted' }, '還沒有人開刀'),
              h('h2', null, '講評'),
              h('div', { class: 'stack', style: 'gap:4px' }, qs.flatMap((q) => q.st.notes.map((n) => h('p', { style: 'font-size:1rem' }, h('span', { class: 'q-code' }, codes[q.id] + ' '), n.by ? h('b', null, n.by + '：') : null, '「' + n.note + '」')))),
            ),
          ));
        return;
      }
      if (s.phase === 'survey') {
        const rs = Z.toList(S.responses).filter((r) => r.round === s.round.n && (s.round.n === 1 || r.targetSign === s.round.targetSign));
        mount(root, h('div', { class: 'board-grid' },
          h('div', { class: 'card stack' },
            h('h2', null, s.round.n === 1 ? '第一輪：以「自己」作答' : '第二輪：代答「' + s.round.targetSign + '座」朋友'),
            h('div', { class: 'big num' }, rs.length), h('p', { class: 'muted' }, '份作答已收到（已進場 ' + joined.length + ' 人）'),
            h('p', null, s.round.n === 1 ? '附上自己的真實星座。這一輪量的是：行為。' : '想一位你具體認識的' + s.round.targetSign + '座朋友，以他的實際行為作答。'),
          ),
          h('div', { class: 'card', style: 'display:grid;place-items:center' }, qrHolder),
        ));
        qr(200);
        return;
      }
      if (s.phase === 'results') {
        window.ZSR.render(root, buildCtx(), { board: true });
      }
    }
    render();
    return render;
  }

  /* ---------- 畫面：控制台 ---------- */
  function viewAdmin(root) {
    let draftOrder = null; let draftIncluded = null; let resetText = '';
    function render() {
      clear(root);
      if (!isAdmin()) {
        let pin = '';
        mount(root, h('div', { class: 'card stack' }, h('h1', null, '老師控制台'),
          h('label', { class: 'field' }, h('span', null, 'PIN'), h('input', { type: 'password', inputmode: 'numeric', oninput: (e) => { pin = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') go(); } })),
          h('button', { class: 'primary', onclick: go }, '進入')));
        function go() { if (pin === Z.adminPin) { me.pin = pin; LS.set('zs.pin', pin); render(); } else toast('PIN 不對'); }
        return;
      }
      const s = session(); const codes = qCodes(); const qs = questionList(); const cs = concepts();
      const setS = (patch) => B.update('session', Object.assign(patch, { updatedAt: B.now() }));
      if (!draftOrder) draftOrder = (S.survey && S.survey.order ? S.survey.order.filter((id) => S.questions && S.questions[id]) : []).concat(qs.map((q) => q.id).filter((id) => !(S.survey && S.survey.order || []).includes(id)));
      else draftOrder = draftOrder.filter((id) => S.questions && S.questions[id]).concat(qs.map((q) => q.id).filter((id) => !draftOrder.includes(id)));
      if (!draftIncluded) draftIncluded = S.survey && S.survey.included ? Object.assign({}, S.survey.included) : suggestedIncluded();
      const rs = Z.toList(S.responses);
      const counts = { r1: rs.filter((r) => r.round === 1).length };
      Z.SIGNS.forEach((x) => { const n = rs.filter((r) => r.round === 2 && r.targetSign === x.name).length; if (n) counts[x.name] = n; });
      const joined = joinedList();

      mount(root,
        h('div', { class: 'row between' }, h('h1', null, '老師控制台'), h('div', { class: 'row' }, h('a', { class: 'btn small', href: '#board', target: '_blank' }, '開投影畫面'), h('button', { class: 'small', onclick: () => { me.pin = ''; LS.set('zs.pin', ''); render(); } }, '登出'))),
        h('p', { class: 'muted', style: 'font-size:.85rem' }, '後端：' + (B.kind === 'firebase' ? 'Firebase' : '本機測試模式（資料只在這台瀏覽器）') + '　班級代碼：' + Z.classId + '　已進場 ' + joined.length + ' 人' + (joined.length ? '：' + joined.map((j) => j.id).join('、') : '')),
        /* 流程 */
        h('div', { class: 'card stack' }, h('h2', null, '流程階段'),
          h('div', { class: 'admin-grid' }, Z.PHASES.map((p) => h('button', { class: s.phase === p.id ? 'primary' : '', onclick: () => setS({ phase: p.id }) }, p.label))),
          h('p', { class: 'muted', style: 'font-size:.85rem' }, '學生畫面會跟著切換。「定稿中」是等待畫面，請在下面定稿後按「開始作答」。')),
        /* 投票門檻與定稿 */
        h('div', { class: 'card stack' }, h('h2', null, '定稿問卷（投票結果 → 列入 → 題序）'),
          h('div', { class: 'grid-2' },
            h('label', { class: 'field' }, h('span', null, '列入門檻（同意率）'), h('select', { onchange: (e) => setS({ voteThreshold: Number(e.target.value) }) }, [0.4, 0.5, 0.6, 0.7].map((v) => h('option', { value: v, selected: s.voteThreshold === v }, pct(v))))),
            h('label', { class: 'field' }, h('span', null, '最少票數'), h('input', { type: 'number', min: 1, value: s.minVotes, onchange: (e) => setS({ minVotes: Math.max(1, Number(e.target.value) || 1) }) })),
          ),
          h('div', { class: 'row' }, h('button', { class: 'small', onclick: () => { draftIncluded = suggestedIncluded(); render(); } }, '套用投票建議'), h('button', { class: 'small', onclick: () => { draftOrder = draftOrder.slice().sort((a, b) => (voteStats(b).rate - voteStats(a).rate)); render(); } }, '依同意率排序')),
          qs.length ? h('ol', { class: 'sortable', style: 'list-style:none;padding:0;margin:0' }, draftOrder.map((id, i) => {
            const q = S.questions[id]; const st = voteStats(id);
            return h('li', null,
              h('input', { type: 'checkbox', checked: !!draftIncluded[id], onchange: (e) => { draftIncluded[id] = e.target.checked; } }),
              h('div', { class: 'txt' }, h('span', { class: 'q-code' }, codes[id] + ' '), q.text, h('div', { class: 'muted', style: 'font-size:.8rem' }, (q.by ? q.by + '・' : '') + qTypeDesc(q) + '・' + dimName(q.dimId) + '・' + st.ok + '👍 ' + st.no + '👎（' + pct(st.rate) + '）' + (Object.keys(st.tags).length ? '・' + Object.entries(st.tags).map(([t, n]) => t + '×' + n).join(' ') : ''))),
              h('button', { class: 'small', disabled: i === 0, onclick: () => { [draftOrder[i - 1], draftOrder[i]] = [draftOrder[i], draftOrder[i - 1]]; render(); } }, '▲'),
              h('button', { class: 'small', disabled: i === draftOrder.length - 1, onclick: () => { [draftOrder[i + 1], draftOrder[i]] = [draftOrder[i], draftOrder[i + 1]]; render(); } }, '▼'),
            );
          })) : h('div', { class: 'empty' }, '還沒有題目'),
          h('div', { class: 'grid-2' },
            h('label', { class: 'field' }, h('span', null, '星座相信程度 B1–B3'), h('select', { onchange: (e) => setS({ belief: { enabled: e.target.value !== 'off', position: e.target.value === 'off' ? s.belief.position : e.target.value } }) },
              h('option', { value: 'end', selected: s.belief.enabled && s.belief.position === 'end' }, '放問卷最後（避免需求效應）'),
              h('option', { value: 'start', selected: s.belief.enabled && s.belief.position === 'start' }, '放問卷開頭'),
              h('option', { value: 'off', selected: !s.belief.enabled }, '不加入'))),
          ),
          h('div', { class: 'row' },
            h('button', { class: 'primary', onclick: () => {
              const included = {}; draftOrder.forEach((id) => { if (draftIncluded[id]) included[id] = true; });
              if (!Object.keys(included).length) return toast('至少勾選一題');
              B.set('survey', { order: draftOrder, included, finalizedAt: B.now() }).then(() => setS({ phase: 'survey', round: { n: 1, targetSign: s.round.targetSign } })).then(() => toast('已定稿，第一輪作答開始'));
            } }, '定稿並開始第一輪作答'),
            h('button', { onclick: () => { const included = {}; draftOrder.forEach((id) => { if (draftIncluded[id]) included[id] = true; }); B.set('survey', { order: draftOrder, included, finalizedAt: B.now() }).then(() => toast('已儲存定稿（未開始作答）')); } }, '只儲存定稿'),
          ),
          S.survey && S.survey.order ? h('p', { class: 'muted', style: 'font-size:.85rem' }, '目前定稿：' + finalQuestions().length + ' 題') : null,
        ),
        /* 作答輪次 */
        h('div', { class: 'card stack' }, h('h2', null, '作答輪次'),
          h('p', { class: 'muted', style: 'font-size:.9rem' }, '第一輪已收 ' + counts.r1 + ' 份。' + Z.SIGNS.filter((x) => counts[x.name]).map((x) => '第二輪代答 ' + x.name + '座 ' + counts[x.name] + ' 份').join('，')),
          h('div', { class: 'row' },
            h('button', { class: s.phase === 'survey' && s.round.n === 1 ? 'primary' : '', onclick: () => setS({ phase: 'survey', round: { n: 1, targetSign: s.round.targetSign } }) }, '第一輪：自評'),
            h('select', { onchange: (e) => setS({ round: { n: s.round.n, targetSign: e.target.value } }) }, Z.SIGNS.map((x) => h('option', { value: x.name, selected: s.round.targetSign === x.name }, x.name + '座'))),
            h('button', { class: s.phase === 'survey' && s.round.n === 2 ? 'primary' : '', onclick: () => setS({ phase: 'survey', round: { n: 2, targetSign: s.round.targetSign } }) }, '第二輪：代答此星座'),
          ),
          h('p', { class: 'muted', style: 'font-size:.85rem' }, '第二輪可以換星座再跑一次（金牛輪、雙魚輪），每輪都有 N＝全班。'),
        ),
        /* 開獎 */
        h('div', { class: 'card stack' }, h('h2', null, '開獎'),
          h('div', { class: 'row' },
            h('button', { class: s.phase === 'results' ? 'primary' : '', onclick: () => setS({ phase: 'results' }) }, '進入開獎（投影）'),
            h('button', { class: s.resultsOpen ? 'primary' : '', onclick: () => setS({ resultsOpen: !s.resultsOpen }) }, s.resultsOpen ? '已開放學生看結果（點此關閉）' : '開放學生看結果與下載'),
            h('button', { onclick: () => window.ZSR.downloadExcel(buildCtx()) }, '下載 Excel'),
          )),
        /* 概念 */
        h('div', { class: 'card stack' }, h('h2', null, '待審的概念'),
          h('p', { class: 'muted', style: 'font-size:.9rem' }, '預設「愛家」「浪漫」。想自創傳說（例如獅子座愛面子）就加一個概念；開獎時「愛家」對照土象、「浪漫」對照水象，其他概念不標預測。'),
          h('div', { class: 'row' },
            h('input', { type: 'text', id: 'concepts-input', value: cs.join('、'), placeholder: '愛家、浪漫', style: 'max-width:320px' }),
            h('button', { class: 'small', onclick: () => { const v = document.getElementById('concepts-input').value.split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean); if (!v.length) return toast('至少一個概念'); setS({ concepts: v }).then(() => toast('已更新概念')); } }, '儲存'),
          )),
        /* 資料 */
        h('div', { class: 'card stack' }, h('h2', null, '資料'),
          h('div', { class: 'row' },
            h('button', { onclick: () => seedDemo().then(() => { draftOrder = null; draftIncluded = null; toast('已填入測試資料'); }) }, '填入測試資料（14 人示範）'),
          ),
          h('div', { class: 'row' },
            h('input', { type: 'text', placeholder: '輸入 RESET 以清空本班所有資料', style: 'max-width:280px', oninput: (e) => { resetText = e.target.value; } }),
            h('button', { class: 'danger', onclick: () => { if (resetText !== 'RESET') return toast('請輸入 RESET'); resetAll().then(() => { draftOrder = null; draftIncluded = null; resetText = ''; toast('已清空'); }); } }, '清空資料'),
          ),
          h('p', { class: 'muted', style: 'font-size:.85rem' }, '測試資料會覆蓋現有資料；上課前請清空。'),
        ),
      );
    }
    render();
    return () => { if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName) && root.contains(document.activeElement)) return; render(); };
  }

  /* ---------- 測試資料 ---------- */
  async function seedDemo() {
    const now = Date.now(); const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const tree = { session: Object.assign({}, Z.DEFAULT_SESSION, { phase: 'results', resultsOpen: true, round: { n: 2, targetSign: '雙魚' }, updatedAt: now }), dimensions: {}, questions: {}, votes: {}, joined: {}, responses: {} };
    const names = ['小鹿', '阿哲', '婷婷', '大熊', '小瑜', '阿凱', '佳佳', '阿翔', '小安', '阿明', '美美', '阿宏', '小芸', '阿傑'];
    const signs = ['金牛', '金牛', '處女', '摩羯', '雙魚', '雙魚', '巨蟹', '天蠍', '牡羊', '獅子', '射手', '雙子', '天秤', '水瓶'];
    const devices = names.map((_, i) => 'demo-' + (i + 1));
    devices.forEach((d, i) => { tree.joined[d] = { id: names[i], sign: signs[i], element: Z.signElement(signs[i]), at: now + i }; });
    const dims = [
      ['愛家', '時間投入', '每週與家人共餐次數・每天交談分鐘'], ['愛家', '情感表達', '主動聯絡家人的頻率'],
      ['愛家', '金錢投入', '每月花在家人身上的金額'], ['愛家', '優先順序', '朋友邀約與家庭聚會衝突時的選擇'],
      ['浪漫', '儀式感', '記得紀念日・特別布置約會'], ['浪漫', '驚喜行為', '沒有理由的小禮物'],
      ['浪漫', '言語甜度', '說情話的頻率'], ['浪漫', '為對方花時間', '每週安排約會時數'],
    ];
    const dimIds = dims.map((d, i) => { const id = 'd' + (i + 1); tree.dimensions[id] = { concept: d[0], name: d[1], indicators: d[2], by: names[i], at: now + i, deviceId: devices[i] }; return id; });
    const qs = [
      ['愛家', 0, '過去一週，你和家人一起吃飯幾次？', 'ratio', '次／週'],
      ['愛家', 1, '我會主動打電話或傳訊息關心家人。', 'likert'],
      ['愛家', 2, '上個月你花在家人身上（禮物、請客、家用）大約幾元？', 'ratio', '元／月'],
      ['愛家', 3, '朋友邀約和家庭聚會撞期時，你通常選哪個？', 'choice', null, ['家庭聚會', '朋友邀約', '看情況', '其他']],
      ['浪漫', 4, '過去一年，你記得並慶祝了幾個紀念日（生日、交往日等）？', 'ratio', '個／年'],
      ['浪漫', 5, '我會為對方製造驚喜。', 'likert'],
      ['浪漫', 6, '我經常對伴侶或喜歡的人說甜言蜜語。', 'likert'],
      ['浪漫', 7, '你每週會花幾小時安排或進行約會？', 'ratio', '小時／週'],
      ['愛家', 0, '你不認為金牛座並非不愛家嗎？', 'likert'],
    ];
    const qIds = qs.map((q, i) => {
      const id = 'q' + (i + 1); const who = i % names.length;
      tree.questions[id] = { concept: q[0], dimId: dimIds[q[1]], text: q[2], type: q[3], unit: q[4] || '', anchors: q[3] === 'likert' ? { low: '非常不同意', high: '非常同意' } : null, options: q[5] || null, techniques: [pick(Z.TECHNIQUES)], version: 1, by: names[who], at: now + 100 + i, deviceId: devices[who] };
      tree.votes[id] = {};
      devices.forEach((d, j) => {
        const bad = i === 8; const ok = bad ? Math.random() < 0.15 : Math.random() < 0.8;
        tree.votes[id][d] = { ok, sins: bad && !ok ? ['雙重否定'] : (Math.random() < 0.15 ? [pick(Z.SINS)] : []), knives: Math.random() < 0.2 ? [pick(Z.KNIVES)] : [], note: bad && Math.random() < 0.3 ? '唸三次還是不懂' : '', by: names[j], at: now };
      });
      return id;
    });
    const included = {}; qIds.slice(0, 8).forEach((id) => { included[id] = true; });
    tree.survey = { order: qIds, included, finalizedAt: now };
    const answer = (q, boost) => {
      if (q.type === 'ratio') { const base = { '次／週': rnd(1, 8), '元／月': rnd(0, 4000), '個／年': rnd(0, 5), '小時／週': rnd(0, 10) }[q.unit] || rnd(0, 10); return Math.round(base * (boost ? 1.3 : 1)); }
      if (q.type === 'likert') return Math.min(5, rnd(2, 5) + (boost ? 1 : 0));
      return pick(q.options);
    };
    const resp = (dev, round, target, mySign) => {
      const el = Z.signElement(mySign); const answers = {};
      qIds.slice(0, 8).forEach((id) => { const q = tree.questions[id]; const boost = round === 2 ? (q.concept === '愛家' && target === '金牛') || (q.concept === '浪漫' && target === '雙魚') : false; answers[id] = answer(q, boost); });
      Z.BELIEF.forEach((b) => { answers[b.id] = rnd(2, 4); });
      tree.responses[dev + '_r' + round + '_' + (round === 2 ? target : 'self')] = { round, targetSign: round === 2 ? target : '', mySign, element: el, answers, deviceId: dev, at: now };
    };
    devices.forEach((d, i) => { resp(d, 1, '', signs[i]); resp(d, 2, '金牛', signs[i]); resp(d, 2, '雙魚', signs[i]); });
    const flat = Object.assign(clearPaths(), { session: tree.session, survey: tree.survey });
    ['dimensions', 'questions', 'joined', 'responses'].forEach((k) => Object.keys(tree[k]).forEach((id) => { flat[k + '/' + id] = tree[k][id]; }));
    Object.keys(tree.votes).forEach((q) => Object.keys(tree.votes[q]).forEach((d) => { flat['votes/' + q + '/' + d] = tree.votes[q][d]; }));
    await B.multi(flat);
  }
  /* 逐筆刪除現有資料（規則只允許逐筆寫入，不允許整棵樹覆蓋） */
  function clearPaths() {
    const flat = {};
    ['dimensions', 'questions', 'joined', 'responses'].forEach((k) => Object.keys(S[k] || {}).forEach((id) => { flat[k + '/' + id] = null; }));
    Object.keys(S.votes || {}).forEach((q) => Object.keys(S.votes[q] || {}).forEach((d) => { flat['votes/' + q + '/' + d] = null; }));
    return flat;
  }
  function resetAll() {
    return B.multi(Object.assign(clearPaths(), { session: Object.assign({}, Z.DEFAULT_SESSION, { updatedAt: Date.now() }), survey: null }));
  }

  /* ---------- 路由 ---------- */
  const VIEWS = { join: viewJoin, dims: viewDims, propose: viewPropose, vote: viewVote, survey: viewSurvey, results: viewResults, board: viewBoard, admin: viewAdmin };
  const NAV = [['join', '進場', '⌂'], ['dims', '構面', '⊞'], ['propose', '出題', '✎'], ['vote', '互評', '⚖'], ['survey', '作答', '☑'], ['results', '開獎', '◔']];
  let current = null; let lastPhase = null;
  function navigate() {
    let name = location.hash.replace('#', '');
    if (!VIEWS[name]) name = Z.phaseOf(session().phase).route;
    const main = document.querySelector('main'); main.classList.remove('wide');
    const root = clear(document.getElementById('view')); root.className = '';
    current = { name, update: VIEWS[name](root) };
    const nav = document.getElementById('nav'); nav.hidden = name === 'board' || name === 'admin';
    mount(clear(nav), NAV.map(([r, label, icon]) => h('a', { href: '#' + r, class: (name === r ? 'active' : '') + (Z.phaseOf(session().phase).route === r ? ' live' : '') }, h('b', null, icon), label)));
    document.getElementById('pill').textContent = Z.phaseOf(session().phase).label;
    window.scrollTo(0, 0);
  }
  function onData(key) {
    if (key === 'session') {
      const s = session(); const p = Z.phaseOf(s.phase);
      document.getElementById('pill').textContent = p.label;
      if (lastPhase !== null && lastPhase !== s.phase && current && !['board', 'admin'].includes(current.name)) {
        lastPhase = s.phase;
        if (location.hash !== '#' + p.route) { location.hash = p.route; return; } else { navigate(); return; }
      }
      lastPhase = s.phase;
      if (current) { const nav = document.getElementById('nav'); nav.querySelectorAll('a').forEach((a) => a.classList.toggle('live', a.getAttribute('href') === '#' + p.route)); }
    }
    if (current && current.update) current.update();
  }
  window.addEventListener('hashchange', navigate);
  let booted = false; const KEYS = ['session', 'dimensions', 'questions', 'votes', 'survey', 'responses', 'joined']; const arrived = new Set();
  KEYS.forEach((k) => B.listen(k, (v) => {
    S[k] = v; arrived.add(k);
    if (!booted && arrived.size === KEYS.length) { booted = true; lastPhase = session().phase; navigate(); return; }
    if (booted) onData(k);
  }));
  /* Firebase 連不上時 3 秒後仍顯示畫面 */
  setTimeout(() => { if (!booted) { booted = true; lastPhase = session().phase; navigate(); } }, 3000);
  window.ZSApp = { S, me, session, concepts, buildCtx };
})();
