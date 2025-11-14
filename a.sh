for port in {5173..5177}; do
    echo "Attempting to kill processes on port $port"
    # Find PIDs and kill them forcefully (-9)
    # The -t flag ensures only the PIDs are outputted
    PIDS=$(lsof -t -i :$port)
    if [ -n "$PIDS" ]; then
        # Use xargs to pass the PIDs to the kill command
        kill -9 $PIDS
        echo "Killed processes: $PIDS"
    else
        echo "No processes found on port $port"
    fi
done

