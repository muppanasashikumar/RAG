from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.ingestion_service import ingest_file

router = APIRouter()


@router.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    try:
        return ingest_file(file=file)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}") from exc
