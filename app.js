/**
 * app.js — BrainBox フロント側の動き
 * 責務：預ける／日付を選ぶ／「手もとに」を開いて中身を表示する
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxSB2DgVoWWqVuI9LzgPTqYjQ_fRgAOYL-R6e4ym-jhGnxQa9zrjEasVPILmRIswayyTQ/exec";

const input = document.getElementById("input");
const submitBtn = document.getElementById("submit");
const calendarWrap = document.getElementById("calendarWrap");
const dateInput = document.getElementById("dateInput");
const dateChip = document.getElementById("dateChip");
const pocketBtn = document.getElementById("pocket");
const sheet = document.getElementById("pocketSheet");
const overlay = document.getElementById("sheetOverlay");
const pocketList = document.getElementById("pocketList");
const pocketEmpty = document.getElementById("pocketEmpty");
const undoToast = document.getElementById("undoToast");
const pullIndicator = document.getElementById("pullIndicator");
const pocketBody = document.getElementById("pocketBody");
const splash = document.getElementById("splash");
const micHint = document.getElementById("micHint");

let selectedDate = ""; // "" = 期限なし。YYYY-MM-DD の形でだけ持つ
let refreshing = false; // 引っ張って更新の最中かどうか

// 起動時のブランド表示。少し見せてから消える
setTimeout(() => splash.classList.add("hide"), 700);

// 🎤ヒントは初回のみ
if (!localStorage.getItem("brainbox_mic_hint_seen")) {
  setTimeout(() => micHint.classList.add("visible"), 900);
  setTimeout(() => {
    micHint.classList.remove("visible");
    localStorage.setItem("brainbox_mic_hint_seen", "1");
  }, 4500);
}

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

function toggleSubmit() {
  submitBtn.classList.toggle("visible", input.value.trim().length > 0);
}

input.addEventListener("input", () => { autoResize(); toggleSubmit(); });

submitBtn.addEventListener("click", () => submitEntry());
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitEntry();
  }
});

// カレンダーは実体の日付欄が透明でアイコンの上に重なっているので、
// ここではタップ自体はOSに任せ、選ばれた時の反応だけを扱う

dateInput.addEventListener("change", () => {
  selectedDate = dateInput.value || "";
  updateDateChip();
});

// チップをタップで日付を外す
dateChip.addEventListener("click", () => {
  selectedDate = "";
  dateInput.value = "";
  updateDateChip();
});

function updateDateChip() {
  if (selectedDate) {
    dateChip.textContent = formatDate(selectedDate);
    dateChip.hidden = false;
    calendarWrap.classList.add("active");
  } else {
    dateChip.hidden = true;
    calendarWrap.classList.remove("active");
  }
}

function formatDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}`;
}

function submitEntry() {
  const text = input.value.trim();
  if (!text) return;

  if (navigator.vibrate) navigator.vibrate(8);

  const scheduledDate = selectedDate;

  // 預けた直後は言葉を出さない。文字が少し上へ動いて消えるだけ
  input.classList.add("leaving");
  setTimeout(() => {
    input.value = "";
    input.classList.remove("leaving");
    input.style.height = "auto";
    toggleSubmit();
  }, 350);

  // 日付は1回預けるごとにリセット(次のひとことに引き継がない)
  selectedDate = "";
  dateInput.value = "";
  updateDateChip();

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ content: text, inputType: "text", scheduledDate })
  }).catch(() => {});
}

// 「手もとに」— 件数は出さない。開いたときだけ中身を取りに行く
pocketBtn.addEventListener("click", () => openPocket());
overlay.addEventListener("click", () => closePocket());

function openPocket() {
  sheet.classList.add("open");
  overlay.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");

  // まず前回の中身をそのまま出す。GASが起きるまでの数秒を空っぽで待たせないため
  const cached = readCache();
  if (cached) renderPocket(cached);

  loadPocket(cached ? 1 : 0);
}

/**
 * 最新を取りに行く。GASは休眠から起きる際に一度失敗することがあるので、
 * 失敗しても1回だけ静かに取り直す。
 */
