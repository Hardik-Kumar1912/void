# Hugging Face Spaces requires port 7860
# This Dockerfile runs the FastAPI server on that port

FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast installs
RUN pip install --no-cache-dir uv

# Copy dependency files first (better Docker layer caching)
COPY pyproject.toml uv.lock ./

# Export pinned deps from lockfile and install
RUN uv export --no-dev --format requirements-txt > requirements.txt \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# HF Spaces uses port 7860 by default
EXPOSE 7860

# Use PORT env var so it works on HF Spaces (7860) and Railway/local (8000)
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-7860}"]
