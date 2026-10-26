"""The video-to-ticket pipeline (PLAN.md §5).

Each stage is a discrete, cached, independently testable step. The AI-backed
stages (SAM tracking, Spark OCR/classification/narrative) call through the
`app.ai` seam, which replays fixtures under MOCK_AI so the whole pipeline runs
end-to-end at $0. The deterministic stages (fill-% geometry, capacity lookup,
anomaly rules, dollar math) are pure Python and never call a model.
"""
