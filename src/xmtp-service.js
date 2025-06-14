// xmtp-service.js - Simple XMTP Messaging Service

const fs = require("node:fs");
const path = require("node:path");
const { IdentifierKind, Client } = require("@xmtp/node-sdk");
const { createWalletClient, http, toBytes } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");

// ===== HELPER FUNCTIONS =====

/**
 * Create a user object with wallet configuration
 * @param {string} key - Private key
 * @returns {Object} User object with account and wallet
 */
function createUser(key) {
  const account = privateKeyToAccount(key);
  return {
    key: key,
    account,
    wallet: createWalletClient({
      account,
      chain: base,
      transport: http(),
    }),
  };
}

/**
 * Create a signer for XMTP client
 * @param {string} key - Private key
 * @returns {Object} Signer object
 */
function createSigner(key) {
  const sanitizedKey = key.startsWith("0x") ? key : `0x${key}`;
  const user = createUser(sanitizedKey);
  
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifierKind: IdentifierKind.Ethereum,
      identifier: user.account.address.toLowerCase(),
    }),
    signMessage: async (message) => {
      const signature = await user.wallet.signMessage({
        message,
        account: user.account,
      });
      return toBytes(signature);
    },
  };
}

/**
 * Get encryption key from hex string
 * @param {string} hex - Hex string
 * @returns {Uint8Array} Encryption key
 */
async function getEncryptionKeyFromHex(hex) {
  const { fromString } = await import("uint8arrays");
  return fromString(hex, "hex");
}

/**
 * Validate environment variables
 * @param {string[]} vars - Required environment variables
 * @returns {Object} Environment variables object
 */
function validateEnvironment(vars) {
  const missing = vars.filter((v) => !process.env[v]);

  if (missing.length) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const envVars = fs
          .readFileSync(envPath, "utf-8")
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("#"))
          .reduce((acc, line) => {
            const [key, ...val] = line.split("=");
            if (key && val.length) acc[key.trim()] = val.join("=").trim();
            return acc;
          }, {});

        missing.forEach((v) => {
          if (envVars[v]) process.env[v] = envVars[v];
        });
      }
    } catch (e) {
      console.error(e);
    }

    const stillMissing = vars.filter((v) => !process.env[v]);
    if (stillMissing.length) {
      console.error("Missing env vars:", stillMissing.join(", "));
      process.exit(1);
    }
  }

  return vars.reduce((acc, key) => {
    acc[key] = process.env[key];
    return acc;
  }, {});
}

// ===== XMTP SERVICE CLASS =====

class XMTPService {
  constructor(config = {}) {
    // Validate environment variables
    const envVars = validateEnvironment([
      "PRIVATE_KEY",
      "XMTP_DB_ENCRYPTION_KEY",
      "XMTP_ENV",
    ]);

    this.config = {
      privateKey: config.privateKey || envVars.PRIVATE_KEY,
      encryptionKey: config.encryptionKey || envVars.XMTP_DB_ENCRYPTION_KEY,
      environment: config.environment || envVars.XMTP_ENV,
      dbPath: config.dbPath || process.env.XMTP_DB_PATH || "./data/xmtp_database",
    };

    this.client = null;
  }

  /**
   * Initialize the XMTP client
   * @private
   */
  async initializeClient() {
    if (this.client) {
      return;
    }

    try {
      const signer = createSigner(this.config.privateKey);
      const dbEncryptionKey = await getEncryptionKeyFromHex(this.config.encryptionKey);

      this.client = await Client.create(signer, {
        dbEncryptionKey,
        env: this.config.environment,
        dbPath: this.config.dbPath,
      });

      console.log("✓ XMTP client initialized");
    } catch (error) {
      console.error("Error initializing XMTP client:", error);
      throw new Error(`Failed to initialize XMTP client: ${error}`);
    }
  }

