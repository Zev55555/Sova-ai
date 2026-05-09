from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from services.analysis_planner import AnalysisPlanRequest, generate_analysis_plan
from services.data_loader import process_uploaded_files
from services.duckdb_executor import ExecuteAnalysisRequest, execute_basic_analysis
from services.evidence_generator import EvidenceRequest, generate_evidence
from services.readiness_evaluator import ReadinessRequest, evaluate_readiness
from services.report_generator import ReportRequest, generate_report

app = FastAPI(title="MetricFlow AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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
):
    upload_files = files or ([file] if file else [])
    return process_uploaded_files(upload_files, dimensions)


@app.post("/api/analysis/plan")
def analysis_plan(request: AnalysisPlanRequest):
    return generate_analysis_plan(request)


@app.post("/api/analysis/execute")
def analysis_execute(request: ExecuteAnalysisRequest):
    return execute_basic_analysis(request)


@app.post("/api/analysis/evidence")
def analysis_evidence(request: EvidenceRequest):
    return generate_evidence(request)


@app.post("/api/analysis/report")
def analysis_report(request: ReportRequest):
    return generate_report(request)
