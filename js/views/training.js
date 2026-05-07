/**
 * training.js — Træningsvisning (flashcards)
 *
 * To skærme:
 *   1. Forsiden ("/training") — vælg spiltype + filtre + start
 *   2. Aktiv træning ("/training/active") — flashcards
 *
 * Spiltyper:
 *   - arter            → flashcard med billeder + felttekst (klassisk)
 *   - feltkendetegn    → vis Feltkendetegn-tekst, gæt arten
 *   - husk_feltkendetegn → vis artsnavn, gæt Feltkendetegn
 *   - multi            → multiple choice (3 valg fra samme familie)
 *   Hver kan køres i normal mode eller 20-pulje (lærings-runde med gentagelse)
 *   + ny mode: "svaere" → kun arter markeret som svære
 *
 * 20-pulje med gentagelse:
 *   Trækker 20 tilfældige arter. Forkert svar → arten gentages senere.
 *   Score viser "X / 20 lært" (unikke arter gættet rigtigt).
 *   Når alle 20 er lært, starter en ny runde automatisk.
 */

import {
  getData,
  getImageUrls,
  getHardSpecies,
  toggleHardSpecies,
  isHardSpecies,
} from "../data.js";


const state = {
  gameType: "arter",       // "arter" | "feltkendetegn" | "husk_feltkendetegn" | "multi"
  roundMode: false,        // 20-pulje?
  hardOnly: false,         // kun "svære" arter?
  filters: {
    habitattype: [],
    familie: [],
  },
  // Aktiv runde
  pool: [],
  currentCard: null,
  currentFields: [],
  currentFieldIndex: 0,
  scoreCorrect: 0,
  scoreTotal: 0,
  // Round-mode state
  roundQueue: [],          // arter i kø — kommer fra front, forkerte tilbage til mid
  roundLearned: new Set(), // titler der er gættet rigtigt (unikke)
  roundSize: 0,
  // Modal
  answerOpen: false,
  // Multi-choice state
  multiChoices: [],        // [{title, correct: bool}, ...]
  multiAnswered: false,    // har brugeren valgt et svar?
};

const ROUND_POOL_SIZE = 20;
const REINSERT_MIN = 3;    // forkert svar — sæt tilbage min antal pladser frem
const REINSERT_MAX = 7;


// =============================================================================
// MAIN ENTRY
// =============================================================================

export function renderTraining(container, mode) {
  if (mode === "active") {
    renderActiveGame(container);
    return;
  }
  if (mode === "svaere") {
    state.hardOnly = true;
    state.gameType = "arter";
    state.roundMode = false;
    startGame();
    renderActiveGame(container);
    return;
  }
  renderSelectionScreen(container);
}


// =============================================================================
// SKÆRM 1: VALG AF SPILTYPE OG FILTRE
// =============================================================================