function loadPocket(retryLeft) {
  return fetchWithTimeout(`${API_URL}?action=today`, 10000)
    .then(r => r.json())
    .then(data => {
      const items = data.items || [];
      renderPocket(items);
      writeCache(items);
    })
    .catch(() => {
      if (retryLeft > 0) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(loadPocket(retryLeft - 1)), 1200);
        });
      }
      // 中身が無いのか、読めなかったのかを区別して伝える
      if (pocketList.children.length === 0) {
        pocketEmpty.textContent = "うまく読み込めませんでした";
        pocketEmpty.classList.add("visible");
      }
    });
}

// 応答が無いまま待ち続けないように、時間切れを設ける
function fetchWithTimeout(url, ms) {
  if (typeof AbortController === "undefined") return fetch(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .then((r) => { clearTimeout(timer); return r; })
    .catch((err) => { clearTimeout(timer); throw err; });
}

function readCache() {
  try {
    const raw = localStorage.getItem("brainbox_pocket_cache");
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeCache(items) {
  try {
    const clean = (items || []).filter(i => i && !hiddenIds.has(i.id));
    localStorage.setItem("brainbox_pocket_cache", JSON.stringify(clean));
  } catch (e) {}
}

function closePocket() {
  finalizePending(); // 開いたままにしてある取り消し猶予は、閉じたら確定させる
  stopRefresh();
  pocketBody.style.transform = "";
  sheet.classList.remove("open");
  overlay.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function renderPocket(items) {
  const list = Array.isArray(items) ? items : [];
  lastItems = list;
  pocketList.innerHTML = "";

  list.forEach((i) => {
    if (!i || !i.id) return;
    if (hiddenIds.has(i.id)) return; // 一度スワイプしたものは描き直しても出さない
    const li = document.createElement("li");
    li.dataset.id = i.id;

    if (i.scheduledDate) {
      const dateSpan = document.createElement("span");
      dateSpan.className = "pocketDate";
      dateSpan.textContent = formatDate(i.scheduledDate);
      li.appendChild(dateSpan);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = i.content == null ? "" : String(i.content);
    li.appendChild(textSpan);

    attachSwipe(li, { id: i.id, content: textSpan.textContent });
    pocketList.appendChild(li);
  });

  pocketEmpty.textContent = "まだ何もありません";
  pocketEmpty.classList.toggle("visible", pocketList.children.length === 0);
}

// 上スワイプで完了。「預ける」と同じく、言葉ではなく動きで手放す
let pendingComplete = null; // { item, timer }
let lastItems = [];         // 直近に受け取った一覧(元に戻すときに描き直すため)
const hiddenIds = new Set(); // スワイプ済み。サーバーがまだ知らなくても画面には出さない
const SWIPE_THRESHOLD = -60;

// 長押しして持ち上げてから、上へ。スクロールと混ざらないようにするため
const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 8; // 長押し成立前にこれ以上動いたらスクロールとみなす

function attachSwipe(li, item) {
  let startY = null;
  let deltaY = 0;
  let armed = false;   // 長押しが成立して、持ち上がった状態か
  let pressTimer = null;

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  function reset() {
    cancelPress();
    armed = false;
    startY = null;
    deltaY = 0;
    li.classList.remove("lifted");
    li.style.transition = "transform 0.25s ease, opacity 0.25s ease";
    li.style.transform = "";
    li.style.opacity = "";
  }

  li.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    deltaY = 0;
    armed = false;

    pressTimer = setTimeout(() => {
      armed = true;
      li.classList.add("lifted");
      if (navigator.vibrate) navigator.vibrate(10);
    }, LONG_PRESS_MS);
  }, { passive: true });

  li.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const moved = e.touches[0].clientY - startY;

    if (!armed) {
      // まだ持ち上がっていないうちに動いたら、それはスクロール
      if (Math.abs(moved) > MOVE_TOLERANCE) cancelPress();
      return;
    }

    // 持ち上がっている間は、リスト側のスクロールを止めて指の動きに追従させる
    e.preventDefault();
    deltaY = moved;
    li.style.transition = "none";
    if (deltaY < 0) {
      li.style.transform = `translateY(${deltaY}px) scale(1.02)`;
      li.style.opacity = String(Math.max(0, 1 + deltaY / 120));
    }
  }, { passive: false });

  li.addEventListener("touchend", () => {
    if (armed && deltaY < SWIPE_THRESHOLD) {
      cancelPress();
      li.classList.remove("lifted");
      li.style.transition = "transform 0.25s ease, opacity 0.25s ease";
      completeItem(item, li);
      startY = null;
      deltaY = 0;
      armed = false;
      return;
    }
    reset();
  });

  li.addEventListener("touchcancel", () => reset());
}

function completeItem(item, li) {
  finalizePending(); // 前の1件がまだ猶予中なら、先に確定させてから次へ

  hiddenIds.add(item.id);

  li.style.transform = "translateY(-40px)";
  li.style.opacity = "0";
  li.style.pointerEvents = "none";
  setTimeout(() => {
    if (li.parentNode) li.parentNode.removeChild(li);
    pocketEmpty.classList.toggle("visible", pocketList.children.length === 0);
  }, 250);

  undoToast.hidden = false;
  requestAnimationFrame(() => undoToast.classList.add("visible"));

  pendingComplete = {
    item,
    timer: setTimeout(() => finalizePending(), 4000)
  };
}

function finalizePending() {
  if (!pendingComplete) return;
  const { item, timer } = pendingComplete;
  clearTimeout(timer);
  pendingComplete = null;
  hideUndoToast();

  // キャッシュからも消しておく(次に開いた時に一瞬だけ復活して見えないように)
  const cached = readCache();
  if (cached) writeCache(cached.filter(c => c && c.id !== item.id));

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "complete", id: item.id })
  }).catch(() => {});
}

