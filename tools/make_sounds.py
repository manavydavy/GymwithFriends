# Gym with Friends: makes every sound effect and the music loop from scratch (numpy), so the game
# needs no downloaded audio. A few UI blips come from Kenney's CC0 packs (see sfx/CREDITS.txt).
# Run: python3 tools/make_sounds.py [kenney_dir]   -> writes sfx/*.mp3
import os, sys, subprocess, numpy as np
from scipy import signal

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'sfx')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(d * SR)) / SR


def env(d, a=0.005, decay=None, hold=0.0, release=None):
    """attack, optional hold, then exponential decay (decay = time constant) or linear release"""
    x = t(d); e = np.ones_like(x)
    e[x < a] = x[x < a] / a
    after = x >= a + hold
    if decay:
        e[after] = np.exp(-(x[after] - a - hold) / decay)
    if release:
        r = x > d - release
        e[r] *= (d - x[r]) / release
    return e


def noise(d):
    return rng.uniform(-1, 1, int(d * SR))


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def lp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def sweep_bp(x, f0, f1, q=2.0, block=256):
    """band-pass whose centre glides from f0 to f1 (log), filtered block by block"""
    y = np.zeros_like(x); zi = None; n = len(x)
    for s in range(0, n, block):
        fr = f0 * (f1 / f0) ** (s / max(1, n))
        bw = fr / q
        b, a = signal.butter(2, [max(20, fr - bw / 2) / (SR / 2), min(SR / 2 - 200, fr + bw / 2) / (SR / 2)], 'band')
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        y[s:s + block], zi = signal.lfilter(b, a, x[s:s + block], zi=zi)
    return y


def tone(f, d, kind='sine', phase=0.0):
    """f may be a number or an array (instantaneous frequency)"""
    n = int(d * SR)
    fa = np.full(n, float(f)) if np.isscalar(f) else np.asarray(f)[:n]
    ph = 2 * np.pi * np.cumsum(fa) / SR + phase
    if kind == 'sine':
        return np.sin(ph)
    if kind == 'square':
        return np.sign(np.sin(ph)) * 0.7
    if kind == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if kind == 'tri':
        return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1


