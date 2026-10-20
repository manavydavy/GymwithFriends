// Gym with Friends: sound effects and music (Web Audio). Every sound is a small mp3 in sfx/,
// made by tools/make_sounds.py. Nothing plays until the first tap or key press (browser rule).
(function (out) {
  const NAMES = ['clank1', 'clank2', 'clank3', 'perfect', 'miss', 'whoosh', 'shove', 'whistle', 'buzzer', 'bell', 'tick', 'go', 'power', 'coin',
    'jingle', 'gold', 'fanfare', 'cheer', 'claps', 'splash1', 'splash2', 'splash3', 'wipe', 'towel', 'nick', 'ouch', 'gassed', 'sprint', 'step',
    'ui_click', 'ui_select', 'ask', 'join', 'error'];
  // per-sound level so they sit together (the files are all normalised to the same peak)
  const LEVEL = { go: 0.45, nick: 0.45, buzzer: 0.4, whistle: 0.55, gassed: 0.55, coin: 0.5, ask: 0.6, tick: 0.55, ui_click: 0.6, ui_select: 0.5, join: 0.6,
    error: 0.6, step: 0.6, sprint: 0.6, power: 0.8, cheer: 1, claps: 1, fanfare: 0.9, bell: 0.75, splash1: 0.9, splash2: 0.9, splash3: 0.9, miss: 0.7 };
  let ctx = null, master, sfxBus, musicBus, musicLP, buffers = {}, loopLen = 0, music = null, musicWant = false, playing = {};
  // 0 = everything on, 1 = sound effects only (music off), 2 = muted
  let mode = 0;
  try { mode = +(localStorage.getItem('gc_snd') || 0) || 0; } catch (e) {}

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    // a gentle limiter so a pile-up of sounds never crackles
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 18000;
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicLP.connect(musicBus); musicBus.connect(comp);
    comp.connect(master);
    applyMode();
    fetch('sfx/music.json').then(r => r.json()).then(j => { loopLen = j.loop; }).catch(() => {});
    NAMES.concat(['music']).forEach(n => fetch('sfx/' + n + '.mp3').then(r => r.arrayBuffer()).then(a => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej)))
      .then(b => { buffers[n] = b; if (n === 'music' && musicWant) startMusic(); }).catch(() => {}));
  }
  function applyMode() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(mode === 2 ? 0 : 0.9, t, 0.05);
    if (musicBus) musicBus.gain.setTargetAtTime(mode === 0 && musicWant ? 0.32 : 0, t, 0.3);
  }
  function startMusic() {
    if (music || !buffers.music) return;
    music = ctx.createBufferSource(); music.buffer = buffers.music; music.loop = true;
    if (loopLen > 0 && loopLen < buffers.music.duration) { music.loopStart = 0; music.loopEnd = loopLen; }
    music.connect(musicLP); music.start();
  }
  // name may end without a number to pick a random variant (clank -> clank1..3)
  function pick(name) {
    if (buffers[name]) return name;
    const vs = NAMES.filter(n => n.replace(/\d+$/, '') === name && buffers[n]);
    return vs.length ? vs[Math.floor(Math.random() * vs.length)] : null;
  }
  function play(name, o) {
    if (!ctx || mode === 2) return;
    o = o || {};
    const n = pick(name); if (!n) return;
    const base = n.replace(/\d+$/, '');
    // no more than 4 of the same sound at once
    const now = ctx.currentTime; playing[base] = (playing[base] || []).filter(e => e > now);
    if (playing[base].length >= 4) return;
    const vol = (o.vol == null ? 1 : o.vol) * (LEVEL[n] || LEVEL[base] || 1);
    if (vol < 0.02) return;
    const src = ctx.createBufferSource(); src.buffer = buffers[n];
    src.playbackRate.value = (o.rate || 1) * (1 + (o.vary == null ? 0.04 : o.vary) * (Math.random() * 2 - 1));
    const g = ctx.createGain(); g.gain.value = vol;
    let node = src.connect(g);
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node = node.connect(p); }
    node.connect(sfxBus);
    const at = now + (o.delay || 0);
    src.start(at);
    playing[base].push(at + buffers[n].duration / src.playbackRate.value);
  }
  // music: on/off, muffled (lobby: like it's coming from the next room), and a little faster near the end
  function setMusic(on, opts) {
    musicWant = on; opts = opts || {};
    if (!ctx) return;
    if (on) startMusic();
    const t = ctx.currentTime;
    musicLP.frequency.setTargetAtTime(opts.muffled ? 700 : 18000, t, 0.4);
    if (music) music.playbackRate.setTargetAtTime(opts.fast ? 1.07 : 1, t, 0.5);
    musicBus.gain.setTargetAtTime(mode === 0 && on ? (opts.duck ? 0.1 : 0.32) : 0, t, opts.duck ? 0.1 : 0.4);
  }
  function cycle() { mode = (mode + 1) % 3; try { localStorage.setItem('gc_snd', mode); } catch (e) {} applyMode(); if (mode !== 2) play('ui_click'); return mode; }
  out.SFX = { unlock, play, setMusic, cycle, mode: () => mode, ready: () => !!ctx, loaded: () => Object.keys(buffers).length };
})(window);
