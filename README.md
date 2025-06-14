# XMTP Redis Listener Service

This project implements a service that listens for messages on a Redis channel and forwards them as XMTP messages to specified Ethereum addresses.

## Technical Description

The service consists of two main components:

1.  **`XMTPService`** (`src/xmtp-service.js`):
    *   Initializes and manages the XMTP client using `@xmtp/node-sdk`.
    *   Requires a private key, a database encryption key, and an XMTP environment (`dev`, `production`, etc.) for configuration, typically provided via environment variables.
    *   Provides methods to:
        *   Initialize the XMTP client (`initializeClient`).
        *   Check if an address can receive XMTP messages (`canMessage`).
        *   Send a single XMTP message to a recipient address (`sendMessage`).
        *   Send multiple XMTP messages (`sendMessages`).
        *   Close the XMTP client connection (`close`).
    *   Includes helper functions for creating a wallet user (`createUser`), creating an XMTP signer (`createSigner`), getting the encryption key from a hex string (`getEncryptionKeyFromHex`), and validating required environment variables (`validateEnvironment`).

2.  **`EthereumRedisListener`** (`src/xmtp-listener.js`):
    *   Connects to a Redis server using the `redis` library.
    *   Subscribes to a specific Redis channel (`ethereum-messages`).
    *   Listens for incoming messages on the subscribed channel.
    *   Parses incoming messages, expecting a JSON format containing `ethereumAddress` and `message` fields.
    *   Uses the `sendXMTPMessage` utility function (which internally uses `XMTPService`) to send the parsed message to the specified Ethereum address via XMTP.
    *   Handles Redis connection and subscription errors.
    *   Implements graceful shutdown on `SIGINT` and `SIGTERM` signals.

The service relies on the following key dependencies:
*   `@xmtp/node-sdk`: For interacting with the XMTP network.
*   `viem`: A TypeScript interface for Ethereum, used here for wallet and account management.
*   `redis`: For connecting to and subscribing to Redis channels.

## Functional Description

The service acts as a bridge between a Redis message queue and the XMTP network. When a message is published to the configured Redis channel (`ethereum-messages`), the `EthereumRedisListener` picks it up. It expects the message payload to be a JSON string containing the recipient's Ethereum address and the message content. The listener then uses the `XMTPService` to send this message to the specified Ethereum address via XMTP.

This allows other applications or services to trigger XMTP messages simply by publishing structured data to a Redis channel, decoupling the message generation from the XMTP sending logic.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd xmtpserver
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the project root directory with the following variables:
    ```env
    PRIVATE_KEY=your_ethereum_private_key # The private key for the XMTP sending account (without 0x prefix)
    XMTP_DB_ENCRYPTION_KEY=your_encryption_key # A hex string used to encrypt the local XMTP database
    XMTP_ENV=dev # or production
    XMTP_DB_PATH=./data/xmtp_database # Optional: Path for the local XMTP database
    REDIS_URL=redis://localhost:6379 # Optional: Redis connection URL (default is redis://localhost:6379)
    ```
    Ensure you have a valid Ethereum private key and generate a secure hex string for the database encryption key.

4.  **Ensure Redis is running:**
    The service requires a running Redis instance accessible at the configured `REDIS_URL`.

## Usage

To start the listener service, run the main script:

```bash
node src/xmtp-listener.js
```

The service will connect to Redis, subscribe to the `ethereum-messages` channel, and start listening for messages.

To send a message via this service, publish a JSON string to the `ethereum-messages` Redis channel with the following structure:

```json
{
  "ethereumAddress": "0x...", // Recipient's Ethereum address
  "message": "Hello from Redis!" // Message content
}
```

Example using `redis-cli`:

```bash
redis-cli
PUBLISH ethereum-messages '{"ethereumAddress": "0x...", "message": "Test message"}'
```

The listener will process this message and attempt to send it via XMTP.

Press `Ctrl+C` to stop the listener gracefully.

## File Structure

*   `src/xmtp-service.js`: Contains the `XMTPService` class and related utility functions for XMTP interaction.
*   `src/xmtp-listener.js`: Contains the `EthereumRedisListener` class and the main execution logic for connecting to Redis and processing messages.
*   `.env`: Environment variables file (create this based on the template above).
*   `package.json`: Project dependencies and scripts.
*   `package-lock.json`: Exact dependency versions.
*   `.gitignore`: Specifies intentionally untracked files that Git should ignore.
*   `README.md`: This file.
*   `PROJECT_EXPLANATION.md`: (Exists in the directory, purpose not detailed in code) - Potentially contains broader project context.
