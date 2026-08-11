const API_URL = "https://script.google.com/macros/s/AKfycbxSB2DgVoWWqVuI9LzgPTqYjQ_fRgAOYL-R6e4ym-jhGnxQa9zrjEasVPILmRIswayyTQ/exec";

const input = document.getElementById("input");
const submitBtn = document.getElementById("submit");
const summaryBtn = document.getElementById("summary");
const todaySection = document.getElementById("today");
const todayList = document.getElementById("todayList");
const splash = document.getElementById("splash");
const micHint = document.getElementById("micHint");

// 起動時のブランド表示。少し見せてから消える。常時表示はしない
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

function submitEntry() {
  const text = input.value.trim();
  if (!text) return;

  if (navigator.vibrate) navigator.vibrate(8);

  // 預けた直後は言葉を出さない。文字が少し上へ動いて消えるだけ
  input.classList.add("leaving");
  setTimeout(() => {
    input.value = "";
    input.classList.remove("leaving");
    input.style.height = "auto";
    toggleSubmit();
  }, 350);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ content: text, inputType: "text" })
  }).then(() => loadSummary()).catch(() => {});
}

function loadSummary() {
  fetch(`${API_URL}?action=today`)
    .then(r => r.json())
    .then(data => {
      const count = data.items ? data.items.length : 0;
      summaryBtn.textContent = count > 0 ? `今日は${count}つ預かっています` : "";
      window._todayItems = data.items || [];
    })
    .catch(() => {});
}

summaryBtn.addEventListener("click", () => {
  const items = window._todayItems || [];
  if (items.length === 0) return;
  const opening = todaySection.hasAttribute("hidden");
  if (opening) {
    todayList.innerHTML = items.map(i => `<li>${escapeHtml(i.content)}</li>`).join("");
    todaySection.removeAttribute("hidden");
  } else {
    todaySection.setAttribute("hidden", "");
  }
  summaryBtn.setAttribute("aria-expanded", String(opening));
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

loadSummary();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
