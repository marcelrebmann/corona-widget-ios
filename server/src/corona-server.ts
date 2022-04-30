import { Connector, ConnectorUpdateType } from "./connectors/base.connector.js";
import { District, CoronaResponse, SingleVaccinationData, SingleHospitalizationData } from "./interfaces/data.interfaces.js";
import { DataService } from "./services/data.service.js";
import { CronJob } from "cron";
import express from "express";
import Logger from "./services/logger.service.js";

export class CoronaServer {
  // The identifier for log statements.
  private readonly id: string = "[COVID]";

  // The express server instance.
  private app: express.Express;

  // The corresponding data service instance.
  private readonly dataService: DataService;

  // The active connectors for updating the data regularly.
  private readonly connectors: Connector[];

  // Holds the data update routines.
  private readonly jobs: CronJob[];

  // The port on which the express server runs.
  private readonly port: number;

  private readonly apiVersion = "v1";

  constructor(
    filePathToCachedData: string,
    pathToBackupData: string,
    connectors: Connector[] = [],
    port: number = 4001
  ) {
    if (!filePathToCachedData || !pathToBackupData) {
      throw new Error("Not all required file paths provided!");
    }

    if (!port) {
      throw new Error("No valid port specified!");
    }

    if (!connectors || !connectors.length) {
      Logger.warn(`${this.id} No connectors specified! The data will never update.`);
    }
    this.connectors = connectors;
    this.port = port;
    this.dataService = new DataService(filePathToCachedData, pathToBackupData);
    this.jobs = [
      new CronJob("0 02 * * * *", () => this.executeConnectors(ConnectorUpdateType.REGULAR)),
      new CronJob("0 14 * * * *", () => this.executeConnectors(ConnectorUpdateType.FREQUENT)),
    ];
  }

  /**
   * Sets up the middlewares for the express server instance.
   */
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static("public"));
  }

  /**
   * Creates the REST endpoints for the express server instance.
   */
  setupRoutes() {
    /**
     * Returns the corona data for a specified county.
     * The ID of the county is the 'OBJECTID' defined by the RKI and must be provided
     * as query parameter (id) on every request.
     * If the requested id was not found in the data or the data in the cache does not
     * exist yet, the request is rejected.
     */
    this.app.get("/", (request, response) => {
      const requestedId = request.query.id as string;

      if (!requestedId) {
        return response.status(400).send();
      }
      const landkreisId = parseInt(requestedId);

      if (isNaN(landkreisId) || !isFinite(landkreisId)) {
        return response.status(404).send();
      }
      const cachedData = this.dataService.getCachedData();

      if (!cachedData || !cachedData.landkreise) {
        return response.status(500).send();
      }

      const landkreis: District =
        cachedData.landkreise.find((lk: District) => lk.OBJECTID === landkreisId) || ({} as District);
      const stateVaccinationData =
        cachedData.vaccination && cachedData.vaccination.states
          ? cachedData.vaccination.states[landkreis.BL_ID]
          : undefined;
      const stateHospitalizationData =
        cachedData.hospitalization && cachedData.hospitalization.states
          ? cachedData.hospitalization.states[landkreis.BL_ID]
          : undefined;

      const res: CoronaResponse = {
        landkreis: {
          ...landkreis,
        },
        country: {
          ...cachedData.country,
        },
        vaccination: cachedData.vaccination
          ? {
              state: stateVaccinationData,
              country: {
                ...cachedData.vaccination.country,
              },
              last_updated: cachedData.vaccination.last_updated,
              fetched_timestamp: cachedData.vaccination.fetched_timestamp,
            }
          : ({} as SingleVaccinationData),
        hospitalization: cachedData.hospitalization
          ? {
              state: stateHospitalizationData,
              country: {
                ...cachedData.hospitalization.country,
              },
              last_updated: cachedData.hospitalization.last_updated,
              fetched_timestamp: cachedData.hospitalization.fetched_timestamp,
            }
          : ({} as SingleHospitalizationData),
        rki_updated: cachedData.rki_updated,
        rki_updated_date: cachedData.rki_updated_date,
        fetched: cachedData.fetched,
        fetched_timestamp: cachedData.fetched_timestamp,
        version: this.apiVersion,
        license: "Robert Koch-Institut (RKI), dl-de/by-2-0",
      };

      return response.status(200).send(res);
    });

    /**
     * Returns the vaccination data for all states.
     * If no cached (vaccination) data is available yet, the request is rejected.
     */
    this.app.get("/vaccination", (request, response) => {
      const cachedData = this.dataService.getCachedData();
      if (!cachedData || !cachedData.vaccination) {
        return response.status(500).send();
      }
      return response.status(200).send({...cachedData.vaccination, license: "Robert Koch-Institut (RKI), dl-de/by-2-0"});
    });

    /**
     * Returns the hospitalization data for all states.
     * If no cached (hospitalization) data is available yet, the request is rejected.
     */
    this.app.get("/hospitalization", (request, response) => {
      const cachedData = this.dataService.getCachedData();
      if (!cachedData || !cachedData.hospitalization) {
        return response.status(500).send();
      }
      return response.status(200).send({...cachedData.hospitalization, license: "Robert Koch-Institut (RKI), dl-de/by-2-0"});
    });
  }

  /**
   * Starts up the corona server.
   * An express instance is created and middlewares/routes are applied to it.
   * After the express instance was set up, the server is started.
   */
  start() {
    Logger.info(`${this.id} Starting up ...`);
    this.app = express();
    Logger.info(`${this.id} Setup middleware ...`);
    this.setupMiddleware();
    Logger.info(`${this.id} Setup routes ...`);
    this.setupRoutes();
    this.app.listen(this.port, () => {
      Logger.info(`${this.id} App running on port ${this.port}`);
      this.jobs.forEach((job) => job.start());
      Logger.info(`${this.id} Cron Jobs started.`);
    });
  }

  /**
   * Executor function to run connectors that update the cached data.
   * All known connectors that match the given {@link ConnectorUpdateType} are executed sequentially.
   * Every time a connector ran successfully, the updated data is saved into the cache.
   * @param connectorType The type of connectors to run.
   */
  async executeConnectors(connectorType: ConnectorUpdateType) {
    for (const connector of this.connectors) {
      if (connector.getType() !== connectorType) {
        continue;
      }
      try {
        Logger.info(`${this.id} Updating data (connector: ${connector.getId()})...`);
        const cachedData = this.dataService.getCachedData();
        const updatedData = await connector.update(cachedData);
        await this.dataService.updateCachedData(updatedData);
      } catch (error) {
        Logger.error(`${this.id} Could not update data (connector: ${connector.getId()}).`);
        Logger.error(`${this.id} ${error}`);
      }
    }
  }
}
