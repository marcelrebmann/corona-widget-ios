/**
 * Node script for running manual rollbacks.
 * Resets the cached incidence and infection data to the state of yesterday by modifying the saved file on disk.
 * Use this only, if a recent update corrupted the data for some reason.
 * ATTENTION:
 *  - Incidence trend data may be inaccurate, because it is not re-calculated.
 *  - The increase/decrease for absolute new infections compared to the previous day is lost.
 */
import { Helpers } from "../src/utils/helpers.js";
import path from "path";
const FILE_PATH = path.join(__dirname, "../data/data.json");
const data = require(FILE_PATH);

console.log("Manual rollback started ...");
Helpers.rollbackDataByOneDay(data);
Helpers.writeToFile(data, FILE_PATH);
console.log("Manual rollback finished!");