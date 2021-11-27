import { Helpers } from '../utils/helpers.js';
import { CoronaData, PredictedTrend, District, RkiResponse, RkiDistrict } from './../interfaces/data.interfaces.js';
import { Connector, ConnectorUpdateType } from './base.connector.js';
import axios from "axios";
import Logger from "../services/logger.service.js";

/**
 * Updates the incidence data and history/trends for districts, states and country.
 * The data is based on and retrieved from the official RKI API.
 */
export class IncidenceConnector extends Connector {

  private readonly LANDKREISE_DATA_ALL = "https://services7.arcgis.com/mOBPykOjAyBO2ZKk/arcgis/rest/services/RKI_Landkreisdaten/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,GEN,BEZ,EWZ,EWZ_BL,cases,deaths,cases_per_100k,cases_per_population,BL,BL_ID,county,last_update,cases7_per_100k,recovered,EWZ_BL,cases7_bl_per_100k&returnGeometry=false&outSR=4326&f=json";
  private readonly MAX_DAYS_IN_HISTORY = 14;
  private readonly MAX_DAYS_FOR_TREND_CALCULATION = 14;

  constructor() {
    super("[INC]", ConnectorUpdateType.REGULAR);
  }

  /**
   * Updates the district data, if new data is available.
   * - If no cached data is provided, the update is postponed.
   * - Checks, if new district data data is available. If not, the update is postponed.
   * - If no valid district data was found, the update is aborted.
   * - If the fetched data from RKI API is from the same day and differs the cached one,
   *   the data for the current day is corrected.
   * @param cachedData The current cached data.
   */
  public async update(cachedData: CoronaData): Promise<CoronaData> {
    let rkiResponse;

    try {
      rkiResponse = await axios.get(this.LANDKREISE_DATA_ALL);
    } catch (error) {
      Logger.error(`${this.getId()} Request to RKI failed.`)
      return;
    }

    if (!rkiResponse || !rkiResponse.data || !rkiResponse.data.features || !rkiResponse.data.features.length) {
      Logger.error(`${this.getId()} Received invalid data!`);
      return;
    }
    const fetchedData = rkiResponse.data;

    // Deep copy of cached data
    let actualData = cachedData ? JSON.parse(JSON.stringify(cachedData)) : {};

    const timestampOfFetchedData = Helpers.getTimestampOfFetchedData(fetchedData);
    const isFetchedDataFromSameDay = timestampOfFetchedData === actualData.rki_updated;
    const isFetchedDataOutdated = timestampOfFetchedData < actualData.rki_updated;

    if (isFetchedDataOutdated) {
      Logger.info(`${this.getId()} Retrieved data from RKI is outdated. Checking again later.`);
      return;
    }

    if (isFetchedDataFromSameDay) {

      if (this.isDistrictDataEqualWithCache(actualData, fetchedData)) {
        Logger.info(`${this.getId()} Data contains no updates. Keeping cached one.`);
        return;
      }
      // Rollback to previous day to update today again.
      Logger.info(`${this.getId()} Found updated data for same day. Updating with rollback.`)
      Helpers.rollbackDataByOneDay(actualData);
    }

    // Construct new data from rki response.
    const newData = this.constructNewData(actualData, fetchedData, timestampOfFetchedData);

    // Validate new data.
    if (!newData.landkreise || !newData.landkreise.length) {
      Logger.error(`${this.getId()} Could not construct new updated data!`);
      return;
    }

    if (!this.isDistrictDataValid(newData)) {
      Logger.error(`${this.getId()} Plausi-ERROR: Landkreis data invalid.`);
      return;
    }

    if (!this.isCountryDataValid(newData)) {
      Logger.error(`${this.getId()} Plausi-ERROR: Country data invalid.`);
      return;
    }

    if (!this.isMetadataValid(newData, actualData, isFetchedDataFromSameDay)) {
      Logger.error(`${this.getId()} Plausi-ERROR: Metadata invalid.`);
      return;
    }
    return newData;
  }

  /**
   * Checks if the cached districts data of the server equals the fetched ones from RKI API. 
   * @param cachedData The cached data.
   * @param fetchedData The fetched data from RKI API.
   */
  private isDistrictDataEqualWithCache(cachedData: CoronaData, fetchedData: RkiResponse): boolean {

    for (let entry of fetchedData.features) {
      const landkreis = entry.attributes;
      const cachedLandkreis = cachedData.landkreise.find((lk: District) => lk.OBJECTID === landkreis.OBJECTID);

      if (!cachedLandkreis) {
        return false;
      }
      const isLandkreisDataEqual = landkreis.cases === cachedLandkreis.cases
        && landkreis.cases7_per_100k === cachedLandkreis.cases7_per_100k
        && landkreis.deaths === cachedLandkreis.deaths
        && landkreis.cases_per_100k === cachedLandkreis.cases_per_100k
        && landkreis.county === cachedLandkreis.county
        && landkreis.BL === cachedLandkreis.BL
        && landkreis.BL_ID === cachedLandkreis.BL_ID
        && landkreis.cases7_per_100k === cachedLandkreis.cases7_per_100k
        && landkreis.cases7_bl_per_100k === cachedLandkreis.cases7_bl_per_100k;

      if (!isLandkreisDataEqual) {
        return false;
      }
    }
    return true;
  }

