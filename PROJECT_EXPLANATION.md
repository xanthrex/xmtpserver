# Project Explanation: xmtpserver

This document provides an overview and explanation of the `xmtpserver` project.

## 1. Project Overview

The `xmtpserver` project is a simple Node.js application designed to act as a listener for messages published to a specific channel on a Redis server. Specifically, it listens for messages on the "ethereum-messages" channel. The primary purpose is to receive and process messages related to Ethereum, likely originating from another service or application that publishes these messages to Redis.

## 2. Key Components

The project consists of a single main file:

*   [`xmtp-listener.js`](xmtp-listener.js): This file contains the core logic for connecting to Redis, subscribing to the designated channel, and handling incoming messages.

The main class is `EthereumRedisListener`, which encapsulates the Redis connection and subscription logic.

## 3. Functionality

The `xmtpserver` performs the following key functions:

*   **Redis Connection:** Establishes a connection to a Redis server using the configuration specified in `REDIS_CONFIG` (defaulting to `redis://localhost:6379`).
*   **Channel Subscription:** Subscribes to the "ethereum-messages" channel on the connected Redis server.
*   **Message Handling:** Listens for messages arriving on the subscribed channel. When a message is received, it logs the raw message, attempts to parse it as JSON, and logs the parsed object. It includes error handling for JSON parsing failures.
*   **Status Reporting:** Provides a method (`getStatus`) to check the current connection status and the channel being listened to.
*   **Graceful Shutdown:** Implements handlers for `SIGINT` (Ctrl+C) and `SIGTERM` signals to gracefully disconnect from Redis before exiting.

## 4. Dependencies

The project relies on the following npm package, as defined in [`package.json`](package.json):

*   `redis`: A Node.js client for Redis.

## 5. How to Run

1.  Ensure you have Node.js and npm installed.
2.  Ensure a Redis server is running and accessible at the configured URL (default: `redis://localhost:6379`).
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Start the listener:
    ```bash
    npm start
    ```

The application will connect to Redis, subscribe to the "ethereum-messages" channel, and start logging any messages received on that channel. Press `Ctrl+C` to stop the application gracefully.