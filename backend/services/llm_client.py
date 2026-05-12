from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import urllib.error
import urllib.request
from typing import Any
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel


Provider = Literal["openai", "deepseek", "openai-compatible", "custom"]

DEFAULT_LLM_BASE_URL = "https://api.deepseek.com"
DEFAULT_LLM_MODEL = "deepseek-v4-flash"


def _load_local_env_files() -> None:
    for env_path in (
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            clean_key = key.strip()
            clean_value = value.strip().strip('"').strip("'")
            if clean_key and clean_key not in os.environ:
                os.environ[clean_key] = clean_value


_load_local_env_files()


class LlmTestRequest(BaseModel):
    provider: Provider
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class LlmTestResponse(BaseModel):
    success: bool
    message: str


def call_chat_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int = 800,
    temperature: float = 0.2,
    timeout: int = 120,
    response_format_json: bool = False,
) -> dict[str, Any]:
    clean_api_key, clean_base_url, clean_model = resolve_llm_config(
        api_key=api_key,
        base_url=base_url,
        model=model,
    )

    model_name_warning = get_model_name_warning(clean_model)
    if model_name_warning:
        raise ValueError(model_name_warning)

    endpoint = f"{clean_base_url}/chat/completions"
    payload = build_chat_completion_payload(
        model=clean_model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        response_format_json=response_format_json,
    )

    try:
        return _post_chat_completion(
            endpoint=endpoint,
            payload=payload,
            api_key=clean_api_key,
            timeout=timeout,
        )
    except urllib.error.HTTPError as error:
        if error.code == 400 and response_format_json:
            retry_payload = build_chat_completion_payload(
                model=clean_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format_json=False,
            )
            return _post_chat_completion(
                endpoint=endpoint,
                payload=retry_payload,
                api_key=clean_api_key,
                timeout=timeout,
            )

        raise


def test_llm_connection(request: LlmTestRequest) -> LlmTestResponse:
    try:
        api_key, base_url, model = resolve_llm_config(
            api_key=request.api_key,
            base_url=request.base_url,
            model=request.model,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None

    model_name_warning = get_model_name_warning(model)
    if model_name_warning:
        raise HTTPException(status_code=400, detail=model_name_warning)

    endpoint = f"{base_url}/chat/completions"
    payload = build_chat_completion_payload(
        model=model,
        messages=[
            {"role": "system", "content": "你是一个连接测试助手。"},
            {"role": "user", "content": "请只回复：连接成功"},
        ],
        max_tokens=20,
        temperature=0.2,
    )
    http_request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(http_request, timeout=20) as response:
            if 200 <= response.status < 300:
                return LlmTestResponse(success=True, message="连接成功，模型可用。")
    except urllib.error.HTTPError as error:
        _raise_http_error(error)
    except (TimeoutError, socket.timeout):
        raise HTTPException(status_code=504, detail="连接超时，请检查网络或服务商状态。") from None
    except urllib.error.URLError as error:
        if isinstance(error.reason, socket.timeout):
            raise HTTPException(status_code=504, detail="连接超时，请检查网络或服务商状态。") from None
        raise HTTPException(
            status_code=502,
            detail="连接失败，请检查 API Key、Base URL、模型名称或网络环境。",
        ) from None

    raise HTTPException(
        status_code=502,
        detail="连接失败，请检查 API Key、Base URL、模型名称或网络环境。",
    )



def resolve_llm_config(
    *,
    api_key: str = "",
    base_url: str = "",
    model: str = "",
) -> tuple[str, str, str]:
    clean_api_key = api_key.strip()
    clean_base_url = base_url.strip().rstrip("/")
    clean_model = model.strip()

    if clean_api_key:
        if not clean_base_url:
            raise ValueError("API Base URL is required")
        if not clean_model:
            raise ValueError("Model name is required")
        return clean_api_key, clean_base_url, clean_model

    hosted_api_key = (
        os.getenv("DEEPSEEK_API_KEY")
        or os.getenv("DEFAULT_LLM_API_KEY")
        or ""
    ).strip()
    if not hosted_api_key:
        raise ValueError("API Key is required")

    hosted_base_url = (
        os.getenv("DEEPSEEK_BASE_URL")
        or os.getenv("DEFAULT_LLM_BASE_URL")
        or DEFAULT_LLM_BASE_URL
    ).strip().rstrip("/")
    hosted_model = (
        os.getenv("DEEPSEEK_MODEL")
        or os.getenv("DEFAULT_LLM_MODEL")
        or DEFAULT_LLM_MODEL
    ).strip()
    return hosted_api_key, hosted_base_url, hosted_model


def has_hosted_llm_default() -> bool:
    return bool(
        (
            os.getenv("DEEPSEEK_API_KEY")
            or os.getenv("DEFAULT_LLM_API_KEY")
            or ""
        ).strip()
    )

def _raise_http_error(error: urllib.error.HTTPError) -> None:
    detail = describe_http_error(error)
    status_code = error.code if error.code in {400, 401, 403, 404} else 502

    if error.code == 408:
        status_code = 504

    raise HTTPException(status_code=status_code, detail=detail) from None


def build_chat_completion_payload(
    *,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    response_format_json: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
    }

    if response_format_json:
        payload["response_format"] = {"type": "json_object"}

    if is_gpt5_model(model):
        payload["max_completion_tokens"] = max_tokens
        payload["reasoning_effort"] = "none"
        return payload

    payload["max_tokens"] = max_tokens
    payload["temperature"] = temperature
    return payload


def _post_chat_completion(
    *,
    endpoint: str,
    payload: dict[str, Any],
    api_key: str,
    timeout: int,
) -> dict[str, Any]:
    http_request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(http_request, timeout=timeout) as response:
        raw_body = response.read().decode("utf-8")
        return json.loads(raw_body)


def is_gpt5_model(model: str) -> bool:
    return model.strip().lower().startswith("gpt-5")


def get_model_name_warning(model: str) -> str | None:
    normalized = model.strip().lower().replace(" ", "").replace("_", "")
    if "gpt5" in normalized and not normalized.startswith("gpt-5"):
        return (
            "模型名称可能不正确。请确认模型 ID 是否为服务商实际支持的名称，"
            "例如 gpt-5.2、gpt-5-mini、gpt-4.1 或 gpt-4o。"
        )

    return None


def describe_http_error(error: urllib.error.HTTPError) -> str:
    if error.code in {401, 403}:
        return "认证失败，请检查 API Key 是否正确"

    if error.code == 404:
        return "接口或模型不存在，请检查 Base URL 和模型名称"

    if error.code == 408:
        return "请求超时，请检查网络或服务商状态"

    message = _extract_http_error_message(error)
    if error.code == 400:
        if message:
            return f"服务商返回 HTTP 400：{message}"

        return "服务商返回 HTTP 400，可能是模型名称或请求参数不兼容。"

    if message:
        return f"服务商返回 HTTP {error.code}：{message}"

    return f"未知错误：服务商返回 HTTP {error.code}"


def _extract_http_error_message(error: urllib.error.HTTPError) -> str | None:
    try:
        raw_body = error.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    if not raw_body.strip():
        return None

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return raw_body.strip()

    if isinstance(payload, dict):
        raw_error = payload.get("error")
        if isinstance(raw_error, dict):
            message = raw_error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()

        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()

        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()

    return raw_body.strip()
