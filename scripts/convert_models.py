"""Build browser-ready int8 NER models and verify they match the fp32 originals.

Pipeline per model (the standard ONNX Runtime recipe for BERT-family int8):
  1. Fuse the transformer graph offline (Attention, SkipLayerNorm, Gelu, ...).
     Doing this ahead of time is what removes most of the "preparing" time in
     the browser, especially in Firefox and Safari.
  2. Dynamic int8 quantization of MatMul/Attention weights and the embedding table.
  3. Evaluate fp32 vs int8 on held-out Nemotron-PII test rows; refuse to ship
     a build that loses more than MAX_F1_DROP.

Usage:  .venv/bin/python scripts/convert_models.py [model-name ...]
Inputs: build-models/src/<model>/ (official OpenMed onnx-android export)
Output: public/models/OpenMed/<model>/ in transformers.js layout.
"""

import ast
import re
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.transformers.optimizer import optimize_model
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build-models" / "src"
WORK = ROOT / "build-models" / "work"
OUT = ROOT / "public" / "models" / "OpenMed"
EVAL = ROOT / "build-models" / "eval" / "nemotron_test.jsonl"

MODELS = {
    "OpenMed-PII-SuperMedical-Base-125M-v1": {"heads": 12, "hidden": 768},
    "OpenMed-PII-LiteClinical-Small-66M-v1": {"heads": 12, "hidden": 768},
    "OpenMed-PII-SuperMedical-Large-355M-v1": {"heads": 16, "hidden": 1024},
}
MAX_F1_DROP = 0.005
# Same-label pieces separated only by this are one entity ("Mary-Jane", "a.b.com/x").
JOINABLE_GAP = re.compile(r"[ \-./:@_]{1,2}")
EVAL_ROWS = 400


def build(name: str, cfg: dict) -> Path:
    src, work = SRC / name, WORK / name
    work.mkdir(parents=True, exist_ok=True)
    fused = work / "fused.onnx"
    if not fused.exists():
        opt = optimize_model(
            str(src / "model.onnx"), model_type="bert", num_heads=cfg["heads"], hidden_size=cfg["hidden"], opt_level=0
        )
        print(f"  fused ops: {opt.get_fused_operator_statistics()}")
        opt.save_model_to_file(str(fused))
    q8 = work / "model_quantized.onnx"
    quantize_dynamic(
        str(fused),
        str(q8),
        weight_type=QuantType.QInt8,
        per_channel=True,
        op_types_to_quantize=["MatMul", "Attention", "Gather"],
        # Shape inference can't type outputs of fused contrib ops; they're all float.
        extra_options={"DefaultTensorType": onnx.TensorProto.FLOAT},
    )
    return q8


def load_rows():
    rows = []
    for line in EVAL.read_text().splitlines()[:EVAL_ROWS]:
        r = json.loads(line)
        spans = r["spans"] if isinstance(r["spans"], list) else ast.literal_eval(r["spans"])
        rows.append((r["text"], [(s["start"], s["end"], s["label"]) for s in spans]))
    return rows


def predict(sess, tok, id2label, text):
    """Token predictions → word-expanded, merged character spans (mirrors the browser code)."""
    enc = tok.encode(text)
    ids, offsets = enc.ids[:512], enc.offsets[:512]
    feeds = {"input_ids": np.array([ids], dtype=np.int64), "attention_mask": np.ones((1, len(ids)), dtype=np.int64)}
    logits = sess.run(["logits"], feeds)[0][0]
    spans = []
    for (s, e), k in zip(offsets, logits.argmax(-1)):
        label = id2label[str(k)]
        if label == "O" or e <= s:
            continue
        tag = label.split("-", 1)[-1]
        while s > 0 and text[s - 1].isalnum():
            s -= 1
        while e < len(text) and text[e].isalnum():
            e += 1
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():  # BPE tokens can carry a trailing newline
            e -= 1
        if e <= s:
            continue
        gap = text[spans[-1][1]:s] if spans else ""
        if spans and spans[-1][2] == tag and (s <= spans[-1][1] or JOINABLE_GAP.fullmatch(gap)):
            spans[-1] = (spans[-1][0], max(spans[-1][1], e), tag)
        else:
            spans.append((s, e, tag))
    covered = max((e for _, e in offsets), default=0)
    return spans, covered


def evaluate(model_path: Path, src: Path, rows):
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    sess = ort.InferenceSession(str(model_path), opts, providers=["CPUExecutionProvider"])
    tok = Tokenizer.from_file(str(src / "tokenizer.json"))
    # The exports pad every input to 512 tokens; score exactly what the browser runs.
    tok.no_padding()
    tok.no_truncation()
    id2label = json.loads((src / "config.json").read_text())["id2label"]
    tp = fp = fn = 0
    pii_chars = hit_chars = 0
    t0 = time.time()
    for text, gold in rows:
        pred, covered = predict(sess, tok, id2label, text)
        gold = [g for g in gold if g[1] <= covered]
        gs, ps = set(gold), set(pred)
        tp += len(gs & ps)
        fp += len(ps - gs)
        fn += len(gs - ps)
        # Redaction-relevant metric: share of gold PII characters covered by any prediction.
        mask = np.zeros(len(text), bool)
        for s, e, _ in pred:
            mask[s:e] = True
        for s, e, _ in gold:
            pii_chars += e - s
            hit_chars += int(mask[s:e].sum())
    p = tp / max(tp + fp, 1)
    r = tp / max(tp + fn, 1)
    return {
        "precision": round(p, 4),
        "recall": round(r, 4),
        "f1": round(2 * p * r / max(p + r, 1e-9), 4),
        "pii_char_recall": round(hit_chars / max(pii_chars, 1), 4),
        "ms_per_doc": round((time.time() - t0) * 1000 / len(rows), 1),
    }


def main():
    names = sys.argv[1:] or list(MODELS)
    rows = load_rows()
    report = {}
    for name in names:
        print(f"== {name}")
        src = SRC / name
        q8 = build(name, MODELS[name])
        base = evaluate(src / "model.onnx", src, rows)
        quant = evaluate(q8, src, rows)
        drop = base["f1"] - quant["f1"]
        size = round(q8.stat().st_size / 1e6, 1)
        print(f"  fp32 {base}\n  int8 {quant}  size={size}MB  f1_drop={drop:.4f}")
        report[name] = {"fp32": base, "int8": quant, "int8_mb": size}
        if drop > MAX_F1_DROP:
            print(f"  REJECTED: int8 loses {drop:.4f} F1 (> {MAX_F1_DROP})")
            continue
        dest = OUT / name
        (dest / "onnx").mkdir(parents=True, exist_ok=True)
        shutil.copy(q8, dest / "onnx" / "model_quantized.onnx")
        for f in ("config.json", "tokenizer_config.json"):
            shutil.copy(src / f, dest / f)
        # Drop the fixed 512-token padding baked into the export: it would make the
        # browser run every chunk at full length. Chunking/truncation is handled in JS.
        tj = json.loads((src / "tokenizer.json").read_text())
        tj["padding"] = None
        tj["truncation"] = None
        (dest / "tokenizer.json").write_text(json.dumps(tj, ensure_ascii=False))
        print(f"  shipped -> {dest.relative_to(ROOT)}")
    (ROOT / "build-models" / "eval" / "report.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
