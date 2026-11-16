#!/usr/bin/env python3
"""CueX Phase 3 Google Colab JEV-Like System 1 推理服务（HTTPS + Bearer 鉴权 + llama.cpp 兼容协议）。

在 127.0.0.1:10010 启动（经由 FRP 映射到公网端口 10010），与 :10086 ASR 服务同卡共存：
  - GET  /health         （需 Bearer 鉴权；返回健康态、GPU 显存、加载耗时与 P50/P95 延迟统计）
  - GET  /ready          （需 Bearer 鉴权；就绪探针，未完成预热返回 503）
  - POST /apply-template （需 Bearer 鉴权；兼容 llama.cpp 模板格式化）
  - POST /completion     （需 Bearer 鉴权；兼容 LlamaSystemOne 单 Token 约束决策与 logprob 输出）
  - POST /v1/decide      （需 Bearer 鉴权；PyTorch 原生 head.safetensors + calibration 校验接口）

安全与数值约束：
  - 未配置 COLAB_S1_API_KEY（或长度 < 16）时拒绝不安全启动。
  - 所有 HTTP 请求在路由前执行常量时间 Bearer Token 校验，失败返回 401 UNAUTHORIZED。
  - /completion 输出“未预先加 proj.bias 且未除以 T_kind”的受限概率分布，确保客户端 LlamaSystemOne.ts
    计算 (logprob + bias[slot]) / T_kind 时绝不重复加 bias，且与 PyTorch 直接前向数值严格一致。
  - 严禁在代码中硬编码密钥、FRP 令牌、公网 IP 或个人主目录路径。
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import hmac
import ipaddress
import json
import logging
import math
import os
import re
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
import uvicorn
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from peft import PeftModel
from safetensors import safe_open
from transformers import AutoModelForCausalLM, AutoTokenizer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cuex-colab-jev-s1")


def utc_now_iso() -> str:
    """返回标准 UTC ISO-8601 时间戳。"""
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class S1ServerSettings:
    """System 1 服务端运行配置（从环境变量读取，无默认密钥）。"""

    host: str = os.environ.get("COLAB_S1_HOST", "127.0.0.1")
    port: int = int(os.environ.get("COLAB_S1_PORT", "10010"))
    model_id: str = os.environ.get("COLAB_S1_MODEL", "autotrust/JEV-27B")
    model_dir: str = os.environ.get("COLAB_S1_MODEL_DIR", "/opt/cuex-jev/model")
    adapter_dir: str = os.environ.get("COLAB_S1_ADAPTER_DIR", "")
    device: str = os.environ.get("COLAB_S1_DEVICE", "cuda:0")
    api_key: str = os.environ.get("COLAB_S1_API_KEY", "")
    tls_dir: str = os.environ.get("COLAB_S1_TLS_DIR", "/tmp/cuex-asr-tls")
    tls_cert: str = os.environ.get("COLAB_S1_TLS_CERT", "/tmp/cuex-asr-tls/cert.pem")
    tls_key: str = os.environ.get("COLAB_S1_TLS_KEY", "/tmp/cuex-asr-tls/key.pem")
    tls_san_ips: str = os.environ.get("COLAB_S1_TLS_SAN_IPS", "127.0.0.1")
    tls_san_dns: str = os.environ.get("COLAB_S1_TLS_SAN_DNS", "localhost")
    infer_timeout_sec: float = float(os.environ.get("COLAB_S1_INFER_TIMEOUT_SEC", "15"))
    max_prompt_tokens: int = int(os.environ.get("COLAB_S1_MAX_PROMPT_TOKENS", "4096"))
    max_request_bytes: int = int(os.environ.get("COLAB_S1_MAX_REQUEST_BYTES", str(2 * 1024 * 1024)))


def ensure_ephemeral_tls_cert(settings: S1ServerSettings) -> tuple[str, str]:
    """若目标路径已有有效 TLS 证书与私钥则直接复用；否则生成临时自签名 SAN 证书。"""
    cert_path = Path(settings.tls_cert)
    key_path = Path(settings.tls_key)
    if cert_path.is_file() and key_path.is_file():
        return str(cert_path), str(key_path)

    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "cuex-colab-jev-s1"),
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

    logger.info("已在 %s 生成临时自签名 TLS 证书", cert_path)
    return str(cert_path), str(key_path)


def parse_grammar_literals(grammar: str | None) -> list[str]:
    """解析 llama.cpp 单步规则 `root ::= "false" | "true"` 中的字符串字面量。"""
    if not grammar or not isinstance(grammar, str):
        return []
    matches = re.findall(r'"((?:[^"\\]|\\.)*)"', grammar)
    literals: list[str] = []
    for raw in matches:
        try:
            literals.append(json.loads(f'"{raw}"'))
        except Exception:
            literals.append(raw)
    return literals


class BearerAuthAsgiMiddleware:
    """在 ASGI 入口执行强制 Bearer Token 鉴权（与 start_asr.py 统一）。"""

    def __init__(self, app: Any, api_key: str):
        self.app = app
        self.api_key = api_key

    def _is_authorized(self, scope: dict[str, Any]) -> bool:
        headers = dict(scope.get("headers") or [])
        auth_val = headers.get(b"authorization", b"").decode("latin-1").strip()
        if auth_val.lower().startswith("bearer "):
            token = auth_val[7:].strip()
            if token and hmac.compare_digest(token, self.api_key):
                return True
        return False

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http" and not self._is_authorized(scope):
            payload = json.dumps({
                "ok": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Missing or invalid Bearer token",
                    "timestamp": utc_now_iso(),
                },
            }).encode("utf-8")
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


class JevSystemOneEngine:
    """封装 autotrust/JEV-27B 骨干模型 + LoRA + head.safetensors 的线程安全推理引擎。"""

    def __init__(self, settings: S1ServerSettings):
        self.settings = settings
        self.ready = False
        self.lifecycle_state = "starting"
        self.model_id = settings.model_id
        self.gpu_name = "unavailable"
        self.cuda_version = torch.version.cuda or "unknown"
        self.load_time_sec = 0.0
        self.warmup_latency_ms = 0.0

        # 运行指标统计
        self.total_requests = 0
        self.total_input_tokens = 0
        self.recent_latencies_ms: list[float] = []

        # 模型与校准元数据句柄
        self.tokenizer: Any = None
        self.peft_model: Any = None
        self.backbone: Any = None
        self.lm_head: Any = None
        self.head_weight: torch.Tensor | None = None  # shape: (24, hidden_size)
        self.head_bias: torch.Tensor | None = None    # shape: (24,)
        self.verbalizer_ids: list[int] = []
        self.vid_to_slot: dict[int, int] = {}
        self.slots_meta: dict[str, Any] = {}
        self.per_kind_temp: dict[str, float] = {"noul": 1.0, "score": 1.0, "choice": 1.0}
        self.head_verified = False

        # 单线程专属 GPU 执行器，避免混合注意力状态并发冲突
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cuex-jev-gpu")
        self._gpu_lock = asyncio.Semaphore(1)

    def _resolve_model_root(self) -> Path:
        local_dir = Path(self.settings.model_dir)
        if local_dir.is_dir() and (local_dir / "config.json").is_file():
            return local_dir
        raise FileNotFoundError(f"未找到本地 JEV 模型目录: {local_dir}")

    def load_and_warmup(self) -> None:
        """加载基础模型、LoRA 适配器、24 槽线性决策头并执行校准完整性验证与预热。"""
        if not torch.cuda.is_available():
            self.lifecycle_state = "unavailable"
            raise RuntimeError("System 1 需要 CUDA GPU 环境，当前不可用")

        self.gpu_name = torch.cuda.get_device_name(0)
        t0 = time.perf_counter()

        model_root = self._resolve_model_root()
        adapter_dir = Path(self.settings.adapter_dir) if self.settings.adapter_dir else (model_root / "adapter")
        if not adapter_dir.is_dir():
            raise FileNotFoundError(f"未找到 LoRA 适配器目录: {adapter_dir}")

        head_path = model_root / "head.safetensors"
        calib_path = model_root / "calibration.json"
        dec_head_json_path = model_root / "adapter_vllm" / "decision_head.json"
        if not head_path.is_file() or not calib_path.is_file() or not dec_head_json_path.is_file():
            raise FileNotFoundError("缺少 head.safetensors / calibration.json / adapter_vllm/decision_head.json")

        # 读取决策槽元数据与温度缩放参数
        dec_meta = json.loads(dec_head_json_path.read_text(encoding="utf-8"))
        calib_meta = json.loads(calib_path.read_text(encoding="utf-8"))
        self.verbalizer_ids = [int(v) for v in dec_meta["verbalizer_ids"]]
        self.vid_to_slot = {vid: idx for idx, vid in enumerate(self.verbalizer_ids)}
        self.slots_meta = dec_meta["slots"]
        self.per_kind_temp = {k: float(v) for k, v in calib_meta["per_kind"].items()}

        # 读取 head.safetensors 并与 decision_head.json 的 bias 做一致性校验
        with safe_open(str(head_path), framework="pt") as sf:
            w = sf.get_tensor("proj.weight").to(dtype=torch.float32, device=self.settings.device)
            b = sf.get_tensor("proj.bias").to(dtype=torch.float32, device=self.settings.device)
        expected_bias = torch.tensor(dec_meta["bias"], dtype=torch.float32, device=self.settings.device)
        max_bias_diff = float((b - expected_bias).abs().max().item())
        if max_bias_diff > 1e-6:
            raise RuntimeError(f"head.safetensors proj.bias 与 decision_head.json 不一致: max_diff={max_bias_diff}")
        self.head_weight = w
        self.head_bias = b
        self.head_verified = True

        # 加载分词器、BF16 骨干模型和 PEFT LoRA
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_root))
        base_model = AutoModelForCausalLM.from_pretrained(
            str(model_root),
            dtype=torch.bfloat16,
            device_map=self.settings.device,
        )
        # 屏蔽 peft 对旧版预装 torchao 0.10.0 的可选量化检查（本服务以原生 BF16 加载，不使用 torchao）
        import peft.import_utils as _peft_import_utils
        import peft.tuners.lora.torchao as _peft_lora_torchao
        _peft_import_utils.is_torchao_available = lambda *args, **kwargs: False
        _peft_lora_torchao.is_torchao_available = lambda *args, **kwargs: False

        self.peft_model = PeftModel.from_pretrained(base_model, str(adapter_dir))
        self.peft_model.eval()
        # 获取底座骨干和 lm_head 引用；前向时直接取骨干末层隐状态以跳过 24.8 万词表全量 GEMM
        unwrapped = self.peft_model.get_base_model()
        self.backbone = unwrapped.model
        self.lm_head = unwrapped.lm_head

        self.load_time_sec = round(time.perf_counter() - t0, 3)

        # 执行一次典型短提示预热，消除首帧 CUDA Kernel 编译冷启动抖动
        tw0 = time.perf_counter()
        warmup_prompt = (
            "[kind] noul\n"
            "[state] warmup check\n"
            "[question] Does speaker need a cue?\n"
            "[options]\nfalse\ntrue\n"
            "[decision]:"
        )
        self._complete_sync(
            prompt=warmup_prompt,
            logit_bias=[[3721, 100], [1802, 100]],
            grammar='root ::= "false" | "true"',
            n_probs=32,
            temperature=1.0,
            lora_scale=1.0,
        )
        self.warmup_latency_ms = round((time.perf_counter() - tw0) * 1000.0, 2)
        self.ready = True
        self.lifecycle_state = "ready"
        logger.info(
            "模型 %s 已就绪于 %s (加载=%.3fs, 预热=%.2fms, head_bias_diff=%.2e)",
            self.model_id,
            self.gpu_name,
            self.load_time_sec,
            self.warmup_latency_ms,
            max_bias_diff,
        )

    def _forward_last_hidden(self, input_ids: torch.Tensor, use_lora: bool) -> torch.Tensor:
        """在禁用或启用 LoRA 的情况下前向推理并提取最后一个 token 隐状态（float32）。"""
        with torch.inference_mode():
            if use_lora:
                # PeftModel 默认启用已加载的 LoRA 适配器，直接走底座骨干跳过 24.8 万词表 lm_head
                out = self.backbone(input_ids=input_ids, use_cache=False)
            else:
                # 在临时上下文内禁用 adapter，推理原生基础模型分布
                with self.peft_model.disable_adapter():
                    out = self.backbone(input_ids=input_ids, use_cache=False)
            hidden = out.last_hidden_state[:, -1, :].squeeze(0).to(dtype=torch.float32)
            return hidden

    def _encode_prompt(self, prompt: str) -> torch.Tensor:
        encoded = self.tokenizer(prompt, return_tensors="pt", add_special_tokens=False)
        input_ids = encoded["input_ids"]
        if input_ids.shape[1] > self.settings.max_prompt_tokens:
            # 超长提示从左侧截断，保留最近的对话状态与选项尾缀
            input_ids = input_ids[:, -self.settings.max_prompt_tokens :]
        return input_ids.to(self.settings.device)

    def _resolve_candidate_tokens(
        self,
        logit_bias: list[Any] | None,
        grammar: str | None,
    ) -> tuple[list[int], dict[int, float]]:
        """解析候选 token IDs 及其对应的请求级 logit_bias。"""
        bias_map: dict[int, float] = {}
        if isinstance(logit_bias, list):
            for item in logit_bias:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    bias_map[int(item[0])] = float(item[1])

        grammar_lits = parse_grammar_literals(grammar)
        cand_ids: list[int] = []
        seen: set[int] = set()

        # 若 logit_bias 中已明确限定了正偏置候选 token，优先使用其顺序并与 grammar 对齐
        for tid, bval in bias_map.items():
            if bval > -1e5 and tid not in seen:
                cand_ids.append(tid)
                seen.add(tid)

        if not cand_ids and grammar_lits:
            for lit in grammar_lits:
                ids = self.tokenizer.encode(lit, add_special_tokens=False)
                if len(ids) == 1:
                    tid = int(ids[0])
                    if tid not in seen:
                        cand_ids.append(tid)
                        seen.add(tid)
                else:
                    # 处理如 " A" 在特定分词器下可能切分的问题：取与常见槽位或末 token 匹配
                    stripped_ids = self.tokenizer.encode(lit.strip(), add_special_tokens=False)
                    if stripped_ids:
                        tid = int(stripped_ids[-1])
                        if tid not in seen:
                            cand_ids.append(tid)
                            seen.add(tid)

        return cand_ids, bias_map

    def _complete_sync(
        self,
        prompt: str,
        logit_bias: list[Any] | None = None,
        grammar: str | None = None,
        n_probs: int = 32,
        temperature: float = 1.0,
        lora_scale: float = 1.0,
    ) -> dict[str, Any]:
        """执行单 token 约束推理，返回与 llama.cpp /completion 完全兼容的 JSON 结构体。"""
        t0 = time.perf_counter()
        input_ids = self._encode_prompt(prompt)
        n_prompt_tokens = int(input_ids.shape[1])

        use_lora = lora_scale > 0.0
        hidden = self._forward_last_hidden(input_ids, use_lora=use_lora)
        cand_ids, bias_map = self._resolve_candidate_tokens(logit_bias, grammar)

        # 关键数值路径判断：
        # 当启用 LoRA 且所有候选 token 均属于 JEV-27B 24 槽 verbalizer_ids 时，
        # 使用 head.safetensors 的 W @ h（严格不加 proj.bias，避免与 LlamaSystemOne.ts 的 +bias 重复叠加！）
        use_jev_head = (
            use_lora
            and len(cand_ids) > 0
            and all(tid in self.vid_to_slot for tid in cand_ids)
        )

        if use_jev_head:
            assert self.head_weight is not None
            slot_indices = [self.vid_to_slot[tid] for tid in cand_ids]
            w_sub = self.head_weight[slot_indices]  # (K, hidden_size)
            raw_logits = torch.matmul(w_sub, hidden)  # 仅线性投影 W @ h，不含 proj.bias！
            # 对客户端同一批次传入的恒定正偏置（如 +100）去均值以保留相对差异且防止数值溢出
            if cand_ids:
                req_biases = torch.tensor([bias_map.get(tid, 0.0) for tid in cand_ids], dtype=torch.float32, device=raw_logits.device)
                req_biases = req_biases - req_biases.max()
                raw_logits = raw_logits + req_biases
            temp = max(float(temperature), 1e-4)
            scaled_logits = raw_logits / temp
            log_probs = F.log_softmax(scaled_logits, dim=-1)
            probs = torch.exp(log_probs)
            eval_ids = cand_ids
        elif cand_ids:
            # 通用受限候选集：对 lm_head 仅取目标行向量做 GEMV，省去 24 万词表全计算
            lm_w = self.lm_head.weight[cand_ids].to(dtype=torch.float32)
            raw_logits = torch.matmul(lm_w, hidden)
            if getattr(self.lm_head, "bias", None) is not None:
                raw_logits = raw_logits + self.lm_head.bias[cand_ids].to(dtype=torch.float32)
            req_biases = torch.tensor([bias_map.get(tid, 0.0) for tid in cand_ids], dtype=torch.float32, device=raw_logits.device)
            req_biases = req_biases - req_biases.max()
            scaled_logits = (raw_logits + req_biases) / max(float(temperature), 1e-4)
            log_probs = F.log_softmax(scaled_logits, dim=-1)
            probs = torch.exp(log_probs)
            eval_ids = cand_ids
        else:
            # 无候选限制时回退到全词表 top-K
            full_logits = F.linear(hidden.to(self.lm_head.weight.dtype), self.lm_head.weight, getattr(self.lm_head, "bias", None)).float()
            scaled_logits = full_logits / max(float(temperature), 1e-4)
            full_log_probs = F.log_softmax(scaled_logits, dim=-1)
            k = min(max(int(n_probs), 1), full_log_probs.shape[-1])
            top_vals, top_idxs = torch.topk(full_log_probs, k=k)
            eval_ids = [int(i) for i in top_idxs.tolist()]
            log_probs = top_vals
            probs = torch.exp(log_probs)

        if self.settings.device.startswith("cuda"):
            torch.cuda.synchronize(self.settings.device)
        infer_ms = (time.perf_counter() - t0) * 1000.0

        probs_list = probs.tolist()
        log_probs_list = log_probs.tolist()
        entries = []
        for tid, p_val, lp_val in zip(eval_ids, probs_list, log_probs_list):
            tok_str = self.tokenizer.decode([tid], skip_special_tokens=False)
            entries.append({
                "id": int(tid),
                "token": tok_str,
                "tok_str": tok_str,
                "prob": float(p_val),
                "logprob": float(lp_val),
            })
        entries.sort(key=lambda x: x["prob"], reverse=True)
        top_entries = entries[: max(int(n_probs), len(entries))]
        best_tok = top_entries[0]["token"] if top_entries else ""

        return {
            "content": best_tok,
            "model": self.model_id,
            "stop": True,
            "tokens_evaluated": n_prompt_tokens,
            "tokens_predicted": 1,
            "tokens_cached": 0,
            "timings": {
                "prompt_n": n_prompt_tokens,
                "prompt_ms": round(infer_ms, 2),
                "predicted_n": 1,
                "predicted_ms": 0.0,
            },
            "completion_probabilities": [
                {
                    "content": best_tok,
                    "top_probs": top_entries,
                    "top_logprobs": top_entries,
                    "probs": top_entries,
                }
            ],
            "probs": [
                {
                    "content": best_tok,
                    "top_probs": top_entries,
                    "probs": top_entries,
                }
            ],
            "latencyMs": round(infer_ms, 2),
            "headFormula": "unbiased_head_proj(W@h)" if use_jev_head else "lm_head_subset",
        }

    def _decide_direct_sync(self, kind: str, state: str, question: str, options: list[str] | None) -> dict[str, Any]:
        """PyTorch 原生直接前向（含 W@h + proj.bias 及除以 T_kind），用于数值对齐校验。"""
        t0 = time.perf_counter()
        if kind == "noul":
            labels = ["false", "true"]
            lo, hi = self.slots_meta["ranges"]["noul"]
            opt_lines = "\n".join(labels)
        elif kind == "score":
            labels = ["0", "1", "2", "3", "4", "5"]
            lo, hi = self.slots_meta["ranges"]["score"]
            opt_lines = "\n".join(labels)
        elif kind == "choice":
            if not options or not (2 <= len(options) <= 16):
                raise ValueError("choice 需要 2 到 16 个选项")
            labels = options
            lo = int(self.slots_meta["ranges"]["choice"][0])
            hi = lo + len(options)
            slot_verbs = self.slots_meta["verbalizers"][lo:hi]
            opt_lines = "\n".join(f"{slot_verbs[i]}) {opt}" for i, opt in enumerate(options))
        else:
            raise ValueError(f"不支持的决策类型 kind={kind}")

        prompt = f"[kind] {kind}\n[state] {state}\n[question] {question}\n[options]\n{opt_lines}\n[decision]:"
        input_ids = self._encode_prompt(prompt)
        hidden = self._forward_last_hidden(input_ids, use_lora=True)

        assert self.head_weight is not None and self.head_bias is not None
        # PyTorch 原生线性分类头计算：logits = (W @ h + b) / T_kind
        full_head_logits = torch.matmul(self.head_weight, hidden) + self.head_bias
        temp = float(self.per_kind_temp[kind])
        slot_probs = F.softmax(full_head_logits[lo:hi] / temp, dim=-1).tolist()

        if self.settings.device.startswith("cuda"):
            torch.cuda.synchronize(self.settings.device)
        infer_ms = (time.perf_counter() - t0) * 1000.0
        best_idx = max(range(len(slot_probs)), key=slot_probs.__getitem__)
        return {
            "ok": True,
            "kind": kind,
            "options": labels,
            "probabilities": {lab: float(p) for lab, p in zip(labels, slot_probs)},
            "choice": labels[best_idx],
            "choice_index": best_idx,
            "temperature": temp,
            "inputTokens": int(input_ids.shape[1]),
            "latencyMs": round(infer_ms, 2),
            "model": self.model_id,
            "formula": "softmax((W@h + proj.bias) / T_kind)",
        }

    def apply_template_sync(self, messages: list[dict[str, Any]], add_generation_prompt: bool, kwargs: dict[str, Any]) -> str:
        """按 chat_template 格式化会话提示。"""
        rendered = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=add_generation_prompt,
            **(kwargs or {}),
        )
        return str(rendered)

    async def complete(
        self,
        prompt: str,
        logit_bias: list[Any] | None = None,
        grammar: str | None = None,
        n_probs: int = 32,
        temperature: float = 1.0,
        lora_scale: float = 1.0,
    ) -> dict[str, Any]:
        """异步调度 GPU 单 token 推理并累计延迟与 token 指标。"""
        if not self.ready:
            raise RuntimeError("System 1 模型尚未完成预热")
        async with self._gpu_lock:
            loop = asyncio.get_running_loop()
            res = await asyncio.wait_for(
                loop.run_in_executor(
                    self._executor,
                    self._complete_sync,
                    prompt,
                    logit_bias,
                    grammar,
                    n_probs,
                    temperature,
                    lora_scale,
                ),
                timeout=self.settings.infer_timeout_sec,
            )
        self.total_requests += 1
        self.total_input_tokens += int(res.get("tokens_evaluated", 0))
        self.recent_latencies_ms.append(float(res["latencyMs"]))
        if len(self.recent_latencies_ms) > 500:
            self.recent_latencies_ms = self.recent_latencies_ms[-500:]
        return res

    async def decide_direct(self, kind: str, state: str, question: str, options: list[str] | None) -> dict[str, Any]:
        """异步调度 PyTorch 原生线性分类头直算（用于校准对齐验收）。"""
        if not self.ready:
            raise RuntimeError("System 1 模型尚未完成预热")
        async with self._gpu_lock:
            loop = asyncio.get_running_loop()
            return await asyncio.wait_for(
                loop.run_in_executor(self._executor, self._decide_direct_sync, kind, state, question, options),
                timeout=self.settings.infer_timeout_sec,
            )

    def gpu_telemetry(self) -> dict[str, Any]:
        """采集当前 GPU 显存占用与 CUDA 版本信息。"""
        if not torch.cuda.is_available():
            return {"available": False, "name": "none"}
        free_b, total_b = torch.cuda.mem_get_info(0)
        return {
            "available": True,
            "name": self.gpu_name,
            "cudaVersion": self.cuda_version,
            "vramAllocatedMiB": round(torch.cuda.memory_allocated(0) / (1024 * 1024), 1),
            "vramReservedMiB": round(torch.cuda.memory_reserved(0) / (1024 * 1024), 1),
            "vramDeviceUsedMiB": round((total_b - free_b) / (1024 * 1024), 1),
            "vramFreeMiB": round(free_b / (1024 * 1024), 1),
            "vramTotalMiB": round(total_b / (1024 * 1024), 1),
        }

    def latency_summary(self) -> dict[str, Any]:
        """汇总近期请求 P50 / P95 / 平均延迟。"""
        if not self.recent_latencies_ms:
            return {"count": 0, "avgMs": None, "p50Ms": None, "p95Ms": None}
        s = sorted(self.recent_latencies_ms)
        n = len(s)
        return {
            "count": self.total_requests,
            "avgMs": round(sum(s) / n, 2),
            "p50Ms": s[int(0.5 * (n - 1))],
            "p95Ms": s[min(n - 1, math.ceil(0.95 * n) - 1)],
        }


def create_app(settings: S1ServerSettings, engine: JevSystemOneEngine) -> Any:
    """构建带强制 Bearer Token 鉴权的 FastAPI ASGI 应用。"""
    started_at = time.monotonic()
    app = FastAPI(title="CueX Colab JEV-27B System 1 Service", version="1.0.0", docs_url=None, redoc_url=None)

    @app.get("/health")
    async def health() -> JSONResponse:
        body = {
            "status": "ok" if engine.ready else "starting",
            "ok": engine.ready,
            "ready": engine.ready,
            "lifecycleState": engine.lifecycle_state,
            "backend": "colab-jev-s1",
            "model": engine.model_id,
            "promptFormat": "jev-v1",
            "calibrated": engine.head_verified,
            "headVerified": engine.head_verified,
            "gpu": engine.gpu_telemetry(),
            "loadTimeSec": engine.load_time_sec,
            "warmupLatencyMs": engine.warmup_latency_ms,
            "uptimeSec": round(time.monotonic() - started_at, 2),
            "metrics": {
                "totalRequests": engine.total_requests,
                "totalInputTokens": engine.total_input_tokens,
                "latency": engine.latency_summary(),
            },
            "timestamp": utc_now_iso(),
        }
        return JSONResponse(status_code=200, content=body)

    @app.get("/ready")
    async def ready() -> JSONResponse:
        status_code = 200 if engine.ready else 503
        return JSONResponse(
            status_code=status_code,
            content={
                "ready": engine.ready,
                "lifecycleState": engine.lifecycle_state,
                "model": engine.model_id,
                "promptFormat": "jev-v1",
                "calibrated": engine.head_verified,
                "gpu": engine.gpu_telemetry(),
                "timestamp": utc_now_iso(),
            },
        )

    @app.post("/apply-template")
    async def apply_template(request: Request) -> JSONResponse:
        raw_body = await request.body()
        if len(raw_body) > settings.max_request_bytes:
            return JSONResponse(status_code=413, content={"ok": False, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "Request exceeds size limit"}})
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": "Invalid JSON body"}})
        messages = payload.get("messages")
        if not isinstance(messages, list):
            return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": "Missing messages list"}})
        add_gen = bool(payload.get("add_generation_prompt", True))
        tmpl_kwargs = payload.get("chat_template_kwargs") if isinstance(payload.get("chat_template_kwargs"), dict) else {}
        prompt = engine.apply_template_sync(messages, add_gen, tmpl_kwargs)
        return JSONResponse(status_code=200, content={"prompt": prompt})

    @app.post("/completion")
    async def completion(request: Request) -> JSONResponse:
        if not engine.ready:
            return JSONResponse(status_code=503, content={"ok": False, "error": {"code": "S1_UNAVAILABLE", "message": "JEV System 1 model is starting"}})
        raw_body = await request.body()
        if len(raw_body) > settings.max_request_bytes:
            return JSONResponse(status_code=413, content={"ok": False, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "Request exceeds size limit"}})
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": "Invalid JSON body"}})

        prompt = payload.get("prompt")
        if not isinstance(prompt, str) or not prompt:
            return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": "Missing prompt string"}})

        lora_scale = 1.0
        lora_list = payload.get("lora")
        if isinstance(lora_list, list):
            if len(lora_list) == 0:
                lora_scale = 0.0
            elif isinstance(lora_list[0], dict):
                lora_scale = float(lora_list[0].get("scale", 1.0))

        try:
            res = await engine.complete(
                prompt=prompt,
                logit_bias=payload.get("logit_bias"),
                grammar=payload.get("grammar"),
                n_probs=int(payload.get("n_probs", 32)),
                temperature=float(payload.get("temperature", 1.0)),
                lora_scale=lora_scale,
            )
            return JSONResponse(status_code=200, content=res)
        except asyncio.TimeoutError:
            return JSONResponse(status_code=504, content={"ok": False, "error": {"code": "PROVIDER_TIMEOUT", "message": "JEV inference timed out"}})
        except Exception as err:
            logger.exception("System 1 /completion 异常: %s", err)
            return JSONResponse(status_code=500, content={"ok": False, "error": {"code": "INTERNAL_ERROR", "message": str(err)}})

    @app.post("/v1/decide")
    async def decide_direct(request: Request) -> JSONResponse:
        if not engine.ready:
            return JSONResponse(status_code=503, content={"ok": False, "error": {"code": "S1_UNAVAILABLE", "message": "JEV System 1 model is starting"}})
        try:
            payload = json.loads((await request.body()).decode("utf-8"))
            kind = str(payload.get("kind", ""))
            state = str(payload.get("state", ""))
            question = str(payload.get("question", ""))
            options = payload.get("options")
            res = await engine.decide_direct(kind=kind, state=state, question=question, options=options)
            return JSONResponse(status_code=200, content=res)
        except ValueError as err:
            return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": str(err)}})
        except asyncio.TimeoutError:
            return JSONResponse(status_code=504, content={"ok": False, "error": {"code": "PROVIDER_TIMEOUT", "message": "JEV decide timed out"}})

    return BearerAuthAsgiMiddleware(app, api_key=settings.api_key)


def main() -> int:
    parser = argparse.ArgumentParser(description="CueX Colab JEV-27B System 1 HTTPS Server")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--model-dir", default=None)
    args = parser.parse_args()

    settings = S1ServerSettings()
    if args.host:
        settings.host = args.host
    if args.port:
        settings.port = args.port
    if args.model_dir:
        settings.model_dir = args.model_dir

    if not settings.api_key or len(settings.api_key) < 16:
        logger.error("必须设置不少于 16 字符的随机 COLAB_S1_API_KEY，拒绝不安全启动。")
        return 2

    cert_file, key_file = ensure_ephemeral_tls_cert(settings)
    engine = JevSystemOneEngine(settings)
    engine.load_and_warmup()

    asgi_app = create_app(settings, engine)

    def handle_sigterm(_signum: int, _frame: Any) -> None:
        logger.info("收到终止信号，优雅退出 JEV System 1 服务。")
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    uvicorn.run(
        asgi_app,
        host=settings.host,
        port=settings.port,
        ssl_certfile=cert_file,
        ssl_keyfile=key_file,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
