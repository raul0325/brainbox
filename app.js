// ⚠️ 実際にGASをデプロイしたら、ここをWebアプリのURLに差し替える
const API_URL = "https://script.google.com/macros/s/AKfycbxSB2DgVoWWqVuI9LzgPTqYjQ_fRgAOYL-R6e4ym-jhGnxQa9zrjEasVPILmRIswayyTQ/exec";

const input = document.getElementById("input");
const micBtn = document.getElementById("mic");
const submitBtn = document.getElementById("submit");
const summaryBtn = document.getElementById("summary");
const todaySection = document.getElementById("today");
const todayList = document.getElementById("todayList");

let recognizing = false;
let recognition = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.onresult = (e) => {
    const text = Array.from(e.results).map(r => r[0].transcript).join("");
    input.value = text;
    autoResize();
    toggleSubmit();
  };
  recognition.onend = () => { recognizing = false; micBtn.classList.remove("active"); };
}

micBtn.addEventListener("click", () => {
  if (!recognition) return;
  if (recognizing) {
    recognition.stop();
  } else {
    recognition.start();
    recognizing = true;
    micBtn.classList.add("active");
  }
});

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
    body: JSON.stringify({ content: text })
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
