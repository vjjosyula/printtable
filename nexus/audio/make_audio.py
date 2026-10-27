"""Procedural music bed + sound accents + narration mix for the NEXUS animation (90.0 s).

Everything is synthesised here (no samples, no licensing). Narration WAVs come from Kokoro TTS
(one file per line, see gen_narration.py). Output: 48 kHz stereo WAV.
Usage: python make_audio.py <narration_dir> <out.wav>
"""
import sys
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 48000
DUR = 90.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    e = np.ones(n) * s
    e[:a] = np.linspace(0, 1, a, endpoint=False) if a else e[:a]
    e[a:a + d] = np.linspace(1, s, d, endpoint=False)[: max(0, min(d, n - a))]
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e

def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)

def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)

L = np.zeros(N)
R = np.zeros(N)

def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    gl = np.cos((pan + 1) * np.pi / 4) * gain
    gr = np.sin((pan + 1) * np.pi / 4) * gain
    L[i:i + len(sig)] += sig * gl
    R[i:i + len(sig)] += sig * gr

# ---------------------------------------------------------------- harmony
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT  # 2.5 s
# Fmaj9 - Am7 - Dm9 - Bbmaj7(#11) ... warm, hopeful, slightly scientific
CHORDS = [
    [53, 60, 64, 67, 69],   # Fmaj9 (F A C E G voiced)
    [57, 60, 64, 67, 71],   # Am7(add9)
    [50, 57, 60, 64, 65],   # Dm9
    [46, 53, 57, 62, 64],   # Bbmaj7#11-ish
]
def chord_at(time):
    return CHORDS[int(time // (2 * BAR)) % 4]

# ---------------------------------------------------------------- pad (detuned saws, slow filter)
def saw(f, n, phase=0.0):
    x = (np.arange(n) / SR * f + phase) % 1.0
    return 2 * x - 1

pad = np.zeros(N)
seg = 2 * BAR
k = 0
while k * seg < DUR:
    st = k * seg
    n = int(min(seg + 1.2, DUR - st) * SR)
    ch = chord_at(st + 0.01)
    s = np.zeros(n)
    for m in ch:
        for det in (-0.07, 0.0, 0.08):
            s += saw(midi(m + det * 0.1) * (1 + det * 0.004), n, rng.random())
    s = lp(s, 900) * env_adsr(n, 1.0, 0.5, 0.85, 1.2) / (len(ch) * 3)
    add(s, st, 0.32, -0.25)
    add(s, st + 0.012, 0.32, 0.25)
    k += 1

# ---------------------------------------------------------------- pluck arpeggio (soft marimba-like)
def pluck(f, dur=0.9, bright=1.0):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt) + 0.35 * bright * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 9) + 0.12 * bright * np.sin(2 * np.pi * 4.01 * f * tt) * np.exp(-tt * 16)
    return s * np.exp(-tt * 4.5) * np.minimum(1, tt * 400)

pattern = [0, 2, 4, 3, 1, 4, 2, 3]
step = BEAT / 2
time = 0.0
i = 0
while time < 86.0:
    # sections: intro, histones, marks, pull-back lift, the gap (muted once blended), bright resolve
    if time < 2.0:
        dens, gain, br = 2, 0.0, 0.6
    elif time < 10:
        dens, gain, br = 2, 0.11, 0.85  # brain tissue
    elif time < 14.5:
        dens, gain, br = 2, 0.07, 0.4   # signals diluted
    elif time < 17.6:
        dens, gain, br = 2, 0.10, 0.8   # dive into the nucleus
    elif time < 40:
        dens, gain, br = 1, 0.13, 0.95  # histones and marks
    elif time < 50:
        dens, gain, br = 1, 0.15, 1.1   # HisTLAND
    elif time < 56:
        dens, gain, br = 2, 0.11, 0.85  # methylation
    elif time < 66:
        dens, gain, br = 1, 0.15, 1.1   # MeTLAND
    else:
        dens, gain, br = 1, 0.16, 1.15  # kits, two layers
    if i % dens == 0 and gain > 0:
        ch = chord_at(time)
        m = ch[pattern[i % 8] % len(ch)] + 12
        add(pluck(midi(m), bright=br), time, gain, 0.5 * np.sin(i * 0.9))
    time += step
    i += 1

# ---------------------------------------------------------------- bass (soft sine, on bars)
b_time = 10.0
while b_time < 85.0:
    root = chord_at(b_time)[0] - 12
    n = int(BAR * SR)
    tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * midi(root) * tt) * np.exp(-tt * 1.2) * np.minimum(1, tt * 60)
    g = 0.22 if not (10.2 <= b_time < 14.5) else 0.11
    add(s, b_time, g, 0)
    b_time += BAR

# ---------------------------------------------------------------- soft pulse (felt kick + shaker) from 6 s
def kick():
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    f = 50 + 70 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)

def shaker():
    n = int(0.09 * SR)
    return hp(rng.standard_normal(n), 6000) * np.exp(-np.arange(n) / SR * 50)

bt = 10.0
j = 0
while bt < 84.5:
    if not (10.2 <= bt < 15.5):
        if j % 2 == 0:
            add(kick(), bt, 0.30, 0)
        add(shaker(), bt + BEAT / 2, 0.035, 0.4 * (-1) ** j)
    bt += BEAT
    j += 1

# ---------------------------------------------------------------- transitions / accents
def riser(dur, f0=300, f1=5000):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 2048
    for b in range(0, n, blk):
        fc = f0 * (f1 / f0) ** (b / n)
        out[b:b + blk] = lp(x[b:b + blk], fc, 2)
    return out * np.linspace(0, 1, n) ** 2

def whoosh(dur=1.6):
    n = int(dur * SR)
    x = lp(rng.standard_normal(n), 1800)
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    return x * e

