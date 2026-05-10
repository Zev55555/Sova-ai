from __future__ import annotations

import json
import re
import socket
import urllib.error
from typing import Any, Literal

from pydantic import Field

from services.analysis_planner import (
    AnalysisPlanRequest,
    AnalysisPlanResponse,
    AnalysisStep,
    FieldMapping,
    generate_analysis_plan,
)
from services.llm_client import Provider, call_chat_completion, describe_http_error


class LlmAnalysisPlanRequest(AnalysisPlanRequest):
    supported_analysis: list[str] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)
    provider: Provider = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class LlmAnalysisPlanResponse(AnalysisPlanResponse):
    source: Literal["llm", "fallback"]
    fallback_reason: str | None = None


FIELD_MAPPING_STATUSES = {"matched", "partial", "missing"}
ANALYSIS_STEP_STATUSES = {"ready", "partial", "blocked"}


def generate_analysis_plan_with_llm(
    request: LlmAnalysisPlanRequest,
) -> LlmAnalysisPlanResponse:
    missing_config_reason = _get_missing_config_reason(request)
    if missing_config_reason:
        return _fallback_response(request, missing_config_reason)

    try:
        raw_response = call_chat_completion(
            api_key=request.api_key,
            base_url=request.base_url,
            model=request.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个资深中文数据分析师。你的任务是根据用户已澄清的业务指标异动问题和上传数据 schema，"
                        "生成一份结构化、可执行、谨慎表达的分析计划。请严格返回 JSON，不要输出 Markdown，"
                        "不要输出 ```json，不要解释，不要输出任何 JSON 外的文字，不要生成 SQL，"
                        "不要下因果结论。"
                    ),
                },
                {
                    "role": "user",
                    "content": _build_analysis_plan_prompt(request),
                },
            ],
            max_tokens=3200,
            temperature=0.2,
            response_format_json=True,
        )
        content = _extract_message_content(raw_response)
        parsed = _parse_json_object(content)
        return _validate_llm_result(parsed, request)
    except Exception as error:
        return _fallback_response(request, _get_failure_reason(error))


def _fallback_response(
    request: LlmAnalysisPlanRequest,
    reason: str,
) -> LlmAnalysisPlanResponse:
    fallback = generate_analysis_plan(
        AnalysisPlanRequest(
            business_problem=request.business_problem,
            metric_definition=request.metric_definition,
            comparison_period=request.comparison_period,
            dimensions=request.dimensions,
            change_factors=request.change_factors,
            uploaded_schema=request.uploaded_schema,
        )
    )
    return LlmAnalysisPlanResponse(
        **fallback.model_dump(),
        source="fallback",
        fallback_reason=reason,
    )


def _get_missing_config_reason(request: LlmAnalysisPlanRequest) -> str | None:
    if not request.api_key.strip():
        return "API Key 缺失"

    if not request.base_url.strip():
        return "Base URL 缺失"

    if not request.model.strip():
        return "模型名称缺失"

    return None


