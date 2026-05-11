import os

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from services.analysis_plan_llm import (
    LlmAnalysisPlanRequest,
    generate_analysis_plan_with_llm,
)
from services.analysis_planner import AnalysisPlanRequest, generate_analysis_plan
from services.business_clarification_llm import (
    BusinessClarificationRequest,
    generate_business_clarification_with_llm,
)
from services.data_loader import process_uploaded_files
from services.duckdb_executor import ExecuteAnalysisRequest, execute_basic_analysis
from services.evidence_generator import EvidenceRequest, generate_evidence
from services.evidence_llm import LlmEvidenceRequest, generate_evidence_with_llm
from services.llm_client import LlmTestRequest, test_llm_connection
from services.metric_definition_llm import (
    MetricDefinitionRequest,
    generate_metric_definitions_with_llm,
)
from services.metric_spec_builder import (
    MetricSpecRequest,
    build_metric_spec_response,
)
from services.metric_spec_executor import (
    MetricSpecExecuteRequest,
    execute_metric_spec_api,
)
from services.readiness_evaluator import ReadinessRequest, evaluate_readiness
from services.report_generator import ReportRequest, generate_report
from services.report_llm import LlmReportRequest, generate_report_with_llm

app = FastAPI(title="MetricFlow AI Backend")

default_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "https://sova-ai-ten.vercel.app",
]
extra_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[*default_cors_origins, *extra_cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/readiness/evaluate")
def readiness_evaluate(request: ReadinessRequest):
    return evaluate_readiness(request)


@app.post("/api/data/upload")
async def data_upload(
    files: list[UploadFile] | None = File(default=None),
    file: UploadFile | None = File(default=None),
    dimensions: str | None = Form(default=None),
    business_context: str | None = Form(default=None),
    business_context_json: str | None = Form(default=None),
):
    upload_files = files or ([file] if file else [])
    return process_uploaded_files(
        upload_files,
        dimensions,
        business_context or business_context_json,
    )


@app.post("/api/analysis/plan")
def analysis_plan(request: AnalysisPlanRequest):
    return generate_analysis_plan(request)


@app.post("/api/metric-spec/build")
def metric_spec_build(request: MetricSpecRequest):
    return build_metric_spec_response(request)


@app.post("/api/metric-spec/execute")
def metric_spec_execute(request: MetricSpecExecuteRequest):
    return execute_metric_spec_api(request)


@app.post("/api/analysis/execute")
def analysis_execute(request: ExecuteAnalysisRequest):
    return execute_basic_analysis(request)


@app.post("/api/analysis/evidence")
def analysis_evidence(request: EvidenceRequest):
    return generate_evidence(request)


@app.post("/api/analysis/report")
def analysis_report(request: ReportRequest):
    return generate_report(request)


@app.post("/api/llm/test")
def llm_test(request: LlmTestRequest):
    return test_llm_connection(request)


@app.post("/api/llm/metric-definitions")
def llm_metric_definitions(request: MetricDefinitionRequest):
    return generate_metric_definitions_with_llm(request)


@app.post("/api/llm/business-clarification")
def llm_business_clarification(request: BusinessClarificationRequest):
    return generate_business_clarification_with_llm(request)


@app.post("/api/llm/analysis-plan")
def llm_analysis_plan(request: LlmAnalysisPlanRequest):
    return generate_analysis_plan_with_llm(request)


@app.post("/api/llm/evidence")
def llm_evidence(request: LlmEvidenceRequest):
    return generate_evidence_with_llm(request)


@app.post("/api/llm/report")
def llm_report(request: LlmReportRequest):
    return generate_report_with_llm(request)
