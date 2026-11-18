# 單一服務：FastAPI 同時提供 /api 與前端靜態檔（Cloud Run 用）
# 注意：本機未安裝 Docker，此檔尚未實際 build 驗證。

# ---- 前端 build ----
FROM node:26-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 後端執行 ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BUS_DATA_DIR=/app/data/prepared \
    BUS_STATIC_DIR=/app/frontend/dist
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
# 只含彙整檔（逐筆資料、原始 Excel 已由 .dockerignore 排除）；公開前請團隊確認展示範圍
COPY data/prepared/ ./data/prepared/
COPY --from=web /web/dist ./frontend/dist
RUN useradd --create-home appuser
USER appuser
# Cloud Run 會注入 PORT；本機 docker run 預設 8080
EXPOSE 8080
CMD ["python", "-m", "backend.serve"]
