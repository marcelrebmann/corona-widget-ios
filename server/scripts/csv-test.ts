import path, {dirname} from 'path';
import { Helpers } from '../src/utils/helpers.js';
import { CsvService } from './../src/services/csv.service.js';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));


async function run() {
    const data = await Helpers.readFile(`${path.join(__dirname, './vaccination_report.csv')}`);
    const rows = await CsvService.parseCsv(data);
    console.log("ROWS", rows);
    console.table(rows);
}

run();