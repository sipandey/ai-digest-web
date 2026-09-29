FROM python:3.11-slim

WORKDIR /app

# Install minimal system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt requirements-test.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-test.txt

# Copy pipeline source code
COPY . .

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Default command runs test verification
CMD ["pytest", "tests/", "-v"]
