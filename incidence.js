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
 * Version: 1.2.1
 */

const CONFIG = {
    url: {
        incidenceLandkreise: "https://services7.arcgis.com/mOBPykOjAyBO2ZKk/arcgis/rest/services/RKI_Landkreisdaten/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,GEN,BEZ,EWZ,EWZ_BL,cases,deaths,cases_per_100k,cases_per_population,BL,BL_ID,county,last_update,cases7_per_100k,recovered,EWZ_BL,cases7_bl_per_100k&returnGeometry=false&outSR=4326&f=json",
        vaccinationApi: "https://https://rki-vaccination-data.vercel.app/api/v2"
    },
    serverUrl: "https://cdn.marcelrebmann.de/corona", // If self-hosted server is used, enter your server url here.
    location_cache_filename: "corona_location.txt", // Do not change
    data_cache_filename: "corona_widget_data.txt", // Do not change
    vaccination_image_filename: "vaccine-64.png", // Do not change
    showTrendCurves: false, // Show trend curves inside the bar charts. Experimental feature.
    showIncidenceStability: true, // Show stability estimation. If false, todays absolute new cases are displayed.
    debugMode: false, // Log debug statements to console.
    fontScaleFactor: 1, // Scales all the font sizes by a given factor.
    fontSize: {
        header: 13,
        xlarge: 24,
        large: 18,
        medium: 14,
        small: 11,
        xsmall: 10,
        tiny: 8
    },
    chartWidth: {
        landkreisHistory: 36,
        stateHistory: 50,
        vaccinationProgress: 44
    }
}

const locationApi = (location) => `https://services7.arcgis.com/mOBPykOjAyBO2ZKk/arcgis/rest/services/RKI_Landkreisdaten/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,cases7_per_100k,cases7_bl_per_100k,cases,GEN,county,BL,last_update&geometry=${location.longitude.toFixed(3)}%2C${location.latitude.toFixed(3)}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelWithin&returnGeometry=false&outSR=4326&f=json`
const serverApi = (landkreisId) => `${CONFIG.serverUrl}?id=${landkreisId}`
const VACCINATION_IMG_URL = `${CONFIG.serverUrl}/images/${CONFIG.vaccination_image_filename}`

const WIDGET_MODE = {
    INCIDENCE: "INCIDENCE",
    INFECTIONS: "INFECTIONS"
}
const INCIDENCE_HEADER = `🦠 INZIDENZ`
const INFECTIONS_HEADER = `🦠 INFEKTIONEN`
const WIDGET_SIZE_MEDIUM = "medium"

const INCIDENCE_YELLOW = 35
const INCIDENCE_RED = 50
const INCIDENCE_MAGENTA = 100
const INCIDENCE_PINK = 200

const INCIDENCE_STABILITY_LEVEL_NONE = "-";
const INCIDENCE_STABILITY_LEVEL_1 = "<50";
const INCIDENCE_STABILITY_LEVEL_2 = "<100";
const INCIDENCE_STABILITY_LEVEL_3 = ">100";
const INCIDENCE_STABILITY_LEVEL_4 = ">200";

const COLOR_CYAN = new Color("#21b1f3")
const COLOR_BLUE = Color.dynamic(Color.blue(), COLOR_CYAN)
const COLOR_MAGENTA = new Color("#db0080")
const COLOR_PINK = new Color("#ff05b4")
const COLOR_RED = Color.red()
const COLOR_ORANGE = Color.orange()
const COLOR_GREEN = Color.green()

const COLOR_LIGHT_GREY = new Color("#e7e7e7")
const COLOR_GREY = Color.gray()
const COLOR_BAR_GREY_BG = Color.dynamic(COLOR_LIGHT_GREY, COLOR_GREY)

const COLOR_DARK_BG = new Color("#1c1c1d")
const COLOR_LIGHT_TRANSPARENT_BG = new Color("#fff", 0.05)
const COLOR_DARK_TRANSPARENT_BG = new Color("#1c1c1d", 0.04)

const COLOR_CONTAINER_BG = Color.dynamic(COLOR_DARK_TRANSPARENT_BG, COLOR_LIGHT_TRANSPARENT_BG)
const COLOR_CHART_TREND = Color.dynamic(new Color("#000", 0.4), new Color("#fff", 0.6))

const BUNDESLAENDER_SHORT = {
    'Baden-Württemberg': 'BW',
    'Bayern': 'BY',
    'Berlin': 'BE',
    'Brandenburg': 'BB',
    'Bremen': 'HB',
    'Hamburg': 'HH',
    'Hessen': 'HE',
    'Mecklenburg-Vorpommern': 'MV',
    'Niedersachsen': 'NI',
    'Nordrhein-Westfalen': 'NW',
    'Rheinland-Pfalz': 'RP',
    'Saarland': 'SL',
    'Sachsen': 'SN',
    'Sachsen-Anhalt': 'ST',
    'Schleswig-Holstein': 'SH',
    'Thüringen': 'TH'
}

const LOCALE_DE = "de_DE"
const COMMA_SEPARATOR = Device.locale() === LOCALE_DE ? "," : "."

/**
 * App specific state.
 * This is accessed at runtime.
 */
const APP_STATE = {
    widgetSize: "small",
    isMediumSize: false,
    widgetMode: undefined
}

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

    /**
     * Creates a reusable filemanager for accessing related files.
     */
    static init() {
        Cache.fileManager = FileManager.local()
        Cache.dataCacheFilePath = Cache.fileManager.joinPath(Cache.fileManager.documentsDirectory(), CONFIG.data_cache_filename)
        Cache.locationCacheFilePath = Cache.fileManager.joinPath(Cache.fileManager.documentsDirectory(), CONFIG.location_cache_filename)
        Cache.vaccinationImageFilePath = Cache.fileManager.joinPath(Cache.fileManager.documentsDirectory(), CONFIG.vaccination_image_filename)
    }

    static getLocationHash(location) {
        return `${location.latitude.toFixed(3)}-${location.longitude.toFixed(3)}`
    }

    /**
    * Loads cached data for a location (lat-lon)
    * @param location 
    */
    static get(location) {
        const locationHash = Cache.getLocationHash(location)
        const cacheExists = Cache.fileManager.fileExists(Cache.dataCacheFilePath)

        if (!cacheExists) {
            return null
        }
        const fileContents = Cache.fileManager.readString(Cache.dataCacheFilePath)

        try {
            const cachedData = JSON.parse(fileContents)
            return cachedData[locationHash]
        } catch {
            return null
        }
    }

    /**
     *  Updates the cached data for a given location (lat-lon)
     */
    static update(location, data) {

        if (!location || !location.latitude || !location.longitude || !data) {
            return;
        }
        const locationHash = Cache.getLocationHash(location)
        const cacheExists = Cache.fileManager.fileExists(Cache.dataCacheFilePath)

        let fileContents;
        let cachedData = {}

        if (cacheExists) {
            fileContents = Cache.fileManager.readString(Cache.dataCacheFilePath)
        }
        if (fileContents) {
            cachedData = JSON.parse(fileContents)
        }
        cachedData[locationHash] = data
        Cache.fileManager.writeString(Cache.dataCacheFilePath, JSON.stringify(cachedData))
    }

    static updateLocation(location) {
        Cache.fileManager.writeString(Cache.locationCacheFilePath, JSON.stringify(location))
    }

    /**
     * Loads and returns the vaccination image.
     * It tries to load the image from the cache.
     * If no cached version exists, the image is downloaded and written into the cache.
     */
    static async loadVaccinationImage() {
        if (Cache.fileManager.fileExists(Cache.vaccinationImageFilePath)) {
            return Cache.fileManager.readImage(Cache.vaccinationImageFilePath)
        }
        try {
            const image = await new Request(VACCINATION_IMG_URL).loadImage()
            Cache.fileManager.writeImage(Cache.vaccinationImageFilePath, image)
            return loadedImage
        } catch {
            console.warn("Could not load vaccination image")
            return;
        }
    }

    /**
     * Tries to load the saved county location from the cache.
     * This is used to save the current/last known location in adaptive location mode.
     * If the cache itself does not exist, or no location is cached, {@type null} is returned.
     */
    static async loadSavedLocation() {
        const doesCachedFileExist = Cache.fileManager.fileExists(Cache.locationCacheFilePath)

        if (!doesCachedFileExist) {
            return null
        }
        const fileContents = Cache.fileManager.readString(Cache.locationCacheFilePath)

        try {
            const savedLoc = JSON.parse(fileContents)

            if (!savedLoc || !savedLoc.latitude || !savedLoc.longitude) {
                return null
            }
            return savedLoc
        } catch {
            return null
        }
    }
}
Cache.init()

