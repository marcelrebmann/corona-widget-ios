// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;
/**
 * Licence: Robert Koch-Institut (RKI), dl-de/by-2-0
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Author: https://github.com/marcelrebmann/
 * Source: https://github.com/marcelrebmann/corona-widget-ios
 *
 * Version: 1.4.0
 */

const CONFIG = {
  serverUrl: "https://cdn.marcelrebmann.de/corona", // If self-hosted server is used, enter your server url here.
  location_cache_filename: "corona_location.txt", // Do not change
  data_cache_filename: "corona_widget_data.txt", // Do not change
  vaccination_image_filename: "vaccine-64.png", // Do not change
  showTrendCurves: false, // Show trend curves inside the bar charts. Experimental feature.
  debugMode: false, // Log debug statements to console.
  fontScaleFactor: 1, // Scales all the font sizes by a given factor.
  fontSize: {
    header: 12,
    xlarge: 20,
    large: 16,
    medium: 13,
    small: 11,
    xsmall: 10,
    tiny: 9,
  },
  chartWidth: {
    landkreisHistory: 36,
    stateHistory: 48,
    vaccinationProgress: 44,
  },
};

const locationApi = (location) =>
  `https://services7.arcgis.com/mOBPykOjAyBO2ZKk/arcgis/rest/services/RKI_Landkreisdaten/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,cases7_per_100k,cases7_bl_per_100k,cases,GEN,county,BL,last_update&geometry=${location.longitude.toFixed(
    3
  )}%2C${location.latitude.toFixed(
    3
  )}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelWithin&returnGeometry=false&outSR=4326&f=json`;
const serverApi = (landkreisId) => `${CONFIG.serverUrl}?id=${landkreisId}`;
const VACCINATION_IMG_URL = `${CONFIG.serverUrl}/images/${CONFIG.vaccination_image_filename}`;

const WIDGET_MODE = {
  INCIDENCE: "INCIDENCE",
  INFECTIONS: "INFECTIONS",
};
const INCIDENCE_HEADER = `🦠 Inzidenz`;
const INFECTIONS_HEADER = `🦠 Infektionen`;

const INCIDENCE_YELLOW = 35;
const INCIDENCE_RED = 50;
const INCIDENCE_MAGENTA = 100;
const INCIDENCE_PINK = 200;

const HOSP_INCIDENCE_LVL_1 = 3;
const HOSP_INCIDENCE_LVL_2 = 6;
const HOSP_INCIDENCE_LVL_3 = 9;

const COLOR_CYAN = new Color("#21b1f3");
const COLOR_BLUE = Color.dynamic(Color.blue(), COLOR_CYAN);
const COLOR_MAGENTA = new Color("#db0080");
const COLOR_PINK = new Color("#ff05b4");
const COLOR_RED = Color.red();
const COLOR_ORANGE = Color.orange();
const COLOR_GREEN = Color.green();

const COLOR_LIGHT_GREY = new Color("#e7e7e7");
const COLOR_GREY = Color.gray();
const COLOR_BAR_GREY_BG = Color.dynamic(COLOR_LIGHT_GREY, COLOR_GREY);

const COLOR_DARK_BG = new Color("#1c1c1d");
const COLOR_LIGHT_TRANSPARENT_BG = new Color("#fff", 0.05);
const COLOR_DARK_TRANSPARENT_BG = new Color("#1c1c1d", 0.04);

const COLOR_CONTAINER_BG = Color.dynamic(COLOR_DARK_TRANSPARENT_BG, COLOR_LIGHT_TRANSPARENT_BG);
const COLOR_CHART_TREND = Color.dynamic(new Color("#000", 0.4), new Color("#fff", 0.6));

const BUNDESLAENDER_SHORT = {
  "Baden-Württemberg": "BW",
  Bayern: "BY",
  Berlin: "BE",
  Brandenburg: "BB",
  Bremen: "HB",
  Hamburg: "HH",
  Hessen: "HE",
  "Mecklenburg-Vorpommern": "MV",
  Niedersachsen: "NI",
  "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP",
  Saarland: "SL",
  Sachsen: "SN",
  "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH",
  Thüringen: "TH",
};

const LOCALE_DE = "de_DE";
const COMMA_SEPARATOR = Device.locale() === LOCALE_DE ? "," : ".";

const WIDGET_SIZE_SMALL = "small";
const WIDGET_SIZE_MEDIUM = "medium";
const WIDGET_SIZE_LARGE = "large";
const WIDGET_SIZE_EXTRA_LARGE = "extraLarge";

/**
 * App specific state.
 * This is accessed at runtime.
 */
const APP_STATE = {
  widgetSize: WIDGET_SIZE_SMALL,
  isGreaterOrEqualThanMedium: false,
  widgetMode: undefined,
};

function scaleFonts(config) {
  if (!config.fontScaleFactor || config.fontScaleFactor === 1) {
    return;
  }
  const fontDefinitions = Object.keys(config.fontSize);

  for (const fontDefinition of fontDefinitions) {
    config.fontSize[fontDefinition] = config.fontSize[fontDefinition] * config.fontScaleFactor;
  }
}
scaleFonts(CONFIG);

class Logger {
  static log(...args) {
    if (CONFIG.debugMode) {
      console.log(...args);
    }
  }
}

class Cache {

  static fileManager;
  static dataCacheFilePath;
  static locationCacheFilePath;
  /**
   * Creates a reusable filemanager for accessing related files.
   */
  static init() {
    Cache.fileManager = FileManager.iCloud();
    Cache.dataCacheFilePath = Cache.fileManager.joinPath(
      Cache.fileManager.documentsDirectory(),
      CONFIG.data_cache_filename
    );
    Cache.locationCacheFilePath = Cache.fileManager.joinPath(
      Cache.fileManager.documentsDirectory(),
      CONFIG.location_cache_filename
    );
    Cache.vaccinationImageFilePath = Cache.fileManager.joinPath(
      Cache.fileManager.documentsDirectory(),
      CONFIG.vaccination_image_filename
    );
  }

