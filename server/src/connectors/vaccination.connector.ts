import { DateUtils } from './../utils/date.utils';
import { Helpers } from '../utils/helpers';
import { VaccinationData, CoronaData } from './../interfaces/data.interfaces';
import { Connector, ConnectorUpdateType } from './base.connector';
import path from "path";
import Logger from "../services/logger.service";
import { XlsxService } from "../services/xlsx.service";

interface VaccinationDataColumnIndexes {
  bundeslandIdColumnIndex: number;
  bundeslandNameColumnIndex: number;
  vaccinationsCumulatedColumnIndex: number;
  vaccinationQuoteIndex: number;
}

/**
 * Updates the vaccination data based on the official published RKI XLSX report file.
 */
export class VaccinationConnector extends Connector {

  private readonly VACCINATION_API = "https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquotenmonitoring.xlsx?__blob=publicationFile";
  private readonly VACCINATION_DATA_XLSX_FILE_PATH = path.join(__dirname, "./../../data/vaccination.xlsx");
  private readonly VACCINATION_XLSX_SHEET_REGEX = /Impfquote.{1}bis/i;

  private readonly STATE_LIST: { [key: number]: string } = {
    1: "Schleswig-Holstein",
    2: "Hamburg",
    3: "Niedersachsen",
    4: "Bremen",
    5: "Nordrhein-Westfalen",
    6: "Hessen",
    7: "Rheinland-Pfalz",
    8: "Baden-Württemberg",
    9: "Bayern",
    10: "Saarland",
    11: "Berlin",
    12: "Brandenburg",
    13: "Mecklenburg-Vorpommern",
    14: "Sachsen",
    15: "Sachsen-Anhalt",
    16: "Thüringen"
  }
  private readonly STATE_NAMES = Object.values(this.STATE_LIST);

  constructor() {
    super("[VACC]", ConnectorUpdateType.FREQUENT);
  }

  /**
   * Updates the vaccination data, if new data is available.
   * - If no cached data is provided, the update is postponed.
   * - Checks, if new vaccination data data is available. If not, the update is postponed.
   * - Retrieves the XLSX file from RKI and tries to find the vaccination data.
   * - If no valid vaccination data was found, the update is aborted.
   * @param cachedData The current cached data.
   */
  async update(cachedData: CoronaData): Promise<any> {

    if (!cachedData) {
      Logger.info(`${this.getId()} Postponing update until cached data exists.`);
      return;
    }

    if (!cachedData.vaccination) {
      cachedData.vaccination = this.generateDataTemplate(0, 0);
    }

    try {
      const cachedDataTimestamp = cachedData.vaccination ? (cachedData.vaccination.last_updated || 0) : 0;
      const updateCheckResult = await Helpers.isNewDataAvailable(this.VACCINATION_API, cachedDataTimestamp);

      if (!updateCheckResult.isMoreRecentDataAvailable) {
        Logger.info(`${this.getId()} No new vaccination data found.`)
        return;
      }
      const xlsxFilePath = await XlsxService.downloadXlsx(this.VACCINATION_API, this.VACCINATION_DATA_XLSX_FILE_PATH);

      if (!xlsxFilePath) {
        throw new Error("XLSX download error");
      }
      const fetchedTimestamp = Date.now();
      const rows = await XlsxService.readXlsx(xlsxFilePath, this.VACCINATION_XLSX_SHEET_REGEX);

      if (!rows || !rows.length) {
        throw new Error("XLSX read error / no rows detected");
      }
      const columnIndexes = this.findColumnIndexes(rows);

      if (!this.areColumnIndexesValid(columnIndexes)) {
        throw new Error("Could not find all column indexes");
      }

      const vaccinationData = this.constructNewData(rows, updateCheckResult.lastModified, fetchedTimestamp, columnIndexes, cachedData);

      // Validation
      if (!this.isStateDataValid(vaccinationData)) {
        throw new Error("State data Plausi-Check failed")
      }

      if (!this.isCountryDataValid(vaccinationData, cachedData)) {
        throw new Error("Country data Plausi-Check failed")
      }
      const updatedData = Helpers.copyDeep(cachedData);
      updatedData.vaccination = vaccinationData;

      return updatedData;
    } catch (err) {
      Logger.error(`${this.getId()} Could not update vaccination data.`);
      Logger.error(`${this.getId()} ${err}`);
      return;
    }
  }