/**
 * This class contains more generic utility functions that perform calculations
 * and parsing operations for various purposes.
 */
class Utils {

    static CSVToArray(strData, strDelimiter = ",") {
        // Create a regular expression to parse the CSV values.
        var objPattern = new RegExp(
            (
                // Delimiters.
                "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

                // Quoted fields.
                "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

                // Standard fields.
                "([^\"\\" + strDelimiter + "\\r\\n]*))"
            ),
            "gi"
        );
        // Create an array to hold our data. Give the array
        // a default empty first row.
        var arrData = [[]];

        // Create an array to hold our individual pattern
        // matching groups.
        var arrMatches = null;

        // Keep looping over the regular expression matches
        // until we can no longer find a match.
        while (arrMatches = objPattern.exec(strData)) {

            // Get the delimiter that was found.
            var strMatchedDelimiter = arrMatches[1];

            // Check to see if the given delimiter has a length
            // (is not the start of string) and if it matches
            // field delimiter. If id does not, then we know
            // that this delimiter is a row delimiter.
            if (
                strMatchedDelimiter.length &&
                strMatchedDelimiter !== strDelimiter
            ) {

                // Since we have reached a new row of data,
                // add an empty row to our data array.
                arrData.push([]);

            }

            var strMatchedValue;

            // Now that we have our delimiter out of the way,
            // let's check to see which kind of value we
            // captured (quoted or unquoted).
            if (arrMatches[2]) {

                // We found a quoted value. When we capture
                // this value, unescape any double quotes.
                strMatchedValue = arrMatches[2].replace(
                    new RegExp("\"\"", "g"),
                    "\""
                );

            } else {

                // We found a non-quoted value.
                strMatchedValue = arrMatches[3];

            }
            // Now that we have our value string, let's add
            // it to the data array.
            arrData[arrData.length - 1].push(strMatchedValue);
        }
        // Return the parsed data.
        return arrData;
    }

    static isNumericValue(number) {
        return number || number === 0
    }

    static shortFormatNumber(number) {
        if (number < 10000) {
            return `${number.toLocaleString()}`
        } else if (number < 1000000) {
            return `${number % 1000 >= 100 ? (number / 1000).toFixed(1) : Math.floor(number / 1000)}k`.replace(".", COMMA_SEPARATOR)
        } else {
            return `${number % 1000000 >= 100000 ? (number / 1000000).toFixed(1) : Math.floor(number / 1000000)}M`.replace(".", COMMA_SEPARATOR)
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
        if (!data || !data.rki_updated
            || !data.landkreis
            || !data.landkreis.cases7_per_100k_trend
            || !data.vaccination.last_updated
            || !data.country.r_value_7_days_last_updated) {
            return null
        }
        const relevantTimestamps = [];

        const last_updated = new Date(data.rki_updated)
        last_updated.setDate(last_updated.getDate() + 1)
        last_updated.setHours(0)
        relevantTimestamps.push(last_updated.getTime())

        const vaccination_last_updated = new Date(data.vaccination.last_updated)
        vaccination_last_updated.setDate(vaccination_last_updated.getDate() + 1)
        vaccination_last_updated.setHours(0)
        vaccination_last_updated.setMinutes(0)
        vaccination_last_updated.setSeconds(0)
        relevantTimestamps.push(vaccination_last_updated.getTime())

        if (APP_STATE.isMediumSize || APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
            const rValueLastUpdated = new Date(data.r_value_7_days_last_updated)
            rValueLastUpdated.setDate(rValueLastUpdated.getDate() + 1)
            rValueLastUpdated.setHours(0)
            rValueLastUpdated.setMinutes(0)
            rValueLastUpdated.setSeconds(0)
            relevantTimestamps.push(rValueLastUpdated.getTime())
        }

        const moreRecent = Math.min(...relevantTimestamps)
        return moreRecent > Date.now() ? new Date(moreRecent) : null
    }
}

class IncidenceStabilityLevel {

    constructor(incidenceHistory) {
        this._incidenceHistory = incidenceHistory || [];
        this._maxIncidence = Math.max(...this._incidenceHistory.filter(inc => !isNaN(inc) && isFinite(inc)), 0);
        this._stabilityLevel = IncidenceStabilityLevel.calculateIncidenceStabilityLevel(this._incidenceHistory);
        this._color = IncidenceStabilityLevel.getIncidenceStabilityColor(this._stabilityLevel);
        this._sfSymbolName = IncidenceStabilityLevel.getSymbolName(this._stabilityLevel)
    }

    static getIncidenceStabilityColor(stabilityLevel) {
        switch (stabilityLevel) {
            case INCIDENCE_STABILITY_LEVEL_1:
                return COLOR_GREEN
            case INCIDENCE_STABILITY_LEVEL_2:
                return COLOR_ORANGE
            case INCIDENCE_STABILITY_LEVEL_3:
                return COLOR_RED
            case INCIDENCE_STABILITY_LEVEL_4:
                return COLOR_MAGENTA
            default:
                return COLOR_GREY
        }
    }

    static getStabilityLevelForIncidence(incidence) {
        if (incidence < 50) {
            return INCIDENCE_STABILITY_LEVEL_1
        } else if (incidence < 100) {
            return INCIDENCE_STABILITY_LEVEL_2
        } else if (incidence < 200) {
            return INCIDENCE_STABILITY_LEVEL_3
        } else if (incidence >= 200) {
            return INCIDENCE_STABILITY_LEVEL_4
        } else {
            return INCIDENCE_STABILITY_LEVEL_NONE
        }
    }

    static calculateIncidenceStabilityLevel(incidenceHistory) {
        if (!incidenceHistory || incidenceHistory.length < 3) {
            return INCIDENCE_STABILITY_LEVEL_NONE
        }

        // Go through history until three equal levels found
        const lvls = incidenceHistory.map(incidence => {
            if (incidence < 0) {
                return INCIDENCE_STABILITY_LEVEL_NONE
            } else if (incidence < 50) {
                return INCIDENCE_STABILITY_LEVEL_1
            } else if (incidence < 100) {
                return INCIDENCE_STABILITY_LEVEL_2
            } else if (incidence < 200) {
                return INCIDENCE_STABILITY_LEVEL_3
            } else if (incidence >= 200) {
                return INCIDENCE_STABILITY_LEVEL_4
            } else {
                return INCIDENCE_STABILITY_LEVEL_NONE
            }
        });
        Logger.log("LEVELS: ", lvls);

        let currentStableLevel = INCIDENCE_STABILITY_LEVEL_NONE;
        let levelCandidate;
        let counter = 0;

        for (let i = 0; i < lvls.length; i++) {
            const lvl = lvls[i];
            Logger.log(lvl);

            if (lvl === INCIDENCE_STABILITY_LEVEL_NONE) {
                continue;
            }

            if (!levelCandidate || lvl !== levelCandidate) {
                levelCandidate = lvl;
                counter = 1;
                continue;
            }
            counter++;

            if (counter === 3) {
                currentStableLevel = lvl;
                levelCandidate = undefined;
                counter = 0;
                Logger.log("NEW STABLE LEVEL: " + currentStableLevel);
            }
        }

        Logger.log("STABLE LEVEL FOUND: " + currentStableLevel);
        return currentStableLevel;
    }

    static getSymbolName(stabilityLevel) {

        switch (stabilityLevel) {
            case INCIDENCE_STABILITY_LEVEL_1:
            case INCIDENCE_STABILITY_LEVEL_2:
            case INCIDENCE_STABILITY_LEVEL_3:
                return "lock.circle.fill"
            default:
                return "lock.circle.fill"
        }
    }

    get color() {
        return this._color;
    }

    get stabilityLevel() {
        return this._stabilityLevel;
    }

    get sfSymbolName() {
        return this._sfSymbolName;
    }
}

/**
 * Helper class for UI-related operations.
 * Contains functions to get or construct UI elements.
 */
class UiHelpers {

    static setVaccinationImage(image) {
        UiHelpers.VACCINATION_IMAGE = image
    }

    static getVaccinationImage() {
        return UiHelpers.VACCINATION_IMAGE
    }

    /**
     * Returns the UI color for incidence values.
     * @param {*} incidence The incidence value.
     */
    static getIncidenceColor(incidence) {
        if (incidence >= INCIDENCE_PINK) {
            return COLOR_PINK;
        } else if (incidence >= INCIDENCE_MAGENTA) {
            return COLOR_MAGENTA
        } else if (incidence >= INCIDENCE_RED) {
            return COLOR_RED
        } else if (incidence >= INCIDENCE_YELLOW) {
            return COLOR_ORANGE
        } else {
            return COLOR_GREEN
        }
    }

