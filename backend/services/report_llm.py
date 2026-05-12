from __future__ import annotations

import json
import re
import socket
import urllib.error
from typing import Any, Literal

from services.llm_client import (
    Provider,
    call_chat_completion,
    describe_http_error,
    has_hosted_llm_default,
)
from services.report_generator import (
    ReportRequest,
    ReportResponse,
    ReportSection,
    generate_report,
)


class LlmReportRequest(ReportRequest):
    provider: Provider = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class LlmReportResponse(ReportResponse):
    source: Literal["llm", "fallback"]
    fallback_reason: str | None = None


def generate_report_with_llm(request: LlmReportRequest) -> LlmReportResponse:
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
                        "你是一个资深中文业务数据分析师。你的任务是根据用户业务问题、"
                        "已确认分析上下文、分析计划、DuckDB 执行结果和证据链，生成一份"
                        "结构清晰、表达谨慎、可供业务方继续修改的中文分析报告草稿。"
                        "请严格返回 JSON，不要输出 Markdown，不要解释。你不能编造数据，"
                        "不能重新计算数据，不能声称因果关系成立，只能根据提供的信息整理"
                        "当前数据支持的初步发现、可能原因和下一步验证建议。"
                    ),
                },
                {
                    "role": "user",
                    "content": _build_report_prompt(request),
                },
            ],
            max_tokens=2600,
            temperature=0.2,
        )
        content = _extract_message_content(raw_response)
        parsed = _parse_json_object(content)
        return _validate_llm_result(parsed)
    except Exception as error:
        return _fallback_response(request, _get_failure_reason(error))


def _fallback_response(request: LlmReportRequest, reason: str) -> LlmReportResponse:
    fallback = generate_report(
        ReportRequest(
            business_problem=request.business_problem,
            metric_definition=request.metric_definition,
            comparison_period=request.comparison_period,
            dimensions=request.dimensions,
            change_factors=request.change_factors,
            analysis_plan=request.analysis_plan,
            execution_result=request.execution_result,
            metric_execution_result=request.metric_execution_result,
            evidence_result=request.evidence_result,
        )
    )
    return LlmReportResponse(
        **fallback.model_dump(),
        source="fallback",
        fallback_reason=reason,
    )


def _get_missing_config_reason(request: LlmReportRequest) -> str | None:
    if not request.api_key.strip():
        if has_hosted_llm_default():
            return None
        return "API Key 缺失"

    if not request.base_url.strip():
        return "Base URL 缺失"

    if not request.model.strip():
        return "模型名称缺失"

    return None


def _build_report_prompt(request: LlmReportRequest) -> str:
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
        "evidence_result": request.evidence_result,
    }

    return f"""请基于以下上下文生成报告草稿：

{json.dumps(context, ensure_ascii=False, indent=2)}

请只返回以下 JSON，不要返回 Markdown：
{{
  "title": "指标异动分析报告草稿",
  "sections": [
    {{
      "heading": "一、分析背景",
      "content": "..."
    }},
    {{
      "heading": "二、当前已确认信息",
      "content": "..."
    }},
    {{
      "heading": "三、数据与字段情况",
      "content": "..."
    }},
    {{
      "heading": "四、初步分析发现",
      "content": "..."
    }},
    {{
      "heading": "五、证据链摘要",
      "content": "..."
    }},
    {{
      "heading": "六、可能原因",
      "content": "..."
    }},
    {{
      "heading": "七、当前限制",
      "content": "..."
    }},
    {{
      "heading": "八、建议下一步验证",
      "content": "..."
    }}
  ],
  "disclaimer": "本报告为基于当前上传数据和分析结果生成的草稿，仅用于辅助分析，不代表最终因果结论。"
}}

必须遵守：
- 必须使用简体中文。
- 只能引用输入中已有的业务信息、结果表、证据链和限制。
- 如果 metric_execution_result 存在，必须优先使用其中的真实指标变化、分子分母变化、维度拆解和 Top 异动分组。
- 不能编造具体数值，不能重新计算数据。
- 不能生成 SQL。
- 不能说“原因一定是”“这证明”“最终结论是”“一定导致了”“可以确定”。
- 必须使用“当前数据支持”“初步观察”“可能原因”“建议进一步验证”“需要结合更多数据确认”等谨慎表达。
- 报告必须适合中文业务分析场景，不要像机器翻译。
- 如果结果不足，应该在“当前限制”中说明。
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
                "rows": rows[:20] if isinstance(rows, list) else [],
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
        raise ReportFormatError("返回字段缺失：choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise ReportFormatError("返回字段缺失：message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ReportFormatError("返回字段缺失：content")

    return content.strip()


def _parse_json_object(raw_content: str) -> dict[str, Any]:
    cleaned = raw_content.strip()

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
        raise ReportFormatError("模型返回内容不是合法 JSON")

    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        raise ReportFormatError("模型返回内容不是合法 JSON") from error

    if not isinstance(parsed, dict):
        raise ReportFormatError("模型返回内容不是合法 JSON")

    return parsed


def _validate_llm_result(parsed: dict[str, Any]) -> LlmReportResponse:
    title = _read_required_text(parsed, "title")
    sections = _read_sections(parsed)
    disclaimer = _read_required_text(parsed, "disclaimer")

    return LlmReportResponse(
        source="llm",
        fallback_reason=None,
        title=title,
        sections=sections,
        disclaimer=disclaimer,
    )


def _read_sections(parsed: dict[str, Any]) -> list[ReportSection]:
    raw_sections = parsed.get("sections")
    if not isinstance(raw_sections, list):
        raise ReportFormatError("返回字段缺失：sections")

    if len(raw_sections) < 6:
        raise ReportFormatError("sections 数量少于 6 个")

    sections: list[ReportSection] = []
    for raw_section in raw_sections:
        if not isinstance(raw_section, dict):
            raise ReportFormatError("sections 结构不合规")

        sections.append(
            ReportSection(
                heading=_read_required_text(raw_section, "heading"),
                content=_read_required_text(raw_section, "content"),
            )
        )

    return sections


def _read_required_text(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ReportFormatError(f"返回字段缺失：{key}")
    return value.strip()


def _get_failure_reason(error: Exception) -> str:
    if isinstance(error, ReportFormatError):
        return str(error)

    if isinstance(error, urllib.error.HTTPError):
        return describe_http_error(error)

    if isinstance(error, TimeoutError | socket.timeout):
        return "请求超时，请检查网络或服务商状态"

    if isinstance(error, urllib.error.URLError):
        return "连接失败，请检查 API Key、Base URL、模型名称或网络环境"

    return f"未知错误：{error}"


class ReportFormatError(ValueError):
    pass