  /**
   * Constructs and returns the new data from the data received by RKI API.
   * @param cachedData The cached data from the server.
   * @param fetchedData The fetched data from RKI API.
   * @param timestampOfFetchedData Timestamp of when the RKI data was fetched.
   */
  private constructNewData(cachedData: CoronaData, fetchedData: RkiResponse, timestampOfFetchedData: number): CoronaData {
    const data = this.generateNewDataTemplate(cachedData);
    const fetchedDate = new Date(Date.now());

    const tempBundeslandTrends: { [key: string]: PredictedTrend } = {}
    const bundeslandIndicences: number[] = [];
    let einwohnerzahlDe = 0;
    const bundeslandAbsoluteCases7Days: { [key: string]: number } = {};

    for (const feature of fetchedData.features) {
      const landkreis: RkiDistrict = feature.attributes;
      const cachedLandkreis = cachedData.landkreise?.find((lk: District) => lk.OBJECTID === landkreis.OBJECTID);

      const cases7_per_100k_history: number[] = cachedLandkreis && cachedLandkreis.cases7_per_100k_history ? [].concat(cachedLandkreis.cases7_per_100k_history, landkreis.cases7_per_100k).slice(-this.MAX_DAYS_IN_HISTORY) : [landkreis.cases7_per_100k];
      const cases7_bl_per_100k_history: number[] = cachedLandkreis && cachedLandkreis.cases7_bl_per_100k_history ? [].concat(cachedLandkreis.cases7_bl_per_100k_history, landkreis.cases7_bl_per_100k).slice(-this.MAX_DAYS_IN_HISTORY) : [landkreis.cases7_bl_per_100k];
      const landkreisTrend = Helpers.computeTrend(cases7_per_100k_history.slice(-this.MAX_DAYS_FOR_TREND_CALCULATION));

      if (!tempBundeslandTrends[landkreis.BL_ID]) {
        tempBundeslandTrends[landkreis.BL_ID] = Helpers.computeTrend(cases7_bl_per_100k_history.slice(-this.MAX_DAYS_FOR_TREND_CALCULATION));
        bundeslandIndicences.push(landkreis.cases7_bl_per_100k);
      }

      if (!bundeslandAbsoluteCases7Days[landkreis.BL_ID]) {
        bundeslandAbsoluteCases7Days[landkreis.BL_ID] = landkreis.cases7_bl_per_100k / 100000 * landkreis.EWZ_BL;
        einwohnerzahlDe += landkreis.EWZ_BL;
      }

      data.landkreise.push({
        ...landkreis,
        cases_previous_day: cachedLandkreis ? cachedLandkreis.cases : landkreis.cases,
        deaths_previous_day: cachedLandkreis ? cachedLandkreis.deaths : landkreis.deaths,
        cases7_per_100k_history,
        cases7_bl_per_100k_history,
        cases7_per_100k_trend: landkreisTrend,
        cases7_bl_per_100k_trend: tempBundeslandTrends[landkreis.BL_ID]
      });
      data.country.cases = data.country.cases + landkreis.cases;
    }
    data.country.cases_previous_day = cachedData.country ? cachedData.country.cases : data.country.cases;
    data.country.new_cases_previous_day = cachedData.country ? cachedData.country.new_cases : 0;
    data.country.new_cases = data.country.cases - data.country.cases_previous_day;

    data.country.cases7_de_per_100k = Object.values(bundeslandAbsoluteCases7Days).reduce((sum, blAbsoluteCases) => sum + blAbsoluteCases) / einwohnerzahlDe * 100000;
    data.country.cases7_de_per_100k_history = [].concat(cachedData.country ? (cachedData.country.cases7_de_per_100k_history || []) : [], data.country.cases7_de_per_100k).slice(-this.MAX_DAYS_IN_HISTORY);
    data.country.cases7_de_per_100k_trend = Helpers.computeTrend(data.country.cases7_de_per_100k_history.slice(-this.MAX_DAYS_FOR_TREND_CALCULATION));

    data.rki_updated = timestampOfFetchedData;
    data.rki_updated_date = new Date(data.rki_updated).toISOString();
    data.fetched = fetchedDate.toISOString();
    data.fetched_timestamp = fetchedDate.getTime();

    return data;
  }