def mix(*parts, length=None):
    """parts: (signal, start_seconds, gain)"""
    end = max(int(s * SR) + len(x) for x, s, g in parts) if length is None else int(length * SR)
    y = np.zeros(end)
    for x, s, g in parts:
        x = np.array(x, dtype=float); f = min(len(x) // 3, int(0.006 * SR))
        if f > 1: x[-f:] *= np.linspace(1, 0, f)      # no clicks where a part stops
        i = int(s * SR); j = min(end, i + len(x))
        y[i:j] += x[:j - i] * g
    return y


def reverb(x, d=1.2, wet=0.25, damp=3500):
    """cheap room: decaying filtered noise impulse response"""
    ir = noise(d) * np.exp(-t(d) / (d / 5)); ir = lp(ir, damp); ir[0] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    w = signal.fftconvolve(x, ir)[:len(x) + int(d * SR)]
    dry = np.concatenate([x, np.zeros(len(w) - len(x))])
    return dry + w * wet


def note(n):
    """'A4' style -> Hz"""
    names = {'C': -9, 'C#': -8, 'Db': -8, 'D': -7, 'D#': -6, 'Eb': -6, 'E': -5, 'F': -4, 'F#': -3, 'Gb': -3, 'G': -2, 'G#': -1, 'Ab': -1, 'A': 0, 'A#': 1, 'Bb': 1, 'B': 2}
    k, o = (n[:2], n[2:]) if len(n) > 2 and n[1] in '#b' else (n[:1], n[1:])
    return 440 * 2 ** ((names[k] + (int(o) - 4) * 12) / 12)


def save(name, x, peak=0.89, br='96k'):
    x = np.asarray(x, dtype=float)
    x = x - np.mean(x)
    m = np.max(np.abs(x)) + 1e-9
    x = x / m * peak
    fade = min(len(x) // 4, int(0.01 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    wav = os.path.join(OUT, name + '.wav')
    from scipy.io import wavfile
    wavfile.write(wav, SR, (x * 32767).astype(np.int16))
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', br, mp3], check=True)
    os.remove(wav)
    return mp3


# ---------------- the sounds ----------------

def clank(seed, base):
    """iron plates knocking together: inharmonic partials, short ring, a click on top"""
    r = np.random.default_rng(seed)
    d = 0.7
    parts = [(base, 0.18), (base * 2.43, 0.12), (base * 3.97, 0.09), (base * 5.31, 0.06), (base * 7.2, 0.04), (base * 9.6, 0.03)]
    x = sum(tone(f * (1 + r.uniform(-0.01, 0.01)), d) * np.exp(-t(d) / dk) * (1 / (i + 1)) ** 0.6 for i, (f, dk) in enumerate(parts))
    click = bp(noise(0.03), 1800, 7000) * env(0.03, 0.0005, 0.006)
    thump = tone(np.linspace(140, 70, int(0.12 * SR)), 0.12) * env(0.12, 0.002, 0.03)
    return mix((x, 0, 0.6), (click, 0, 0.9), (thump, 0, 0.5))


def ding():
    d = 1.4; f = 1568
    x = sum(tone(f * m, d) * np.exp(-t(d) / dk) * g for m, dk, g in [(1, 0.6, 1), (2.76, 0.25, 0.45), (5.4, 0.12, 0.25), (8.93, 0.07, 0.12)])
    sparkle = sum(tone(f * 2 * k, 0.25) * env(0.25, 0.002, 0.06) * 0.2 for k in (1, 1.5))
    return reverb(mix((x, 0, 1), (sparkle, 0.04, 0.6)), 0.8, 0.18)


def thunk():
    d = 0.22
    body = tone(np.linspace(150, 60, int(d * SR)), d) * env(d, 0.002, 0.05)
    dull = lp(noise(0.08), 900) * env(0.08, 0.001, 0.02)
    return mix((body, 0, 1), (dull, 0, 0.7))


def whoosh(d=0.38, f0=350, f1=2600, q=1.6):
    x = sweep_bp(noise(d), f0, f1, q)
    e = np.sin(np.pi * np.clip(t(d) / d, 0, 1)) ** 1.6
    return x * e


def thud():
    d = 0.35
    body = tone(np.linspace(95, 45, int(d * SR)), d) * env(d, 0.002, 0.07)
    slap = bp(noise(0.06), 300, 2500) * env(0.06, 0.0005, 0.012)
    return mix((body, 0, 1), (slap, 0, 0.8))


def whistle():
    """referee pea whistle: two blasts, the trill comes from the pea"""
    def blast(d):
        x = t(d)
        f = 2550 + 140 * np.sin(2 * np.pi * 34 * x) + 40 * rng.standard_normal(len(x)).cumsum() / np.sqrt(len(x))
        am = 0.75 + 0.25 * np.sin(2 * np.pi * 34 * x)
        s = tone(f, d) * am + 0.12 * bp(noise(d), 2000, 6000)
        return s * env(d, 0.015, None, release=0.04)
    return reverb(mix((blast(0.16), 0, 1), (blast(0.55), 0.24, 1)), 0.6, 0.12)


def buzzer():
    d = 1.1
    x = sum(tone(f, d, 'saw') for f in (196, 247, 294.5)) / 3
    x = lp(x, 2400) * env(d, 0.01, None, release=0.08)
    return np.tanh(x * 2.5)


def bell():
    """boxing ring bell, struck twice"""
    def strike():
        d = 1.6; f = 740
        return sum(tone(f * m, d) * np.exp(-t(d) / dk) * g for m, dk, g in [(1, 0.7, 1), (2.01, 0.45, 0.6), (2.87, 0.3, 0.4), (4.11, 0.18, 0.25), (5.42, 0.1, 0.15)]) + mix((bp(noise(0.02), 2000, 8000), 0, 0.4), length=d)
    return reverb(mix((strike(), 0, 1), (strike(), 0.28, 0.9)), 1.0, 0.2)


def tick():
    d = 0.09
    return mix((tone(1150, d) * env(d, 0.001, 0.018), 0, 1), (bp(noise(0.01), 3000, 9000), 0, 0.3))


def horn():
    """air horn for GO"""
    d = 0.75
    x = sum(tone(f * (1 + 0.003 * k), d, 'saw') for k, f in enumerate((note('Bb3'), note('D4'), note('F4'), note('Bb4'))))
    x = bp(x, 300, 3500) * env(d, 0.02, None, release=0.12)
    return np.tanh(x * 3) * 0.8


def power_up():
    notes = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6']
    parts = [(tone(note(n), 0.11, 'square') * env(0.11, 0.003, 0.05), i * 0.055, 0.6) for i, n in enumerate(notes)]
    sw = tone(np.geomspace(400, 2400, int(0.4 * SR)), 0.4, 'tri') * env(0.4, 0.01, None, release=0.15)
    return reverb(mix(*parts, (sw, 0, 0.25)), 0.6, 0.15)


def coin():
    a = tone(988, 0.08, 'square') * env(0.08, 0.001, None)
    b = tone(1319, 0.32, 'square') * env(0.32, 0.001, 0.09)
    return mix((a, 0, 0.7), (b, 0.075, 0.7))


def chime_arp(ns, gap=0.09, d=1.2):
    def bellnote(f):
        return sum(tone(f * m, d) * np.exp(-t(d) / dk) * g for m, dk, g in [(1, 0.45, 1), (2.0, 0.25, 0.3), (3.0, 0.12, 0.12)])
    return reverb(mix(*[(bellnote(note(n)), i * gap, 0.8) for i, n in enumerate(ns)]), 1.0, 0.22)


def jingle():
    return chime_arp(['C5', 'E5', 'G5', 'C6'], 0.08, 0.9)


def gold_spawn():
    return chime_arp(['G5', 'B5', 'D6', 'G6', 'B6', 'D7'], 0.06, 1.3)


def brass(f, d):
    x = sum(tone(f * (1 + 0.004 * k), d, 'saw') for k in (-1, 0, 1)) / 3
    # the filter opens with the note's attack, like a brass player blowing harder
    y = np.zeros_like(x); seg = 512; zi = None
    for s in range(0, len(x), seg):
        tt = s / SR
        fc = 900 + 3200 * min(1, tt / 0.06) * np.exp(-tt / 0.6)
        b, a = signal.butter(2, fc / (SR / 2), 'low')
        if zi is None: zi = np.zeros(max(len(a), len(b)) - 1)
        y[s:s + seg], zi = signal.lfilter(b, a, x[s:s + seg], zi=zi)
    return y * env(d, 0.02, None, release=0.08) * (1 + 0.02 * np.sin(2 * np.pi * 5.5 * t(d)))


def timpani(f, d=1.0):
    return tone(np.linspace(f * 1.05, f, int(d * SR)), d) * np.exp(-t(d) / 0.35) + lp(noise(d), 300) * np.exp(-t(d) / 0.05) * 0.6


def fanfare():
    seq = [('G4', 0.0, 0.14), ('C5', 0.15, 0.14), ('E5', 0.3, 0.14), ('G5', 0.45, 0.42), ('E5', 0.9, 0.14), ('G5', 1.05, 1.3)]
    lead = [(brass(note(n), d), s, 0.55) for n, s, d in seq]
    pad = [(brass(note(n), 1.3), 1.05, 0.25) for n in ('C4', 'E4', 'G4')]
    drums = [(timpani(note('C2')), 0.0, 0.7), (timpani(note('G1')), 0.45, 0.6), (timpani(note('C2')), 1.05, 0.9)]
    return reverb(mix(*lead, *pad, *drums), 1.6, 0.25)


def crowd(d=4.0, claps=True):
    """a crowd yelling 'yaaay' (formant-filtered voices) and applause"""
    x = np.zeros(int(d * SR))
    formants = [(730, 1090, 2440), (660, 1720, 2410), (270, 2290, 3010), (570, 840, 2410)]
    for v in range(26):
        st = rng.uniform(0, 0.5); vd = rng.uniform(1.2, d - st)
        f0 = rng.uniform(150, 330)
        n = int(vd * SR)
        pitch = f0 * (1 + 0.25 * np.sin(np.linspace(0, np.pi, n)) ** 2 + 0.02 * np.sin(2 * np.pi * rng.uniform(4, 7) * np.arange(n) / SR))
        src = tone(pitch, vd, 'saw') + 0.3 * noise(vd)
        fm = formants[rng.integers(len(formants))]
        voice = sum(bp(src, f * 0.9, f * 1.1) * g for f, g in zip(fm, (1, 0.6, 0.3)))
        e = np.sin(np.pi * np.linspace(0, 1, n)) ** 0.7
        i = int(st * SR); x[i:i + n] += voice * e * rng.uniform(0.4, 1)
    if claps:
        for _ in range(int(d * 45)):
            s = rng.uniform(0, d - 0.05)
            c = bp(noise(0.04), rng.uniform(900, 1500), rng.uniform(2500, 5000)) * env(0.04, 0.0008, 0.008)
            i = int(s * SR); x[i:i + len(c)] += c * rng.uniform(0.6, 1.6) * min(1, (d - s) / 1.0)
    return reverb(x * env(d, 0.15, None, release=1.2), 1.4, 0.3)


def claps(d=1.8):
    x = np.zeros(int(d * SR))
    for _ in range(int(d * 30)):
        s = rng.uniform(0, d - 0.05)
        c = bp(noise(0.04), rng.uniform(900, 1500), rng.uniform(2500, 5000)) * env(0.04, 0.0008, 0.008)
        i = int(s * SR); x[i:i + len(c)] += c * rng.uniform(0.6, 1.4)
    return reverb(x * env(d, 0.05, None, release=0.7), 0.9, 0.25)


def splash(seed):
    r = np.random.default_rng(seed)
    d = 0.6
    spray = bp(noise(d), 1200, 7000) * np.exp(-t(d) / 0.09) * (1 + 0.5 * r.random())
    parts = [(spray, 0, 0.8)]
    for _ in range(9):
        bd = r.uniform(0.03, 0.07); f0 = r.uniform(500, 1100)
        bub = tone(np.linspace(f0, f0 * r.uniform(1.6, 2.4), int(bd * SR)), bd) * env(bd, 0.002, bd / 3)
        parts.append((bub, r.uniform(0.0, 0.35), r.uniform(0.25, 0.55)))
    drip = sum(tone(np.linspace(f, f * 1.8, int(0.05 * SR)), 0.05) * env(0.05, 0.001, 0.015) for f in (900,))
    parts.append((drip, r.uniform(0.35, 0.5), 0.4))
    return reverb(mix(*parts), 0.5, 0.15)


def wipe():
    """towel rubbing the bench: three strokes of filtered noise"""
    d = 0.75; x = bp(noise(d), 800, 5000)
    strokes = np.zeros_like(x); tt = t(d)
    for s, l in ((0.0, 0.2), (0.24, 0.2), (0.48, 0.25)):
        m = (tt >= s) & (tt < s + l)
        strokes[m] = np.sin(np.pi * (tt[m] - s) / l) ** 1.3
    return x * strokes * (0.8 + 0.2 * np.sin(2 * np.pi * 37 * tt))


def flap():
    """towel landing on a machine"""
    w = whoosh(0.25, 600, 1800, 1.2)
    slap = lp(noise(0.08), 2500) * env(0.08, 0.001, 0.02)
    return mix((w, 0, 0.6), (slap, 0.2, 1))


def slide_down():
    d = 0.42
    return tone(np.geomspace(1500, 420, int(d * SR)), d) * env(d, 0.01, None, release=0.08) * (1 + 0.1 * np.sin(2 * np.pi * 9 * t(d)))


def boing():
    d = 0.6
    f = 180 + 260 * np.exp(-t(d) / 0.08) * (1 + 0.3 * np.sin(2 * np.pi * 16 * t(d)))
    return tone(f, d, 'tri') * env(d, 0.003, 0.18)


def sad_trombone():
    seq = [('Eb4', 0.0, 0.42), ('D4', 0.45, 0.42), ('Db4', 0.9, 0.42), ('C4', 1.35, 1.2)]
    parts = []
    for i, (n, s, d) in enumerate(seq):
        f = note(n) * (1 + (0.035 * np.sin(2 * np.pi * 6 * t(d)) * np.clip((t(d) - 0.2) / 0.3, 0, 1) if i == 3 else 0))
        x = sum(tone(f * (1 + 0.003 * k), d, 'saw') for k in (-1, 1)) / 2
        x = bp(x, 200, 1800) * env(d, 0.03, None, release=0.1)
        parts.append((np.tanh(x * 2), s, 0.7))
    return reverb(mix(*parts), 0.8, 0.15)


def ouch():
    return mix((boing(), 0, 0.7), (thunk(), 0, 0.6))


def sprint():
    return whoosh(0.3, 200, 1200, 1.4)


def step_on():
    d = 0.18
    return mix((tone(np.linspace(220, 160, int(d * SR)), d) * env(d, 0.002, 0.04), 0, 1), (bp(noise(0.05), 400, 3000) * env(0.05, 0.001, 0.01), 0, 0.6))


def flush():
    """toilet flush: a rushing swirl that rises then drains away with a gurgle"""
    d = 2.6; x = noise(d)
    rush = sweep_bp(x, 500, 1600, 1.1) * np.minimum(1, t(d) / 0.15) * np.exp(-np.maximum(0, t(d) - 0.9) / 0.6)
    swirl = rush * (1 + 0.35 * np.sin(2 * np.pi * 5 * t(d)))
    low = lp(noise(d), 400) * np.exp(-t(d) / 0.9) * 0.8
    parts = [(swirl, 0, 1), (low, 0, 1)]
    for k in range(10):
        bd = 0.05; f0 = rng.uniform(250, 500)
        parts.append((tone(np.linspace(f0, f0 * 1.8, int(bd * SR)), bd) * env(bd, 0.002, 0.02), 1.4 + k * 0.09 + rng.uniform(0, 0.05), 0.35))
    click = bp(noise(0.03), 800, 3000) * env(0.03, 0.001, 0.008)
    return reverb(mix((click, 0, 0.6), *[(a, s0 + 0.05, g) for a, s0, g in parts]), 0.7, 0.2)


def tinkle():
    """a short trickle of water into water"""
    d = 0.7; x = bp(noise(d), 1500, 6000) * (0.6 + 0.4 * np.sin(2 * np.pi * 13 * t(d)) ** 2)
    parts = [(x * env(d, 0.05, None, release=0.2), 0, 0.45)]
    for k in range(8):
        bd = 0.03; f0 = rng.uniform(900, 1800)
        parts.append((tone(np.linspace(f0, f0 * 1.5, int(bd * SR)), bd) * env(bd, 0.001, 0.01), rng.uniform(0, 0.6), 0.25))
    return mix(*parts)


# ---------------- music: an 8-bar workout loop ----------------

def music():
    bpm = 124; beat = 60 / bpm; bars = 8; L = bars * 4 * beat
    extra = 1.0                     # render past the loop point so any decoder offset still loops cleanly
    total = L + extra
    y = np.zeros(int(total * SR) + SR)

    def put(x, s, g):
        for rep in (0, L):          # the same events again one loop later fill the extra second
            st = s + rep
            if st >= total: continue
            i = int(st * SR); j = min(len(y), i + len(x)); y[i:j] += x[:j - i] * g

    def kick():
        d = 0.4
        return mix((tone(55 + 120 * np.exp(-t(d) / 0.03), d) * env(d, 0.001, 0.12), 0, 1), (bp(noise(0.01), 1000, 5000), 0, 0.3))

    def snare():
        d = 0.25
        return bp(noise(d), 1200, 7000) * env(d, 0.001, 0.07) + tone(190, d) * env(d, 0.001, 0.05) * 0.5

    def hat(open_=False):
        d = 0.25 if open_ else 0.05
        return hp(noise(d), 7000) * env(d, 0.001, 0.07 if open_ else 0.012)

    def bass(f, d):
        x = tone(f, d, 'saw') + 0.5 * tone(f / 2, d, 'square')
        return lp(x, 650) * env(d, 0.005, None, release=0.04)

    def stab(fs, d):
        x = sum(tone(f * (1 + 0.006 * k), d, 'saw') for f in fs for k in (-1, 1)) / (2 * len(fs))
        return lp(x, 2600) * env(d, 0.004, 0.09)

    prog = [('A1', ['A3', 'C4', 'E4']), ('F1', ['F3', 'A3', 'C4']), ('C2', ['G3', 'C4', 'E4']), ('G1', ['G3', 'B3', 'D4'])]
    for bar in range(bars):
        root, chord = prog[bar % 4]
        b0 = bar * 4 * beat
        for b in range(4):
            put(kick(), b0 + b * beat, 0.95)
            if b in (1, 3): put(snare(), b0 + b * beat, 0.45)
            put(hat(), b0 + b * beat + beat / 2, 0.25)
            put(hat(), b0 + b * beat, 0.12)
            if b == 3 and bar % 2 == 1: put(hat(True), b0 + b * beat + beat / 2, 0.18)
        # driving eighth-note bass, octave jump on the offbeats
        for e in range(8):
            f = note(root) * (2 if e % 2 else 1)
            put(bass(f, beat / 2 * 0.9), b0 + e * beat / 2, 0.42)
        # chord stabs on the offbeats
        for b in range(4):
            put(stab([note(n) for n in chord], beat * 0.4), b0 + b * beat + beat / 2, 0.22)
        # little lead hook every other bar
        if bar % 2 == 1:
            for k, n in enumerate(['E5', 'G5', 'A5', 'G5']):
                d = beat / 2
                put(lp(tone(note(n), d, 'square'), 3000) * env(d, 0.004, 0.12), b0 + 2 * beat + k * beat / 2, 0.12)
    y = y[:int(total * SR)]
    # gentle glue: soft clip
    y = np.tanh(y * 1.2) / np.tanh(1.2)
    return y, L


def kenney(src, name, dst):
    """copy a CC0 Kenney sample as mp3"""
    p = None
    for root, _, files in os.walk(src):
        if name in files: p = os.path.join(root, name)
    if not p:
        print('missing', name); return
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p, '-ac', '1', '-b:a', '96k', os.path.join(OUT, dst + '.mp3')], check=True)


