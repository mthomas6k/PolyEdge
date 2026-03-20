// PolyEdge terminal hero background (full randomized terminal; homepage only)
(function () {
  function init() {
    var host = document.getElementById('terminal-bg-container');
    if (!host) return;
    host.innerHTML = '<div id="term"><div id="linesContainer"></div><div id="activeLine"></div></div>';
    var container = host.querySelector('#linesContainer');
    var activeLineEl = host.querySelector('#activeLine');

var allLines = [];
var MAX_LINES = 80;
var cv = true;
var current = '';
var currentCls = 'mid';
var currentIsAi = false;

setInterval(function() {
  cv = !cv;
  var els = host.querySelectorAll('.cur,.curai');
  for (var i = 0; i < els.length; i++) {
    els[i].style.opacity = cv ? '1' : '0';
  }
}, 920);

function sl(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}
function esc(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

var classRGB = {
  dim:[42,74,122], mid:[58,106,170], bright:[106,159,216],
  wh:[168,188,212], gr:[90,122,154], er:[196,74,90],
  ok:[74,154,106], cm:[90,142,200], sl:[122,170,216]
};

function lerpC(r1,g1,b1,r2,g2,b2,t) {
  return [Math.round(r1+(r2-r1)*t), Math.round(g1+(g2-g1)*t), Math.round(b1+(b2-b1)*t)];
}
function glowTarget(cls) {
  if (cls === 'er') return [200,80,220];
  if (cls === 'ok') return [80,220,200];
  return [220,235,255];
}

function renderActive() {
  if (currentIsAi) {
    activeLineEl.style.textAlign = 'right';
    activeLineEl.innerHTML = esc(current) + '<span class="curai" id="cur"></span>';
    return;
  }
  activeLineEl.style.textAlign = 'left';
  var base = classRGB[currentCls] || classRGB.mid;
  var gt = glowTarget(currentCls);
  var len = current.length;
  if (len === 0) {
    activeLineEl.innerHTML = '<span class="cur" id="cur"></span>';
    return;
  }
  var k = 0.055;
  var html = '';
  for (var i = 0; i < len; i++) {
    var dist = len - i;
    var t = 1 / (1 + Math.pow(dist, 1.4) * k);
    var rgb = lerpC(base[0],base[1],base[2], gt[0],gt[1],gt[2], t);
    var shadow = '';
    if (t > 0.04) {
      var s1 = (t * 1.2).toFixed(2);
      var s2 = (t * 0.7).toFixed(2);
      var s3 = (t * 0.35).toFixed(2);
      var gc, gc2;
      if (currentCls === 'er') {
        gc = 'rgba(200,80,255,'+s1+')';
        gc2 = 'rgba(160,60,220,'+s2+')';
      } else if (currentCls === 'ok') {
        gc = 'rgba(80,255,200,'+s1+')';
        gc2 = 'rgba(60,210,180,'+s2+')';
      } else {
        gc = 'rgba(180,220,255,'+s1+')';
        gc2 = 'rgba(120,180,255,'+s2+')';
      }
      shadow = 'text-shadow:0 0 4px '+gc+',0 0 10px '+gc2+',0 0 20px rgba(80,140,255,'+s3+');';
    }
    html += '<span style="color:rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+');'+shadow+'">'+esc(current[i])+'</span>';
  }
  html += '<span class="cur" id="cur"></span>';
  activeLineEl.innerHTML = html;
}

function addLine(text, cls) {
  if (text === '__sp__') {
    var sp = document.createElement('span');
    sp.className = 'sp';
    container.appendChild(sp);
    allLines.push(sp);
  } else {
    var s = document.createElement('span');
    s.className = 'line ' + (cls || 'mid') + ' just-committed';
    s.textContent = text;
    container.appendChild(s);
    allLines.push(s);
    setTimeout(function(el) { return function() { el.classList.remove('just-committed'); }; }(s), 2300);
  }
  while (allLines.length > MAX_LINES) container.removeChild(allLines.shift());
}
function addAiLine(text) {
  var s = document.createElement('span');
  s.className = 'ai';
  s.textContent = text;
  container.appendChild(s);
  allLines.push(s);
  while (allLines.length > MAX_LINES) container.removeChild(allLines.shift());
}
function addAiLabel() {
  var s = document.createElement('span');
  s.className = 'ail';
  s.textContent = 'polywog *';
  container.appendChild(s);
  allLines.push(s);
  while (allLines.length > MAX_LINES) container.removeChild(allLines.shift());
}

function typeChar(ch, delay) {
  current += ch;
  renderActive();
  return sl(delay);
}
function bksp(n, delay) {
  return new Promise(function(resolve) {
    (function step(i) {
      if (i >= n) { resolve(); return; }
      current = current.slice(0, -1);
      renderActive();
      setTimeout(function() { step(i + 1); }, delay || 38);
    })(0);
  });
}
function commitLine(cls) {
  if (currentIsAi) addAiLine(current);
  else addLine(current, cls || currentCls);
  current = '';
  currentIsAi = false;
  renderActive();
}
function pause(ms) { return sl(ms); }
function spacer() { addLine('__sp__', ''); }

async function typeLine(text, cls, minC, maxC, minL, maxL) {
  current = ''; currentCls = cls || 'mid'; currentIsAi = false; renderActive();
  for (var i = 0; i < text.length; i++) await typeChar(text[i], rnd(minC||4, maxC||16));
  await sl(rnd(minL||25, maxL||90));
  commitLine(cls);
}
async function slowType(text, cls, minC, maxC, minL, maxL) {
  current = ''; currentCls = cls || 'sl'; currentIsAi = false; renderActive();
  for (var i = 0; i < text.length; i++) await typeChar(text[i], rnd(minC||55, maxC||150));
  await sl(rnd(minL||200, maxL||600));
  commitLine(cls);
}
async function aiType(text, minC, maxC, minL, maxL) {
  addAiLabel(); current = ''; currentIsAi = true; renderActive();
  for (var i = 0; i < text.length; i++) await typeChar(text[i], rnd(minC||30, maxC||80));
  await sl(rnd(minL||200, maxL||600));
  addAiLine(current); current = ''; currentIsAi = false; renderActive();
}
async function ultraFast(lines, cls) { for (var i=0;i<lines.length;i++) await typeLine(lines[i],cls,2,7,8,25); }
async function insane(lines, cls) { for (var i=0;i<lines.length;i++) await typeLine(lines[i],cls,1,4,5,15); }
async function burst(lines, cls) { for (var i=0;i<lines.length;i++) await typeLine(lines[i],cls,4,13,14,42); }
async function paste(lines, cls) { for (var i=0;i<lines.length;i++) await typeLine(lines[i],cls,1,3,3,10); }
async function typeWithFix(pre, cls, wrong, fix) {
  current = ''; currentCls = cls || 'bright'; currentIsAi = false; renderActive();
  for (var i=0;i<pre.length;i++) await typeChar(pre[i], rnd(5,16));
  await pause(rnd(200,500));
  for (var i=0;i<wrong.length;i++) await typeChar(wrong[i], rnd(8,20));
  await pause(rnd(300,700));
  await bksp(wrong.length, rnd(35,55));
  await pause(rnd(200,500));
  for (var i=0;i<fix.length;i++) await typeChar(fix[i], rnd(10,22));
  await sl(rnd(50,120));
  commitLine(cls || 'bright');
}

// ===================== FILLERS =====================
var fillers = [

async function() {
  await burst(['initializing kernel modules...','loading core.ko ... ok','loading risk_engine.ko ... ok','loading evaluator.ko ... ok','core: '+rnd(130,160)+' active accounts loaded','risk_engine: drawdown monitor armed','net: handshake ok ('+rnd(8,22)+'ms)','health: all subsystems nominal'],'dim');
  await pause(rnd(400,900));
},

async function() {
  var acct = pick(['0x7fff2a3b','0x8aab3c2d','0x9cc4e1f0','0x1da5f2a1','0x3fb7c8d9']);
  await typeLine('node evaluate.js --account='+acct,'wh',10,25,70,180);
  await pause(rnd(200,500));
  var bal = (rnd(800,2100)+rnd(0,99)/100).toFixed(2);
  var dd = (rnd(10,59)/10).toFixed(1);
  await burst(['> balance:  $'+bal,'> drawdown: '+dd+'% (max 6%)','> profit:   '+pick(['-','-','+'])+rnd(1,9)+'.'+rnd(0,9)+'% (target 10%)','> trades:   '+rnd(5,28)+' (min 5)','> days:     '+rnd(3,28)+' of 30','> status:   active'],'gr');
  await pause(rnd(800,1800));
},

async function() {
  await burst(['const kelly = (edge, odds) => {','  if (edge <= 0) return 0;','  return (edge * odds - (1 - edge)) / odds;','};'],'bright');
  await pause(rnd(400,1000));
},

async function() {
  await burst(['const getDrawdown = (balance, hwm) => {','  if (!hwm || hwm === 0) return 0;','  return ((hwm - balance) / hwm) * 100;','};'],'bright');
  await pause(rnd(400,1000));
},

async function() {
  await burst(['async function syncAccounts() {','  const accounts = await db.getActive();','  for (const acc of accounts) {','    const result = await evaluator.check(acc);','    if (result.status !== acc.status) {','      await db.updateStatus(acc.id, result.status);','    }','  }','}'],'bright');
  await pause(rnd(500,1200));
},

async function() {
  await burst(['const calcEdge = (yes, no, vol) => {','  const impliedProb = yes;','  const trueProb = estimateProb(yes, no, vol);','  return trueProb - impliedProb;','};'],'bright');
  await pause(rnd(500,1100));
},

async function() {
  await burst(['const pipeline = [','  fetchMarkets,','  filterByVolume(50000),','  filterByLiquidity(10000),','  calcEdgeForAll,','  rankByKelly,','  slice(0, 20),','];','const results = await runPipeline(pipeline);'],'bright');
  await pause(rnd(600,1400));
},

async function() {
  await burst(['useEffect(() => {','  const ws = new WebSocket(WS_ENDPOINT);','  ws.onmessage = (e) => {','    const data = JSON.parse(e.data);','    dispatch(updateMarket(data));','  };','  return () => ws.close();','}, []);'],'bright');
  await pause(rnd(500,1200));
},

async function() {
  await burst(['const positions = await db.query(`','  SELECT p.*, m.question, m.yes_price','  FROM positions p','  JOIN markets m ON m.id = p.market_id','  WHERE p.account_id = $1 AND p.status = $2','  ORDER BY p.created_at DESC','`, [accountId, "open"]);'],'bright');
  await pause(rnd(600,1400));
},

async function() {
  await burst(['router.get("/markets", authenticate, async (req, res) => {','  const { limit = 20, offset = 0 } = req.query;','  const markets = await marketService.getActive({ limit, offset });','  res.json({ data: markets, count: markets.length });','});'],'bright');
  await pause(rnd(600,1400));
},

async function() {
  await paste(['export async function withRetry(fn, retries, delay) {','  retries = retries || 3; delay = delay || 1000;','  try { return await fn(); }','  catch (e) {','    if (retries === 0) throw e;','    await sleep(delay);','    return withRetry(fn, retries - 1, delay * 2);','  }','}'],'bright');
  await pause(rnd(500,1200));
},

async function() {
  await typeLine('// pasting from stack overflow','cm',30,80,100,300);
  await pause(rnd(300,700));
  await paste(['const debounce = (fn, delay) => {','  let timer;','  return (...args) => {','    clearTimeout(timer);','    timer = setTimeout(() => fn(...args), delay);','  };','};'],'bright');
  await typeLine('// works. not going to question it.','cm',32,85,150,400);
  await pause(rnd(600,1400));
},

async function() {
  await ultraFast(['git status'],'wh');
  await pause(rnd(100,300));
  var files = pick([['  modified:   src/evaluate.js','  modified:   src/risk.js'],['  modified:   src/scanner.js'],['  modified:   api/routes.js'],['  modified:   utils/kelly.ts']]);
  await ultraFast(['On branch main','Changes not staged for commit:'].concat(files),'gr');
  await pause(rnd(400,900));
},

async function() {
  await ultraFast(['git log --oneline -6'],'wh');
  await pause(rnd(150,400));
  await ultraFast([
    rnd(1,9)+'a'+rnd(10,99)+'b'+rnd(100,999)+' fix: null check in risk module',
    rnd(1,9)+'b'+rnd(10,99)+'c'+rnd(100,999)+' feat: kelly fraction to scanner',
    rnd(1,9)+'c'+rnd(10,99)+'d'+rnd(100,999)+' refactor: evaluate module cleanup',
    rnd(1,9)+'d'+rnd(10,99)+'e'+rnd(100,999)+' fix: date parsing in backtest',
    rnd(1,9)+'e'+rnd(10,99)+'f'+rnd(100,999)+' chore: update deps',
    rnd(1,9)+'f'+rnd(10,99)+'a'+rnd(100,999)+' perf: cache market data'
  ],'gr');
  await pause(rnd(600,1400));
},

async function() {
  var msgs = ['fix: edge case in drawdown calculation','feat: kelly fraction to scanner','refactor: clean up evaluate module','fix: handle undefined account in risk','chore: update dependencies','feat: pagination to market endpoint','fix: date parsing in backtest','perf: cache market data 5 minutes','fix: websocket reconnect on timeout','feat: consistency rule enforcement','docs: update README','test: add edge cases for evaluate','feat: leaderboard endpoint','fix: account sync race condition'];
  var msg = pick(msgs);
  await ultraFast(['git add .','git commit -m "'+msg+'"'],'wh');
  await pause(rnd(150,400));
  await ultraFast(['[main '+rnd(1,9)+'a'+rnd(10,99)+'b'+rnd(100,999)+'] '+msg,'pushed to main'],'gr');
  await pause(rnd(600,1400));
},

async function() {
  await ultraFast(['git diff src/evaluate.js | head -20'],'wh');
  await pause(rnd(200,500));
  await burst(['@@ -22,7 +22,9 @@ const evaluate = (account) => {','-  const dd = (hwm - balance) / hwm * 100;','+  if (!account || !account.balance) return null;','+  const dd = ((hwm - balance) / hwm) * 100;','   if (dd >= maxDrawdown)'],'gr');
  await pause(rnd(600,1400));
},

async function() {
  await typeLine('npm test -- --watchAll=false','wh',8,20,70,170);
  await pause(rnd(300,700));
  var pass = rnd(40,55);
  await burst(['PASS src/evaluate.test.js ('+rnd(200,800)+'ms)','PASS src/risk.test.js ('+rnd(100,400)+'ms)','PASS src/kelly.test.js ('+rnd(50,200)+'ms)','PASS src/scanner.test.js ('+rnd(100,500)+'ms)','','Test Suites: 4 passed, 4 total','Tests:       '+pass+' passed, '+pass+' total','Coverage:    '+rnd(85,94)+'.'+rnd(0,9)+'%'],'ok');
  await pause(rnd(800,1800));
},

async function() {
  await typeLine('npm run lint','wh',8,20,70,150);
  await pause(rnd(200,500));
  await burst(['> eslint src/**/*.js','','0 errors, 0 warnings'],'ok');
  await pause(rnd(500,1200));
},

async function() {
  await typeLine('npm install','wh',8,20,70,150);
  await pause(rnd(400,900));
  await burst(['added '+rnd(200,400)+' packages in '+rnd(3,12)+'s','found 0 vulnerabilities'],'dim');
  await pause(rnd(500,1200));
},

async function() {
  await typeLine('node sync.js','wh',10,25,70,170);
  await pause(rnd(200,500));
  await burst(['sync: pulling '+rnd(4000,6000)+' contracts from api...','sync: '+rnd(100,200)+' new markets found','sync: complete in '+rnd(1,4)+'.'+rnd(10,99)+'s'],'gr');
  await pause(rnd(700,1600));
},

async function() {
  await typeLine('node health.js','wh',10,25,70,170);
  await pause(rnd(200,500));
  await burst(['db: ok ('+rnd(8,25)+'ms)','cache: ok ('+rnd(1,5)+'ms)','api: ok ('+rnd(20,60)+'ms)','all systems nominal'],'ok');
  await pause(rnd(700,1600));
},

async function() {
  await typeLine('node cron.js --once','wh',10,25,70,170);
  await pause(rnd(200,500));
  await burst(['cron: kelly recalculation... done','cron: account sync... done','cron: market cache refresh... done','cron: complete'],'gr');
  await pause(rnd(700,1600));
},

async function() {
  await typeLine('node migrate.js --dry-run','wh',10,25,70,170);
  await pause(rnd(300,700));
  await burst(['migrations: up to date (revision '+rnd(800,950)+')','nothing to run'],'gr');
  await pause(rnd(700,1600));
},

async function() {
  await typeLine('psql -U admin -d appdb','wh',10,25,70,160);
  await pause(rnd(200,400));
  await ultraFast(['psql (15.4)','appdb=#'],'gr');
  await ultraFast(['SELECT id, balance, status FROM evaluations ORDER BY balance DESC LIMIT 5;'],'bright');
  await pause(rnd(150,300));
  await ultraFast([' id          | balance  | status',' 0x8aab3c2d  | 2140.00  | passed',' 0x7fff2a3b  | 1842.30  | active',' 0x9cc4e1f0  |  892.50  | active',' 0x2eb6034b  |  140.22  | failed','(5 rows)'],'gr');
  await ultraFast(['\\q'],'wh');
  await pause(rnd(1000,2200));
},

async function() {
  await ultraFast(['docker ps'],'wh');
  await pause(rnd(150,300));
  await ultraFast(['CONTAINER ID   IMAGE          STATUS','a3f2b1c4d5e6   app:v2.4.2     Up '+rnd(1,8)+' hours','b7e8f9a0b1c2   postgres:15    Up '+rnd(1,8)+' hours','c3d4e5f6a7b8   redis:7        Up '+rnd(1,8)+' hours'],'dim');
  await pause(rnd(800,1800));
},

async function() {
  await typeLine('docker logs app --tail=12','wh',8,20,70,160);
  await pause(rnd(300,600));
  var ts = new Date().toISOString().slice(0,19);
  await ultraFast([ts+' INFO  server :8080',ts+' INFO  db pool initialized',ts+' INFO  ws feed connected',ts+' WARN  slow query ('+rnd(200,400)+'ms)'],'dim');
  await pause(rnd(800,1800));
},

async function() {
  await typeLine('tail -f logs/app.log | grep -i warn','wh',8,20,70,160);
  await pause(rnd(300,600));
  var ts = new Date().toISOString().slice(0,19);
  await ultraFast([ts+' WARN  slow query ('+rnd(200,400)+'ms)',ts+' WARN  rate limit approaching',ts+' INFO  rate limit reset'],'gr');
  await pause(rnd(1000,2500));
  await typeLine('^C','wh',30,60,100,200);
  await pause(rnd(400,800));
},

async function() {
  await typeLine('node latency.js --target=api','wh',10,25,70,160);
  await pause(rnd(200,500));
  var lat = [rnd(8,25),rnd(9,28),rnd(7,22),rnd(10,30),rnd(8,24)];
  await burst(lat.map(function(l,i) { return '  ping '+(i+1)+': '+l+'ms'; }),'dim');
  var avg = Math.round(lat.reduce(function(a,b){return a+b;})/lat.length);
  await burst(['  avg: '+avg+'ms  |  p99: '+(avg+rnd(5,15))+'ms'],'gr');
  await pause(rnd(600,1400));
},

async function() {
  await typeLine('node benchmark.js --iterations=1000','wh',10,25,70,160);
  await pause(rnd(400,900));
  await ultraFast(['evaluate()    avg: '+rnd(1,3)+'.'+rnd(10,99)+'ms','calcEdge()    avg: 0.'+rnd(5,15)+'ms','kellyFrac()   avg: 0.0'+rnd(2,8)+'ms','benchmark complete.'],'dim');
  await pause(rnd(800,1800));
},

async function() {
  await typeLine('printenv | grep APP','wh',10,25,70,160);
  await pause(rnd(200,500));
  await burst(['APP_ENV=production','APP_DB_HOST=db.prod-01.internal','APP_REDIS_URL=redis://cache.prod-01.internal:6379','APP_LOG_LEVEL=warn'],'dim');
  await pause(rnd(600,1400));
},

async function() {
  await typeLine('npm run build:watch','wh',8,20,70,160);
  await pause(rnd(300,700));
  await burst(['webpack watching for changes...','build completed in '+rnd(1000,3000)+'ms'],'dim');
  await pause(rnd(2000,4000));
  await burst(['change detected: src/'+pick(['risk.js','scanner.js','evaluate.js']),'rebuilding...','build completed in '+rnd(200,500)+'ms'],'dim');
  await pause(rnd(1000,2500));
  await typeLine('^C','wh',30,60,80,180);
  await pause(rnd(400,900));
},

async function() {
  var q = pick(['trump tariffs','fed rate cut','bitcoin etf','election 2026','crypto regulation','sp500 recession','china trade deal']);
  await typeLine('node search.js --query="'+q+'" --limit=5','wh',10,25,70,170);
  await pause(rnd(200,500));
  await burst(['> found '+rnd(12,340)+' markets for "'+q+'"','> top: YES '+rnd(20,80)+'c  |  NO '+rnd(20,80)+'c','> volume: $'+rnd(10,900)+'k'],'gr');
  await pause(rnd(800,1800));
},

async function() {
  var mkt = pick(['will-fed-cut-june','btc-100k-july','trump-approval-50','sp500-q2-correction']);
  await typeLine('node stream.js --market="'+mkt+'" --live','wh',9,22,70,160);
  await pause(rnd(300,600));
  await ultraFast(['[ws] connected','[ws] subscribing: '+mkt,'[ws] price_update YES '+rnd(25,75)+'c -> '+rnd(25,75)+'c','[ws] trade       YES '+rnd(100,2000)+' shares','[ws] alert: edge signal triggered'],'gr');
  await typeLine('// interesting. flagging this one.','cm',32,85,150,400);
  await pause(rnd(1000,2500));
},

async function() {
  var musings = [
    ['// this function is getting too long','// probably should split it up','// ...later'],
    ['// TODO: add tests for edge cases','// not today though'],
    ['// why did i name this variable x','// past me was not thinking'],
    ['// this works and i do not know why','// do not touch'],
    ['// actually pretty clean for once','// rare'],
    ['// ship it','// it is fine','// probably'],
    ['// 2am. bad idea to still be coding.','// but here we are'],
    ['// i should write docs','// i will not write docs'],
    ['// future me will deal with this']
  ];
  var m = pick(musings);
  for (var i=0;i<m.length;i++) { await typeLine(m[i],'cm',45,120,200,500); await pause(rnd(400,900)); }
  await pause(rnd(800,1800));
},

async function() {
  var corrections = [
    {pre:'const ',wrong:'amrket',fix:'market = await api.get(id);'},
    {pre:'return ',wrong:'reuslt',fix:'result;'},
    {pre:'const res = await ',wrong:'fecth',fix:'fetch(url);'},
    {pre:'if (',wrong:'accoutn',fix:'account && account.balance) {'}
  ];
  var c = pick(corrections);
  await typeWithFix(c.pre,'bright',c.wrong,c.fix);
  await typeLine('// '+pick(['typos at '+rnd(1,11)+'pm. classic.','i cant type today','brain not braining']),'cm',32,85,150,400);
  await pause(rnd(800,1600));
},

async function() {
  await typeLine('node risk.js --dry-run','wh',12,28,70,160);
  await pause(rnd(200,500));
  await burst(['TypeError: Cannot read properties of undefined (reading "balance")','  at calcRisk (risk.js:22:34)'],'er');
  await pause(rnd(800,1800));
  await typeLine('// :( forgot null check again','cm',35,90,150,400);
  await burst(['if (!account || !account.balance) return null;','const riskAmount = account.balance * 0.12;'],'bright');
  await typeLine('node risk.js --dry-run','wh',12,28,70,160);
  await pause(rnd(200,500));
  await burst(['risk module: ok','max position: $'+rnd(150,300)+'.'+rnd(10,99)],'ok');
  await typeLine('// ok that wasnt so bad :)','cm',35,90,150,400);
  await pause(rnd(1000,2000));
},

async function() {
  await typeLine('node backtest.js --strategy=momentum --years=3','wh',10,24,70,160);
  await pause(rnd(200,500));
  await burst(['SyntaxError: Unexpected token "}"','  at backtest.js:89'],'er');
  await pause(rnd(600,1200));
  await typeLine('// ugh','cm',30,80,100,300);
  await typeLine('node backtest.js --strategy=momentum --years=3','wh',10,24,70,160);
  await pause(rnd(200,500));
  await burst(['RangeError: Invalid date value "2021-13-01"'],'er');
  await pause(rnd(600,1200));
  await typeLine('// month is 0-indexed in js. of course it is.','cm',32,85,150,400);
  await burst(['const date = new Date(2021, 0, 1);'],'bright');
  await typeLine('node backtest.js --strategy=momentum --years=3','wh',10,24,70,160);
  await pause(rnd(300,700));
  await burst(['results: win rate '+rnd(55,68)+'.'+rnd(0,9)+'% | return +'+rnd(20,50)+'.'+rnd(0,9)+'% | sharpe '+rnd(1,2)+'.'+rnd(10,99)],'ok');
  await pause(rnd(1500,3500));
},

async function() {
  await typeLine('// ok shipping this whole thing right now','cm',30,80,100,250);
  await insane(['npm run build','webpack compiled in 2847ms','asset main.js 847 KiB','npm run test -- --ci','PASS src/evaluate.test.js','PASS src/risk.test.js','PASS src/scanner.test.js','Tests: '+rnd(40,55)+' passed','Coverage: '+rnd(85,94)+'.'+rnd(0,9)+'%','npm run deploy','upload: '+rnd(15,30)+' files','deployment complete'],'bright');
  await pause(rnd(800,1800));
  await typeLine('// :D','cm',30,80,150,400);
  await pause(rnd(1500,3500));
},

async function() {
  await typeLine('node -e "console.log(0.1 + 0.2)"','wh',12,28,70,160);
  await pause(rnd(200,500));
  await typeLine('0.30000000000000004','gr',5,12,100,300);
  await pause(rnd(400,800));
  await typeLine('// classic javascript','cm',32,85,150,400);
  await pause(rnd(1500,3000));
},

async function() {
  await typeLine('ssh admin@prod-01.internal','wh',12,28,70,160);
  await pause(rnd(400,900));
  await burst(['Welcome to Ubuntu 22.04.3 LTS','admin@prod-01:~$'],'gr');
  await typeLine('df -h | grep -v tmpfs','wh',12,28,70,160);
  await pause(rnd(200,500));
  await burst(['/dev/sda1  50G  '+rnd(10,30)+'G  '+rnd(15,38)+'G  '+rnd(30,65)+'%  /'],'dim');
  await pause(rnd(600,1400));
  await typeLine('exit','wh',15,40,60,150);
  await burst(['Connection to prod-01.internal closed.'],'gr');
  await pause(rnd(1000,2500));
},

async function() {
  await typeLine('redis-cli ping','wh',10,25,70,160);
  await pause(rnd(200,500));
  await typeLine('PONG','ok',5,15,100,300);
  await typeLine('redis-cli dbsize','wh',10,25,70,160);
  await pause(rnd(200,500));
  await typeLine('(integer) '+rnd(800,2000),'gr',5,15,100,300);
  await pause(rnd(500,1200));
},

async function() {
  current = ''; currentCls = 'bright'; currentIsAi = false; renderActive();
  for (var i=0;i<'// what if i just refactored the entire'.length;i++) await typeChar('// what if i just refactored the entire'[i], rnd(50,130));
  await pause(rnd(3000,5000));
  await bksp(39, 30);
  await pause(rnd(400,700));
  await typeLine('// no. commit. ship.','cm',45,120,200,500);
  await pause(rnd(1500,3000));
},

async function() {
  current = ''; currentCls = 'er'; currentIsAi = false; renderActive();
  for (var i=0;i<'rm -rf ./src'.length;i++) await typeChar('rm -rf ./src'[i], rnd(60,150));
  await pause(rnd(600,1200));
  await bksp(12, 35);
  await pause(rnd(400,800));
  await typeLine('// ok no. absolutely not.','cm',42,110,300,700);
  await pause(rnd(2000,4000));
},

async function() {
  await typeLine('npx tsc --noEmit','wh',8,20,70,160);
  await pause(rnd(400,900));
  await burst(['src/risk.ts:44:12 - error TS2345:','  Argument of type "string | undefined"','  is not assignable to parameter of type "string".'],'er');
  await pause(rnd(600,1200));
  await typeLine('// ughhh typescript','cm',30,80,100,300);
  await burst(['const accountId = req.params.id ?? "";'],'bright');
  await typeLine('npx tsc --noEmit','wh',8,20,70,160);
  await pause(rnd(400,900));
  await burst(['Found 0 errors.'],'ok');
  await pause(rnd(800,1800));
},

async function() {
  await typeLine('./deploy.sh --env=production --tag=v'+rnd(2,3)+'.'+rnd(1,9)+'.'+rnd(0,9),'wh',9,22,70,170);
  await pause(rnd(400,800));
  await burst(['[  OK  ] running tests...','[  OK  ] '+rnd(40,55)+' passed','[  OK  ] lint: clean','[  OK  ] building docker image...','[  OK  ] deploying to production...','[  OK  ] rollout complete (3/3 pods)','[  OK  ] health check: 200 OK','[  OK  ] all systems nominal. live.'],'ok');
  await pause(rnd(1200,2500));
},

async function() {
  await typeLine('grep -r "drawdown" src/ --include="*.js" -l','wh',10,25,70,160);
  await pause(rnd(200,500));
  await burst(['src/evaluate.js','src/risk.js','src/dashboard.js','src/analytics.js'],'gr');
  await pause(rnd(600,1400));
},

async function() {
  await typeLine('node profile.js --endpoint=/api/leaderboard','wh',10,25,70,160);
  await pause(rnd(400,900));
  await burst(['profiling GET /api/leaderboard...','  db query: 842ms','  total: 856ms','  SLOW: threshold is 200ms'],'er');
  await pause(rnd(600,1200));
  await typeLine('// need an index on evaluations.total_profit','cm',32,85,150,400);
  await burst(['CREATE INDEX CONCURRENTLY idx_eval_profit ON evaluations(total_profit DESC);'],'bright');
  await typeLine('node profile.js --endpoint=/api/leaderboard','wh',10,25,70,160);
  await pause(rnd(300,700));
  await burst(['  db query: 18ms  -- much better'],'ok');
  await pause(rnd(800,1800));
},

];

// ===================== EASTER EGGS =====================
var eggs = [

async function() {
  current = ''; currentCls = 'cm'; currentIsAi = false; renderActive();
  var txt = '// follow your dreams';
  for (var i=0;i<txt.length;i++) await typeChar(txt[i], rnd(60,145));
  await pause(5200);
  await typeChar('?', 130);
  await sl(rnd(400,800));
  commitLine('cm');
  await pause(rnd(2000,4000));
},

async function() {
  await slowType('"The results you realize will be totally dependent on','sl',38,105,150,400);
  await slowType(' the energy you put forth. So give it your all','sl',32,95,150,350);
  await slowType(' and realize your ambitions." - Mike Mentzer','sl',30,90,400,900);
  await pause(rnd(3000,5500));
},

async function() {
  await slowType('"Antifragility is beyond resilience or robustness.','sl',38,105,150,400);
  await slowType(' The resilient resists shocks and stays the same;','sl',35,100,150,350);
  await slowType(' the antifragile gets better." - Nassim Taleb','sl',32,95,400,900);
  await pause(rnd(2000,4000));
},

async function() {
  await slowType('"Nothing in life is as important as you think it is','sl',40,108,150,400);
  await slowType(' while you are thinking about it." - Daniel Kahneman','sl',35,100,400,900);
  await pause(rnd(2500,5000));
},

async function() {
  await slowType('"Better is possible. It does not take genius.','sl',38,105,150,400);
  await slowType(' It takes diligence. It takes moral clarity." - Atul Gawande','sl',35,100,400,900);
  await pause(rnd(3000,6000));
},

async function() {
  current = ''; currentCls = 'sl'; currentIsAi = false; renderActive();
  var txt = '// "be so good they cant ignore you."';
  for (var i=0;i<txt.length;i++) await typeChar(txt[i], rnd(48,120));
  await pause(rnd(3000,5000));
  var attr = ' - steve martin';
  for (var i=0;i<attr.length;i++) await typeChar(attr[i], rnd(55,140));
  await sl(400); commitLine('sl');
  await pause(rnd(2000,4000));
},

async function() {
  current = ''; currentCls = 'sl'; currentIsAi = false; renderActive();
  var txt = '// "outwork everyone."';
  for (var i=0;i<txt.length;i++) await typeChar(txt[i], rnd(65,155));
  await pause(rnd(4000,7000));
  var rest = ' full stop.';
  for (var i=0;i<rest.length;i++) await typeChar(rest[i], rnd(70,160));
  await sl(500); commitLine('sl');
  await pause(rnd(3000,6000));
},

async function() {
  current = ''; currentCls = 'sl'; currentIsAi = false; renderActive();
  var txt = '// ...';
  for (var i=0;i<txt.length;i++) await typeChar(txt[i], rnd(200,400));
  await sl(600); commitLine('sl');
  await pause(rnd(5000,8000));
  await slowType('// yeah.','sl',120,280,400,900);
  await pause(rnd(2000,4000));
},

async function() {
  await slowType('// do you ever feel like','sl',50,130,200,500);
  await pause(rnd(1200,2500));
  await slowType('// you are the only one who actually cares about this','sl',45,120,200,500);
  await pause(rnd(2000,4000));
  await slowType('// yeah. me too.','sl',55,140,300,700);
  await pause(rnd(1500,3000));
  await slowType('// keep going anyway','sl',50,130,500,1000);
  await pause(rnd(3000,6000));
},

async function() {
  var sets = [
    ['// i used to think working hard was enough','// turns out direction matters too','// anyway.'],
    ['// the market is always right','// until it isnt','// thats the game'],
    ['// consistency over brilliance','// every time','// no exceptions'],
    ['// if you arent embarrassed by v1','// you shipped too late','// ship the thing'],
    ['// most people quit','// right before it starts working','// weird how that goes']
  ];
  var set = pick(sets);
  for (var i=0;i<set.length;i++) { await slowType(set[i],'sl',50,130,250,600); await pause(rnd(1500,3500)); }
  await pause(rnd(2000,4000));
},

async function() {
  await slowType('// ok i dont know how to center a div','sl',32,85,150,400);
  await pause(rnd(500,1000));
  await slowType('// (nobody does)','sl',35,95,100,300);
  await pause(rnd(1000,2000));
},

async function() {
  spacer();
  await typeLine('// polywog. you there?','cm',35,90,150,400);
  await pause(rnd(800,1600)); spacer();
  await aiType('yeah. what do you need.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// what is the edge on the fed cut market right now','sl',40,110,200,500);
  await pause(rnd(500,1000)); spacer();
  await aiType('YES sitting at 34c. implied prob 34%. my estimate is 47%. edge is +0.13.',35,90,200,500);
  await aiType('kelly says 0.19. decent size.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// ok. flagging it.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  spacer();
  await typeLine('// polywog. sanity check.','cm',35,90,150,400);
  await pause(rnd(800,1600)); spacer();
  await aiType('go.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// drawdown at 5.8%. limit is 6. how much room left','sl',40,110,200,500);
  await pause(rnd(500,1000)); spacer();
  await aiType('0.2% left. that is $4. you are basically done.',35,90,200,500);
  await aiType('do not open any more positions.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// yeah. thought so. ok.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  spacer();
  await typeLine('// polywog. btc 100k by july. yes at 28c. worth it?','cm',35,90,150,400);
  await pause(rnd(800,1600)); spacer();
  await aiType('depends on your true prob estimate.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// maybe 35 percent','sl',40,110,200,500);
  await pause(rnd(500,1000)); spacer();
  await aiType('edge is +0.07. kelly gives 0.10 sizing.',35,90,200,500);
  await aiType('small but positive. take it if you have conviction.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// ok. taking a small one.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  spacer();
  await typeLine('// polywog im burnt out','cm',35,90,150,400);
  await pause(rnd(800,1600)); spacer();
  await aiType('i know.',35,90,200,500); spacer();
  await pause(rnd(1000,2000));
  await slowType('// how do you know','sl',40,110,200,500);
  await pause(rnd(500,1000)); spacer();
  await aiType('you have been running the same backtest for 3 hours.',35,90,200,500);
  await aiType('take a break.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// yeah. ok.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  spacer();
  await typeLine('// polywog. half kelly on 60pct winrate?','cm',35,90,150,400);
  await pause(rnd(800,1600)); spacer();
  await aiType('assuming even odds: full kelly = 0.20. half kelly = 0.10.',35,90,200,500);
  await aiType('we use 12% max. right in the zone.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// good. thought so.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  spacer();
  await typeLine('// polywog. is this market liquid enough','cm',35,90,150,400);
  await typeLine('// trump tariff deal before june. yes at 41c.','cm',35,90,100,250);
  await pause(rnd(800,1600)); spacer();
  await aiType('volume is $840k. liquidity is solid.',35,90,200,500);
  await aiType('spread is tight. you can enter without moving the price.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// nice. going in.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  spacer();
  await typeLine('// polywog just tell me something useful','cm',35,90,150,400);
  await pause(rnd(800,1600)); spacer();
  await aiType('the market you keep avoiding has +0.15 edge.',35,90,200,500);
  await aiType('you have been watching it for two days.',35,90,200,500);
  await aiType('at some point watching is just procrastinating.',35,90,200,500); spacer();
  await pause(rnd(500,1000));
  await slowType('// ok fine. entering.','sl',40,110,200,500); spacer();
  await pause(rnd(2000,4000));
},

async function() {
  await slowType('// ok. first principles.','sl',50,130,200,500);
  await pause(rnd(1000,2000));
  await slowType('// the market sets a probability.','sl',45,120,200,500);
  await pause(rnd(800,1600));
  await slowType('// if my estimate is different, that is the edge.','sl',42,115,200,500);
  await pause(rnd(800,1600));
  await slowType('// kelly tells me how much to bet.','sl',45,120,200,500);
  await pause(rnd(800,1600));
  await slowType('// thats literally it.','sl',50,130,400,800);
  await pause(rnd(2500,5000));
},

async function() {
  await slowType('// done is better than perfect','sl',50,130,200,500);
  await pause(rnd(1000,2000));
  await slowType('// shipped is better than done','sl',48,125,200,500);
  await pause(rnd(1000,2000));
  await slowType('// ok that second one might be too far','sl',50,130,300,700);
  await pause(rnd(2000,4000));
},

async function() {
  current = ''; currentCls = 'sl'; currentIsAi = false; renderActive();
  var txt = '// am i actually good at this';
  for (var i=0;i<txt.length;i++) await typeChar(txt[i], rnd(55,135));
  await pause(rnd(3000,5000));
  var rest = ' or just lucky so far';
  for (var i=0;i<rest.length;i++) await typeChar(rest[i], rnd(55,135));
  await sl(400); commitLine('sl');
  await pause(rnd(2000,4000));
  await slowType('// both probably. keep going.','sl',50,130,400,900);
  await pause(rnd(2000,4000));
},

async function() {
  await typeLine('git pull origin main','wh',12,28,70,160);
  await pause(rnd(400,900));
  await burst(['Auto-merging src/evaluate.js','CONFLICT: Merge conflict in src/evaluate.js','Automatic merge failed; fix conflicts and then commit.'],'er');
  await pause(rnd(600,1200));
  await typeLine('// great.','cm',30,80,100,300);
  await pause(rnd(1000,2000));
  await burst(['git add src/evaluate.js','git commit -m "fix: merge conflict in evaluate"'],'wh');
  await pause(rnd(400,800));
  await burst(['[main resolved] merge conflict in evaluate'],'ok');
  await pause(rnd(800,1800));
},

async function() {
  await slowType('// 11pm. probably should stop.','sl',55,145,300,700);
  await pause(rnd(1500,3000));
  await slowType('// one more thing though','sl',50,135,200,600);
  await pause(rnd(800,1600));
  await burst(['const oneMoreThing = async () => {','  // ok this turned into 3 things','  // classic'],'cm');
  await pause(rnd(1500,3000));
},

async function() {
  await ultraFast(['processing '+rnd(10000,20000)+' market records...'],'dim');
  await insane(['  chunk 1: 1000 records... ok','  chunk 2: 1000 records... ok','  chunk 3: 1000 records... ok','  chunk 4: 1000 records... ok','  chunk 5: 1000 records... ok','  chunk 6: 1000 records... ok','  all chunks complete.','  indexed in '+rnd(1,5)+'.'+rnd(10,99)+'s'],'dim');
  await pause(rnd(800,1800));
},

];

// ===================== MAIN LOOP =====================
async function run() {
  var boot = fillers[0];
  var rest = fillers.slice(1);
  while (true) {
    await boot();
    var sf = shuffle(rest);
    var count = rnd(7,12);
    var eggCount = 0;
    if (Math.random() < 0.35) eggCount = 1;
    if (Math.random() < 0.12) eggCount = 2;
    var se = shuffle(eggs).slice(0, eggCount);
    var pool = shuffle(sf.slice(0, count).concat(se));
    for (var i=0;i<pool.length;i++) await pool[i]();
    while (allLines.length > 55) container.removeChild(allLines.shift());
  }
}

run();

  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
