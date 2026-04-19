const TypewriterEngine = (() => {
  var topics = [
    // Tech & AI
    "Google","OpenAI","Anthropic","Apple","Tesla","SpaceX","Nvidia","Microsoft","Amazon","Meta",
    "Google Gemini","ChatGPT","Claude AI","Sora","Midjourney","Waymo","Boston Dynamics","Palantir","Starlink","Neuralink",
    "the TikTok Ban","AI Regulation","Self-Driving Cars","Electric Vehicles","Quantum Computing","Semiconductor Exports","the Chip War","Elon Musk","Jeff Bezos","Bill Gates",
  
    // US Politics
    "Donald Trump","Joe Biden","Kamala Harris","the Democratic Party","the Republican Party","the US Senate","the US House","the Supreme Court","the 2026 Midterms","the 2028 Election",
    "US Foreign Policy","the US Economy","US Immigration","the Federal Budget","the US Debt Ceiling","NATO","the UN Security Council","US Sanctions","the Electoral College","US Infrastructure",
  
    // World Leaders & Figures
    "Vladimir Putin","Xi Jinping","Benjamin Netanyahu","Emmanuel Macron","Keir Starmer","Giorgia Meloni","Olaf Scholz","Justin Trudeau","Narendra Modi","Luiz Lula da Silva",
    "Recep Erdogan","Mohammed bin Salman","Kim Jong-un","Volodymyr Zelensky","Javier Milei","Mark Zuckerberg","Larry Fink","Sundar Pichai","Sam Altman","Jensen Huang",
  
    // Religion & Culture
    "Jesus Christ","the Pope","the Vatican","the Catholic Church","the Dalai Lama","the Mormon Church","Islam","the Bible","the Second Coming","the Papacy",
  
    // Global Politics
    "Iran","North Korea","Russia","Ukraine","China","Israel","Gaza","Taiwan","the West Bank","Syria",
    "Yemen","Sudan","Venezuela","Mexico","Cuba","the European Union","the United Nations","the G7","the G20","BRICS",
    "OPEC","the World Bank","the IMF","the World Trade Organization","NATO Expansion","the Iran Nuclear Deal","the South China Sea","the Korean Peninsula","the Paris Agreement","the African Union",
  
    // Countries
    "Brazil","India","Germany","France","Japan","South Korea","Canada","Australia","Turkey","Saudi Arabia",
    "Argentina","South Africa","Nigeria","Egypt","Indonesia","Pakistan","Poland","Greece","Portugal","Sweden",
    "Norway","Netherlands","Belgium","Switzerland","Ireland","Spain","Italy","Finland","Denmark","New Zealand",
    "Colombia","Chile","Peru","Philippines","Vietnam","Thailand","Malaysia","Bangladesh","Ethiopia","Kenya",
    "Morocco","Algeria","Kazakhstan","Ukraine","Romania","Hungary","Czech Republic","Slovakia","Serbia","Croatia",
  
    // NFL Teams (all except Jets - they are easter egg)
    "the Kansas City Chiefs","the San Francisco 49ers","the Dallas Cowboys","the Philadelphia Eagles","the Buffalo Bills",
    "the Baltimore Ravens","the Cincinnati Bengals","the Miami Dolphins","the Cleveland Browns","the Pittsburgh Steelers",
    "the Houston Texans","the Indianapolis Colts","the Jacksonville Jaguars","the Tennessee Titans","the Denver Broncos",
    "the Las Vegas Raiders","the Los Angeles Chargers","the Chicago Bears","the Green Bay Packers","the Minnesota Vikings",
    "the Detroit Lions","the Atlanta Falcons","the Carolina Panthers","the New Orleans Saints","the Tampa Bay Buccaneers",
    "the Los Angeles Rams","the Seattle Seahawks","the Arizona Cardinals","the San Francisco 49ers","the New England Patriots",
    "the New York Giants","the Washington Commanders","the Los Angeles Rams","the Tennessee Titans","the Carolina Panthers",
  
    // NFL Players & Awards
    "Patrick Mahomes","Josh Allen","Lamar Jackson","Joe Burrow","Jalen Hurts","CJ Stroud","Dak Prescott","Brock Purdy",
    "the NFL MVP","the Super Bowl","the NFL Draft","the NFL Playoffs","the NFC Championship","the AFC Championship","the Heisman Trophy",
  
    // NBA Teams & Players
    "the Boston Celtics","the Golden State Warriors","the Los Angeles Lakers","the Denver Nuggets","the Miami Heat",
    "the Milwaukee Bucks","the Phoenix Suns","the Dallas Mavericks","the Oklahoma City Thunder","the Indiana Pacers",
    "the New York Knicks","the Cleveland Cavaliers","the Philadelphia 76ers","the Memphis Grizzlies","the Sacramento Kings",
    "LeBron James","Stephen Curry","Nikola Jokic","Giannis Antetokounmpo","Luka Doncic","Kevin Durant","Joel Embiid",
    "Jayson Tatum","Anthony Davis","Shai Gilgeous-Alexander","Victor Wembanyama","the NBA MVP","the NBA Finals","the NBA Draft",
  
    // MLB
    "the World Series","the New York Yankees","the Los Angeles Dodgers","the Houston Astros","the Atlanta Braves",
    "the Boston Red Sox","the Chicago Cubs","the San Francisco Giants","the St. Louis Cardinals","the New York Mets",
    "Shohei Ohtani","Aaron Judge","Mookie Betts","Freddie Freeman","Juan Soto","the MLB MVP","the Cy Young Award","the MLB Playoffs",
  
    // Soccer
    "the Premier League","the Champions League","La Liga","the World Cup 2026","the Ballon d Or","Real Madrid","Manchester City",
    "Liverpool","Arsenal","Chelsea","Manchester United","Barcelona","Bayern Munich","Paris Saint-Germain","Inter Milan","Juventus",
    "Lionel Messi","Cristiano Ronaldo","Kylian Mbappe","Erling Haaland","Vinicius Jr","Pedri","Jude Bellingham","Phil Foden",
    "the FA Cup","the Europa League","Serie A","Bundesliga","Ligue 1","MLS","the Copa America","the Euros","CONCACAF","the FA Trophy",
  
    // Tennis
    "Wimbledon","the US Open","the French Open","the Australian Open","the Grand Slam","Novak Djokovic","Carlos Alcaraz",
    "Jannik Sinner","Rafael Nadal","Daniil Medvedev","Coco Gauff","Iga Swiatek","Aryna Sabalenka","the ATP Finals","the Davis Cup",
  
    // Golf
    "the Masters","the US Open Golf","the British Open","the PGA Championship","Scottie Scheffler","Rory McIlroy",
    "Jon Rahm","Tiger Woods","the Ryder Cup","LIV Golf","the PGA Tour","the DP World Tour","the Solheim Cup","Brooks Koepka",
  
    // F1 & Motorsport
    "Formula 1","Max Verstappen","Lewis Hamilton","Charles Leclerc","Lando Norris","Carlos Sainz","the F1 World Championship",
    "the Monaco Grand Prix","the British Grand Prix","Red Bull Racing","Ferrari","Mercedes F1","McLaren","the F1 Season","NASCAR",
  
    // UFC & Boxing
    "UFC","the UFC Championship","Jon Jones","Islam Makhachev","Alexander Volkanovski","Sean O Malley","Leon Edwards",
    "Israel Adesanya","Conor McGregor","Francis Ngannou","Tyson Fury","Anthony Joshua","Canelo Alvarez","the WBC Title","the Boxing World Title",
  
    // College Sports & Schools
    "March Madness","the NCAA Tournament","the College Football Playoff","the National Championship","the Rose Bowl","the Orange Bowl",
    "UConn Basketball","Duke Basketball","Kentucky Basketball","Kansas Basketball","Gonzaga","Villanova","Loyola Chicago",
    "Michigan Football","Alabama Football","Ohio State Football","Georgia Football","Clemson","LSU","Notre Dame","Penn State",
    "Texas Longhorns","Oklahoma Sooners","Oregon Ducks","USC Trojans","Florida Gators","Tennessee Volunteers","Auburn","Arkansas",
    "UMass Amherst","Rutgers","Syracuse","Indiana University","Purdue","Iowa","Nebraska","Wisconsin","Minnesota","Northwestern",
    "Harvard","Yale","Princeton","Columbia","Cornell","Dartmouth","Brown","UPenn","Stanford","MIT","Georgetown","Boston College",
  
    // Crypto
    "Bitcoin","Ethereum","XRP","Solana","Dogecoin","Cardano","Avalanche","Chainlink","Polkadot","Litecoin",
    "Shiba Inu","Pepe","the Crypto Market","a Bitcoin ETF","Crypto Regulation","Coinbase","Binance","Web3","DeFi","a Crypto Bull Run",
  
    // Markets, Economy & Commodities
    "the S&P 500","the Federal Reserve","Interest Rates","Inflation","a Recession","the US Dollar","the NASDAQ","the Dow Jones",
    "Gold","Silver","Oil","Natural Gas","Copper","Wheat","Corn","the Housing Market","the Bond Market","Real Estate",
    "the Euro","the Japanese Yen","the British Pound","the Chinese Yuan","the Swiss Franc","the Canadian Dollar","the Australian Dollar","Emerging Markets","Hedge Funds","Private Equity",
  
    // Individual Stocks
    "Apple Stock","Tesla Stock","Nvidia Stock","Amazon Stock","Meta Stock","Google Stock","Microsoft Stock","Netflix Stock","Palantir Stock","OpenAI",
  
    // Music Artists
    "Taylor Swift","Beyonce","Drake","Kanye West","Bad Bunny","Sabrina Carpenter","Billie Eilish","Olivia Rodrigo","The Weeknd","Post Malone",
    "Kendrick Lamar","SZA","Doja Cat","Ariana Grande","Harry Styles","Ed Sheeran","Adele","Rihanna","Lady Gaga","Cardi B",
    "Travis Scott","Lil Baby","Gunna","Future","21 Savage","Nicki Minaj","Lizzo","Dua Lipa","Miley Cyrus","Justin Bieber",
  
    // Entertainment & Pop Culture
    "the Oscars","the Grammy Awards","the Super Bowl Halftime Show","the Box Office","Netflix","Disney","HBO","the Emmys",
    "the Golden Globes","Spotify","YouTube","the VMAs","a Marvel Movie","a Star Wars Series","the Billboard Charts","the Met Gala",
    "the SAG Awards","the Tony Awards","the Sundance Film Festival","the Cannes Film Festival","the BET Awards","TikTok","Instagram","X",
  
    // Gaming
    "GTA 6","Call of Duty","Fortnite","Minecraft","Roblox","Xbox","PlayStation","the Nintendo Switch 2","Steam","Valve",
    "the Game Awards","Valorant","Elden Ring","a Rockstar Game","the Esports World Cup","Counter-Strike","World of Warcraft","Cyberpunk","Baldurs Gate","Halo",
  
    // Science & Space
    "a Mars Mission","the Moon Landing","NASA","the James Webb Telescope","a SpaceX Launch","Nuclear Fusion","Climate Change","Solar Energy","the Arctic Ice Cap","Artificial General Intelligence"
  ];
  
  // Easter eggs - inline (keeps "Place trades on" white text)
  var easterEggsInline = [
    { text: "your ex", sit: 4500 },
    { text: "this conversation", sit: 4500 },
    { text: "whatever you're avoiding", sit: 5000 },
    { text: "who's really winning", sit: 5000 },
    { text: "your next mistake", sit: 4500 },
    { text: "nothing", sit: 5000 },
    { text: "you, eventually", sit: 10000, rare: true },
    { text: "dinner tonight", sit: 4000 },
    { text: "whether you'll actually follow through", sit: 6000 },
    { text: "you", sit: 5000 },
    { text: "the next big thing", sit: 4500 },
    { text: "your gut feeling", sit: 4500 },
    { text: "regret", sit: 5000 },
    { text: "time", sit: 5000 },
    { text: "everyone watching", sit: 5000 },
    { text: "the version of you that does it", sit: 5500 },
    { text: "a better version of yourself", sit: 5000 },
    { text: "luck vs skill", sit: 4500 },
    { text: "the last trade you made", sit: 5000 },
    { text: "something you can't predict", sit: 5000 },
    { text: "the algorithm", sit: 4500 },
    { text: "you vs the market", sit: 5000 },
  ];
  
  // Standalone easter eggs - full screen takeover, no "Place trades on"
  var easterEggsStandalone = [
    { text: "the market doesn't care how you feel.", sit: 5500 },
    { text: "you're not as rational as you think.", sit: 5500 },
    { text: "most people lose money on prediction markets.", sit: 6000 },
    { text: "the market is always open.", sit: 5000 },
    { text: "everyone thinks they have an edge.", sit: 5500 },
    { text: "patience is a position.", sit: 5000 },
    { text: "are you sure about that trade?", sit: 5000 },
  ];
  
  // Jets easter egg - special sequence
  var jetsEgg = {
    pre: "the New York Jets",
    erase: true,
    retype: "Do NOT place trades on the New York Jets",
    eraseAll: true,
    restore: true
  };
  
  var dynamicEl;
  var cursorEl;
  var staticEl;
  var cursorOn = true;
  var blinkInterval;
  var STATIC_TEXT = 'Place trades on';
  
  async function eraseStatic(){
    if (!staticEl) return;
    var t = staticEl.textContent;
    while(t.length > 0){
      t = t.slice(0,-1);
      staticEl.textContent = t;
      await sl(rnd(28,55));
    }
  }
  
  async function retypeStatic(){
    if (!staticEl) return;
    var t = '';
    for(var i=0;i<STATIC_TEXT.length;i++){
      t += STATIC_TEXT[i];
      staticEl.textContent = t;
      await sl(rnd(55,100));
    }
  }
  
  function startBlink(){
    if (!cursorEl || !dynamicEl) return;
    clearInterval(blinkInterval);
    blinkInterval = setInterval(function(){
      cursorOn = !cursorOn;
      if(cursorOn){
        cursorEl.classList.remove('off');
        dynamicEl.classList.remove('cursor-off');
      } else {
        cursorEl.classList.add('off');
        dynamicEl.classList.add('cursor-off');
      }
    }, 530);
  }
  function stopBlink(){
    if (!cursorEl || !dynamicEl) return;
    clearInterval(blinkInterval);
    cursorOn = true;
    cursorEl.classList.remove('off');
    dynamicEl.classList.remove('cursor-off');
  }
  
  function sl(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  function rnd(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
  
  // Topic queue - no repeat within full shuffle
  var topicQueue = [];
  function getNextTopic(){
    if(topicQueue.length < 1){
      var last = window._lastTopic || '';
      var shuffled = topics.slice().sort(function(){ return Math.random()-0.5; });
      while(shuffled[0] === last) shuffled = shuffled.sort(function(){ return Math.random()-0.5; });
      topicQueue = shuffled;
    }
    var next = topicQueue.shift();
    window._lastTopic = next;
    return next;
  }
  
  // Easter egg pools
  var inlineEggPool = [];
  var standaloneEggPool = [];
  var topicsSinceLastEgg = 0;
  var MIN_TOPICS_BETWEEN_EGGS = 3;
  
  function maybeGetEasterEgg(){
    if(topicsSinceLastEgg < MIN_TOPICS_BETWEEN_EGGS) return null;
    // "you, eventually" is rare - 1% chance when eligible
    // other eggs - combined ~4% chance per topic
    var roll = Math.random();
    if(roll < 0.01){
      // check if rare egg (you eventually)
      var rare = easterEggsInline.filter(function(e){ return e.rare; });
      if(rare.length) return { type:'inline', egg: rare[Math.floor(Math.random()*rare.length)] };
    }
    if(roll < 0.015){
      // jets egg
      return { type:'jets' };
    }
    if(roll < 0.04){
      // standalone
      if(standaloneEggPool.length === 0) standaloneEggPool = easterEggsStandalone.slice().sort(function(){ return Math.random()-0.5; });
      return { type:'standalone', egg: standaloneEggPool.shift() };
    }
    if(roll < 0.07){
      // inline (non-rare)
      var nonRare = easterEggsInline.filter(function(e){ return !e.rare; });
      if(inlineEggPool.length === 0) inlineEggPool = nonRare.slice().sort(function(){ return Math.random()-0.5; });
      return { type:'inline', egg: inlineEggPool.shift() };
    }
    return null;
  }
  
  async function typeChars(text){
    if (!dynamicEl) return;
    var displayed = dynamicEl.textContent || '';
    for(var i = 0; i < text.length; i++){
      displayed += text[i];
      dynamicEl.textContent = displayed;
      var delay = rnd(70,110);
      if(Math.random() < 0.12) delay = rnd(40,65);
      if(Math.random() < 0.05) delay = rnd(160,280);
      if(Math.random() < 0.015) delay = rnd(320,500);
      await sl(delay);
      if(i > 0 && i < text.length-2 && Math.random() < 0.035){
        var wc = 'abcdefghijklmnopqrstuvwxyz';
        displayed += wc[Math.floor(Math.random()*wc.length)];
        dynamicEl.textContent = displayed;
        await sl(rnd(100,190));
        displayed = displayed.slice(0,-1);
        dynamicEl.textContent = displayed;
        await sl(rnd(60,120));
      }
    }
  }
  
  async function eraseChars(speed){
    if (!dynamicEl) return;
    var text = dynamicEl.textContent || '';
    while(text.length > 0){
      var n = Math.random() < 0.15 ? 2 : 1;
      text = text.slice(0, Math.max(0, text.length-n));
      dynamicEl.textContent = text;
      await sl(speed || rnd(35,60));
    }
  }
  
  async function typeText(text){
    stopBlink();
    await typeChars(text);
  }
  
  async function eraseText(sit){
    startBlink();
    await sl(sit || rnd(1600,2600));
    stopBlink();
    await eraseChars();
  }
  
  // Normal topic cycle
  async function doNormalTopic(){
    var topic = getNextTopic();
    topicsSinceLastEgg++;
    await typeText(topic);
    await eraseText();
    await sl(rnd(150,320));
  }
  
  // Inline easter egg (keeps "Place trades on")
  async function doInlineEgg(egg){
    topicsSinceLastEgg = 0;
    await typeText(egg.text);
    startBlink();
    await sl(egg.sit || 4500);
    stopBlink();
    await eraseChars();
    await sl(rnd(150,320));
  }
  
  // Standalone easter egg - erases "Place trades on" char by char, retypes it after
  async function doStandaloneEgg(egg){
    topicsSinceLastEgg = 0;
    stopBlink();
    // erase dynamic first then static
    await eraseChars();
    await eraseStatic();
    // type the standalone message in blue
    if (dynamicEl) dynamicEl.classList.add('standalone');
    await sl(200);
    await typeChars(egg.text);
    startBlink();
    await sl(egg.sit || 5500);
    stopBlink();
    // erase it
    await eraseChars();
    if (dynamicEl) {
      dynamicEl.classList.remove('standalone');
      dynamicEl.classList.remove('cursor-off');
    }
    await sl(200);
    // retype "Place trades on"
    await retypeStatic();
    await sl(rnd(150,320));
  }
  
  // Jets easter egg - full sequence
  async function doJetsEgg(){
    topicsSinceLastEgg = 0;
    stopBlink();
    // step 1: type "the New York Jets" in blue (normal inline position)
    await typeChars("the New York Jets");
    startBlink();
    await sl(1000);
    stopBlink();
    // step 2: erase dynamic, then erase "Place trades on"
    await eraseChars(40);
    await eraseStatic();
    await sl(350);
    // step 3: retype static as "Do NOT place trades on"
    var warningStatic = 'Do NOT place trades on';
    var t = '';
    for(var i=0;i<warningStatic.length;i++){
      if (!staticEl) break;
      t += warningStatic[i];
      staticEl.textContent = t;
      await sl(rnd(55,105));
    }
    await sl(200);
    // step 4: type "the New York Jets" in blue after the warning
    await typeChars("the New York Jets");
    startBlink();
    await sl(2500);
    stopBlink();
    // step 5: erase dynamic then erase the warning static
    await eraseChars(38);
    if (!staticEl) return;
    var ws = staticEl.textContent;
    while(ws.length > 0){
      ws = ws.slice(0,-1);
      staticEl.textContent = ws;
      await sl(rnd(28,52));
    }
    await sl(300);
    // step 6: retype "Place trades on" normally
    await retypeStatic();
    await sl(rnd(150,320));
  }
  
  async function run(){
    await sl(600);
    while(true){
      if (!dynamicEl || !staticEl) return; // if dom destroyed
      var egg = maybeGetEasterEgg();
      if(egg){
        if(egg.type === 'inline') await doInlineEgg(egg.egg);
        else if(egg.type === 'standalone') await doStandaloneEgg(egg.egg);
        else if(egg.type === 'jets') await doJetsEgg();
      } else {
        await doNormalTopic();
      }
    }
  }

  function init() {
    dynamicEl = document.getElementById('globe-dynamic-txt');
    cursorEl = document.getElementById('globe-cursor');
    staticEl = document.getElementById('globe-static-txt');
    if (!dynamicEl || !staticEl) return;
    run();
  }

  return { init };
})();
