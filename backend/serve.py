"""正式啟動：監聽 0.0.0.0 與 Cloud Run 提供的 PORT，不使用 --reload。"""
import os

import uvicorn


def main() -> None:
    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8080")),
                proxy_headers=True, forwarded_allow_ips="*", log_level=os.environ.get("LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()