def _build_analysis_plan_prompt(request: LlmAnalysisPlanRequest) -> str:
    schema_summary = _compact_schema(request.uploaded_schema)
    return f"""请基于以下上下文生成分析计划。

用户业务问题：
{request.business_problem or "未填写"}

指标口径：
{request.metric_definition or "待确认"}

对比周期：
{request.comparison_period or "待确认"}

用户选择的分析维度：
{json.dumps(request.dimensions, ensure_ascii=False)}

近期变化因素：
{json.dumps(request.change_factors, ensure_ascii=False)}

上传数据字段 schema：
{json.dumps(schema_summary, ensure_ascii=False, indent=2)}

当前可支持分析：
{json.dumps(request.supported_analysis or request.uploaded_schema.get("supported_analysis", []), ensure_ascii=False)}

当前缺失字段提示：
{json.dumps(request.missing_requirements or request.uploaded_schema.get("missing_requirements", []), ensure_ascii=False)}

请只返回以下 JSON，不要返回 Markdown，不要输出 ```json，不要生成 SQL，不要输出最终因果结论。
你的回复必须以 {{ 开头，以 }} 结尾，不能包含任何 JSON 外的文字。
{{
  "analysis_goal": "分析目标",
  "metric_summary": {{
    "metric_definition": "指标口径",
    "comparison_period": "对比周期"
  }},
  "field_mapping": [
    {{
      "analysis_need": "分析需要",
      "matched_field": "匹配字段或 null",
      "status": "matched | partial | missing",
      "note": "说明"
    }}
  ],
  "analysis_steps": [
    {{
      "step": 1,
      "title": "步骤标题",
      "description": "步骤说明",
      "required_fields": ["字段需求"],
      "status": "ready | partial | blocked"
    }}
  ],
  "analysis_limitations": ["当前限制"],
  "next_action": "下一步建议"
}}

表达要求：
- 必须使用简体中文。
- 计划应该可执行，并和上传字段结构相关。
- 只能写“该步骤用于验证”“当前数据支持”“当前数据暂不支持”“后续需要进一步确认”等谨慎表述。
- 不要写“原因一定是”“这证明”“最终结论是”“一定导致了”。
- 不要生成 SQL。"""


def _compact_schema(uploaded_schema: dict) -> dict[str, Any]:
    files = []
    for file_schema in uploaded_schema.get("files", []):
        columns = []
        for column in file_schema.get("columns", []):
            columns.append(
                {
                    "original_name": column.get("original_name"),
                    "clean_name": column.get("clean_name"),
                    "dtype": column.get("dtype"),
                    "missing_rate": column.get("missing_rate"),
                }
            )

        files.append(
            {
                "filename": file_schema.get("filename"),
                "row_count": file_schema.get("row_count"),
                "columns": columns,
            }
        )

    return {
        "files": files,
        "supported_analysis": uploaded_schema.get("supported_analysis", []),
        "missing_requirements": uploaded_schema.get("missing_requirements", []),
    }