    /**
     * Returns the UI arrow element to visualize the trend.
     * @param {*} slope The predicted increase/decrease of the data.
     */
    static getInfectionTrend(slope) {
        if (slope >= 1) {
            return "▲"
        } else if (slope > -1) {
            return "▶︎"
        } else if (slope <= -1) {
            return "▼"
        } else {
            return "-"
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
        if (slope > (4 * factor)) {
            return COLOR_RED
        } else if (slope >= (1 * factor)) {
            return COLOR_ORANGE
        } else if (slope <= (-1 * factor)) {
            return COLOR_GREEN
        } else {
            return COLOR_GREY
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
            return customLandkreisName
        }
        return data.landkreis.county.match(/^SK \w+$/) ? `${data.landkreis.GEN} (SK)` : data.landkreis.GEN
    }

    /**
     * Generates the date string to describe the actuality of the RKI data.
     * Transforms a numeric timestamp into a date string with the following format: "DD.MM.YYYY"
     * @param {*} data The data received from the server api
     */
    static generateDataState(data) {

        if (!data.rki_updated) {
            return `  ${(data.landkreis.last_update || "").substr(0, 10)}`
        }
        const date = new Date(data.rki_updated)
        const day = date.getDate()
        const month = date.getMonth() + 1
        const year = date.getFullYear()
        return `  ${day < 10 ? '0' : ''}${day}.${month < 10 ? '0' : ''}${month}.${year}`
    }

    /**
     * Generates a Ui row for displaying the R-value and the corresponding trend.
     * @param {*} root 
     * @param {*} rValue 
     * @param {*} rValueTrend 
     * @param {*} label 
     * @param {*} fontSize 
     */
    static rValueRow(root, rValue, rValueTrend, label = "", fontSize = CONFIG.fontSize.xsmall) {
        const rValuePredictedSlope = rValueTrend ? rValueTrend.slope : rValueTrend

        const row = root.addStack()
        row.centerAlignContent()
        const rValueMarker = row.addText(`${label}`)
        rValueMarker.font = Font.boldSystemFont(fontSize)
        rValueMarker.textColor = COLOR_GREY

        const rValueTrendIconLabel = row.addText(`${UiHelpers.getInfectionTrend(rValuePredictedSlope)}`)
        rValueTrendIconLabel.font = Font.systemFont(fontSize - 2)
        rValueTrendIconLabel.textColor = UiHelpers.getTrendColor(rValuePredictedSlope, 0.1)

        const rValueLabel = row.addText(`${Utils.isNumericValue(rValue) ? `${rValue.toFixed(2).replace(".", COMMA_SEPARATOR)}` : "-"}`)
        rValueLabel.font = Font.boldSystemFont(fontSize)
        rValueLabel.textColor = COLOR_GREY
    }

    /**
     * Generates a UI row that displays the incidence value for a county/state/country and the corresponding trend.
     * @param {*} root The UI element where the row will be added to.
     * @param {*} incidence The incidence value.
     * @param {*} indicenceTrend The incidence trend data. Contains a slope value and a predicted value.
     * @param {*} label Text to render in front of the incidence value.
     * @param {*} fontSize The font size of the row elements.
     */
    static indicenceRow(root, incidence, indicenceTrend, label, fontSize = CONFIG.fontSize.small, showTrend = true, renderLabelAsSymbol = false) {
        const row = root.addStack()
        row.centerAlignContent()

        if (renderLabelAsSymbol) {
            const icon = SFSymbol.named(label)
            const labelIcon = row.addImage(icon.image)
            const iconFontSize = CONFIG.fontSize.small - (4 * (CONFIG.fontScaleFactor || 1));
            // const iconFontSize = CONFIG.fontSize.small - 4;
            labelIcon.imageSize = new Size(iconFontSize, iconFontSize)
            labelIcon.tintColor = COLOR_GREY
            row.addSpacer(1)
        } else {
            const labelText = row.addText(`${label}`)
            labelText.font = Font.boldSystemFont(fontSize)
            labelText.textColor = COLOR_GREY
        }

        if (showTrend) {
            const predictedIncidenceSlope = indicenceTrend ? indicenceTrend.slope : indicenceTrend
            const trendIconLabel = row.addText(`${UiHelpers.getInfectionTrend(predictedIncidenceSlope)}`)
            trendIconLabel.font = Font.systemFont(fontSize - 2)
            trendIconLabel.textColor = UiHelpers.getTrendColor(predictedIncidenceSlope)
        }

        const incidenceLabel = row.addText(Utils.isNumericValue(incidence) ? `${incidence.toFixed(1).replace(".", COMMA_SEPARATOR)}` : "-")
        incidenceLabel.font = Font.boldSystemFont(fontSize)
        incidenceLabel.textColor = UiHelpers.getIncidenceColor(incidence)
        incidenceLabel.lineLimit = 1
    }

    static stabilityLevelRow(root, incidenceHistory, fontSize = CONFIG.fontSize.tiny) {
        const row = root.addStack()
        row.centerAlignContent()

        const incidenceStabilityLevel = new IncidenceStabilityLevel(incidenceHistory)
        const labelIcon = row.addImage(SFSymbol.named(incidenceStabilityLevel.sfSymbolName).image)
        const iconFontSize = CONFIG.fontSize.tiny + (CONFIG.fontScaleFactor || 1);
        labelIcon.imageSize = new Size(iconFontSize, iconFontSize)
        labelIcon.tintColor = incidenceStabilityLevel.color
        row.addSpacer(1)

        const labelText = row.addText(incidenceStabilityLevel.stabilityLevel)
        labelText.font = Font.boldSystemFont(fontSize)
        labelText.textColor = COLOR_GREY
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
    static vaccinationRow(root, vaccinationQuote, vaccinationDelta, dataTimestamp, layout = "h", drawChart = false) {
        const row = root.addStack()
        let row1 = row;
        if (layout === "v") {
            row.layoutVertically()
            row1 = row.addStack()
            row1.centerAlignContent()
        }
        row.centerAlignContent()
        const vaccImage = UiHelpers.getVaccinationImage()

        if (vaccImage) {
            const vaccIcon = row1.addImage(vaccImage)
            vaccIcon.imageSize = new Size(CONFIG.fontSize.xsmall, CONFIG.fontSize.xsmall)
        }
        const vaccPercent = row1.addText(`${vaccImage ? " " : ""}${Utils.isNumericValue(vaccinationQuote) ? `${vaccinationQuote.toFixed(vaccinationQuote >= 10 ? 1 : 2).replace(".", COMMA_SEPARATOR)}` : "-"}%`)
        vaccPercent.font = Font.boldSystemFont(CONFIG.fontSize.small)
        vaccPercent.textColor = COLOR_BLUE

        if (drawChart) {
            UiHelpers.drawProgressBar(row, vaccinationQuote)
        }

        const vaccDelta = row.addText(Utils.isNumericValue(vaccinationDelta) ? `+${Utils.shortFormatNumber(vaccinationDelta)}` : "")
        vaccDelta.font = Font.boldSystemFont(CONFIG.fontSize.tiny)
        vaccDelta.textColor = COLOR_GREY

        const dataTime = new Date(dataTimestamp)
        dataTime.setDate(dataTime.getDate() + 1)
        dataTime.setHours(0)
        dataTime.setMinutes(0)
        dataTime.setSeconds(0)

        if (Date.now() > dataTime.getTime()) {
            const icon = SFSymbol.named("exclamationmark.arrow.triangle.2.circlepath")
            const outdatedIndicator = row1.addImage(icon.image)
            outdatedIndicator.imageSize = new Size(CONFIG.fontSize.tiny, CONFIG.fontSize.tiny)
            outdatedIndicator.tintColor = COLOR_GREY
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
        const barCount = historyData.length
        const maxValue = Math.max(...historyData, 50)
        const ctx = new DrawContext()
        ctx.opaque = false
        ctx.size = new Size(width, height)
        ctx.respectScreenScale = true
        const barWidth = Math.min((width - (barSpace * (barCount - 1))) / barCount, 4)

        const barPositions = []

        for (let i = 0; i < barCount; i++) {
            const dataPoint = historyData[barCount - 1 - i]
            const barX = width - ((barWidth * (i + 1)) + (barSpace * i))
            const barHeight = (dataPoint / maxValue) * height
            const bar = new Rect(barX, height - barHeight, barWidth, barHeight) // x, y, rect width, rect height
            ctx.setFillColor(UiHelpers.getIncidenceColor(dataPoint))
            ctx.fill(bar)
            barPositions.push({ x: barX + (0.5 * barWidth), y: height - barHeight })
        }

        const xAxis = new Path()
        xAxis.move(new Point(0, height))
        xAxis.addLine(new Point(width, height))

        ctx.setStrokeColor(COLOR_GREY)
        ctx.setLineWidth(1)

        ctx.addPath(xAxis)
        ctx.strokePath(xAxis)

        if (CONFIG.showTrendCurves) {
            UiHelpers.drawTrendLine(ctx, barPositions, height)
        }

        const container = root.addStack()
        container.size = new Size(width, height)
        container.addImage(ctx.getImage())
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
    static drawProgressBar(root, value, width = CONFIG.chartWidth.vaccinationProgress, height = 9, barHeight = 7, barCount = 10, barSpace = 2) {
        const filledBars = Math.floor(value / barCount)
        const barWidth = (width - (barSpace * (barCount - 1))) / barCount

        const chart = root.addStack()
        chart.size = new Size(width, height)
        chart.spacing = barSpace

        for (let i = 0; i < barCount; i++) {
            const isBarFilled = i <= filledBars
            const bar = chart.addStack()
            bar.size = new Size(barWidth, barHeight)
            bar.backgroundColor = isBarFilled ? COLOR_BLUE : COLOR_BAR_GREY_BG
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
        const trendLine = new Path()
        trendLine.move(new Point(barPositions[0].x, UiHelpers.trendOffset(barPositions[0].y, chartHeight)))
        const lastBar = barPositions[barPositions.length - 1]
        const middle = barPositions[Math.floor(barPositions.length / 2)]
        trendLine.addCurve(
            new Point(lastBar.x, UiHelpers.trendOffset(lastBar.y, chartHeight)),
            new Point(barPositions[0].x, UiHelpers.trendOffset(barPositions[0].y, chartHeight)),
            new Point(middle.x, UiHelpers.trendOffset(middle.y, chartHeight))
        )
        drawContext.setStrokeColor(COLOR_CHART_TREND)
        drawContext.setLineWidth(1)
        drawContext.addPath(trendLine)
        drawContext.strokePath(trendLine)
    }

    /**
     * Calculates the position for drawing smoothed trend lines into bar charts.
     * @param {*} barY 
     * @param {*} height 
     */
    static trendOffset(barY, height) {
        return Math.min(barY + 3, height - 1)
    }
}

class DataService {

    static async loadData(location, isLocationFlexible) {
        const cachedData = isLocationFlexible ? undefined : Cache.get(location)
        let rkiObjectId;
        let rkiData;

        if (!cachedData || !cachedData.landkreis) {
            rkiData = await new Request(locationApi(location)).loadJSON()
            const isRkiDataValid = rkiData && rkiData.features && rkiData.features.length && rkiData.features[0].attributes

            if (!isRkiDataValid) {
                return null
            }
            rkiObjectId = rkiData.features[0].attributes.OBJECTID
        } else {
            rkiObjectId = cachedData.landkreis.OBJECTID
        }

        const apiData = await new Request(serverApi(rkiObjectId)).loadJSON()
        try {
            if (!apiData && !cachedData) {
                throw "No data - use RKI fallback data without trend"
            }

            if (!apiData && !!cachedData) {
                return cachedData
            }
            const isCacheUpdateNeeded = !isLocationFlexible && (!cachedData || apiData.rki_updated > (cachedData.rki_updated || 0))

            if (isCacheUpdateNeeded) {
                Cache.update(location, apiData)
            }
            return apiData
        } catch {
            return {
                landkreis: {
                    ...rkiData.features[0].attributes,
                    cases7_per_100k_trend: {},
                    cases7_bl_per_100k_trend: {}
                },
                country: {
                    cases7_de_per_100k_trend: {}
                }
            }
        }
    }

    static async loadAbsoluteCases() {
        const data = await new Request(serverApi(1)).loadJSON()

        if (!data) {
            return null
        }
        return data
    }

    static async getLocationFromGps() {
        try {
            Location.setAccuracyToThreeKilometers()
            const gpsLocation = await Location.current()
            return gpsLocation
        } catch {
            return null;
        }
    }

    static async loadLocation() {
        const lastKnownLocation = await Cache.loadSavedLocation()
        const location = await DataService.getLocationFromGps()

        if (!location) {
            console.log("No data from fetching location")
            return {
                ...lastKnownLocation,
                isCached: true
            }
        }
        const hasLocationChanged = !lastKnownLocation || (location.latitude !== lastKnownLocation.latitude || location.longitude !== lastKnownLocation.longitude);

        if (hasLocationChanged) {
            Cache.updateLocation(location)
        }
        return location
    }
}


const createIncidenceWidget = (widget, data, customLandkreisName, isLocationFlexible, isCached) => {

    const headerStack = widget.addStack()
    headerStack.layoutHorizontally()
    headerStack.centerAlignContent()

    const header = headerStack.addText(INCIDENCE_HEADER)
    header.font = Font.mediumSystemFont(CONFIG.fontSize.header)

    if (isLocationFlexible) {
        headerStack.addSpacer(APP_STATE.isMediumSize ? 10 : null)
        const icon = SFSymbol.named(isCached ? "bolt.horizontal.circle" : "location")
        const flexibleLocationIndicator = headerStack.addImage(icon.image)
        flexibleLocationIndicator.imageSize = new Size(CONFIG.fontSize.medium, CONFIG.fontSize.medium)
        flexibleLocationIndicator.tintColor = isCached ? COLOR_GREY : COLOR_BLUE
    }

    if (!data) {
        widget.addSpacer()
        widget.addText("Aktueller Ort konnte nicht ermittelt werden.")
        return;
    }
    const stateInfo = widget.addText(UiHelpers.generateDataState(data))
    stateInfo.font = Font.systemFont(CONFIG.fontSize.tiny)
    stateInfo.textColor = COLOR_GREY
    widget.addSpacer(10);

    const content = widget.addStack()
    content.backgroundColor = COLOR_CONTAINER_BG
    content.cornerRadius = 12
    content.setPadding(4, 4, 4, 4)
    content.layoutVertically()


    const incidenceRow = content.addStack()
    incidenceRow.layoutHorizontally()
    incidenceRow.centerAlignContent()

    const isLandkreisIncidenceToBeShortened = Utils.isNumericValue(data.landkreis.cases7_per_100k) && data.landkreis.cases7_per_100k >= 1000;
    const landkreisIncidence = data.landkreis.cases7_per_100k.toFixed(isLandkreisIncidenceToBeShortened ? 0 : 1)
    const incidenceLabel = incidenceRow.addText(Utils.isNumericValue(data.landkreis.cases7_per_100k) ? `${landkreisIncidence.replace(".", COMMA_SEPARATOR)}` : "-")
    incidenceLabel.font = Font.boldSystemFont(CONFIG.fontSize.xlarge)
    incidenceLabel.minimumScaleFactor = 0.8
    incidenceLabel.textColor = UiHelpers.getIncidenceColor(data.landkreis.cases7_per_100k)

    const landkreisTrendIconLabel = incidenceRow.addText(` ${UiHelpers.getInfectionTrend(data.landkreis.cases7_per_100k_trend.slope)}`)
    landkreisTrendIconLabel.font = Font.systemFont(CONFIG.fontSize.medium)
    landkreisTrendIconLabel.textColor = UiHelpers.getTrendColor(data.landkreis.cases7_per_100k_trend.slope)

    incidenceRow.addSpacer()

    const chartStack = incidenceRow.addStack()
    chartStack.layoutVertically()

    UiHelpers.drawBarChart(chartStack, data.landkreis.cases7_per_100k_history, 12, CONFIG.chartWidth.landkreisHistory)

    chartStack.addSpacer(1)

    if (CONFIG.showIncidenceStability) {
        UiHelpers.stabilityLevelRow(chartStack, data.landkreis.cases7_per_100k_history)
    } else {
        // Absolute new cases
        const casesLandkreisIncrease = Utils.isNumericValue(data.landkreis.cases) && Utils.isNumericValue(data.landkreis.cases_previous_day) ? data.landkreis.cases - data.landkreis.cases_previous_day : undefined
        const casesLandkreisLabel = chartStack.addText(`${Utils.isNumericValue(casesLandkreisIncrease) ? `+${Math.max(casesLandkreisIncrease, 0).toLocaleString()}` : "-"}`)
        casesLandkreisLabel.font = Font.boldSystemFont(CONFIG.fontSize.tiny)
        casesLandkreisLabel.textColor = COLOR_GREY
    }

    const landkreisNameLabel = content.addText(UiHelpers.generateLandkreisName(data, customLandkreisName))
    landkreisNameLabel.font = Font.mediumSystemFont(CONFIG.fontSize.large)
    landkreisNameLabel.minimumScaleFactor = 0.7

    widget.addSpacer()

    const footer = widget.addStack()
    footer.useDefaultPadding()
    footer.centerAlignContent()

    const footerLeft = footer.addStack()
    footerLeft.layoutVertically()
    footerLeft.centerAlignContent()

    footer.addSpacer()

    const footerRight = footer.addStack()
    footerRight.layoutVertically()

    UiHelpers.drawBarChart(footerLeft, data.landkreis.cases7_bl_per_100k_history, 12, CONFIG.chartWidth.stateHistory, 1.5)
    UiHelpers.indicenceRow(footerLeft,
        data.landkreis.cases7_bl_per_100k,
        data.landkreis.cases7_bl_per_100k_trend,
        `${BUNDESLAENDER_SHORT[data.landkreis.BL]}`
    )
    UiHelpers.vaccinationRow(
        footerRight,
        data.vaccination.state.vacc_quote,
        data.vaccination.state.vacc_delta,
        data.vaccination.last_updated,
        "v",
        true
    )
}

const createInfectionsWidget = (widget, data) => {
    const headerLabel = widget.addText(INFECTIONS_HEADER)
    headerLabel.font = Font.mediumSystemFont(CONFIG.fontSize.header)

    if (!data) {
        widget.addSpacer()
        widget.addText("Keine Fallzahlen verfügbar.")
        return;
    }
    const countryData = data.country
    const infectionsDiff = countryData.new_cases - countryData.new_cases_previous_day

    const stateInfo = widget.addText(UiHelpers.generateDataState(data))
    stateInfo.font = Font.systemFont(CONFIG.fontSize.tiny)
    stateInfo.textColor = COLOR_GREY
    widget.addSpacer()

    const casesStack = widget.addStack()

    casesStack.addSpacer()

    const casesLabel = casesStack.addText(`${Utils.isNumericValue(countryData.new_cases) ? countryData.new_cases.toLocaleString() : "-"}`)
    casesLabel.font = Font.boldSystemFont(CONFIG.fontSize.xlarge)
    casesLabel.minimumScaleFactor = 0.8

    casesStack.addSpacer()

    const casesDifferenceStack = widget.addStack()

    casesDifferenceStack.addSpacer()

    const casesTrendIcon = casesDifferenceStack.addText(UiHelpers.getInfectionTrend(countryData.new_cases - countryData.new_cases_previous_day))
    casesTrendIcon.font = Font.systemFont(CONFIG.fontSize.medium)
    casesTrendIcon.textColor = UiHelpers.getTrendColor(infectionsDiff)

    const casesDiffLabel = casesDifferenceStack.addText(Utils.isNumericValue(infectionsDiff) ? ` (${infectionsDiff >= 0 ? '+' : ''}${infectionsDiff.toLocaleString()})` : "-")
    casesDiffLabel.font = Font.systemFont(CONFIG.fontSize.medium)
    casesDiffLabel.textColor = COLOR_GREY

    casesDifferenceStack.addSpacer()

    widget.addSpacer()

    const footer = widget.addStack()
    footer.centerAlignContent()

    const footerLeft = footer.addStack()
    footerLeft.layoutVertically()

    UiHelpers.rValueRow(footerLeft, countryData.r_value_7_days, countryData.r_value_7_days_trend, "R ")
    UiHelpers.drawBarChart(footerLeft, countryData.cases7_de_per_100k_history, 12, CONFIG.chartWidth.stateHistory, 1.5)
    UiHelpers.indicenceRow(footerLeft, countryData.cases7_de_per_100k, countryData.cases7_de_per_100k_trend, "DE")

    footer.addSpacer()

    const footerRight = footer.addStack()
    footerRight.layoutVertically()

    UiHelpers.vaccinationRow(
        footerRight,
        data.vaccination.country.vacc_quote,
        data.vaccination.country.vacc_delta,
        data.vaccination.last_updated,
        "v",
        true
    )
}

let widget = await createWidget(config.widgetFamily)

if (!config.runsInWidget) {
    await widget.presentSmall()
}
Script.setWidget(widget)
Script.complete()

async function createWidget(size) {
    APP_STATE.isMediumSize = size === WIDGET_SIZE_MEDIUM
    APP_STATE.widgetSize = size
    APP_STATE.widgetMode = WIDGET_MODE.INCIDENCE;

    let location = {};
    let customLandkreisName;

    const params = args.widgetParameter ? args.widgetParameter.split(",") : undefined
    // const params = ["49.89", "10.855"] // BA
    // const params = ["48.6406978", "9.1391464"] // Böblingen
    const widget = new ListWidget()
    widget.backgroundColor = Color.dynamic(Color.white(), COLOR_DARK_BG)
    widget.setPadding(12, 12, 12, 12)

    if (!params) {
        location = await DataService.loadLocation()

        if (!location) {
            widget.addText("Standort konnte nicht ermittelt werden.")
            return widget
        }
    }

    if (params && params[0] === "INF") {
        APP_STATE.widgetMode = WIDGET_MODE.INFECTIONS
    }

    if (params && params[0] !== "INF") {
        location = {
            latitude: parseFloat(params[0]),
            longitude: parseFloat(params[1])
        }
        customLandkreisName = params[2]
    }
    const isLocationFlexible = !params
    UiHelpers.setVaccinationImage(await Cache.loadVaccinationImage())

    if (APP_STATE.isMediumSize) {

        if (APP_STATE.widgetMode === WIDGET_MODE.INFECTIONS) {
            const infectionData = await DataService.loadAbsoluteCases()
            createInfectionsWidget(widget, infectionData)
            widget.refreshAfterDate = Utils.getNextUpdate(infectionData)
            return widget
        }
        let data = await DataService.loadData(location, isLocationFlexible)
        const main = widget.addStack()
        const leftSide = main.addStack()
        leftSide.layoutVertically()
        createIncidenceWidget(leftSide, data, customLandkreisName, isLocationFlexible, location.isCached)
        main.addSpacer()
        main.addSpacer(34)
        main.addSpacer()
        const rightSide = main.addStack()
        rightSide.layoutVertically()

        if (!data) {
            data = await DataService.loadAbsoluteCases()
        }
        createInfectionsWidget(rightSide, data)
        widget.refreshAfterDate = Utils.getNextUpdate(data)
        return widget
    }

    switch (APP_STATE.widgetMode) {
        case WIDGET_MODE.INCIDENCE:
            const data = await DataService.loadData(location, isLocationFlexible)
            createIncidenceWidget(widget, data, customLandkreisName, isLocationFlexible, location.isCached)
            widget.refreshAfterDate = Utils.getNextUpdate(data)
            break;
        case WIDGET_MODE.INFECTIONS:
            const infectionData = await DataService.loadAbsoluteCases()
            createInfectionsWidget(widget, infectionData)
            widget.refreshAfterDate = Utils.getNextUpdate(infectionData)
            break;
        default:
            widget.addText("Keine Daten.")
    }
    return widget
}



class Helpers {
    ONE_DAY_IN_MS = 86400000;

    // Matches the german date strings (DD.MM.YYYY) which the RKI uses.
    GERMAN_DATE_REGEX = /^([0-9]{2}).([0-9]{2}).([0-9]{4})/;

    /**
     * Performs a deep copy of objects and returns the copied one.
     * Be aware:
     * Complex types that cannot be handled by JSON such as Functions and Date objects are not supported.
     * @param data The data object to copy deep.
     */
    static copyDeep(data) {
        if (typeof data !== "object") {
            return undefined;
        }
        return JSON.parse(JSON.stringify(data));
    }

    /**
     * Writes corona data to a file on disk.
     * @param data The data object to write to file.
     * @param filePath The destination file path.
     */
    static writeToFile(data, filePath) {
        return new Promise((res, rej) => {
            fs.writeFile(filePath, JSON.stringify(data), (err) => {
                if (err) {
                    return rej();
                }
                return res();
            })
        });
    }

    /**
     * Check, if the content of a website has changed since the last time it was visited.
     * A HEAD request is performed and the returned last-modified date is checked against
     * a provided timestamp.
     * Returns if the website was modified after the provided timestamp which acts as an
     * indicator that new, more recent data is available on this site.
     * Also returns the modification date of the website as timestamp.
     * @param url The URL to check.
     * @param lastChecked Timestamp of the last time, the website was visited/checked.
     */
    static async isNewDataAvailable(url, lastChecked) {
        try {
            const response = await new Request(url, {method: "HEAD"}).load();

            if (!response || response.status !== 200) {
                throw new Error();
            }
            // ISO string representing a date.
            const lastModified = response.headers["last-modified"];
            const modifiedTimestamp = new Date(lastModified).getTime();
            const isMoreRecentDataAvailable = modifiedTimestamp > lastChecked;

            return {
                isMoreRecentDataAvailable,
                lastModified: modifiedTimestamp
            }
        } catch {
            return {
                isMoreRecentDataAvailable: false,
                lastModified: null
            };
        }
    }

    static linearRegression(y, x) {
        var lr = {};
        var n = y.length;
        var sum_x = 0;
        var sum_y = 0;
        var sum_xy = 0;
        var sum_xx = 0;
        var sum_yy = 0;

        for (var i = 0; i < y.length; i++) {
            sum_x += x[i];
            sum_y += y[i];
            sum_xy += (x[i] * y[i]);
            sum_xx += (x[i] * x[i]);
            sum_yy += (y[i] * y[i]);
        }

        lr['slope'] = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
        lr['predicted_value'] = (sum_y - lr.slope * sum_x) / n;
        lr['r2'] = Math.pow((n * sum_xy - sum_x * sum_y) / Math.sqrt((n * sum_xx - sum_x * sum_x) * (n * sum_yy - sum_y * sum_y)), 2);

        return lr;
    }

    /**
     * Compute a linear trend for a given series of numeric data.
     * Returns the slope and the predicted value calculated via linear regression.
     * @param yValues 
     */
    static computeTrend(yValues) {
        if (!yValues || !yValues.length) {
            return {
                slope: null,
                predicted_value: null
            };
        }
        if (yValues.length === 1) {
            return {
                slope: 0,
                predicted_value: yValues[0]
            };
        }
        const xValues = yValues.map((v, i) => i);

        const regression = this.linearRegression(xValues, yValues);

        return regression;
    }

    /**
     * Finds the most recent timestamp from all dates available in RKI data and returns it.
     * Returns null, if no dates ware found within the data.
     * @param rki_data The data received from RKI
     */
    static getTimestampOfFetchedData(rki_data) {
        const last_updated_candidates = [];

        for (const feature of rki_data.features) {
            const landkreis = feature.attributes;
            const isNewUpdatedDate = last_updated_candidates.indexOf(landkreis.last_update) === -1;

            if (isNewUpdatedDate) {
                last_updated_candidates.push(landkreis.last_update);
            }
        }

        const rki_timestamps = last_updated_candidates.map((c) => {
            const match = c.match(this.GERMAN_DATE_REGEX);

            if (!match || !match.length) {
                return null;
            }
            const day = match[1];
            const month = match[2];
            const year = match[3];
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
        }).filter(c => !!c && !isNaN(c));

        return rki_timestamps.length ? Math.max(...rki_timestamps) : null;
    }

    /**
     * Rollback incidence related data for countys, states and the country as well as the historic data
     * to the state of the previous day.
     * This is especially useful, if an update corrupted the actual data in some way.
     * Use with care, because only several data entries are rolled back!
     * Common advise is to perform an update of the data shortly after rolling back.
     * @param data The corona data to rollback.
     */
    static rollbackDataByOneDay(data) {

        if (!data) {
            return;
        }

        for (const landkreis of data.landkreise) {
            landkreis.cases = landkreis.cases_previous_day;
            landkreis.deaths = landkreis.deaths_previous_day;
            landkreis.cases7_per_100k_history = landkreis.cases7_per_100k_history.slice(0, landkreis.cases7_per_100k_history.length - 1);
            landkreis.cases7_bl_per_100k_history = landkreis.cases7_bl_per_100k_history.slice(0, landkreis.cases7_bl_per_100k_history.length - 1);
        }

        data.country.new_cases = data.country.new_cases_previous_day;
        data.country.cases = data.country.cases_previous_day;
        data.country.cases7_de_per_100k_history = data.country.cases7_de_per_100k_history.slice(0, data.country.cases7_de_per_100k_history.length - 1);

        data.rki_updated = data.rki_updated - this.ONE_DAY_IN_MS;
    }
}



// INCIDENCE
/**
 * Updates the incidence data and history/trends for districts, states and country.
 * The data is based on and retrieved from the official RKI API.
 */
export class IncidenceConnector {

    LANDKREISE_DATA_ALL = "https://services7.arcgis.com/mOBPykOjAyBO2ZKk/arcgis/rest/services/RKI_Landkreisdaten/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,GEN,BEZ,EWZ,EWZ_BL,cases,deaths,cases_per_100k,cases_per_population,BL,BL_ID,county,last_update,cases7_per_100k,recovered,EWZ_BL,cases7_bl_per_100k&returnGeometry=false&outSR=4326&f=json";
    MAX_DAYS_IN_HISTORY = 14;
    MAX_DAYS_FOR_TREND_CALCULATION = 14;

    /**
     * Updates the district data, if new data is available.
     * - If no cached data is provided, the update is postponed.
     * - Checks, if new district data data is available. If not, the update is postponed.
     * - If no valid district data was found, the update is aborted.
     * - If the fetched data from RKI API is from the same day and differs the cached one,
     *   the data for the current day is corrected.
     * @param cachedData The current cached data.
     */
    async update(cachedData) {
        let rkiResponse;

        try {
            rkiResponse = await axios.get(this.LANDKREISE_DATA_ALL);
        } catch (error) {
            Logger.error(`${this.getId()} Request to RKI failed.`)
            return;
        }

        if (!rkiResponse || !rkiResponse.data || !rkiResponse.data.features || !rkiResponse.data.features.length) {
            Logger.error(`${this.getId()} Received invalid data!`);
            return;
        }
        const fetchedData = rkiResponse.data;

        // Deep copy of cached data
        let actualData = cachedData ? JSON.parse(JSON.stringify(cachedData)) : {};

        const timestampOfFetchedData = Helpers.getTimestampOfFetchedData(fetchedData);
        const isFetchedDataFromSameDay = timestampOfFetchedData === actualData.rki_updated;
        const isFetchedDataOutdated = timestampOfFetchedData < actualData.rki_updated;

        if (isFetchedDataOutdated) {
            Logger.info(`${this.getId()} Retrieved data from RKI is outdated. Checking again later.`);
            return;
        }

        if (isFetchedDataFromSameDay) {

            if (this.isDistrictDataEqualWithCache(actualData, fetchedData)) {
                Logger.info(`${this.getId()} Data contains no updates. Keeping cached one.`);
                return;
            }
            // Rollback to previous day to update today again.
            Logger.info(`${this.getId()} Found updated data for same day. Updating with rollback.`)
            Helpers.rollbackDataByOneDay(actualData);
        }

        // Construct new data from rki response.
        const newData = this.constructNewData(actualData, fetchedData, timestampOfFetchedData);

        // Validate new data.
        if (!newData.landkreise || !newData.landkreise.length) {
            Logger.error(`${this.getId()} Could not construct new updated data!`);
            return;
        }

        if (!this.isDistrictDataValid(newData)) {
            Logger.error(`${this.getId()} Plausi-ERROR: Landkreis data invalid.`);
            return;
        }

        if (!this.isCountryDataValid(newData)) {
            Logger.error(`${this.getId()} Plausi-ERROR: Country data invalid.`);
            return;
        }

        if (!this.isMetadataValid(newData, actualData, isFetchedDataFromSameDay)) {
            Logger.error(`${this.getId()} Plausi-ERROR: Metadata invalid.`);
            return;
        }
        return newData;
    }

    /**
     * Checks if the cached districts data of the server equals the fetched ones from RKI API. 
     * @param cachedData The cached data.
     * @param fetchedData The fetched data from RKI API.
     */
    isDistrictDataEqualWithCache(cachedData, fetchedData) {

        for (let entry of fetchedData.features) {
            const landkreis = entry.attributes;
            const cachedLandkreis = cachedData.landkreise.find((lk) => lk.OBJECTID === landkreis.OBJECTID);

            if (!cachedLandkreis) {
                return false;
            }
            const isLandkreisDataEqual = landkreis.cases === cachedLandkreis.cases
                && landkreis.cases7_per_100k === cachedLandkreis.cases7_per_100k
                && landkreis.deaths === cachedLandkreis.deaths
                && landkreis.cases_per_100k === cachedLandkreis.cases_per_100k
                && landkreis.county === cachedLandkreis.county
                && landkreis.BL === cachedLandkreis.BL
                && landkreis.BL_ID === cachedLandkreis.BL_ID
                && landkreis.cases7_per_100k === cachedLandkreis.cases7_per_100k
                && landkreis.cases7_bl_per_100k === cachedLandkreis.cases7_bl_per_100k;

            if (!isLandkreisDataEqual) {
                return false;
            }
        }
        return true;
    }

    /**
     * Constructs and returns the new data from the data received by RKI API.
     * @param cachedData The cached data from the server.
     * @param fetchedData The fetched data from RKI API.
     * @param timestampOfFetchedData Timestamp of when the RKI data was fetched.
     */
    constructNewData(cachedData, fetchedData, timestampOfFetchedData) {
        const data = this.generateNewDataTemplate(cachedData);
        const fetchedDate = new Date(Date.now());

        const tempBundeslandTrends = {}
        const bundeslandIndicences = [];
        let einwohnerzahlDe = 0;
        const bundeslandAbsoluteCases7Days = {};

        for (const feature of fetchedData.features) {
            const landkreis = feature.attributes;
            const cachedLandkreis = cachedData.landkreise?.find((lk) => lk.OBJECTID === landkreis.OBJECTID);

            const cases7_per_100k_history = cachedLandkreis && cachedLandkreis.cases7_per_100k_history ? [].concat(cachedLandkreis.cases7_per_100k_history, landkreis.cases7_per_100k).slice(-this.MAX_DAYS_IN_HISTORY) : [landkreis.cases7_per_100k];
            const cases7_bl_per_100k_history = cachedLandkreis && cachedLandkreis.cases7_bl_per_100k_history ? [].concat(cachedLandkreis.cases7_bl_per_100k_history, landkreis.cases7_bl_per_100k).slice(-this.MAX_DAYS_IN_HISTORY) : [landkreis.cases7_bl_per_100k];
            const landkreisTrend = Helpers.computeTrend(cases7_per_100k_history.slice(-this.MAX_DAYS_FOR_TREND_CALCULATION));

            if (!tempBundeslandTrends[landkreis.BL_ID]) {
                tempBundeslandTrends[landkreis.BL_ID] = Helpers.computeTrend(cases7_bl_per_100k_history.slice(-this.MAX_DAYS_FOR_TREND_CALCULATION));
                bundeslandIndicences.push(landkreis.cases7_bl_per_100k);
            }

            if (!bundeslandAbsoluteCases7Days[landkreis.BL_ID]) {
                bundeslandAbsoluteCases7Days[landkreis.BL_ID] = landkreis.cases7_bl_per_100k / 100000 * landkreis.EWZ_BL;
                einwohnerzahlDe += landkreis.EWZ_BL;
            }

            data.landkreise.push({
                ...landkreis,
                cases_previous_day: cachedLandkreis ? cachedLandkreis.cases : landkreis.cases,
                deaths_previous_day: cachedLandkreis ? cachedLandkreis.deaths : landkreis.deaths,
                cases7_per_100k_history,
                cases7_bl_per_100k_history,
                cases7_per_100k_trend: landkreisTrend,
                cases7_bl_per_100k_trend: tempBundeslandTrends[landkreis.BL_ID]
            });
            data.country.cases = data.country.cases + landkreis.cases;
        }
        data.country.cases_previous_day = cachedData.country ? cachedData.country.cases : data.country.cases;
        data.country.new_cases_previous_day = cachedData.country ? cachedData.country.new_cases : 0;
        data.country.new_cases = data.country.cases - data.country.cases_previous_day;

        data.country.cases7_de_per_100k = Object.values(bundeslandAbsoluteCases7Days).reduce((sum, blAbsoluteCases) => sum + blAbsoluteCases) / einwohnerzahlDe * 100000;
        data.country.cases7_de_per_100k_history = [].concat(cachedData.country ? (cachedData.country.cases7_de_per_100k_history || []) : [], data.country.cases7_de_per_100k).slice(-this.MAX_DAYS_IN_HISTORY);
        data.country.cases7_de_per_100k_trend = Helpers.computeTrend(data.country.cases7_de_per_100k_history.slice(-this.MAX_DAYS_FOR_TREND_CALCULATION));

        data.rki_updated = timestampOfFetchedData;
        data.rki_updated_date = new Date(data.rki_updated).toISOString();
        data.fetched = fetchedDate.toISOString();
        data.fetched_timestamp = fetchedDate.getTime();

        return data;
    }

    /**
     * Constructs the template for an updated version of the cached data.
     * Uses initial/default values for incidence-related metrics.
     * @param cachedData The cached data.
     */
    generateNewDataTemplate(cachedData) {
        return {
            landkreise: [], // Daten zu den Landkreisen.
            country: {
                ...cachedData.country,
                cases: 0, // Gesamtzahl der Fälle in DE
                cases_previous_day: 0, // Gesamtzahl der Fälle in DE am vorherigen Tag
                new_cases: 0, // Neuinfektionen in DE
                new_cases_previous_day: 0, // Neuinfektionen in DE am vorherigen Tag
                cases7_de_per_100k: 0, // 7-Tage Inzidenz DE
                cases7_de_per_100k_history: [], // Verlauf 7-Tage Inzidenz DE
                cases7_de_per_100k_trend: {} // Trend 7-Tage Inzidenz DE
            },
            vaccination: cachedData ? {
                ...cachedData.vaccination
            } : undefined,
            rki_updated: 0, // Zeitstempel der Daten vom RKI
            rki_updated_date: null, // Zeitstempel der Daten vom RKI als ISO String.
            fetched: null, // Zeitstempel der Datenabfrage vom RKI als ISO String.
            fetched_timestamp: 0 // Zeitstempel der Datenabfrage vom RKI
        };
    }

    /**
     * Checks, if the district related data is valid.
     * @param data The data to check.
     */
    isDistrictDataValid(data) {
        return data.landkreise.every((lk) => {
            const isValid = !!lk.OBJECTID &&
                !!lk.BL_ID &&
                !!lk.BL &&
                !!lk.county &&
                lk.cases7_bl_per_100k >= 0 &&
                lk.cases7_per_100k >= 0 &&
                lk.cases7_per_100k_history &&
                !!lk.cases7_bl_per_100k_history &&
                lk.cases >= 0 &&
                lk.cases_previous_day >= 0 &&
                // Tolerance, if a few cases were corrected.
                // lk.cases >= Math.max(lk.cases_previous_day - 10, 0) &&
                lk.deaths >= 0 &&
                lk.deaths_previous_day >= 0;

            if (!isValid) {
                Logger.error(`${this.getId()} Invalid Landkreis in new data! ID: ${lk.OBJECTID}, Name: ${lk.county}`);
                Logger.error(lk.BL_ID)
                Logger.error(lk.BL)
                Logger.error(lk.county)
                Logger.error(`${lk.cases7_bl_per_100k}, ${lk.cases7_bl_per_100k >= 0}`)
                Logger.error(`${lk.cases7_per_100k}, ${lk.cases7_per_100k >= 0}`)
                Logger.error(`${lk.cases7_per_100k_history}, ${!!lk.cases7_per_100k_history}`)
                Logger.error(`${lk.cases7_bl_per_100k_history}, ${!!lk.cases7_bl_per_100k_history}`)
                Logger.error(`${lk.cases}, ${lk.cases >= 0}`)
                Logger.error(`${lk.cases_previous_day}, ${lk.cases_previous_day >= 0}`)
                Logger.error(`${lk.cases}, ${lk.cases_previous_day}, ${lk.cases >= lk.cases_previous_day}`)
                Logger.error(`${lk.cases} ${lk.deaths_previous_day >= 0}`)
            }
            return isValid;
        });
    }

    /**
     * Checks, if the country data is valid.
     * @param data The data to check.
     */
    isCountryDataValid(data) {
        return data.country.cases >= 0 &&
            data.country.cases_previous_day >= 0 &&
            data.country.cases >= data.country.cases_previous_day &&
            data.country.new_cases >= 0 &&
            data.country.new_cases_previous_day >= 0 &&
            data.country.cases7_de_per_100k >= 0 &&
            !!data.country.cases7_de_per_100k_history;
    }

    /**
     * Checks, if the meta data is valid.
     * @param newData The data to check.
     * @param cachedData The current cached data.
     * @param isFetchedDataFromSameDay If the fetched data is from the same day as the cached one. 
     * Indicates a correction of the data from RKI side.
     */
    isMetadataValid(newData, cachedData, isFetchedDataFromSameDay) {
        return newData.rki_updated >= 0
            && ((!isFetchedDataFromSameDay && newData.rki_updated > (cachedData.rki_updated || 0)) || (isFetchedDataFromSameDay && newData.rki_updated === cachedData.rki_updated))
            && newData.fetched_timestamp >= 0
            && newData.fetched_timestamp >= newData.rki_updated;
    }
}


// R-VALUE
export class RValueConnector extends Connector {

    static ID = "[VACC]";

    static R_VALUE_URL = "https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Projekte_RKI/Nowcasting_Zahlen_csv.csv?__blob=publicationFile";
    static R_VALUE_XLSX_SHEET_REGEX = /Nowcast.{1}R/i;

    // Possible names for the R-value column header in the XLSX.
    static R_VALUE_HEADER_COLUMN_NAMES = ["Sch√§tzer_7_Tage_R_Wert", "Punktschätzer des 7-Tage-R Wertes"];

    /**
     * Updates the R-value data, if new data is available.
     * - If no cached data is provided, the update is postponed.
     * - Checks, if new R-value data is available. If not, the update is postponed.
     * - Retrieves the XLSX file from RKI and tries to find the most recent R-value data.
     *   R-value data of the past 7 days is taken into account for the trend calculation.
     * - If no valid R-values were found, the update is aborted.
     * @param cachedData The current cached data.
     */
    async update(cachedData) {

        if (!cachedData) {
            Logger.info(`${VaccinationConnector.ID} Postponing update until cached data exists.`);
            return;
        }
        const cachedDataTimestamp = cachedData.country ? (cachedData.country.r_value_7_days_last_updated || 0) : 0
        const dataCheckResult = await Helpers.isNewDataAvailable(this.R_VALUE_URL, cachedDataTimestamp);

        if (!dataCheckResult.isMoreRecentDataAvailable) {
            Logger.info(`${VaccinationConnector.ID} No new data for R-Value available yet.`);
            return;
        }

        try {
            const csvString = await new Request(RValueConnector.R_VALUE_URL).loadString();
            const csvReport = Helpers.CSVToArray(csvString);

            const fetchedTimestamp = Date.now();
            const validRvalues = this.findValidRValues(csvReport);
            const rValue = validRvalues[validRvalues.length - 1];
            const rValueTrend = Helpers.computeTrend(validRvalues);

            // Validation
            if (!this.isDataValid(cachedData, rValue, rValueTrend, dataCheckResult)) {
                throw new Error(`${VaccinationConnector.ID} R-Value Plausi-Check failed`);
            }
            const updatedData = Helpers.copyDeep(cachedData);
            updatedData.country.r_value_7_days = rValue;
            updatedData.country.r_value_7_days_trend = rValueTrend;
            updatedData.country.r_value_7_days_last_updated = dataCheckResult.lastModified;
            updatedData.country.r_value_7_days_fetched_timestamp = fetchedTimestamp;

            return updatedData;
        } catch (err) {
            Logger.error(`${VaccinationConnector.ID} Could not update R-Values`);
            Logger.error(`${err}`)
            return;
        }
    }

    /**
     * Checks, if the R-value data and the calculated trend are valid.
     * The R-value must not be negative and the data retrieved by RKI must be more recent than the cached one.
     * @param cachedData The cached data.
     * @param rValue The most recent R-value.
     * @param rValueTrend The calculated trend for the R-value.
     * @param dataCheckResult Information about the freshness check of the retrieved RKI data.
     */
    isDataValid(cachedData, rValue, rValueTrend, dataCheckResult) {
        return rValue >= 0 &&
            !!rValueTrend &&
            dataCheckResult.lastModified >= 0 &&
            dataCheckResult.lastModified > (cachedData.country.r_value_7_days_last_updated || 0)
    }

    /**
     * Tries to find the R-values of the past 7 days within the XLSX data from RKI.
     * First, the index of the R-value column is searched. If found, the most recent
     * R-values are extracted and validated.
     * If the column does not exist or the R-values are invalid, an error is thrown.
     * @param rows The data rows of the XLSX file from the RKI API.
     */
    findValidRValues(rows) {
        if (!rows || !rows.length) {
            throw new Error("CSV read error / no rows detected");
        }

        let headerRowIndex;
        let rValueColumnIndex;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (!row || !row.length) {
                continue;
            }

            for (const colName of this.R_VALUE_HEADER_COLUMN_NAMES) {
                const index = row.indexOf(colName);

                if (index !== -1) {
                    headerRowIndex = i;
                    rValueColumnIndex = index;
                    break;
                }
            }

            if (typeof headerRowIndex !== "undefined" && typeof rValueColumnIndex !== "undefined") {
                break;
            }
        }
        const rValues = rows.slice(-7).map((row) => row[rValueColumnIndex]);

        if (!rValues || !rValues.length) {
            throw new Error("No R-values found");
        }
        const validRvalues = rValues.map(rValueString => {
            try {

                if (typeof rValueString === "string") {
                    return parseFloat(rValueString.replace(/,/g, "."));
                } else if (typeof rValueString === "number") {
                    return rValueString;
                } else {
                    return undefined;
                }
            } catch {
                return undefined;
            }
        }).filter((rValue) => {
            return rValue !== null && !isNaN(rValue) && isFinite(rValue) && rValue >= 0;
        });

        if (!validRvalues || !validRvalues.length) {
            throw new Error("No valid R-values found");
        }
        return validRvalues;
    }
}


// VACCINATION
export class VaccinationConnector {
    static VACCINATION_API = "https://https://rki-vaccination-data.vercel.app/api/v2";

    static async update(cachedData) {
        const apiData = new Request(VACCINATION_API).loadJSON();

        if (new Date(apiData.lastUpdate).getTime() <= new Date(cachedData.vaccination.last_updated).getTime()) {
            Logger.info("Vaccination Data is up to date. Skipping update.");
            return;
        }

        const stateData = apiData.data.filter(entry => entry.isState);
        const countryData = apiData.data.filter(entry => !entry.isState && entry.name.toLowerCase() === "deutschland")[0];

        if (!stateData || !stateData.length) {
            Logger.error("No state data for vaccination found.");
            return;
        }
        if (!countryData || !countryData.length) {
            Logger.error("No country data for vaccination found.");
            return;
        }

        for (const state of stateData) {
            const stateId = parseInt(state.rs);
            const vacc_cumulated = state.vaccinatedAtLeastOnce.doses || 0;
            const doesHistoricVaccinationDataExist = !!cachedData
                && !!cachedData.vaccination
                && !!cachedData.vaccination.states
                && !!cachedData.vaccination.states[stateId];

            let vaccCumulatedPreviousDay = doesHistoricVaccinationDataExist ? (cachedData.vaccination.states[stateId].vacc_cumulated || 0) : 0;

            // If data is from the same day, calculate the cumulated vaccinations by subtracting the latest increase.
            if (isSameDayAsCachedData) {
                vaccCumulatedPreviousDay = vaccCumulatedPreviousDay - (cachedData.vaccination.states[stateId].vacc_delta || 0);
            }
            const vacc_delta = state.vaccinatedAtLeastOnce.differenceToThePreviousDay || 0;
            const vacc_quote = state.vaccinatedAtLeastOnce.quote || 0;
            const vacc_quote_full = state.fullyVaccinated.quote || 0;

            vaccinationData.states[stateId].vacc_cumulated = vacc_cumulated;
            vaccinationData.states[stateId].vacc_delta = vacc_delta;
            vaccinationData.states[stateId].vacc_quote = vacc_quote;
            vaccinationData.states[stateId].vacc_quote_full = vacc_quote_full;
            vaccinationData.states[stateId].vacc_per_1000 = vacc_quote * 10;
        }

        // DE
        vaccinationData.country.vacc_cumulated = countryData.vaccinatedAtLeastOnce.doses || 0;
        vaccinationData.country.vacc_delta = countryData.vaccinatedAtLeastOnce.differenceToThePreviousDay || 0;
        vaccinationData.country.vacc_quote = countryData.vaccinatedAtLeastOnce.quote || 0;
        vaccinationData.country.vacc_quote_full = countryData.fullyVaccinated.quote || 0;
        vaccinationData.country.vacc_per_1000 = vaccinationData.country.vacc_quote * 10;

        return vaccinationData;
    }
}