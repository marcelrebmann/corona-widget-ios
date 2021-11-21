import { RkiVaccinationReportBundesland } from "./../interfaces/vaccination.interfaces";
import { CsvService } from "./../services/csv.service.js";
import { DateUtils } from "./../utils/date.utils.js";
import { Helpers } from "../utils/helpers.js";
import { VaccinationData, CoronaData } from "./../interfaces/data.interfaces.js";
import { Connector, ConnectorUpdateType } from "./base.connector.js";
import path, { dirname } from "path";
import Logger from "../services/logger.service.js";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Updates the vaccination data based on the official published RKI XLSX report file.
 */
export class VaccinationConnector extends Connector {
  private readonly VACCINATION_QUOTES_REPORT_ARCHIVE_URL =
    "https://raw.githubusercontent.com/robert-koch-institut/COVID-19-Impfungen_in_Deutschland/master/Archiv/";
  private readonly VACCINATION_QUOTES_MOST_RECENT_REPORT_CSV_URL =
    "https://raw.githubusercontent.com/robert-koch-institut/COVID-19-Impfungen_in_Deutschland/master/Aktuell_Deutschland_Impfquoten_COVID-19.csv";
  private readonly VACCINATION_DATA_FILE_PATH = path.join(__dirname, "./../../data/");
  private readonly VACCINATION_REPORT_FILENAME = "vaccination_report.csv";

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
    16: "Thüringen",
  };
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
      const cachedDataTimestamp = cachedData.vaccination ? cachedData.vaccination.last_updated || 0 : 0;
      const lastUpdatedDate = new Date(cachedDataTimestamp);
      const todayDate = new Date(Date.now());

      const isBeforeNextPlannedRefresh = DateUtils.isBefore(
        DateUtils.getTomorrow(lastUpdatedDate).getTime(),
        todayDate.getTime()
      );

      // No refresh needed yet. Cached data is actual.
      if (isBeforeNextPlannedRefresh) {
        Logger.info(`${this.getId()} No new vaccination data found.`);
        return;
      }

      let rows: RkiVaccinationReportBundesland[] = await this.loadNewReportFile(
        this.VACCINATION_QUOTES_MOST_RECENT_REPORT_CSV_URL
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
      // if (
      // 	!isCachedDataInitial &&
      // 	!isMostRecentPublishedReportTheDayAfterCached
      // ) {
      // 	const cachedDataDate = DateUtils.formatToReportDate(
      // 		new Date(cachedDataTimestamp)
      // 	);
      // 	Logger.info(
      // 		`${this.getId()} Most recent report [${
      // 			rows[0].Datum
      // 		}] is not the day after cached one [${cachedDataDate}]`
      // 	);

      // 	// Try loading the report from archive
      // 	const dayAfterCached = DateUtils.getTomorrow(
      // 		new Date(cachedDataTimestamp)
      // 	);
      // 	Logger.info(
      // 		`${this.getId()} Try loading report from archive for [${dayAfterCached}]`
      // 	);
      // 	rows = await this.loadNewReportFile(
      // 		this.buildUrlToArchivedReport(dayAfterCached)
      // 	);
      // 	fetchedTimestamp = Date.now();
      // 	reportDate = new Date(rows[0].Datum);
      // }

      // console.log("ROWS", rows);

      if (!rows || !rows.length) {
        throw new Error("CSV read error / no rows detected");
      }

      const vaccinationData = this.constructNewData(rows, reportDate.getTime(), fetchedTimestamp, cachedData);

      // Validation
      if (!this.isStateDataValid(vaccinationData)) {
        throw new Error("State data Plausi-Check failed");
      }

      if (!this.isCountryDataValid(vaccinationData, cachedData)) {
        throw new Error("Country data Plausi-Check failed");
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

  private generateVaccinationQuotesReportName(date: Date): string {
    return `${DateUtils.formatToReportDate(date)}_Deutschland_Impfquoten_COVID-19.csv`;
  }

  private buildUrlToArchivedReport(date: Date) {
    return `${this.VACCINATION_QUOTES_REPORT_ARCHIVE_URL}${this.generateVaccinationQuotesReportName(date)}`;
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
        vacc_quote: null,
        vacc_quote_fully_vaccinated: null,
        vacc_quote_booster: null,
      },
      last_updated: lastUpdated,
      fetched_timestamp: fetched,
    };

    this.STATE_NAMES.map((state, index) => {
      const stateId: number = index + 1;
      template.states[stateId] = {
        name: state,
        BL_ID: `${stateId}`,
        vacc_cumulated: null,
        vacc_delta: null,
        vacc_per_1000: null,
        vacc_quote: null,
        vacc_quote_fully_vaccinated: null,
        vacc_quote_booster: null,
      };
    });

    return template;
  }

  /**
   * Constructs and returns the new vaccination data from XLSX data rows.
   * @param rows The XLSX data rows.
   * @param vaccsPerDayDeRows The XLSX data rows for daily new vaccinations in germany.
   * @param dataTimestamp The timestamp of the XLSX data (freshness).
   * @param fetchedTimestamp The timestamp representing the time the XLSX data was fetched from RKI.
   * @param columnIndexes The set of column indexes used to find the corresponding values in the data rows.
   */
  private constructNewData(
    rows: RkiVaccinationReportBundesland[],
    dataTimestamp: number,
    fetchedTimestamp: number,
    cachedData: CoronaData
  ): VaccinationData {
    const vaccinationData = this.generateDataTemplate(dataTimestamp, fetchedTimestamp);
    const isSameDayAsCachedData = DateUtils.isSameDay(dataTimestamp, cachedData.vaccination.last_updated);

    for (const row of rows) {
      const isRowValid = row.Bundesland && row.BundeslandId_Impfort && !isNaN(parseInt(row.BundeslandId_Impfort));

      if (!isRowValid) {
        continue;
      }
      const stateNameCandidate = row.Bundesland;
      const stateId = parseInt(row.BundeslandId_Impfort);
      const isSummaryRow = stateNameCandidate === "Deutschland" && stateId === 0;
      const isStateRow =
        isRowValid && !isSummaryRow && this.STATE_NAMES.includes(stateNameCandidate) && this.STATE_NAMES[stateId - 1] === stateNameCandidate;

      if (isStateRow) {
        const stateName = this.STATE_LIST[stateId];
        const vacc_cumulated = parseFloat(row.Impfungen_gesamt_min1) || 0;
        const doesHistoricVaccinationDataExist =
          !!cachedData &&
          !!cachedData.vaccination &&
          !!cachedData.vaccination.states &&
          !!cachedData.vaccination.states[stateId];

        let vaccCumulatedPreviousDay = doesHistoricVaccinationDataExist
          ? cachedData.vaccination.states[stateId].vacc_cumulated || 0
          : 0;

        // If data is from the same day, calculate the cumulated vaccinations by subtracting the latest increase.
        if (isSameDayAsCachedData) {
          vaccCumulatedPreviousDay =
            vaccCumulatedPreviousDay - (cachedData.vaccination.states[stateId].vacc_delta || 0);
        }
        const vacc_quote = parseFloat(row.Impfquote_gesamt_min1) || 0;
        const vacc_quote_fully_vaccinated = parseFloat(row.Impfquote_gesamt_voll) || 0;
        const vacc_quote_booster = parseFloat(row.Impfquote_gesamt_boost) || 0;

        const stateExists = !!vaccinationData.states[stateId] && vaccinationData.states[stateId].name === stateName;

        if (!stateExists) {
          continue;
        }
        vaccinationData.states[stateId].vacc_cumulated = vacc_cumulated;
        vaccinationData.states[stateId].vacc_delta = null;
        vaccinationData.states[stateId].vacc_quote = vacc_quote;
        vaccinationData.states[stateId].vacc_quote_fully_vaccinated = vacc_quote_fully_vaccinated;
        vaccinationData.states[stateId].vacc_quote_booster = vacc_quote_booster;
        vaccinationData.states[stateId].vacc_per_1000 = vacc_quote * 10;
      }

      if (isSummaryRow) {
        vaccinationData.country.vacc_cumulated = parseFloat(row.Impfungen_gesamt_min1) || 0;

        vaccinationData.country.vacc_delta = null;
        vaccinationData.country.vacc_quote = parseFloat(row.Impfquote_gesamt_min1) || 0;
        vaccinationData.country.vacc_quote_fully_vaccinated = parseFloat(row.Impfquote_gesamt_voll) || 0;
        vaccinationData.country.vacc_quote_booster = parseFloat(row.Impfquote_gesamt_boost) || 0;
        vaccinationData.country.vacc_per_1000 = vaccinationData.country.vacc_quote * 10;
      }
    }
    return vaccinationData;
  }

  /**
   * Checks and returns if the vaccination data for the states is valid.
   * @param vaccinationData The vaccination data to validate the states from.
   */
  private isStateDataValid(vaccinationData: VaccinationData): boolean {
    const blIds = Object.keys(vaccinationData.states);
    return blIds.every((id) => {
      const state = vaccinationData.states[`${id}`];
      const isStateValid =
        !!state &&
        !!state.name &&
        !!state.BL_ID &&
        state.vacc_cumulated >= 0 &&
        state.vacc_per_1000 >= 0 &&
        state.vacc_quote >= 0;

      if (!isStateValid) {
        Logger.error(`${this.getId()} Plausi-Check failed! BL_ID: ${state.BL_ID}, Name: ${state.name}`);
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
    return (
      vaccinationData.country &&
      vaccinationData.country.vacc_cumulated >= 0 &&
      vaccinationData.country.vacc_cumulated >= (cachedData?.vaccination?.country?.vacc_cumulated || 0) &&
      vaccinationData.country.vacc_per_1000 >= 0 &&
      vaccinationData.country.vacc_quote >= 0 &&
      vaccinationData.country.vacc_per_1000 >= (cachedData?.vaccination?.country?.vacc_per_1000 || 0) &&
      vaccinationData.country.vacc_quote >= (cachedData?.vaccination?.country?.vacc_quote || 0)
    );
  }

  private async loadNewReportFile(downloadUrl: string): Promise<RkiVaccinationReportBundesland[]> {
    const reportCsvFilepath = await CsvService.downloadCsv(
      downloadUrl,
      `${this.VACCINATION_DATA_FILE_PATH}${this.VACCINATION_REPORT_FILENAME}`
    );
    if (!reportCsvFilepath) {
      throw new Error("CSV download error");
    }
    const data = await Helpers.readFile(reportCsvFilepath);
    const rows: RkiVaccinationReportBundesland[] = await CsvService.parseCsv(data);
    return rows;
  }
}