if __name__ == '__main__':
    for i, b in enumerate((300, 340, 265)):
        save('clank%d' % (i + 1), clank(i + 1, b))
    save('perfect', ding())
    save('miss', thunk())
    save('whoosh', whoosh())
    save('shove', mix((whoosh(0.3, 300, 2000), 0, 0.6), (thud(), 0.13, 1)))
    save('whistle', whistle())
    save('buzzer', buzzer())
    save('bell', bell())
    save('tick', tick())
    save('go', horn())
    save('power', power_up())
    save('coin', coin())
    save('jingle', jingle())
    save('gold', gold_spawn())
    save('fanfare', fanfare())
    save('cheer', crowd(4.0))
    save('claps', claps())
    for i in range(3):
        save('splash%d' % (i + 1), splash(10 + i))
    save('wipe', wipe())
    save('towel', flap())
    save('nick', slide_down())
    save('ouch', ouch())
    save('gassed', sad_trombone())
    save('sprint', sprint())
    save('step', step_on())
    save('flush', flush())
    save('tinkle', tinkle())
    m, L = music()
    save('music', m, peak=0.8, br='112k')
    with open(os.path.join(OUT, 'music.json'), 'w') as f:
        f.write('{"loop": %.6f}' % L)
    if len(sys.argv) > 1:
        kd = sys.argv[1]
        kenney(kd, 'click_002.wav', 'ui_click')
        kenney(kd, 'select_006.wav', 'ui_select')
        kenney(kd, 'question_002.wav', 'ask')
        kenney(kd, 'confirmation_002.wav', 'join')
        kenney(kd, 'error_004.wav', 'error')
    print(sorted(os.listdir(OUT)))