def _extract_message_content(raw_response: dict[str, Any]) -> str:
    choices = raw_response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise AnalysisPlanFormatError("返回字段缺失：choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise AnalysisPlanFormatError("返回字段缺失：message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise AnalysisPlanFormatError("返回字段缺失：content")

    return content.strip()


def _parse_json_object(raw_content: str) -> dict[str, Any]:
    cleaned = raw_content.strip().lstrip("\ufeff")

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    code_block = re.search(
        r"```(?:json)?\s*([\s\S]*?)\s*```",
        cleaned,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if code_block:
        try:
            parsed = json.loads(code_block.group(1))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise AnalysisPlanFormatError("模型返回内容不是合法 JSON")

    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        raise AnalysisPlanFormatError("模型返回内容不是合法 JSON") from error

    if not isinstance(parsed, dict):
        raise AnalysisPlanFormatError("模型返回内容不是合法 JSON")

    return parsed


def _validate_llm_result(
    parsed: dict[str, Any],
    request: LlmAnalysisPlanRequest,
) -> LlmAnalysisPlanResponse:
    for key in [
        "analysis_goal",
        "metric_summary",
        "field_mapping",
        "analysis_steps",
        "analysis_limitations",
        "next_action",
    ]:
        if key not in parsed:
            raise AnalysisPlanFormatError(f"返回字段缺失：{key}")

    metric_summary = parsed.get("metric_summary")
    if not isinstance(metric_summary, dict):
        raise AnalysisPlanFormatError("返回字段缺失：metric_summary")

    field_mapping = _read_field_mapping(parsed)
    analysis_steps = _read_analysis_steps(parsed)

    return LlmAnalysisPlanResponse(
        source="llm",
        fallback_reason=None,
        analysis_goal=_read_required_text(parsed, "analysis_goal"),
        metric_summary={
            "metric_definition": _read_required_text(
                metric_summary,
                "metric_definition",
            ),
            "comparison_period": _read_required_text(
                metric_summary,
                "comparison_period",
            ),
            "dimensions": request.dimensions,
            "change_factors": request.change_factors,
        },
        field_mapping=field_mapping,
        analysis_steps=analysis_steps,
        analysis_limitations=_read_text_list(parsed, "analysis_limitations"),
        next_action=_read_required_text(parsed, "next_action"),
    )


def _read_field_mapping(parsed: dict[str, Any]) -> list[FieldMapping]:
    raw_items = parsed.get("field_mapping")
    if not isinstance(raw_items, list):
        raise AnalysisPlanFormatError("返回字段缺失：field_mapping")
    if not raw_items:
        raise AnalysisPlanFormatError("返回字段缺失：field_mapping")

    items: list[FieldMapping] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            raise AnalysisPlanFormatError("返回字段缺失：field_mapping")

        status = _read_required_text(raw_item, "status")
        if status not in FIELD_MAPPING_STATUSES:
            raise AnalysisPlanFormatError("字段匹配状态不合法")

        items.append(
            FieldMapping(
                analysis_need=_read_required_text(raw_item, "analysis_need"),
                matched_field=_read_optional_text(raw_item, "matched_field"),
                status=status,
                note=_read_required_text(raw_item, "note"),
            )
        )

    return items


def _read_analysis_steps(parsed: dict[str, Any]) -> list[AnalysisStep]:
    raw_items = parsed.get("analysis_steps")
    if not isinstance(raw_items, list):
        raise AnalysisPlanFormatError("analysis_steps 结构不合法")
    if not raw_items:
        raise AnalysisPlanFormatError("analysis_steps 结构不合法")

    items: list[AnalysisStep] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            raise AnalysisPlanFormatError("analysis_steps 结构不合法")

        status = _read_required_text(raw_item, "status")
        if status not in ANALYSIS_STEP_STATUSES:
            raise AnalysisPlanFormatError("分析步骤状态不合法")

        step = raw_item.get("step")
        if not isinstance(step, int):
            raise AnalysisPlanFormatError("返回字段缺失：step")

        items.append(
            AnalysisStep(
                step=step,
                title=_read_required_text(raw_item, "title"),
                description=_read_required_text(raw_item, "description"),
                required_fields=_read_text_list(raw_item, "required_fields"),
                status=status,
            )
        )

    return items


def _read_required_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise AnalysisPlanFormatError(f"返回字段缺失：{key}")
    return value.strip()


def _read_optional_text(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        clean_value = value.strip()
        if not clean_value or clean_value.lower() == "null":
            return None
        return clean_value
    raise AnalysisPlanFormatError(f"返回字段缺失：{key}")


def _read_text_list(payload: dict[str, Any], key: str) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise AnalysisPlanFormatError(f"返回字段缺失：{key}")

    result = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise AnalysisPlanFormatError(f"返回字段缺失：{key}")
        result.append(item.strip())

    return result


def _get_failure_reason(error: Exception) -> str:
    if isinstance(error, urllib.error.HTTPError):
        return describe_http_error(error)

    if isinstance(error, (TimeoutError, socket.timeout)):
        return "请求超时，请检查网络或服务商状态"

    if isinstance(error, urllib.error.URLError):
        if isinstance(error.reason, socket.timeout):
            return "请求超时，请检查网络或服务商状态"

        return "未知错误：无法连接到服务商，请检查 Base URL 或网络环境"

    if isinstance(error, json.JSONDecodeError):
        return "模型返回内容不是合法 JSON"

    if isinstance(error, AnalysisPlanFormatError):
        return error.reason

    if isinstance(error, ValueError):
        return str(error) or "LLM 分析计划生成失败"

    return "LLM 分析计划生成失败"


class AnalysisPlanFormatError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason
