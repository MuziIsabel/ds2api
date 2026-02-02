# ========== 阶段1: 构建前端 ==========
FROM node:20-slim AS frontend-builder

WORKDIR /app/webui

# 复制前端依赖文件
COPY webui/package.json webui/package-lock.json ./

# 安装依赖
RUN npm ci

# 复制前端源码
COPY webui/ ./

# 构建前端
RUN npm run build

# ========== 阶段2: 构建后端 ==========
FROM python:3.11-slim

WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TZ=Asia/Shanghai

# 安装系统依赖
# curl_cffi 需要 libcurl 和编译工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    curl \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# 复制并安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制后端代码
COPY app.py .
COPY core/ ./core/
COPY routes/ ./routes/

# 创建 templates 目录（预留扩展用）
RUN mkdir -p ./templates

# 复制 WASM 文件和 Tokenizer 相关文件
COPY sha3_wasm_bg.7b9ca65ddd.wasm ./
COPY tokenizer.json tokenizer_config.json ./

# 从前端构建阶段复制构建产物到 static/admin
COPY --from=frontend-builder /app/webui/dist ./static/admin

# 创建配置文件目录（运行时挂载）
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 5001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/ || exit 1

# 启动命令
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]
