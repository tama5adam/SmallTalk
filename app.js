/*
 * SmallTalk – application logic
 * Reads all content from window.SMALLTALK_DATA (see data.js).
 */
(function () {
  "use strict";

  /* ---------- Config ---------- */
  const LEVEL_LABELS = { b2: "B2", c1: "C1" };
  const TYPES = {
    respond: {
      badge: "[ Respond to Question ]",
      exportTitle: "Question → Response",
      submissionLabel: "Student's written response",
      hint: "Write about 2 sentences.",
      placeholder: "Your answer...",
    },
    formulate: {
      badge: "[ Formulate the Question ]",
      exportTitle: "Answer → Question",
      submissionLabel: "Student's written question",
      hint: "Write the question that fits this statement (one clear question).",
      placeholder: "Your question...",
    },
  };

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const screens = { setup: $("setup-screen"), practice: $("practice-screen"), done: $("done-screen") };
  const el = {
    start: $("start-btn"), setupError: $("setup-error"),
    tracker: $("round-tracker"), progress: $("progress"), fill: $("progress-fill"),
    badge: $("type-badge"), prompt: $("prompt-box"),
    label: $("input-label"), input: $("answer-input"), hint: $("input-hint"),
    next: $("next-btn"), quit: $("quit-btn"),
    statLevel: $("stat-level"), statRounds: $("stat-rounds"), statWords: $("stat-words"),
    exportBtn: $("export-btn"), again: $("again-btn"),
  };

  /* ---------- State ---------- */
  let session = null; // { level, total, index, rounds: [{type, prompt, answer}] }

  /* ---------- Helpers ---------- */
  const showScreen = (name) => {
    Object.entries(screens).forEach(([key, node]) => { node.hidden = key !== name; });
  };

  const shuffle = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Take n unique items; if the pool is smaller than n, reshuffle and reuse.
  const sample = (pool, n) => {
    const out = [];
    while (out.length < n) out.push(...shuffle(pool));
    return out.slice(0, n);
  };

  const countWords = (text) => (text.match(/\S+/g) || []).length;
  const pad = (n) => String(n).padStart(2, "0");

  function getPools(level) {
    const data = window.SMALLTALK_DATA && window.SMALLTALK_DATA[level];
    const ok = data && Array.isArray(data.questions) && data.questions.length &&
               Array.isArray(data.answers) && data.answers.length;
    return ok ? data : null;
  }

  /* ---------- Session ---------- */
  function buildRounds(level, total) {
    const pools = getPools(level);
    const respondCount = Math.ceil(total / 2);
    const formulateCount = total - respondCount;
    const respond = sample(pools.questions, respondCount).map((prompt) => ({ type: "respond", prompt, answer: "" }));
    const formulate = sample(pools.answers, formulateCount).map((prompt) => ({ type: "formulate", prompt, answer: "" }));
    return shuffle(respond.concat(formulate));
  }

  function startSession() {
    const level = document.querySelector('input[name="level"]:checked').value;
    const total = Number(document.querySelector('input[name="rounds"]:checked').value);

    if (!getPools(level)) {
      el.setupError.textContent = "No prompts found for this level. Check data.js is loaded before app.js and both arrays are filled.";
      el.setupError.hidden = false;
      return;
    }
    el.setupError.hidden = true;

    session = { level, total, index: 0, rounds: buildRounds(level, total) };
    showScreen("practice");
    renderRound();
  }

  function renderRound() {
    const round = session.rounds[session.index];
    const cfg = TYPES[round.type];
    const pct = Math.round((session.index / session.total) * 100);

    el.tracker.textContent = `Round ${session.index + 1} / ${session.total}`;
    el.fill.style.width = pct + "%";
    el.progress.setAttribute("aria-valuenow", String(pct));

    el.badge.textContent = cfg.badge;
    el.badge.classList.toggle("badge--respond", round.type === "respond");

    el.prompt.textContent = round.prompt;
    el.prompt.classList.remove("is-entering");
    void el.prompt.offsetWidth; // restart animation
    el.prompt.classList.add("is-entering");

    el.label.textContent = round.type === "respond" ? "Your response" : "Your question";
    el.hint.textContent = cfg.hint;
    el.input.placeholder = cfg.placeholder;
    el.input.value = "";
    el.next.textContent = session.index === session.total - 1 ? "Finish" : "Next";
    validate();
    el.input.focus();
  }

  // Input validation: the Next button is only enabled when there is real text.
  function validate() {
    el.next.disabled = el.input.value.trim().length === 0;
  }

  function submitRound() {
    const text = el.input.value.trim();
    if (!text) return; // guard against Enter-key shortcut on empty input

    session.rounds[session.index].answer = text;
    session.index += 1;

    if (session.index >= session.total) {
      el.fill.style.width = "100%";
      finishSession();
    } else {
      renderRound();
    }
  }

  function finishSession() {
    el.statLevel.textContent = LEVEL_LABELS[session.level];
    el.statRounds.textContent = session.total;
    el.statWords.textContent = session.rounds.reduce((sum, r) => sum + countWords(r.answer), 0);
    showScreen("done");
  }

  /* ---------- Markdown export ---------- */
  function buildMarkdown(now) {
    const header = [
      "# SmallTalk Session",
      "",
      `- **Level:** ${LEVEL_LABELS[session.level]}`,
      `- **Total rounds:** ${session.total}`,
      `- **Timestamp:** ${now.toLocaleString()}`,
      "",
      "---",
      "",
    ].join("\n");

    const quote = (text) => text.split(/\r?\n/).map((line) => "> " + line).join("\n");

    const body = session.rounds.map((round, i) => {
      const cfg = TYPES[round.type];
      return [
        `## ${i + 1}. ${cfg.exportTitle}`,
        "",
        "**System prompt:**",
        quote(round.prompt),
        "",
        `**${cfg.submissionLabel}:**`,
        quote(round.answer),
        "",
      ].join("\n");
    }).join("\n");

    return header + body;
  }

  function downloadMarkdown() {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const blob = new Blob([buildMarkdown(now)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smalltalk-session-${stamp}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Events ---------- */
  el.start.addEventListener("click", startSession);
  el.next.addEventListener("click", submitRound);
  el.input.addEventListener("input", validate);
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitRound();
  });
  el.quit.addEventListener("click", () => {
    if (window.confirm("Quit this session? Your answers will be lost.")) showScreen("setup");
  });
  el.exportBtn.addEventListener("click", downloadMarkdown);
  el.again.addEventListener("click", () => showScreen("setup"));
})();
