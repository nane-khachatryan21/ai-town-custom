#!/bin/bash

# Start local development with web search enabled

echo "🚀 Starting AI Parliament with Web Search enabled..."
echo ""

# Kill any existing processes
echo "Stopping existing processes..."
pkill -9 -f convex-local-backend 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
sleep 2

# Export environment variable
export ENABLE_WEB_SEARCH=true

echo "✅ ENABLE_WEB_SEARCH=true"
echo ""

# Start backend in background
echo "Starting Convex backend..."
ENABLE_WEB_SEARCH=true ./convex-local-backend > backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"
sleep 5

# Start frontend in background  
echo "Starting frontend..."
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"
echo ""

echo "=========================================="
echo "🎉 All services started!"
echo "=========================================="
echo "Frontend: http://localhost:5173"
echo "Backend:  http://127.0.0.1:3210"
echo "Web Search: ENABLED ✅"
echo ""
echo "Logs:"
echo "  Backend:  tail -f backend.log"
echo "  Frontend: tail -f frontend.log"
echo ""
echo "To stop: pkill -f convex-local-backend && pkill -f 'npm run dev'"
echo "=========================================="