function renderSelectionScreen(container) {
  const { arter } = getData();
  const hardCount = getHardSpecies().length;
  const habitatypes = collectHabitattypes(arter);
  const familier = collectFamilier(arter);

  container.innerHTML = `
    <div class="view view-training-select">
      <header class="topbar">
        <a href="#/" class="topbar-back">← Tilbage</a>
        <h1 class="topbar-title">Træning</h1>
      </header>

      <main class="training-select">
        <section class="train-section">
          <h2>Spiltype</h2>
          <div class="game-type-grid">
            ${gameTypeCard("arter", "Arter", "Se billeder + tekst, gæt arten")}
            ${gameTypeCard("multi", "Multiple choice", "Tre svar fra samme familie")}
            ${gameTypeCard("feltkendetegn", "Feltkendetegn", "Læs feltkendetegn, gæt arten")}
            ${gameTypeCard("husk_feltkendetegn", "Husk feltkendetegn", "Se art, husk feltkendetegnet")}
          </div>
        </section>

        <section class="train-section">
          <h2>Mode</h2>
          <label class="check-row">
            <input type="checkbox" id="round20" ${state.roundMode ? "checked" : ""} />
            <span>20 ad gangen <span class="hint">(gentages indtil alle er rigtige)</span></span>
          </label>
          ${hardCount > 0 ? `
            <label class="check-row">
              <input type="checkbox" id="hardOnly" ${state.hardOnly ? "checked" : ""} />
              <span>Kun svære arter <span class="hint">(${hardCount} markeret)</span></span>
            </label>
          ` : ""}
        </section>

        ${!state.hardOnly ? `
          <section class="train-section">
            <h2>Filtre <span class="hint">(valgfrit)</span></h2>

            <details class="filter-section">
              <summary>Habitattype <span class="hint">(${state.filters.habitattype.length} valgt)</span></summary>
              <div class="checkbox-list" id="habitatList">
                ${habitatypes.map(h => `
                  <label class="check-row">
                    <input type="checkbox" data-habitat="${escapeAttr(h)}"
                           ${state.filters.habitattype.includes(h) ? "checked" : ""} />
                    <span>${h}</span>
                  </label>
                `).join("")}
              </div>
            </details>

            <details class="filter-section">
              <summary>Familie <span class="hint">(${state.filters.familie.length} valgt)</span></summary>
              <div class="checkbox-list" id="familieList">
                ${familier.map(f => `
                  <label class="check-row">
                    <input type="checkbox" data-familie="${escapeAttr(f)}"
                           ${state.filters.familie.includes(f) ? "checked" : ""} />
                    <span>${f}</span>
                  </label>
                `).join("")}
              </div>
            </details>
          </section>
        ` : ""}

        <button id="startBtn" class="btn-primary btn-large">Start træning</button>
      </main>
    </div>
  `;

  document.querySelectorAll("[data-game-type]").forEach(el => {
    el.addEventListener("click", () => {
      state.gameType = el.dataset.gameType;
      renderSelectionScreen(container);
    });
  });

  document.getElementById("round20")?.addEventListener("change", e => {
    state.roundMode = e.target.checked;
  });

  document.getElementById("hardOnly")?.addEventListener("change", e => {
    state.hardOnly = e.target.checked;
    renderSelectionScreen(container);
  });

  document.querySelectorAll("[data-habitat]").forEach(el => {
    el.addEventListener("change", () => {
      const v = el.dataset.habitat;
      if (el.checked) {
        if (!state.filters.habitattype.includes(v)) state.filters.habitattype.push(v);
      } else {
        state.filters.habitattype = state.filters.habitattype.filter(x => x !== v);
      }
    });
  });

  document.querySelectorAll("[data-familie]").forEach(el => {
    el.addEventListener("change", () => {
      const v = el.dataset.familie;
      if (el.checked) {
        if (!state.filters.familie.includes(v)) state.filters.familie.push(v);
      } else {
        state.filters.familie = state.filters.familie.filter(x => x !== v);
      }
    });
  });

  document.getElementById("startBtn").addEventListener("click", () => {
    startGame();
    window.location.hash = "#/training/active";
  });
}


function gameTypeCard(type, label, desc) {
  const active = state.gameType === type;
  return `
    <button class="game-type-card ${active ? "active" : ""}" data-game-type="${type}" type="button">
      <div class="game-type-label">${label}</div>
      <div class="game-type-desc">${desc}</div>
    </button>
  `;
}


// =============================================================================
// START AF SPIL — opbyg pulje
// =============================================================================

function startGame() {
  const { arter } = getData();
  let pool = arter.slice();

  // Hard-only filter
  if (state.hardOnly) {
    const hardSet = new Set(getHardSpecies());
    pool = pool.filter(a => hardSet.has(a.Title));
  } else {
    if (state.filters.habitattype.length) {
      pool = pool.filter(a => {
        const ht = String(a.Habitattype || "");
        const parts = ht.split(/[;,/]/).map(s => s.trim()).filter(Boolean);
        return state.filters.habitattype.some(sel => parts.includes(sel));
      });
    }
    if (state.filters.familie.length) {
      pool = pool.filter(a => state.filters.familie.includes(a.familie || a.Familie));
    }
  }

  // Spiltype-specifikke filtre
  if (state.gameType === "feltkendetegn" || state.gameType === "husk_feltkendetegn") {
    pool = pool.filter(a => isNonEmpty(a.Feltkendetegn));
  }
  // Multi-choice: kræver at vi kan finde mindst 2 distractors fra samme
  // slægt eller familie. Vi prøver at finde dem her — hvis arten ikke har
  // tilstrækkelige distractors, springes den over.
  if (state.gameType === "multi") {
    pool = pool.filter(a => hasEnoughDistractors(a, arter));
  }

  state.pool = pool;
  state.scoreCorrect = 0;
  state.scoreTotal = 0;
  state.currentCard = null;
  state.currentFields = [];
  state.currentFieldIndex = 0;
  state.answerOpen = false;
  state.multiAnswered = false;
  state.multiChoices = [];

  if (state.roundMode) {
    rebuildRoundPool();
  }
}


