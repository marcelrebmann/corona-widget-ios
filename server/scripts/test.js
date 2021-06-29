
const readXlsxFile = require("read-excel-file/node");

async function test() {

const VACCINATIONS_PER_DAY_DE_XLSX_SHEET_REGEX = /Impfungen.{1}pro.*Tag/i;
const filePath = "./Impfquotenmonitoring.xlsx";

try {
    let targetSheetIndex = 1;

    if (!!VACCINATIONS_PER_DAY_DE_XLSX_SHEET_REGEX) {
      const sheets = await readXlsxFile(filePath, { getSheets: true });

      if (!sheets || !sheets.length) {
        throw new Error("XLSX contains no sheets.");
      }
      const targetSheet = sheets.find((sheet) => !!sheet.name.match(VACCINATIONS_PER_DAY_DE_XLSX_SHEET_REGEX));
      let targetIndex = sheets.indexOf(targetSheet);

      if (targetIndex === -1) {
        throw new Error("Requested sheet does not exist.");
      }
      targetSheetIndex = targetIndex + 1;
    }

    readXlsxFile(filePath, { sheet: targetSheetIndex })
    .then((rows) => {
        let max = null;
        let rowIndex = -1;
        for (const row of rows) {
            if (!row || !row[0] || !row[0].getMonth) {
                console.log("No date");
                continue;
            }
            if (!max || row[0].getTime() > max) {
                console.log(row[0].getTime())
                max = row[0];
            }
        }
        console.log(max);
        if (!max) {
            return;
        }
    })
  } catch (err) {
    console.log(`Could not read XLSX`);
    console.log(err);
  }
}

test();