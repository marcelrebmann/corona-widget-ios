import { States } from './../shared/states.js';
import { AgeGroup, RkiHospitalizationReportBundesland } from './../interfaces/hospitalization.interfaces.js';
import { CsvService } from "./../services/csv.service.js";
import { DateUtils } from "./../utils/date.utils.js";
import { Helpers } from "../utils/helpers.js";
import { CoronaData, HospitalizationData } from "./../interfaces/data.interfaces.js";
import { Connector, ConnectorUpdateType } from "./base.connector.js";
import path, { dirname } from "path";
import Logger from "../services/logger.service.js";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Updates the vaccination data based on the official published RKI XLSX report file.
 */
export class HospitalizationConnector extends Connector {
  private readonly REPORT_CSV_URL =
    "https://raw.githubusercontent.com/robert-koch-institut/COVID-19-Hospitalisierungen_in_Deutschland/master/Aktuell_Deutschland_COVID-19-Hospitalisierungen.csv";
  private readonly REPORT_DATA_FILE_PATH = path.join(__dirname, "./../../data/");
  private readonly REPORT_FILENAME = "hospitalization_report.csv";



  constructor() {
    super("[HOSP]", ConnectorUpdateType.FREQUENT);
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

    if (!cachedData.hospitalization) {
      cachedData.hospitalization = this.generateDataTemplate(0, 0);
    }

    try {
      const cachedDataTimestamp = cachedData.hospitalization ? cachedData.hospitalization.last_updated || 0 : 0;
      const lastUpdatedDate = new Date(cachedDataTimestamp);
      const todayDate = new Date(Date.now());

      const isBeforeNextPlannedRefresh = DateUtils.isBefore(
        DateUtils.getTomorrow(lastUpdatedDate).getTime(),
        todayDate.getTime()
      );

      // No refresh needed yet. Cached data is actual.
      if (isBeforeNextPlannedRefresh) {
        Logger.info(`${this.getId()} No new hospitalization data found.`);
        return;
      }

      const rows: RkiHospitalizationReportBundesland[] = await CsvService.downloadAndReadCsv(
        this.REPORT_CSV_URL,
        `${this.REPORT_DATA_FILE_PATH}${this.REPORT_FILENAME}`
      );
      let fetchedTimestamp = Date.now();
      let reportDate = new Date(rows[0].Datum);

      // const isCachedDataInitial = !cachedDataTimestamp;
      const isLoadedReportMoreRecent = DateUtils.isBefore(
        reportDate.getTime(),
        cachedDataTimestamp
      ) && !DateUtils.isSameDay(cachedDataTimestamp, reportDate.getTime());

      if (!isLoadedReportMoreRecent) {
        const cachedDataDate = DateUtils.formatToReportDate(new Date(cachedDataTimestamp));
        Logger.info(
          `${this.getId()} Most recent rki report [${rows[0].Datum}] equals the cached one [${cachedDataDate}]`
        );
        return;
      }

      if (!rows || !rows.length) {
        throw new Error("CSV read error / no rows detected");
      }

      const hospitalizationData = this.constructNewData(rows, reportDate.getTime(), fetchedTimestamp);

      // Validation
      if (!this.isStateDataValid(hospitalizationData)) {
        throw new Error("State data Plausi-Check failed");
      }

      if (!this.isCountryDataValid(hospitalizationData)) {
        throw new Error("Country data Plausi-Check failed");
      }
      const updatedData = Helpers.copyDeep(cachedData);
      updatedData.hospitalization = hospitalizationData;

      return updatedData;
    } catch (err) {
      Logger.error(`${this.getId()} Could not update hospitalization data.`);
      Logger.error(`${this.getId()} ${err}`);
      return;
    }
  }

  /**
   * Construct the empty template for the vaccination data.
   * @param lastUpdated The timestamp of the retrieved RKI data.
   * @param fetched Timestamp of when the server fetched the XLSX data from the RKI.
   */
  private generateDataTemplate(lastUpdated: number, fetched: number): HospitalizationData {
    const template: HospitalizationData = {
      states: {},
      country: {
        hospitalization_incidence: null,
        hospitalization_cases: null
      },
      last_updated: lastUpdated,
      fetched_timestamp: fetched,
    };

    States.STATE_NAMES.map((state, index) => {
      const stateId: number = index + 1;
      template.states[stateId] = {
        name: state,
        BL_ID: `${stateId}`,
        hospitalization_incidence: null,
        hospitalization_cases: null
      };
    });

    return template;
  }