function rebuildRoundPool() {
  state.roundQueue = shuffle(state.pool.slice()).slice(0, ROUND_POOL_SIZE);
  state.roundSize = state.roundQueue.length;
  state.roundLearned = new Set();
  state.scoreCorrect = 0;
  state.scoreTotal = 0;
}


// =============================================================================
// SKÆRM 2: AKTIV TRÆNING
// =============================================================================

function renderActiveGame(container) {
  if (!state.pool.length) {
    container.innerHTML = `
      <div class="view">
        <header class="topbar">
          <a href="#/training" class="topbar-back">← Tilbage</a>
          <h1 class="topbar-title">Træning</h1>
        </header>
        <main>
          <p class="empty">Ingen arter matcher dine filtre.</p>
          <button class="btn-primary" onclick="window.location.hash='#/training'">Vælg igen</button>
        </main>
      </div>
    `;
    return;
  }

  if (!state.currentCard) {
    pickNextCard();
    if (!state.currentCard) return; // Round-end blev kaldt
  }

  // Multi-choice mode bruger SAMME flashcard layout som arter-mode,
  // men med en "Vis svarmuligheder"-knap der åbner en modal med 3 valg.

  // Klassisk flashcard layout
  const isMulti = state.gameType === "multi";
  const showAnswerLabel = isMulti ? "Vis svarmuligheder" : "Vis svar";

  container.innerHTML = `
    <div class="view view-training-active">
      <header class="topbar">
        <a href="#/training" class="topbar-back">← Skift</a>
        <h1 class="topbar-title" id="trainTitle">${gameTypeLabel(state.gameType)}${state.hardOnly ? " · Svære" : ""}</h1>
        <button id="markHardBtn" class="hard-toggle" aria-label="Marker som svær">☆</button>
      </header>

      <main class="training-main">
        <div class="train-card" id="trainCard">
          <div class="score-badge" id="scoreBadge">0/0</div>
          <div class="train-field-label" id="fieldLabel"></div>
          <div class="train-field-content" id="fieldContent"></div>
          <div class="train-hint" id="trainHint">Tap for at se næste felt</div>
        </div>

        <div class="train-actions">
          <button id="prevFieldBtn" class="btn-secondary">← Forrige</button>
          <button id="showAnswerBtn" class="btn-primary">${showAnswerLabel}</button>
          <button id="nextFieldBtn" class="btn-secondary">Næste →</button>
        </div>
      </main>

      ${isMulti ? `
        <div id="multiModal" class="answer-modal hidden">
          <div class="answer-modal-content multi-modal-content">
            <button id="closeMultiBtn" class="answer-close" aria-label="Luk svarmuligheder">×</button>
            <h2 class="multi-modal-title">Hvilken art er det?</h2>
            <div id="multiChoices" class="multi-choices"></div>
          </div>
        </div>
      ` : `
        <div id="answerModal" class="answer-modal hidden">
          <div class="answer-modal-content">
            <button id="closeAnswerBtn" class="answer-close" aria-label="Luk svar">×</button>
            <h2 id="answerTitle"></h2>
            <p id="answerFamily" class="answer-family"></p>
            <div class="answer-actions">
              <button id="answerWrongBtn" class="btn-wrong">✗ Forkert</button>
              <button id="answerRightBtn" class="btn-right">✓ Rigtig</button>
            </div>
          </div>
        </div>
      `}
    </div>
  `;

  if (isMulti) {
    bindMultiChoiceGame();
  } else {
    bindActiveGame();
  }
  renderCurrentField();
  updateScore();
  updateHardToggle();

  // Hvis svaret skal være åbent (vedvarer mellem renders), genåbn det
  if (state.answerOpen && !isMulti) {
    openAnswer();
  }
}


