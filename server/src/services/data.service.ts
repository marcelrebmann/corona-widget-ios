import { Helpers } from "../utils/helpers.js";
import { CoronaData } from "./../interfaces/data.interfaces.js";
import path from "path";
import fs from "fs";
import Logger from "./logger.service.js";

/**
 * The data service manages the cache for the corona data.
 */
export class DataService {

    // The identifier of this service. Appended in log statements.
    private id = "[DATA]";

    // The absolute path to the JSON file that contains the persisted cached data.
    private pathToCachedFile: string;

    // The absolute path to the JSON file that contains the backup data.
    private pathToBackupFile: string;

    // The cached data
    private cachedData: CoronaData;

    constructor(pathToCachedFile: string, pathToBackupFile: string) {
        const cachedFileDir = path.dirname(pathToCachedFile);

        // If the provided cache directory does not exist yet, create it.
        if (!fs.existsSync(cachedFileDir)) {
            Logger.info(`${this.id} Creating data folder...`)
            fs.mkdirSync(cachedFileDir, { recursive: true });
            Logger.info(`${this.id} Success.`)
        }
        const backupFileDir = path.dirname(pathToBackupFile);

        // If the provided backup directory does not exist yet, create it.
        if (!fs.existsSync(backupFileDir)) {
            Logger.info(`${this.id} Creating backup folder...`)
            fs.mkdirSync(backupFileDir, { recursive: true });
            Logger.info(`${this.id} Success.`)
        }

        this.pathToCachedFile = pathToCachedFile;
        this.pathToBackupFile = pathToBackupFile;
        Logger.info(`${this.id} Using Data Dir: ${cachedFileDir}`);
        Logger.info(`${this.id} Using Backup Dir: ${backupFileDir}`);

        try {
            // Load the persisted version of the cached data, if available.
            const rawData = fs.readFileSync(pathToCachedFile, {encoding: 'utf-8'});
            this.cachedData = JSON.parse(rawData);
        } catch (err) {
            Logger.warn(`${this.id} No cached data found.`);
        }
    }

    /**
     * Returns the current corona data from the cache.
     */
    getCachedData(): CoronaData {
        return this.cachedData;
    }

    /**
     * Updates the cached and persisted versions of the corona data.
     * In general this should be executed immediately after the data has been modified by one or more connectors.
     * Before updating the cache, a backup of the current cached data is created.
     * If the new updated data was written on disk successfully, the cache gets updated. Otherwise no
     * update is performed.
     * @param data The updated data.
     */
    async updateCachedData(data: CoronaData): Promise<void> {
        if (!data) {
            Logger.info(`${this.id} Cache update skipped.`);
            return;
        }

        try {
            await this.createBackup(this.cachedData);
            Logger.info(`${this.id} Created backup`);
        } catch (error) {
            Logger.warn(`${this.id} Could not create backup file.`);
            Logger.warn(error);
        }

        try {
            await this.saveDataToFile(data);
            this.cachedData = data;
            Logger.info(`${this.id} Updated data and saved to file.`);
        } catch (error) {
            Logger.error(`${this.id} Could not save updated data to file!`);
            Logger.error(error);
        }
    }

    /**
     * Writes given data to a file on disk to preserve it for future re-starts.
     * The file is saved in the data directory which was provided during service initialization.
     * @param data The data to save to disk.
     */
    private saveDataToFile(data: CoronaData) {
        return Helpers.writeToFile(data, this.pathToCachedFile);
    }

    /**
     * Creates a backup of the given data by writing it to a file on disk.
     * The file is saved in the backup directory which was provided during service initialization.
     * @param data The data to create a backup with.
     */
    private createBackup(data: CoronaData) {
        return Helpers.writeToFile(data, this.pathToBackupFile);
    }
}