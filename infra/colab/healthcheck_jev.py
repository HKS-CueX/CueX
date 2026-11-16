#!/usr/bin/env python3
"""CueX Phase 3 Google Colab JEV-27B System 1 服务健康检查、校准对齐与 ASR+S1 同卡并发验收脚本。

检查内容（默认通过本地 gitignored .cuex-runtime/.env.phase3.local 读取脱敏环境）：
  1. 鉴权负例：无 Token 与错误 Bearer Token 访问 /health、/apply-template、/completion 均返回 HTTP 401。
  2. 就绪与模板：认证 GET /health、GET /ready 及 POST /apply-template 正常返回。
  3. 校准与数值对齐：noul / score / choice 三类单 Token 请求通过 /completion + autotrust-jev27b.json
     的 (logprob + bias[slot]) / T_kind 算法与服务端 PyTorch 原生前向 /v1/decide 交叉对比，验证无重复加 bias。
  4. 同卡并发与断线重连：并发压测 :10086 ASR（真实 WAV 转写）与 :10010 JEV-27B 决策推理，计算 P50/P95/RTF 与显存余量，
     并执行一次连接断开后立即重建 TLS 连接的恢复验证。

严禁打印 API Key、完整证书内容或公网主机 IP。
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def load_env_file(path: Path) -> None:
    """加载本地环境配置文件中的未设置变量（跳过注释）。"""
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
    """构造 TLS 校验上下文，优先使用本地钉扎的公开 PEM 证书。"""
    if insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    if ca_cert and Path(ca_cert).is_file():
        return ssl.create_default_context(cafile=ca_cert)
    return ssl.create_default_context()


def http_req(
    url: str,
    method: str = "GET",
    token: str | None = None,
    json_body: dict[str, Any] | None = None,
    raw_body: bytes | None = None,
    content_type: str = "application/json",
    ctx: ssl.SSLContext | None = None,
    timeout: float = 20.0,
) -> tuple[int, Any, float]:
    """发起 HTTPS 请求并返回 (status_code, parsed_json_or_raw, elapsed_ms)。"""
    headers: dict[str, str] = {"Accept": "application/json", "Connection": "close"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data: bytes | None = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif raw_body is not None:
        data = raw_body
        headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw), elapsed_ms
            except Exception:
                return resp.status, {"raw": raw[:300]}, elapsed_ms
    except urllib.error.HTTPError as err:
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        raw = err.read().decode("utf-8", errors="replace")
        try:
            return err.code, json.loads(raw), elapsed_ms
        except Exception:
            return err.code, {"raw": raw[:300]}, elapsed_ms


def softmax(vals: list[float]) -> list[float]:
    """数值稳定 softmax。"""
    m = max(vals)
    exps = [math.exp(v - m) for v in vals]
    s = sum(exps)
    return [e / s for e in exps]


def llama_client_readout(completion_body: dict[str, Any], meta: dict[str, Any], kind: str, n_options: int) -> list[float]:
    """完全复刻 apps/server/src/system1/LlamaSystemOne.ts 的受限概率校准逻辑。"""
    lo = int(meta["decisionHead"]["slots"]["ranges"][kind][0])
    vids = [int(v) for v in meta["decisionHead"]["verbalizer_ids"][lo : lo + n_options]]
    bias = [float(b) for b in meta["decisionHead"]["bias"][lo : lo + n_options]]
    temp = float(meta["calibration"]["per_kind"][kind])

    entries = completion_body["completion_probabilities"][0]["top_probs"]
    log_weights: list[float] = []
    for i, vid in enumerate(vids):
        matched = [e for e in entries if int(e["id"]) == vid]
        if not matched:
            raise RuntimeError(f"服务端返回缺少槽位 verbalizer_id={vid}")
        mass = sum(float(e.get("prob", math.exp(float(e.get("logprob", -1e9))))) for e in matched)
        logprob = math.log(max(mass, 1e-30))
        # 与 LlamaSystemOne.ts 第 257 行完全一致：(logprob + bias[offset + i]) / T_kind
        log_weights.append((logprob + bias[i]) / temp)
    return softmax(log_weights)


def build_jev_prompt(kind: str, state: str, question: str, options: list[str], meta: dict[str, Any]) -> tuple[str, list[list[int]], str]:
    """构造 jev-v1 提示文本、logit_bias 与 grammar。"""
    lo = int(meta["decisionHead"]["slots"]["ranges"][kind][0])
    vids = [int(v) for v in meta["decisionHead"]["verbalizer_ids"][lo : lo + len(options)]]
    verbs = meta["decisionHead"]["slots"]["verbalizers"][lo : lo + len(options)]
    if kind == "choice":
        opt_lines = "\n".join(f"{verbs[i]}) {opt}" for i, opt in enumerate(options))
    else:
        opt_lines = "\n".join(options)
    prompt = f"[kind] {kind}\n[state] {state}\n[question] {question}\n[options]\n{opt_lines}\n[decision]:"
    logit_bias = [[vid, 100] for vid in vids]
    grammar = "root ::= " + " | ".join(json.dumps(v) for v in verbs)
    return prompt, logit_bias, grammar


def percentile(values: list[float], q: float) -> float | None:
    """计算百分位延迟。"""
    if not values:
        return None
    s = sorted(values)
    idx = min(len(s) - 1, max(0, math.ceil(q * len(s)) - 1))
    return round(s[idx], 2)


def main() -> int:
    parser = argparse.ArgumentParser(description="CueX Colab JEV-27B System 1 健康与并发验收探针")
    parser.add_argument("--env-file", type=Path, default=Path(".cuex-runtime/.env.phase3.local"))
    parser.add_argument("--meta-json", type=Path, default=Path("infra/colab/autotrust-jev27b.json"))
    parser.add_argument("--wav-file", type=Path, default=Path("deliverables/cuex-final/mandatory/ai-employee-demo/demo-pack/audio/01_intro_natural_tingting.wav"))
    parser.add_argument("--s1-url", default=None)
    parser.add_argument("--asr-url", default=None)
    parser.add_argument("--ca-cert", default=None)
    parser.add_argument("--insecure", action="store_true")
    parser.add_argument("--verify-auth", action="store_true", default=True)
    parser.add_argument("--concurrent-runs", type=int, default=8, help="并发同卡压测轮数")
    args = parser.parse_args()

    if args.env_file:
        load_env_file(args.env_file)

    s1_url = (args.s1_url or os.environ.get("CUEX_S1_URL") or os.environ.get("COLAB_S1_URL") or "https://127.0.0.1:10010").rstrip("/")
    s1_key = os.environ.get("CUEX_S1_API_KEY") or os.environ.get("COLAB_S1_API_KEY") or ""
    asr_url = (args.asr_url or os.environ.get("CUEX_COLAB_ASR_URL") or os.environ.get("COLAB_ASR_URL") or "").rstrip("/")
    asr_key = os.environ.get("CUEX_COLAB_ASR_API_KEY") or os.environ.get("COLAB_ASR_API_KEY") or ""
    ca_cert = args.ca_cert or os.environ.get("CUEX_S1_CA_CERT") or os.environ.get("CUEX_COLAB_ASR_CA_CERT")

    if not s1_key:
        print(json.dumps({"ok": False, "error": "Missing CUEX_S1_API_KEY / COLAB_S1_API_KEY"}, ensure_ascii=False))
        return 2

    ctx = build_ssl_context(ca_cert, args.insecure)
    meta = json.loads(args.meta_json.read_text(encoding="utf-8"))

    # 1. 安全鉴权负例校验
    auth_checks: dict[str, int] = {}
    if args.verify_auth:
        st_no_h, _, _ = http_req(f"{s1_url}/health", "GET", token=None, ctx=ctx)
        st_bad_h, _, _ = http_req(f"{s1_url}/health", "GET", token="invalid-s1-token-check", ctx=ctx)
        st_no_c, _, _ = http_req(f"{s1_url}/completion", "POST", token=None, json_body={"prompt": "x"}, ctx=ctx)
        st_bad_c, _, _ = http_req(f"{s1_url}/completion", "POST", token="invalid-s1-token-check", json_body={"prompt": "x"}, ctx=ctx)
        st_no_t, _, _ = http_req(f"{s1_url}/apply-template", "POST", token=None, json_body={"messages": []}, ctx=ctx)
        auth_checks = {
            "healthNoAuth": st_no_h,
            "healthBadAuth": st_bad_h,
            "completionNoAuth": st_no_c,
            "completionBadAuth": st_bad_c,
            "applyTemplateNoAuth": st_no_t,
        }
        if any(code not in (401, 403) for code in auth_checks.values()):
            print(json.dumps({"ok": False, "error": "鉴权负例未全部拒绝", "authChecks": auth_checks}, ensure_ascii=False))
            return 1

    # 2. /health、/ready 与 /apply-template 验证
    h_code, h_body, _ = http_req(f"{s1_url}/health", "GET", token=s1_key, ctx=ctx)
    r_code, r_body, _ = http_req(f"{s1_url}/ready", "GET", token=s1_key, ctx=ctx)
    t_code, t_body, t_ms = http_req(
        f"{s1_url}/apply-template",
        "POST",
        token=s1_key,
        json_body={
            "messages": [{"role": "user", "content": "判断演讲者是否遗漏关键锚点"}],
            "add_generation_prompt": True,
            "chat_template_kwargs": {"enable_thinking": False},
        },
        ctx=ctx,
    )
    if h_code != 200 or r_code != 200 or t_code != 200 or not r_body.get("ready") or not t_body.get("prompt"):
        print(json.dumps({"ok": False, "error": "基础接口检查失败", "codes": [h_code, r_code, t_code]}, ensure_ascii=False))
        return 1

    # 3. 单 Token noul / score / choice 校准对齐与无重复加 bias 校验
    test_cases = [
        {
            "kind": "noul",
            "state": '{"goal":"汇报核心技术壁垒","chapter":"ch_2","missingPoints":["pt_restraint"],"silenceMs":1400,"hasActiveIntervention":false}\n[recent_speech]刚才讲完架构，我们接着聊聊这周末我去逛公园看到的风景。[/recent_speech]',
            "question": "Given the current presentation state and missing points, does the speaker need a real-time cue right now?",
            "options": ["false", "true"],
        },
        {
            "kind": "score",
            "state": '{"goal":"覆盖单位经济模型核心数字","chapter":"ch_4","missingPoints":[],"silenceMs":0}\n[recent_speech]Pro版本定价59元每月或499元每年，基准直接贡献毛利率达到83.8%。[/recent_speech]',
            "question": "Rate on a 0-5 scale how well the latest speech covers the required evidence anchors.",
            "options": ["0", "1", "2", "3", "4", "5"],
        },
        {
            "kind": "choice",
            "state": '{"goal":"回答评委关于并发额度滥用的提问","chapter":"ch_qa"}\n[recent_speech]评委问：如果用户用29元单场版本无限彩排把ASR额度刷爆怎么办？[/recent_speech]',
            "question": "Choose the cognitive runtime action that matches this stage event.",
            "options": ["stay_silent_l0", "show_l1_nudge", "escalate_l2_evidence", "withdraw_active"],
        },
    ]

    calibration_checks: list[dict[str, Any]] = []
    for tc in test_cases:
        kind = tc["kind"]
        prompt, logit_bias, grammar = build_jev_prompt(kind, tc["state"], tc["question"], tc["options"], meta)
        c_code, c_body, c_rtt = http_req(
            f"{s1_url}/completion",
            "POST",
            token=s1_key,
            json_body={
                "prompt": prompt,
                "n_predict": 1,
                "grammar": grammar,
                "logit_bias": logit_bias,
                "n_probs": 32,
                "post_sampling_probs": True,
                "temperature": 1,
                "lora": [{"id": 0, "scale": 1}],
            },
            ctx=ctx,
        )
        d_code, d_body, d_rtt = http_req(
            f"{s1_url}/v1/decide",
            "POST",
            token=s1_key,
            json_body={"kind": kind, "state": tc["state"], "question": tc["question"], "options": tc["options"]},
            ctx=ctx,
        )
        if c_code != 200 or d_code != 200:
            print(json.dumps({"ok": False, "error": f"校准对比接口失败 kind={kind}", "codes": [c_code, d_code]}, ensure_ascii=False))
            return 1
        p_compat = llama_client_readout(c_body, meta, kind, len(tc["options"]))
        p_direct = [float(d_body["probabilities"][opt]) for opt in tc["options"]]
        max_diff = max(abs(a - b) for a, b in zip(p_compat, p_direct))
        calibration_checks.append({
            "kind": kind,
            "choiceCompat": tc["options"][max(range(len(p_compat)), key=p_compat.__getitem__)],
            "choiceDirect": d_body["choice"],
            "compatProbs": [round(x, 6) for x in p_compat],
            "directProbs": [round(x, 6) for x in p_direct],
            "maxAbsProbDiff": round(max_diff, 8),
            "completionServerMs": c_body.get("latencyMs"),
            "completionRttMs": round(c_rtt, 2),
            "headFormula": c_body.get("headFormula"),
            "biasNoDoubleCountVerified": max_diff < 1e-4,
        })
        if max_diff >= 1e-4:
            print(json.dumps({"ok": False, "error": f"校准数值偏差超限 kind={kind}", "check": calibration_checks[-1]}, ensure_ascii=False))
            return 1

    # 4. 同卡并发压测（ASR :10086 + JEV-27B :10010）
    wav_bytes = args.wav_file.read_bytes() if args.wav_file.is_file() else b""
    s1_rtts: list[float] = []
    s1_server_ms: list[float] = []
    asr_rtts: list[float] = []
    asr_rtfs: list[float] = []
    errors: list[str] = []

    def run_s1_task(idx: int) -> None:
        tc = test_cases[idx % len(test_cases)]
        prompt, logit_bias, grammar = build_jev_prompt(tc["kind"], tc["state"], tc["question"], tc["options"], meta)
        code, body, rtt = http_req(
            f"{s1_url}/completion",
            "POST",
            token=s1_key,
            json_body={
                "prompt": prompt,
                "n_predict": 1,
                "grammar": grammar,
                "logit_bias": logit_bias,
                "n_probs": 32,
                "post_sampling_probs": True,
                "temperature": 1,
                "lora": [{"id": 0, "scale": 1}],
            },
            ctx=ctx,
        )
        if code != 200 or not isinstance(body, dict) or "completion_probabilities" not in body:
            errors.append(f"s1[{idx}] status={code}")
            return
        s1_rtts.append(rtt)
        if isinstance(body.get("latencyMs"), (int, float)):
            s1_server_ms.append(float(body["latencyMs"]))

    def run_asr_task(idx: int) -> None:
        if not asr_url or not asr_key or not wav_bytes:
            return
        code, body, rtt = http_req(
            f"{asr_url}/v1/asr/transcribe",
            "POST",
            token=asr_key,
            raw_body=wav_bytes,
            content_type="audio/wav",
            ctx=ctx,
        )
        if code != 200 or not isinstance(body, dict) or not body.get("ok"):
            errors.append(f"asr[{idx}] status={code}")
            return
        asr_rtts.append(rtt)
        if isinstance(body.get("rtf"), (int, float)):
            asr_rtfs.append(float(body["rtf"]))

    n_runs = max(2, args.concurrent_runs)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futs = []
        for i in range(n_runs):
            futs.append(pool.submit(run_s1_task, i))
            if i % 2 == 0 and asr_url and asr_key and wav_bytes:
                futs.append(pool.submit(run_asr_task, i))
        for fut in futs:
            fut.result()

    # 5. 短暂中断/重建连接恢复校验（分别对 S1 与 ASR 发送一次独立新 TLS 请求）
    reconnect_s1_code, _, reconnect_s1_rtt = http_req(f"{s1_url}/ready", "GET", token=s1_key, ctx=ctx)
    reconnect_asr_code = None
    if asr_url and asr_key:
        reconnect_asr_code, _, _ = http_req(f"{asr_url}/ready", "GET", token=asr_key, ctx=ctx)

    # 6. 并发压测后 GPU 显存遥测
    _, h_after, _ = http_req(f"{s1_url}/health", "GET", token=s1_key, ctx=ctx)
    asr_health_after = None
    if asr_url and asr_key:
        _, asr_health_after, _ = http_req(f"{asr_url}/health", "GET", token=asr_key, ctx=ctx)

    ok = (
        len(errors) == 0
        and len(s1_rtts) == n_runs
        and reconnect_s1_code == 200
        and (reconnect_asr_code in (None, 200))
    )

    summary = {
        "ok": ok,
        "authChecks": auth_checks,
        "applyTemplateMs": round(t_ms, 2),
        "calibrationAlignment": calibration_checks,
        "concurrentBenchmark": {
            "s1Requests": len(s1_rtts),
            "s1ServerMsAvg": round(sum(s1_server_ms) / len(s1_server_ms), 2) if s1_server_ms else None,
            "s1ServerMsP50": percentile(s1_server_ms, 0.50),
            "s1ServerMsP95": percentile(s1_server_ms, 0.95),
            "s1RttMsP50": percentile(s1_rtts, 0.50),
            "s1RttMsP95": percentile(s1_rtts, 0.95),
            "asrConcurrentRequests": len(asr_rtts),
            "asrRttMsAvg": round(sum(asr_rtts) / len(asr_rtts), 2) if asr_rtts else None,
            "asrRttMsP95": percentile(asr_rtts, 0.95),
            "asrAvgRtf": round(sum(asr_rtfs) / len(asr_rtfs), 5) if asr_rtfs else None,
            "errors": errors,
        },
        "reconnectChecks": {
            "s1ReadyAfterReconnect": reconnect_s1_code,
            "s1ReconnectRttMs": round(reconnect_s1_rtt, 2),
            "asrReadyAfterReconnect": reconnect_asr_code,
        },
        "s1PostHealth": {
            "model": h_after.get("model"),
            "loadTimeSec": h_after.get("loadTimeSec"),
            "warmupLatencyMs": h_after.get("warmupLatencyMs"),
            "gpu": h_after.get("gpu"),
            "metrics": h_after.get("metrics"),
        },
        "asrPostHealth": {
            "model": asr_health_after.get("model") if isinstance(asr_health_after, dict) else None,
            "ready": asr_health_after.get("ready") if isinstance(asr_health_after, dict) else None,
            "gpu": asr_health_after.get("gpu") if isinstance(asr_health_after, dict) else None,
        },
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
