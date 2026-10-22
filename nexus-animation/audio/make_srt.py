"""Write the .srt from script.json and the narration WAV lengths. Usage: python make_srt.py <narration_dir> <out.srt>"""
import json, os, sys, textwrap
import numpy as np
import soundfile as sf

lines = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'script.json')))
def ts(x):
    ms = int(round(x * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
out = []
for i, l in enumerate(lines):
    a, sr = sf.read(f'{sys.argv[1]}/{i}.wav')
    nz = np.where(np.abs(a) > 0.01)[0]
    dur = (nz[-1] - max(0, nz[0] - 800)) / sr
    end = l['start'] + dur + 0.25
    if i + 1 < len(lines):
        end = min(end, lines[i + 1]['start'] - 0.05)
    show = l['show']
    text = show if len(show) <= 42 else '\n'.join(textwrap.wrap(show, (len(show) + 1) // 2 + 4))
    out.append(f'{i + 1}\n{ts(l["start"])} --> {ts(end)}\n{text}\n')
open(sys.argv[2], 'w').write('\n'.join(out))
print('\n'.join(out))