function undoPending() {
  if (!pendingComplete) return;
  const { item, timer } = pendingComplete;
  clearTimeout(timer);
  pendingComplete = null;
  hiddenIds.delete(item.id); // 隠す対象から外して、元の並びのまま描き直す
  hideUndoToast();
  renderPocket(lastItems);
}

function hideUndoToast() {
  undoToast.classList.remove("visible");
  setTimeout(() => { undoToast.hidden = true; }, 200);
}

undoToast.addEventListener("click", () => undoPending());

/**
 * 引っ張って更新。一番上まで来ているときに下へ引くと、くるくるが出て最新を取り直す。
 * 普段は畳まれていて見えないので、使わない人は気づかなくてよい。
 */
const PULL_THRESHOLD = 64;
let pullStartY = null;
let pullDistance = 0;

sheet.addEventListener("touchstart", (e) => {
  if (refreshing) return;
  pullStartY = sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
  pullDistance = 0;
}, { passive: true });

sheet.addEventListener("touchmove", (e) => {
  if (pullStartY === null || refreshing) return;
  const delta = e.touches[0].clientY - pullStartY;
  if (delta <= 0) {
    pullDistance = 0;
    pocketBody.style.transform = "";
    pullIndicator.classList.remove("active");
    return;
  }
  // 引くほど重くなる感じにして、引きすぎないようにする
  pullDistance = Math.min(delta * 0.5, 80);
  pocketBody.style.transition = "none";
  pocketBody.style.transform = `translateY(${pullDistance}px)`;
  pullIndicator.classList.toggle("active", pullDistance > 12);
}, { passive: true });

sheet.addEventListener("touchend", () => {
  if (pullStartY === null || refreshing) return;
  pocketBody.style.transition = "";

  if (pullDistance >= PULL_THRESHOLD) {
    startRefresh();
  } else {
    pocketBody.style.transform = "";
    pullIndicator.classList.remove("active");
  }

  pullStartY = null;
  pullDistance = 0;
});

function startRefresh() {
  refreshing = true;
  pocketBody.style.transform = "";
  pullIndicator.classList.add("active", "spinning");
  if (navigator.vibrate) navigator.vibrate(6);

  // 何が起きても必ず止める(念のための保険)
  const failsafe = setTimeout(() => stopRefresh(), 12000);

  loadPocket(1)
    .catch(() => {})
    .then(() => {
      clearTimeout(failsafe);
      // 一瞬で消えると更新されたのか分からないので、少しだけ見せてから畳む
      setTimeout(() => stopRefresh(), 400);
    });
}

function stopRefresh() {
  if (!pullIndicator) return;
  pullIndicator.classList.remove("active", "spinning");
  refreshing = false;
}


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
