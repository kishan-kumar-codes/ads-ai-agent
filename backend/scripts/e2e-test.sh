#!/bin/bash
set -e

echo "🚀 Starting E2E Test for Structured Output"
echo ""

# Check if server is already running
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Backend server is already running on port 3001"
    SERVER_RUNNING=true
else
    echo "📦 Starting backend server..."
    cd /home/node/ads-ai-agent/backend
    npm run build > /dev/null 2>&1
    NODE_ENV=development npm start > /tmp/backend-test.log 2>&1 &
    SERVER_PID=$!
    SERVER_RUNNING=false
    
    echo "⏳ Waiting for server to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            echo "✅ Backend server is ready"
            break
        fi
        sleep 1
    done
    
    if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "❌ Server failed to start"
        if [ ! -z "$SERVER_PID" ]; then
            kill $SERVER_PID 2>/dev/null || true
        fi
        exit 1
    fi
fi

echo ""
echo "📝 Running E2E test - Creating thread and sending message..."
echo ""

# Create a test thread
THREAD_RESPONSE=$(curl -s -X POST http://localhost:3001/api/threads \
  -H "Content-Type: application/json" \
  -H "Cookie: better_auth.session_token=test-session-for-e2e")

THREAD_ID=$(echo $THREAD_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)

if [ -z "$THREAD_ID" ]; then
    echo "❌ Failed to create thread"
    echo "Response: $THREAD_RESPONSE"
    if [ "$SERVER_RUNNING" = false ] && [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    exit 1
fi

echo "✅ Created thread: $THREAD_ID"
echo ""

# Send a message to generate ad content
echo "📤 Sending message: 'Write three Google ad headlines for an online fitness coaching service'"
echo ""

MESSAGE_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/threads/$THREAD_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Cookie: better_auth.session_token=test-session-for-e2e" \
  -d '{"content": "Write three Google ad headlines for an online fitness coaching service"}')

echo "📬 Agent Response:"
echo "$MESSAGE_RESPONSE" | jq -r '.assistantMessage.content // .error // .' | head -30
echo ""

# Check if the response contains expected structured content
if echo "$MESSAGE_RESPONSE" | grep -q "Headlines:" && \
   echo "$MESSAGE_RESPONSE" | grep -q "Platform:" && \
   echo "$MESSAGE_RESPONSE" | grep -q "Objective:"; then
    echo "✅ Response contains structured campaign data"
    echo ""
    
    # Extract and verify headlines
    HEADLINE_COUNT=$(echo "$MESSAGE_RESPONSE" | grep -o '- .*' | wc -l)
    echo "✅ Found $HEADLINE_COUNT headlines/descriptions in response"
    echo ""
    
    echo "🎉 E2E Test PASSED! Structured output is working correctly in production."
else
    echo "❌ Response does not contain expected structured data"
    echo ""
    echo "Full response:"
    echo "$MESSAGE_RESPONSE" | jq '.'
    
    if [ "$SERVER_RUNNING" = false ] && [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    exit 1
fi

# Clean up
if [ "$SERVER_RUNNING" = false ] && [ ! -z "$SERVER_PID" ]; then
    echo ""
    echo "🧹 Stopping test server..."
    kill $SERVER_PID 2>/dev/null || true
fi

echo ""
echo "✅ All E2E tests completed successfully!"