  /**
   * Constructs and returns the new vaccination data from XLSX data rows.
   * @param rows The csv data rows.
   * @param dataTimestamp The timestamp of the csv data (freshness).
   * @param fetchedTimestamp The timestamp representing the time the csv data was fetched from RKI.
   * @param columnIndexes The set of column indexes used to find the corresponding values in the data rows.
   */
  private constructNewData(
    rows: RkiHospitalizationReportBundesland[],
    dataTimestamp: number,
    fetchedTimestamp: number
  ): HospitalizationData {
    const hospitalizationData = this.generateDataTemplate(dataTimestamp, fetchedTimestamp);

    const relevantDay = DateUtils.formatToReportDate(new Date(dataTimestamp));

    const relevantRows = rows.filter(row => row.Datum === relevantDay && row.Altersgruppe === AgeGroup.ALL);

    if (!relevantRows || relevantRows.length <= 0) {
      throw new Error(`No rows found for day [${relevantDay}]`);
    }

    for (const row of relevantRows) {
      const isRowValid = row.Bundesland && row.Bundesland_Id && !isNaN(parseInt(row.Bundesland_Id)) && row['7T_Hospitalisierung_Inzidenz'];

      if (!isRowValid) {
        continue;
      }
      const stateNameCandidate = row.Bundesland;
      const stateId = parseInt(row.Bundesland_Id);
      const isSummaryRow = stateNameCandidate === "Bundesgebiet" && stateId === 0;
      const isStateRow =
        isRowValid && !isSummaryRow && States.STATE_NAMES.includes(stateNameCandidate) && States.STATE_NAMES[stateId - 1] === stateNameCandidate;

      if (isStateRow) {
        const stateName = States.STATE_LIST[stateId];
        const hosp_incidence = parseFloat(row['7T_Hospitalisierung_Inzidenz']) || 0;
        const hosp_cases = parseInt(row['7T_Hospitalisierung_Faelle']) || 0;

        const stateExists = !!hospitalizationData.states[stateId] && hospitalizationData.states[stateId].name === stateName;

        if (!stateExists) {
          continue;
        }
        hospitalizationData.states[stateId].hospitalization_incidence = hosp_incidence;
        hospitalizationData.states[stateId].hospitalization_cases = hosp_cases;
      }

      if (isSummaryRow) {
        const hosp_incidence = parseFloat(row['7T_Hospitalisierung_Inzidenz']) || 0;
        const hosp_cases = parseInt(row['7T_Hospitalisierung_Faelle']) || 0;

        hospitalizationData.country.hospitalization_incidence = hosp_incidence;
        hospitalizationData.country.hospitalization_cases = hosp_cases;
      }
    }
    return hospitalizationData;
  }

  /**
   * Checks and returns if the hospitalization data for the states is valid.
   * @param hospitalizationData The hospitalization data to validate the states from.
   */
  private isStateDataValid(hospitalizationData: HospitalizationData): boolean {
    const blIds = Object.keys(hospitalizationData.states);
    return blIds.every((id) => {
      const state = hospitalizationData.states[`${id}`];
      const isStateValid =
        !!state &&
        !!state.name &&
        !!state.BL_ID &&
        state.hospitalization_incidence >= 0 &&
        state.hospitalization_cases >= 0;

      if (!isStateValid) {
        Logger.error(`${this.getId()} Plausi-Check failed! BL_ID: ${state.BL_ID}, Name: ${state.name}`);
      }
      return isStateValid;
    });
  }

  /**
   * Checks and returns, if the hospitalization data for the country is valid.
   * @param hospitalizationData The hospitalization data to validate the country from.
   */
  private isCountryDataValid(vaccinationData: HospitalizationData): boolean {
    return (
      vaccinationData.country &&
      vaccinationData.country.hospitalization_incidence >= 0 &&
      vaccinationData.country.hospitalization_cases >= 0
    );
  }
}
