#!/usr/bin/env python3
"""CueX Phase 3 Real GPU ASR Service for Google Colab (HTTPS + WSS).

Exposes authenticated HTTPS + WSS endpoints on 127.0.0.1:10086 (forwarded via FRP):
  - GET  /health            (Bearer-authenticated health + GPU + model telemetry)
  - GET  /ready             (Bearer-authenticated readiness probe)
  - POST /v1/asr/transcribe (Bearer-authenticated multipart/WAV/PCM16 batch transcription)
  - WS   /v1/asr/stream     (Bearer-authenticated WSS 16kHz PCM16LE streaming partial/final)

Security & privacy invariants:
  - Fails closed if COLAB_ASR_API_KEY is missing or < 16 chars.
  - Enforces constant-time Bearer token comparison before WebSocket accept or HTTP handling.
  - Generates ephemeral self-signed X.509 TLS cert when cert/key paths do not already exist.
  - Zero raw audio disk retention: all WAV/PCM buffers stay strictly in memory.
  - Zero hardcoded secrets, private keys, or personal paths.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import hmac
import io
import ipaddress
import json
import logging
import os
import re
import signal
import sys
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch
import uvicorn
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cuex-colab-asr")

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
BYTES_PER_MS = (SAMPLE_RATE * BYTES_PER_SAMPLE) // 1000  # 32 bytes/ms


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class ServerSettings:
    host: str = os.environ.get("COLAB_ASR_HOST", "127.0.0.1")
    port: int = int(os.environ.get("COLAB_ASR_PORT", "10086"))
    model_id: str = os.environ.get("COLAB_ASR_MODEL", "FunAudioLLM/SenseVoiceSmall")
    model_hub: str = os.environ.get("COLAB_ASR_HUB", "hf")
    device: str = os.environ.get("COLAB_ASR_DEVICE", "cuda:0")
    api_key: str = os.environ.get("COLAB_ASR_API_KEY", "")
    tls_dir: str = os.environ.get("COLAB_ASR_TLS_DIR", "/tmp/cuex-asr-tls")
    tls_cert: str = os.environ.get("COLAB_ASR_TLS_CERT", "/tmp/cuex-asr-tls/cert.pem")
    tls_key: str = os.environ.get("COLAB_ASR_TLS_KEY", "/tmp/cuex-asr-tls/key.pem")
    tls_san_ips: str = os.environ.get("COLAB_ASR_TLS_SAN_IPS", "127.0.0.1")
    tls_san_dns: str = os.environ.get("COLAB_ASR_TLS_SAN_DNS", "localhost")
    max_upload_bytes: int = int(os.environ.get("COLAB_ASR_MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
    max_audio_sec: float = float(os.environ.get("COLAB_ASR_MAX_AUDIO_SEC", "180"))
    infer_timeout_sec: float = float(os.environ.get("COLAB_ASR_INFER_TIMEOUT_SEC", "30"))
    partial_interval_ms: int = int(os.environ.get("COLAB_ASR_PARTIAL_INTERVAL_MS", "450"))
    endpoint_silence_ms: int = int(os.environ.get("COLAB_ASR_ENDPOINT_SILENCE_MS", "650"))
    max_utterance_sec: float = float(os.environ.get("COLAB_ASR_MAX_UTTERANCE_SEC", "20"))
    allow_query_token: bool = os.environ.get("COLAB_ASR_ALLOW_QUERY_TOKEN", "false").lower() == "true"


def ensure_ephemeral_tls_cert(settings: ServerSettings) -> tuple[str, str]:
    cert_path = Path(settings.tls_cert)
    key_path = Path(settings.tls_key)
    if cert_path.is_file() and key_path.is_file():
        return str(cert_path), str(key_path)

    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "cuex-colab-asr"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "CueX Runtime Ephemeral TLS"),
    ])

    san_entries: list[x509.GeneralName] = []
    for raw_ip in settings.tls_san_ips.split(","):
        ip_str = raw_ip.strip()
        if ip_str:
            san_entries.append(x509.IPAddress(ipaddress.ip_address(ip_str)))
    for raw_dns in settings.tls_san_dns.split(","):
        dns_str = raw_dns.strip()
        if dns_str:
            san_entries.append(x509.DNSName(dns_str))

    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=30))
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(private_key, hashes.SHA256())
    )

    key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(key_path, "wb") as kf:
        kf.write(key_bytes)
    os.chmod(key_path, 0o600)

    cert_bytes = cert.public_bytes(serialization.Encoding.PEM)
    with open(cert_path, "wb") as cf:
        cf.write(cert_bytes)
    os.chmod(cert_path, 0o644)

    logger.info("Generated ephemeral self-signed TLS certificate at %s", cert_path)
    return str(cert_path), str(key_path)


def parse_audio_to_float32(raw_bytes: bytes, content_type: str = "", sample_rate_hint: int = SAMPLE_RATE) -> tuple[np.ndarray, float]:
    """Decode WAV or raw PCM16LE strictly in memory without touching disk."""
    if not raw_bytes:
        raise ValueError("Empty audio payload")

    is_wav = len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WAVE"
    if is_wav:
        with wave.open(io.BytesIO(raw_bytes), "rb") as w:
            channels = w.getnchannels()
            sampwidth = w.getsampwidth()
            sr = w.getframerate()
            frames = w.readframes(w.getnframes())
        if sampwidth != 2:
            raise ValueError(f"Unsupported WAV sample width {sampwidth * 8}-bit; expected 16-bit PCM")
        if channels < 1 or channels > 2:
            raise ValueError(f"Unsupported WAV channel count {channels}")
        arr = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if channels == 2:
            arr = arr.reshape(-1, 2).mean(axis=1)
        if sr != SAMPLE_RATE and len(arr) > 0:
            duration = len(arr) / sr
            target_len = max(1, int(round(duration * SAMPLE_RATE)))
            x_old = np.linspace(0.0, 1.0, num=len(arr), endpoint=False)
            x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
            arr = np.interp(x_new, x_old, arr).astype(np.float32)
        return arr, len(arr) / SAMPLE_RATE

    if "wav" in content_type.lower():
        raise ValueError("Content-Type indicates WAV, but RIFF/WAVE header is missing or invalid")

    usable_len = len(raw_bytes) - (len(raw_bytes) % 2)
    if usable_len < 320:
        raise ValueError("Audio payload too short (< 10ms of PCM16)")
    arr = np.frombuffer(raw_bytes[:usable_len], dtype=np.int16).astype(np.float32) / 32768.0
    if sample_rate_hint != SAMPLE_RATE and len(arr) > 0:
        duration = len(arr) / sample_rate_hint
        target_len = max(1, int(round(duration * SAMPLE_RATE)))
        x_old = np.linspace(0.0, 1.0, num=len(arr), endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
        arr = np.interp(x_new, x_old, arr).astype(np.float32)
    return arr, len(arr) / SAMPLE_RATE


class GpuAsrEngine:
    """Thread-safe wrapper around the active GPU ASR model."""

    def __init__(self, settings: ServerSettings):
        self.settings = settings
        self.ready = False
        self.lifecycle_state = "starting"
        self.model_id = settings.model_id
        self.gpu_name = "unavailable"
        self.cuda_version = torch.version.cuda or "unknown"
        self.load_time_sec = 0.0
        self.warmup_latency_ms = 0.0
        self.total_requests = 0
        self.total_stream_sessions = 0
        self.total_audio_sec = 0.0
        self.total_infer_sec = 0.0
        self._model: Any = None
        self._postprocess: Any = None
        self._processor: Any = None
        self._backend_kind = "sensevoice"
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="cuex-asr-gpu")
        self._gpu_lock = asyncio.Semaphore(2)

    def load_and_warmup(self) -> None:
        if not torch.cuda.is_available():
            self.lifecycle_state = "unavailable"
            raise RuntimeError("CUDA GPU is required for Colab GPU ASR service, but torch.cuda.is_available() is False")

        self.gpu_name = torch.cuda.get_device_name(0)
        t0 = time.perf_counter()

        if "whisper" in self.model_id.lower():
            try:
                from faster_whisper import WhisperModel

                self._backend_kind = "faster_whisper"
                model_name = "large-v3-turbo" if "turbo" in self.model_id.lower() else self.model_id
                self._model = WhisperModel(model_name, device="cuda", compute_type="float16")
                # Force early cuBLAS load check on CUDA 13 runtimes (ctranslate2 may fail on libcublas.so.12)
                _ = self._model.transcribe(np.zeros(SAMPLE_RATE // 2, dtype=np.float32), beam_size=1)
            except Exception as fw_err:
                logger.warning("faster-whisper unavailable on this CUDA runtime (%s); falling back to transformers SDPA", fw_err)
                from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

                self._backend_kind = "transformers_whisper"
                dtype = torch.float16
                self._processor = AutoProcessor.from_pretrained(self.model_id)
                self._model = AutoModelForSpeechSeq2Seq.from_pretrained(
                    self.model_id,
                    torch_dtype=dtype,
                    low_cpu_mem_usage=True,
                    attn_implementation="sdpa",
                ).to(self.settings.device)
                self._model.eval()
        else:
            from funasr import AutoModel
            from funasr.utils.postprocess_utils import rich_transcription_postprocess

            self._backend_kind = "sensevoice"
            self._postprocess = rich_transcription_postprocess
            self._model = AutoModel(
                model=self.model_id,
                vad_model="fsmn-vad",
                vad_kwargs={"max_single_segment_time": 30000},
                device=self.settings.device,
                hub=self.settings.model_hub,
                disable_update=True,
            )

        self.load_time_sec = round(time.perf_counter() - t0, 3)

        # Warmup on 1.0s synthetic silence in memory
        tw0 = time.perf_counter()
        dummy = np.zeros(SAMPLE_RATE, dtype=np.float32)
        self._transcribe_sync(dummy, language="auto", use_vad=False)
        self.warmup_latency_ms = round((time.perf_counter() - tw0) * 1000.0, 2)
        self.ready = True
        self.lifecycle_state = "ready"
        logger.info(
            "Model %s ready on %s (load=%.3fs, warmup=%.2fms)",
            self.model_id,
            self.gpu_name,
            self.load_time_sec,
            self.warmup_latency_ms,
        )

    def _transcribe_sync(self, audio: np.ndarray, language: str = "auto", use_vad: bool = True) -> dict[str, Any]:
        dur_sec = max(len(audio) / SAMPLE_RATE, 1e-3)
        t0 = time.perf_counter()

        if self._backend_kind == "faster_whisper":
            lang_arg = None if language in ("auto", "") else language
            segs_iter, info = self._model.transcribe(
                audio,
                language=lang_arg,
                vad_filter=use_vad,
                beam_size=2,
                initial_prompt="CueX Presentation, System 1, System 2, ContextStore, EventBus, InterventionController, JSON, Markdown, Evidence.",
            )
            segments = []
            texts = []
            for seg in segs_iter:
                txt = seg.text.strip()
                if txt:
                    texts.append(txt)
                    segments.append({
                        "startMs": int(round(seg.start * 1000)),
                        "endMs": int(round(seg.end * 1000)),
                        "text": txt,
                    })
            full_text = "".join(texts).strip()
            detected_lang = getattr(info, "language", language) or "auto"
        elif self._backend_kind == "transformers_whisper":
            lang_arg = "zh" if language in ("auto", "") else language
            inputs = self._processor(audio, sampling_rate=SAMPLE_RATE, return_tensors="pt")
            input_features = inputs.input_features.to(self.settings.device, dtype=torch.float16)
            with torch.inference_mode():
                gen_ids = self._model.generate(
                    input_features,
                    language=lang_arg,
                    task="transcribe",
                    max_new_tokens=224,
                )
            full_text = self._processor.batch_decode(gen_ids, skip_special_tokens=True)[0].strip()
            detected_lang = lang_arg
            segments = [{"startMs": 0, "endMs": int(round(dur_sec * 1000)), "text": full_text}] if full_text else []
        else:
            res = self._model.generate(
                input=audio,
                cache={},
                language=language or "auto",
                use_itn=True,
                batch_size_s=60,
                merge_vad=use_vad,
                merge_length_s=15,
                disable_pbar=True,
            )
            raw_text = res[0]["text"] if res else ""
            full_text = self._postprocess(raw_text).strip() if raw_text else ""
            lang_match = re.search(r"<\|([a-z]{2,5})\|>", raw_text)
            detected_lang = lang_match.group(1) if lang_match else (language or "auto")
            segments = [{"startMs": 0, "endMs": int(round(dur_sec * 1000)), "text": full_text}] if full_text else []

        infer_sec = time.perf_counter() - t0
        rtf = infer_sec / dur_sec
        return {
            "text": full_text,
            "language": detected_lang,
            "segments": segments,
            "audioDurationMs": int(round(dur_sec * 1000)),
            "latencyMs": round(infer_sec * 1000.0, 2),
            "rtf": round(rtf, 5),
        }

    async def transcribe(self, audio: np.ndarray, language: str = "auto", use_vad: bool = True) -> dict[str, Any]:
        if not self.ready:
            raise RuntimeError("ASR model is not ready yet")
        async with self._gpu_lock:
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(self._executor, self._transcribe_sync, audio, language, use_vad),
                timeout=self.settings.infer_timeout_sec,
            )
        self.total_requests += 1
        self.total_audio_sec += result["audioDurationMs"] / 1000.0
        self.total_infer_sec += result["latencyMs"] / 1000.0
        return result

    def gpu_telemetry(self) -> dict[str, Any]:
        if not torch.cuda.is_available():
            return {"available": False, "name": "none"}
        free_b, total_b = torch.cuda.mem_get_info(0)
        return {
            "available": True,
            "name": self.gpu_name,
            "cudaVersion": self.cuda_version,
            "vramAllocatedMiB": round(torch.cuda.memory_allocated(0) / (1024 * 1024), 1),
            "vramReservedMiB": round(torch.cuda.memory_reserved(0) / (1024 * 1024), 1),
            "vramUsedMiB": round((total_b - free_b) / (1024 * 1024), 1),
            "vramTotalMiB": round(total_b / (1024 * 1024), 1),
        }


class BearerAuthAsgiMiddleware:
    """Reject missing or invalid Bearer tokens before HTTP routing or WebSocket upgrade."""

    def __init__(self, app: Any, api_key: str, allow_query_token: bool = False):
        self.app = app
        self.api_key = api_key
        self.allow_query_token = allow_query_token

    def _is_authorized(self, scope: dict[str, Any]) -> bool:
        headers = dict(scope.get("headers") or [])
        auth_val = headers.get(b"authorization", b"").decode("latin-1").strip()
        if auth_val.lower().startswith("bearer "):
            token = auth_val[7:].strip()
            if token and hmac.compare_digest(token, self.api_key):
                return True

        if self.allow_query_token and scope.get("type") == "websocket":
            qs = (scope.get("query_string") or b"").decode("utf-8", errors="ignore")
            for pair in qs.split("&"):
                if pair.startswith("token="):
                    token = pair[6:]
                    if token and hmac.compare_digest(token, self.api_key):
                        return True
        return False

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] in ("http", "websocket"):
            if not self._is_authorized(scope):
                payload = json.dumps({
                    "ok": False,
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Missing or invalid Bearer token",
                        "timestamp": utc_now_iso(),
                    },
                }).encode("utf-8")
                if scope["type"] == "websocket":
                    extensions = scope.get("extensions") or {}
                    if "websocket.http.response" in extensions:
                        await send({
                            "type": "websocket.http.response.start",
                            "status": 401,
                            "headers": [
                                [b"content-type", b"application/json"],
                                [b"www-authenticate", b"Bearer"],
                                [b"content-length", str(len(payload)).encode("ascii")],
                            ],
                        })
                        await send({"type": "websocket.http.response.body", "body": payload})
                    else:
                        await send({"type": "websocket.close", "code": 4401, "reason": "Unauthorized"})
                    return

                await send({
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        [b"content-type", b"application/json"],
                        [b"www-authenticate", b"Bearer"],
                        [b"content-length", str(len(payload)).encode("ascii")],
                    ],
                })
                await send({"type": "http.response.body", "body": payload})
                return
        await self.app(scope, receive, send)


def create_app(settings: ServerSettings, engine: GpuAsrEngine) -> Any:
    started_at = time.monotonic()
    app = FastAPI(title="CueX Colab GPU ASR Service", version="1.0.0", docs_url=None, redoc_url=None)

    @app.get("/health")
    async def health() -> JSONResponse:
        avg_rtf = round(engine.total_infer_sec / engine.total_audio_sec, 5) if engine.total_audio_sec > 0 else None
        body = {
            "status": "ok" if engine.ready else "starting",
            "ready": engine.ready,
            "lifecycleState": engine.lifecycle_state,
            "backend": "colab-gpu-asr",
            "model": engine.model_id,
            "gpu": engine.gpu_telemetry(),
            "loadTimeSec": engine.load_time_sec,
            "warmupLatencyMs": engine.warmup_latency_ms,
            "uptimeSec": round(time.monotonic() - started_at, 2),
            "metrics": {
                "totalRequests": engine.total_requests,
                "totalStreamSessions": engine.total_stream_sessions,
                "totalAudioSec": round(engine.total_audio_sec, 3),
                "avgRtf": avg_rtf,
            },
            "timestamp": utc_now_iso(),
        }
        return JSONResponse(status_code=200, content=body)

    @app.get("/ready")
    async def ready() -> JSONResponse:
        if not engine.ready:
            return JSONResponse(
                status_code=503,
                content={"ready": False, "lifecycleState": engine.lifecycle_state, "model": engine.model_id},
            )
        return JSONResponse(
            status_code=200,
            content={"ready": True, "lifecycleState": "ready", "model": engine.model_id, "gpu": engine.gpu_name},
        )

    @app.post("/v1/asr/transcribe")
    async def transcribe_http(request: Request) -> JSONResponse:
        if not engine.ready:
            return JSONResponse(status_code=503, content={"ok": False, "error": {"code": "ASR_UNAVAILABLE", "message": "Model warming up"}})

        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > settings.max_upload_bytes:
            return JSONResponse(status_code=413, content={"ok": False, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "Request exceeds upload size limit"}})

        content_type = request.headers.get("content-type", "")
        language = request.query_params.get("language", "auto")
        sample_rate_hint = int(request.query_params.get("sample_rate", str(SAMPLE_RATE)))
        raw_audio = b""

        try:
            if "multipart/form-data" in content_type.lower():
                form = await request.form()
                upload = form.get("file") or form.get("audio")
                if upload is None or not hasattr(upload, "read"):
                    return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": "Missing multipart 'file' field"}})
                raw_audio = await upload.read()
                if "language" in form and isinstance(form["language"], str):
                    language = form["language"]
                if "sample_rate" in form and str(form["sample_rate"]).isdigit():
                    sample_rate_hint = int(str(form["sample_rate"]))
            else:
                chunks = []
                total = 0
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > settings.max_upload_bytes:
                        return JSONResponse(status_code=413, content={"ok": False, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "Request exceeds upload size limit"}})
                    chunks.append(chunk)
                raw_audio = b"".join(chunks)

            if len(raw_audio) > settings.max_upload_bytes:
                return JSONResponse(status_code=413, content={"ok": False, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "Audio exceeds max upload bytes"}})

            audio_arr, dur_sec = parse_audio_to_float32(raw_audio, content_type, sample_rate_hint)
            if dur_sec > settings.max_audio_sec:
                return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": f"Audio duration {dur_sec:.1f}s exceeds limit {settings.max_audio_sec}s"}})

            result = await engine.transcribe(audio_arr, language=language, use_vad=True)
            return JSONResponse(
                status_code=200,
                content={
                    "ok": True,
                    **result,
                    "model": engine.model_id,
                    "gpu": engine.gpu_name,
                    "timestamp": utc_now_iso(),
                },
            )
        except asyncio.TimeoutError:
            return JSONResponse(status_code=504, content={"ok": False, "error": {"code": "PROVIDER_TIMEOUT", "message": "ASR inference timed out"}})
        except ValueError as err:
            return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": str(err)}})
        finally:
            raw_audio = b""

    @app.websocket("/v1/asr/stream")
    async def stream_ws(ws: WebSocket) -> None:
        await ws.accept()
        if not engine.ready:
            await ws.send_json({"type": "error", "code": "ASR_UNAVAILABLE", "message": "ASR model is still starting"})
            await ws.close(code=1013)
            return

        engine.total_stream_sessions += 1
        language = ws.query_params.get("language", "auto")
        partial_interval_ms = settings.partial_interval_ms
        endpoint_silence_ms = settings.endpoint_silence_ms

        await ws.send_json({
            "type": "ready",
            "protocol": "cuex-colab-asr-v1",
            "model": engine.model_id,
            "gpu": engine.gpu_name,
            "sampleRate": SAMPLE_RATE,
            "encoding": "pcm_s16le",
            "channels": 1,
            "timestamp": utc_now_iso(),
        })

        utterance_pcm = bytearray()
        trailing_byte = b""
        segment_idx = 0
        speech_started = False
        stream_ms = 0
        speech_start_ms = 0
        last_speech_ms = 0
        last_partial_infer_t = 0.0
        last_partial_bytes = 0
        last_partial_text = ""
        rms_threshold = 0.0035  # ~ -49 dBFS; handles quiet -16dB mics without dropping real speech
        closed = False

        async def emit_utterance(is_final: bool, reason: str = "") -> None:
            nonlocal segment_idx, utterance_pcm, speech_started, last_partial_infer_t, last_partial_bytes, last_partial_text
            usable = len(utterance_pcm) - (len(utterance_pcm) % 2)
            if usable < BYTES_PER_MS * 160:
                if is_final:
                    utterance_pcm.clear()
                    speech_started = False
                    last_partial_bytes = 0
                    last_partial_text = ""
                return

            arr = np.frombuffer(bytes(utterance_pcm[:usable]), dtype=np.int16).astype(np.float32) / 32768.0
            try:
                res = await engine.transcribe(arr, language=language, use_vad=is_final)
            except asyncio.TimeoutError:
                await ws.send_json({"type": "error", "code": "PROVIDER_TIMEOUT", "message": "Streaming ASR inference timeout"})
                return

            text = res["text"].strip()
            if is_final:
                if text:
                    await ws.send_json({
                        "type": "final",
                        "segment": segment_idx,
                        "text": text,
                        "language": res["language"],
                        "startMs": speech_start_ms,
                        "endMs": stream_ms,
                        "audioDurationMs": res["audioDurationMs"],
                        "latencyMs": res["latencyMs"],
                        "rtf": res["rtf"],
                        "reason": reason or "vad_endpoint",
                        "timestamp": utc_now_iso(),
                    })
                    segment_idx += 1
                utterance_pcm.clear()
                speech_started = False
                last_partial_bytes = 0
                last_partial_text = ""
            else:
                last_partial_infer_t = time.monotonic()
                last_partial_bytes = usable
                if text and text != last_partial_text:
                    last_partial_text = text
                    await ws.send_json({
                        "type": "partial",
                        "segment": segment_idx,
                        "text": text,
                        "language": res["language"],
                        "startMs": speech_start_ms,
                        "endMs": stream_ms,
                        "audioDurationMs": res["audioDurationMs"],
                        "latencyMs": res["latencyMs"],
                        "rtf": res["rtf"],
                        "timestamp": utc_now_iso(),
                    })

        async def keepalive_loop() -> None:
            while not closed:
                await asyncio.sleep(15.0)
                if closed:
                    break
                try:
                    await ws.send_json({"type": "ping", "timestamp": utc_now_iso()})
                except Exception:
                    break

        ka_task = asyncio.create_task(keepalive_loop())
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break

                if msg.get("bytes") is not None:
                    chunk = trailing_byte + msg["bytes"]
                    if len(chunk) % 2 == 1:
                        trailing_byte = chunk[-1:]
                        chunk = chunk[:-1]
                    else:
                        trailing_byte = b""
                    if not chunk:
                        continue

                    chunk_ms = int(round((len(chunk) / BYTES_PER_MS)))
                    arr = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
                    chunk_rms = float(np.sqrt(np.mean(np.square(arr)) + 1e-12))

                    if chunk_rms >= rms_threshold:
                        if not speech_started:
                            speech_started = True
                            speech_start_ms = stream_ms
                            last_partial_infer_t = time.monotonic()
                        last_speech_ms = stream_ms + chunk_ms
                        utterance_pcm.extend(chunk)
                    elif speech_started:
                        utterance_pcm.extend(chunk)

                    stream_ms += chunk_ms

                    if speech_started:
                        silence_ms = stream_ms - last_speech_ms
                        utt_dur_ms = len(utterance_pcm) / BYTES_PER_MS
                        if silence_ms >= endpoint_silence_ms:
                            await emit_utterance(is_final=True, reason="vad_endpoint")
                        elif utt_dur_ms >= settings.max_utterance_sec * 1000:
                            await emit_utterance(is_final=True, reason="max_utterance")
                        elif (
                            utt_dur_ms >= 320
                            and (len(utterance_pcm) - last_partial_bytes) >= BYTES_PER_MS * 180
                            and (time.monotonic() - last_partial_infer_t) * 1000.0 >= partial_interval_ms
                        ):
                            await emit_utterance(is_final=False)

                elif msg.get("text") is not None:
                    raw_txt = msg["text"].strip()
                    if raw_txt == "Done":
                        await emit_utterance(is_final=True, reason="stream_end")
                        await ws.send_json({"type": "done", "timestamp": utc_now_iso()})
                        await ws.close(code=1000)
                        break
                    try:
                        cmd = json.loads(raw_txt)
                    except Exception:
                        continue
                    ctype = str(cmd.get("type", "")).lower()
                    if ctype == "ping":
                        await ws.send_json({"type": "pong", "ts": cmd.get("ts"), "timestamp": utc_now_iso()})
                    elif ctype == "pong":
                        continue
                    elif ctype == "config":
                        if isinstance(cmd.get("language"), str):
                            language = cmd["language"]
                        if isinstance(cmd.get("partialIntervalMs"), (int, float)) and cmd["partialIntervalMs"] >= 200:
                            partial_interval_ms = int(cmd["partialIntervalMs"])
                        if isinstance(cmd.get("endpointSilenceMs"), (int, float)) and cmd["endpointSilenceMs"] >= 250:
                            endpoint_silence_ms = int(cmd["endpointSilenceMs"])
                    elif ctype == "flush":
                        await emit_utterance(is_final=True, reason="client_flush")
                    elif ctype == "end":
                        await emit_utterance(is_final=True, reason="stream_end")
                        await ws.send_json({"type": "done", "timestamp": utc_now_iso()})
                        await ws.close(code=1000)
                        break
        except WebSocketDisconnect:
            pass
        finally:
            closed = True
            ka_task.cancel()
            utterance_pcm.clear()

    return BearerAuthAsgiMiddleware(app, api_key=settings.api_key, allow_query_token=settings.allow_query_token)


def main() -> int:
    parser = argparse.ArgumentParser(description="CueX Colab GPU ASR HTTPS/WSS Server")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--model", default=None)
    args = parser.parse_args()

    settings = ServerSettings()
    if args.host:
        settings.host = args.host
    if args.port:
        settings.port = args.port
    if args.model:
        settings.model_id = args.model

    if not settings.api_key or len(settings.api_key) < 16:
        logger.error("COLAB_ASR_API_KEY must be set to a random secret (>= 16 chars). Refusing insecure startup.")
        return 2

    cert_file, key_file = ensure_ephemeral_tls_cert(settings)
    engine = GpuAsrEngine(settings)
    engine.load_and_warmup()

    asgi_app = create_app(settings, engine)

    def handle_sigterm(_signum: int, _frame: Any) -> None:
        logger.info("Received shutdown signal; exiting cleanly.")
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    uvicorn.run(
        asgi_app,
        host=settings.host,
        port=settings.port,
        ssl_certfile=cert_file,
        ssl_keyfile=key_file,
        ws_ping_interval=15.0,
        ws_ping_timeout=20.0,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