  static getLocationHash(location) {
    return `${location.latitude.toFixed(3)}-${location.longitude.toFixed(3)}`;
  }

  /**
   * Loads cached data for a location (lat-lon)
   * @param location
   */
  static get(location) {
    const locationHash = Cache.getLocationHash(location);
    const cacheExists = Cache.fileManager.fileExists(Cache.dataCacheFilePath);
    Logger.log("EXISTS CACHE");
    Logger.log(Cache.dataCacheFilePath);

    if (!cacheExists) {
      return null;
    }
    const fileContents = Cache.fileManager.readString(Cache.dataCacheFilePath);

    try {
      const cachedData = JSON.parse(fileContents);
      return cachedData[locationHash];
    } catch {
      return null;
    }
  }

  /**
   *  Updates the cached data for a given location (lat-lon)
   */
  static update(location, data) {
    if (!location || !location.latitude || !location.longitude || !data) {
      return;
    }
    const locationHash = Cache.getLocationHash(location);
    const cacheExists = Cache.fileManager.fileExists(Cache.dataCacheFilePath);

    let fileContents;
    let cachedData = {};

    if (cacheExists) {
      fileContents = Cache.fileManager.readString(Cache.dataCacheFilePath);
    }
    if (fileContents) {
      cachedData = JSON.parse(fileContents);
    }
    cachedData[locationHash] = data;
    Cache.fileManager.writeString(Cache.dataCacheFilePath, JSON.stringify(cachedData));
  }

  static updateLocation(location) {
    Cache.fileManager.writeString(Cache.locationCacheFilePath, JSON.stringify(location));
  }

  /**
   * Loads and returns the vaccination image.
   * It tries to load the image from the cache.
   * If no cached version exists, the image is downloaded and written into the cache.
   */
  static async loadVaccinationImage() {
    if (Cache.fileManager.fileExists(Cache.vaccinationImageFilePath)) {
      if (!Cache.fileManager.isFileDownloaded(Cache.vaccinationImageFilePath)) {
        try {
          await Cache.fileManager.downloadFileFromiCloud(Cache.vaccinationImageFilePath);
        } catch {
          Logger.log("Vaccination image could not be downloaded from iCloud");
        }
      }
      return Cache.fileManager.readImage(Cache.vaccinationImageFilePath);
    }
    try {
      const image = await new Request(VACCINATION_IMG_URL).loadImage();
      Logger.log("VACC IMAGE LOADED");
      Cache.fileManager.writeImage(Cache.vaccinationImageFilePath, image);
      Logger.log("IMAGE WRITTEN");
      return image;
    } catch {
      Logger.log("Could not load vaccination image");
      return;
    }
  }

  /**
   * Tries to load the saved county location from the cache.
   * This is used to save the current/last known location in adaptive location mode.
   * If the cache itself does not exist, or no location is cached, {@type null} is returned.
   */
  static async loadSavedLocation() {
    const doesCachedFileExist = Cache.fileManager.fileExists(Cache.locationCacheFilePath);

    if (!doesCachedFileExist) {
      return null;
    }
    const fileContents = Cache.fileManager.readString(Cache.locationCacheFilePath);

    try {
      const savedLoc = JSON.parse(fileContents);

      if (!savedLoc || !savedLoc.latitude || !savedLoc.longitude) {
        return null;
      }
      return savedLoc;
    } catch {
      return null;
    }
  }
}
Cache.init();

/**
 * This class contains more generic utility functions that perform calculations
 * and parsing operations for various purposes.
 */
class Utils {
  static isNumericValue(number) {
    return number || number === 0;
  }

  static shortFormatNumber(number) {
    if (number < 10000) {
      return `${number.toLocaleString()}`;
    } else if (number < 1000000) {
      return `${number % 1000 >= 100 ? (number / 1000).toFixed(1) : Math.floor(number / 1000)}k`.replace(
        ".",
        COMMA_SEPARATOR
      );
    } else {
      return `${number % 1000000 >= 100000 ? (number / 1000000).toFixed(1) : Math.floor(number / 1000000)}M`.replace(
        ".",
        COMMA_SEPARATOR
      );
    }
  }

  static parseRkiDate(dateString) {
    const match = dateString.match(/^([0-9]{2}).([0-9]{2}).([0-9]{4})/);

    if (!match || !match.length) {
      return null;
    }
    const day = match[1];
    const month = match[2];
    const year = match[3];
    return new Date(year, `${parseInt(month) - 1}`, day);
  }

  static getNextUpdate(data) {
    if (
      !data ||
      !data.rki_updated ||
      !data.landkreis ||
      !data.landkreis.cases7_per_100k_trend ||
      !data.vaccination.last_updated ||
      !data.country.r_value_7_days_last_updated
    ) {
      return null;
    }
    const relevantTimestamps = [];

    const last_updated = new Date(data.rki_updated);
    last_updated.setDate(last_updated.getDate() + 1);
    last_updated.setHours(0);
    relevantTimestamps.push(last_updated.getTime());

    const vaccination_last_updated = new Date(data.vaccination.last_updated);
    vaccination_last_updated.setDate(vaccination_last_updated.getDate() + 1);
    vaccination_last_updated.setHours(0);
    vaccination_last_updated.setMinutes(0);
    vaccination_last_updated.setSeconds(0);
    relevantTimestamps.push(vaccination_last_updated.getTime());

    if (APP_STATE.isGreaterOrEqualThanMedium || APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
      const rValueLastUpdated = new Date(data.r_value_7_days_last_updated);
      rValueLastUpdated.setDate(rValueLastUpdated.getDate() + 1);
      rValueLastUpdated.setHours(0);
      rValueLastUpdated.setMinutes(0);
      rValueLastUpdated.setSeconds(0);
      relevantTimestamps.push(rValueLastUpdated.getTime());
    }

    const moreRecent = Math.min(...relevantTimestamps);
    return moreRecent > Date.now() ? new Date(moreRecent) : null;
  }
}

class HospitalizationLevel {

  static getHospitalizationLevelColor(hospitalizationIncidence) {
    if (hospitalizationIncidence < HOSP_INCIDENCE_LVL_1) {
      return COLOR_GREEN;
    } else if (hospitalizationIncidence >= HOSP_INCIDENCE_LVL_1 && hospitalizationIncidence < HOSP_INCIDENCE_LVL_2) {
      return COLOR_ORANGE;
    } else if (hospitalizationIncidence >= HOSP_INCIDENCE_LVL_2 && hospitalizationIncidence < HOSP_INCIDENCE_LVL_3) {
      return COLOR_RED;
    } else if (hospitalizationIncidence >= HOSP_INCIDENCE_LVL_3) {
      return COLOR_MAGENTA;
    } else {
      return COLOR_GREY;
    }
  }
}

/**
 * Helper class for UI-related operations.
 * Contains functions to get or construct UI elements.
 */
class UiHelpers {
  static setVaccinationImage(image) {
    UiHelpers.VACCINATION_IMAGE = image;
  }

  static getVaccinationImage() {
    return UiHelpers.VACCINATION_IMAGE;
  }

  /**
   * Returns the UI color for incidence values.
   * @param {*} incidence The incidence value.
   */
  static getIncidenceColor(incidence) {
    if (incidence >= INCIDENCE_PINK) {
      return COLOR_PINK;
    } else if (incidence >= INCIDENCE_MAGENTA) {
      return COLOR_MAGENTA;
    } else if (incidence >= INCIDENCE_RED) {
      return COLOR_RED;
    } else if (incidence >= INCIDENCE_YELLOW) {
      return COLOR_ORANGE;
    } else {
      return COLOR_GREEN;
    }
  }

  /**
   * Returns the UI arrow element to visualize the trend.
   * @param {*} slope The predicted increase/decrease of the data.
   */
  static getInfectionTrend(slope) {
    if (slope >= 1) {
      return "▲";
    } else if (slope > -1) {
      return "▶︎";
    } else if (slope <= -1) {
      return "▼";
    } else {
      return "-";
    }
  }

  /**
   * Returns the color for trend UI elements according to the predicted
   * increase/decrease.
   * A custom factor can be supplied to adjust the interval scale to the scale of the data.
   * @param {*} slope
   * @param {*} factor
   */
  static getTrendColor(slope, factor = 1) {
    if (slope > 4 * factor) {
      return COLOR_RED;
    } else if (slope >= 1 * factor) {
      return COLOR_ORANGE;
    } else if (slope <= -1 * factor) {
      return COLOR_GREEN;
    } else {
      return COLOR_GREY;
    }
  }

  /**
   * Helper to generate the county name for displaying in the UI.
   * The identifier "(SK)" is added for Stadtkreise.
   * If a custom county name is given, it overrides the name received from the data.
   * @param {*} data The api data
   * @param {*} customLandkreisName Optional. A custom text label to override the original one.
   */
  static generateLandkreisName(data, customLandkreisName) {
    if (customLandkreisName) {
      return customLandkreisName;
    }
    return data.landkreis.county.match(/^SK \w+$/) ? `${data.landkreis.GEN} (SK)` : data.landkreis.GEN;
  }

  /**
   * Generates the date string to describe the actuality of the RKI data.
   * Transforms a numeric timestamp into a date string with the following format: "DD.MM.YYYY"
   * @param {*} data The data received from the server api
   */
  static generateDataState(data) {
    if (!data.rki_updated) {
      return `  ${(data.landkreis.last_update || "").substr(0, 10)}`;
    }
    const date = new Date(data.rki_updated);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `  ${day < 10 ? "0" : ""}${day}.${month < 10 ? "0" : ""}${month}.${year}`;
  }

  /**
   * Generates a Ui row for displaying the R-value and the corresponding trend.
   * @param {*} root
   * @param {*} rValue
   * @param {*} rValueTrend
   * @param {*} label
   * @param {*} fontSize
   */
  static rValueRow(root, rValue, rValueTrend, label = "", isLabelSFSymbol = false, fontSize = CONFIG.fontSize.xsmall) {
    const rValuePredictedSlope = rValueTrend ? rValueTrend.slope : rValueTrend;

    const row = root.addStack();
    row.centerAlignContent();

    if (isLabelSFSymbol) {
      const rValueMarker = row.addImage(SFSymbol.named(label).image);
      rValueMarker.imageSize = new Size(fontSize, fontSize);
      rValueMarker.tintColor = COLOR_GREY;
    } else {
      const rValueMarker = row.addText(`${label}`);
      rValueMarker.font = Font.boldSystemFont(fontSize);
      rValueMarker.textColor = COLOR_GREY;
    }

    const rValueTrendIconLabel = row.addText(`${UiHelpers.getInfectionTrend(rValuePredictedSlope)}`);
    rValueTrendIconLabel.font = Font.systemFont(fontSize - 2);
    rValueTrendIconLabel.textColor = UiHelpers.getTrendColor(rValuePredictedSlope, 0.1);

    const rValueLabel = row.addText(
      `${Utils.isNumericValue(rValue) ? `${rValue.toFixed(2).replace(".", COMMA_SEPARATOR)}` : "-"}`
    );
    rValueLabel.font = Font.boldSystemFont(fontSize);
    rValueLabel.textColor = COLOR_GREY;
  }


  static hospitalizationRow(root, value, fontSize = CONFIG.fontSize.xsmall) {
    const row = root.addStack();
    row.centerAlignContent();

    const hospLabel = row.addText("🏥 ");
    hospLabel.font = Font.systemFont(fontSize - 2);
    hospLabel.textColor = COLOR_GREY;

    const hospitalizationIncidenceLevelImage = row.addImage(SFSymbol.named("circle.fill").image);
    hospitalizationIncidenceLevelImage.imageSize = new Size(fontSize - 1, fontSize - 1);
    hospitalizationIncidenceLevelImage.tintColor = HospitalizationLevel.getHospitalizationLevelColor(value);

    const hospitalizationRate = row.addText(
      `${Utils.isNumericValue(value) ? ` ${value.toFixed(2).replace(".", COMMA_SEPARATOR)}` : " -"}`
    );
    hospitalizationRate.font = Font.boldSystemFont(fontSize);
    hospitalizationRate.textColor = COLOR_GREY;
  }

  /**
   * Generates a UI row that displays the incidence value for a county/state/country and the corresponding trend.
   * @param {*} root The UI element where the row will be added to.
   * @param {*} incidence The incidence value.
   * @param {*} indicenceTrend The incidence trend data. Contains a slope value and a predicted value.
   * @param {*} label Text to render in front of the incidence value.
   * @param {*} fontSize The font size of the row elements.
   */
  static indicenceRow(
    root,
    incidence,
    indicenceTrend,
    label,
    fontSize = CONFIG.fontSize.xsmall,
    showTrend = true,
    renderLabelAsSymbol = false
  ) {
    const row = root.addStack();
    row.centerAlignContent();

    if (renderLabelAsSymbol) {
      const icon = SFSymbol.named(label);
      const labelIcon = row.addImage(icon.image);
      labelIcon.imageSize = new Size(fontSize, fontSize);
      labelIcon.tintColor = COLOR_GREY;
      row.addSpacer(1);
    } else {
      const labelText = row.addText(`${label}`);
      labelText.font = Font.boldSystemFont(fontSize);
      labelText.textColor = COLOR_GREY;
    }

    if (showTrend) {
      const predictedIncidenceSlope = indicenceTrend ? indicenceTrend.slope : indicenceTrend;
      const trendIconLabel = row.addText(`${UiHelpers.getInfectionTrend(predictedIncidenceSlope)}`);
      trendIconLabel.font = Font.systemFont(fontSize);
      trendIconLabel.textColor = UiHelpers.getTrendColor(predictedIncidenceSlope);
    }

    const shouldBeShortened = Utils.isNumericValue(incidence) && incidence >= 1000;
    const incidenceLabel = row.addText(
      Utils.isNumericValue(incidence) ? ` ${incidence.toFixed(shouldBeShortened ? 0 : 1).replace(".", COMMA_SEPARATOR)}` : " -"
    );
    incidenceLabel.font = Font.boldSystemFont(fontSize);
    incidenceLabel.textColor = UiHelpers.getIncidenceColor(incidence);
  }

  /**
   * Generates a UI row for displaying the vaccination quote and the daily increase.
   * @param {*} root The UI element where the row will be added to.
   * @param {*} vaccinationQuote The vaccination quote value to render.
   * @param {*} vaccinationDelta The daily increase of total vaccinations.
   * @param {*} dataTimestamp The timestamp of the data.
   * @param {*} layout The layout of the row elements. "v" - vertical, "h" - horizontal (default)
   * @param {*} drawChart If true, the vaccination quote will be visualized with a progress bar chart.
   */
  static vaccinationRow(root, vaccinationQuote, dataTimestamp, sfSymbolName, layout = "h", drawChart = false, showOutdated = true, fontSize = CONFIG.fontSize.xsmall) {
    const row = root.addStack();
    let row1 = row;
    if (layout === "v") {
      row.layoutVertically();
      row1 = row.addStack();
      row1.centerAlignContent();
    }
    row.centerAlignContent();

    let vaccImage;

    if (sfSymbolName) {
      vaccImage = SFSymbol.named(sfSymbolName).image;
    } else {
      vaccImage = UiHelpers.getVaccinationImage();
    }

    if (vaccImage) {
      const vaccIcon = row1.addImage(vaccImage);
      vaccIcon.imageSize = new Size(fontSize, fontSize);

      // if (sfSymbolName) {
      //   vaccIcon.tintColor = COLOR_BLUE;
      //   vaccIcon.backgroundColor = COLOR_CYAN;
      //   vaccIcon.textColor = COLOR_GREEN;
      // }
    }
    const vaccPercent = row1.addText(
      `${vaccImage ? " " : ""}${Utils.isNumericValue(vaccinationQuote)
        ? `${vaccinationQuote.toFixed(vaccinationQuote >= 10 ? 1 : 2).replace(".", COMMA_SEPARATOR)}`
        : "-"
      }%`
    );
    vaccPercent.font = Font.boldSystemFont(fontSize);
    vaccPercent.textColor = COLOR_BLUE;

    if (drawChart) {
      UiHelpers.drawProgressBar(row, vaccinationQuote);
    }

    if (!showOutdated) {
      return;
    }
    if (!UiHelpers.isVaccinationDataActual(dataTimestamp)) {
      UiHelpers.addDataOutdatedMarker(row1);
    }
  }

  /**
   * Visualizes given data in a bar chart and places the chart into a given UI element.
   * @param {*} root The UI element to draw the chart into.
   * @param {*} historyData The array of values to display as bars.
   * @param {*} height The height of the bar chart.
   * @param {*} width The width of the bar chart.
   * @param {*} barSpace The space between the bars.
   */
  static drawBarChart(root, historyData, height = 12, width = 40, barSpace = 1) {
    if (!historyData || !historyData.length) {
      return;
    }
    const barCount = historyData.length;
    const maxValue = Math.max(...historyData, 50);
    const ctx = new DrawContext();
    ctx.opaque = false;
    ctx.size = new Size(width, height);
    ctx.respectScreenScale = true;
    const barWidth = Math.min((width - barSpace * (barCount - 1)) / barCount, 4);

    const barPositions = [];

    for (let i = 0; i < barCount; i++) {
      const dataPoint = historyData[barCount - 1 - i];
      const barX = width - (barWidth * (i + 1) + barSpace * i);
      const barHeight = (dataPoint / maxValue) * height;
      const bar = new Rect(barX, height - barHeight, barWidth, barHeight); // x, y, rect width, rect height
      ctx.setFillColor(UiHelpers.getIncidenceColor(dataPoint));
      ctx.fill(bar);
      barPositions.push({ x: barX + 0.5 * barWidth, y: height - barHeight });
    }

    const xAxis = new Path();
    xAxis.move(new Point(0, height));
    xAxis.addLine(new Point(width, height));

    ctx.setStrokeColor(COLOR_GREY);
    ctx.setLineWidth(1);

    ctx.addPath(xAxis);
    ctx.strokePath(xAxis);

    if (CONFIG.showTrendCurves) {
      UiHelpers.drawTrendLine(ctx, barPositions, height);
    }

    const container = root.addStack();
    container.size = new Size(width, height);
    container.addImage(ctx.getImage());
  }

