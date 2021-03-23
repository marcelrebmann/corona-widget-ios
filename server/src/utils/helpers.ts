import { RkiResponse, PredictedTrend, CoronaData } from "./../interfaces/data.interfaces";
import fs from "fs";
import axios from "axios";
const SimpleLinearRegression = require("ml-regression-simple-linear");

export interface HeadRequestResult {
  isMoreRecentDataAvailable: boolean,
  lastModified: number
}

/**
 * Generic helper functions for common operations regarding data and I/O.
 */
export class Helpers {

  private static readonly ONE_DAY_IN_MS = 86400000;

  // Matches the german date strings (DD.MM.YYYY) which the RKI uses.
  private static readonly GERMAN_DATE_REGEX = /^([0-9]{2}).([0-9]{2}).([0-9]{4})/;

  /**
   * Performs a deep copy of objects and returns the copied one.
   * Be aware:
   * Complex types that cannot be handled by JSON such as Functions and Date objects are not supported.
   * @param data The data object to copy deep.
   */
  static copyDeep<T = object>(data: T): T {
    if (typeof data !== "object") {
      return undefined;
    }
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Writes corona data to a file on disk.
   * @param data The data object to write to file.
   * @param filePath The destination file path.
   */
  static writeToFile(data: CoronaData, filePath: string): Promise<void> {
    return new Promise<void>((res, rej) => {
      fs.writeFile(filePath, JSON.stringify(data), (err) => {
        if (err) {
          return rej();
        }
        return res();
      })
    });
  }

  /**
   * Check, if the content of a website has changed since the last time it was visited.
   * A HEAD request is performed and the returned last-modified date is checked against
   * a provided timestamp.
   * Returns if the website was modified after the provided timestamp which acts as an
   * indicator that new, more recent data is available on this site.
   * Also returns the modification date of the website as timestamp.
   * @param url The URL to check.
   * @param lastChecked Timestamp of the last time, the website was visited/checked.
   */
  static async isNewDataAvailable(url: string, lastChecked: number): Promise<HeadRequestResult> {
    try {
      const response = await axios.head(url);

      if (!response || response.status !== 200) {
        throw new Error();
      }
      // ISO string representing a date.
      const lastModified: string = response.headers["last-modified"];
      const modifiedTimestamp = new Date(lastModified).getTime();
      const isMoreRecentDataAvailable = modifiedTimestamp > lastChecked;

      return {
        isMoreRecentDataAvailable,
        lastModified: modifiedTimestamp
      }
    } catch {
      return {
        isMoreRecentDataAvailable: false,
        lastModified: null
      };
    }
  }

  /**
   * Compute a linear trend for a given series of numeric data.
   * Returns the slope and the predicted value calculated via linear regression.
   * @param yValues 
   */
  static computeTrend(yValues: number[]): PredictedTrend {
    if (!yValues || !yValues.length) {
      return {
        slope: null,
        predicted_value: null
      };
    }
    if (yValues.length === 1) {
      return {
        slope: 0,
        predicted_value: yValues[0]
      };
    }
    const xValues = yValues.map((v, i) => i);

    const regression = new SimpleLinearRegression(xValues, yValues);

    return {
      slope: regression.slope,
      predicted_value: regression.predict(xValues.length)
    }
  }

  /**
   * Finds the most recent timestamp from all dates available in RKI data and returns it.
   * Returns null, if no dates ware found within the data.
   * @param rki_data The data received from RKI
   */
  static getTimestampOfFetchedData(rki_data: RkiResponse): number | null {
    const last_updated_candidates = [];

    for (const feature of rki_data.features) {
      const landkreis = feature.attributes;
      const isNewUpdatedDate = last_updated_candidates.indexOf(landkreis.last_update) === -1;

      if (isNewUpdatedDate) {
        last_updated_candidates.push(landkreis.last_update);
      }
    }

    const rki_timestamps = last_updated_candidates.map((c) => {
      const match = c.match(this.GERMAN_DATE_REGEX);

      if (!match || !match.length) {
        return null;
      }
      const day = match[1];
      const month = match[2];
      const year = match[3];
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
    }).filter(c => !!c && !isNaN(c));

    return rki_timestamps.length ? Math.max(...rki_timestamps) : null;
  }

  /**
   * Rollback incidence related data for countys, states and the country as well as the historic data
   * to the state of the previous day.
   * This is especially useful, if an update corrupted the actual data in some way.
   * Use with care, because only several data entries are rolled back!
   * Common advise is to perform an update of the data shortly after rolling back.
   * @param data The corona data to rollback.
   */
  static rollbackDataByOneDay(data: CoronaData): void {

    if (!data) {
      return;
    }

    for (const landkreis of data.landkreise) {
      landkreis.cases = landkreis.cases_previous_day;
      landkreis.deaths = landkreis.deaths_previous_day;
      landkreis.cases7_per_100k_history = landkreis.cases7_per_100k_history.slice(0, landkreis.cases7_per_100k_history.length - 1);
      landkreis.cases7_bl_per_100k_history = landkreis.cases7_bl_per_100k_history.slice(0, landkreis.cases7_bl_per_100k_history.length - 1);
    }

    data.country.new_cases = data.country.new_cases_previous_day;
    data.country.cases = data.country.cases_previous_day;
    data.country.cases7_de_per_100k_history = data.country.cases7_de_per_100k_history.slice(0, data.country.cases7_de_per_100k_history.length - 1);

    data.rki_updated = data.rki_updated - this.ONE_DAY_IN_MS;
  }
}