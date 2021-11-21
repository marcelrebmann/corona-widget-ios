import { CsvService } from "./../services/csv.service.js";
import { Helpers } from "../utils/helpers.js";
import { CoronaData, PredictedTrend } from "./../interfaces/data.interfaces.js";
import { Connector, ConnectorUpdateType } from "./base.connector.js";
import path, { dirname } from "path";
import Logger from "../services/logger.service.js";
import { fileURLToPath } from "url";
import { DateUtils } from "../utils/date.utils.js";
import { RkiRValueReportDay } from "../interfaces/r-value.interfaces.js";

interface RValueDataPoint {
  date: string;
  rValue: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Updates the R-value data based on the official published RKI XLSX report file.
 */
export class RValueConnector extends Connector {
  private readonly R_VALUE_REPORT_CSV_URL =
    "https://raw.githubusercontent.com/robert-koch-institut/SARS-CoV-2-Nowcasting_und_-R-Schaetzung/main/Nowcast_R_aktuell.csv";
  private readonly CSV_FILE_PATH = path.join(__dirname, "./../../data/rvalue.csv");

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
    const cachedDataTimestamp = cachedData.country ? cachedData.country.r_value_7_days_last_updated || 0 : 0;
    const lastUpdatedDate = new Date(cachedDataTimestamp);

    try {
      const rValueRows: RkiRValueReportDay[] = await CsvService.downloadAndReadCsv(
        this.R_VALUE_REPORT_CSV_URL,
        this.CSV_FILE_PATH
      );

      if (!rValueRows || rValueRows.length <= 0) {
        throw new Error("CSV no rows detected");
      }
      const fetchedTimestamp = Date.now();
      const todayDate = new Date(Date.now());

      const isBeforeNextPlannedRefresh = DateUtils.isBefore(
        DateUtils.getTomorrow(lastUpdatedDate).getTime(),
        todayDate.getTime()
      );

      // No refresh needed yet. Cached data is actual.
      if (isBeforeNextPlannedRefresh) {
        Logger.info(`${this.getId()} No new data for R-Value available yet.`);
        return;
      }

      const validRvalues = this.findValidRValues(rValueRows);
      const mostRecentDataPoint = validRvalues[0];
      const mostRecentDataPointDate = new Date(mostRecentDataPoint.date);
      const lastKnownDataPointDate = new Date(cachedData.country.r_value_7_days_date);

      // Most recent datapoint from report is already cached.
      if (
        DateUtils.isBefore(lastKnownDataPointDate.getTime(), mostRecentDataPointDate.getTime()) ||
        DateUtils.isSameDay(lastKnownDataPointDate.getTime(), mostRecentDataPointDate.getTime())
      ) {
        Logger.info(`${this.getId()} No new data for R-Value available yet.`);
        return;
      }

      const rValueTrend = Helpers.computeTrend(validRvalues.map((dataPoint) => dataPoint.rValue).reverse());

      // Validation
      if (!this.isDataValid(cachedData, mostRecentDataPoint.rValue, rValueTrend, mostRecentDataPointDate.getTime())) {
        throw new Error("[COVID] R-Value Plausi-Check failed");
      }
      const updatedData = Helpers.copyDeep(cachedData);
      updatedData.country.r_value_7_days = mostRecentDataPoint.rValue;
      updatedData.country.r_value_7_days_date = mostRecentDataPoint.date;
      updatedData.country.r_value_7_days_trend = rValueTrend;
      updatedData.country.r_value_7_days_last_updated = mostRecentDataPointDate.getTime();
      updatedData.country.r_value_7_days_fetched_timestamp = fetchedTimestamp;

      return updatedData;
    } catch (err) {
      Logger.error(`${this.getId()} Could not update R-Values`);
      Logger.error(`${this.getId()} ${err}`);
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
  private isDataValid(
    cachedData: CoronaData,
    rValue: number,
    rValueTrend: PredictedTrend,
    rValueTimestamp: number
  ): boolean {
    return (
      rValue >= 0 &&
      !!rValueTrend &&
      rValueTimestamp >= 0 &&
      rValueTimestamp > (cachedData.country.r_value_7_days_last_updated || 0)
    );
  }

  /**
   * Tries to find the R-values of the past 7 days within the XLSX data from RKI.
   * First, the index of the R-value column is searched. If found, the most recent
   * R-values are extracted and validated.
   * If the column does not exist or the R-values are invalid, an error is thrown.
   * @param rows The data rows of the XLSX file from the RKI API.
   */
  private findValidRValues(rows: RkiRValueReportDay[]): RValueDataPoint[] {
    if (!rows || !rows.length) {
      throw new Error("CSV read error / no rows detected");
    }

    let validRValues: RValueDataPoint[] = [];

    for (let i = rows.length - 1; i >= 0; i--) {
      if (validRValues.length >= 7) {
        break;
      }
      const rValueRow = rows[i];

      if (!rValueRow.PS_7_Tage_R_Wert || !this.isRValueValid(parseFloat(rValueRow.PS_7_Tage_R_Wert))) {
        continue;
      }
      validRValues.push({
        date: rValueRow.Datum,
        rValue: parseFloat(rValueRow.PS_7_Tage_R_Wert),
      });
    }

    if (validRValues.length <= 0) {
      throw new Error("No valid R-values found");
    }
    return validRValues;
  }

  private isRValueValid(rValue: number): boolean {
    return rValue !== null && !isNaN(rValue) && isFinite(rValue) && rValue >= 0;
  }
}
