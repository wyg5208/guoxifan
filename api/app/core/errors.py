from typing import Any


class AppError(Exception):
    """业务异常。统一由全局异常处理器转成 {"error": {...}} 响应。"""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class AuthError(AppError):
    def __init__(self, code: str = "AUTH_INVALID_CREDENTIALS", message: str = "账号或密码错误") -> None:
        super().__init__(code, message, 401)


class PermissionError_(AppError):
    def __init__(self, message: str = "无权限执行该操作") -> None:
        super().__init__("PERMISSION_DENIED", message, 403)


class NotFoundError(AppError):
    def __init__(self, message: str = "资源不存在") -> None:
        super().__init__("NOT_FOUND", message, 404)


class ConflictError(AppError):
    def __init__(self, message: str = "操作冲突", code: str = "ALREADY_EXISTS") -> None:
        super().__init__(code, message, 409)


class ValidationError_(AppError):
    def __init__(self, message: str, details: Any = None) -> None:
        super().__init__("VALIDATION_ERROR", message, 400, details)


class RateLimitError(AppError):
    def __init__(self, message: str = "操作太频繁，请稍后再试") -> None:
        super().__init__("RATE_LIMITED", message, 429)
