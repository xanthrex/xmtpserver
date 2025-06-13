const redis = require('redis');

const REDIS_CONFIG = {
    url: 'redis://localhost:6379'
};

const ETHEREUM_CHANNEL = "ethereum-messages";

class EthereumRedisListener {
    constructor() {
        this.subscriber = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            console.log('🔄 Connecting to Redis...');
            
            this.subscriber = redis.createClient(REDIS_CONFIG);
            
            this.subscriber.on('connect', () => {
                console.log('✅ Connected to Redis');
                this.isConnected = true;
            });

            this.subscriber.on('error', (err) => {
                console.error('❌ Redis error:', err.message);
                this.isConnected = false;
            });

            await this.subscriber.connect();
        } catch (error) {
            console.error('💥 Connection error:', error.message);
            throw error;
        }
    }

    async subscribe() {
        try {
            console.log(`📡 Subscribing to channel: ${ETHEREUM_CHANNEL}`);
            
            await this.subscriber.subscribe(ETHEREUM_CHANNEL, (message, channel) => {
                this.handleMessage(message, channel);
            });

            console.log(`✅ Listening on ${ETHEREUM_CHANNEL}...\n`);
        } catch (error) {
            console.error('💥 Subscription error:', error.message);
            throw error;
        }
    }

    handleMessage(message, channel) {
        const receivedAt = new Date().toISOString();
        
        console.log('📨 ==================== ETHEREUM MESSAGE ====================');
        console.log(`🕒 Received: ${receivedAt}`);
        console.log(`📡 Channel: ${channel}`);
        console.log('🔍 RAW MESSAGE:', message);
        
        try {
            const ethereumMessage = JSON.parse(message);
            console.log('🔍 PARSED MESSAGE:', JSON.stringify(ethereumMessage, null, 2));
            
        } catch (parseError) {
            console.error('❌ JSON parsing error:', parseError.message);
        }
        
        console.log('========================================================\n');
    }

    async disconnect() {
        try {
            if (this.subscriber) {
                await this.subscriber.unsubscribe(ETHEREUM_CHANNEL);
                await this.subscriber.quit();
                console.log('✅ Disconnected from Redis');
            }
        } catch (error) {
            console.error('❌ Disconnection error:', error.message);
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            channel: ETHEREUM_CHANNEL,
            timestamp: new Date().toISOString()
        };
    }
}

async function main() {
    const listener = new EthereumRedisListener();

    process.on('SIGINT', async () => {
        console.log('\n🛑 Graceful shutdown initiated...');
        await listener.disconnect();
        console.log('👋 Goodbye!');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\n🛑 SIGTERM received, shutting down...');
        await listener.disconnect();
        process.exit(0);
    });

    try {
        await listener.connect();
        await listener.subscribe();
        
        console.log('💡 Press Ctrl+C to stop gracefully');
        console.log(`📊 Status: ${JSON.stringify(listener.getStatus(), null, 2)}`);
        
        process.stdin.resume();
        
    } catch (error) {
        console.error('💥 Startup error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = EthereumRedisListener;