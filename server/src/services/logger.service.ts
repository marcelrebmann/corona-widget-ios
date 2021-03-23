import winston from "winston";
import "winston-daily-rotate-file";
import { format } from "logform";
import path from "path";

const LOG_DIRECTORY = path.join(__dirname, "../../logs");
const isInProductionEnv = process.env.NODE_ENV === "production";


/**
 * Common format for logs is:
 * [DATETIME] [LOGLEVEL]:    [MESSAGE]
 */
const customFormat = format.combine(
    format.colorize(),
    format.timestamp(),
    format.align(),
    format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
);

/**
 * In production environment, log to file and use log rotation to prevent huge log files.
 */
const fileTransports: winston.transport[] = [
    // Write all logs with level `info` and below to log file.
    new winston.transports.DailyRotateFile({
        filename: "corona-server-%DATE%.log",
        dirname: LOG_DIRECTORY,
        datePattern: "YYYY-MM-DD",
        maxSize: "10m",
        maxFiles: "7d",
        level: "info"
    })
];

/**
 * In dev environment, write logs out to console only.
 */
const devTransports: winston.transport[] = [
    new winston.transports.Console({ format: customFormat })
];

/**
 * The actual configured logger instance.
 */
const Logger = winston.createLogger({
    level: "info",
    format: customFormat,
    defaultMeta: { service: "user-service" },
    transports: isInProductionEnv ? fileTransports : devTransports
});

export default Logger;