  /**
   * Constructs the template for an updated version of the cached data.
   * Uses initial/default values for incidence-related metrics.
   * @param cachedData The cached data.
   */
  private generateNewDataTemplate(cachedData: CoronaData): CoronaData {
    return {
      landkreise: [], // Daten zu den Landkreisen.
      country: {
        ...cachedData.country,
        cases: 0, // Gesamtzahl der Fälle in DE
        cases_previous_day: 0, // Gesamtzahl der Fälle in DE am vorherigen Tag
        new_cases: 0, // Neuinfektionen in DE
        new_cases_previous_day: 0, // Neuinfektionen in DE am vorherigen Tag
        cases7_de_per_100k: 0, // 7-Tage Inzidenz DE
        cases7_de_per_100k_history: [], // Verlauf 7-Tage Inzidenz DE
        cases7_de_per_100k_trend: {} as PredictedTrend // Trend 7-Tage Inzidenz DE
      },
      vaccination: cachedData ? {
        ...cachedData.vaccination
      } : undefined,
      hospitalization: cachedData ? {
        ...cachedData.hospitalization
      } : undefined,
      rki_updated: 0, // Zeitstempel der Daten vom RKI
      rki_updated_date: null, // Zeitstempel der Daten vom RKI als ISO String.
      fetched: null, // Zeitstempel der Datenabfrage vom RKI als ISO String.
      fetched_timestamp: 0 // Zeitstempel der Datenabfrage vom RKI
    };
  }

  /**
   * Checks, if the district related data is valid.
   * @param data The data to check.
   */
  private isDistrictDataValid(data: CoronaData): boolean {
    return data.landkreise.every((lk) => {
      const isValid = !!lk.OBJECTID &&
        !!lk.BL_ID &&
        !!lk.BL &&
        !!lk.county &&
        lk.cases7_bl_per_100k >= 0 &&
        lk.cases7_per_100k >= 0 &&
        lk.cases7_per_100k_history &&
        !!lk.cases7_bl_per_100k_history &&
        lk.cases >= 0 &&
        lk.cases_previous_day >= 0 &&
        // Tolerance, if a few cases were corrected.
        // lk.cases >= Math.max(lk.cases_previous_day - 10, 0) &&
        lk.deaths >= 0 &&
        lk.deaths_previous_day >= 0;

      if (!isValid) {
        Logger.error(`${this.getId()} Invalid Landkreis in new data! ID: ${lk.OBJECTID}, Name: ${lk.county}`);
        Logger.error(lk.BL_ID)
        Logger.error(lk.BL)
        Logger.error(lk.county)
        Logger.error(`${lk.cases7_bl_per_100k}, ${lk.cases7_bl_per_100k >= 0}`)
        Logger.error(`${lk.cases7_per_100k}, ${lk.cases7_per_100k >= 0}`)
        Logger.error(`${lk.cases7_per_100k_history}, ${!!lk.cases7_per_100k_history}`)
        Logger.error(`${lk.cases7_bl_per_100k_history}, ${!!lk.cases7_bl_per_100k_history}`)
        Logger.error(`${lk.cases}, ${lk.cases >= 0}`)
        Logger.error(`${lk.cases_previous_day}, ${lk.cases_previous_day >= 0}`)
        Logger.error(`${lk.cases}, ${lk.cases_previous_day}, ${lk.cases >= lk.cases_previous_day}`)
        Logger.error(`${lk.cases} ${lk.deaths_previous_day >= 0}`)
      }
      return isValid;
    });
  }

  /**
   * Checks, if the country data is valid.
   * @param data The data to check.
   */
  private isCountryDataValid(data: CoronaData): boolean {
    return data.country.cases >= 0 &&
      data.country.cases_previous_day >= 0 &&
      data.country.cases >= data.country.cases_previous_day &&
      data.country.new_cases >= 0 &&
      data.country.new_cases_previous_day >= 0 &&
      data.country.cases7_de_per_100k >= 0 &&
      !!data.country.cases7_de_per_100k_history;
  }

  /**
   * Checks, if the meta data is valid.
   * @param newData The data to check.
   * @param cachedData The current cached data.
   * @param isFetchedDataFromSameDay If the fetched data is from the same day as the cached one. 
   * Indicates a correction of the data from RKI side.
   */
  private isMetadataValid(newData: CoronaData, cachedData: CoronaData, isFetchedDataFromSameDay: boolean): boolean {
    return newData.rki_updated >= 0
    && ((!isFetchedDataFromSameDay && newData.rki_updated > (cachedData.rki_updated || 0)) || (isFetchedDataFromSameDay && newData.rki_updated === cachedData.rki_updated))
    && newData.fetched_timestamp >= 0
    && newData.fetched_timestamp >= newData.rki_updated;
  }
}