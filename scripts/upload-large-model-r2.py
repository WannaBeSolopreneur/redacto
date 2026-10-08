"""Upload model files too big for `wrangler r2 object put` (over 315 MB) to R2, through its S3-compatible API.

  pip install boto3
  CF_ACCOUNT_ID=<your account id> python scripts/upload-large-model-r2.py [token-file]

Credentials come from R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY, or a file with those two lines
(default ~/Downloads/redacto_r2_token.txt). They are never printed.
"""
import os, pathlib, sys
import boto3
from boto3.s3.transfer import TransferConfig

ACCOUNT = os.environ.get("CF_ACCOUNT_ID") or sys.exit("Set CF_ACCOUNT_ID (shown by `npx wrangler whoami`).")
BUCKET = "redacto-models"
ROOT = pathlib.Path(__file__).resolve().parent.parent / "public" / "models"
LIMIT = 315_000_000


def creds():
    vals = {k: os.environ.get(k, "") for k in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")}
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "Downloads" / "redacto_r2_token.txt")
    if path.exists():
        for line in path.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() in vals and v.strip() and not vals[k.strip()]:
                vals[k.strip()] = v.strip()
    missing = [k for k, v in vals.items() if not v]
    if missing:
        sys.exit(f"Missing {', '.join(missing)}: paste them into {path}")
    return vals


c = creds()
s3 = boto3.client("s3", endpoint_url=f"https://{ACCOUNT}.r2.cloudflarestorage.com", region_name="auto",
                  aws_access_key_id=c["R2_ACCESS_KEY_ID"], aws_secret_access_key=c["R2_SECRET_ACCESS_KEY"])
big = [p for p in ROOT.rglob("*") if p.is_file() and p.stat().st_size > LIMIT]
if not big:
    sys.exit("No model files over 315 MB in public/models.")
config = TransferConfig(multipart_threshold=64 * 2**20, multipart_chunksize=64 * 2**20, max_concurrency=6)
for p in big:
    key = p.relative_to(ROOT).as_posix()
    total, done = p.stat().st_size, [0]
    def progress(n):
        done[0] += n
        print(f"\r{key}: {done[0] * 100 // total}%", end="", flush=True)
    s3.upload_file(str(p), BUCKET, key, ExtraArgs={"ContentType": "application/octet-stream"}, Config=config, Callback=progress)
    head = s3.head_object(Bucket=BUCKET, Key=key)
    ok = head["ContentLength"] == total
    print(f"\n{'ok' if ok else 'SIZE MISMATCH'} {key} ({head['ContentLength']:,} bytes)")
    if not ok:
        sys.exit(1)
