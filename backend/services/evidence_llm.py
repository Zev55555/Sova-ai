from __future__ import annotations

import json
import re
import socket
import urllib.error
from typing import Any, Literal

from services.evidence_generator import (
    EvidenceChain,
    EvidenceRequest,
    EvidenceResponse,
    generate_evidence,
)
from services.llm_client import Provider, call_chat_completion, describe_http_error


class LlmEvidenceRequest(EvidenceRequest):
    provider: Provider = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class LlmEvidenceResponse(EvidenceResponse):
    source: Literal["llm", "fallback"]
    fallback_reason: str | None = None


CONFIDENCE_LEVELS = {"高", "中", "低"}


def generate_evidence_with_llm(request: LlmEvidenceRequest) -> LlmEvidenceResponse:
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
                        "你是一个资深中文数据分析师。你的任务是根据用户业务问题、分析计划和 "
                        "DuckDB 执行结果，生成谨慎、可追踪、基于数据证据的证据链。"
                        "请严格返回 JSON，不要输出 Markdown，不要输出 ```json，不要解释，"
                        "不要输出任何 JSON 外的文字。你不能编造数据，不能重新计算数据，"
                        "不能生成 SQL，不能声称因果关系成立，只能根据提供的结果表总结"
                        "当前数据支持的初步发现。"
                    ),
                },
                {
                    "role": "user",
                    "content": _build_evidence_prompt(request),
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
    request: LlmEvidenceRequest,
    reason: str,
) -> LlmEvidenceResponse:
    fallback = generate_evidence(
        EvidenceRequest(
            business_problem=request.business_problem,
            metric_definition=request.metric_definition,
            comparison_period=request.comparison_period,
            dimensions=request.dimensions,
            change_factors=request.change_factors,
            analysis_plan=request.analysis_plan,
            execution_result=request.execution_result,
            metric_execution_result=request.metric_execution_result,
        )
    )
    return LlmEvidenceResponse(
        **fallback.model_dump(),
        source="fallback",
        fallback_reason=reason,
    )


def _get_missing_config_reason(request: LlmEvidenceRequest) -> str | None:
    if not request.api_key.strip():
        return "API Key 缺失"

    if not request.base_url.strip():
        return "Base URL 缺失"

    if not request.model.strip():
        return "模型名称缺失"

    return None


def _build_evidence_prompt(request: LlmEvidenceRequest) -> str:
    context = {
        "business_problem": request.business_problem,
        "metric_definition": request.metric_definition,
        "comparison_period": request.comparison_period,
        "dimensions": request.dimensions,
        "change_factors": request.change_factors,
        "analysis_plan": request.analysis_plan,
        "execution_result": _compact_execution_result(request.execution_result),
        "metric_execution_result": _compact_metric_execution_result(
            request.metric_execution_result
        ),
    }

    return f"""请基于以下上下文生成证据链：

{json.dumps(context, ensure_ascii=False, indent=2)}

请只返回以下 JSON，不要返回 Markdown，不要输出 ```json，不要解释，不要重新计算数据，不要生成 SQL，不要输出最终因果结论。
你的回复必须以 {{ 开头，以 }} 结尾，不能包含任何 JSON 外的文字。
{{
  "summary": "系统基于当前分析结果生成了初步证据链，以下内容仅代表当前数据支持的分析方向。",
  "evidence_chains": [
    {{
      "id": "evidence_1",
      "title": "证据链标题",
      "finding": "初步发现",
      "evidence": ["数据证据 1", "数据证据 2"],
      "related_table_ids": ["overall_trend"],
      "related_chart": "整体趋势变化",
      "confidence_level": "高 | 中 | 低",
      "suggested_next_check": "下一步验证建议"
    }}
  ],
  "limitations": ["当前限制"]
}}

必须遵守：
- 必须使用简体中文。
- 如果 metric_execution_result 存在，必须优先引用其中的整体指标对比、维度拆解和 Top 异动分组。
- 只能引用 execution_result 或 metric_execution_result 中已有结果、字段、表名、图表名和限制。
- 不能编造具体数值，不能重新计算数据。
- 不能生成 SQL，不能生成报告。
- 不能说“原因一定是”“这证明”“最终结论是”“一定导致了”。
- 必须使用“当前数据支持”“初步观察”“可能值得进一步检查”“建议进一步验证”“需要结合更多数据确认”等谨慎表达。
- 如果结果不足，应该写“当前结果暂不足以支持该方向的证据链，需要补充更多字段或更细粒度数据”。
"""


def _compact_execution_result(execution_result: dict) -> dict[str, Any]:
    tables = []
    for table in execution_result.get("tables", []):
        rows = table.get("rows", [])
        tables.append(
            {
                "id": table.get("id"),
                "title": table.get("title"),
                "description": table.get("description"),
                "columns": table.get("columns", []),
                "rows": rows[:10] if isinstance(rows, list) else [],
            }
        )

    return {
        "execution_summary": execution_result.get("execution_summary"),
        "tables": tables,
        "analysis_notes": execution_result.get("analysis_notes", []),
        "limitations": execution_result.get("limitations", []),
    }


