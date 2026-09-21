from fastapi import APIRouter

from .auth import router as auth_router
from .users import router as users_router
from .chat import router as chat_router
from .billing import router as billing_router
from .files import router as files_router
from .agents import router as agents_router
from .admin import router as admin_router
from .api_keys import router as api_keys_router

router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(users_router, prefix="/users", tags=["Users"])
router.include_router(chat_router, prefix="/chat", tags=["Chat"])
router.include_router(billing_router, prefix="/billing", tags=["Billing"])
router.include_router(files_router, prefix="/files", tags=["Files"])
router.include_router(agents_router, prefix="/agents", tags=["Agents"])
router.include_router(admin_router, prefix="/admin", tags=["Admin"])
router.include_router(api_keys_router, prefix="/api-keys", tags=["API Keys"])
