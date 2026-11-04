// BBM Study Hub widgets kit: elements with data-widget (config in their .wdata JSON; formats in
// builder/widgets.py) and ::: reveal step lists. Loaded only on pages that use them.
// Accounting: journal-checker, t-account, trial-balance, depreciation, ratios.
// Maths: reveal steps, formula, graph (with sliders). Text fields in configs are html from the builder.
(function () {
  "use strict";

  // ---- helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function fmt(x, d) { // 12500 → "12,500"; d = max decimals (default 2)
    if (!isFinite(x)) return "—";
    if (Math.abs(x) < 1e-9) x = 0;
    return x.toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d });
  }
  function fmtFixed(x, d) {
    if (!isFinite(x)) return "—";
    return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function num(v) { // "Rs. 12,500" → 12500; "", "12500abc" → NaN (whole input must be a number)
    var s = String(v).trim().replace(/^rs\.?\s*/i, "").replace(/[,\s]/g, "");
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }
  function same(a, b) { return Math.abs(a - b) < 0.005; }
  function sum(m) { return Object.keys(m).reduce(function (a, k) { return a + m[k]; }, 0); }
  function numInput(attrs, v) {
    return '<input type="text" inputmode="decimal" autocomplete="off" ' + attrs + ' value="' + (v == null ? "" : esc(v)) + '">';
  }
  var DR = "பற்று (Dr)", CR = "வரவு (Cr)";

  // ---- expressions for formula + graph: + - * / ^, brackets, 2x, functions, pi, e
  var FN = { sqrt: Math.sqrt, ln: Math.log, log: function (x) { return Math.log(x) / Math.LN10; },
    exp: Math.exp, abs: Math.abs, min: Math.min, max: Math.max };
  var CONST = { pi: Math.PI, e: Math.E };
  function tokens(s) {
    var out = [], re = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_][A-Za-z_0-9]*)|(\S))/g, m;
    while ((m = re.exec(s))) {
      out.push(m[1] ? { t: "n", v: +m[1], s: m[1] } : m[2] ? { t: "id", v: m[2] } : { t: "op", v: m[3] });
    }
    return out;
  }
  function compile(src) { // → function(env) with .tokens; throws Error with a Tamil message
    var tk = tokens(String(src)), i = 0;
    function isOp(v) { var t = tk[i]; return t && t.t === "op" && t.v === v; }
    function fail(msg) { throw new Error(msg + " · " + src); }
    function bin(o, a, b) {
      return o === "+" ? function (e) { return a(e) + b(e); } : o === "-" ? function (e) { return a(e) - b(e); }
        : o === "*" ? function (e) { return a(e) * b(e); } : function (e) { return a(e) / b(e); };
    }
    function startsPrimary() { var t = tk[i]; return t && (t.t !== "op" || t.v === "("); }
    function expr() {
      var a = term();
      while (isOp("+") || isOp("-")) { var o = tk[i++].v; a = bin(o, a, term()); }
      return a;
    }
    function term() {
      var a = unary();
      for (;;) {
        if (isOp("*") || isOp("/")) { var o = tk[i++].v; a = bin(o, a, unary()); }
        else if (startsPrimary()) a = bin("*", a, power()); // 2x, 3(x + 1)
        else return a;
      }
    }
    function unary() {
      if (isOp("-")) { i++; var a = unary(); return function (e) { return -a(e); }; }
      if (isOp("+")) { i++; return unary(); }
      return power();
    }
    function power() {
      var a = primary();
      if (isOp("^")) { i++; var b = unary(); return function (e) { return Math.pow(a(e), b(e)); }; }
      return a;
    }
    function primary() {
      var t = tk[i++];
      if (!t) fail("சூத்திரம் முழுமையில்லை");
      if (t.t === "n") return function () { return t.v; };
      if (t.t === "id") {
        if (FN[t.v] && isOp("(")) {
          i++;
          var args = [expr()], f = FN[t.v];
          while (isOp(",")) { i++; args.push(expr()); }
          if (!isOp(")")) fail("')' இல்லை");
          i++;
          return function (e) { return f.apply(null, args.map(function (g) { return g(e); })); };
        }
        return function (e) {
          if (has(e, t.v)) return e[t.v];
          if (has(CONST, t.v)) return CONST[t.v];
          throw new Error("தெரியாத பெயர்: " + t.v);
        };
      }
      if (t.v === "(") {
        var a = expr();
        if (!isOp(")")) fail("')' இல்லை");
        i++;
        return a;
      }
      fail("எதிர்பாராத '" + t.v + "'");
    }
    var f = expr();
    if (i < tk.length) fail("எதிர்பாராத '" + tk[i].v + "'");
    f.tokens = tk;
    return f;
  }
  // tokens → readable text; env values are put in when given; rename maps names (x → Q)
  function pretty(tk, env, rename) {
    var out = "", prev = null, sup = false;
    tk.forEach(function (t) {
      var s, val = t.t === "n" || t.t === "id" || (t.t === "op" && t.v === "(");
      if (prev && val && (prev.t === "n" || (prev.t === "id" && !FN[prev.v]) || (prev.t === "op" && prev.v === ")"))) out += " × ";
      if (t.t === "op" && t.v === "^" && tk[tk.indexOf(t) + 1] && tk[tk.indexOf(t) + 1].t !== "op") { sup = true; prev = t; return; }
      if (t.t === "n") s = fmt(t.v, 6);
      else if (t.t === "id") {
        if (env && has(env, t.v)) s = env[t.v] < 0 ? "(" + fmt(env[t.v], 4) + ")" : fmt(env[t.v], 4);
        else s = t.v === "pi" ? "π" : rename && rename[t.v] ? rename[t.v] : t.v;
      } else {
        var unaryMinus = (t.v === "-" || t.v === "+") && (!prev || (prev.t === "op" && prev.v !== ")"));
        s = { "*": " × ", "/": " ÷ ", "+": unaryMinus ? "+" : " + ", "-": unaryMinus ? "−" : " − ", ",": ", " }[t.v] || t.v;
      }
      out += sup ? "<sup>" + s + "</sup>" : s;
      sup = false;
      prev = t;
    });
    // tidy: "+ (-2)" → "− 2", "2 × x" → "2x", "1x" → "x"
    return out.replace(/ \+ \(-([\d.,]+)\)/g, " − $1").replace(/ − \(-([\d.,]+)\)/g, " + $1")
      .replace(/(\d) × ([A-Za-z])(?![A-Za-z(])/g, "$1$2").replace(/(^|[^\d.,])1([A-Za-z])(?![A-Za-z(])/g, "$1$2");
  }

  // ---- ::: reveal — one step at a time
  document.querySelectorAll(".steps.reveal").forEach(function (box) {
    var lis = box.querySelectorAll("li.step"), n = lis.length, shown = 1;
    if (n < 2) return;
    var bar = document.createElement("div");
    bar.className = "wbar";
    bar.innerHTML = '<button type="button" class="btn on" data-next></button>' +
      '<button type="button" class="btn" data-all>எல்லாப் படிகளையும் காட்டு</button><span class="note"></span>';
    box.appendChild(bar);
    var next = bar.querySelector("[data-next]");
    function draw() {
      lis.forEach(function (li, i) { li.classList.toggle("wait", i >= shown); });
      next.textContent = shown < n ? "அடுத்த படி ▸" : "↺ முதலிலிருந்து";
      bar.querySelector(".note").textContent = "படி " + shown + " / " + n;
      bar.querySelector("[data-all]").hidden = shown >= n;
    }
    next.onclick = function () {
      shown = shown < n ? shown + 1 : 1;
      draw();
      if (shown > 1) lis[shown - 1].scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    bar.querySelector("[data-all]").onclick = function () { shown = n; draw(); };
    draw();
  });

  // ---- journal-checker
  function journal(W, c) {
    var accs = c.accounts || [], items = c.items || [], solved = {};
    var opts = '<option value="">— தெரிவு —</option>' +
      accs.map(function (a, i) { return '<option value="' + i + '">' + esc(a) + "</option>"; }).join("");
    function answerTable(it) {
      var rows = Object.keys(it.dr).map(function (a) { return "<tr><td>" + esc(a) + ' (Dr)</td><td class="num">' + fmt(it.dr[a]) + "</td><td></td></tr>"; })
        .concat(Object.keys(it.cr).map(function (a) { return '<tr><td class="to">' + esc(a) + ' (Cr)</td><td></td><td class="num">' + fmt(it.cr[a]) + "</td></tr>"; }));
      return '<div class="tbl"><table><thead><tr><th>கணக்கு</th><th>' + DR + "</th><th>" + CR + "</th></tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
    }
    var box = document.createElement("div");
    box.innerHTML = items.map(function (it, k) {
      var n = Object.keys(it.dr).length + Object.keys(it.cr).length, rows = "";
      for (var r = 0; r < n; r++) {
        rows += '<tr><td><select aria-label="கணக்கு">' + opts + "</select></td><td>" + numInput('class="dr" aria-label="' + DR + '"') +
          "</td><td>" + numInput('class="cr" aria-label="' + CR + '"') + "</td></tr>";
      }
      return '<div class="wcard" data-k="' + k + '"><div class="wq"><b>' + (k + 1) + ".</b> " + it.t + "</div>" +
        '<div class="tbl"><table class="wjt"><thead><tr><th>கணக்கு (Account)</th><th>' + DR + "</th><th>" + CR + "</th></tr></thead><tbody>" + rows +
        '</tbody></table></div><div class="wbar"><button type="button" class="btn on" data-check>சரிபார் (Check)</button>' +
        '<button type="button" class="btn" data-show>விடையைக் காட்டு</button></div><div class="wres" hidden></div></div>';
    }).join("") + '<p class="wscore note"></p>';
    W.appendChild(box);
    function score() {
      box.querySelector(".wscore").textContent = "சரியாகச் செய்தவை: " + Object.keys(solved).length + " / " + items.length;
    }
    function check(card, it) {
      var dr = {}, cr = {}, msgs = [];
      card.querySelectorAll("tbody tr").forEach(function (tr) {
        var sel = tr.querySelector("select").value, d = num(tr.querySelector(".dr").value), k = num(tr.querySelector(".cr").value);
        if (sel === "" && (d || k)) { msgs.push("ஒரு வரியில் தொகை உண்டு, ஆனால் கணக்கு தெரிவு செய்யப்படவில்லை."); return; }
        if (sel === "") return;
        var a = accs[+sel];
        if (d && k) msgs.push(esc(a) + ": ஒரு வரியில் பற்று அல்லது வரவு, ஒன்றை மட்டும் எழுதுங்கள்.");
        if (!d && !k) msgs.push(esc(a) + ": தொகையை எழுதுங்கள்.");
        if (d) dr[a] = (dr[a] || 0) + d;
        if (k) cr[a] = (cr[a] || 0) + k;
      });
      if (!msgs.length) {
        if (!same(sum(dr), sum(cr))) {
          msgs.push("பற்று மொத்தம் (" + fmt(sum(dr)) + ") ≠ வரவு மொத்தம் (" + fmt(sum(cr)) + "). இரட்டைப் பதிவில் இரண்டும் சமமாக இருக்க வேண்டும்.");
        }
        [["dr", dr, cr, "பற்று (Debit)"], ["cr", cr, dr, "வரவு (Credit)"]].forEach(function (x) {
          var want = it[x[0]], mine = x[1], other = x[2];
          Object.keys(want).forEach(function (a) {
            if (!has(mine, a)) msgs.push(has(other, a) ? "<b>" + esc(a) + "</b>: பக்கம் தவறு. இது " + x[3] + " பக்கம்." : "<b>" + esc(a) + "</b> கணக்கு விடுபட்டுள்ளது.");
            else if (!same(mine[a], want[a])) msgs.push("<b>" + esc(a) + "</b>: தொகை தவறு.");
          });
        });
        Object.keys(dr).concat(Object.keys(cr)).forEach(function (a) {
          if (!has(it.dr, a) && !has(it.cr, a)) msgs.push("<b>" + esc(a) + "</b> இந்தப் பதிவில் வராது.");
        });
      }
      var res = card.querySelector(".wres"), ok = !msgs.length;
      if (ok) solved[card.dataset.k] = 1;
      card.classList.toggle("ok", ok); card.classList.toggle("no", !ok);
      res.innerHTML = ok ? "<p><b>✓ சரி!</b></p>" + (it.e ? "<p>" + it.e + "</p>" : "")
        : "<p><b>✗ இன்னும் சரியில்லை.</b></p><ul>" + msgs.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ul><p class=\"note\">திருத்தி மீண்டும் சரிபாருங்கள்.</p>";
      res.hidden = false;
      score();
    }
    box.addEventListener("click", function (e) {
      var card = e.target.closest(".wcard");
      if (!card) return;
      var it = items[+card.dataset.k], res = card.querySelector(".wres");
      if (e.target.closest("[data-check]")) check(card, it);
      else if (e.target.closest("[data-show]")) {
        res.innerHTML = "<p><b>சரியான பதிவு (Correct entry):</b></p>" + answerTable(it) + (it.e ? "<p>" + it.e + "</p>" : "");
        res.hidden = false;
      }
    });
    score();
  }

  // ---- t-account: T drawing shared by exercise and free mode
  function tDraw(name, dr, cr, bal) { // dr/cr: [{t, amt, cls}]; bal: add balance c/d + b/d
    var td = dr.reduce(function (a, r) { return a + r.amt; }, 0), tc = cr.reduce(function (a, r) { return a + r.amt; }, 0);
    dr = dr.slice(); cr = cr.slice();
    var bd = null;
    if (bal && !same(td, tc)) {
      var small = td < tc ? dr : cr;
      small.push({ t: "மீதி c/d (Balance c/d)", amt: Math.abs(td - tc), cls: "bal" });
      bd = { side: td > tc ? "dr" : "cr", amt: Math.abs(td - tc) };
    }
    var n = Math.max(dr.length, cr.length, 1), tot = bal ? Math.max(td, tc) : null;
    function col(rows, side) {
      var h = "";
      for (var i = 0; i < n; i++) {
        var r = rows[i];
        h += r ? '<li class="' + (r.cls || "") + '"><span>' + r.t + "</span><b>" + fmt(r.amt) + "</b></li>" : '<li class="pad"><span>&nbsp;</span></li>';
      }
      h += '<li class="tot"><span>' + (bal ? "மொத்தம்" : "கூட்டுத்தொகை") + "</span><b>" + fmt(bal ? tot : side === "dr" ? td : tc) + "</b></li>";
      if (bd) h += bd.side === side ? '<li class="bal"><span>மீதி b/d (Balance b/d)</span><b>' + fmt(bd.amt) + "</b></li>" : '<li class="pad"><span>&nbsp;</span></li>';
      return "<ul>" + h + "</ul>";
    }
    return '<div class="tacc"><div class="tname">' + esc(name) + '</div><div class="tcols"><div><div class="th">' + DR + "</div>" + col(dr, "dr") +
      '</div><div><div class="th">' + CR + "</div>" + col(cr, "cr") + "</div></div></div>" +
      (bd ? '<p class="note">' + (bd.side === "dr" ? "பற்று மீதி (Debit balance)" : "வரவு மீதி (Credit balance)") + ": " + fmt(bd.amt) + "</p>" : "");
  }
  function tAccount(W, c) {
    var name = c.account || "கணக்கு (Account)", items = c.items || [], box = document.createElement("div");
    W.appendChild(box);
    if (!items.length) return tFree(box, name);
    var placed = [], mistakes = 0, balanced = false, msg = "";
    function rows(side) {
      return placed.filter(function (k) { return items[k].side === side; }).map(function (k) { return { t: items[k].t, amt: items[k].amt }; });
    }
    function draw() {
      var left = items.map(function (it, k) { return placed.indexOf(k) < 0 ? k : -1; }).filter(function (k) { return k >= 0; });
      var h = tDraw(name, rows("dr"), rows("cr"), balanced);
      if (left.length) {
        h += '<p class="note">ஒவ்வொரு பதிவும் இந்தக் கணக்கின் எந்தப் பக்கம் வரும்? (Which side?)</p><div class="tpend">' + left.map(function (k) {
          return '<div class="wcard" data-k="' + k + '"><span>' + items[k].t + " · <b>" + fmt(items[k].amt) + "</b></span>" +
            '<span class="wtog"><button type="button" class="btn" data-s="dr">◂ Dr</button><button type="button" class="btn" data-s="cr">Cr ▸</button></span></div>';
        }).join("") + "</div>";
      } else if (!balanced) {
        var add = function (a, r) { return a + r.amt; }, td = rows("dr").reduce(add, 0), tc = rows("cr").reduce(add, 0);
        h += same(td, tc)
          ? '<div class="wres ok"><p><b>✓ எல்லாம் சரி.</b> இரு பக்கமும் சமம் (' + fmt(td) + "): மீதி இல்லை.</p></div>"
          : '<div class="wcard tbalq"><p><b>இப்போது கணக்கை மீதிப்படுத்துங்கள் (Balance the account).</b></p>' +
            '<p>மீதி c/d (Balance c/d) தொகை: ' + numInput('class="bamt" aria-label="Balance c/d"') + "</p>" +
            '<p>அது எந்தப் பக்கம் எழுதப்படும்? <span class="wtog"><button type="button" class="btn" data-b="dr">Dr</button><button type="button" class="btn" data-b="cr">Cr</button></span></p></div>';
      } else {
        h += '<div class="wres ok"><p><b>✓ முடிந்தது!</b> தவறுகள்: ' + mistakes + ". சிறிய பக்கத்தில் மீதி c/d, அடுத்த காலத்தில் எதிர்ப் பக்கத்தில் மீதி b/d.</p></div>";
      }
      if (msg) h += msg;
      h += '<div class="wbar"><button type="button" class="btn" data-reset>↺ மீண்டும் (Reset)</button></div>';
      box.innerHTML = h;
      msg = "";
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-reset")) { placed = []; mistakes = 0; balanced = false; return draw(); }
      if (b.dataset.s) {
        var k = +b.closest(".wcard").dataset.k, it = items[k];
        if (b.dataset.s === it.side) { placed.push(k); msg = '<div class="wres ok"><p><b>✓ சரி.</b> ' + (it.e || "") + "</p></div>"; }
        else { mistakes++; msg = '<div class="wres no"><p><b>✗ தவறு.</b> ' + it.t + " " + (it.side === "dr" ? DR : CR) + " பக்கம் வரும். " + (it.e || "") + "</p></div>"; }
        return draw();
      }
      if (b.dataset.b) {
        var td = 0, tc = 0;
        placed.forEach(function (k) { if (items[k].side === "dr") td += items[k].amt; else tc += items[k].amt; });
        var want = td < tc ? "dr" : "cr", amt = num(box.querySelector(".bamt").value), m = [];
        if (!same(amt, Math.abs(td - tc))) m.push("தொகை: பெரிய பக்கக் கூட்டுத்தொகை − சிறிய பக்கக் கூட்டுத்தொகை = " + fmt(Math.max(td, tc)) + " − " + fmt(Math.min(td, tc)) + ".");
        if (b.dataset.b !== want) m.push("பக்கம்: மீதி c/d கூட்டுத்தொகை <b>குறைவான</b> பக்கத்தில் எழுதப்படும், இரு பக்கமும் சமமாக.");
        if (m.length) {
          mistakes++;
          var keep = box.querySelector(".bamt").value;
          msg = '<div class="wres no"><p><b>✗ இன்னும் சரியில்லை.</b></p><ul><li>' + m.join("</li><li>") + "</li></ul></div>";
          draw();
          box.querySelector(".bamt").value = keep;
          return;
        }
        balanced = true;
        draw();
      }
    });
    draw();
  }
  function tFree(box, name) {
    var dr = [], cr = [];
    box.innerHTML = '<div class="tout"></div><div class="wcard wform"><input type="text" class="tdesc" placeholder="விவரம் (உதா: முதல்)" aria-label="விவரம்">' +
      numInput('class="tamt" placeholder="தொகை" aria-label="தொகை"') +
      '<button type="button" class="btn" data-add="dr">+ ' + DR + '</button><button type="button" class="btn" data-add="cr">+ ' + CR + "</button>" +
      '<button type="button" class="btn" data-clear>அழி (Clear)</button></div>';
    function draw() { box.querySelector(".tout").innerHTML = tDraw(name, dr, cr, true); }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-clear")) { dr = []; cr = []; return draw(); }
      var amt = num(box.querySelector(".tamt").value), d = box.querySelector(".tdesc");
      if (!(amt > 0)) { box.querySelector(".tamt").focus(); return; }
      (b.dataset.add === "dr" ? dr : cr).push({ t: esc(d.value || "—"), amt: amt });
      d.value = ""; box.querySelector(".tamt").value = ""; d.focus();
      draw();
    });
    draw();
  }

  // ---- trial-balance
  function trialBalance(W, c) {
    var items = c.items || [], box = document.createElement("div");
    W.appendChild(box);
    if (!items.length) return tbFree(box);
    var side = items.map(function () { return null; }), checked = false;
    function draw() {
      var td = 0, tc = 0, all = true;
      var rows = items.map(function (it, k) {
        var s = side[k], cls = checked && s ? (s === it.side ? "ok" : "no") : "";
        if (s === "dr") td += it.amt; else if (s === "cr") tc += it.amt; else all = false;
        return '<tr class="' + cls + '" data-k="' + k + '"><td>' + esc(it.a) + '<span class="wtog"><button type="button" class="btn' + (s === "dr" ? " on" : "") +
          '" data-s="dr">Dr</button><button type="button" class="btn' + (s === "cr" ? " on" : "") + '" data-s="cr">Cr</button></span>' +
          (cls === "no" && it.e ? '<small class="why">' + it.e + "</small>" : "") + '</td><td class="num">' + (s === "dr" ? fmt(it.amt) : "") +
          '</td><td class="num">' + (s === "cr" ? fmt(it.amt) : "") + "</td></tr>";
      }).join("");
      var wrong = items.filter(function (it, k) { return side[k] && side[k] !== it.side; }).length, h;
      if (!all) h = '<p class="note">ஒவ்வொரு மீதியும் பற்றா வரவா என்று தெரிவு செய்யுங்கள். மொத்தங்கள் உடனே மாறும்.</p>';
      else if (!checked) h = '<p class="note">' + (same(td, tc) ? "மொத்தங்கள் சமம். இப்போது சரிபாருங்கள்." : "மொத்தங்கள் சமமில்லை: வேறுபாடு " + fmt(Math.abs(td - tc)) + ". எங்கோ பிழை உள்ளது.") + "</p>";
      else if (!wrong) h = '<div class="wres ok"><p><b>✓ எல்லாம் சரி!</b> ' + (same(td, tc) ? "பரீட்சை மீதி சமன் (Trial balance agrees)." : "இந்தக் கணக்குகளின் மீதிகள் சமமாகவில்லை: பதிவுகளில் பிழை உள்ளது என்பதே இதன் பொருள்.") + "</p></div>";
      else h = '<div class="wres no"><p><b>✗ ' + wrong + " தவறு.</b> சிவப்பு வரிகளைத் திருத்துங்கள்." +
        (same(td, tc) ? " மொத்தங்கள் சமமாக இருந்தாலும் பிழைகள் இருக்கலாம்!" : "") + "</p></div>";
      box.innerHTML = '<div class="tbl"><table class="wtb"><thead><tr><th>கணக்கு (Account)</th><th>' + DR + "</th><th>" + CR + "</th></tr></thead><tbody>" + rows +
        '</tbody><tfoot><tr><th>மொத்தம் (Total)</th><th class="num">' + fmt(td) + '</th><th class="num">' + fmt(tc) + "</th></tr></tfoot></table></div>" + h +
        '<div class="wbar"><button type="button" class="btn on" data-check' + (all ? "" : " disabled") + '>சரிபார் (Check)</button><button type="button" class="btn" data-reset>↺ மீண்டும்</button></div>';
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.s) { side[+b.closest("tr").dataset.k] = b.dataset.s; checked = false; }
      else if (b.hasAttribute("data-check")) checked = true;
      else if (b.hasAttribute("data-reset")) { side = side.map(function () { return null; }); checked = false; }
      draw();
    });
    draw();
  }
  function tbFree(box) {
    function row() {
      return '<tr><td><input type="text" aria-label="கணக்கு" placeholder="கணக்கு"></td><td>' + numInput('class="dr" aria-label="Dr"') + "</td><td>" + numInput('class="cr" aria-label="Cr"') + "</td></tr>";
    }
    box.innerHTML = '<div class="tbl"><table class="wtb"><thead><tr><th>கணக்கு (Account)</th><th>' + DR + "</th><th>" + CR + "</th></tr></thead><tbody>" +
      row() + row() + row() + row() + '</tbody><tfoot><tr><th>மொத்தம் (Total)</th><th class="num td"></th><th class="num tc"></th></tr></tfoot></table></div>' +
      '<p class="tbmsg note"></p><div class="wbar"><button type="button" class="btn" data-add>+ வரி சேர் (Add row)</button></div>';
    function draw() {
      var td = 0, tc = 0;
      box.querySelectorAll(".dr").forEach(function (i) { td += num(i.value) || 0; });
      box.querySelectorAll(".cr").forEach(function (i) { tc += num(i.value) || 0; });
      box.querySelector(".td").textContent = fmt(td);
      box.querySelector(".tc").textContent = fmt(tc);
      var m = box.querySelector(".tbmsg");
      m.textContent = !td && !tc ? "மீதிகளை எழுதுங்கள்; மொத்தங்கள் உடனே கணக்கிடப்படும்."
        : same(td, tc) ? "✓ பரீட்சை மீதி சமன் (Trial balance agrees)." : "வேறுபாடு (Difference): " + fmt(Math.abs(td - tc)) + " · " + (td > tc ? "பற்று அதிகம்" : "வரவு அதிகம்");
      m.className = "tbmsg note" + (td || tc ? same(td, tc) ? " good" : " warn" : "");
    }
    box.addEventListener("input", draw);
    box.querySelector("[data-add]").onclick = function () { box.querySelector("tbody").insertAdjacentHTML("beforeend", row()); };
    draw();
  }

  // ---- shared: labelled number inputs that redraw live
  function fields(list) { // [{id, l, v}] → html
    return '<div class="wfields">' + list.map(function (f) {
      return '<label><span>' + f.l + "</span>" + numInput('data-f="' + esc(f.id) + '"', f.v) + "</label>";
    }).join("") + "</div>";
  }
  function readFields(box) {
    var v = {};
    box.querySelectorAll("[data-f]").forEach(function (i) { v[i.dataset.f] = num(i.value); });
    return v;
  }

  // ---- depreciation
  function depreciation(W, c) {
    var box = document.createElement("div"), method = c.method === "rb" ? "rb" : "sl";
    W.appendChild(box);
    box.innerHTML = '<div class="wtog wmeth"><button type="button" class="btn" data-m="sl">நேர்கோட்டு முறை (Straight line)</button>' +
      '<button type="button" class="btn" data-m="rb">குறைந்துசெல் மீதி முறை (Reducing balance)</button></div>' +
      fields([{ id: "cost", l: "கிரயம் (Cost)", v: c.cost != null ? c.cost : 100000 },
        { id: "residual", l: "எஞ்சிய பெறுமதி (Residual value)", v: c.residual != null ? c.residual : 0 },
        { id: "life", l: "பயன்படு காலம், ஆண்டுகள் (Useful life)", v: c.life || 5 },
        { id: "rate", l: "தேய்மான வீதம் % (Rate)", v: c.rate != null ? c.rate : 20 }]) + '<div class="wout"></div>';
    function draw() {
      var v = readFields(box), out = box.querySelector(".wout");
      box.querySelectorAll("[data-m]").forEach(function (b) { b.classList.toggle("on", b.dataset.m === method); });
      box.querySelector('[data-f="residual"]').closest("label").hidden = method !== "sl";
      box.querySelector('[data-f="rate"]').closest("label").hidden = method !== "rb";
      var years = Math.round(v.life);
      if (!(v.cost > 0) || !(years >= 1 && years <= 50) || (method === "sl" && !(v.residual >= 0 && v.residual < v.cost)) || (method === "rb" && !(v.rate > 0 && v.rate < 100))) {
        out.innerHTML = '<p class="note warn">சரியான பெறுமதிகளை எழுதுங்கள் (கிரயம் > 0, ஆண்டுகள் 1–50' + (method === "sl" ? ", எஞ்சிய பெறுமதி < கிரயம்" : ", வீதம் 0–100%") + ").</p>";
        return;
      }
      var h, open = v.cost, acc = 0, rows = "";
      if (method === "sl") {
        var dep = (v.cost - v.residual) / years;
        h = '<p class="wf">ஆண்டுத் தேய்மானம் = (கிரயம் − எஞ்சிய பெறுமதி) ÷ பயன்படு காலம்<br>= (' + fmt(v.cost) + " − " + fmt(v.residual) + ") ÷ " + years +
          " = <b>" + fmt(dep) + "</b> (ஒவ்வொரு ஆண்டும் ஒரே தொகை)</p>";
      } else {
        h = '<p class="wf">ஆண்டுத் தேய்மானம் = ஆரம்ப ஏட்டுப் பெறுமதி × ' + fmt(v.rate) + "%<br>ஆண்டு 1 = " + fmt(v.cost) + " × " + fmt(v.rate) + "% = <b>" +
          fmt(v.cost * v.rate / 100) + "</b> (ஒவ்வொரு ஆண்டும் குறைகிறது)</p>";
      }
      for (var y = 1; y <= years; y++) {
        var d = method === "sl" ? (v.cost - v.residual) / years : Math.round(open * v.rate) / 100;
        acc += d;
        rows += "<tr><td>" + y + '</td><td class="num">' + fmt(open) + '</td><td class="num">' + fmt(d) + '</td><td class="num">' + fmt(acc) + '</td><td class="num">' + fmt(open - d) + "</td></tr>";
        open -= d;
      }
      out.innerHTML = h + '<div class="tbl"><table><thead><tr><th>ஆண்டு</th><th>ஆரம்ப ஏட்டுப் பெறுமதி (Opening book value)</th><th>தேய்மானம் (Depreciation)</th>' +
        "<th>திரண்ட தேய்மானம் (Accumulated)</th><th>இறுதி ஏட்டுப் பெறுமதி (Closing book value)</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    }
    box.addEventListener("input", draw);
    box.addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (b) { method = b.dataset.m; draw(); } });
    draw();
  }

  // ---- ratios
  var RIN = {
    ca: "நடைமுறைச் சொத்துகள் (Current assets)", cl: "நடைமுறைப் பொறுப்புகள் (Current liabilities)", inv: "இருப்பு (Inventory)",
    sales: "விற்பனை (Sales)", gp: "மொத்த இலாபம் (Gross profit)", np: "தேறிய இலாபம் (Net profit)", ce: "பயன்படுத்திய மூலதனம் (Capital employed)",
    cogs: "விற்பனைக் கிரயம் (Cost of sales)", avginv: "சராசரி இருப்பு (Average inventory)", debtors: "கடனாளிகள் (Trade receivables)",
    crsales: "கடன் விற்பனை (Credit sales)", creditors: "கடன்கொடுத்தோர் (Trade payables)", crpur: "கடன் கொள்வனவு (Credit purchases)"
  };
  var RATIOS = {
    current: { l: "நடைமுறை விகிதம் (Current ratio)", f: "ca / cl", u: " : 1" },
    quick: { l: "விரைவு விகிதம் (Quick / acid-test ratio)", f: "(ca - inv) / cl", u: " : 1" },
    gp: { l: "மொத்த இலாப வீதம் (Gross profit margin)", f: "gp / sales * 100", u: "%" },
    np: { l: "தேறிய இலாப வீதம் (Net profit margin)", f: "np / sales * 100", u: "%" },
    roce: { l: "பயன்படுத்திய மூலதன வருவாய் (ROCE)", f: "np / ce * 100", u: "%" },
    stock: { l: "இருப்புச் சுழற்சி (Inventory turnover)", f: "cogs / avginv", u: " முறை (times)" },
    debtors: { l: "கடனாளிகள் சேகரிப்புக் காலம் (Receivables days)", f: "debtors / crsales * 365", u: " நாட்கள் (days)" },
    creditors: { l: "கடன்கொடுத்தோர் கொடுப்பனவுக் காலம் (Payables days)", f: "creditors / crpur * 365", u: " நாட்கள் (days)" }
  };
  function ratios(W, c) {
    var show = (c.show && c.show.length ? c.show : Object.keys(RATIOS)).filter(function (r) { return RATIOS[r]; }), vals = c.values || {}, need = [];
    show.forEach(function (r) {
      RATIOS[r].fn = RATIOS[r].fn || compile(RATIOS[r].f);
      RATIOS[r].fn.tokens.forEach(function (t) { if (t.t === "id" && RIN[t.v] && need.indexOf(t.v) < 0) need.push(t.v); });
    });
    var box = document.createElement("div"), names = {};
    need.forEach(function (k) { names[k] = RIN[k].replace(/\s*\(.*\)$/, ""); });
    W.appendChild(box);
    box.innerHTML = fields(need.map(function (k) { return { id: k, l: RIN[k], v: vals[k] != null ? vals[k] : "" }; })) + '<div class="wout"></div>';
    function draw() {
      var v = readFields(box);
      box.querySelector(".wout").innerHTML = show.map(function (r) {
        var R = RATIOS[r], ok = R.fn.tokens.every(function (t) { return t.t !== "id" || isFinite(v[t.v]); }), x = ok ? R.fn(v) : NaN;
        return '<div class="wcard"><b>' + R.l + '</b><p class="wf">= ' + pretty(R.fn.tokens, null, names) + "<br>" +
          (ok ? "= " + pretty(R.fn.tokens, v) + " = <b>" + (isFinite(x) ? fmtFixed(x, 2) + R.u : "— (பூச்சியத்தால் வகுக்க முடியாது)") + "</b>" : '<span class="note">பெறுமதிகளை எழுதுங்கள்</span>') + "</p></div>";
      }).join("");
    }
    box.addEventListener("input", draw);
    draw();
  }

  // ---- formula
  function formula(W, c) {
    var vars = c.vars || [], outs = (c.out || []).map(function (o) {
      try { return { o: o, fn: compile(o.f) }; } catch (e) { return { o: o, err: e.message }; }
    });
    var box = document.createElement("div");
    W.appendChild(box);
    box.innerHTML = fields(vars) + '<div class="wout"></div>';
    function draw() {
      var env = readFields(box), names = {};
      box.querySelector(".wout").innerHTML = outs.map(function (x) {
        var o = x.o, h = '<div class="wcard"><b>' + (o.l || o.id) + "</b>";
        if (x.err) return h + '<p class="note warn">' + esc(x.err) + "</p></div>";
        var missing = x.fn.tokens.some(function (t) { return t.t === "id" && has(env, t.v) && !isFinite(env[t.v]); }), y;
        h += '<p class="wf">' + esc(o.id) + " = " + pretty(x.fn.tokens, null, names);
        if (missing) return h + '<br><span class="note">பெறுமதிகளை எழுதுங்கள்</span></p></div>';
        try { y = x.fn(env); } catch (e) { return h + '<br><span class="note warn">' + esc(e.message) + "</span></p></div>"; }
        env[o.id] = y;
        return h + "<br>= " + pretty(x.fn.tokens, env) + "<br>= <b>" + (isFinite(y) ? fmtFixed(y, o.d == null ? 2 : o.d) : "— (கணக்கிட முடியாது)") + "</b></p></div>";
      }).join("");
    }
    box.addEventListener("input", draw);
    draw();
  }

  // ---- graph with sliders
  var COLORS = ["var(--accent)", "var(--must)", "var(--extra)", "var(--should)"];
  function nice(range) { // tick step ≈ range / 5, rounded to 1, 2 or 5 × 10^k
    var r = range / 5, p = Math.pow(10, Math.floor(Math.log(r) / Math.LN10)), m = r / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function graph(W, c) {
    var X = c.x || [-10, 10], Y = c.y || [-10, 10], xl = c.xl || "x", yl = c.yl || "y", params = c.params || [];
    var fs = (c.fs || []).map(function (f) { try { return { f: f, fn: compile(f.f) }; } catch (e) { return { f: f, err: e.message }; } });
    var w = 360, h = 260, L = 40, R = 12, T = 12, B = 30;
    function sx(x) { return L + (x - X[0]) / (X[1] - X[0]) * (w - L - R); }
    function sy(y) { return h - B - (y - Y[0]) / (Y[1] - Y[0]) * (h - T - B); }
    var box = document.createElement("div"), id = "g" + Math.random().toString(36).slice(2, 8);
    W.appendChild(box);
    box.innerHTML = '<svg class="wsvg" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="வரைபு (Graph)"></svg><div class="wlegend"></div>' +
      '<div class="wsliders">' + params.map(function (p) {
        return '<label><span>' + (p.l ? p.l + " " : "") + "<b>" + esc(p.id) + ' = <output></output></b></span><input type="range" data-p="' + esc(p.id) + '" min="' + p.min +
          '" max="' + p.max + '" step="' + (p.step || (p.max - p.min) / 100) + '" value="' + (p.v != null ? p.v : p.min) + '"></label>';
      }).join("") + "</div>";
    var svg = box.querySelector("svg");
    function draw() {
      var env = {}, s = "", ren = { x: xl };
      box.querySelectorAll("[data-p]").forEach(function (i) { env[i.dataset.p] = +i.value; i.parentNode.querySelector("output").textContent = fmt(+i.value, 4); });
      s += '<defs><clipPath id="' + id + '"><rect x="' + L + '" y="' + T + '" width="' + (w - L - R) + '" height="' + (h - T - B) + '"/></clipPath></defs>';
      var dx = nice(X[1] - X[0]), dy = nice(Y[1] - Y[0]), v;
      for (v = Math.ceil(X[0] / dx) * dx; v <= X[1] + 1e-9; v += dx) {
        s += '<line class="gl" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (h - B) + '"/><text class="gt" x="' + sx(v) + '" y="' + (h - B + 14) + '" text-anchor="middle">' + fmt(v, 4) + "</text>";
      }
      for (v = Math.ceil(Y[0] / dy) * dy; v <= Y[1] + 1e-9; v += dy) {
        s += '<line class="gl" y1="' + sy(v) + '" y2="' + sy(v) + '" x1="' + L + '" x2="' + (w - R) + '"/><text class="gt" x="' + (L - 4) + '" y="' + (sy(v) + 4) + '" text-anchor="end">' + fmt(v, 4) + "</text>";
      }
      var ax = Math.min(Math.max(0, X[0]), X[1]), ay = Math.min(Math.max(0, Y[0]), Y[1]);
      s += '<line class="ga" x1="' + L + '" x2="' + (w - R) + '" y1="' + sy(ay) + '" y2="' + sy(ay) + '"/><line class="ga" y1="' + T + '" y2="' + (h - B) + '" x1="' + sx(ax) + '" x2="' + sx(ax) + '"/>';
      s += '<text class="gn" x="' + (w - R) + '" y="' + (sy(ay) - 5) + '" text-anchor="end">' + esc(xl) + '</text><text class="gn" x="' + (sx(ax) + 5) + '" y="' + (T + 10) + '">' + esc(yl) + "</text>";
      var legend = "", err = "";
      fs.forEach(function (F, k) {
        var col = COLORS[k % COLORS.length];
        if (F.err) { err += esc(F.err) + " "; return; }
        var pts = [], segs = [], N = 240;
        for (var i = 0; i <= N; i++) {
          var x = X[0] + (X[1] - X[0]) * i / N, y;
          try { y = F.fn(Object.assign({ x: x }, env)); } catch (e) { err = esc(e.message); return; }
          if (isFinite(y) && Math.abs(y - Y[0]) < 50 * (Y[1] - Y[0])) pts.push(sx(x).toFixed(1) + "," + sy(y).toFixed(1));
          else if (pts.length) { segs.push(pts); pts = []; }
        }
        if (pts.length) segs.push(pts);
        segs.forEach(function (p) { s += '<polyline clip-path="url(#' + id + ')" fill="none" stroke="' + col + '" stroke-width="2.5" points="' + p.join(" ") + '"/>'; });
        legend += '<div><i style="background:' + col + '"></i><span>' + (F.f.l ? F.f.l + ": " : "") + esc(yl) + " = " + pretty(F.fn.tokens, env, ren) + "</span></div>";
      });
      // marks: where curve 1 meets curve 2 (cross) or y = 0 (roots)
      var marks = [], g = null;
      if (c.mark === "cross" && fs.length > 1 && fs[0].fn && fs[1].fn) g = function (x) { var e = Object.assign({ x: x }, env); return fs[0].fn(e) - fs[1].fn(e); };
      if (c.mark === "roots" && fs[0] && fs[0].fn) g = function (x) { return fs[0].fn(Object.assign({ x: x }, env)); };
      if (g) try {
        var M = 400, px = X[0], pg;
        try { pg = g(px); } catch (e) { pg = NaN; }
        for (var j = 1; j <= M; j++) {
          var cx = X[0] + (X[1] - X[0]) * j / M, cg;
          try { cg = g(cx); } catch (e) { cg = NaN; }
          if (isFinite(pg) && isFinite(cg) && (pg === 0 || pg * cg < 0)) {
            var a = px, b = cx, ga = pg;
            for (var it = 0; it < 60; it++) { var mid = (a + b) / 2, gm = g(mid); if (ga * gm <= 0) b = mid; else { a = mid; ga = gm; } }
            var rx = (a + b) / 2, ry = fs[0].fn(Object.assign({ x: rx }, env));
            if (Math.abs(g(rx)) < 1e-6 * (1 + Math.abs(ry)) && !marks.some(function (m) { return Math.abs(m[0] - rx) < 1e-6; })) marks.push([rx, c.mark === "roots" ? 0 : ry]);
          }
          px = cx; pg = cg;
        }
        marks.forEach(function (m) {
          s += '<g clip-path="url(#' + id + ')"><line class="gd" x1="' + sx(m[0]) + '" x2="' + sx(m[0]) + '" y1="' + sy(m[1]) + '" y2="' + sy(ay) + '"/>' +
            '<line class="gd" x1="' + sx(ax) + '" x2="' + sx(m[0]) + '" y1="' + sy(m[1]) + '" y2="' + sy(m[1]) + '"/><circle cx="' + sx(m[0]) + '" cy="' + sy(m[1]) + '" r="5" class="gp"/></g>';
        });
        legend += '<p class="wf">' + (c.mark === "cross" ? "சந்திக்கும் புள்ளி (Intersection)" : "மூலங்கள் (Roots: " + esc(yl) + " = 0)") + ": " +
          (marks.length ? marks.map(function (m) { return esc(xl) + " = <b>" + fmt(m[0], 2) + "</b>" + (c.mark === "cross" ? ", " + esc(yl) + " = <b>" + fmt(m[1], 2) + "</b>" : ""); }).join(" · ")
            : "இந்த வரைபுப் பகுதியில் இல்லை") + "</p>";
      } catch (e) { err += esc(e.message); }
      svg.innerHTML = s;
      box.querySelector(".wlegend").innerHTML = legend + (err ? '<p class="note warn">' + err + "</p>" : "");
    }
    box.addEventListener("input", draw);
    draw();
  }

  // ---- practice blocks (::: cards / order / match / sort / check): config html comes from the builder
  function mix(a) { // shuffled copy that is never left in the original order
    var b = a.slice();
    for (var n = 0; n < 6; n++) {
      for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = b[i]; b[i] = b[j]; b[j] = t; }
      if (b.some(function (x, k) { return x !== a[k]; })) break;
    }
    return b;
  }
  function head(box, c, label) {
    box.insertAdjacentHTML("afterbegin", '<div class="phead"><span class="plabel">' + label + "</span>" +
      (c.title ? '<span class="ptitle">' + c.title + "</span>" : "") + "</div>");
  }
  function result(box, ok, total, c) {
    var r = box.querySelector(".wres");
    r.hidden = false;
    r.className = "wres " + (ok === total ? "ok" : "no");
    r.innerHTML = "<p><b>" + (ok === total ? "✓ எல்லாம் சரி!" : ok + " / " + total + " சரி. சிவப்பில் உள்ளவற்றை மாற்றி மீண்டும் சரிபாருங்கள்.") +
      "</b></p>" + (ok === total && c.e ? c.e : "");
  }
  var BAR = '<div class="wbar"><button type="button" class="btn on" data-go>சரிபார்</button>' +
    '<button type="button" class="btn" data-show>விடையைக் காட்டு</button></div><div class="wres" hidden></div>';

  function cards(box, c) {
    head(box, c, "நினைவு அட்டைகள்");
    var html = '<p class="note">அட்டையைத் தொட்டால் மறுபக்கம் தெரியும். முதலில் நீங்களே நினைவுபடுத்திப் பாருங்கள்.</p><div class="fcards">';
    c.items.forEach(function (it, i) {
      html += '<button type="button" class="fcard" data-i="' + i + '" aria-pressed="false"><span class="ff">' + it.f +
        '</span><span class="fb">' + it.b + "</span></button>";
    });
    box.insertAdjacentHTML("beforeend", html + '</div><p class="note fcount">0 / ' + c.items.length + " திருப்பப்பட்டது</p>");
    var seen = {};
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".fcard");
      if (!b) return;
      var on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      seen[b.dataset.i] = 1;
      box.querySelector(".fcount").textContent = Object.keys(seen).length + " / " + c.items.length + " திருப்பப்பட்டது";
    });
  }

  function order(box, c) {
    head(box, c, "வரிசைப்படுத்துங்கள்");
    var cur = mix(c.items.map(function (_, i) { return i; }));
    box.insertAdjacentHTML("beforeend", '<p class="note">▲ ▼ பொத்தான்களால் சரியான வரிசைக்கு மாற்றுங்கள்.</p><ol class="olist"></ol>' + BAR);
    var ol = box.querySelector(".olist");
    function draw(marks) {
      ol.innerHTML = cur.map(function (k, pos) {
        var m = marks ? (marks[pos] ? " ok" : " no") : "";
        return '<li class="orow' + m + '"><span class="otext">' + c.items[k] + '</span><span class="obtn">' +
          '<button type="button" class="btn" data-up="' + pos + '"' + (pos ? "" : " disabled") + ' aria-label="மேலே">▲</button>' +
          '<button type="button" class="btn" data-down="' + pos + '"' + (pos < cur.length - 1 ? "" : " disabled") + ' aria-label="கீழே">▼</button></span></li>';
      }).join("");
    }
    draw();
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-up") || b.hasAttribute("data-down")) {
        var p = +(b.dataset.up != null ? b.dataset.up : b.dataset.down), q = b.dataset.up != null ? p - 1 : p + 1, t = cur[p];
        cur[p] = cur[q]; cur[q] = t; draw(); box.querySelector(".wres").hidden = true;
      } else if (b.hasAttribute("data-go")) {
        var marks = cur.map(function (k, pos) { return k === pos; });
        draw(marks); result(box, marks.filter(Boolean).length, cur.length, c);
      } else if (b.hasAttribute("data-show")) {
        cur = c.items.map(function (_, i) { return i; }); draw(cur.map(function () { return true; }));
        result(box, cur.length, cur.length, c);
      }
    });
  }

  function choose(box, c, rows, opts, label, note, drop) { // match (drop-down) + sort (buttons): one choice per row
    head(box, c, label);
    var html = '<p class="note">' + note + '</p><div class="mlist">';
    rows.forEach(function (r, i) {
      html += '<div class="mrow" data-i="' + i + '"><div class="mleft">' + r.text + '</div>' + (drop
        ? '<select class="msel"><option value="">தெரிவு செய்யுங்கள்…</option>' + opts.map(function (o) {
            return '<option value="' + o.v + '">' + o.h.replace(/<[^>]+>/g, "") + "</option>"; }).join("") + "</select>"
        : '<div class="mopts">' + opts.map(function (o) { return '<button type="button" class="btn mopt" data-o="' + o.v + '">' + o.h + "</button>"; }).join("") + "</div>") +
        "</div>";
    });
    box.insertAdjacentHTML("beforeend", html + "</div>" + BAR);
    var pick = {};
    function mark(show) {
      var ok = 0;
      box.querySelectorAll(".mrow").forEach(function (row) {
        var i = row.dataset.i, want = String(rows[i].ans);
        if (show) pick[i] = want;
        row.querySelectorAll(".mopt").forEach(function (b) { b.classList.toggle("on", b.dataset.o === pick[i]); });
        var sel = row.querySelector(".msel");
        if (sel && show) sel.value = want;
        var good = pick[i] === want;
        row.classList.toggle("ok", good); row.classList.toggle("no", !good);
        if (good) ok++;
      });
      result(box, ok, rows.length, c);
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("mopt")) {
        var row = b.closest(".mrow");
        pick[row.dataset.i] = b.dataset.o;
        row.classList.remove("ok", "no");
        row.querySelectorAll(".mopt").forEach(function (x) { x.classList.toggle("on", x === b); });
        box.querySelector(".wres").hidden = true;
      } else if (b.hasAttribute("data-go")) mark(false);
      else if (b.hasAttribute("data-show")) mark(true);
    });
    box.addEventListener("change", function (e) {
      if (!e.target.classList.contains("msel")) return;
      var row = e.target.closest(".mrow");
      pick[row.dataset.i] = e.target.value;
      row.classList.remove("ok", "no");
      box.querySelector(".wres").hidden = true;
    });
  }
  function match(box, c) {
    var order = mix(c.items.map(function (_, i) { return i; }));
    choose(box, c, c.items.map(function (it, i) { return { text: it.l, ans: i }; }),
      order.map(function (i) { return { v: i, h: c.items[i].r }; }), "பொருத்துங்கள்",
      "ஒவ்வொன்றுக்கும் பொருத்தமான விடையைத் தெரிவு செய்யுங்கள்.", true);
  }
  function sort(box, c) {
    var rows = mix(c.items.map(function (_, i) { return i; })).map(function (i) { return { text: c.items[i].x, ans: c.items[i].g }; });
    choose(box, c, rows, c.groups.map(function (g, i) { return { v: i, h: g }; }), "வகைப்படுத்துங்கள்",
      "ஒவ்வொன்றும் எந்தப் பிரிவுக்கு உரியது என்று தெரிவு செய்யுங்கள்.");
  }

  function answer(v) { // same rules as the chapter quiz: whole input must be a number, fractions allowed
    var s = String(v).trim().replace(/^rs\.?\s*/i, "").replace(/[,\s]/g, "").replace(/\u2212/g, "-");
    var f = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s); // a fraction such as 9/4
    if (f) return +f[2] ? f[1] / f[2] : NaN;
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }
  function check(box, c) {
    head(box, c, "சிறு சோதனை");
    var html = "";
    c.qs.forEach(function (q, i) {
      html += '<div class="pq" data-i="' + i + '"><div class="qt">' + q.q + "</div>" + (q.o
        ? '<div class="qopts">' + q.o.map(function (o, j) { return '<button type="button" class="qo" data-o="' + j + '"><span class="ql">' + "ABCDEFGH"[j] + "</span><span>" + o + "</span></button>"; }).join("") + "</div>"
        : '<div class="qn"><input type="text" inputmode="text" autocomplete="off" placeholder="விடை (உதா: 15 அல்லது 9/4)"><button type="button" class="btn on" data-num>சரிபார்</button></div>') +
        '<div class="qe" hidden></div></div>';
    });
    box.insertAdjacentHTML("beforeend", html);
    function review(q, ok) {
      return !ok && q.r ? '<p><a class="btn" href="' + esc(q.r) + '">எளிய உதாரணத்துடன் மீண்டும் முயலுங்கள்</a></p>' : "";
    }
    function checkNum(el) { // stays open until right, so the student can try again; "விடை" comes from the explanation
      var q = c.qs[el.dataset.i], inp = el.querySelector("input"), x = answer(inp.value), ex = el.querySelector(".qe");
      ex.hidden = false;
      if (isNaN(x)) { ex.innerHTML = "<p>ஒரு எண்ணை எழுதுங்கள் (உதா: 15, 2.5 அல்லது 9/4).</p>"; return; }
      var ok = Math.abs(x - q.n) <= (q.t || 0) + 1e-9;
      inp.classList.toggle("right", ok); inp.classList.toggle("wrong", !ok);
      el.classList.toggle("ok", ok);
      if (ok) inp.disabled = el.querySelector("[data-num]").disabled = true;
      ex.innerHTML = ok ? "<p><b>✓ சரி!</b></p>" + (q.e || "")
        : '<p><b>✗ இன்னும் சரியில்லை.</b> மீண்டும் முயலுங்கள், அல்லது <button type="button" class="btn" data-why>விளக்கத்தைக் காட்டு</button></p>' + review(q, false);
    }
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.matches(".qn input")) checkNum(e.target.closest(".pq"));
    });
    box.addEventListener("click", function (e) {
      if (e.target.closest("[data-num]")) return checkNum(e.target.closest(".pq"));
      if (e.target.closest("[data-why]")) { var pq = e.target.closest(".pq"); var q = c.qs[pq.dataset.i]; pq.querySelector(".qe").innerHTML = (q.e || "") + review(q, false); return; }
      var b = e.target.closest(".qo");
      if (!b) return;
      var el = b.closest(".pq"), q = c.qs[el.dataset.i], o = +b.dataset.o, ok = o === q.a;
      el.querySelectorAll(".qo").forEach(function (x) {
        x.disabled = true;
        if (+x.dataset.o === q.a) x.classList.add("right");
      });
      if (!ok) b.classList.add("wrong");
      var ex = el.querySelector(".qe");
      ex.hidden = false;
      ex.innerHTML = "<p><b>" + (ok ? "✓ சரி!" : "✗ தவறு.") + "</b></p>" + (q.e || "") + review(q, ok);
      el.classList.add(ok ? "ok" : "no");
    });
  }

  var KIT = { "journal-checker": journal, "t-account": tAccount, "trial-balance": trialBalance,
    depreciation: depreciation, ratios: ratios, formula: formula, graph: graph,
    cards: cards, order: order, match: match, sort: sort, check: check };
  document.querySelectorAll(".widget[data-widget]").forEach(function (W) {
    var d = W.querySelector(".wdata"), fn = KIT[W.dataset.widget];
    if (!fn || !d) return;
    try { fn(W, JSON.parse(d.textContent)); W.classList.add("live"); }
    catch (e) { W.insertAdjacentHTML("beforeend", '<p class="note warn">இந்தக் கருவியைத் திறக்க முடியவில்லை: ' + esc(e.message) + "</p>"); }
  });
})();