  /**
   * Construct the empty template for the vaccination data.
   * @param lastUpdated The timestamp of the retrieved RKI data.
   * @param fetched Timestamp of when the server fetched the XLSX data from the RKI.
   */
  private generateDataTemplate(lastUpdated: number, fetched: number): VaccinationData {
    const template: VaccinationData = {
      states: {},
      country: {
        vacc_cumulated: null,
        vacc_delta: null,
        vacc_per_1000: null,
        vacc_quote: null
      },
      last_updated: lastUpdated,
      fetched_timestamp: fetched
    };

    this.STATE_NAMES.map((state, index) => {
      const stateId: number = index + 1;
      template.states[stateId] = {
        name: state,
        BL_ID: `${stateId}`,
        vacc_cumulated: null,
        vacc_delta: null,
        vacc_per_1000: null,
        vacc_quote: null
      }
    });

    return template;
  }

  /**
   * Constructs and returns the new vaccination data from XLSX data rows.
   * @param rows The XLSX data rows.
   * @param dataTimestamp The timestamp of the XLSX data (freshness).
   * @param fetchedTimestamp The timestamp representing the time the XLSX data was fetched from RKI.
   * @param columnIndexes The set of column indexes used to find the corresponding values in the data rows.
   */
  private constructNewData(rows: any[][], dataTimestamp: number, fetchedTimestamp: number, columnIndexes: VaccinationDataColumnIndexes, cachedData: CoronaData): VaccinationData {
    const vaccinationData = this.generateDataTemplate(dataTimestamp, fetchedTimestamp);
    const isSameDayAsCachedData = DateUtils.isSameDay(dataTimestamp, cachedData.vaccination.last_updated);

    for (const row of rows) {
      const isRowValid = row.length > 2;

      if (!isRowValid) {
        continue;
      }
      const stateNameCandidate = row[columnIndexes.bundeslandNameColumnIndex] || "";
      const isStateRow = isRowValid && this.STATE_NAMES.map(stateName => !!stateNameCandidate.match(stateName)).filter(match => !!match).length >= 1;
      const isSummaryRow = isRowValid && row[columnIndexes.bundeslandNameColumnIndex] === "Gesamt";

      if (isStateRow) {
        const stateId = parseInt(row[columnIndexes.bundeslandIdColumnIndex]);
        const stateName = this.STATE_LIST[stateId] || row[columnIndexes.bundeslandNameColumnIndex];
        const vacc_cumulated = row[columnIndexes.vaccinationsCumulatedColumnIndex] || 0;
        const doesHistoricVaccinationDataExist = !!cachedData
          && !!cachedData.vaccination
          && !!cachedData.vaccination.states
          && !!cachedData.vaccination.states[stateId];

        let vaccCumulatedPreviousDay = doesHistoricVaccinationDataExist ? (cachedData.vaccination.states[stateId].vacc_cumulated || 0) : 0;

        // If data is from the same day, calculate the cumulated vaccinations by subtracting the latest increase.
        if (isSameDayAsCachedData) {
          vaccCumulatedPreviousDay = vaccCumulatedPreviousDay - (cachedData.vaccination.states[stateId].vacc_delta || 0);
        }
        const vacc_delta = Math.max(vacc_cumulated - vaccCumulatedPreviousDay, 0);
        const vacc_quote = row[columnIndexes.vaccinationQuoteIndex] || 0;

        const stateExists = !!vaccinationData.states[stateId] && vaccinationData.states[stateId].name === stateName;

        if (!stateExists) {
          continue;
        }
        vaccinationData.states[stateId].vacc_cumulated = vacc_cumulated;
        vaccinationData.states[stateId].vacc_delta = vacc_delta;
        vaccinationData.states[stateId].vacc_quote = vacc_quote;
        vaccinationData.states[stateId].vacc_per_1000 = vacc_quote * 10;
      }

      if (isSummaryRow) {
        vaccinationData.country.vacc_cumulated = row[columnIndexes.vaccinationsCumulatedColumnIndex] || 0;

        const doesHistoricCountryVaccinationDataExist = cachedData
          && cachedData.vaccination
          && cachedData.vaccination.country;

        let vaccCumulatedPreviousDay = doesHistoricCountryVaccinationDataExist ? (cachedData.vaccination.country.vacc_cumulated || 0) : 0;

        // If data is from the same day, calculate the cumulated vaccinations by subtracting the latest increase.
        if (isSameDayAsCachedData) {
          vaccCumulatedPreviousDay = vaccCumulatedPreviousDay - (cachedData.vaccination.country.vacc_delta || 0);
        }
        vaccinationData.country.vacc_delta = Math.max(vaccinationData.country.vacc_cumulated - vaccCumulatedPreviousDay, 0);
        vaccinationData.country.vacc_quote = row[columnIndexes.vaccinationQuoteIndex] || 0;
        vaccinationData.country.vacc_per_1000 = vaccinationData.country.vacc_quote * 10;
      }
    }
    return vaccinationData;
  }