function bindActiveGame() {
  const cardEl = document.getElementById("trainCard");
  const contentEl = document.getElementById("fieldContent");

  // Klik & dobbeltklik
  let clickTimer = null;
  cardEl.addEventListener("click", e => {
    if (e.target.closest("button")) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      openAnswer();
      return;
    }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      nextField();
    }, 220);
  });

  document.getElementById("prevFieldBtn").addEventListener("click", prevField);
  document.getElementById("nextFieldBtn").addEventListener("click", nextField);

  // Vis/skjul svar (toggle)
  const showBtn = document.getElementById("showAnswerBtn");
  showBtn.addEventListener("click", () => {
    if (state.answerOpen) {
      closeAnswer();
    } else {
      openAnswer();
    }
  });

  // Luk-knap i modalen
  document.getElementById("closeAnswerBtn").addEventListener("click", () => {
    closeAnswer();
  });

  document.getElementById("answerWrongBtn").addEventListener("click", () => {
    recordAnswer(false);
  });
  document.getElementById("answerRightBtn").addEventListener("click", () => {
    recordAnswer(true);
  });

  document.getElementById("markHardBtn").addEventListener("click", () => {
    if (!state.currentCard) return;
    toggleHardSpecies(state.currentCard.Title);
    updateHardToggle();
  });

  setupSwipeGestures(cardEl, contentEl);
}


// =============================================================================
// SWIPE GESTURES
// =============================================================================

function setupSwipeGestures(cardEl, contentEl) {
  const thresholdX = 40;
  const thresholdY = 70;
  const maxSideDrift = 35;

  let touchStartX = null;
  let touchStartY = null;
  let touchStartInBottomZone = false;
  let touchStartInTopZone = false;
  let gestureCancelled = false;
  let touchId = null;

  function reset() {
    touchStartX = null;
    touchStartY = null;
    touchStartInBottomZone = false;
    touchStartInTopZone = false;
    gestureCancelled = false;
    touchId = null;
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) {
      gestureCancelled = true;
      reset();
      return;
    }
    gestureCancelled = false;
    const t = e.touches[0];
    touchId = t.identifier;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    const zonePx = Math.max(90, window.innerHeight * 0.15);
    touchStartInTopZone = touchStartY < zonePx;
    touchStartInBottomZone = touchStartY > (window.innerHeight - zonePx);
  }

  function onTouchMove(e) {
    if (e.touches.length > 1) {
      gestureCancelled = true;
      return;
    }
    if (gestureCancelled) return;
    if (touchStartX === null || touchStartY === null) return;

    const t = Array.from(e.touches).find(tt => tt.identifier === touchId)
              || e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (
      touchStartInTopZone &&
      dy > 0 &&
      absDy > absDx * 1.2 &&
      absDx < maxSideDrift &&
      contentEl.scrollTop === 0
    ) {
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (touchStartX === null || touchStartY === null) return;
    if (gestureCancelled) {
      reset();
      return;
    }

    const t = Array.from(e.changedTouches).find(tt => tt.identifier === touchId)
              || e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // RIGTIGT: swipe op fra bunden
    if (
      touchStartInBottomZone &&
      dy < -thresholdY &&
      absDy > absDx * 1.2 &&
      absDx < maxSideDrift
    ) {
      if (contentEl.scrollTop === 0) {
        if (!isAnswerModalOpen()) openAnswer();
        recordAnswer(true);
        reset();
        return;
      }
    }

    // FORKERT: swipe ned fra toppen
    if (
      touchStartInTopZone &&
      dy > thresholdY &&
      absDy > absDx * 1.2 &&
      absDx < maxSideDrift
    ) {
      if (contentEl.scrollTop === 0) {
        if (!isAnswerModalOpen()) openAnswer();
        recordAnswer(false);
        reset();
        return;
      }
    }

    if (absDx > absDy && absDx > thresholdX) {
      if (dx > 0) prevField();
      else nextField();
    }

    reset();
  }

  function onTouchCancel() { reset(); }

  [cardEl, contentEl].forEach(el => {
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
  });
}


function isAnswerModalOpen() {
  const m = document.getElementById("answerModal");
  return m && !m.classList.contains("hidden");
}


