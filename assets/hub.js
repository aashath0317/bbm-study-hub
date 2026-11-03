// BBM Study Hub page script: saved progress, chapter tools (done + study timer), quizzes,
// subject-page badges, home dashboard (countdowns, today's plan, progress, backup/restore).
// Step 6 adds the widgets kit (elements with data-widget).
(function () {
  "use strict";
  // highlight the TOC chip of the section being read
  var toc = document.querySelector(".toc");
  if (toc && "IntersectionObserver" in window) {
    var links = {};
    toc.querySelectorAll("a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var a = links[e.target.id];
        if (a && e.isIntersecting) {
          toc.querySelectorAll("a").forEach(function (x) { x.removeAttribute("aria-current"); });
          a.setAttribute("aria-current", "true");
          a.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll(".sec").forEach(function (s) { io.observe(s); });
  }

  // ---- helpers
  var DAYS = ["ஞாயிறு", "திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி"];
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function at(date, time) { // local Date from "YYYY-MM-DD" + optional "HH:MM"
    var p = date.split("-"), t = (time || "00:00").split(":");
    return new Date(+p[0], p[1] - 1, +p[2], +t[0], +t[1]);
  }
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmt(d) { return DAYS[d.getDay()] + ", " + pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function dm(isoDate) { var p = String(isoDate).split("-"); return p[2] + "-" + p[1]; }
  function now() { // ?today=YYYY-MM-DD pretends it is that day (for checking the plan ahead of time)
    var q = /[?&]today=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    return q ? at(q[1], "08:00") : new Date();
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ---- saved state (localStorage "bbm-hub"):
  // done:  {"<subject>/<chapter stem>": "YYYY-MM-DD"}      chapters marked done
  // quiz:  {"<subject>/<stem>": {best, last, tries, ts, n, hist: [%...], weak: [topic...]}}   weak = from the last attempt
  // time:  {"<subject>/<stem>": minutes}                   study timer per chapter
  // days:  {"YYYY-MM-DD": minutes}                         days with any study activity (streak)
  // timer: {key, start} while a study timer runs;  backup: "YYYY-MM-DD" of the last backup download
  var BBM = window.BBM = window.BBM || {};
  var KEY = "bbm-hub";
  function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  function numMap(m) { var o = {}; m = obj(m); Object.keys(m).forEach(function (k) { if (+m[k] >= 0) o[k] = +m[k]; }); return o; }
  function clean(s) { // also validates restored backup files
    s = obj(s);
    var quiz = {}, done = {}, t = obj(s.timer);
    Object.keys(obj(s.quiz)).forEach(function (k) {
      var q = obj(s.quiz[k]);
      if (+q.best >= 0) quiz[k] = { best: +q.best, last: +q.last || 0, tries: +q.tries || 1, ts: +q.ts || 0, n: +q.n || 0,
        hist: Array.isArray(q.hist) ? q.hist.map(Number).filter(isFinite).slice(-10) : [],
        weak: Array.isArray(q.weak) ? q.weak.map(String) : [] };
    });
    Object.keys(obj(s.done)).forEach(function (k) { if (/^\d{4}-\d\d-\d\d$/.test(s.done[k])) done[k] = s.done[k]; });
    return { v: 1, done: done, quiz: quiz, time: numMap(s.time), days: numMap(s.days),
      timer: t.key && +t.start ? { key: String(t.key), start: +t.start } : null,
      backup: typeof s.backup === "string" ? s.backup : null };
  }
  BBM.load = function () {
    try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return clean(null); }
  };
  BBM.save = function (s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  };
  BBM.update = function (fn) { // always re-reads first, so changes from other tabs are kept
    var s = BBM.load(); fn(s);
    if (!BBM.save(s)) alert("முன்னேற்றத்தைச் சேமிக்க முடியவில்லை. இந்த உலாவி (browser) சேமிப்பைத் தடுக்கிறது (private mode?).");
    window.dispatchEvent(new Event("bbm-change"));
    return s;
  };
  function studied(s, mins) { var d = iso(now()); s.days[d] = (s.days[d] || 0) + (mins || 0); }
  function stopTimer(s) { // logs the running timer (max 3 hours, in case it was left running)
    if (!s.timer) return;
    var m = Math.min(180, Math.round((Date.now() - s.timer.start) / 6e4));
    if (m > 0) { s.time[s.timer.key] = (s.time[s.timer.key] || 0) + m; studied(s, m); }
    s.timer = null;
  }
  BBM.streak = function (s) { // consecutive study days up to today (or yesterday, if today has no study yet)
    var d = dayStart(now()), n = 0;
    if (!has(s.days, iso(d))) d.setDate(d.getDate() - 1);
    while (has(s.days, iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  };
  // knowledge % = average best quiz score over the chapters that have a quiz (not tried yet = 0)
  function knowledge(keys, s) {
    if (!keys.length) return null;
    return Math.round(keys.reduce(function (a, k) { return a + (s.quiz[k] ? s.quiz[k].best : 0); }, 0) / keys.length);
  }
  function grade(p) {
    return p >= 85 ? ["அருமை! இந்தப் பாடம் நன்றாகப் புரிந்துள்ளது.", "ok"]
      : p >= 70 ? ["நல்லது! தவறியவற்றை மீண்டும் பாருங்கள்.", "ok"]
      : p >= 50 ? ["முன்னேறுகிறீர்கள். பலவீனமான பகுதிகளை மீண்டும் வாசியுங்கள்.", "mid"]
      : ["இன்னும் கொஞ்சம் படிக்க வேண்டும். விளக்கப் பகுதியை மீண்டும் வாசித்து, மறுபடி முயலுங்கள்.", "bad"];
  }

  var B = document.body.dataset;
  var chapterKey = B.subject && B.chapter ? B.subject + "/" + B.chapter : null;

  // ---- chapter page: "mark as done" + study timer
  var tools = document.getElementById("ch-tools");
  if (tools && chapterKey) {
    var tick = null;
    var drawTools = function () {
      var s = BBM.load(), d = s.done[chapterKey], run = s.timer && s.timer.key === chapterKey, mins = s.time[chapterKey] || 0;
      tools.innerHTML =
        '<button type="button" class="btn' + (d ? " on" : "") + '" data-act="done">' +
        (d ? "✓ முடிந்தது (Done) · " + dm(d) : "☐ இந்தப் பாடத்தை முடித்தேன் (Mark as done)") + "</button>" +
        '<div class="timer"><button type="button" class="btn' + (run ? " run" : "") + '" data-act="timer">' +
        (run ? "⏸ நிறுத்து (Stop)" : "▶ படிப்பு நேரம் (Study timer)") + '</button><span class="tm"></span></div>' +
        '<small class="tsum">இந்தப் பாடத்தில் படித்த நேரம்: ' + mins + " நிமி" +
        (s.quiz[chapterKey] ? " · வினாடி வினா சிறந்தது: " + s.quiz[chapterKey].best + "%" : "") + "</small>";
      tools.hidden = false;
      clearInterval(tick);
      var tm = tools.querySelector(".tm");
      if (run) {
        var show = function () {
          var sec = Math.max(0, Math.floor((Date.now() - s.timer.start) / 1000));
          tm.textContent = (sec >= 3600 ? Math.floor(sec / 3600) + ":" : "") + pad(Math.floor(sec / 60) % 60) + ":" + pad(sec % 60);
        };
        show(); tick = setInterval(show, 1000);
      } else if (s.timer) {
        tm.textContent = "(வேறொரு பாடத்தில் timer ஓடுகிறது)";
      }
    };
    tools.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "done") {
        if (BBM.load().done[chapterKey] && !confirm("'முடிந்தது' என்ற குறியை நீக்கவா?")) return;
        BBM.update(function (s) {
          if (s.done[chapterKey]) delete s.done[chapterKey];
          else { s.done[chapterKey] = iso(now()); studied(s, 0); }
        });
      } else {
        BBM.update(function (s) { // one timer at a time: starting here stops (and logs) any other
          var mine = s.timer && s.timer.key === chapterKey;
          stopTimer(s);
          if (!mine) s.timer = { key: chapterKey, start: Date.now() };
        });
      }
    });
    window.addEventListener("bbm-change", drawTools);
    window.addEventListener("storage", function (e) { if (e.key === KEY) drawTools(); });
    drawTools();
  }

  // ---- quizzes: answer → instant ✓/✗ + Tamil explanation; the score is saved once every question is answered
  var LET = "ABCDEFGH";
  function parseNum(v) { // "Rs. 15,000" → 15000; "15000abc", "1.2.3", "" → NaN (whole input must be a number)
    var s = String(v).trim().replace(/^rs\.?\s*/i, "").replace(/[,\s]/g, "");
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  document.querySelectorAll(".quiz[data-quiz]").forEach(function (Q) {
    var all = JSON.parse(Q.querySelector(".qdata").textContent), key = Q.getAttribute("data-quiz");
    var title = (document.querySelector("h1") || {}).textContent || key;
    var stat = Q.querySelector(".qstatic");
    if (stat) stat.remove();
    var head = document.createElement("div"), body = document.createElement("div");
    head.className = "qhead"; body.className = "qbody";
    Q.appendChild(head); Q.appendChild(body);
    var cur, answered, right, wrongTopics;

    function header() {
      var st = BBM.load().quiz[key];
      head.innerHTML = st
        ? '<div class="qstat"><span>சிறந்தது (Best) <b>' + st.best + "%</b></span><span>கடைசி (Last) <b>" + st.last +
          "%</b></span><span>முயற்சிகள் (Attempts) <b>" + st.tries + "</b></span></div>"
        : '<p class="qnote">' + all.length + " கேள்விகள். ஒரு விடையைத் தெரிவு செய்தவுடன் சரியா தவறா என்பதும் விளக்கமும் தோன்றும்.</p>";
    }
    function start(mix) {
      cur = mix ? shuffle(all) : all.slice();
      answered = 0; right = 0; wrongTopics = [];
      body.innerHTML = cur.map(function (q, i) {
        var h = '<div class="qq" data-i="' + i + '"><div class="qt"><b>' + (i + 1) + ".</b> " + q.q + "</div>";
        if (q.o) {
          h += '<div class="qopts">' + q.o.map(function (o, j) {
            return '<button type="button" class="qo" data-o="' + j + '"><span class="ql">' + LET[j] + "</span><span>" + o + "</span></button>";
          }).join("") + "</div>";
        } else {
          h += '<div class="qn"><input type="text" inputmode="decimal" autocomplete="off" placeholder="விடையை எண்ணாக எழுதுங்கள்" aria-label="விடை">' +
            '<button type="button" class="btn" data-check>சரிபார் (Check)</button></div>';
        }
        return h + '<div class="qe" hidden></div></div>';
      }).join("") + '<p class="qleft"></p><div class="qres" hidden></div>';
      left();
    }
    function left() {
      body.querySelector(".qleft").textContent = answered < cur.length
        ? "பதிலளித்தவை: " + answered + " / " + cur.length + " · சரி: " + right : "";
    }
    function mark(el, q, ok, shown) {
      el.classList.add(ok ? "ok" : "no");
      var e = el.querySelector(".qe");
      e.innerHTML = "<p><b>" + (ok ? "✓ சரி!" : "✗ தவறு.") + "</b>" + (ok || !shown ? "" : " சரியான விடை: <b>" + shown + "</b>") + "</p>" + (q.e || "");
      e.hidden = false;
      answered++;
      if (ok) right++;
      else wrongTopics.push(q.w || title);
      left();
      if (answered === cur.length) finish();
    }
    function checkNum(el, q) {
      var inp = el.querySelector(".qn input"), x = parseNum(inp.value);
      if (isNaN(x)) { inp.value = ""; inp.placeholder = "ஒரு எண்ணை எழுதுங்கள் (உதா: 15000)"; inp.focus(); return; }
      var tol = q.t != null ? q.t : 0, ok = Math.abs(x - q.n) <= tol + 1e-9; // exact unless the question gives "± error"
      inp.disabled = true; el.querySelector("[data-check]").disabled = true;
      inp.classList.add(ok ? "right" : "wrong");
      mark(el, q, ok, q.n.toLocaleString("en-US", { maximumFractionDigits: 4 }));
    }
    body.addEventListener("click", function (e) {
      var el = e.target.closest(".qq");
      if (!el || el.classList.contains("ok") || el.classList.contains("no")) return;
      var q = cur[+el.dataset.i], o = e.target.closest(".qo");
      if (o) {
        var v = +o.dataset.o;
        el.querySelectorAll(".qo").forEach(function (b) {
          var j = +b.dataset.o;
          b.disabled = true;
          if (j === q.a) b.classList.add("right");
          else if (j === v) b.classList.add("wrong");
        });
        mark(el, q, v === q.a, null);
      } else if (e.target.closest("[data-check]")) {
        checkNum(el, q);
      }
    });
    body.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.matches(".qn input")) {
        var el = e.target.closest(".qq");
        checkNum(el, cur[+el.dataset.i]);
      }
    });
    function finish() {
      var p = Math.round(100 * right / cur.length), g = grade(p), weak = [];
      wrongTopics.forEach(function (w) { if (weak.indexOf(w) < 0) weak.push(w); });
      var s = BBM.update(function (s) {
        var st = s.quiz[key] || { best: 0, tries: 0, hist: [] };
        s.quiz[key] = { best: Math.max(st.best, p), last: p, tries: st.tries + 1, ts: Date.now(), n: cur.length,
          hist: st.hist.concat(p).slice(-10), weak: weak };
        studied(s, 0);
      });
      header();
      var res = body.querySelector(".qres");
      res.className = "qres " + g[1];
      res.innerHTML = '<div class="big">' + right + " / " + cur.length + " <small>(" + p + "%)</small></div><p>" + g[0] + "</p>" +
        (weak.length ? "<p><b>மீண்டும் பார்க்க வேண்டியவை (Weak topics):</b> " + weak.map(esc).join(", ") + "</p>" : "") +
        '<div class="qact"><button type="button" class="btn" data-again>↻ மீண்டும் முயற்சி (புதிய வரிசை)</button>' +
        (p >= 70 && !s.done[key] && key === chapterKey ? '<button type="button" class="btn on" data-done>✓ இந்தப் பாடத்தை முடித்ததாகக் குறி</button>' : "") +
        "</div>";
      res.hidden = false;
      res.querySelector("[data-again]").onclick = function () { start(true); header(); Q.scrollIntoView({ behavior: "smooth" }); };
      var dn = res.querySelector("[data-done]");
      if (dn) dn.onclick = function () { dn.remove(); BBM.update(function (s) { s.done[key] = iso(now()); }); };
      res.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    header(); start(false);
  });

  // ---- subject page: ✓ and quiz-best chips on chapter cards, done + knowledge summary
  var know = document.getElementById("subj-know");
  if (know) {
    var cards = [].slice.call(document.querySelectorAll(".card.ch[data-key]"));
    var drawSubject = function () {
      var s = BBM.load(), ready = 0, done = 0, qkeys = [];
      cards.forEach(function (a) {
        var k = a.dataset.key, chips = a.querySelector(".chips");
        chips.querySelectorAll(".mine").forEach(function (x) { x.remove(); });
        if (a.dataset.ready === "1") { ready++; if (s.done[k]) done++; }
        if (+a.dataset.quiz) qkeys.push(k);
        if (s.done[k]) chips.insertAdjacentHTML("afterbegin", '<span class="chip mine q-ok">✓ முடிந்தது</span>');
        if (s.quiz[k]) chips.insertAdjacentHTML("beforeend", '<span class="chip mine q-' + grade(s.quiz[k].best)[1] + '">வினாடி வினா ' + s.quiz[k].best + "%</span>");
      });
      if (!ready) return;
      var kn = knowledge(qkeys, s);
      know.innerHTML = "<div><small>முடித்த பாடங்கள்</small><b>" + done + " / " + ready + "</b></div>" +
        (kn == null ? "" : "<div><small>அறிவு (Knowledge)</small><b>" + kn + '%</b></div><span class="bar"><i style="width:' + kn + '%"></i></span>');
      know.hidden = false;
    };
    window.addEventListener("storage", function (e) { if (e.key === KEY) drawSubject(); });
    drawSubject();
  }

  // ---- home dashboard: countdowns, progress, daily target per subject, today's plan
  var dataEl = document.getElementById("hub-data");
  if (!dataEl) return;
  var D = JSON.parse(dataEl.textContent);
  var KIND = { mid: "இடைப் பருவம் (Mid)", end: "இறுதிப் பருவம் (End)" };
  var STATUS = { todo: "பக்கம் தயாராகிறது", coming: "குறிப்புகள் விரைவில்" };

  // next exam: the mid-semester until its day is over, then the end-semester
  function nextExam(s, t) {
    var kinds = ["mid", "end"];
    for (var i = 0; i < kinds.length; i++) {
      var e = s[kinds[i]];
      if (!e || !e.date) continue;
      var day = at(e.date);
      if (t < new Date(day.getTime() + 864e5)) {
        return { kind: kinds[i], day: day, time: e.time, start: at(e.date, e.time),
                 days: Math.round((day - dayStart(t)) / 864e5) };
      }
    }
    return null;
  }
  function countdown(ne, t) {
    if (ne.days > 1) return ne.days + " நாட்கள்";
    if (ne.days === 1) return "நாளை!";
    if (ne.time && t < ne.start) {
      var m = Math.round((ne.start - t) / 6e4);
      return "இன்று · " + Math.floor(m / 60) + " மணி " + (m % 60) + " நிமி";
    }
    return "இன்று!";
  }
  // chapters that count for an exam: not "coming" (no notes yet); "unknown" counts for both exams
  function inScope(c, kind) { return c.status !== "coming" && (c.exam === kind || c.exam === "both" || !c.exam || c.exam === "unknown"); }
  function target(rem, days) { // remaining chapters ÷ days left, in words
    if (!rem) return "இந்தப் பரீட்சைக்கான பாடங்கள் முடிந்தன ✓";
    var d = Math.max(days, 1), r = rem / d;
    if (r >= 1 || d / rem < 2) return "இலக்கு: நாளொன்றுக்கு " + Math.ceil(r) + " பாடம்";
    return "இலக்கு: " + Math.floor(d / rem) + " நாளுக்கு 1 பாடம்";
  }
  function quizKeys(sub) { return sub.chapters.filter(function (c) { return c.q; }).map(function (c) { return sub.slug + "/" + c.stem; }); }

  function render() {
    var t = now(), st = BBM.load(), done = st.done, rows = [];
    D.forEach(function (s) {
      var ne = nextExam(s, t), pool = [], rem = [];
      if (ne) {
        pool = s.chapters.filter(function (c) { return inScope(c, ne.kind); });
        rem = pool.filter(function (c) { return !done[s.slug + "/" + c.stem]; });
      }
      var card = document.querySelector('.card.subj[data-subject="' + s.slug + '"]');
      if (card) {
        var nx = card.querySelector("[data-next]"), bar = card.querySelector("[data-bar]"), meta = card.querySelector("[data-meta]");
        var kn = knowledge(quizKeys(s), st);
        if (!ne) {
          nx.innerHTML = "<span>இந்தப் பருவப் பரீட்சைகள் முடிந்தன</span>";
          bar.hidden = true; meta.textContent = "";
        } else {
          nx.innerHTML = "<span>" + KIND[ne.kind] + " · " + fmt(ne.day) + (ne.time ? ", " + esc(ne.time) : "") + "</span>" +
            '<span class="cd' + (ne.days <= 7 ? " soon" : "") + '">' + countdown(ne, t) + "</span>";
          var n = pool.length - rem.length;
          bar.hidden = !pool.length;
          bar.firstChild.style.width = (pool.length ? Math.round(100 * n / pool.length) : 0) + "%";
          meta.textContent = pool.length
            ? "முடித்தவை " + n + " / " + pool.length + " · " + target(rem.length, ne.days) + (kn == null ? "" : " · அறிவு " + kn + "%")
            : "குறிப்புகள் விரைவில் (Notes coming)";
        }
      }
      if (ne) rows.push({ s: s, ne: ne, rem: rem });
    });
    rows.sort(function (a, b) { return a.ne.day - b.ne.day; });

    // hero: the nearest exam of all subjects
    var hero = document.getElementById("next-exam");
    if (rows.length) {
      var h = rows[0];
      hero.innerHTML = "<div><small>அடுத்த பரீட்சை (Next exam)</small><b>" + esc(h.s.name_ta) + "</b><small>" +
        KIND[h.ne.kind] + " · " + fmt(h.ne.day) + (h.ne.time ? ", " + esc(h.ne.time) : "") + '</small></div><div class="big">' +
        (h.ne.days > 1 ? h.ne.days + "<small>நாட்கள்</small>" : countdown(h.ne, t)) + "</div>";
    } else {
      hero.innerHTML = "<div><b>இந்தப் பருவப் பரீட்சைகள் அனைத்தும் முடிந்தன 🎉</b></div>";
    }

    // today's plan: the slowest pace that still finishes every subject before its exam
    // (earliest exam first), filled with the next unfinished chapters in lesson order
    var cum = 0, rate = 0;
    rows.forEach(function (r) { cum += r.rem.length; rate = Math.max(rate, cum / Math.max(r.ne.days, 1)); });
    var slots = Math.ceil(rate - 1e-9), plan = [];
    rows.forEach(function (r) {
      r.rem.forEach(function (c) { if (plan.length < slots) plan.push({ s: r.s, c: c }); });
    });
    var mins = plan.reduce(function (a, p) { return a + (+p.c.minutes || 0); }, 0);
    var html = "<h2>இன்றைய திட்டம் (Today's plan)</h2><p class=\"goal\">" + fmt(t);
    if (plan.length) {
      html += " · இன்றைய இலக்கு (Daily target): " + plan.length + " பாடம்" + (mins ? " · ⏱ சுமார் " + mins + " நிமி" : "") + "</p><ol>";
      plan.forEach(function (p) {
        var c = p.c, chips = "";
        if (c.priority) chips += '<span class="pri pri-' + c.priority.toLowerCase() + '">' + esc(c.priority) + "</span>";
        if (c.minutes) chips += '<span class="chip">⏱ ' + esc(c.minutes) + " நிமி</span>";
        if (c.status !== "ready") chips += '<span class="chip st-' + c.status + '">' + STATUS[c.status] + "</span>";
        html += '<li><a href="' + p.s.slug + "/" + c.stem + '.html"><small>' + esc(p.s.name_ta) +
          (c.lesson ? " · பாடம் " + esc(c.lesson) : "") + "</small><b>" + esc(c.title) + "</b>" +
          (chips ? '<span class="chips">' + chips + "</span>" : "") + "</a></li>";
      });
      html += "</ol>";
    } else {
      html += "</p><p>இன்றைக்கு புதிய பாடங்கள் இல்லை. முடித்த பாடங்களை மீள்பார்வை செய்யுங்கள்.</p>";
    }
    document.getElementById("today-plan").innerHTML = html;
    document.getElementById("dash").hidden = false;
  }

  // progress card: streak, today's minutes, chapters done, knowledge, weak topics, backup/restore
  var prog = document.getElementById("progress");
  function renderProgress() {
    var s = BBM.load(), today = iso(now()), ready = 0, done = 0, qkeys = [], weak = [];
    D.forEach(function (sub) {
      sub.chapters.forEach(function (c) {
        var k = sub.slug + "/" + c.stem, q = s.quiz[k];
        if (c.status === "ready") { ready++; if (s.done[k]) done++; }
        if (c.q) qkeys.push(k);
        if (q && q.weak.length) weak.push({ sub: sub, c: c, q: q });
      });
    });
    weak.sort(function (a, b) { return a.q.last - b.q.last; });
    var kn = knowledge(qkeys, s), stale = !s.backup || (now() - at(s.backup)) / 864e5 >= 7;
    var html = '<h2>என் முன்னேற்றம் (My progress)</h2><div class="stats">' +
      "<div><b>🔥 " + BBM.streak(s) + "</b><small>நாள் தொடர் (Streak)</small></div>" +
      "<div><b>" + (s.days[today] || 0) + "</b><small>இன்று படித்த நிமிடங்கள்</small></div>" +
      "<div><b>" + (ready ? done + " / " + ready : "—") + "</b><small>முடித்த பாடங்கள் (தயாரானவை)</small></div>" +
      "<div><b>" + (kn == null ? "—" : kn + "%") + "</b><small>அறிவு (Knowledge)</small></div></div>" +
      "<h3>மீண்டும் பார்க்க வேண்டியவை (Weak topics)</h3>";
    if (weak.length) {
      html += '<ul class="weak">' + weak.slice(0, 8).map(function (w) {
        return '<li><a href="' + w.sub.slug + "/" + w.c.stem + '.html#quiz"><b>' + w.q.weak.map(esc).join(", ") + "</b><small>" +
          esc(w.sub.name_ta) + " · " + esc(w.c.title) + " · கடைசி மதிப்பெண் " + w.q.last + "%</small></a></li>";
      }).join("") + "</ul>";
    } else {
      html += '<p class="note">இன்னும் இல்லை. ஒவ்வொரு பாடத்தின் வினாடி வினாவையும் செய்யுங்கள்; தவறிய தலைப்புகள் இங்கே தோன்றும்.</p>';
    }
    html += '<div class="backup"><button type="button" class="btn" data-act="backup">💾 காப்புப் பிரதி எடு (Backup)</button>' +
      '<label class="btn">📂 மீட்டெடு (Restore)<input type="file" accept=".json,application/json" hidden></label></div>' +
      '<p class="note' + (stale ? " warn" : "") + '">உங்கள் முன்னேற்றம் இந்த உலாவியில் (browser) மட்டுமே சேமிக்கப்படுகிறது. ' +
      "வாரம் ஒருமுறை காப்புப் பிரதி எடுத்து, கோப்பைப் பாதுகாப்பாக வைத்திருங்கள். புதிய phone / browser இல் ‘மீட்டெடு’ மூலம் தொடரலாம். " +
      (s.backup ? "கடைசிக் காப்புப் பிரதி: " + dm(s.backup) + "-" + s.backup.slice(0, 4) : "இதுவரை காப்புப் பிரதி எடுக்கவில்லை.") + "</p>";
    prog.innerHTML = html;
  }
  function backup() {
    var s = BBM.update(function (s) { s.backup = iso(now()); });
    var out = Object.assign({}, s, { timer: null });
    var blob = new Blob([JSON.stringify({ app: "bbm-hub", exported: new Date().toISOString(), state: out }, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bbm-progress-" + iso(now()) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // restore merges, so nothing saved here is lost: earliest done date, best score, most minutes
  function merge(a, b) {
    Object.keys(b.done).forEach(function (k) { if (!a.done[k] || b.done[k] < a.done[k]) a.done[k] = b.done[k]; });
    Object.keys(b.quiz).forEach(function (k) {
      var x = a.quiz[k], y = b.quiz[k], m = Object.assign({}, !x || y.ts > x.ts ? y : x);
      if (x) { m.best = Math.max(x.best, y.best); m.tries = Math.max(x.tries, y.tries); }
      a.quiz[k] = m;
    });
    ["time", "days"].forEach(function (f) {
      Object.keys(b[f]).forEach(function (k) { a[f][k] = Math.max(a[f][k] || 0, b[f][k]); });
    });
  }
  BBM.merge = merge;
  function restore(file) {
    var r = new FileReader();
    r.onload = function () {
      var d;
      try { d = JSON.parse(r.result); } catch (e) { d = null; }
      var src = d && d.app === "bbm-hub" ? d.state : d;
      if (!src || typeof src !== "object" || !(src.done || src.quiz)) {
        alert("இது BBM கற்றல் மையத்தின் காப்புப் பிரதிக் கோப்பு அல்ல. 'bbm-progress-….json' கோப்பைத் தெரிவு செய்யுங்கள்.");
        return;
      }
      var b = clean(src);
      BBM.update(function (s) { merge(s, b); });
      alert("மீட்டெடுக்கப்பட்டது ✓ · முடித்த பாடங்கள்: " + Object.keys(b.done).length + " · வினாடி வினாக்கள்: " + Object.keys(b.quiz).length);
    };
    r.readAsText(file);
  }
  prog.addEventListener("click", function (e) { if (e.target.closest('[data-act="backup"]')) backup(); });
  prog.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) restore(e.target.files[0]);
    e.target.value = "";
  });

  function both() { render(); renderProgress(); }
  window.addEventListener("bbm-change", both);
  window.addEventListener("storage", function (e) { if (e.key === KEY) both(); });
  both();
  setInterval(render, 60000);
})();