  /**
   * Visualizes given data in a progress bar chart (from 0 to 100%) and places the chart into a given UI element.
   * @param {*} root The UI element to draw the chart into.
   * @param {*} value The progress value to display. Should be between 0 and 1.
   * @param {*} width The chart width.
   * @param {*} height The chart height.
   * @param {*} barHeight The height of the bars.
   * @param {*} barCount How many bars to render.
   * @param {*} barSpace The space between the bars.
   */
  static drawProgressBar(
    root,
    value,
    width = CONFIG.chartWidth.vaccinationProgress,
    height = 9,
    barHeight = 7,
    barCount = 10,
    barSpace = 2
  ) {
    const filledBars = Math.floor(value / barCount);
    const barWidth = (width - barSpace * (barCount - 1)) / barCount;

    const chart = root.addStack();
    chart.size = new Size(width, height);
    chart.spacing = barSpace;

    for (let i = 0; i < barCount; i++) {
      const isBarFilled = i <= filledBars;
      const bar = chart.addStack();
      bar.size = new Size(barWidth, barHeight);
      bar.backgroundColor = isBarFilled ? COLOR_BLUE : COLOR_BAR_GREY_BG;
    }
  }

  /**
   * Draws a trend line into a bar chart.
   * @param {*} drawContext The canvas element of the chart.
   * @param {*} barPositions The x/y coordinates of the rendered bars in the chart.
   * @param {*} chartHeight The overall chart height.
   */
  static drawTrendLine(drawContext, barPositions, chartHeight) {
    if (!drawContext || !barPositions || !barPositions.length) {
      return;
    }
    const trendLine = new Path();
    trendLine.move(new Point(barPositions[0].x, UiHelpers.trendOffset(barPositions[0].y, chartHeight)));
    const lastBar = barPositions[barPositions.length - 1];
    const middle = barPositions[Math.floor(barPositions.length / 2)];
    trendLine.addCurve(
      new Point(lastBar.x, UiHelpers.trendOffset(lastBar.y, chartHeight)),
      new Point(barPositions[0].x, UiHelpers.trendOffset(barPositions[0].y, chartHeight)),
      new Point(middle.x, UiHelpers.trendOffset(middle.y, chartHeight))
    );
    drawContext.setStrokeColor(COLOR_CHART_TREND);
    drawContext.setLineWidth(1);
    drawContext.addPath(trendLine);
    drawContext.strokePath(trendLine);
  }

  /**
   * Calculates the position for drawing smoothed trend lines into bar charts.
   * @param {*} barY
   * @param {*} height
   */
  static trendOffset(barY, height) {
    return Math.min(barY + 3, height - 1);
  }

  static isVaccinationDataActual(dataTimestamp) {
    // Vaccination data is always published for previous day. Means +2 days until ndata is outdated.
    const dataTime = new Date(dataTimestamp);
    dataTime.setDate(dataTime.getDate() + 2);
    dataTime.setHours(0);
    dataTime.setMinutes(0);
    dataTime.setSeconds(0);
    return Date.now() <= dataTime.getTime();
  }

  static addDataOutdatedMarker(root, fontSize = CONFIG.fontSize.tiny, color = COLOR_GREY) {
    const icon = SFSymbol.named("exclamationmark.arrow.triangle.2.circlepath");
    const outdatedIndicator = root.addImage(icon.image);
    outdatedIndicator.imageSize = new Size(fontSize, fontSize);
    outdatedIndicator.tintColor = color;
  }

  static vaccinationHeaderRow(root, label = "", data_last_updated_timestamp, fontSize = CONFIG.fontSize.xsmall) {
    const row = root.addStack();
    row.centerAlignContent();

    const vaccImage = UiHelpers.getVaccinationImage();

    if (vaccImage) {
      const vaccPrefix = row.addImage(UiHelpers.getVaccinationImage());
      vaccPrefix.imageSize = new Size(fontSize, fontSize);
    } else {
      const vaccIcon = row.addText("💉");
      vaccIcon.font = Font.boldSystemFont(fontSize);
    }

    if (label) {
      const headerLabel = row.addText(` ${label}`);
      headerLabel.font = Font.boldSystemFont(fontSize);
      headerLabel.textColor = COLOR_GREY;
    }

    const spacer = row.addText(" ");
    spacer.font = Font.systemFont(fontSize);

    if (!UiHelpers.isVaccinationDataActual(data_last_updated_timestamp)) {
      UiHelpers.addDataOutdatedMarker(row, fontSize);
    }
  }
}

class DataService {

  static absoluteCasesCacheId = {
    latitude: 0.123,
    longitude: 0.123
  };

