// import readXlsxFile from "read-excel-file/node";
import axios from "axios";
import fs from "fs";
import Logger from "../services/logger.service.js";

declare const readXlsxFile: any;

interface XlsxSheet {
  readonly name: string;
}

/**
 * Download/read .xlsx files.
 */
export class XlsxService {

  /**
   * Downloads an xlsx file and saves it as a file on disk.
   * @param url The path to the .xlsx file.
   * @param filePath The path to save the .xlsx file to.
   */
  static async downloadXlsx(url: string, filePath: string): Promise<string> {
    return axios.get(url, {
      responseType: "stream"
    }).then(function (response) {
      return new Promise((res, rej) => {
        const stream = fs.createWriteStream(filePath);
        stream.on("close", () => res(filePath))
        response.data.pipe(stream);
      });
    });
  }

  /**
   * Reads the content of a given .xlsx file and returns it.
   * Specify a Regex statement to read a specific sheet of the .xlsx.
   * If no regex is provided, the first sheet is read and returned.
   * Throws an error, if the requested sheet does not exist, or if reading the file failed.
   * @param filePath The path to the .xlsx file.
   * @param sheetNameRegex The search statement of the sheet to read.
   */
  static async readXlsx(filePath: string, sheetNameRegex: RegExp): Promise<any[][]> {

    try {
      let targetSheetIndex = 1;

      if (!!sheetNameRegex) {
        const sheets: any[] = await readXlsxFile(filePath, { getSheets: true } as any) as any;

        if (!sheets || !sheets.length) {
          throw new Error("XLSX contains no sheets.");
        }
        const targetSheet = sheets.find((sheet: XlsxSheet) => !!sheet.name.match(sheetNameRegex));
        let targetIndex = sheets.indexOf(targetSheet);

        if (targetIndex === -1) {
          throw new Error("Requested sheet does not exist.");
        }
        targetSheetIndex = targetIndex + 1;
      }

      return readXlsxFile(filePath, { sheet: targetSheetIndex });
    } catch (err) {
      Logger.error(`Could not read XLSX (${filePath})`);
      Logger.error(err);
      return null;
    }
  }
}