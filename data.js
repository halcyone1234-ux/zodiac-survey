/* 資料層：常數、裝置匿名碼、Firebase Realtime Database（或本機 mock） */
(function () {
  'use strict';

  const SIGNS = [
    { name: '牡羊', el: '火' }, { name: '金牛', el: '土' }, { name: '雙子', el: '風' }, { name: '巨蟹', el: '水' },
    { name: '獅子', el: '火' }, { name: '處女', el: '土' }, { name: '天秤', el: '風' }, { name: '天蠍', el: '水' },
    { name: '射手', el: '火' }, { name: '摩羯', el: '土' }, { name: '水瓶', el: '風' }, { name: '雙魚', el: '水' },
  ];
  const ELEMENTS = ['火', '土', '風', '水'];
  const ELEMENT_SIGNS = { 火: '牡羊・獅子・射手', 土: '金牛・處女・摩羯', 風: '雙子・天秤・水瓶', 水: '巨蟹・天蠍・雙魚' };
  const signElement = (s) => (SIGNS.find((x) => x.name === s) || {}).el || '';

  const PHASES = [
    { id: 'lobby', label: '進場', route: 'join' },
    { id: 'dimensions', label: '構面表', route: 'dims' },
    { id: 'propose', label: '出題', route: 'propose' },
    { id: 'vote', label: '健檢互評', route: 'vote' },
    { id: 'finalize', label: '定稿中', route: 'survey' },
    { id: 'survey', label: '作答', route: 'survey' },
    { id: 'results', label: '開獎', route: 'results' },
  ];
  const phaseOf = (id) => PHASES.find((p) => p.id === id) || PHASES[0];

  const SINS = ['雙重語意', '引導題', '雙重否定', '術語黑話', '選項不互斥', '假設性前提', '問不出口'];
  const KNIVES = ['效度刀', '信度刀', '誠實刀', '尺度刀'];
  const TECHNIQUES = [
    '問出生年不問年齡層（能收比率就收比率）',
    '敏感題置後',
    '先問數字、拒答不追問',
    '選項輪替（防順序效應）',
    '結尾徵詢回訪（再測信度）',
    '穿插反向題（治一路勾到底）',
    '保證匿名',
    '留「其他」選項（窮盡）',
  ];
  const QTYPES = { ratio: '比率題（填數字）', likert: '李克特 1–5', choice: '單選題' };
  const BELIEF = [
    { id: 'B1', text: '我認為星座能反映一個人的性格。' },
    { id: 'B2', text: '做重要決定前，我會參考星座運勢。' },
    { id: 'B3', text: '認識新朋友時，我會想知道對方的星座。' },
  ];
  const DEFAULT_SESSION = {
    phase: 'lobby', round: { n: 1, targetSign: '金牛' }, voteThreshold: 0.5, minVotes: 3,
    belief: { enabled: true, position: 'end' }, resultsOpen: false, concepts: ['愛家', '浪漫'], updatedAt: 0,
  };

  /* ---- localStorage helpers ---- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  let deviceId = LS.get('zs.deviceId', null);
  if (!deviceId) { deviceId = uuid(); LS.set('zs.deviceId', deviceId); }

  const params = new URLSearchParams(location.search);
  const classId = (params.get('c') || (window.ZS_CONFIG && window.ZS_CONFIG.defaultClassId) || '1151-w06').replace(/[^\w-]/g, '');
  const ROOT = 'classes/' + classId;

  /* ---- backend: Firebase or local mock ---- */
  const cfg = window.ZS_CONFIG && window.ZS_CONFIG.firebase;
  const useFirebase = !!(cfg && cfg.apiKey && !/^YOUR_/i.test(cfg.apiKey) && window.firebase);
  let backend;

  if (useFirebase) {
    firebase.initializeApp(cfg);
    const db = firebase.database();
    backend = {
      kind: 'firebase',
      listen(path, cb) {
        const ref = db.ref(ROOT + '/' + path);
        const h = ref.on('value', (snap) => cb(snap.val()), (err) => console.error('listen', path, err));
        return () => ref.off('value', h);
      },
      once(path) { return db.ref(ROOT + '/' + path).once('value').then((s) => s.val()); },
      set(path, val) { return db.ref(ROOT + '/' + path).set(val); },
      update(path, obj) { return db.ref(ROOT + '/' + path).update(obj); },
      push(path, val) { const r = db.ref(ROOT + '/' + path).push(); return r.set(val).then(() => r.key); },
      remove(path) { return db.ref(ROOT + '/' + path).remove(); },
      /* 多路徑一次寫入（{ 'questions/q1': {...}, 'votes/q1/dev': null }），規則逐一檢查每個路徑 */
      multi(obj) { return db.ref(ROOT).update(obj); },
      now() { return firebase.database.ServerValue.TIMESTAMP; },
    };
  } else {
    /* 本機 mock：資料存在 localStorage，靠 storage 事件讓同一台電腦的分頁互相同步 */
    const KEY = 'zs.mock.' + classId;
    const listeners = []; // {path, cb}
    const load = () => LS.get(KEY, {});
    const save = (tree) => { LS.set(KEY, tree); notify(); };
    const getAt = (tree, path) => path.split('/').filter(Boolean).reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), tree);
    const setAt = (tree, path, val) => {
      const parts = path.split('/').filter(Boolean);
      if (!parts.length) return val === null ? {} : val;
      let o = tree;
      for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
      if (val === null || val === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val;
      prune(tree); return tree;
    };
    /* 跟 Firebase 一樣：空物件節點視同不存在 */
    const prune = (o) => { Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } }); };
    const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    function notify() { const tree = load(); listeners.forEach((l) => { try { l.cb(clone(getAt(tree, l.path))); } catch (e) { console.error(e); } }); }
    window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
    backend = {
      kind: 'mock',
      listen(path, cb) {
        const l = { path, cb }; listeners.push(l);
        setTimeout(() => cb(clone(getAt(load(), path))), 0);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
      once(path) { return Promise.resolve(clone(getAt(load(), path))); },
      set(path, val) { save(setAt(load(), path, clone(val))); return Promise.resolve(); },
      update(path, obj) { let t = load(); Object.keys(obj).forEach((k) => { t = setAt(t, path + '/' + k, clone(obj[k])); }); save(t); return Promise.resolve(); },
      push(path, val) { const key = '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); save(setAt(load(), path + '/' + key, clone(val))); return Promise.resolve(key); },
      remove(path) { save(setAt(load(), path, null)); return Promise.resolve(); },
      multi(obj) { let t = load(); Object.keys(obj).forEach((p) => { t = setAt(t, p, clone(obj[p])); }); save(t); return Promise.resolve(); },
      now() { return Date.now(); },
    };
  }

  /* 把 Firebase 物件轉成陣列（帶 id），依 at 排序 */
  const toList = (obj, sortKey) => {
    if (!obj) return [];
    const arr = Object.keys(obj).map((k) => Object.assign({ id: k }, obj[k]));
    if (sortKey) arr.sort((a, b) => (a[sortKey] || 0) - (b[sortKey] || 0));
    return arr;
  };

  window.ZS = {
    SIGNS, ELEMENTS, ELEMENT_SIGNS, signElement, PHASES, phaseOf, SINS, KNIVES, TECHNIQUES, QTYPES, BELIEF,
    DEFAULT_SESSION, LS, deviceId, classId, backend, toList,
    adminPin: String((window.ZS_CONFIG && window.ZS_CONFIG.adminPin) || '1151'),
    siteUrl() {
      const base = location.origin + location.pathname.replace(/[^/]*$/, '');
      return base + (classId !== '1151-w06' ? '?c=' + classId : '');
    },
  };
})();
