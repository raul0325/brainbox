const API_URL = "https://script.google.com/macros/s/AKfycbxSB2DgVoWWqVuI9LzgPTqYjQ_fRgAOYL-R6e4ym-jhGnxQa9zrjEasVPILmRIswayyTQ/exec";

const input = document.getElementById("input");
const submitBtn = document.getElementById("submit");
const calendarBtn = document.getElementById("calendarBtn");
const dateInput = document.getElementById("dateInput");
const dateChip = document.getElementById("dateChip");
const pocketBtn = document.getElementById("pocket");
const sheet = document.getElementById("pocketSheet");
const overlay = document.getElementById("sheetOverlay");
const pocketList = document.getElementById("pocketList");
const pocketEmpty = document.getElementById("pocketEmpty");
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

// カレンダーアイコン → 日付を選ぶ。選ばなくてもよい任意項目
calendarBtn.addEventListener("click", () => {
  if (dateInput.showPicker) {
    dateInput.showPicker();
  } else {
    dateInput.click();
  }
});

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
    calendarBtn.classList.add("active");
  } else {
    dateChip.hidden = true;
    calendarBtn.classList.remove("active");
  }
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
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
  sheet.classList.remove("open");
  overlay.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function renderPocket(items) {
  pocketList.innerHTML = items.map(i => {
    const dateLabel = i.scheduledDate ? `<span class="pocketDate">${formatDate(i.scheduledDate)}</span>` : "";
    return `<li>${dateLabel}<span>${escapeHtml(i.content)}</span></li>`;
  }).join("");
  pocketEmpty.classList.toggle("visible", items.length === 0);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