  static async loadData(location, isLocationFlexible) {
    const cachedData = isLocationFlexible ? undefined : Cache.get(location);
    let rkiObjectId;
    let rkiData;

    if (!cachedData || !cachedData.landkreis) {
      Logger.log("NO CACHED DATA FOUND");
      rkiData = await new Request(locationApi(location)).loadJSON();
      const isRkiDataValid = rkiData && rkiData.features && rkiData.features.length && rkiData.features[0].attributes;

      if (!isRkiDataValid) {
        return null;
      }
      rkiObjectId = rkiData.features[0].attributes.OBJECTID;
    } else {
      rkiObjectId = cachedData.landkreis.OBJECTID;
    }

    try {
      let apiData;
      try {
        apiData = await new Request(serverApi(rkiObjectId)).loadJSON();
      } catch {
        Logger.log("API DATA LOADING FAILED");
      }
      Logger.log("API DATA", apiData);
      if (!apiData && !cachedData) {
        throw "No data - use RKI fallback data without trend";
      }

      if (!apiData && !!cachedData) {
        Logger.log("NO API DATA BUT CACHED DATA -> USE CACHE");
        return cachedData;
      }
      const isCacheUpdateNeeded =
        !isLocationFlexible && (!cachedData || apiData.rki_updated > (cachedData.rki_updated || 0));

      if (isCacheUpdateNeeded) {
        Cache.update(location, apiData);
      }
      return apiData;
    } catch {
      Logger.log("GENERATING RKI FALLBACK");
      return {
        landkreis: {
          ...rkiData.features[0].attributes,
          cases7_per_100k_trend: {},
          cases7_bl_per_100k_trend: {},
        },
        country: {
          cases7_de_per_100k_trend: {},
        },
      };
    }
  }

  static async loadAbsoluteCases() {
    try {
      const data = await new Request(serverApi(1)).loadJSON();
      if (!data) {
        throw new Error("Could not load absolute data from server");
      }
      const cachedData = Cache.get(DataService.absoluteCasesCacheId);
      const isCacheUpdateNeeded = !cachedData || (data.rki_updated > cachedData.rki_updated);

      if (isCacheUpdateNeeded) {
        Cache.update(DataService.absoluteCasesCacheId, data);
        Logger.log("Cache updated");
      }
      return data;
    } catch {
      // Try using data from cache
      Logger.log("Try using cached absolute data");
      const cachedData = Cache.get(DataService.absoluteCasesCacheId);
      return cachedData;
    }
  }

  static async getLocationFromGps() {
    try {
      Location.setAccuracyToThreeKilometers();
      const gpsLocation = await Location.current();
      return gpsLocation;
    } catch {
      return null;
    }
  }

  static async loadLocation() {
    const lastKnownLocation = await Cache.loadSavedLocation();

    let location;

    try {
      location = await DataService.getLocationFromGps();
    } catch {
      Logger.log("COULD NOT LOAD GPS LOCATION");
    }

    if (!location) {
      Logger.log("No data from fetching location");
      return {
        ...lastKnownLocation,
        isCached: true,
      };
    }
    const hasLocationChanged =
      !lastKnownLocation ||
      location.latitude !== lastKnownLocation.latitude ||
      location.longitude !== lastKnownLocation.longitude;

    if (hasLocationChanged) {
      Cache.updateLocation(location);
    }
    return location;
  }
}

const createIncidenceWidget = (widget, data, customLandkreisName, isLocationFlexible, isCached) => {
  const headerStack = widget.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();
  const header = headerStack.addText(INCIDENCE_HEADER);
  header.font = Font.mediumSystemFont(CONFIG.fontSize.header);

  if (isLocationFlexible) {
    headerStack.addSpacer(APP_STATE.isGreaterOrEqualThanMedium ? 10 : null);
    const icon = SFSymbol.named(isCached ? "bolt.horizontal.circle" : "location");
    const flexibleLocationIndicator = headerStack.addImage(icon.image);
    flexibleLocationIndicator.imageSize = new Size(CONFIG.fontSize.medium, CONFIG.fontSize.medium);
    flexibleLocationIndicator.tintColor = isCached ? COLOR_GREY : COLOR_BLUE;
  }

  if (!data) {
    widget.addSpacer();
    widget.addText("Aktueller Ort konnte nicht ermittelt werden.");
    return;
  }
  const stateInfo = widget.addText(UiHelpers.generateDataState(data));
  stateInfo.font = Font.systemFont(CONFIG.fontSize.tiny);
  stateInfo.textColor = COLOR_GREY;
  widget.addSpacer();

  const content = widget.addStack();
  content.backgroundColor = COLOR_CONTAINER_BG;
  content.cornerRadius = 12;
  content.setPadding(4, 4, 4, 4);
  content.layoutVertically();

  const incidenceRow = content.addStack();
  incidenceRow.layoutHorizontally();
  incidenceRow.centerAlignContent();

  const isLandkreisIncidenceToBeShortened =
    Utils.isNumericValue(data.landkreis.cases7_per_100k) && data.landkreis.cases7_per_100k >= 1000;
  const landkreisIncidence = data.landkreis.cases7_per_100k.toFixed(isLandkreisIncidenceToBeShortened ? 0 : 1);
  const incidenceLabel = incidenceRow.addText(
    Utils.isNumericValue(data.landkreis.cases7_per_100k) ? `${landkreisIncidence.replace(".", COMMA_SEPARATOR)}` : "-"
  );
  incidenceLabel.font = Font.boldSystemFont(CONFIG.fontSize.xlarge);
  incidenceLabel.minimumScaleFactor = 0.6;
  incidenceLabel.textColor = UiHelpers.getIncidenceColor(data.landkreis.cases7_per_100k);

  const landkreisTrendIconLabel = incidenceRow.addText(
    ` ${UiHelpers.getInfectionTrend(data.landkreis.cases7_per_100k_trend.slope)}`
  );
  landkreisTrendIconLabel.font = Font.systemFont(CONFIG.fontSize.medium);
  landkreisTrendIconLabel.textColor = UiHelpers.getTrendColor(data.landkreis.cases7_per_100k_trend.slope);

  incidenceRow.addSpacer();

  const chartStack = incidenceRow.addStack();
  chartStack.layoutVertically();

  UiHelpers.drawBarChart(chartStack, data.landkreis.cases7_per_100k_history, 12, CONFIG.chartWidth.landkreisHistory);

  chartStack.addSpacer(1);

  // Absolute new cases
  const casesLandkreisIncrease =
    Utils.isNumericValue(data.landkreis.cases) && Utils.isNumericValue(data.landkreis.cases_previous_day)
      ? data.landkreis.cases - data.landkreis.cases_previous_day
      : undefined;
  const casesLandkreisLabel = chartStack.addText(
    `${Utils.isNumericValue(casesLandkreisIncrease) ? `+${Math.max(casesLandkreisIncrease, 0).toLocaleString()}` : "-"
    }`
  );
  casesLandkreisLabel.font = Font.boldSystemFont(CONFIG.fontSize.tiny);
  casesLandkreisLabel.textColor = COLOR_GREY;

  const landkreisNameLabel = content.addText(UiHelpers.generateLandkreisName(data, customLandkreisName));
  landkreisNameLabel.font = Font.mediumSystemFont(CONFIG.fontSize.large);
  landkreisNameLabel.minimumScaleFactor = 0.7;

  widget.addSpacer();

  const footer = widget.addStack();
  const footerContent = footer.addStack();

  const footerLeft = footerContent.addStack();
  footerLeft.layoutVertically();
  footerContent.addSpacer();
  const footerRight = footerContent.addStack();
  footerRight.layoutVertically();

  UiHelpers.drawBarChart(
    footerLeft,
    data.landkreis.cases7_bl_per_100k_history,
    10,
    CONFIG.chartWidth.stateHistory,
    1.5
  );

  UiHelpers.indicenceRow(
    footerLeft,
    data.landkreis.cases7_bl_per_100k,
    data.landkreis.cases7_bl_per_100k_trend,
    `${BUNDESLAENDER_SHORT[data.landkreis.BL]}`,
    CONFIG.fontSize.xsmall,
    true,
    false
  );

  UiHelpers.vaccinationHeaderRow(footerRight, `${BUNDESLAENDER_SHORT[data.landkreis.BL]}`, data.vaccination.last_updated);

  UiHelpers.vaccinationRow(
    footerRight,
    data.vaccination.state.vacc_quote_fully_vaccinated,
    data.vaccination.last_updated,
    "checkmark.circle.fill",
    "v",
    false,
    false,
    CONFIG.fontSize.xsmall
  );

  UiHelpers.vaccinationRow(
    footerRight,
    data.vaccination.state.vacc_quote_booster,
    data.vaccination.last_updated,
    "3.circle.fill",
    "v",
    false,
    false,
    CONFIG.fontSize.xsmall
  );

  UiHelpers.hospitalizationRow(
    footerLeft,
    data.hospitalization.state.hospitalization_incidence
  );
};