def _compact_metric_execution_result(metric_execution_result: dict | None) -> dict[str, Any] | None:
    if not metric_execution_result:
        return None

    return {
        "overall_metric_comparison": metric_execution_result.get("overall_metric_comparison"),
        "top_movers": (metric_execution_result.get("top_movers") or [])[:10],
        "dimension_breakdowns": [
            {
                "dimension_field": item.get("dimension_field"),
                "dimension_label": item.get("dimension_label"),
                "rows": (item.get("rows") or [])[:10],
            }
            for item in metric_execution_result.get("dimension_breakdowns", [])
        ],
        "warnings": metric_execution_result.get("warnings", []),
        "source": metric_execution_result.get("source"),
    }


def _extract_message_content(raw_response: dict[str, Any]) -> str:
    choices = raw_response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise EvidenceFormatError("返回字段缺失：choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise EvidenceFormatError("返回字段缺失：message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise EvidenceFormatError("返回字段缺失：content")

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
        raise EvidenceFormatError("模型返回内容不是合法 JSON")

    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        raise EvidenceFormatError("模型返回内容不是合法 JSON") from error

    if not isinstance(parsed, dict):
        raise EvidenceFormatError("模型返回内容不是合法 JSON")

    return parsed


def _validate_llm_result(
    parsed: dict[str, Any],
    request: LlmEvidenceRequest,
) -> LlmEvidenceResponse:
    required_keys = [
        "summary",
        "evidence_chains",
        "limitations",
    ]
    for key in required_keys:
        if key not in parsed:
            raise EvidenceFormatError(f"返回字段缺失：{key}")

    table_ids = _execution_table_ids(request.execution_result)
    if request.metric_execution_result:
        table_ids.add("metric_spec_execution")
    chains = _read_evidence_chains(parsed, table_ids)
    limitations = _read_text_list(parsed, "limitations")

    if any(len(chain.evidence) == 0 for chain in chains):
        limitations.append("部分证据链缺少明确的数据证据，当前数据证据不足，需要补充更多字段或更细粒度结果后再验证。")

    return LlmEvidenceResponse(
        source="llm",
        fallback_reason=None,
        summary=_read_required_text(parsed, "summary"),
        evidence_chains=chains,
        limitations=_deduplicate(limitations),
    )


def _read_evidence_chains(
    parsed: dict[str, Any],
    table_ids: set[str],
) -> list[EvidenceChain]:
    raw_items = parsed.get("evidence_chains")
    if not isinstance(raw_items, list):
        raise EvidenceFormatError("evidence_chains 结构不合法")

    chains: list[EvidenceChain] = []
    for index, raw_item in enumerate(raw_items, start=1):
        if not isinstance(raw_item, dict):
            raise EvidenceFormatError("evidence_chains 结构不合法")

        confidence_level = _read_required_text(raw_item, "confidence_level")
        if confidence_level not in CONFIDENCE_LEVELS:
            raise EvidenceFormatError("可信程度字段不合规")

        related_table_ids = _read_text_list(raw_item, "related_table_ids")
        if any(table_id not in table_ids for table_id in related_table_ids):
            raise EvidenceFormatError("证据链引用了不存在的结果表")

        chains.append(
            EvidenceChain(
                id=_read_required_text(raw_item, "id") or f"evidence_{index}",
                title=_read_required_text(raw_item, "title"),
                finding=_read_required_text(raw_item, "finding"),
                evidence=_read_text_list(raw_item, "evidence"),
                related_table_ids=related_table_ids,
                related_chart=_read_required_nullable_text(raw_item, "related_chart"),
                confidence_level=confidence_level,
                suggested_next_check=_read_required_text(
                    raw_item,
                    "suggested_next_check",
                ),
            )
        )

    return chains


def _read_required_text(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise EvidenceFormatError(f"返回字段缺失：{key}")
    return value.strip()


def _read_optional_text(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise EvidenceFormatError(f"返回字段缺失：{key}")
    return value.strip() or None


def _read_required_nullable_text(data: dict[str, Any], key: str) -> str | None:
    if key not in data:
        raise EvidenceFormatError(f"返回字段缺失：{key}")

    return _read_optional_text(data, key)


def _read_text_list(data: dict[str, Any], key: str) -> list[str]:
    value = data.get(key)
    if not isinstance(value, list):
        raise EvidenceFormatError(f"返回字段缺失：{key}")

    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise EvidenceFormatError(f"返回字段缺失：{key}")
        result.append(item.strip())

    return result


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()

    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)

    return result


def _execution_table_ids(execution_result: dict) -> set[str]:
    table_ids = set()
    for table in execution_result.get("tables", []):
        table_id = table.get("id")
        if isinstance(table_id, str) and table_id.strip():
            table_ids.add(table_id.strip())
    return table_ids


def _get_failure_reason(error: Exception) -> str:
    if isinstance(error, EvidenceFormatError):
        return str(error)

    if isinstance(error, urllib.error.HTTPError):
        return describe_http_error(error)

    if isinstance(error, TimeoutError | socket.timeout):
        return "请求超时，请检查网络或服务商状态"

    if isinstance(error, urllib.error.URLError):
        return "连接失败，请检查 API Key、Base URL、模型名称或网络环境"

    return f"未知错误：{error}"


class EvidenceFormatError(ValueError):
    pass