function updateHardToggle() {
  const btn = document.getElementById("markHardBtn");
  if (!btn || !state.currentCard) return;
  const isHard = isHardSpecies(state.currentCard.Title);
  btn.textContent = isHard ? "★" : "☆";
  btn.classList.toggle("is-hard", isHard);
}


// =============================================================================
// KORTVALG OG FELT-OPBYGNING
// =============================================================================

function pickNextCard() {
  let card;
  let safetyCounter = 0;
  while (true) {
    safetyCounter++;
    if (safetyCounter > 100) {
      // Sikkerhedsbræk — burde aldrig ske
      console.error("[training] pickNextCard: kunne ikke finde gyldigt kort");
      state.currentCard = null;
      return;
    }

    if (state.roundMode) {
      if (state.roundQueue.length === 0) {
        showRoundEnd();
        state.currentCard = null;
        return;
      }
      card = state.roundQueue.shift();
    } else {
      card = state.pool[Math.floor(Math.random() * state.pool.length)];
    }

    // For multi-choice: sikr at vi kan bygge svarmuligheder
    if (state.gameType === "multi") {
      const choices = buildMultiChoices(card);
      if (!choices) {
        // Spring over og prøv næste
        continue;
      }
      state.multiChoices = choices;
    }
    break;
  }

  state.currentCard = card;
  state.currentFields = buildFieldsForCard(card);
  state.currentFieldIndex = 0;
  state.answerOpen = false;
  state.multiAnswered = false;

  if (!state.currentFields.length) {
    state.currentFields = [{ type: "text", label: "Info", text: "Ingen data for denne art." }];
  }
}


function buildFieldsForCard(card) {
  const fields = [];
  const imgs = getImageUrls(card);

  if (state.gameType === "feltkendetegn") {
    if (isNonEmpty(card.Feltkendetegn)) {
      fields.push({
        type: "text",
        label: "Feltkendetegn",
        text: String(card.Feltkendetegn).trim(),
      });
    }
    if (imgs.length) {
      const pick = imgs[Math.floor(Math.random() * imgs.length)];
      fields.push({ type: "image", label: "Billede", src: pick });
    }
    return fields;
  }

  if (state.gameType === "husk_feltkendetegn") {
    fields.push({
      type: "text-big",
      label: "Artsnavn",
      text: card.Title || "Ukendt",
    });
    if (imgs.length) {
      const pick = imgs[Math.floor(Math.random() * imgs.length)];
      fields.push({ type: "image", label: "Billede", src: pick });
    }
    return fields;
  }

  // Default: arter eller multi — vis billeder + tekstfelter
  imgs.slice(0, 5).forEach((src, i) => {
    fields.push({ type: "image", label: `Billede ${i + 1}`, src });
  });

  if (isNonEmpty(card.Feltkendetegn)) {
    fields.push({
      type: "text",
      label: "Feltkendetegn",
      text: String(card.Feltkendetegn).trim(),
    });
  }

  const textFields = [
    { keys: ["Bog_Habitat", "Naturbasen_Habitat", "Habitat"], label: "Habitat" },
    { keys: ["Bog_Beskrivelse", "Naturbasen_Kendetegn", "Beskrivelser"], label: "Beskrivelse" },
    { keys: ["Naturbasen_Variation"], label: "Variation" },
    { keys: ["Bog_Forvekslingsmuligheder", "Naturbasen_Forvekslingsmuligheder", "Forvekslingsmuligheder"], label: "Forveksling" },
  ];

  for (const f of textFields) {
    let v = null;
    for (const k of f.keys) {
      if (isNonEmpty(card[k])) {
        v = card[k];
        break;
      }
    }
    if (isNonEmpty(v)) {
      fields.push({ type: "text", label: f.label, text: String(v).trim() });
    }
  }

  return fields;
}


function renderCurrentField() {
  const labelEl = document.getElementById("fieldLabel");
  const contentEl = document.getElementById("fieldContent");
  if (!labelEl || !contentEl || !state.currentFields.length) return;

  const field = state.currentFields[state.currentFieldIndex];
  labelEl.textContent = field.label;

  contentEl.classList.remove("big-center");
  if (field.type === "image") {
    const alt = state.currentCard?.Title || "Billede";
    contentEl.innerHTML = `<img loading="lazy" src="${field.src}" alt="${escapeAttr(alt)}" />`;
  } else if (field.type === "text-big") {
    contentEl.classList.add("big-center");
    contentEl.innerHTML = `<p>${escapeHtml(field.text)}</p>`;
  } else {
    contentEl.innerHTML = `<p>${escapeHtml(field.text)}</p>`;
  }

  const hint = document.getElementById("trainHint");
  if (hint) {
    hint.textContent = `${state.currentFieldIndex + 1} / ${state.currentFields.length}  ·  ← swipe →  felt   ·  ↑ rigtig   ·  ↓ forkert`;
  }
}


function nextField() {
  if (!state.currentFields.length) return;
  state.currentFieldIndex = (state.currentFieldIndex + 1) % state.currentFields.length;
  renderCurrentField();
}

function prevField() {
  if (!state.currentFields.length) return;
  state.currentFieldIndex =
    (state.currentFieldIndex - 1 + state.currentFields.length) % state.currentFields.length;
  renderCurrentField();
}


// =============================================================================
// SVAR-MODAL — toggle (åben/luk)
// =============================================================================

function openAnswer() {
  if (!state.currentCard) return;
  const modal = document.getElementById("answerModal");
  const titleEl = document.getElementById("answerTitle");
  const familyEl = document.getElementById("answerFamily");
  const showBtn = document.getElementById("showAnswerBtn");
  if (!modal) return;

  if (state.gameType === "husk_feltkendetegn") {
    const fk = state.currentCard.Feltkendetegn;
    titleEl.textContent = isNonEmpty(fk) ? String(fk).trim() : "Ingen feltkendetegn";
    familyEl.textContent = "";
    familyEl.classList.add("hidden");
  } else {
    titleEl.textContent = state.currentCard.Title || "Ukendt";
    const fam = state.currentCard.familie || state.currentCard.Familie;
    if (fam) {
      familyEl.textContent = fam;
      familyEl.classList.remove("hidden");
    } else {
      familyEl.classList.add("hidden");
    }
  }
  modal.classList.remove("hidden");
  state.answerOpen = true;
  if (showBtn) showBtn.textContent = "Skjul svar";
}


function closeAnswer() {
  const modal = document.getElementById("answerModal");
  const showBtn = document.getElementById("showAnswerBtn");
  if (modal) modal.classList.add("hidden");
  state.answerOpen = false;
  if (showBtn) showBtn.textContent = "Vis svar";
}


function recordAnswer(correct) {
  state.scoreTotal += 1;
  if (correct) state.scoreCorrect += 1;

  // I round-mode: håndter learnings + gentagelse
  if (state.roundMode) {
    const title = state.currentCard.Title;
    if (correct) {
      state.roundLearned.add(title);
    } else {
      // Forkert — sæt arten tilbage i køen et tilfældigt sted (3-7 frem)
      requeueCardForLater(state.currentCard);
    }
  }

  closeAnswer();

  pickNextCard();
  if (state.currentCard) {
    renderCurrentField();
    updateScore();
    updateHardToggle();
  }
}


/**
 * Indsæt arten tilbage i roundQueue på en tilfældig position 3-7 frem
 * (eller bagest hvis køen er kortere). Kort tilbage = mere intens gentagelse.
 */
function requeueCardForLater(card) {
  const q = state.roundQueue;
  if (q.length <= REINSERT_MIN) {
    q.push(card);
    return;
  }
  const max = Math.min(q.length, REINSERT_MAX);
  const min = Math.min(q.length, REINSERT_MIN);
  const pos = Math.floor(Math.random() * (max - min + 1)) + min;
  q.splice(pos, 0, card);
}


function showRoundEnd() {
  const main = document.querySelector(".training-main");
  if (!main) return;

  // Auto-start ny runde efter kort delay (med mulighed for at afbryde)
  main.innerHTML = `
    <div class="round-end">
      <h2>🎉 Runde gennemført!</h2>
      <p class="big-score">${state.roundLearned.size} / ${state.roundSize} lært</p>
      <p class="hint">Forsøg i alt: ${state.scoreTotal} (${state.scoreTotal - state.roundLearned.size} gentagelser)</p>
      <p class="hint" id="autoStartHint">Ny runde starter om 3 sekunder...</p>
      <div class="train-actions">
        <button id="newRoundBtn" class="btn-primary">Ny runde nu</button>
        <button id="backToSelectBtn" class="btn-secondary">Skift spiltype</button>
      </div>
    </div>
  `;

  let autoStartTimer = setTimeout(() => {
    rebuildRoundPool();
    state.currentCard = null;
    renderActiveGame(document.getElementById("app"));
  }, 3000);

  document.getElementById("newRoundBtn").addEventListener("click", () => {
    clearTimeout(autoStartTimer);
    rebuildRoundPool();
    state.currentCard = null;
    renderActiveGame(document.getElementById("app"));
  });
  document.getElementById("backToSelectBtn").addEventListener("click", () => {
    clearTimeout(autoStartTimer);
    window.location.hash = "#/training";
  });
}


function updateScore() {
  const el = document.getElementById("scoreBadge");
  if (!el) return;
  if (state.roundMode) {
    el.textContent = `${state.roundLearned.size} / ${state.roundSize} lært`;
  } else {
    el.textContent = `${state.scoreCorrect}/${state.scoreTotal}`;
  }
  el.classList.remove("score-good", "score-bad", "score-neutral");
  if (state.scoreTotal === 0) {
    el.classList.add("score-neutral");
  } else if (state.scoreCorrect / state.scoreTotal >= 0.5) {
    el.classList.add("score-good");
  } else {
    el.classList.add("score-bad");
  }
}


// =============================================================================
// MULTIPLE CHOICE MODE
// =============================================================================

/**
 * Tjek om en art har nok distractors til multi-choice (mindst 2):
 *   - først fra samme slægt (samme niveau)
 *   - hvis ikke nok: fra samme familie
 * Bruges som forfilter ved spil-start.
 */
function hasEnoughDistractors(card, allArter) {
  const correctTitle = card.Title;
  const niveau = card.niveau;
  const sl = card.slægt;
  const fam = card.familie || card.Familie;

  let count = 0;
  if (sl) {
    for (const a of allArter) {
      if (a.Title !== correctTitle && a.niveau === niveau && a.slægt === sl) {
        count++;
        if (count >= 2) return true;
      }
    }
  }
  if (fam) {
    for (const a of allArter) {
      if (a.Title === correctTitle) continue;
      if (a.niveau !== niveau) continue;
      if (sl && a.slægt === sl) continue;  // allerede talt
      const af = a.familie || a.Familie;
      if (af === fam) {
        count++;
        if (count >= 2) return true;
      }
    }
  }
  return false;
}


/**
 * Byg 3 valgmuligheder: 1 rigtig + 2 distractors.
 * Strikst prioritet: først samme slægt, derefter familie.
 * Aldrig tilfældige fra hele datasættet.
 */
function buildMultiChoices(card) {
  const { arter } = getData();
  const correctTitle = card.Title;
  const niveau = card.niveau;
  const sl = card.slægt;
  const fam = card.familie || card.Familie;

  // Først: samme slægt
  let distractorCandidates = [];
  if (sl) {
    distractorCandidates = arter.filter(a =>
      a.Title !== correctTitle &&
      a.niveau === niveau &&
      a.slægt === sl
    );
  }

  // Bland og tag op til 2 fra slægten
  let chosen = shuffle(distractorCandidates).slice(0, 2);

  // Hvis ikke nok i slægten, suppler fra familien (uden dubletter)
  if (chosen.length < 2 && fam) {
    const usedTitles = new Set(chosen.map(a => a.Title));
    usedTitles.add(correctTitle);
    const familieCandidates = arter.filter(a =>
      a.niveau === niveau &&
      !usedTitles.has(a.Title) &&
      (a.familie || a.Familie) === fam
    );
    const need = 2 - chosen.length;
    chosen = chosen.concat(shuffle(familieCandidates).slice(0, need));
  }

  // Hvis vi stadig ikke har 2 (skulle ikke ske pga. hasEnoughDistractors-filter,
  // men sikkerhed): returnér null så caller kan springe over
  if (chosen.length < 2) {
    return null;
  }

  // Saml + bland
  const choices = [
    { title: correctTitle, correct: true },
    { title: chosen[0].Title, correct: false },
    { title: chosen[1].Title, correct: false },
  ];
  return shuffle(choices);
}


function bindMultiChoiceGame() {
  // Multi bruger SAMME card-interaktion som klassisk mode (klik = næste felt,
  // dobbeltklik = åbn svarmuligheder), plus knapperne.
  const cardEl = document.getElementById("trainCard");
  const contentEl = document.getElementById("fieldContent");

  let clickTimer = null;
  cardEl.addEventListener("click", e => {
    if (e.target.closest("button")) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      openMultiModal();
      return;
    }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      nextField();
    }, 220);
  });

  document.getElementById("prevFieldBtn").addEventListener("click", prevField);
  document.getElementById("nextFieldBtn").addEventListener("click", nextField);

  // Vis svarmuligheder-knap
  document.getElementById("showAnswerBtn").addEventListener("click", () => {
    openMultiModal();
  });

  // Luk-knap
  document.getElementById("closeMultiBtn").addEventListener("click", () => {
    closeMultiModal();
  });

  document.getElementById("markHardBtn").addEventListener("click", () => {
    if (!state.currentCard) return;
    toggleHardSpecies(state.currentCard.Title);
    updateHardToggle();
  });

  // Swipe venstre/højre for felt — ingen op/ned (det giver ikke mening i multi)
  setupSimpleSwipe(cardEl, contentEl);
}


function openMultiModal() {
  const modal = document.getElementById("multiModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  state.multiAnswered = false;
  renderMultiChoices();
}


function closeMultiModal() {
  const modal = document.getElementById("multiModal");
  if (modal) modal.classList.add("hidden");
}


function setupSimpleSwipe(cardEl, contentEl) {
  // Venstre/højre swipe → forrige/næste felt
  const thresholdX = 40;
  let startX = null, startY = null;

  cardEl.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) { startX = null; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  cardEl.addEventListener("touchend", e => {
    if (startX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > thresholdX) {
      if (dx > 0) prevField();
      else nextField();
    }
    startX = null;
  }, { passive: true });
}


function renderMultiChoices() {
  const wrap = document.getElementById("multiChoices");
  if (!wrap) return;
  wrap.innerHTML = state.multiChoices.map((c, i) => `
    <button type="button" class="multi-choice-btn" data-idx="${i}">
      ${escapeHtml(c.title)}
    </button>
  `).join("");

  wrap.querySelectorAll(".multi-choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.multiAnswered) return;
      const idx = parseInt(btn.dataset.idx, 10);
      handleMultiChoiceClick(idx);
    });
  });
}


function handleMultiChoiceClick(chosenIdx) {
  state.multiAnswered = true;
  const wrap = document.getElementById("multiChoices");
  const buttons = wrap.querySelectorAll(".multi-choice-btn");

  const chosen = state.multiChoices[chosenIdx];
  const correct = chosen.correct;

  // Markér visuelt: grøn for rigtigt svar, rød for forkert valgt
  buttons.forEach((btn, i) => {
    const c = state.multiChoices[i];
    btn.disabled = true;
    if (c.correct) {
      btn.classList.add("multi-choice-correct");
    } else if (i === chosenIdx) {
      btn.classList.add("multi-choice-wrong");
    }
  });

  // Vent så brugeren kan se feedback (2.5 sek), gå så videre
  setTimeout(() => {
    closeMultiModal();
    recordAnswer(correct);
  }, 2500);
}


// =============================================================================
// HJÆLPERE
// =============================================================================

function gameTypeLabel(t) {
  return ({
    arter: "Arter",
    feltkendetegn: "Feltkendetegn",
    husk_feltkendetegn: "Husk feltkendetegn",
    multi: "Multiple choice",
  })[t] || t;
}

function isNonEmpty(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function collectHabitattypes(arter) {
  const set = new Set();
  for (const a of arter) {
    if (!a.Habitattype) continue;
    String(a.Habitattype).split(/[;,/]/).forEach(p => {
      const v = p.trim();
      if (v) set.add(v);
    });
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "da"));
}

function collectFamilier(arter) {
  const set = new Set();
  for (const a of arter) {
    const f = a.familie || a.Familie;
    if (f) set.add(f);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "da"));
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