  /**
   * Find the column indexes within the XLSX data for vaccination data.
   * Tries to identify the header row/s in the data that contains column header names.
   * Then the indices of the vaccination related columns are searched by matching names.
   * If a specific column header was not found, it is undefined.
   * @param rows The data rows of a XSLX file.
   */
  private findColumnIndexes(rows: any[][]): VaccinationDataColumnIndexes {
    const columnIndexes: VaccinationDataColumnIndexes = {
      bundeslandIdColumnIndex: undefined,
      bundeslandNameColumnIndex: undefined,
      vaccinationsCumulatedColumnIndex: undefined,
      vaccinationQuoteIndex: undefined
    };

    for (const headerCandidate of rows) {
      const bundeslandIdColumnIndexCandidate = headerCandidate.indexOf("RS");
      const bundeslandNameColumnIndexCandidate = headerCandidate.indexOf("Bundesland");
      const vaccinationsCumulatedColumnIndexCandidate = headerCandidate.indexOf("Gesamtzahl  einmalig geimpft");
      const vaccinationQuoteColumnIndexCandidate = headerCandidate.indexOf("Gesamt");

      if (bundeslandIdColumnIndexCandidate >= 0 && typeof columnIndexes.bundeslandIdColumnIndex !== "number") {
        columnIndexes.bundeslandIdColumnIndex = bundeslandIdColumnIndexCandidate;
      }
      if (bundeslandNameColumnIndexCandidate >= 0 && typeof columnIndexes.bundeslandNameColumnIndex !== "number") {
        columnIndexes.bundeslandNameColumnIndex = bundeslandNameColumnIndexCandidate;
      }
      if (vaccinationsCumulatedColumnIndexCandidate >= 0 && typeof columnIndexes.vaccinationsCumulatedColumnIndex !== "number") {
        columnIndexes.vaccinationsCumulatedColumnIndex = vaccinationsCumulatedColumnIndexCandidate;
      }
      if (vaccinationQuoteColumnIndexCandidate >= 0 && typeof columnIndexes.vaccinationQuoteIndex !== "number") {
        columnIndexes.vaccinationQuoteIndex = vaccinationQuoteColumnIndexCandidate;
      }

      if (this.areColumnIndexesValid(columnIndexes)) {
        break;
      }
    }
    return columnIndexes;
  }

  /**
   * Checks and returns if a set of column indexes is valid.
   * @param columnIndexes The column indexes to validate.
   */
  private areColumnIndexesValid(columnIndexes: VaccinationDataColumnIndexes): boolean {
    return !!columnIndexes
      && columnIndexes.bundeslandIdColumnIndex >= 0
      && columnIndexes.bundeslandNameColumnIndex >= 0
      && columnIndexes.vaccinationsCumulatedColumnIndex >= 0
      && columnIndexes.vaccinationQuoteIndex >= 0;
  }

  /**
   * Checks and returns if the vaccination data for the states is valid.
   * @param vaccinationData The vaccination data to validate the states from.
   */
  private isStateDataValid(vaccinationData: VaccinationData): boolean {
    const blIds = Object.keys(vaccinationData.states);
    return blIds.every((id) => {
      const state = vaccinationData.states[`${id}`];
      const isStateValid = !!state
        && !!state.name
        && !!state.BL_ID
        && state.vacc_cumulated >= 0
        && state.vacc_delta >= 0
        && state.vacc_per_1000 >= 0
        && state.vacc_quote >= 0;

      if (!isStateValid) {
        Logger.error(`${this.getId()} Plausi-Check failed! BL_ID: ${state.BL_ID}, Name: ${state.name}`)
      }
      return isStateValid;
    });
  }

  /**
   * Checks and returns, if the vaccination data for the country is valid.
   * @param vaccinationData The vaccination data to validate the country from.
   * @param cachedData The cached data.
   */
  private isCountryDataValid(vaccinationData: VaccinationData, cachedData: CoronaData): boolean {
    return vaccinationData.country
      && vaccinationData.country.vacc_cumulated >= 0
      // && vaccinationData.country.vacc_cumulated >= 0
      && vaccinationData.country.vacc_cumulated >= (cachedData?.vaccination?.country?.vacc_cumulated || 0)
      && vaccinationData.country.vacc_delta >= 0
      && vaccinationData.country.vacc_per_1000 >= 0
      // && vaccinationData.country.vacc_per_1000 >= 0
      // && vaccinationData.country.vacc_quote >= 0;
      && vaccinationData.country.vacc_per_1000 >= (cachedData?.vaccination?.country?.vacc_per_1000 || 0)
      && vaccinationData.country.vacc_quote >= (cachedData?.vaccination?.country?.vacc_quote || 0);
  }
}