  /**
   * Get inbox ID from an Ethereum address
   * @param {string} address - The Ethereum address
   * @returns {Promise<string|null>} The inbox ID or null if not found
   * @private
   */
  async getInboxIdFromAddress(address) {
    try {
      await this.initializeClient();
      
      if (!this.client) {
        throw new Error("XMTP client not initialized");
      }

      // Utiliser inboxStateFromInboxIds n'est pas la bonne méthode car on a besoin de l'inverse
      // Il faut chercher dans les conversations existantes ou utiliser une autre méthode
      
      // Chercher dans les conversations existantes
      const conversations = await this.client.conversations.list();
      for (const conv of conversations) {
        for (const member of conv.members) {
          // Vérifier les identifiants de chaque membre
          const memberState = await this.client.preferences.inboxStateFromInboxIds([member.inboxId]);
          if (memberState[0]?.identifiers) {
            for (const identifier of memberState[0].identifiers) {
              if (identifier.identifier.toLowerCase() === address.toLowerCase()) {
                return member.inboxId;
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting inbox ID for address ${address}:`, error);
      return null;
    }
  }

  /**
   * Send a message to a specific address
   * @param {string} recipientAddress - The recipient's address
   * @param {string} message - The message to send
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendMessage(recipientAddress, message) {
    try {
      await this.initializeClient();
      
      if (!this.client) {
        throw new Error("XMTP client not initialized");
      }

      await this.client.conversations.sync();

      // D'abord chercher une conversation existante avec cette adresse
      let conversation = null;
      let recipientInboxId = await this.getInboxIdFromAddress(recipientAddress);
      
      if (recipientInboxId) {
        // Si on a trouvé l'inbox ID, chercher une conversation existante
        conversation = await this.client.conversations.getDmByInboxId(recipientInboxId);
      }

      if (!conversation) {
        // Vérifier d'abord si l'adresse peut recevoir des messages
        const canReceive = await Client.canMessage([{
          identifier: recipientAddress.toLowerCase(),
          identifierKind: IdentifierKind.Ethereum
        }], this.config.environment);
        
        if (!canReceive.get(recipientAddress.toLowerCase())) {
          throw new Error(`Address ${recipientAddress} cannot receive XMTP messages`);
        }
        
        // Si pas de conversation existante, on doit créer une nouvelle conversation
        // XMTP v3 nécessite l'inbox ID, pas l'adresse Ethereum
        // Pour une nouvelle conversation, on peut essayer de créer directement
        // Le SDK devrait gérer la résolution en interne
        try {
          // Essayer de créer la conversation avec l'adresse
          // Note: Cette approche peut ne pas fonctionner selon l'implémentation du SDK
          conversation = await this.client.conversations.newDm(recipientAddress);
        } catch (dmError) {
          throw new Error(`Cannot create conversation with ${recipientAddress}. They may need to be active on XMTP first. Original error: ${dmError.message}`);
        }
      }

      const sentMessage = await conversation.send(message);
      
      console.log(`✓ Message sent to ${recipientAddress}`);
      
      return {
        success: true,
        messageId: sentMessage.id,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error sending message to ${recipientAddress}:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send messages to multiple recipients
   * @param {Array<{address: string, message: string}>} recipients - Array of recipient objects
   * @returns {Promise<Array<{success: boolean, messageId?: string, error?: string}>>}
   */
  async sendMessages(recipients) {
    const results = [];

    for (const recipient of recipients) {
      const result = await this.sendMessage(recipient.address, recipient.message);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if addresses can receive XMTP messages
   * @param {string|string[]} addresses - The address(es) to check
   * @returns {Promise<Map<string, boolean>|boolean>}
   */
  async canMessage(addresses) {
    try {
      // Normaliser l'entrée en tableau
      const addressArray = Array.isArray(addresses) ? addresses : [addresses];
      
      // Créer les objets Identifier attendus par l'API XMTP v3
      const identifiers = addressArray.map(address => ({
        identifier: address.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum
      }));
      
      // Utiliser la méthode statique Client.canMessage avec l'environnement
      const canMessageMap = await Client.canMessage(identifiers, this.config.environment);
      
      // Si on a passé une seule adresse, retourner juste le booléen
      if (!Array.isArray(addresses)) {
        return canMessageMap.get(addresses.toLowerCase()) || false;
      }
      
      return canMessageMap;

    } catch (error) {
      console.error(`Error checking addresses:`, error);
      if (Array.isArray(addresses)) {
        // Retourner une Map avec toutes les adresses à false
        return new Map(addresses.map(addr => [addr.toLowerCase(), false]));
      }
      return false;
    }
  }

  /**
   * Close the client connection
   */
  async close() {
    if (this.client) {
      this.client = null;
      console.log("✓ XMTP connection closed");
    }
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Create an XMTP service instance
 * @param {Object} config - Optional configuration object
 * @returns {XMTPService} New XMTP service instance
 */
function createXMTPService(config = {}) {
  return new XMTPService(config);
}

/**
 * Simple function to send an XMTP message
 * @param {string} address - Recipient address
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} Success status
 */
async function sendXMTPMessage(address, message) {
  const xmtpService = createXMTPService();
  
  try {
    const canReceive = await xmtpService.canMessage(address);
    if (!canReceive) {
      console.log(`⚠️ Address ${address} cannot receive XMTP messages`);
      return false;
    }
    
    const result = await xmtpService.sendMessage(address, message);
    
    if (result.success) {
      console.log(`✓ Message sent successfully to ${address}`);
      return true;
    } else {
      console.error(`✗ Failed to send to ${address}: ${result.error}`);
      return false;
    }
    
  } catch (error) {
    console.error(`Error sending to ${address}:`, error);
    return false;
  } finally {
    await xmtpService.close();
  }
}

// ===== EXPORTS =====

module.exports = {
  XMTPService,
  createXMTPService,
  sendXMTPMessage,
};