import uuid
import io
from typing import Annotated

import boto3
from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.config import settings
from app.models.file import File as FileModel, FileStatus, Chunk
from app.services.ai_service import AIService

router = APIRouter()
ai_service = AIService()


def get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        endpoint_url=settings.S3_ENDPOINT,
    )


@router.get("/")
async def list_files(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(FileModel).where(FileModel.user_id == current_user.id)
    )
    return {"data": result.scalars().all()}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    current_user: CurrentUser,
    db: DbDep,
    file: UploadFile = File(...),
):
    # Validate MIME type
    if file.content_type not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type {file.content_type} not allowed",
        )

    content = await file.read()
    size = len(content)
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    if size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit",
        )

    file_id = str(uuid.uuid4())
    s3_key = f"uploads/{current_user.id}/{file_id}/{file.filename}"

    # Upload to S3
    if settings.S3_BUCKET:
        s3 = get_s3_client()
        s3.put_object(
            Bucket=settings.S3_BUCKET,
            Key=s3_key,
            Body=content,
            ContentType=file.content_type,
        )
        url = f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{s3_key}"
    else:
        url = f"/local/{s3_key}"

    file_record = FileModel(
        id=file_id,
        user_id=current_user.id,
        name=file.filename or "unknown",
        mime_type=file.content_type or "application/octet-stream",
        size=size,
        url=url,
        s3_key=s3_key,
        status=FileStatus.PROCESSING,
    )
    db.add(file_record)
    await db.flush()

    # Process file for RAG (background task in production)
    await _process_file_for_rag(file_record, content, db)

    return file_record


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(file_id: str, current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id, FileModel.user_id == current_user.id
        )
    )
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    await db.delete(file_record)


async def _process_file_for_rag(
    file_record: FileModel, content: bytes, db
) -> None:
    """Extract text, chunk, embed, and store in vector DB."""
    try:
        text = _extract_text(content, file_record.mime_type)
        chunks = _chunk_text(text, chunk_size=512, overlap=64)
        embeddings = await ai_service.create_embeddings_batch(chunks)

        for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            chunk = Chunk(
                id=str(uuid.uuid4()),
                file_id=file_record.id,
                content=chunk_text,
                chunk_index=i,
                embedding=embedding,
            )
            db.add(chunk)

        file_record.status = FileStatus.READY
        file_record.chunk_count = len(chunks)
    except Exception as e:
        file_record.status = FileStatus.FAILED
        file_record.error_msg = str(e)

    await db.commit()


def _extract_text(content: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() for page in reader.pages)
    elif mime_type in ("text/plain", "text/markdown", "text/csv"):
        return content.decode("utf-8", errors="replace")
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        from docx import Document
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)
    return content.decode("utf-8", errors="replace")


def _chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        i += chunk_size - overlap
    return chunks
