// Terminal hero background renderer (homepage only)
(function () {
  const CUR_HTML =
    '<span class="cur" id="cur" aria-hidden="true"></span>';

  function sl(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function rnd(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function isMobile() {
    return window.innerWidth < 768;
  }

  function wrapLineMobile(text, maxLen) {
    const s = String(text || "");
    if (!isMobile() || s.length <= maxLen) return [s];
    // Split into exactly two lines at a space boundary (best-effort)
    const idx = (() => {
      const slice = s.slice(0, maxLen + 1);
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace >= 10) return lastSpace;
      return maxLen;
    })();
    const a = s.slice(0, idx).trimEnd();
    const b = s.slice(idx).trimStart();
    return [a, b];
  }

  function init() {
    const host = document.getElementById("terminal-bg-container");
    if (!host) return;

    // Build terminal DOM inside hero container (not body)
    host.innerHTML = `
      <div id="glow"></div>
      <div id="term">
        <div id="linesContainer"></div>
        <div id="activeLine"></div>
      </div>
    `;

    const container = host.querySelector("#linesContainer");
    const activeLine = host.querySelector("#activeLine");
    if (!container || !activeLine) return;

    let allLines = [];
    const MAX_LINES = 50;

    // Cursor blink
    let cv = true;
    setInterval(() => {
      cv = !cv;
      const c = host.querySelector("#cur");
      if (c) c.style.opacity = cv ? "0.9" : "0";
    }, 950);

    function applyResponsiveSizing() {
      const fontSize = isMobile() ? 9 : 11;
      const term = host.querySelector("#term");
      if (term) term.style.fontSize = fontSize + "px";
      if (activeLine) activeLine.style.fontSize = fontSize + "px";
    }
    applyResponsiveSizing();
    window.addEventListener("resize", applyResponsiveSizing);

    function renderActive(text, cls) {
      activeLine.className = cls || "mid";
      activeLine.style.textAlign = "left";

      const parts = wrapLineMobile(text, 45);
      const totalLen = parts.reduce((s, p) => s + String(p).length, 0);
      if (totalLen === 0) {
        activeLine.innerHTML = CUR_HTML;
        return;
      }

      // Restore base class colors (used for far-field character tint).
      const classRGB = {
        dim: [42, 74, 122],
        mid: [58, 106, 170],
        bright: [106, 159, 216],
        white: [168, 188, 212],
        grey: [90, 122, 154],
        err: [122, 58, 74],
        ok: [58, 122, 90],
        comment: [90, 142, 200],
        slow: [122, 170, 216],
      };

      // Near-white glow target color (at cursor).
      const GLOW_R = 220, GLOW_G = 238, GLOW_B = 255;

      function lerpColor(r1, g1, b1, r2, g2, b2, t) {
        return [
          Math.round(r1 + (r2 - r1) * t),
          Math.round(g1 + (g2 - g1) * t),
          Math.round(b1 + (b2 - b1) * t),
        ];
      }

      const base = classRGB[cls] || classRGB.mid;

      // Wider, smoother falloff (bigger “glow circle” than tight k=0.018).
      const k = 0.0065;
      const power = 1.1;

      let html = "";
      let offset = 0;
      for (let partIdx = 0; partIdx < parts.length; partIdx++) {
        const part = String(parts[partIdx]);
        const len = part.length;
        for (let i = 0; i < len; i++) {
          const dist = totalLen - (offset + i); // dist=1 is nearest to cursor
          let t = 1 / (1 + Math.pow(dist, power) * k);
          // Lift mid-tones so distant chars aren’t “dead” / flat vs Claude.
          t = Math.min(1, Math.pow(t, 0.82) * 1.08 + 0.04);

          const [r, g, b] = lerpColor(
            base[0], base[1], base[2],
            GLOW_R, GLOW_G, GLOW_B,
            t
          );

          // Softer, wider bloom (more layers + larger radii).
          let shadow = "";
          if (t > 0.03) {
            const s1 = (t * 1.25).toFixed(2);
            const s2 = (t * 0.85).toFixed(2);
            const s3 = (t * 0.5).toFixed(2);
            const s4 = (t * 0.22).toFixed(2);
            shadow =
              `text-shadow:0 0 2px rgba(200,235,255,${s1}),` +
              `0 0 10px rgba(140,200,255,${s2}),` +
              `0 0 22px rgba(90,170,255,${s3}),` +
              `0 0 42px rgba(60,140,240,${s4});`;
          }

          const ch = escapeHtml(part[i]);
          html += `<span style="color:rgb(${r},${g},${b});${shadow}">${ch}</span>`;
        }

        offset += len;
        if (partIdx !== parts.length - 1) html += "\n";
      }

      html += CUR_HTML;
      activeLine.innerHTML = html;
    }

    function addLine(text, cls) {
      const parts = wrapLineMobile(text, 45);
      parts.forEach((part) => {
        const s = document.createElement("span");
        s.className = "line " + (cls || "mid");
        s.textContent = part;
        container.appendChild(s);
        allLines.push(s);
        if (allLines.length > MAX_LINES) container.removeChild(allLines.shift());
      });
    }

    let current = "";
    let currentCls = "mid";

    async function typeChar(ch, delay) {
      current += ch;
      renderActive(current, currentCls);
      await sl(delay);
    }

    async function backspace(n, delay) {
      for (let i = 0; i < n; i++) {
        current = current.slice(0, -1);
        renderActive(current, currentCls);
        await sl(delay || 38);
      }
    }

    function commitLine() {
      addLine(current, currentCls);
      current = "";
      renderActive("", currentCls);
    }

    async function typeLine(text, cls, minC, maxC, minL, maxL) {
      current = "";
      currentCls = cls || "mid";
      renderActive("", currentCls);
      for (let i = 0; i < text.length; i++)
        await typeChar(text[i], rnd(minC || 4, maxC || 16));
      await sl(rnd(minL || 25, maxL || 90));
      commitLine();
    }

    async function slowType(text, cls, minC, maxC, minL, maxL) {
      current = "";
      currentCls = cls || "slow";
      renderActive("", currentCls);
      for (let i = 0; i < text.length; i++)
        await typeChar(text[i], rnd(minC || 55, maxC || 150));
      await sl(rnd(minL || 200, maxL || 600));
      commitLine();
    }

    async function ultraFast(lines, cls) {
      for (const l of lines) await typeLine(l, cls, 2, 7, 8, 25);
    }
    async function insane(lines, cls) {
      for (const l of lines) await typeLine(l, cls, 1, 4, 5, 15);
    }
    async function burst(lines, cls) {
      for (const l of lines) await typeLine(l, cls, 4, 13, 14, 42);
    }
    async function pause(ms) {
      await sl(ms);
    }

    async function typeWithCorrection(text, cls, wrongSuffix, correction) {
      current = "";
      currentCls = cls || "bright";
      renderActive("", currentCls);
      for (const ch of text) await typeChar(ch, rnd(5, 16));
      await pause(rnd(200, 500));
      for (const ch of wrongSuffix) await typeChar(ch, rnd(8, 20));
      await pause(rnd(300, 700));
      await backspace(wrongSuffix.length, rnd(35, 55));
      await pause(rnd(200, 500));
      for (const ch of correction) await typeChar(ch, rnd(10, 22));
      await sl(rnd(50, 120));
      commitLine();
    }

    const scenarios = [
      async function scenarioBoot() {
        await burst(
          [
            "initializing kernel modules...",
            "loading seal_core.ko",
            "loading seal_risk.ko ... ok",
            "loading seal_eval.ko ... ok",
            "seal_core: ledger mapped at 0x7fff2a3b",
            "seal_core: 142 active accounts loaded",
            "seal_risk: drawdown monitor armed",
            "seal_eval: ruleset v3.1 applied",
            "net: handshake ok (12ms)",
            "net: websocket stream established",
            "health: all subsystems nominal",
          ],
          "dim"
        );
        await pause(rnd(500, 1200));
      },

      async function scenarioEvaluate() {
        await burst(
          [
            "const evaluate = (account) => {",
            "  const { balance, hwm, startBalance, maxDrawdown, target } = account;",
            "  const dd = ((hwm - balance) / hwm) * 100;",
            '  if (dd >= maxDrawdown) return { status: "failed", reason: "drawdown" };',
            "  const pct = ((balance - startBalance) / startBalance) * 100;",
            "  if (pct >= target && account.trades >= account.minTrades)",
            '    return { status: "passed", profit: pct.toFixed(2) };',
            '  return { status: "active", progress: pct.toFixed(2) };',
            "};",
          ],
          "bright"
        );
        await pause(rnd(300, 600));
        await typeLine("node evaluate.js --account=0x7fff2a3b --verbose", "white", 10, 25, 70, 180);
        await pause(rnd(200, 500));
        await burst(
          [
            "> balance:        $1842.30",
            "> high watermark: $1950.00",
            "> drawdown:       5.5% (max 6%)",
            "> profit:         -5.38% (target 10%)",
            "> trades:         14 (min 5) ✓",
            "> days:           14 of 30",
            "> status:         active",
          ],
          "grey"
        );
        await pause(rnd(1200, 2500));
      },

      async function scenarioTypoFix() {
        await typeWithCorrection("const riskAmount = account.balance * ", "bright", "0.20", "0.12; // max 12%");
        await pause(rnd(300, 600));
        await slowType("// cant type today apparently", "comment", 40, 110, 200, 500);
        await pause(rnd(800, 1600));
      },

      async function scenarioNullError() {
        await typeLine("node risk.js --dry-run", "white", 12, 28, 70, 160);
        await pause(rnd(200, 500));
        await burst(
          ['TypeError: Cannot read properties of undefined (reading "balance")', "  at calcRisk (risk.js:22:34)"],
          "err"
        );
        await pause(rnd(1000, 2000));
        await typeLine("// :( forgot null check again", "comment", 35, 90, 150, 400);
        await burst(
          ['if (!account || !account.balance) return { error: "invalid account" };', "const riskAmount = account.balance * 0.12;"],
          "bright"
        );
        await typeLine("node risk.js --dry-run", "white", 12, 28, 70, 160);
        await pause(rnd(200, 500));
        await burst(["risk module: ok", "max position size: $220.80", "kelly criterion: 0.14"], "ok");
        await slowType("// ok that wasnt so bad :)", "comment", 40, 110, 200, 500);
        await pause(rnd(1000, 2000));
      },

      async function scenarioGitPush() {
        await ultraFast(['git add .', 'git commit -m "fix: null check in risk module, update kelly calc"'], "white");
        await pause(rnd(150, 400));
        await ultraFast(['[main 4a7b2c1] fix: null check in risk module', "  2 files changed, 7 insertions(+), 3 deletions(-)"], "grey");
        await ultraFast(["git push origin main"], "white");
        await pause(rnd(300, 600));
        await ultraFast(
          [
            "Counting objects: 100% (7/7), done.",
            "Writing objects: 100% (4/4), 1.23 KiB | 1.23 MiB/s, done.",
            "To https://github.com/seal/markets.git",
            "   2f1a3b4..4a7b2c1  main -> main",
          ],
          "dim"
        );
        await pause(rnd(800, 1800));
      },

      async function scenarioDeploy() {
        await typeLine("./deploy.sh --env=production --tag=v2.4.2", "white", 9, 22, 70, 170);
        await pause(rnd(400, 800));
        await burst(
          [
            "[  OK  ] running tests...",
            "[  OK  ] 47/47 passed",
            "[  OK  ] lint: clean",
            "[  OK  ] building docker image...",
            "[  OK  ] image: seal-markets:v2.4.2 (312MB)",
            "[  OK  ] deploying to production cluster...",
            "[  OK  ] rollout complete (3/3 pods healthy)",
            "[  OK  ] health check: GET /health → 200 OK",
            "[  OK  ] all systems nominal. v2.4.2 live.",
          ],
          "ok"
        );
        await pause(rnd(1200, 2500));
      },

      async function scenarioScanner() {
        await burst(
          [
            "const scored = markets",
            "  .map(m => ({ ...m, edge: calcEdge(m.yesPrice, m.noPrice, m.volume) }))",
            "  .filter(m => m.edge > 0.05)",
            "  .sort((a, b) => b.edge - a.edge)",
            "  .slice(0, 15);",
          ],
          "bright"
        );
        await typeLine("node scanner.js --live", "white", 12, 28, 70, 160);
        await pause(rnd(300, 700));
        await burst(
          [
            "> scanning 4847 active contracts...",
            ">   [0.18] Will Fed cut rates in June?      YES 34¢",
            ">   [0.14] Trump approval > 50 by EOY?      NO  61¢",
            ">   [0.12] BTC above $120k before July?     YES 28¢",
            ">   [0.09] S&P correction > 10% in Q2?      YES 22¢",
            "> scan complete. 15 positions flagged.",
          ],
          "grey"
        );
        await pause(rnd(1500, 3000));
      },

      async function scenarioJsMath() {
        await typeLine('node -e "console.log(0.1 + 0.2)"', "white", 12, 28, 70, 160);
        await pause(rnd(200, 500));
        await typeLine("0.30000000000000004", "grey", 5, 12, 100, 300);
        await pause(rnd(400, 800));
        await typeLine("// :/ classic javascript", "comment", 32, 85, 150, 400);
        await pause(rnd(1500, 3000));
      },

      async function scenarioRmRf() {
        await typeLine("rm -rf ./logs/old", "white", 12, 30, 80, 200);
        await pause(rnd(200, 500));
        await burst(["removed ./logs/old/2024-01.log", "removed ./logs/old/2024-02.log", "removed ./logs/old"], "dim");
        await pause(rnd(400, 800));
        current = "";
        currentCls = "err";
        renderActive("", "err");
        for (const ch of "rm -rf ./src") await typeChar(ch, rnd(60, 150));
        await pause(rnd(600, 1200));
        await backspace(12, 35);
        await pause(rnd(400, 800));
        await slowType("// ok no. absolutely not. i am NOT doing that.", "comment", 42, 110, 300, 700);
        await pause(rnd(2000, 4000));
      },

      async function scenarioMentzer() {
        await slowType('"The results you realize will be totally dependent on', "comment", 38, 105, 150, 400);
        await slowType(" the energy you put forth. So give it your all", "comment", 32, 95, 150, 350);
        await slowType(' and realize your ambitions." - Mike Mentzer', "comment", 30, 90, 400, 900);
        await pause(rnd(3000, 5500));
      },
    ];

    async function run() {
      const boot = scenarios[0];
      const rest = scenarios.slice(1);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        await boot();
        const shuffled = shuffle(rest);
        const count = rnd(6, 10);
        const selected = shuffled.slice(0, count);
        for (const scenario of selected) await scenario();
        while (allLines.length > 20) container.removeChild(allLines.shift());
      }
    }

    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

