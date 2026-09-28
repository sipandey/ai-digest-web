#!/usr/bin/env bash
set -e

# ==============================================================================
# Local Docker Quick Test Script — AI Digest
# ==============================================================================

echo "========================================================"
echo "  AI Digest — Local Docker Quick Test Suite"
echo "========================================================"

# 1. Check Docker Daemon
if ! docker info >/dev/null 2>&1; then
  echo "❌ Error: Docker daemon is not running. Please start Docker Desktop."
  exit 1
fi

echo "✅ Docker daemon is active."

# 2. Test Pipeline in Docker
echo ""
echo "--- [1/3] Testing Python Pipeline in Docker Container ---"
docker compose run --rm pipeline pytest tests/ -q
echo "✅ Pipeline container tests passed!"

# 3. Start Web App Container
echo ""
echo "--- [2/3] Starting Next.js Web App in Docker Container ---"
docker compose up -d web

# 4. Wait for Next.js to start listening on port 3000
echo "Waiting for web server to respond on http://localhost:3000..."
MAX_ATTEMPTS=30
ATTEMPT=0
READY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login | grep -q "200\|307\|308"; then
    READY=true
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

if [ "$READY" = true ]; then
  echo "✅ Web service is UP and responding on http://localhost:3000!"
else
  echo "⚠️ Web service did not respond within 60s. Checking logs:"
  docker compose logs --tail=30 web
  exit 1
fi

# 5. Quick Health / Endpoint verification
echo ""
echo "--- [3/3] Verifying Endpoints ---"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
echo "Landing page (http://localhost:3000/) returned HTTP $HTTP_STATUS"

echo ""
echo "========================================================"
echo "🎉 Local Docker test successfully verified!"
echo "   - Web App URL: http://localhost:3000"
echo "   - View logs:   docker compose logs -f web"
echo "   - Tear down:   docker compose down"
echo "========================================================"
