import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.models.agent import AgentRun, AgentStatus, AgentWorkflow

router = APIRouter()


class AgentRunRequest(BaseModel):
    input: str
    workflow_id: str | None = None
    tools: list[str] = []
    model: str = "gpt-4o-mini"
    max_iterations: int = 10


class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    definition: dict
    enabled_tools: list[str] = []


# ─── Workflows ────────────────────────────────────────────────────────────────

@router.get("/workflows")
async def list_workflows(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(AgentWorkflow).where(AgentWorkflow.user_id == current_user.id)
    )
    return {"data": result.scalars().all()}


@router.post("/workflows", status_code=status.HTTP_201_CREATED)
async def create_workflow(body: WorkflowCreate, current_user: CurrentUser, db: DbDep):
    workflow = AgentWorkflow(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        definition=body.definition,
        enabled_tools=body.enabled_tools,
    )
    db.add(workflow)
    await db.flush()
    return workflow


# ─── Runs ─────────────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_runs(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(AgentRun)
        .where(AgentRun.user_id == current_user.id)
        .order_by(AgentRun.created_at.desc())
        .limit(50)
    )
    return {"data": result.scalars().all()}


@router.post("/run")
async def run_agent(body: AgentRunRequest, current_user: CurrentUser, db: DbDep):
    from app.core.config import settings

    if not settings.ENABLE_AI_AGENTS:
        raise HTTPException(status_code=403, detail="AI Agents not enabled")

    run = AgentRun(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        workflow_id=body.workflow_id,
        status=AgentStatus.RUNNING,
        input={"message": body.input, "tools": body.tools},
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()
    await db.commit()

    async def stream_agent():
        import json
        try:
            # Dynamically import to avoid circular deps
            from packages_agents import ReActAgent, ALL_TOOLS, getToolByName
            pass
        except ImportError:
            pass

        # Inline simplified agent loop
        import openai as oai
        client = oai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        messages = [
            {"role": "system", "content": "You are a helpful AI assistant."},
            {"role": "user", "content": body.input},
        ]
        tokens_used = 0

        for _ in range(body.max_iterations):
            response = await client.chat.completions.create(
                model=body.model,
                messages=messages,
                stream=False,
            )
            reply = response.choices[0].message.content or ""
            tokens_used += response.usage.total_tokens if response.usage else 0

            step = {"type": "response", "content": reply}
            yield f"data: {json.dumps(step)}\n\n"

            if response.choices[0].finish_reason == "stop":
                break

            messages.append({"role": "assistant", "content": reply})

        # Update run record
        run.status = AgentStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        run.tokens_used = tokens_used
        run.output = {"result": reply}
        await db.commit()
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_agent(), media_type="text/event-stream")
