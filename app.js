/*
 * SmallTalk – application logic
 * Reads all content from window.SMALLTALK_DATA (see data.js).
 */
(function () {
  "use strict";

  /* ---------- Speaking config ---------- */
  const WORKER_URL = "";   // e.g. "https://smalltalk-whisper.YOURNAME.workers.dev" (empty = typing only)
  const TUTOR_EMAIL = "adamtamasmone@gmail.com";  // address the "Email tutor" button writes to

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
  const screens = { setup: $("setup-screen"), practice: $("practice-screen"), speaking: $("speaking-screen"), done: $("done-screen") };  const el = {
    start: $("start-btn"), setupError: $("setup-error"),
    tracker: $("round-tracker"), progress: $("progress"), fill: $("progress-fill"),
    badge: $("type-badge"), prompt: $("prompt-box"),
    label: $("input-label"), input: $("answer-input"), hint: $("input-hint"),
    next: $("next-btn"), quit: $("quit-btn"),
    statLevel: $("stat-level"), statRounds: $("stat-rounds"), statWords: $("stat-words"),
    exportBtn: $("export-btn"), again: $("again-btn"),
  };

    el.emailBtn = $("email-btn");
  const sp = {
    tracker: $("sp-tracker"), progress: $("sp-progress"), fill: $("sp-fill"),
    badge: $("sp-badge"), prompt: $("sp-prompt"), frame: $("sp-frame"),
    timer: $("sp-timer"), time: $("sp-time"), mic: $("sp-mic"), status: $("sp-status"),
    transcript: $("sp-transcript"), next: $("sp-next"), quit: $("sp-quit"),
  };
  const dlg = $("passcode-modal");

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
        if (document.querySelector('input[name="mode"]:checked').value === "speaking") { startSpeaking(level); return; }
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

    // Switch tutor icon: tutor2.png when a question is displayed, tutor1 otherwise
    const avatar = document.getElementById("avatar-img");
    if (avatar) avatar.src = round.type === "respond" ? "img/tutor2.png" : "img/tutor1.png";

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
        el.emailBtn.hidden = session.mode !== "speaking";
    showScreen("done");
  }

  /* ---------- Markdown export ---------- */

  if (session.mode === "speaking") return buildSpeakingMarkdown(now);

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
    link.download = `smalltalk-${session.mode === "speaking" ? "speaking-" : ""}session-${stamp}.md`;    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
     /* ---------- Speaking simulator ---------- */
  const PART_LABELS = { 1: "Part 1 · Interview", 2: "Part 2 · Long Turn", 3: "Part 3 · Collaborative Task", 4: "Part 4 · Discussion" };
  const PASS_KEY = "smalltalk_passcode";
  let recorder = null, timerId = null, afterPass = null;

  const getPass = () => { try { return sessionStorage.getItem(PASS_KEY) || ""; } catch { return ""; } };
  const setPass = (v) => { try { v ? sessionStorage.setItem(PASS_KEY, v) : sessionStorage.removeItem(PASS_KEY); } catch { /* ignore */ } };
  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

  function askPasscode(cb) {
    afterPass = cb;
    $("pass-input").value = "";
    dlg.showModal();
    $("pass-input").focus();
  }

  function buildSpeakingSteps(level) {
    const d = window.SMALLTALK_SPEAKING[level];
    const p1 = pickOne(d.part1), p2 = pickOne(d.part2), p3 = pickOne(d.part3);
    return [
      ...p1.questions.map((q) => ({ part: 1, prompt: q, seconds: 30 })),
      { part: 2, prompt: p2.task, photos: p2.photos, seconds: 60 },
      { part: 3, prompt: p3.task, options: p3.options, seconds: 120 },
      ...p3.discussion.map((q) => ({ part: 4, prompt: q, seconds: 45 })),
    ].map((s) => ({ ...s, answer: "" }));
  }

  function startSpeaking(level) {
    if (!window.SMALLTALK_SPEAKING || !window.SMALLTALK_SPEAKING[level]) {
      el.setupError.textContent = "No speaking prompts found. Check SMALLTALK_SPEAKING in data.js.";
      el.setupError.hidden = false;
      return;
    }
    el.setupError.hidden = true;
    if (WORKER_URL && !getPass()) { askPasscode(() => startSpeaking(level)); return; }

    const rounds = buildSpeakingSteps(level);
    session = { mode: "speaking", level, total: rounds.length, index: 0, rounds };
    showScreen("speaking");
    renderStep();
  }

  function renderStep() {
    stopRecording();
    const s = session.rounds[session.index];
    const pct = Math.round((session.index / session.total) * 100);

    sp.tracker.textContent = `Step ${session.index + 1} / ${session.total}`;
    sp.fill.style.width = pct + "%";
    sp.progress.setAttribute("aria-valuenow", String(pct));
    sp.badge.textContent = PART_LABELS[s.part];
    sp.badge.classList.add("badge--respond");
    sp.prompt.textContent = s.prompt;
    const avatar = $("avatar-img");
    if (avatar) avatar.src = "img/tutor2.png"; // examiner is asking

    sp.frame.replaceChildren();
    sp.frame.hidden = !(s.photos || s.options);
    (s.photos || []).forEach((p) => {
      const fig = document.createElement("figure");
      fig.className = "frame__photo";
      if (p.src) { const img = document.createElement("img"); img.src = p.src; img.alt = p.alt; fig.appendChild(img); }
      else fig.textContent = "📷 " + p.alt;
      sp.frame.appendChild(fig);
    });
    if (s.options) {
      const ul = document.createElement("ul");
      ul.className = "frame__options";
      s.options.forEach((o) => { const li = document.createElement("li"); li.textContent = o; ul.appendChild(li); });
      sp.frame.appendChild(ul);
    }

    sp.timer.style.width = "100%";
    sp.timer.classList.remove("is-low");
    sp.time.textContent = fmtTime(s.seconds * 1000);
    sp.transcript.value = "";
    sp.mic.disabled = !WORKER_URL;
    sp.status.textContent = WORKER_URL ? "Press REC, answer, then press again to stop." : "Transcription is not set up: type your answer below.";
    sp.next.textContent = session.index === session.total - 1 ? "Finish" : "Next";
    spValidate();
  }

  const fmtTime = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const spValidate = () => { sp.next.disabled = !sp.transcript.value.trim() || !!recorder; };

  function startTimer(seconds) {
    stopTimer();
    const end = Date.now() + seconds * 1000;
    timerId = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      sp.timer.style.width = (left / (seconds * 1000)) * 100 + "%";
      sp.timer.classList.toggle("is-low", left < 10000);
      sp.time.textContent = fmtTime(left);
      if (left === 0) stopRecording();
    }, 100);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  async function toggleMic() {
    if (recorder) { stopRecording(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        transcribe(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
      };
      mr.start();
      recorder = mr;
      sp.mic.classList.add("is-live");
      sp.mic.setAttribute("aria-pressed", "true");
      sp.mic.textContent = "■ STOP";
      sp.status.textContent = "Recording...";
      spValidate();
      startTimer(session.rounds[session.index].seconds);
    } catch {
      sp.status.textContent = "Microphone unavailable. Allow access, or type your answer below.";
    }
  }

  function stopRecording() {
    stopTimer();
    if (recorder) { const r = recorder; recorder = null; if (r.state !== "inactive") r.stop(); }
    sp.mic.classList.remove("is-live");
    sp.mic.setAttribute("aria-pressed", "false");
    sp.mic.textContent = "● REC";
  }

  async function transcribe(blob) {
    sp.status.textContent = "Transcribing...";
    sp.mic.disabled = true;
    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech." + (blob.type.includes("mp4") ? "mp4" : "webm"));
      const res = await fetch(WORKER_URL, { method: "POST", headers: { "X-Passcode": getPass() }, body: fd });
      if (res.status === 401) { setPass(""); askPasscode(null); throw new Error("Wrong passcode."); }
      if (!res.ok) throw new Error(`Transcription failed (${res.status}).`);
      const data = await res.json();
      sp.transcript.value = (data.text || "").trim();
      sp.status.textContent = "Transcript ready. Edit it if needed, then continue.";
    } catch (err) {
      sp.status.textContent = err.message + " You can type your answer instead.";
    } finally {
      sp.mic.disabled = false;
      spValidate();
    }
  }

  function submitStep() {
    const text = sp.transcript.value.trim();
    if (!text || recorder) return;
    session.rounds[session.index].answer = text;
    session.index += 1;
    if (session.index >= session.total) { stopRecording(); finishSession(); } else renderStep();
  }

  function buildSpeakingMarkdown(now) {
    const quote = (t) => t.split(/\r?\n/).map((l) => "> " + l).join("\n");
    const head = [
      "# SmallTalk Speaking Session", "",
      `- **Mode:** Cambridge Speaking Simulator`,
      `- **Level:** ${LEVEL_LABELS[session.level]}`,
      `- **Total steps:** ${session.total}`,
      `- **Timestamp:** ${now.toLocaleString()}`, "", "---", "",
    ].join("\n");
    const body = session.rounds.map((s, i) => {
      const extra = [
        ...(s.photos || []).map((p, n) => `Photo ${n + 1}: ${p.alt}`),
        ...(s.options ? ["Options: " + s.options.join(" / ")] : []),
      ];
      return [
        `## ${i + 1}. ${PART_LABELS[s.part]}`, "",
        "**Examiner prompt:**", quote([s.prompt, ...extra].join("\n")), "",
        "**Candidate transcript:**", quote(s.answer), "",
      ].join("\n");
    }).join("\n");
    return head + body;
  }

  function emailTranscript() {
    const md = buildMarkdown(new Date());
    const body = md.length > 1500 ? md.slice(0, 1500) + "\n\n[...truncated: please attach the downloaded .md file]" : md;
    const subject = `SmallTalk speaking session (${LEVEL_LABELS[session.level]})`;
    window.location.href = `mailto:${TUTOR_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function syncMode() {
    $("length-group").hidden = document.querySelector('input[name="mode"]:checked').value === "speaking";
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

  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", syncMode));
  sp.mic.addEventListener("click", toggleMic);
  sp.transcript.addEventListener("input", spValidate);
  sp.next.addEventListener("click", submitStep);
  sp.quit.addEventListener("click", () => {
    if (window.confirm("Quit this session? Your answers will be lost.")) { stopRecording(); showScreen("setup"); }
  });
  el.emailBtn.addEventListener("click", emailTranscript);
  $("pass-form").addEventListener("submit", (e) => {
    e.preventDefault();
    setPass($("pass-input").value.trim());
    dlg.close();
    if (afterPass) { const cb = afterPass; afterPass = null; cb(); }
  });
  $("pass-cancel").addEventListener("click", () => { afterPass = null; dlg.close(); });
  
})();
