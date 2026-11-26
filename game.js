(() => {
  const W = 360;
  const H = 640;
  const PADDLE_W = 76;
  const PADDLE_H = 12;
  const PLAYER_Y = H - 56;
  const CPU_Y = 44;
  const BALL_R = 7;
  const WIN_SCORE = 7;
  const START_SPEED = 330;
  const SPEED_STEP = 22;
  const MAX_SPEED = 760;
  const STEP = 1 / 120;
  const SERVE_DELAY = 0.9;
  const CPU_BASE_SPEED = 270;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const state = {
    mode: "title",
    player: { x: W / 2, score: 0 },
    cpu: { x: W / 2, score: 0, targetOffset: 0 },
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: START_SPEED },
    serveTimer: 0,
    serveDir: 1,
    flash: 0,
    trail: [],
  };
  window.__pong = state;

  let scale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    scale = Math.min(availW / W, availH / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  resize();

  let audio = null;
  function ensureAudio() {
    if (audio) {
      if (audio.state === "suspended") audio.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audio = new AC();
  }
  function beep(freq, dur = 0.07, type = "square", gain = 0.08) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function clampPaddle(x) {
    return Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x));
  }

  function resetBall(dir) {
    const b = state.ball;
    b.x = W / 2;
    b.y = H / 2;
    b.vx = 0;
    b.vy = 0;
    b.speed = START_SPEED;
    state.serveDir = dir;
    state.serveTimer = SERVE_DELAY;
    state.trail.length = 0;
  }

  function launchBall() {
    const b = state.ball;
    const angle = (Math.random() * 2 - 1) * (Math.PI / 6);
    b.vx = Math.sin(angle) * b.speed;
    b.vy = Math.cos(angle) * b.speed * state.serveDir;
  }

  function startGame() {
    state.player.score = 0;
    state.cpu.score = 0;
    state.player.x = W / 2;
    state.cpu.x = W / 2;
    state.cpu.targetOffset = 0;
    state.mode = "playing";
    resetBall(Math.random() < 0.5 ? 1 : -1);
  }

  function bounceOffPaddle(paddleX, goingUp) {
    const b = state.ball;
    const hit = Math.max(-1, Math.min(1, (b.x - paddleX) / (PADDLE_W / 2)));
    const angle = hit * (Math.PI / 3);
    b.speed = Math.min(MAX_SPEED, b.speed + SPEED_STEP);
    b.vx = Math.sin(angle) * b.speed;
    const vy = Math.cos(angle) * b.speed;
    b.vy = goingUp ? -vy : vy;
    state.flash = 1;
  }

  function score(who) {
    state[who].score += 1;
    beep(who === "player" ? 660 : 180, 0.25, "triangle", 0.12);
    if (state[who].score >= WIN_SCORE) {
      state.mode = "gameover";
      state.winner = who;
      state.ball.vx = 0;
      state.ball.vy = 0;
      beep(who === "player" ? 880 : 140, 0.5, "triangle", 0.14);
      return;
    }
    resetBall(who === "player" ? 1 : -1);
  }

  function updateCpu(dt) {
    const b = state.ball;
    const cpu = state.cpu;
    let target = W / 2;
    if (b.vy < 0) {
      let x = b.x + b.vx * ((CPU_Y - b.y) / b.vy);
      const period = 2 * (W - 2 * BALL_R);
      let m = (x - BALL_R) % period;
      if (m < 0) m += period;
      x = BALL_R + (m > period / 2 ? period - m : m);
      target = x + cpu.targetOffset;
    }
    const lead = Math.max(0, state.player.score - state.cpu.score);
    const maxMove = (CPU_BASE_SPEED + lead * 12) * dt;
    const diff = target - cpu.x;
    cpu.x = clampPaddle(cpu.x + Math.max(-maxMove, Math.min(maxMove, diff)));
  }

  function step(dt) {
    state.flash = Math.max(0, state.flash - dt * 4);
    if (state.mode !== "playing") return;
    const b = state.ball;

    updateCpu(dt);

    if (state.serveTimer > 0) {
      state.serveTimer -= dt;
      if (state.serveTimer <= 0) launchBall();
      return;
    }

    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x < BALL_R) {
      b.x = BALL_R;
      b.vx = Math.abs(b.vx);
      beep(300, 0.04, "square", 0.05);
    } else if (b.x > W - BALL_R) {
      b.x = W - BALL_R;
      b.vx = -Math.abs(b.vx);
      beep(300, 0.04, "square", 0.05);
    }

    const half = PADDLE_W / 2 + BALL_R * 0.6;

    if (b.vy > 0) {
      const top = PLAYER_Y - PADDLE_H / 2;
      if (prevY + BALL_R <= top + 1 && b.y + BALL_R >= top && Math.abs(b.x - state.player.x) <= half) {
        b.y = top - BALL_R;
        bounceOffPaddle(state.player.x, true);
        beep(520);
      }
    } else if (b.vy < 0) {
      const bottom = CPU_Y + PADDLE_H / 2;
      if (prevY - BALL_R >= bottom - 1 && b.y - BALL_R <= bottom && Math.abs(b.x - state.cpu.x) <= half) {
        b.y = bottom + BALL_R;
        bounceOffPaddle(state.cpu.x, false);
        const fast = (state.ball.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
        state.cpu.targetOffset = (Math.random() * 2 - 1) * PADDLE_W * (0.25 + 0.5 * fast);
        beep(400);
      }
    }

    state.trail.push({ x: b.x, y: b.y });
    if (state.trail.length > 10) state.trail.shift();

    if (b.y > H + BALL_R * 2) score("cpu");
    else if (b.y < -BALL_R * 2) score("player");
  }

  state.step = step;

  let dragging = false;
  let lastX = 0;

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ensureAudio();
    if (state.mode === "title") {
      startGame();
    } else if (state.mode === "gameover" && state.gameoverAge > 0.6) {
      startGame();
    }
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const dx = (e.clientX - lastX) / scale;
    lastX = e.clientX;
    if (state.mode === "playing") {
      state.player.x = clampPaddle(state.player.x + dx * 1.15);
    }
  });

  const endDrag = (e) => {
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") state.player.x = clampPaddle(state.player.x - 28);
    if (e.key === "ArrowRight") state.player.x = clampPaddle(state.player.x + 28);
    if ((e.key === " " || e.key === "Enter") && state.mode !== "playing") {
      ensureAudio();
      startGame();
    }
  });

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPaddle(x, y, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    roundRect(x - PADDLE_W / 2, y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6);
    ctx.fill();
    ctx.restore();
  }

  function centerText(text, y, size, color, weight = "700") {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, y);
  }

  function render() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b0f1a");
    bg.addColorStop(1, "#141b30");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(14, H / 2);
    ctx.lineTo(W - 14, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    centerText(String(state.cpu.score), H / 2 - 70, 84, "rgba(255,255,255,0.1)", "800");
    centerText(String(state.player.score), H / 2 + 70, 84, "rgba(255,255,255,0.1)", "800");

    drawPaddle(state.cpu.x, CPU_Y, "#ff5c7a");
    drawPaddle(state.player.x, PLAYER_Y, "#4de2c5");

    const b = state.ball;
    state.trail.forEach((p, i) => {
      ctx.fillStyle = `rgba(255,255,255,${(i / state.trail.length) * 0.22})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_R * (0.4 + (i / state.trail.length) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10 + state.flash * 18;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state.mode === "title") {
      ctx.fillStyle = "rgba(11,15,26,0.72)";
      ctx.fillRect(0, 0, W, H);
      centerText("PONG", H / 2 - 70, 64, "#ffffff", "800");
      centerText("Drag anywhere to move", H / 2 - 8, 17, "rgba(255,255,255,0.7)", "500");
      centerText(`First to ${WIN_SCORE} wins`, H / 2 + 18, 17, "rgba(255,255,255,0.7)", "500");
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 280);
      centerText("Tap to start", H / 2 + 80, 24, `rgba(77,226,197,${pulse})`, "700");
    } else if (state.mode === "gameover") {
      ctx.fillStyle = "rgba(11,15,26,0.78)";
      ctx.fillRect(0, 0, W, H);
      const won = state.winner === "player";
      centerText(won ? "YOU WIN" : "CPU WINS", H / 2 - 50, 46, won ? "#4de2c5" : "#ff5c7a", "800");
      centerText(`${state.player.score} - ${state.cpu.score}`, H / 2 + 10, 30, "#ffffff", "700");
      if (state.gameoverAge > 0.6) {
        const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 280);
        centerText("Tap to play again", H / 2 + 74, 22, `rgba(255,255,255,${pulse})`, "600");
      }
    }
  }

  state.gameoverAge = 0;
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += delta;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    state.gameoverAge = state.mode === "gameover" ? state.gameoverAge + delta : 0;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
