// import { Helpers } from './../utils/helpers.js';
import neatCsv from "neat-csv";
import axios from "axios";
import {createWriteStream} from "fs";

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

	static parseCsv(csvData: any, options?: ParseCsvOptions): Promise<any[]> {
		return neatCsv(csvData, options);
	}
}
