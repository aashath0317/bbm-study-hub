// BBM Study Hub page script: saved progress, chapter tools (done + study timer), quizzes,
// subject-page badges, home dashboard (countdowns, today's plan, progress, backup/restore).
// Step 6 adds the widgets kit (elements with data-widget).
(function () {
  "use strict";
  // highlight, in the contents list, the section and topic being read (the last one whose top has passed)
  var toc = document.querySelector(".toc");
  if (toc) {
    var marks = [].slice.call(toc.querySelectorAll("a")).map(function (a) {
      return { a: a, el: document.getElementById(a.getAttribute("href").slice(1)) };
    }).filter(function (m) { return m.el; });
    var contentsNav = toc;
    contentsNav.classList.add("focused-toc");
    var groups = [].slice.call(contentsNav.querySelectorAll(":scope > ol > li"));
    var cur = null, queued = false;
    var spy = function () {
      queued = false;
      var line = window.innerHeight * 0.3, sec = null, sub = null;
      marks.forEach(function (m) {
        if (m.el.getBoundingClientRect().top > line) return;
        if (m.el.classList.contains("sec")) { sec = m; sub = null; } else sub = m;
      });
      var now = (sub || sec || {}).a;
      if (now === cur) return;
      marks.forEach(function (m) { m.a.removeAttribute("aria-current"); });
      if (sec) sec.a.setAttribute("aria-current", "true");
      if (sub) sub.a.setAttribute("aria-current", "true");
      groups.forEach(function (group) {
        group.classList.toggle("active-section", !!sec && group.contains(sec.a));
      });
      cur = now;
      // Scroll only the sidebar: scrollIntoView also moves the lesson viewport.
      var panel = contentsNav.closest(".side");
      if (now && panel && panel.offsetParent) {
        var itemRect = now.getBoundingClientRect(), panelRect = panel.getBoundingClientRect();
        if (itemRect.bottom > panelRect.bottom - 20) panel.scrollTop += itemRect.bottom - panelRect.bottom + 20;
        else if (itemRect.top < panelRect.top + 20) panel.scrollTop -= panelRect.top + 20 - itemRect.top;
      }
    };
    window.addEventListener("scroll", function () { if (!queued) { queued = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
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
  // units: {"<subject>/<stem>": {"<unit id>": "YYYY-MM-DD"}}  lesson parts marked "understood"
  //        (all parts understood → the chapter is marked done automatically)
  // time:  {"<subject>/<stem>": minutes}                   automatic study time per chapter (decimals allowed)
  // days:  {"YYYY-MM-DD": minutes}                         days with any study activity (streak)
  // timer: legacy manual timer {key, start}; logged and cleared on load;  backup: "YYYY-MM-DD" of the last backup
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
    var units = {};
    Object.keys(obj(s.units)).forEach(function (k) {
      var u = obj(s.units[k]), o = {};
      Object.keys(u).forEach(function (id) { if (/^\d{4}-\d\d-\d\d$/.test(u[id])) o[id] = u[id]; });
      if (Object.keys(o).length) units[k] = o;
    });
    return { v: 1, done: done, units: units, quiz: quiz, time: numMap(s.time), days: numMap(s.days),
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

  // ---- chapter page: "understood" button on every lesson part + automatic study time
  // Time counts only on a written chapter page, only while it is visible and focused (not another tab or app),
  // and only while the student is active: no mouse, key, scroll or touch for IDLE ms pauses it.
  var tools = document.getElementById("ch-tools");
  if (tools && chapterKey) {
    var IDLE = 5 * 60 * 1000, units = [].slice.call(document.querySelectorAll(".unit[data-unit]"));
    var lastAct = Date.now(), pending = 0, reason = "";
    BBM.update(function (s) { stopTimer(s); }); // log a timer left running by the old manual button

    units.forEach(function (u) {
      u.insertAdjacentHTML("beforeend", '<div class="ufoot"><button type="button" class="btn ubtn" data-unit="' + u.dataset.unit + '"></button></div>');
    });
    var toc = {};
    document.querySelectorAll(".toc a").forEach(function (a) { toc[a.getAttribute("href").slice(1)] = a; });

    var fmtMin = function (m) { m = Math.floor(m); return m >= 60 ? Math.floor(m / 60) + " மணி " + (m % 60) + " நிமி" : m + " நிமி"; };
    var drawTools = function () {
      var s = BBM.load(), got = s.units[chapterKey] || {}, n = units.filter(function (u) { return got[u.dataset.unit]; }).length;
      units.forEach(function (u) {
        var id = u.dataset.unit, on = !!got[id], b = u.querySelector(".ubtn");
        b.classList.toggle("on", on);
        b.textContent = on ? "✓ விளங்கியது" : "இந்தப் பகுதி விளங்கியது";
        u.classList.toggle("got", on);
        if (toc[id]) toc[id].classList.toggle("got", on);
      });
      var mins = (s.time[chapterKey] || 0) + pending / 60, d = s.done[chapterKey];
      tools.innerHTML =
        '<div class="uprog"><b>' + n + " / " + units.length + "</b> பகுதிகள் விளங்கின" +
        (d ? ' · <span class="good">இந்தப் பாடம் முடிந்தது (' + dm(d) + ")</span>" : "") +
        '<span class="bar"><i style="width:' + (units.length ? Math.round(100 * n / units.length) : 0) + '%"></i></span></div>' +
        '<div class="tsum">படிப்பு நேரம்: <b class="tm">' + fmtMin(mins) + '</b> <span class="tstate' + (reason ? " off" : "") + '">' +
        (reason || "● கணக்கிடப்படுகிறது") + "</span>" +
        (s.quiz[chapterKey] ? " · வினாடி வினா சிறந்தது: " + s.quiz[chapterKey].best + "%" : "") + "</div>";
      tools.hidden = false;
    };
    document.addEventListener("click", function (e) {
      var b = e.target.closest(".ubtn");
      if (!b) return;
      var id = b.dataset.unit;
      BBM.update(function (s) {
        var u = s.units[chapterKey] = s.units[chapterKey] || {};
        if (u[id]) delete u[id]; else { u[id] = iso(now()); studied(s, 0); }
        var all = units.every(function (x) { return u[x.dataset.unit]; });
        if (all && units.length && !s.done[chapterKey]) s.done[chapterKey] = iso(now());
        if (!all && s.done[chapterKey] && units.length) delete s.done[chapterKey];
      });
      if (!b.classList.contains("on")) return;
      var next = units[units.indexOf(b.closest(".unit")) + 1]; // move on to the next part
      if (next) next.scrollIntoView({ block: "start" });
    });

    var flush = function () { // saves counted seconds (every 10 s and when leaving / pausing)
      if (pending < 1) return;
      var m = pending / 60; pending = 0;
      BBM.update(function (s) { s.time[chapterKey] = (s.time[chapterKey] || 0) + m; studied(s, m); });
    };
    var state = function () {
      if (document.visibilityState !== "visible") return "இடைநிறுத்தம்: பக்கம் மறைந்துள்ளது";
      if (!document.hasFocus()) return "இடைநிறுத்தம்: வேறு சாளரம் திறந்துள்ளது";
      if (Date.now() - lastAct > IDLE) return "இடைநிறுத்தம்: 5 நிமிடமாக அசைவு இல்லை";
      return "";
    };
    var ticks = 0;
    setInterval(function () {
      var r = state();
      if (!r) pending += 1;
      if (r !== reason) { reason = r; if (r) flush(); drawTools(); }
      if (++ticks % 10 === 0) flush();
      else if (!r && ticks % 60 === 0) drawTools();
    }, 1000);
    ["mousemove", "mousedown", "keydown", "scroll", "wheel", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true });
    });
    // laptop: progress and study time sit in the side panel, so they take no reading space
    var side = document.querySelector(".side"), head = tools.parentNode, after = tools.nextSibling;
    var place = function () {
      if (!side) return;
      if (window.matchMedia("(min-width: 1000px)").matches) side.insertBefore(tools, side.firstChild);
      else head.insertBefore(tools, after);
    };
    window.addEventListener("resize", place);
    place();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState !== "visible") flush(); });
    window.addEventListener("blur", flush);
    window.addEventListener("bbm-change", drawTools);
    window.addEventListener("storage", function (e) { if (e.key === KEY) drawTools(); });
    drawTools();
  }

  // ---- quizzes: answer → instant ✓/✗ + Tamil explanation; the score is saved once every question is answered
  var LET = "ABCDEFGH";
  function parseNum(v) { // "Rs. 15,000" → 15000; "9/4" → 2.25; "15000abc", "1.2.3", "" → NaN (whole input must be a number)
    var s = String(v).trim().replace(/^rs\.?\s*/i, "").replace(/[,\s]/g, "").replace(/\u2212/g, "-");
    var f = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s); // a fraction such as 9/4
    if (f) return +f[2] ? f[1] / f[2] : NaN;
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
        ? '<div class="qstat"><span>சிறந்தது <b>' + st.best + "%</b></span><span>கடைசி <b>" + st.last +
          "%</b></span><span>முயற்சிகள் <b>" + st.tries + "</b></span></div>"
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
            '<button type="button" class="btn" data-check>சரிபார்</button></div>';
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
      e.innerHTML = "<p><b>" + (ok ? "✓ சரி!" : "✗ தவறு.") + "</b>" + (ok || !shown ? "" : " சரியான விடை: <b>" + shown + "</b>") + "</p>" + (q.e || "") +
        (!ok && q.r ? '<p><a class="btn" href="' + esc(q.r) + '">எளிய உதாரணத்துடன் மீண்டும் முயலுங்கள்</a></p>' : "");
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
        (weak.length ? "<p><b>மீண்டும் பார்க்க வேண்டியவை:</b> " + weak.map(esc).join(", ") + "</p>" : "") +
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
        (kn == null ? "" : "<div><small>வினாடி வினா சராசரி</small><b>" + kn + '%</b></div><span class="bar"><i style="width:' + kn + '%"></i></span>');
      know.hidden = false;
    };
    window.addEventListener("storage", function (e) { if (e.key === KEY) drawSubject(); });
    drawSubject();
  }

  // ---- home dashboard: countdowns, progress, daily target per subject, today's plan
  var dataEl = document.getElementById("hub-data");
  if (!dataEl) return;
  var D = JSON.parse(dataEl.textContent);
  var KIND = { mid: "இடைப் பருவம்", end: "இறுதிப் பருவம்" };
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
            : "குறிப்புகள் விரைவில்";
        }
      }
      if (ne) rows.push({ s: s, ne: ne, rem: rem });
    });
    rows.sort(function (a, b) { return a.ne.day - b.ne.day; });

    // hero: the nearest exam of all subjects
    var hero = document.getElementById("next-exam");
    if (rows.length) {
      var h = rows[0];
      hero.innerHTML = "<div><small>அடுத்த பரீட்சை</small><b>" + esc(h.s.name_ta) + "</b><small>" +
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
    var html = "<h2>இன்றைய திட்டம்</h2><p class=\"goal\">" + fmt(t);
    if (plan.length) {
      html += " · இன்றைய இலக்கு: " + plan.length + " பாடம்" + (mins ? " · சுமார் " + mins + " நிமி" : "") + "</p><ol>";
      plan.forEach(function (p) {
        var c = p.c, chips = "";
        if (c.priority) chips += '<span class="pri pri-' + c.priority.toLowerCase() + '">' + esc({ Must: "அவசியம்", Should: "முக்கியம்", Extra: "மேலதிகம்" }[c.priority] || c.priority) + "</span>";
        if (c.minutes) chips += '<span class="chip">' + esc(c.minutes) + " நிமிடம்</span>";
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
    var html = '<h2>என் முன்னேற்றம்</h2><div class="stats">' +
      "<div><b>" + BBM.streak(s) + "</b><small>தொடர்ந்து படித்த நாட்கள்</small></div>" +
      "<div><b>" + Math.floor(s.days[today] || 0) + "</b><small>இன்று படித்த நிமிடங்கள்</small></div>" +
      "<div><b>" + (ready ? done + " / " + ready : "—") + "</b><small>முடித்த பாடங்கள் (தயாரானவை)</small></div>" +
      "<div><b>" + (kn == null ? "—" : kn + "%") + "</b><small>வினாடி வினா சராசரி</small></div></div>" +
      "<h3>மீண்டும் பார்க்க வேண்டியவை</h3>";
    if (weak.length) {
      html += '<ul class="weak">' + weak.slice(0, 8).map(function (w) {
        return '<li><a href="' + w.sub.slug + "/" + w.c.stem + '.html#quiz"><b>' + w.q.weak.map(esc).join(", ") + "</b><small>" +
          esc(w.sub.name_ta) + " · " + esc(w.c.title) + " · கடைசி மதிப்பெண் " + w.q.last + "%</small></a></li>";
      }).join("") + "</ul>";
    } else {
      html += '<p class="note">இன்னும் இல்லை. ஒவ்வொரு பாடத்தின் வினாடி வினாவையும் செய்யுங்கள்; தவறிய தலைப்புகள் இங்கே தோன்றும்.</p>';
    }
    html += '<div class="backup"><button type="button" class="btn" data-act="backup">காப்புப் பிரதி எடு</button>' +
      '<label class="btn">காப்புப் பிரதியிலிருந்து மீட்டெடு<input type="file" accept=".json,application/json" hidden></label></div>' +
      '<p class="note' + (stale ? " warn" : "") + '">உங்கள் முன்னேற்றம் இந்த உலாவியில் (browser) மட்டுமே சேமிக்கப்படுகிறது. ' +
      "வாரம் ஒருமுறை காப்புப் பிரதி எடுத்து, கோப்பைப் பாதுகாப்பாக வைத்திருங்கள். புதிய கணினியில் அல்லது உலாவியில் ‘மீட்டெடு’ மூலம் தொடரலாம். " +
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
    Object.keys(b.units).forEach(function (k) {
      a.units[k] = a.units[k] || {};
      Object.keys(b.units[k]).forEach(function (id) { if (!a.units[k][id] || b.units[k][id] < a.units[k][id]) a.units[k][id] = b.units[k][id]; });
    });
    ["time", "days"].forEach(function (f) {
      Object.keys(b[f]).forEach(function (k) { a[f][k] = Math.max(a[f][k] || 0, b[f][k]); });
    });
    // keep the newer "last backup" date, so restoring a backup never says none was taken
    if (/^\d{4}-\d\d-\d\d$/.test(b.backup) && (!a.backup || b.backup > a.backup)) a.backup = b.backup;
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