def pop(f=880):
    n = int(0.25 * SR)
    tt = np.arange(n) / SR
    f_s = f * (1 + 0.6 * np.exp(-tt * 40))
    return np.sin(2 * np.pi * np.cumsum(f_s) / SR) * np.exp(-tt * 18)

def click():
    n = int(0.12 * SR)
    tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1600 * tt) * 0.5 + hp(rng.standard_normal(n), 3000) * 0.4) * np.exp(-tt * 45)

def thud():
    n = int(0.4 * SR)
    tt = np.arange(n) / SR
    return lp(np.sin(2 * np.pi * (70 + 40 * np.exp(-tt * 25)) * tt) + 0.3 * rng.standard_normal(n), 400) * np.exp(-tt * 10)

def chime(m, dur=2.5):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = midi(m)
    return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2.76 * f * tt) * np.exp(-tt * 3)) * np.exp(-tt * 1.6)

# cue times (video seconds) follow the story events through the 70 s time remap
add(chime(81, 2.5), 0.15, 0.10, 0.2)                       # opening shimmer
add(riser(1.2, 200, 2500), 1.0, 0.03, 0)
for q, m in enumerate([72, 76, 79, 84]):                   # the four cell types are named
    add(chime(m, 2.4), 1.6 + q * 0.32, 0.06, -0.45 + q * 0.3)
add(whoosh(3.0), 10.2, 0.08, 0)                            # the tissue blends together
add(riser(2.4, 250, 6500), 14.8, 0.05, 0)                  # dive into the nucleus
add(whoosh(2.6), 16.2, 0.10, 0)
add(chime(88, 3.0), 17.8, 0.07, 0)                         # arrival at the chromatin
add(pop(988), 26.6, 0.18, -0.3)                            # marks appear on the tails
add(pop(1175), 28.4, 0.16, 0.3)
add(pop(988), 30.4, 0.20, -0.2)                            # H3K27ac is written
add(whoosh(2.2), 31.4, 0.06, 0)                            # nucleosomes slide apart
add(click(), 33.2, 0.22, 0)                                # polymerase clamps on
add(thud(), 37.4, 0.26, 0.3)                               # polymerase meets the closed coil
add(riser(1.4, 300, 5000), 40.2, 0.04, 0)                  # into HisTLAND
add(click(), 43.2, 0.22, -0.25)                            # two readers dock together
add(click(), 43.4, 0.22, 0.25)
add(chime(79, 2.6), 44.4, 0.07, 0)                         # one tube, two tracks
for q in range(8):                                          # methyl groups appear
    add(pop(1568 + 90 * (q % 3)) * 0.6, 51.2 + q * 0.34, 0.07, -0.5 + q * 0.14)
add(chime(84, 2.8), 57.2, 0.07, 0)                          # MeTLAND
for q in range(4):                                          # a short stack of reads
    add(pop(1318) * 0.5, 58.8 + q * 0.3, 0.06, -0.3 + q * 0.2)
add(riser(1.6, 300, 6000), 67.0, 0.05, 0)                   # the protocol becomes a kit
add(chime(84, 3.0), 68.6, 0.08, 0)
for q in range(8):                                          # kits arrive in every lab
    add(chime([72, 76, 79, 84][q % 4] + 12 * (q // 4), 2.2), 70.4 + q * 0.32, 0.05, -0.5 + q * 0.14)
add(chime(88, 3.2), 76.2, 0.08, 0)                          # the two layers together
add(chime(91, 3.2), 76.7, 0.06, 0.2)

# ---------------------------------------------------------------- final chord + tail
fin_n = int(6.0 * SR)
tt = np.arange(fin_n) / SR
fin = sum(np.sin(2 * np.pi * midi(m) * tt) for m in [53, 60, 65, 69, 72, 76]) / 6
add(fin * np.exp(-tt * 0.6) * np.minimum(1, tt * 8), 82.0, 0.24, 0)

music = np.stack([L, R], 1)
# gentle master: fade in/out, soft clip
fade = np.ones(N)
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
fade[-int(2.0 * SR):] *= np.linspace(1, 0, int(2.0 * SR)) ** 1.5
music *= fade[:, None]

# ---------------------------------------------------------------- narration + ducking
narr_dir = sys.argv[1]
import json, os
STARTS = [l['start'] for l in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'script.json')))]
voice = np.zeros(N)
for idx, st in enumerate(STARTS):
    a, sr = sf.read(f'{narr_dir}/{idx}.wav')
    if a.ndim > 1:
        a = a.mean(1)
    if sr != SR:
        a = resample_poly(a, SR, sr)
    # trim leading/trailing silence
    nz = np.where(np.abs(a) > 0.01)[0]
    a = a[max(0, nz[0] - 800): nz[-1] + 2400]
    i0 = int(st * SR)
    seg = a[: N - i0]
    voice[i0:i0 + len(seg)] += seg
voice = hp(voice, 80)
voice /= np.max(np.abs(voice)) + 1e-9
# duck music under speech (smoothed envelope)
envv = np.abs(voice)
win = int(0.25 * SR)
envv = np.convolve(envv, np.ones(win) / win, mode='same')
duck = 1 - 0.55 * np.clip(envv / (envv.max() * 0.25), 0, 1)
music *= duck[:, None]
music /= np.max(np.abs(music)) + 1e-9

mix = music * 0.38 + np.stack([voice, voice], 1) * 0.85
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.max(np.abs(mix)) / 0.95
sf.write(sys.argv[2], mix.astype(np.float32), SR)
sf.write(sys.argv[2].replace('.wav', '_music_only.wav'), (music * 0.6).astype(np.float32), SR)
print('ok', mix.shape[0] / SR)
