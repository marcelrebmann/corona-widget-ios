import neatCsv from "neat-csv";
import axios from "axios";
import { createWriteStream } from "fs";
import { Helpers } from "../utils/helpers.js";

export interface ParseCsvOptions {
  separator?: string;
}

export class CsvService {
  /**
   * Downloads a csv file and saves it as a file on disk.
   * @param url The path to the .xlsx file.
   * @param filePath The path to save the .xlsx file to.
   */
  static async downloadCsv(url: string, filePath: string): Promise<string> {
    return axios
      .get(url, {
        responseType: "stream",
      })
      .then((response) => {
        return new Promise((resolve, reject) => {
          const stream = createWriteStream(filePath);
          stream.on("close", () => resolve(filePath));
          response.data.pipe(stream);
        });
      });
  }

  static parseCsv<T>(csvData: string | Buffer, options?: ParseCsvOptions): Promise<T[]> {
    return neatCsv(csvData, options);
  }

  static async downloadAndReadCsv<T>(downloadUrl: string, filePath: string): Promise<T[]> {
    const reportCsvFilepath = await CsvService.downloadCsv(downloadUrl, filePath);
    if (!reportCsvFilepath) {
      throw new Error("CSV download error");
    }
    const data = await Helpers.readFile(reportCsvFilepath);
    return await CsvService.parseCsv<T>(data);
  }
}
