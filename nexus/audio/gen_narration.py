"""Narration with Kokoro TTS (open-source, offline). Usage: python gen_narration.py <model_dir> <out_dir>"""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

model_dir, out = sys.argv[1], sys.argv[2]
k = Kokoro(f'{model_dir}/kokoro-v1.0.onnx', f'{model_dir}/voices-v1.0.bin')
lines = json.load(open(os.path.join(os.path.dirname(__file__), 'script.json')))
os.makedirs(out, exist_ok=True)
for i, l in enumerate(lines):
    a, sr = k.create(l['say'], voice='af_heart', speed=l.get('speed', 1.05), lang='en-us')
    sf.write(f'{out}/{i}.wav', a, sr)
    print(i, l['start'], round(len(a) / sr, 2), 'ends', round(l['start'] + len(a) / sr, 2))
