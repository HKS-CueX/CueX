#!/usr/bin/env python3
"""Healthcheck and acceptance probe for CueX Colab GPU ASR HTTPS/WSS service.

Reads configuration from environment variables (or optional --env-file):
  CUEX_COLAB_ASR_URL / COLAB_ASR_URL (default: https://127.0.0.1:10086)
  CUEX_COLAB_ASR_API_KEY / COLAB_ASR_API_KEY
  CUEX_COLAB_ASR_CA_CERT / COLAB_ASR_CA_CERT

Never prints API keys or raw certificates.
"""

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def build_ssl_context(ca_cert: str | None, insecure: bool) -> ssl.SSLContext:
    if insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    if ca_cert and Path(ca_cert).is_file():
        return ssl.create_default_context(cafile=ca_cert)
    return ssl.create_default_context()


def http_json(url: str, token: str | None, ctx: ssl.SSLContext, timeout: float = 8.0) -> tuple[int, dict]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return resp.status, body
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
        except Exception:
            body = {"raw": raw[:300]}
        return err.code, body


def main() -> int:
    parser = argparse.ArgumentParser(description="CueX Colab GPU ASR Healthcheck")
    parser.add_argument("--env-file", type=Path, default=None, help="Optional .env file to load")
    parser.add_argument("--url", default=None, help="Base HTTPS URL (e.g. https://127.0.0.1:10086)")
    parser.add_argument("--ca-cert", default=None, help="Path to PEM certificate")
    parser.add_argument("--insecure", action="store_true", help="Disable TLS verification (local debug only)")
    parser.add_argument("--verify-auth", action="store_true", help="Verify unauthenticated /health returns 401")
    args = parser.parse_args()

    if args.env_file:
        load_env_file(args.env_file)

    base_url = (
        args.url
        or os.environ.get("CUEX_COLAB_ASR_URL")
        or os.environ.get("COLAB_ASR_URL")
        or "https://127.0.0.1:10086"
    ).rstrip("/")
    api_key = os.environ.get("CUEX_COLAB_ASR_API_KEY") or os.environ.get("COLAB_ASR_API_KEY") or ""
    ca_cert = args.ca_cert or os.environ.get("CUEX_COLAB_ASR_CA_CERT") or os.environ.get("COLAB_ASR_CA_CERT")

    if not api_key:
        print(json.dumps({"ok": False, "error": "Missing CUEX_COLAB_ASR_API_KEY / COLAB_ASR_API_KEY"}))
        return 2

    ctx = build_ssl_context(ca_cert, args.insecure)

    unauth_status = None
    if args.verify_auth:
        unauth_status, _ = http_json(f"{base_url}/health", None, ctx)
        if unauth_status != 401:
            print(json.dumps({"ok": False, "error": f"Expected 401 without Bearer token, got {unauth_status}"}))
            return 1

    health_status, health_body = http_json(f"{base_url}/health", api_key, ctx)
    ready_status, ready_body = http_json(f"{base_url}/ready", api_key, ctx)

    ok = health_status == 200 and ready_status == 200 and bool(health_body.get("ready")) and bool(ready_body.get("ready"))
    summary = {
        "ok": ok,
        "healthStatus": health_status,
        "readyStatus": ready_status,
        "unauthStatus": unauth_status,
        "model": health_body.get("model"),
        "lifecycleState": health_body.get("lifecycleState"),
        "gpu": health_body.get("gpu"),
        "uptimeSec": health_body.get("uptimeSec"),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
