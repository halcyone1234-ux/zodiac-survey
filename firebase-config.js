/* 設定檔：貼上 Firebase 主控台「專案設定 → 一般 → 你的應用程式 → SDK 設定」的 firebaseConfig。
   apiKey 仍是 YOUR_… 時，網站會自動改用「本機測試模式」（資料只存在這台瀏覽器）。 */
window.ZS_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAcJtTlBhu2AUHqt2vRddxoh2XxIPJeSGs',
    authDomain: 'zodiac-af366.firebaseapp.com',
    databaseURL: 'https://zodiac-af366-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'zodiac-af366',
    appId: '1:728813141842:web:d791a2425d1de1e7abc48b',
  },
  adminPin: '1151',        /* 老師控制台 PIN（只在前端把關） */
  defaultClassId: '1151-w06', /* 班級代碼；網址加 ?c=別的代碼 可開新班 */
};
