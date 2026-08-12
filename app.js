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
const splash = document.getElementById("splash");
const micHint = document.getElementById("micHint");

let selectedDate = ""; // "" = 期限なし。YYYY-MM-DD の形でだけ持つ

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

  fetch(`${API_URL}?action=today`)
    .then(r => r.json())
    .then(data => renderPocket(data.items || []))
    .catch(() => renderPocket([]));
}

function closePocket() {
  finalizePending(); // 開いたままにしてある取り消し猶予は、閉じたら確定させる
  sheet.classList.remove("open");
  overlay.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function renderPocket(items) {
  const list = Array.isArray(items) ? items : [];
  pocketList.innerHTML = "";

  list.forEach((i) => {
    if (!i || !i.id) return;
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

  pocketEmpty.classList.toggle("visible", pocketList.children.length === 0);
}

// 上スワイプで完了。「預ける」と同じく、言葉ではなく動きで手放す
let pendingComplete = null; // { item, li, timer }
const SWIPE_THRESHOLD = -60;

function attachSwipe(li, item) {
  let startY = null;
  let deltaY = 0;

  li.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    li.style.transition = "none";
  }, { passive: true });

  li.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    deltaY = e.touches[0].clientY - startY;
    if (deltaY < 0) {
      li.style.transform = `translateY(${deltaY}px)`;
      li.style.opacity = String(Math.max(0, 1 + deltaY / 120));
    }
  }, { passive: true });

  li.addEventListener("touchend", () => {
    li.style.transition = "transform 0.25s ease, opacity 0.25s ease";
    if (deltaY < SWIPE_THRESHOLD) {
      completeItem(item, li);
    } else {
      li.style.transform = "";
      li.style.opacity = "";
    }
    startY = null;
    deltaY = 0;
  });
}

function completeItem(item, li) {
  finalizePending(); // 前の1件がまだ猶予中なら、先に確定させてから次へ

  li.style.transform = "translateY(-40px)";
  li.style.opacity = "0";
  li.style.pointerEvents = "none";

  undoToast.hidden = false;
  requestAnimationFrame(() => undoToast.classList.add("visible"));

  pendingComplete = {
    item,
    li,
    timer: setTimeout(() => finalizePending(), 4000)
  };
}

function finalizePending() {
  if (!pendingComplete) return;
  const { item, timer } = pendingComplete;
  clearTimeout(timer);
  pendingComplete = null;
  hideUndoToast();

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "complete", id: item.id })
  }).catch(() => {});
}

function undoPending() {
  if (!pendingComplete) return;
  const { timer, li } = pendingComplete;
  clearTimeout(timer);
  li.style.transform = "";
  li.style.opacity = "";
  li.style.pointerEvents = "";
  pendingComplete = null;
  hideUndoToast();
}

function hideUndoToast() {
  undoToast.classList.remove("visible");
  setTimeout(() => { undoToast.hidden = true; }, 200);
}

undoToast.addEventListener("click", () => undoPending());


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
