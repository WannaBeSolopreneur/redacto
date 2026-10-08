#!/usr/bin/env bash
# Builds the browser-ready OpenMed models (see scripts/convert_models.py).
# Needs python3; installs onnxruntime/onnx/tokenizers into .venv (no PyTorch).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install -q onnxruntime onnx tokenizers numpy

for m in OpenMed-PII-SuperMedical-Base-125M-v1 OpenMed-PII-LiteClinical-Small-66M-v1 OpenMed-PII-SuperMedical-Large-355M-v1; do
  d="build-models/src/$m"; mkdir -p "$d"
  for f in model.onnx config.json tokenizer.json tokenizer_config.json; do
    [ -f "$d/$f" ] || { echo "downloading $m/$f"; curl -sfL "https://huggingface.co/OpenMed/$m-onnx-android/resolve/main/$f" -o "$d/$f"; }
  done
done

if [ ! -f build-models/eval/nemotron_test.jsonl ]; then
  echo "downloading Nemotron-PII test rows for verification"
  mkdir -p build-models/eval
  .venv/bin/python - <<'PY'
import json, urllib.request
with open('build-models/eval/nemotron_test.jsonl', 'w') as out:
    for off in range(0, 2000, 500):
        url = f'https://datasets-server.huggingface.co/rows?dataset=nvidia/Nemotron-PII&config=default&split=test&offset={off}&length=100'
        for r in json.load(urllib.request.urlopen(url))['rows']:
            row = r['row']
            spans = row['spans'] if isinstance(row['spans'], list) else __import__('ast').literal_eval(row['spans'])
            out.write(json.dumps({'text': row['text'], 'spans': spans}) + '\n')
PY
fi

.venv/bin/python scripts/convert_models.py