const createInfectionsWidget = (widget, data) => {
  const headerLabel = widget.addText(INFECTIONS_HEADER);
  headerLabel.font = Font.mediumSystemFont(CONFIG.fontSize.header);

  if (!data) {
    widget.addSpacer();
    widget.addText("Keine Fallzahlen verfügbar.");
    return;
  }
  const countryData = data.country;
  const infectionsDiff = countryData.new_cases - countryData.new_cases_previous_day;

  const stateInfo = widget.addText(UiHelpers.generateDataState(data));
  stateInfo.font = Font.systemFont(CONFIG.fontSize.tiny);
  stateInfo.textColor = COLOR_GREY;
  widget.addSpacer();

  const casesStack = widget.addStack();

  casesStack.addSpacer();

  const casesLabel = casesStack.addText(
    `${Utils.isNumericValue(countryData.new_cases) ? countryData.new_cases.toLocaleString() : "-"}`
  );
  casesLabel.font = Font.boldSystemFont(CONFIG.fontSize.xlarge);
  casesLabel.minimumScaleFactor = 0.5;

  casesStack.addSpacer();

  const casesDifferenceStack = widget.addStack();

  casesDifferenceStack.addSpacer();

  const casesTrendIcon = casesDifferenceStack.addText(
    UiHelpers.getInfectionTrend(countryData.new_cases - countryData.new_cases_previous_day)
  );
  casesTrendIcon.font = Font.systemFont(CONFIG.fontSize.medium);
  casesTrendIcon.textColor = UiHelpers.getTrendColor(infectionsDiff);

  const casesDiffLabel = casesDifferenceStack.addText(
    Utils.isNumericValue(infectionsDiff)
      ? ` (${infectionsDiff >= 0 ? "+" : ""}${infectionsDiff.toLocaleString()})`
      : "-"
  );
  casesDiffLabel.font = Font.mediumSystemFont(CONFIG.fontSize.medium);
  casesDiffLabel.minimumScaleFactor = 0.8;
  casesDiffLabel.textColor = COLOR_GREY;

  casesDifferenceStack.addSpacer();

  widget.addSpacer();

  const footer = widget.addStack();
  const footerContent = footer.addStack();

  const footerLeft = footerContent.addStack();
  footerLeft.layoutVertically();

  footerContent.addSpacer();

  const footerRight = footerContent.addStack();
  footerRight.layoutVertically();

  UiHelpers.rValueRow(footerLeft, countryData.r_value_7_days, countryData.r_value_7_days_trend, "R", false, CONFIG.fontSize.tiny);

  UiHelpers.drawBarChart(
    footerLeft,
    countryData.cases7_de_per_100k_history,
    10,
    CONFIG.chartWidth.stateHistory,
    1.5
  );
  UiHelpers.indicenceRow(
    footerLeft,
    countryData.cases7_de_per_100k,
    countryData.cases7_de_per_100k_trend,
    `DE`,
    CONFIG.fontSize.xsmall,
    true,
    false
  );

  footerRight.addSpacer(10);

  UiHelpers.vaccinationHeaderRow(footerRight, "DE", data.vaccination.last_updated);

  UiHelpers.vaccinationRow(
    footerRight,
    data.vaccination.country.vacc_quote_fully_vaccinated,
    data.vaccination.last_updated,
    "checkmark.circle.fill",
    "v",
    false,
    false,
    CONFIG.fontSize.xsmall
  );

  UiHelpers.vaccinationRow(
    footerRight,
    data.vaccination.country.vacc_quote_booster,
    data.vaccination.last_updated,
    "3.circle.fill",
    "v",
    false,
    false,
    CONFIG.fontSize.xsmall
  );

  UiHelpers.hospitalizationRow(
    footerLeft,
    data.hospitalization.country.hospitalization_incidence
  );
};

