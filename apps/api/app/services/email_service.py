from email.message import EmailMessage
from html import escape

import aiosmtplib
import structlog

from app.core.config import settings

logger = structlog.get_logger()


def build_password_reset_email(recipient: str, reset_url: str) -> EmailMessage:
    safe_url = escape(reset_url, quote=True)
    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM or settings.SMTP_USERNAME or "AXIS"
    message["To"] = recipient
    message["Subject"] = "AXIS — Reset your password"

    text = (
        "AXIS\n\n"
        "Reset your password\n\n"
        "We received a request to reset your AXIS password. "
        "Use the link below to choose a new password.\n\n"
        f"Reset password: {reset_url}\n\n"
        "This link expires in 30 minutes.\n\n"
        "If you didn't request this, you can safely ignore this email."
    )
    html = f"""
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0f0f11;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:.2em;margin-bottom:40px;">AXIS</div>
      <div style="border:1px solid #29292f;border-radius:16px;background:#151519;padding:32px;">
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Reset your password</h1>
        <p style="margin:0 0 28px;color:#a8a8b0;font-size:15px;line-height:1.7;">
          We received a request to reset your AXIS password. Use the button below to choose a new one.
        </p>
        <a href="{safe_url}" style="display:inline-block;background:#f1f1f1;color:#101014;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:600;">Reset password</a>
        <p style="margin:24px 0 8px;color:#888890;font-size:13px;line-height:1.6;">This link expires in 30 minutes.</p>
        <p style="margin:0;color:#888890;font-size:13px;line-height:1.6;">If you didn't request this, you can safely ignore this email.</p>
        <p style="margin:24px 0 0;color:#66666f;font-size:12px;line-height:1.6;word-break:break-all;">{safe_url}</p>
      </div>
    </div>
  </body>
</html>
"""
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


def build_verification_email(recipient: str, verify_url: str) -> EmailMessage:
    safe_url = escape(verify_url, quote=True)
    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM or settings.SMTP_USERNAME or "AXIS"
    message["To"] = recipient
    message["Subject"] = "AXIS — Confirm your email"

    text = (
        "AXIS\n\n"
        "Confirm your email\n\n"
        "Thanks for creating an AXIS account. Confirm your email address "
        "to finish setting up your account.\n\n"
        f"Verify email: {verify_url}\n\n"
        "This link expires in 24 hours.\n\n"
        "If you didn't create this account, you can safely ignore this email."
    )
    html = f"""
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0f0f11;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:.2em;margin-bottom:40px;">AXIS</div>
      <div style="border:1px solid #29292f;border-radius:16px;background:#151519;padding:32px;">
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Confirm your email</h1>
        <p style="margin:0 0 28px;color:#a8a8b0;font-size:15px;line-height:1.7;">
          Thanks for creating an AXIS account. Confirm your email address to finish setting up your account.
        </p>
        <a href="{safe_url}" style="display:inline-block;background:#f1f1f1;color:#101014;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:600;">Verify email</a>
        <p style="margin:24px 0 8px;color:#888890;font-size:13px;line-height:1.6;">This link expires in 24 hours.</p>
        <p style="margin:0;color:#888890;font-size:13px;line-height:1.6;">If you didn't create this account, you can safely ignore this email.</p>
        <p style="margin:24px 0 0;color:#66666f;font-size:12px;line-height:1.6;word-break:break-all;">{safe_url}</p>
      </div>
    </div>
  </body>
</html>
"""
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


def build_account_alert_email(recipient: str, revoke_url: str) -> EmailMessage:
    safe_url = escape(revoke_url, quote=True)
    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM or settings.SMTP_USERNAME or "AXIS"
    message["To"] = recipient
    message["Subject"] = "AXIS — Did you create this account?"

    text = (
        "AXIS\n\n"
        "Did you create this account?\n\n"
        "An AXIS account was just created and confirmed using this email "
        "address. If this was you, there's nothing else to do.\n\n"
        "If you didn't create this account, you can remove it.\n\n"
        f"Review this account: {revoke_url}\n\n"
        "This link expires in 72 hours."
    )
    html = f"""
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0f0f11;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:.2em;margin-bottom:40px;">AXIS</div>
      <div style="border:1px solid #29292f;border-radius:16px;background:#151519;padding:32px;">
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Did you create this account?</h1>
        <p style="margin:0 0 12px;color:#a8a8b0;font-size:15px;line-height:1.7;">
          An AXIS account was just created and confirmed using this email address.
        </p>
        <p style="margin:0 0 28px;color:#a8a8b0;font-size:15px;line-height:1.7;">
          If this was you, there's nothing else to do — you can ignore this email.
          If it wasn't, you can remove the account below.
        </p>
        <a href="{safe_url}" style="display:inline-block;background:transparent;color:#f5f5f5;text-decoration:none;border:1px solid #3a3a42;border-radius:10px;padding:12px 18px;font-weight:600;">Review this account</a>
        <p style="margin:24px 0 0;color:#66666f;font-size:12px;line-height:1.6;word-break:break-all;">{safe_url}</p>
      </div>
    </div>
  </body>
</html>
"""
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


async def _send(message: EmailMessage, recipient: str, log_event: str) -> None:
    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD or not settings.EMAIL_FROM:
        raise RuntimeError("SMTP credentials and EMAIL_FROM must be configured")

    logger.info(f"{log_event}_sending", recipient=recipient)
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            start_tls=True,
            username=settings.SMTP_USERNAME,
            password=settings.SMTP_PASSWORD,
            timeout=20,
        )
    except Exception:
        logger.exception(f"{log_event}_failed", recipient=recipient)
        raise

    logger.info(f"{log_event}_sent", recipient=recipient)


async def send_password_reset_email(recipient: str, reset_url: str) -> None:
    message = build_password_reset_email(recipient, reset_url)
    await _send(message, recipient, "password_reset_email")


async def send_verification_email(recipient: str, verify_url: str) -> None:
    message = build_verification_email(recipient, verify_url)
    await _send(message, recipient, "verification_email")


async def send_account_alert_email(recipient: str, revoke_url: str) -> None:
    message = build_account_alert_email(recipient, revoke_url)
    await _send(message, recipient, "account_alert_email")
