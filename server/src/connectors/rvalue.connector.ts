import { HeadRequestResult } from './../utils/helpers';
import { Helpers } from '../utils/helpers';
import { CoronaData, PredictedTrend } from './../interfaces/data.interfaces';
import { Connector, ConnectorUpdateType } from './base.connector';
import path from "path";
import Logger from "../services/logger.service";
import { XlsxService } from "../services/xlsx.service";

/**
 * Updates the R-value data based on the official published RKI XLSX report file.
 */
export class RValueConnector extends Connector {

  private readonly R_VALUE_URL = "https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Projekte_RKI/Nowcasting_Zahlen.xlsx?__blob=publicationFile";
  private readonly XLSX_FILE_PATH = path.join(__dirname, "./../../data/rvalue.xlsx");
  private readonly R_VALUE_XLSX_SHEET_REGEX = /Nowcast.{1}R/i;

  // Possible names for the R-value column header in the XLSX.
  private readonly R_VALUE_HEADER_COLUMN_NAMES = ["Punktschätzer des 7-Tage-R Wertes"];

  constructor() {
    super("[R_VAL]", ConnectorUpdateType.FREQUENT);
  }

  /**
   * Updates the R-value data, if new data is available.
   * - If no cached data is provided, the update is postponed.
   * - Checks, if new R-value data is available. If not, the update is postponed.
   * - Retrieves the XLSX file from RKI and tries to find the most recent R-value data.
   *   R-value data of the past 7 days is taken into account for the trend calculation.
   * - If no valid R-values were found, the update is aborted.
   * @param cachedData The current cached data.
   */
  public async update(cachedData: CoronaData): Promise<any> {

    if (!cachedData) {
      Logger.info(`${this.getId()} Postponing update until cached data exists.`);
      return;
    }
    const cachedDataTimestamp = cachedData.country ? (cachedData.country.r_value_7_days_last_updated || 0) : 0
    const dataCheckResult = await Helpers.isNewDataAvailable(this.R_VALUE_URL, cachedDataTimestamp);

    if (!dataCheckResult.isMoreRecentDataAvailable) {
      Logger.info(`${this.getId()} No new data for R-Value available yet.`);
      return;
    }

    try {
      const xlsxFilePath = await XlsxService.downloadXlsx(this.R_VALUE_URL, this.XLSX_FILE_PATH);

      if (!xlsxFilePath) {
        throw new Error("XLSX download failed");
      }
      const fetchedTimestamp = Date.now();
      const rows = await XlsxService.readXlsx(xlsxFilePath, this.R_VALUE_XLSX_SHEET_REGEX);
      const validRvalues = this.findValidRValues(rows);
      const rValue = validRvalues[validRvalues.length - 1];
      const rValueTrend = Helpers.computeTrend(validRvalues);

      // Validation
      if (!this.isDataValid(cachedData, rValue, rValueTrend, dataCheckResult)) {
        throw new Error("[COVID] R-Value Plausi-Check failed");
      }
      const updatedData = Helpers.copyDeep(cachedData);
      updatedData.country.r_value_7_days = rValue;
      updatedData.country.r_value_7_days_trend = rValueTrend;
      updatedData.country.r_value_7_days_last_updated = dataCheckResult.lastModified;
      updatedData.country.r_value_7_days_fetched_timestamp = fetchedTimestamp;

      return updatedData;
    } catch (err) {
      Logger.error(`${this.getId()} Could not update R-Values`);
      Logger.error(`${this.getId()} ${err}`)
      return;
    }
  }

  /**
   * Checks, if the R-value data and the calculated trend are valid.
   * The R-value must not be negative and the data retrieved by RKI must be more recent than the cached one.
   * @param cachedData The cached data.
   * @param rValue The most recent R-value.
   * @param rValueTrend The calculated trend for the R-value.
   * @param dataCheckResult Information about the freshness check of the retrieved RKI data.
   */
  private isDataValid(cachedData: CoronaData, rValue: number, rValueTrend: PredictedTrend, dataCheckResult: HeadRequestResult): boolean {
    return rValue >= 0 &&
    !!rValueTrend &&
    dataCheckResult.lastModified >= 0 &&
    dataCheckResult.lastModified > (cachedData.country.r_value_7_days_last_updated || 0)
  }

  /**
   * Tries to find the R-values of the past 7 days within the XLSX data from RKI.
   * First, the index of the R-value column is searched. If found, the most recent
   * R-values are extracted and validated.
   * If the column does not exist or the R-values are invalid, an error is thrown.
   * @param rows The data rows of the XLSX file from the RKI API.
   */
  private findValidRValues(rows: any[][]): number[] {
    if (!rows || !rows.length) {
      throw new Error("XLSX read error / no rows detected");
    }

    let headerRowIndex: number;
    let rValueColumnIndex: number;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (!row || !row.length) {
        continue;
      }

      for (const colName of this.R_VALUE_HEADER_COLUMN_NAMES) {
        const index = row.indexOf(colName);

        if (index !== -1) {
          headerRowIndex = i;
          rValueColumnIndex = index;
          break;
        }
      }

      if (typeof headerRowIndex !== "undefined" && typeof rValueColumnIndex !== "undefined") {
        break;
      }
    }
    const rValues = rows.slice(-7).map((row: string[]) => row[rValueColumnIndex]);

    if (!rValues || !rValues.length) {
      throw new Error("No R-values found");
    }
    const validRvalues: number[] = rValues.map(rValueString => {
      try {

        if (typeof rValueString === "string") {
          return parseFloat(rValueString.replace(/,/g, "."));
        } else if (typeof rValueString === "number") {
          return rValueString;
        } else {
          return undefined;
        }
      } catch {
        return undefined;
      }
    }).filter((rValue: number) => {
      return rValue !== null && !isNaN(rValue) && isFinite(rValue) && rValue >= 0;
    });

    if (!validRvalues || !validRvalues.length) {
      throw new Error("No valid R-values found");
    }
    return validRvalues;
  }
}