(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const $ = selector => document.querySelector(selector);
  const ui = {
    energyBar: $("#energyBar"), energyText: $("#energyText"), scoreText: $("#scoreText"),
    missionText: $("#missionText"), missionProgress: $("#missionProgress"), zoneText: $("#zoneText"),
    levelProgress: $("#levelProgress"), progressRunner: $("#progressRunner"), progressStart: $("#progressStart"),
    progressEnd: $("#progressEnd"), toast: $("#toast"), bestScore: $("#bestScore"),
    exerciseTitle: $("#exerciseTitle"), exerciseKicker: $("#exerciseKicker"), repCount: $("#repCount"),
    repGoal: $("#repGoal"), repButton: $("#repButton"), repKey: $("#repKey"), timingBar: $("#timingBar"),
    comboText: $("#comboText"), nextLevelTitle: $("#nextLevelTitle"), nextLevelCopy: $("#nextLevelCopy")
  };

  const screens = ["startScreen", "helpScreen", "exerciseScreen", "pauseScreen", "gameOverScreen", "levelScreen", "winScreen"];
  const FLOOR = 452;
  const LEVEL_LENGTH = 4300;
  const LEVEL_COUNT = 3;
  const WORLD = LEVEL_LENGTH * LEVEL_COUNT;
  const keys = Object.create(null);
  let state = "menu";
  let last = 0;
  let cameraX = 0;
  let toastTimer = 0;
  let soundOn = true;
  let audioCtx = null;
  let currentStation = null;
  let exercise = null;
  let currentLevel = 0;

  const sprite = new Image();
  sprite.src = "assets/danna-sprites.png";
  const backgroundFiles = ["gym-pixel-bg.png", "gym-cardio-sunrise.png", "gym-boxing-night.png"];
  const backgrounds = backgroundFiles.map(() => new Image());
  function loadBackground(index) {
    if (!backgrounds[index].src) backgrounds[index].src = "assets/" + backgroundFiles[index];
  }
  loadBackground(0);

  const levels = [
    { name: "FUERZA AZUL", short: "NIVEL 1", tint: "#1758ff", floor: "#25315e", line: "#5f7bce" },
    { name: "CARDIO SOLAR", short: "NIVEL 2", tint: "#ff6b4a", floor: "#5b3341", line: "#ff9679" },
    { name: "BOXEO NEÓN", short: "NIVEL 3", tint: "#b72cff", floor: "#241c48", line: "#ef4bff" }
  ];

  const exerciseTypes = [
    { name: "SENTADILLAS", reps: 5, key: "E", tip: "Piernas fuertes, espalda recta" },
    { name: "JUMPING JACKS", reps: 6, key: "E", tip: "Abre y cierra al ritmo" },
    { name: "BICICLETA", reps: 6, key: "E", tip: "Mantén una cadencia constante" },
    { name: "PLANCHA", reps: 6, key: "E", tip: "Centro firme y respiración" },
    { name: "GOLPES RÁPIDOS", reps: 7, key: "E", tip: "Mantén la guardia arriba" },
    { name: "SPRINT FINAL", reps: 8, key: "E", tip: "¡Último esfuerzo!" }
  ];

  const stationPattern = [1250, 3070];
  const obstaclePattern = [650, 1080, 1720, 2180, 2640, 3460, 3890];
  const platformPattern = [[390, 355, 145], [890, 315, 125], [1570, 345, 155], [2090, 290, 125], [2800, 350, 150], [3350, 300, 135], [3830, 345, 150]];
  const stations = [];
  const obstacles = [];
  const platforms = [];
  for (let level = 0; level < LEVEL_COUNT; level++) {
    const offset = level * LEVEL_LENGTH;
    stationPattern.forEach((localX, i) => stations.push({ x: offset + localX, level, y: FLOOR - 72, done: false, prompted: false, type: exerciseTypes[level * 2 + i] }));
    obstaclePattern.forEach((localX, i) => obstacles.push({ x: offset + localX, level, w: i % 3 === 0 ? 58 : 42, h: i % 3 === 0 ? 54 : 38, hit: false, passed: false, kind: i % 3 }));
    platformPattern.forEach(([localX, y, w]) => platforms.push({ x: offset + localX, level, y, w, h: 18 }));
  }

  const foodNames = {
    apple: "MANZANA +ENERGÍA", banana: "BANANA +ENERGÍA", broccoli: "BRÓCOLI +FUERZA", water: "AGUA +ENERGÍA",
    burger: "HAMBURGUESA -ENERGÍA", soda: "GASEOSA -ENERGÍA", donut: "DONA -ENERGÍA", fries: "PAPAS -ENERGÍA"
  };
  const healthyKinds = ["apple", "banana", "broccoli", "water"];
  const junkKinds = ["burger", "soda", "donut", "fries"];
  const foods = [];
  for (let level = 0; level < LEVEL_COUNT; level++) {
    for (let localX = 260, i = 0; localX < LEVEL_LENGTH - 250; localX += 235, i++) {
      const junk = i % 5 === 2 || i % 9 === 6;
      foods.push({ x: level * LEVEL_LENGTH + localX, level, y: FLOOR - 55 - (i % 4 === 0 ? 85 : 0), kind: junk ? junkKinds[i % junkKinds.length] : healthyKinds[i % healthyKinds.length], healthy: !junk, taken: false, bob: i * .7 });
    }
  }

  const missions = [
    { text: "Come 3 alimentos saludables", progress: s => [Math.min(s.levelHealthy, 3), 3], done: s => s.levelHealthy >= 3 },
    { text: "Salta 3 obstáculos", progress: s => [Math.min(s.levelJumps, 3), 3], done: s => s.levelJumps >= 3 },
    { text: "Completa 2 estaciones fitness", progress: s => [Math.min(s.levelExercises, 2), 2], done: s => s.levelExercises >= 2 },
    { text: "Llega a la salida del nivel", progress: s => [Math.min(100, Math.floor(levelDistance(s) / LEVEL_LENGTH * 100)), 100], suffix: "%", done: () => false }
  ];

  const player = { x: 80, y: FLOOR - 104, w: 60, h: 104, vx: 0, vy: 0, onGround: true, face: 1, energy: 100, invuln: 0, anim: 0 };
  let stats = freshStats();

  function freshStats() {
    return { score: 0, healthy: 0, junk: 0, exercises: 0, jumps: 0, distance: 0, mission: 0, won: false, levelHealthy: 0, levelExercises: 0, levelJumps: 0 };
  }

  function levelDistance(s = stats) { return Math.max(0, s.distance - currentLevel * LEVEL_LENGTH); }
  function levelComplete() { return stats.levelHealthy >= 3 && stats.levelJumps >= 3 && stats.levelExercises >= 2; }
  function showScreen(id) { screens.forEach(name => $("#" + name).classList.toggle("active", name === id)); }
  function hideScreens() { screens.forEach(name => $("#" + name).classList.remove("active")); }

  function beep(freq = 440, duration = .08, type = "square", volume = .04) {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.value = volume;
      gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) { /* El audio es opcional. */ }
  }

  function toast(message, color = "#ffd62e") {
    ui.toast.textContent = message;
    ui.toast.style.borderColor = color;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1900);
  }

  function resetLevelStats() {
    stats.mission = 0;
    stats.levelHealthy = 0;
    stats.levelExercises = 0;
    stats.levelJumps = 0;
  }

  function resetGame() {
    currentLevel = 0;
    Object.assign(player, { x: 80, y: FLOOR - 104, vx: 0, vy: 0, onGround: true, face: 1, energy: 100, invuln: 0, anim: 0 });
    stats = freshStats();
    foods.forEach(food => food.taken = false);
    stations.forEach(station => { station.done = false; station.prompted = false; });
    obstacles.forEach(obstacle => { obstacle.hit = false; obstacle.passed = false; });
    cameraX = 0; currentStation = null; exercise = null;
    updateHud(true);
  }

  function startGame() {
    resetGame(); hideScreens(); state = "playing"; beep(330, .08); setTimeout(() => beep(660, .12), 90);
    toast("NIVEL 1 · FUERZA AZUL", levels[0].tint);
    const warmNextLevels = () => { loadBackground(1); loadBackground(2); };
    if ("requestIdleCallback" in window) requestIdleCallback(warmNextLevels, { timeout: 2500 });
    else setTimeout(warmNextLevels, 1200);
  }

  function jump() {
    if (state === "playing" && player.onGround) { player.vy = -15.6; player.onGround = false; beep(320, .08); }
  }

  function tryAction() {
    if (state === "exercise") { registerRep(); return; }
    if (state !== "playing") return;
    const near = stations.find(station => !station.done && station.level === currentLevel && Math.abs((station.x + 32) - (player.x + player.w / 2)) < 105);
    if (near) startExercise(near); else toast("ACÉRCATE A UNA ESTACIÓN FITNESS", "#45e7ff");
  }

  function startExercise(station) {
    currentStation = station;
    exercise = { reps: 0, combo: 0, phase: 0, direction: 1, lock: false };
    state = "exercise";
    ui.exerciseTitle.textContent = station.type.name;
    ui.exerciseKicker.textContent = station.type.tip;
    ui.repGoal.textContent = "/ " + station.type.reps;
    ui.repCount.textContent = "0";
    ui.repKey.textContent = station.type.key;
    ui.comboText.textContent = "RITMO PERFECTO x0";
    showScreen("exerciseScreen"); beep(520, .12);
  }

  function registerRep() {
    if (!exercise || exercise.lock) return;
    const good = exercise.phase >= .41 && exercise.phase <= .59;
    if (good) {
      exercise.reps++; exercise.combo++; exercise.lock = true;
      ui.repCount.textContent = exercise.reps;
      ui.comboText.textContent = "RITMO PERFECTO x" + exercise.combo;
      ui.repButton.classList.add("ready");
      stats.score += 120 + exercise.combo * 20;
      beep(700 + exercise.combo * 40, .1);
      setTimeout(() => { if (exercise) { exercise.lock = false; ui.repButton.classList.remove("ready"); exercise.phase = .05; } }, 260);
      if (exercise.reps >= currentStation.type.reps) setTimeout(finishExercise, 350);
    } else {
      exercise.combo = 0; ui.comboText.textContent = "CASI... SIGUE EL RITMO"; beep(130, .12, "sawtooth");
    }
  }

  function finishExercise() {
    if (!currentStation || currentStation.done) return;
    currentStation.done = true; stats.exercises++; stats.levelExercises++; stats.score += 600; player.energy = Math.min(100, player.energy + 18);
    currentStation = null; exercise = null; hideScreens(); state = "playing";
    toast("¡RETO SUPERADO! +600", "#59ec7d"); beep(880, .12); setTimeout(() => beep(1100, .18), 130);
    advanceMission(); updateHud(true);
  }

  function advanceMission() {
    let advanced = false;
    while (stats.mission < missions.length - 1 && missions[stats.mission].done(stats)) {
      stats.mission++; stats.score += 300; advanced = true;
    }
    if (advanced) toast("NUEVA MISIÓN · " + missions[stats.mission].text.toUpperCase(), "#45e7ff");
  }

  function damage(amount, message) {
    if (player.invuln > 0) return;
    player.energy = Math.max(0, player.energy - amount); player.invuln = 80; player.vx = -player.face * 7; player.vy = -7;
    toast(message, "#ff4b5c"); beep(95, .18, "sawtooth", .07);
    if (player.energy <= 0) { state = "gameover"; showScreen("gameOverScreen"); }
  }

  function collectFood(food) {
    food.taken = true;
    if (food.healthy) {
      stats.healthy++; stats.levelHealthy++; stats.score += 180; player.energy = Math.min(100, player.energy + 9);
      toast(foodNames[food.kind] + " · +180", "#59ec7d"); beep(760, .08); setTimeout(() => beep(960, .08), 70);
    } else {
      stats.junk++; stats.score = Math.max(0, stats.score - 90); player.energy = Math.max(0, player.energy - 12);
      toast(foodNames[food.kind] + " · -90", "#ff4b5c"); beep(115, .15, "sawtooth");
    }
    advanceMission();
  }

  function tryFinishLevel() {
    if (!levelComplete()) {
      const missing = [];
      if (stats.levelHealthy < 3) missing.push(`${3 - stats.levelHealthy} alimentos`);
      if (stats.levelJumps < 3) missing.push(`${3 - stats.levelJumps} saltos`);
      if (stats.levelExercises < 2) missing.push(`${2 - stats.levelExercises} estaciones`);
      toast("AÚN FALTA: " + missing.join(" · "), "#ff4b5c");
      player.x = (currentLevel + 1) * LEVEL_LENGTH - 520;
      return;
    }
    stats.score += 1000 + Math.round(player.energy * 8);
    if (currentLevel === LEVEL_COUNT - 1) { finishGame(); return; }
    state = "levelcomplete";
    ui.nextLevelTitle.textContent = `¡NIVEL ${currentLevel + 1} SUPERADO!`;
    ui.nextLevelCopy.textContent = `Completaste ${levels[currentLevel].name}. Prepárate para ${levels[currentLevel + 1].name}.`;
    showScreen("levelScreen");
    beep(660, .14); setTimeout(() => beep(880, .2), 150);
  }

  function beginNextLevel() {
    currentLevel++;
    loadBackground(currentLevel);
    resetLevelStats();
    Object.assign(player, { x: currentLevel * LEVEL_LENGTH + 90, y: FLOOR - 104, vx: 0, vy: 0, onGround: true, energy: Math.min(100, player.energy + 25) });
    cameraX = currentLevel * LEVEL_LENGTH;
    hideScreens(); state = "playing"; updateHud(true);
    toast(`${levels[currentLevel].short} · ${levels[currentLevel].name}`, levels[currentLevel].tint);
  }

  function finishGame() {
    if (stats.won) return;
    stats.won = true; stats.score += Math.round(player.energy * 25) + 2500; state = "won";
    const best = Math.max(Number(localStorage.getItem("dannaFitBest") || 0), stats.score);
    localStorage.setItem("dannaFitBest", best);
    $("#finalScore").textContent = stats.score.toLocaleString("es-PE");
    $("#finalHealthy").textContent = stats.healthy;
    $("#finalExercises").textContent = stats.exercises + "/6";
    $("#finalRank").textContent = player.energy >= 80 ? "S" : player.energy >= 55 ? "A" : "B";
    ui.bestScore.textContent = String(best).padStart(5, "0");
    showScreen("winScreen"); beep(660, .15); setTimeout(() => beep(880, .15), 160); setTimeout(() => beep(1100, .3), 320);
  }

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function update(dt) {
    if (state === "exercise" && exercise) {
      exercise.phase += exercise.direction * dt * .0012;
      if (exercise.phase >= 1) { exercise.phase = 1; exercise.direction = -1; }
      if (exercise.phase <= 0) { exercise.phase = 0; exercise.direction = 1; }
      ui.timingBar.style.left = `calc(${exercise.phase * 100}% - 4px)`;
      ui.repButton.classList.toggle("ready", exercise.phase >= .41 && exercise.phase <= .59);
      return;
    }
    if (state !== "playing") return;

    const left = keys.ArrowLeft || keys.KeyA || keys.touchLeft;
    const right = keys.ArrowRight || keys.KeyD || keys.touchRight;
    const acceleration = player.onGround ? .82 : .46;
    if (left) { player.vx -= acceleration; player.face = -1; }
    if (right) { player.vx += acceleration; player.face = 1; }
    if (!left && !right) player.vx *= player.onGround ? .76 : .96;
    player.vx = Math.max(-8.7, Math.min(8.7, player.vx));
    const previousBottom = player.y + player.h;
    player.vy += .78; player.vy = Math.min(18, player.vy);
    player.x += player.vx; player.y += player.vy; player.onGround = false;
    const levelStart = currentLevel * LEVEL_LENGTH;
    const levelEnd = (currentLevel + 1) * LEVEL_LENGTH;
    player.x = Math.max(levelStart, Math.min(levelEnd - player.w, player.x));

    if (player.y + player.h >= FLOOR) { player.y = FLOOR - player.h; player.vy = 0; player.onGround = true; }
    for (const platform of platforms) {
      if (platform.level === currentLevel && player.vy >= 0 && previousBottom <= platform.y + 5 && player.y + player.h >= platform.y && player.x + player.w > platform.x && player.x < platform.x + platform.w) {
        player.y = platform.y - player.h; player.vy = 0; player.onGround = true;
      }
    }

    player.anim += Math.abs(player.vx) * .018 + .02;
    if (player.invuln > 0) player.invuln--;
    stats.distance = Math.max(stats.distance, player.x);
    const hitbox = { x: player.x + 10, y: player.y + 9, w: player.w - 20, h: player.h - 12 };

    for (const food of foods) if (food.level === currentLevel && !food.taken && Math.abs(food.x - player.x) < 95 && overlap(hitbox, { x: food.x - 16, y: food.y - 14, w: 34, h: 40 })) collectFood(food);
    for (const obstacle of obstacles) {
      if (obstacle.level !== currentLevel) continue;
      const box = { x: obstacle.x, y: FLOOR - obstacle.h, w: obstacle.w, h: obstacle.h };
      if (!obstacle.passed && player.x > obstacle.x + obstacle.w) {
        obstacle.passed = true;
        if (!obstacle.hit && player.y + player.h < FLOOR - 5) { stats.jumps++; stats.levelJumps++; stats.score += 90; advanceMission(); }
      }
      if (overlap(hitbox, box)) { obstacle.hit = true; damage(12, "¡OBSTÁCULO! -12 ENERGÍA"); }
    }
    for (const station of stations) {
      if (station.level !== currentLevel) continue;
      if (!station.done && Math.abs(station.x - player.x) < 75 && !station.prompted) { station.prompted = true; toast("PRESIONA E · " + station.type.name, "#45e7ff"); }
      if (Math.abs(station.x - player.x) > 180) station.prompted = false;
    }
    if (player.x >= levelEnd - 175) tryFinishLevel();

    const targetCam = Math.max(levelStart, Math.min(levelEnd - canvas.width, player.x - canvas.width * .38));
    cameraX += (targetCam - cameraX) * .095;
    updateHud();
  }

  function updateHud(force = false) {
    ui.energyBar.style.width = player.energy + "%";
    ui.energyBar.style.background = player.energy < 30 ? "#ff4b5c" : "linear-gradient(90deg,#59ec7d,#45e7ff)";
    ui.energyText.textContent = Math.ceil(player.energy);
    ui.scoreText.textContent = String(stats.score).padStart(5, "0");
    const mission = missions[stats.mission];
    const [value, goal] = mission.progress(stats);
    ui.missionText.textContent = mission.text;
    ui.missionProgress.textContent = `${value} / ${goal}${mission.suffix || ""}`;
    ui.zoneText.textContent = `${levels[currentLevel].short} · ${levels[currentLevel].name}`;
    const localX = Math.max(0, player.x - currentLevel * LEVEL_LENGTH);
    const percent = Math.min(100, localX / LEVEL_LENGTH * 100);
    ui.levelProgress.style.width = percent + "%";
    ui.progressRunner.style.left = percent + "%";
    ui.progressStart.textContent = `NIVEL ${currentLevel + 1}/3`;
    ui.progressEnd.textContent = currentLevel === 2 ? "GRAN META" : "SIGUIENTE NIVEL";
    if (force) ui.bestScore.textContent = String(Number(localStorage.getItem("dannaFitBest") || 0)).padStart(5, "0");
  }

  function drawBackground() {
    const image = backgrounds[currentLevel];
    if (image.complete && image.naturalWidth) {
      const tileW = canvas.width * 1.5;
      const localCamera = cameraX - currentLevel * LEVEL_LENGTH;
      const offset = -((localCamera * .12) % tileW);
      for (let x = offset - tileW; x < canvas.width + tileW; x += tileW) ctx.drawImage(image, x, 0, tileW + 2, canvas.height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, levels[currentLevel].tint); gradient.addColorStop(1, "#071232");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = "#06112f5c"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = levels[currentLevel].tint + "16"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = levels[currentLevel].floor + "df"; ctx.fillRect(0, FLOOR, canvas.width, canvas.height - FLOOR);
    ctx.fillStyle = levels[currentLevel].line; ctx.fillRect(0, FLOOR, canvas.width, 7);
    for (let x = -(cameraX % 64); x < canvas.width; x += 64) { ctx.fillStyle = "#10162c66"; ctx.fillRect(Math.floor(x), FLOOR + 22, 46, 4); }
  }

  function worldToScreen(x) { return Math.round(x - cameraX); }
  function pixelRect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

  function drawPlatform(platform) {
    if (platform.level !== currentLevel) return;
    const x = worldToScreen(platform.x); if (x > canvas.width || x + platform.w < 0) return;
    pixelRect(x, platform.y, platform.w, platform.h, "#ffd62e"); pixelRect(x + 5, platform.y + 5, platform.w - 10, platform.h - 5, "#9a4d18");
    for (let bx = 10; bx < platform.w; bx += 28) pixelRect(x + bx, platform.y + 4, 8, 5, "#fff9dc");
  }

  function drawFood(food, t) {
    if (food.level !== currentLevel || food.taken) return;
    const x = worldToScreen(food.x); if (x < -50 || x > canvas.width + 30) return;
    const y = Math.round(food.y + Math.sin(t * .004 + food.bob) * 6);
    ctx.save(); ctx.translate(x, y); ctx.shadowColor = food.healthy ? "#59ec7d" : "#ff4b5c"; ctx.shadowBlur = 13;
    if (food.kind === "apple") { pixelRect(-13, 3, 26, 22, "#ef3340"); pixelRect(-9, -2, 19, 29, "#ff4b5c"); pixelRect(0, -9, 4, 9, "#633b22"); pixelRect(4, -8, 10, 6, "#59ec7d"); }
    if (food.kind === "banana") { pixelRect(-13, 3, 6, 14, "#ffd62e"); pixelRect(-8, 12, 20, 9, "#ffd62e"); pixelRect(8, 5, 7, 13, "#ffb20f"); pixelRect(11, 2, 5, 5, "#6e4a18"); }
    if (food.kind === "broccoli") { pixelRect(-4, 8, 9, 19, "#75c94a"); pixelRect(-14, -3, 28, 18, "#258c4b"); pixelRect(-8, -10, 14, 12, "#59ec7d"); }
    if (food.kind === "water") { pixelRect(-10, -9, 20, 34, "#62ddff"); pixelRect(-6, -14, 12, 6, "#fff9dc"); pixelRect(-6, 0, 12, 14, "#1675d1"); }
    if (food.kind === "burger") { pixelRect(-15, -2, 30, 8, "#f1a33b"); pixelRect(-13, 6, 27, 6, "#59a943"); pixelRect(-15, 12, 30, 7, "#5e2b25"); pixelRect(-13, 19, 27, 7, "#f1a33b"); }
    if (food.kind === "soda") { pixelRect(-10, -8, 20, 34, "#d62e4f"); pixelRect(-7, -12, 14, 5, "#d9e7ff"); pixelRect(-13, -1, 26, 5, "#fff9dc"); pixelRect(2, -21, 4, 12, "#45e7ff"); }
    if (food.kind === "donut") { ctx.fillStyle = "#ed9b4f"; ctx.beginPath(); ctx.arc(0, 9, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ff4fa3"; ctx.beginPath(); ctx.arc(0, 6, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#071232"; ctx.beginPath(); ctx.arc(0, 8, 5, 0, Math.PI * 2); ctx.fill(); }
    if (food.kind === "fries") { pixelRect(-11, 5, 22, 23, "#e6324c"); for (let i = -9; i <= 8; i += 6) pixelRect(i, -8 + Math.abs(i % 3), 4, 17, "#ffd62e"); }
    ctx.restore();
  }

  function drawObstacle(obstacle) {
    if (obstacle.level !== currentLevel) return;
    const x = worldToScreen(obstacle.x); if (x > canvas.width || x + obstacle.w < 0) return; const y = FLOOR - obstacle.h;
    if (obstacle.kind === 0) {
      pixelRect(x, y + 12, obstacle.w, obstacle.h - 12, "#ef5b21"); pixelRect(x + 8, y + 20, obstacle.w - 16, 7, "#fff9dc"); pixelRect(x - 8, FLOOR - 9, obstacle.w + 16, 9, "#303c62");
    } else if (obstacle.kind === 1) {
      pixelRect(x, y, 8, obstacle.h, "#c7d6eb"); pixelRect(x + obstacle.w - 8, y, 8, obstacle.h, "#c7d6eb"); pixelRect(x, y + 5, obstacle.w, 10, "#ff2c91");
    } else {
      pixelRect(x, y + 12, obstacle.w, obstacle.h - 12, "#354159"); pixelRect(x + 6, y, obstacle.w - 12, 17, "#60708c"); pixelRect(x + 8, FLOOR - 7, 8, 7, "#020615"); pixelRect(x + obstacle.w - 16, FLOOR - 7, 8, 7, "#020615");
    }
  }

  function drawStation(station, t) {
    if (station.level !== currentLevel) return;
    const x = worldToScreen(station.x); if (x < -90 || x > canvas.width + 70) return;
    const active = !station.done; const color = station.done ? "#59ec7d" : "#45e7ff";
    pixelRect(x, station.y + 38, 64, 33, "#172352"); pixelRect(x + 7, station.y + 45, 50, 18, "#263e83");
    pixelRect(x + 7, station.y, 8, 45, "#7789b5"); pixelRect(x + 49, station.y, 8, 45, "#7789b5"); pixelRect(x + 8, station.y, 48, 9, color);
    ctx.fillStyle = color; ctx.font = "bold 16px monospace"; ctx.textAlign = "center"; ctx.fillText(station.done ? "✓" : String(stations.filter(item => item.level === currentLevel).indexOf(station) + 1), x + 32, station.y + 31);
    if (active && Math.abs(station.x - player.x) < 105) {
      const bob = Math.sin(t * .006) * 4; pixelRect(x + 10, station.y - 39 + bob, 45, 26, "#071232");
      ctx.strokeStyle = "#45e7ff"; ctx.lineWidth = 2; ctx.strokeRect(x + 10, station.y - 39 + bob, 45, 26);
      ctx.fillStyle = "#fff"; ctx.font = "bold 13px monospace"; ctx.fillText("E", x + 33, station.y - 21 + bob);
    }
  }

  function drawExit(t) {
    const isFinal = currentLevel === LEVEL_COUNT - 1;
    const endX = (currentLevel + 1) * LEVEL_LENGTH - 125;
    const x = worldToScreen(endX); if (x < -120 || x > canvas.width + 120) return;
    pixelRect(x, 128, 13, FLOOR - 128, "#fff9dc"); pixelRect(x + 75, 128, 13, FLOOR - 128, "#fff9dc");
    pixelRect(x - 6, 118, 101, 48, isFinal ? "#ff2c91" : levels[currentLevel].tint); pixelRect(x, 124, 89, 36, "#071232");
    ctx.fillStyle = "#ffd62e"; ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
    ctx.fillText(isFinal ? "GRAN" : "SALIDA", x + 44, 140); ctx.fillText(isFinal ? "META" : `NIVEL ${currentLevel + 1}`, x + 44, 156);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) pixelRect(x + 14 + col * 16, 178 + row * 16, 16, 16, (row + col) % 2 ? "#fff9dc" : "#071232");
    ctx.globalAlpha = .5 + Math.sin(t * .008) * .2; pixelRect(x - 10, FLOOR - 8, 110, 8, "#ffd62e"); ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const sx = (() => {
      if (state === "won") return 6;
      if (player.energy < 20 && Math.abs(player.vx) < .5) return 7;
      if (!player.onGround) return 3;
      if (Math.abs(player.vx) > .8) return 1 + (Math.floor(player.anim) % 2);
      return 0;
    })();
    const dw = 132, dh = 158;
    const screenX = Math.round(player.x - cameraX - 36); const drawY = Math.round(player.y - 48);
    if (player.invuln > 0 && Math.floor(player.invuln / 5) % 2) return;
    ctx.save();
    if (player.face < 0) { ctx.translate(screenX + dw, 0); ctx.scale(-1, 1); }
    const dx = player.face < 0 ? 0 : screenX;
    if (sprite.complete && sprite.naturalWidth) {
      const sw = sprite.naturalWidth / 8;
      ctx.drawImage(sprite, sx * sw, 0, sw, sprite.naturalHeight, dx, drawY, dw, dh);
    } else { pixelRect(dx + 38, drawY + 20, 52, 130, "#ff2c91"); }
    ctx.restore();
  }

  function draw(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height); drawBackground();
    platforms.forEach(drawPlatform); foods.forEach(food => drawFood(food, t)); obstacles.forEach(drawObstacle); stations.forEach(station => drawStation(station, t)); drawExit(t); drawPlayer();
    if (state === "playing") {
      const station = stations.find(item => !item.done && item.level === currentLevel && Math.abs(item.x - player.x) < 105);
      if (station) {
        ctx.fillStyle = "#071232e8"; ctx.fillRect(285, 482, 390, 38); ctx.strokeStyle = "#45e7ff"; ctx.strokeRect(285, 482, 390, 38);
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 13px monospace"; ctx.fillText("E  ENTRENAR · " + station.type.name, 480, 507);
      }
    }
  }

  function loop(now) { const dt = Math.min(34, now - last || 16); last = now; update(dt); draw(now); requestAnimationFrame(loop); }
  function pause() { if (state === "playing") { state = "paused"; showScreen("pauseScreen"); } }
  function resume() { if (state === "paused") { state = "playing"; hideScreens(); } }

  document.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
    keys[event.code] = true;
    if ((event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") && !event.repeat) jump();
    if (event.code === "KeyE" && !event.repeat) tryAction();
    if ((event.code === "Escape" || event.code === "KeyP") && !event.repeat) state === "playing" ? pause() : resume();
  });
  document.addEventListener("keyup", event => keys[event.code] = false);
  window.addEventListener("blur", () => { if (state === "playing") pause(); });

  document.querySelectorAll("[data-control]").forEach(button => {
    const control = button.dataset.control;
    const down = event => { event.preventDefault(); if (control === "left") keys.touchLeft = true; if (control === "right") keys.touchRight = true; if (control === "jump") jump(); if (control === "action") tryAction(); };
    const up = event => { event.preventDefault(); if (control === "left") keys.touchLeft = false; if (control === "right") keys.touchRight = false; };
    button.addEventListener("pointerdown", down); button.addEventListener("pointerup", up); button.addEventListener("pointercancel", up); button.addEventListener("pointerleave", up);
  });

  $("#startBtn").addEventListener("click", startGame);
  $("#retryBtn").addEventListener("click", startGame);
  $("#playAgainBtn").addEventListener("click", startGame);
  $("#restartPauseBtn").addEventListener("click", startGame);
  $("#resumeBtn").addEventListener("click", resume);
  $("#nextLevelBtn").addEventListener("click", beginNextLevel);
  $("#pauseBtn").addEventListener("click", pause);
  $("#repButton").addEventListener("click", registerRep);
  $("#fullscreenBtn").addEventListener("click", () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
  $("#helpBtn").addEventListener("click", () => { const wasPlaying = state === "playing"; if (wasPlaying) state = "paused"; $("#helpScreen").dataset.returnGame = wasPlaying ? "1" : "0"; showScreen("helpScreen"); });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => { const target = $("#" + button.dataset.close); const returns = target.dataset.returnGame === "1"; if (returns) { state = "playing"; hideScreens(); } else { showScreen("startScreen"); state = "menu"; } }));
  $("#soundBtn").addEventListener("click", event => { soundOn = !soundOn; event.currentTarget.textContent = "SONIDO: " + (soundOn ? "ON" : "OFF"); if (soundOn) beep(640, .08); });

  updateHud(true); requestAnimationFrame(loop);
})();
