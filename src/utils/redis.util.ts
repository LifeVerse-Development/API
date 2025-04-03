import Redis from "ioredis";
import { logger } from "../services/logger.service";

const redisClient = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === "true" ? { rejectUnauthorized: false } : undefined,
});

redisClient.on("connect", () => {
    logger.info("✅ Verbunden mit Redis über TLS");
});

redisClient.on("error", (err) => {
    logger.error("❌ Redis Fehler:", err);
});

export { redisClient };