let widget = await createWidget(config.widgetFamily);

if (!config.runsInWidget) {
  await widget.presentSmall();
}
Script.setWidget(widget);
Script.complete();

async function createWidget(size) {
  APP_STATE.isGreaterOrEqualThanMedium = (size === WIDGET_SIZE_MEDIUM || size === WIDGET_SIZE_LARGE || size === WIDGET_SIZE_EXTRA_LARGE);
  APP_STATE.widgetSize = size;
  APP_STATE.widgetMode = WIDGET_MODE.INCIDENCE;

  // let location = {};
  let locations = [];
  let customLandkreisNames = [];

  const params = args.widgetParameter ? args.widgetParameter.split(";") : undefined;
  // const params = args.widgetParameter ? args.widgetParameter.split(",") : undefined;
  // const params = ["49.89", "10.855"] // BA
  // const params = ["48.6406978", "9.1391464"] // BB
  // const params = ["INF"];
  const widget = new ListWidget();
  widget.backgroundColor = Color.dynamic(Color.white(), COLOR_DARK_BG);
  widget.setPadding(12, 12, 12, 12);

  if (!params) {
    const liveLocation = await DataService.loadLocation();

    if (!liveLocation) {
      widget.addText("Standort konnte nicht ermittelt werden.");
      return widget;
    }
    locations.push(liveLocation);
  }

  if (params && params[0] === "INF") {
    APP_STATE.widgetMode = WIDGET_MODE.INFECTIONS;
  }

  if (params && params[0] !== "INF") {
    for (const param of params) {
      const locationConfig = param.split(",");
      locations.push({
        latitude: parseFloat(locationConfig[0]),
        longitude: parseFloat(locationConfig[1]),
      })
      customLandkreisNames.push(locationConfig[2]);
    }
  }
  const isLocationFlexible = !params;
  UiHelpers.setVaccinationImage(await Cache.loadVaccinationImage());

  const widgetLocation = locations[0];

  switch (size) {
    case WIDGET_SIZE_SMALL:
      if (APP_STATE.widgetMode === WIDGET_MODE.INCIDENCE) {
        let data = await loadIncidenceData(widgetLocation);
        createIncidenceWidget(widget, data, customLandkreisNames[0], isLocationFlexible, widgetLocation.isCached);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else if (APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
        let data = loadInfectionsData();
        createInfectionsWidget(widget, data);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else {
        widget.addText("Keine Daten.");
      }
      break;
    case WIDGET_SIZE_LARGE:
      if (APP_STATE.widgetMode === WIDGET_MODE.INCIDENCE) {
        let data;

        const rootStack = widget.addStack();
        rootStack.layoutHorizontally();

        const left = rootStack.addStack();
        left.layoutVertically();
        let activeStack = left;


        for (let i = 0; i < locations.length; i++) {
          if (i === 2) {
            activeStack = rootStack.addStack();
          }
          const stack = activeStack.addStack();
          stack.layoutVertically();
          data = await loadIncidenceData(locations[i]);
          createIncidenceWidget(stack, data, customLandkreisNames[i], isLocationFlexible, locations[i].isCached);

        }
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else if (APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
        let data = loadInfectionsData();
        createInfectionsWidget(widget, data);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else {
        widget.addText("Keine Daten.");
      }
      break;
    case WIDGET_SIZE_MEDIUM:
      if (APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
        let data = await loadInfectionsData();
        createInfectionsWidget(widget, data);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else if (APP_STATE.widgetMode === WIDGET_MODE.INCIDENCE) {
        const main = widget.addStack();
        const leftSide = main.addStack();
        leftSide.layoutVertically();

        let data = await loadIncidenceData(widgetLocation);
        createIncidenceWidget(leftSide, data, customLandkreisNames[0], isLocationFlexible, widgetLocation.isCached);
        main.addSpacer();
        main.addSpacer(34);
        main.addSpacer();
        const rightSide = main.addStack();
        rightSide.layoutVertically();

        if (!data) {
          data = await loadInfectionsData();
        }
        createInfectionsWidget(rightSide, data);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else {
        widget.addText("Keine Daten.");
      }
      break;
    case WIDGET_SIZE_EXTRA_LARGE:
      if (APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
        let data = await loadInfectionsData();
        createInfectionsWidget(widget, data);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else if (APP_STATE.widgetMode === WIDGET_MODE.INCIDENCE) {
        const main = widget.addStack();
        const leftSide = main.addStack();
        leftSide.layoutVertically();

        let data;

        for (let i = 0; i < locations.length; i++) {
          data = await loadIncidenceData(locations[i]);
          createIncidenceWidget(leftSide, data, customLandkreisNames[i], isLocationFlexible, locations[i].isCached);
        }
        main.addSpacer();
        main.addSpacer(34);
        main.addSpacer();
        const rightSide = main.addStack();
        rightSide.layoutVertically();

        if (!data) {
          data = await loadInfectionsData();
        }
        createInfectionsWidget(rightSide, data);
        widget.refreshAfterDate = Utils.getNextUpdate(data);
      } else {
        widget.addText("Keine Daten.");
      }
      break;
    default:
      widget.addText("Widget-Kontext nicht gefunden.");
  }
  return widget;

  async function loadIncidenceData(location) {
    let data;
    try {
      data = await DataService.loadData(location);
    } catch {
      Logger.log("INCIDENCE WIDGET (S): COULD NOT LOAD DATA");
    }
    return data;
  }

  async function loadInfectionsData() {
    let data;
    try {
      data = await DataService.loadAbsoluteCases();
    } catch {
      Logger.log("COMBINED WIDGET (M): COULD NOT LOAD ABSOLUTE CASES");
    }
    return data;
  }
}
