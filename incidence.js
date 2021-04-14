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
    serverUrl: "https://cdn.marcelrebmann.de/corona", // If self-hosted server is used, enter your server url here.
    location_cache_filename: "corona_location.txt", // Do not change
    data_cache_filename: "corona_widget_data.txt", // Do not change
    vaccination_image_filename: "vaccine-64.png", // Do not change
    showTrendCurves: false, // Show trend curves inside the bar charts. Experimental feature.
    showIncidenceStability: true, // Show stability estimation. If false, todays absolute new cases are displayed.
    debugMode: false // Log debug statements to console.
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
const INCIDENCE_STABILITY_LEVEL_3 = "<200";
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
    static rValueRow(root, rValue, rValueTrend, label = "", fontSize = 11) {
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
    static indicenceRow(root, incidence, indicenceTrend, label, fontSize = 11, showTrend = true, renderLabelAsSymbol = false) {
        const row = root.addStack()
        row.centerAlignContent()

        if (renderLabelAsSymbol) {
            const icon = SFSymbol.named(label)
            const labelIcon = row.addImage(icon.image)
            labelIcon.imageSize = new Size(7, 7)
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

    static stabilityLevelRow(root, incidenceHistory, fontSize = 11) {
        const row = root.addStack()
        row.centerAlignContent()

        const incidenceStabilityLevel = new IncidenceStabilityLevel(incidenceHistory)
        const labelIcon = row.addImage(SFSymbol.named(incidenceStabilityLevel.sfSymbolName).image)
        labelIcon.imageSize = new Size(9, 9)
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
            vaccIcon.imageSize = new Size(10, 10)
        }

        const vaccPercent = row1.addText(`${vaccImage ? " " : ""}${Utils.isNumericValue(vaccinationQuote) ? `${vaccinationQuote.toFixed(vaccinationQuote >= 10 ? 1 : 2).replace(".", COMMA_SEPARATOR)}` : "-"}%`)
        vaccPercent.font = Font.boldSystemFont(11)
        vaccPercent.textColor = COLOR_BLUE

        if (drawChart) {
            UiHelpers.drawProgressBar(row, vaccinationQuote)
        }

        const vaccDelta = row.addText(Utils.isNumericValue(vaccinationDelta) ? `+${Utils.shortFormatNumber(vaccinationDelta)}` : "")
        vaccDelta.font = Font.boldSystemFont(9)
        vaccDelta.textColor = COLOR_GREY

        const dataTime = new Date(dataTimestamp)
        dataTime.setDate(dataTime.getDate() + 1)
        dataTime.setHours(0)
        dataTime.setMinutes(0)
        dataTime.setSeconds(0)

        if (Date.now() > dataTime.getTime()) {
            const icon = SFSymbol.named("exclamationmark.arrow.triangle.2.circlepath")
            const outdatedIndicator = row1.addImage(icon.image)
            outdatedIndicator.imageSize = new Size(8, 8)
            outdatedIndicator.tintColor = COLOR_GREY
        }
    }

    /**
     * Generates a vertical row separator symbol.
     * The left and right space from the separator can be disabled, if needed.
     * @param {*} root The UI element to draw the chart into.
     * @param {*} fontSize The font size of the separator. Adjust this to match the size of the elements to separate.
     * @param {*} textColor The color of the separator.
     * @param {*} withSpace If true, a whitespace character will be added before and after the separator.
     */
    static rowSeparator(root, fontSize = 12, textColor = COLOR_GREY, withSpace = true) {
        const separator = root.addText(withSpace ? " | " : "|")
        separator.font = Font.systemFont(fontSize)
        separator.textColor = textColor
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
    static drawProgressBar(root, value, width = 44, height = 9, barHeight = 7, barCount = 10, barSpace = 2) {
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
    header.font = Font.mediumSystemFont(13)

    if (isLocationFlexible) {
        headerStack.addSpacer(APP_STATE.isMediumSize ? 10 : null)
        const icon = SFSymbol.named(isCached ? "bolt.horizontal.circle" : "location")
        const flexibleLocationIndicator = headerStack.addImage(icon.image)
        flexibleLocationIndicator.imageSize = new Size(14, 14)
        flexibleLocationIndicator.tintColor = isCached ? COLOR_GREY : COLOR_BLUE
    }

    if (!data) {
        widget.addSpacer()
        widget.addText("Aktueller Ort konnte nicht ermittelt werden.")
        return;
    }
    const stateInfo = widget.addText(UiHelpers.generateDataState(data))
    stateInfo.font = Font.systemFont(8)
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
    incidenceLabel.font = Font.boldSystemFont(24)
    incidenceLabel.minimumScaleFactor = 0.8
    incidenceLabel.textColor = UiHelpers.getIncidenceColor(data.landkreis.cases7_per_100k)

    const landkreisTrendIconLabel = incidenceRow.addText(` ${UiHelpers.getInfectionTrend(data.landkreis.cases7_per_100k_trend.slope)}`)
    landkreisTrendIconLabel.font = Font.systemFont(14)
    landkreisTrendIconLabel.textColor = UiHelpers.getTrendColor(data.landkreis.cases7_per_100k_trend.slope)

    incidenceRow.addSpacer()

    const chartStack = incidenceRow.addStack()
    chartStack.layoutVertically()

    UiHelpers.drawBarChart(chartStack, data.landkreis.cases7_per_100k_history, 12, 36)

    chartStack.addSpacer(1)

    if (CONFIG.showIncidenceStability) {
        UiHelpers.stabilityLevelRow(chartStack, data.landkreis.cases7_per_100k_history, 8)
    } else {
        // Absolute new cases
        const casesLandkreisIncrease = Utils.isNumericValue(data.landkreis.cases) && Utils.isNumericValue(data.landkreis.cases_previous_day) ? data.landkreis.cases - data.landkreis.cases_previous_day : undefined
        const casesLandkreisLabel = chartStack.addText(`${Utils.isNumericValue(casesLandkreisIncrease) ? `+${Math.max(casesLandkreisIncrease, 0).toLocaleString()}` : "-"}`)
        casesLandkreisLabel.font = Font.boldSystemFont(9)
        casesLandkreisLabel.textColor = COLOR_GREY
    }

    const landkreisNameLabel = content.addText(UiHelpers.generateLandkreisName(data, customLandkreisName))
    landkreisNameLabel.font = Font.mediumSystemFont(18)
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

    UiHelpers.drawBarChart(footerLeft, data.landkreis.cases7_bl_per_100k_history, 12, 50, 1.5)
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
    headerLabel.font = Font.mediumSystemFont(13)

    if (!data) {
        widget.addSpacer()
        widget.addText("Keine Fallzahlen verfügbar.")
        return;
    }
    const countryData = data.country
    const infectionsDiff = countryData.new_cases - countryData.new_cases_previous_day

    const stateInfo = widget.addText(UiHelpers.generateDataState(data))
    stateInfo.font = Font.systemFont(8)
    stateInfo.textColor = COLOR_GREY
    widget.addSpacer()

    const casesStack = widget.addStack()

    casesStack.addSpacer()

    const casesLabel = casesStack.addText(`${Utils.isNumericValue(countryData.new_cases) ? countryData.new_cases.toLocaleString() : "-"}`)
    casesLabel.font = Font.boldSystemFont(24)
    casesLabel.minimumScaleFactor = 0.8

    casesStack.addSpacer()

    const casesDifferenceStack = widget.addStack()

    casesDifferenceStack.addSpacer()

    const casesTrendIcon = casesDifferenceStack.addText(UiHelpers.getInfectionTrend(countryData.new_cases - countryData.new_cases_previous_day))
    casesTrendIcon.font = Font.systemFont(14)
    casesTrendIcon.textColor = UiHelpers.getTrendColor(infectionsDiff)

    const casesDiffLabel = casesDifferenceStack.addText(Utils.isNumericValue(infectionsDiff) ? ` (${infectionsDiff >= 0 ? '+' : ''}${infectionsDiff.toLocaleString()})` : "-")
    casesDiffLabel.font = Font.systemFont(14)
    casesDiffLabel.textColor = COLOR_GREY

    casesDifferenceStack.addSpacer()

    widget.addSpacer()

    const footer = widget.addStack()
    footer.centerAlignContent()

    const footerLeft = footer.addStack()
    footerLeft.layoutVertically()

    UiHelpers.rValueRow(footerLeft, countryData.r_value_7_days, countryData.r_value_7_days_trend, "R ", 10)
    UiHelpers.drawBarChart(footerLeft, countryData.cases7_de_per_100k_history, 12, 50, 1.5)
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