// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;
// Licence: Robert Koch-Institut (RKI), dl-de/by-2-0
const locationApi = (location) => `https://services7.arcgis.com/mOBPykOjAyBO2ZKk/arcgis/rest/services/RKI_Landkreisdaten/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,cases7_per_100k,cases7_bl_per_100k,cases,GEN,county,BL,last_update&geometry=${location.longitude.toFixed(3)}%2C${location.latitude.toFixed(3)}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelWithin&returnGeometry=false&outSR=4326&f=json`
const serverApi = (landkreisId) => `https://cdn.marcelrebmann.de/corona/?id=${landkreisId}`
const VACCINATION_IMG_URL = `https://cdn.marcelrebmann.de/img/vaccine-64.png`

/**
 * User specific configuration.
 * Change the parameters, as you prefer.
 * 
 * - isInfectionsWidgetCentered:
 *   Controls the content alignment of the "INF" widgetmode
 *   true -> The widget content is displayed centered
 *   false -> The widget content is displayed left aligned
 * 
 * - location_cache_filename:
 *   This specifies the file where the widget caches the last retrieved location data.
 *   This is only relevant, if the location is not fixed via widget parameters.
 */
const CONFIG = {
    isInfectionsWidgetCentered: true,
    location_cache_filename: "corona_location.txt",
    data_cache_filename: "corona_widget_data.txt",
    vaccination_image_filename: "vaccine-64.png"
}

const WIDGET_MODE = {
    INCIDENCE: "INCIDENCE",
    INFECTIONS: "INFECTIONS"
}

const WIDGET_SIZE_MEDIUM = "medium"
const INCIDENCE_YELLOW = 35
const INCIDENCE_RED = 50
const INCIDENCE_MAGENTA = 200
const COLOR_MAGENTA = new Color("#db0080")
const COLOR_DARK_BG = new Color("#1c1c1d")
const COLOR_VACCINATION = new Color("#2196f3")
const INCIDENCE_HEADER = `🦠 INZIDENZ`
const INFECTIONS_HEADER = `🦠 INFEKTIONEN`

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
    'Nordrhein-Westfalen': 'NRW',
    'Rheinland-Pfalz': 'RP',
    'Saarland': 'SL',
    'Sachsen': 'SN',
    'Sachsen-Anhalt': 'ST',
    'Schleswig-Holstein': 'SH',
    'Thüringen': 'TH'
}

class Cache {

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

    static async loadVaccinationImage() {
        if (Cache.fileManager.fileExists(Cache.vaccinationImageFilePath)) {
            return Cache.fileManager.readImage(Cache.vaccinationImageFilePath)
        }
        try {
            const image = await new Request(VACCINATION_IMG_URL).loadImage()
            Cache.fileManager.writeImage(Cache.vaccinationImageFilePath, image)
            return loadedImage
        } catch {
            console.log("[CACHE] could not load vaccination image")
            return;
        }
    }
}
Cache.init()

class Utils {

    static isNumericValue(number) {
        return number || number === 0
    }

    static shortFormatNumber(number) {
        if (number < 10000) {
            return `${number}`
        } else if (number < 1000000) {
            return `${number % 1000 >= 100 ? (number / 1000).toFixed(1) : Math.floor(number / 1000)}k`.replace(".", ",")
        } else {
            return `${number % 1000000 >= 100000 ? (number / 1000000).toFixed(1) : Math.floor(number / 1000000)}M`.replace(".", ",")
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
        if (!data || !data.rki_updated || !data.landkreis || !data.landkreis.cases7_per_100k_trend || !data.vaccination.last_updated) {
            return null
        }
        const last_updated = new Date(data.rki_updated)
            
        const vaccination_last_updated = new Date(data.vaccination.last_updated)

        last_updated.setDate(last_updated.getDate() + 1)
        last_updated.setHours(0)
        vaccination_last_updated.setDate(vaccination_last_updated.getDate() + 1)
        vaccination_last_updated.setHours(0)
        vaccination_last_updated.setMinutes(0)
        vaccination_last_updated.setSeconds(0)

        const moreRecent = Math.min(last_updated.getTime(), vaccination_last_updated.getTime())
        return moreRecent > Date.now() ? new Date(moreRecent) : null
    }
}

class UiHelpers {

    static getIncidenceColor(incidence) {
        if (incidence >= INCIDENCE_MAGENTA) {
            return COLOR_MAGENTA
        } else if (incidence >= INCIDENCE_RED) {
            return Color.red()
        } else if (incidence >= INCIDENCE_YELLOW) {
            return Color.orange()
        } else {
            return Color.green()
        }
    }

    static getInfectionTrend(slope) {
        if (slope >= 1) {
            return "▲"
        } else if (slope >= 0) {
            return "▶︎"
        } else if (slope < 0) {
            return "▼"
        } else {
            return "-"
        }
    }

    static getTrendColor(slope) {
        if (slope > 4) {
            return Color.red()
        } else if (slope >= 1) {
            return Color.orange()
        } else if (slope < 0) {
            return Color.green()
        } else {
            return Color.gray()
        }
    }

    static generateLandkreisName(data, customLandkreisName) {
        if (customLandkreisName) {
            return customLandkreisName
        }
        return data.landkreis.county.match(/^SK \w+$/) ? `${data.landkreis.GEN} (SK)` : data.landkreis.GEN
    }

    static generateDataState(data) {

        if (!data.rki_updated) {
            return `Stand: ${(data.landkreis.last_update || "").substr(0, 10)}`
        }
        const date = new Date(data.rki_updated)
        const day = date.getDate()
        const month = date.getMonth() + 1
        const year = date.getFullYear()
        return `Stand: ${day < 10 ? '0' : ''}${day}.${month < 10 ? '0' : ''}${month}.${year}`
    }

    static generateFooter(widget, incidence, predictedIncidenceSlope, labelText, isCentered) {
        const footer = widget.addStack()
        footer.layoutHorizontally()
        footer.useDefaultPadding()
        footer.centerAlignContent()

        if (isCentered) {
            footer.addSpacer()
        }

        const incidenceLabel = footer.addText(Utils.isNumericValue(incidence) ? `${incidence.toFixed(1).replace(".", ",")}` : "-")
        incidenceLabel.font = Font.boldSystemFont(12)
        incidenceLabel.textColor = UiHelpers.getIncidenceColor(incidence)

        const trendIconLabel = footer.addText(` ${UiHelpers.getInfectionTrend(predictedIncidenceSlope)}`)
        trendIconLabel.font = Font.systemFont(12)
        trendIconLabel.textColor = UiHelpers.getTrendColor(predictedIncidenceSlope)

        const label = footer.addText(labelText)
        label.font = Font.systemFont(12)
        label.textColor = Color.gray()

        if (isCentered) {
            footer.addSpacer()
        }
    }

    static generateVaccinationInfo(widget, vaccinationImage, vaccinationQuote, vaccinationDelta, lastUpdated, isCentered) {
        const vaccinationInfo = widget.addStack()
        vaccinationInfo.centerAlignContent()

        if (isCentered) {
            vaccinationInfo.addSpacer()
        }
    
        const vaccPercent = vaccinationInfo.addText(`${Utils.isNumericValue(vaccinationQuote) ? `${vaccinationQuote.toFixed(1).replace(".", ",")}` : "-"}% `)
        vaccPercent.font = Font.boldSystemFont(12)
        vaccPercent.textColor = COLOR_VACCINATION

        if (vaccinationImage) {
            const vaccIcon = vaccinationInfo.addImage(vaccinationImage)
            vaccIcon.imageSize = new Size(10, 10)
        }
    
        const vaccDelta = vaccinationInfo.addText(Utils.isNumericValue(vaccinationDelta) ? ` (+${Utils.shortFormatNumber(vaccinationDelta)})` : "")
        vaccDelta.font = Font.systemFont(12)
        vaccDelta.textColor = Color.gray()

        const dataTime = new Date(lastUpdated)
        dataTime.setDate(dataTime.getDate() + 1)
        dataTime.setHours(0)
        dataTime.setMinutes(0)
        dataTime.setSeconds(0)
        
        if (Date.now() > dataTime.getTime()) {
            vaccinationInfo.addText(" ")
            const icon = SFSymbol.named("exclamationmark.arrow.circlepath")
            const outdatedIndicator = vaccinationInfo.addImage(icon.image)
            outdatedIndicator.imageSize = new Size(12, 12)
            outdatedIndicator.tintColor = Color.gray()
        }
    
        if (isCentered) {
            vaccinationInfo.addSpacer()
        }
    }
}

async function loadData(location, isLocationFlexible) {
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

async function loadAbsoluteCases() {
    const data = await new Request(serverApi(1)).loadJSON()

    if (!data) {
        return null
    }
    return data
}

async function loadSavedLocation() {

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


async function loadLocation() {
    const lastKnownLocation = await loadSavedLocation()

    try {
        Location.setAccuracyToThreeKilometers()
        const location = await Location.current()

        if (!location) {
            throw "No data from fetching location"
        }

        if (!lastKnownLocation || location.latitude !== lastKnownLocation.latitude || location.longitude !== lastKnownLocation.longitude) {
            Cache.fileManager.writeString(Cache.locationCacheFilePath, JSON.stringify(location))
        }
        return location
    } catch {
        return {
            ...lastKnownLocation,
            isCached: true
        }
    }
}

const createIncidenceWidget = (widget, data, customLandkreisName, isLocationFlexible, isCached, isMediumSizedWidget, vaccinationImage) => {

    const headerStack = widget.addStack()
    headerStack.layoutHorizontally()
    headerStack.centerAlignContent()

    const header = headerStack.addText(INCIDENCE_HEADER)
    header.font = Font.mediumSystemFont(13)

    if (isLocationFlexible) {
        headerStack.addSpacer(isMediumSizedWidget ? 10 : null)
        const icon = SFSymbol.named(isCached ? "bolt.horizontal.circle" : "location")
        const flexibleLocationIndicator = headerStack.addImage(icon.image)
        flexibleLocationIndicator.imageSize = new Size(14, 14)
        flexibleLocationIndicator.tintColor = isCached ? Color.gray() : Color.blue()
    }
    widget.addSpacer()

    if (!data) {
        widget.addText("Keine Ergebnisse für den aktuellen Ort gefunden.")
        return;
    }

    const mainContent = widget.addStack()
    mainContent.layoutHorizontally()
    mainContent.useDefaultPadding()
    mainContent.centerAlignContent()

    const isLandkreisIncidenceToBeShortened = Utils.isNumericValue(data.landkreis.cases7_per_100k) && data.landkreis.cases7_per_100k >= 1000;
    const landkreisIncidence = data.landkreis.cases7_per_100k.toFixed(isLandkreisIncidenceToBeShortened ? 0 : 1)
    const incidenceLabel = mainContent.addText(Utils.isNumericValue(data.landkreis.cases7_per_100k) ? `${landkreisIncidence.replace(".", ",")}` : "-")
    incidenceLabel.font = Font.boldSystemFont(24)
    incidenceLabel.textColor = UiHelpers.getIncidenceColor(data.landkreis.cases7_per_100k)

    const landkreisTrendIconLabel = mainContent.addText(` ${UiHelpers.getInfectionTrend(data.landkreis.cases7_per_100k_trend.slope)}`)
    landkreisTrendIconLabel.font = Font.systemFont(14)
    landkreisTrendIconLabel.textColor = UiHelpers.getTrendColor(data.landkreis.cases7_per_100k_trend.slope)

    const casesLandkreisIncrease = Utils.isNumericValue(data.landkreis.cases) && Utils.isNumericValue(data.landkreis.cases_previous_day) ? data.landkreis.cases - data.landkreis.cases_previous_day : undefined
    const casesLandkreisLabel = mainContent.addText(` (${Utils.isNumericValue(casesLandkreisIncrease) ? `${casesLandkreisIncrease >= 0 ? "+" : ""}${casesLandkreisIncrease.toLocaleString()}` : "-"})`)
    casesLandkreisLabel.font = Font.systemFont(data.landkreis.cases7_per_100k >= 100 && Math.abs(casesLandkreisIncrease) >= 100 ? 10 : 14)
    casesLandkreisLabel.textColor = Color.gray()

    const landkreisNameLabel = widget.addText(UiHelpers.generateLandkreisName(data, customLandkreisName))
    landkreisNameLabel.minimumScaleFactor = 0.7

    widget.addSpacer()

    UiHelpers.generateFooter(widget, data.landkreis.cases7_bl_per_100k, data.landkreis.cases7_bl_per_100k_trend.slope, ` ${BUNDESLAENDER_SHORT[data.landkreis.BL]}`)
    UiHelpers.generateVaccinationInfo(
        widget, 
        vaccinationImage, 
        data.vaccination.state.vacc_quote, 
        data.vaccination.state.vacc_delta, 
        data.vaccination.last_updated,
        false)

    const stateInfo = widget.addText(UiHelpers.generateDataState(data))
    stateInfo.font = Font.systemFont(10)
    stateInfo.textColor = Color.gray()
}

const createInfectionsWidget = (widget, data, vaccinationImage) => {
    const headerLabel = widget.addText(INFECTIONS_HEADER)
    headerLabel.font = Font.mediumSystemFont(13)

    if (!data) {
        widget.addText("Keine Fallzahlen verfügbar.")
        return;
    }
    const countryData = data.country
    const infectionsDiff = countryData.new_cases - countryData.new_cases_previous_day

    widget.addSpacer()

    widget.addSpacer(1)

    const casesStack = widget.addStack()

    if (CONFIG.isInfectionsWidgetCentered) {
        casesStack.addSpacer()
    }
    const casesLabel = casesStack.addText(`${Utils.isNumericValue(countryData.new_cases) ? countryData.new_cases.toLocaleString() : "-"}`)
    casesLabel.font = Font.boldSystemFont(24)
    casesLabel.minimumScaleFactor = 0.8

    if (CONFIG.isInfectionsWidgetCentered) {
        casesStack.addSpacer()
    }

    const casesDifferenceStack = widget.addStack()

    if (CONFIG.isInfectionsWidgetCentered) {
        casesDifferenceStack.addSpacer()
    }
    const casesTrendIcon = casesDifferenceStack.addText(UiHelpers.getInfectionTrend(countryData.new_cases - countryData.new_cases_previous_day))
    casesTrendIcon.font = Font.systemFont(14)
    casesTrendIcon.textColor = UiHelpers.getTrendColor(infectionsDiff)

    const casesDiffLabel = casesDifferenceStack.addText(Utils.isNumericValue(infectionsDiff) ? ` (${infectionsDiff >= 0 ? '+' : ''}${infectionsDiff.toLocaleString()})` : "-")
    casesDiffLabel.font = Font.systemFont(14)
    casesDiffLabel.textColor = Color.gray()

    if (CONFIG.isInfectionsWidgetCentered) {
        casesDifferenceStack.addSpacer()
    }

    widget.addSpacer()

    const deTrendSlope = countryData.cases7_de_per_100k_trend ? countryData.cases7_de_per_100k_trend.slope : countryData.cases7_de_per_100k_trend
    UiHelpers.generateFooter(widget, countryData.cases7_de_per_100k, deTrendSlope, " DE", CONFIG.isInfectionsWidgetCentered)

    UiHelpers.generateVaccinationInfo(
        widget, 
        vaccinationImage, 
        data.vaccination.country.vacc_quote, 
        data.vaccination.country.vacc_delta, 
        data.vaccination.last_updated,
        CONFIG.isInfectionsWidgetCentered)

    widget.addSpacer(2)

    const stateInfo = widget.addStack()

    if (CONFIG.isInfectionsWidgetCentered) {
        stateInfo.addSpacer()
    }
    const updateLabel = stateInfo.addText(UiHelpers.generateDataState(data))
    updateLabel.font = Font.systemFont(10)
    updateLabel.textColor = Color.gray()

    if (CONFIG.isInfectionsWidgetCentered) {
        stateInfo.addSpacer()
    }
}

let widget = await createWidget(config.widgetFamily)

if (!config.runsInWidget) {
    await widget.presentMedium()
}

Script.setWidget(widget)
Script.complete()

async function createWidget(size) {
    const isMediumSizedWidget = size === WIDGET_SIZE_MEDIUM
    let location = {};
    let customLandkreisName;
    let widgetMode = WIDGET_MODE.INCIDENCE;

    const params = args.widgetParameter ? args.widgetParameter.split(",") : undefined
    // const params = ["49.89", "10.855"] // BA
    // const params = ["48.6406978", "9.1391464"] // Böblingen
    const widget = new ListWidget()
    widget.backgroundColor = Color.dynamic(Color.white(), COLOR_DARK_BG)

    if (!params) {
        location = await loadLocation()

        if (!location) {
            widget.addText("Standort konnte nicht ermittelt werden.")
            return widget
        }
    }

    if (params && params[0] === "INF") {
        widgetMode = WIDGET_MODE.INFECTIONS
    }

    if (params && params[0] !== "INF") {
        location = {
            latitude: parseFloat(params[0]),
            longitude: parseFloat(params[1])
        }
        customLandkreisName = params[2]
    }

    const isLocationFlexible = !params
    const vaccinationImage = await Cache.loadVaccinationImage()

    if (isMediumSizedWidget) {

        if (widgetMode === WIDGET_MODE.INFECTIONS) {
            const infectionData = await loadAbsoluteCases()
            createInfectionsWidget(widget, infectionData, vaccinationImage)
            if (infectionData) {
                widget.refreshAfterDate = Utils.getNextUpdate(infectionData)
            }
            return widget
        }
        const data = await loadData(location, isLocationFlexible)
        CONFIG.isInfectionsWidgetCentered = false
        const main = widget.addStack()
        const l = main.addStack()
        l.layoutVertically()
        createIncidenceWidget(l, data, customLandkreisName, isLocationFlexible, location.isCached, isMediumSizedWidget, vaccinationImage)
        main.addSpacer()
        main.addSpacer(40)
        main.addSpacer()
        const r = main.addStack()
        r.layoutVertically()
        createInfectionsWidget(r, data, vaccinationImage)

        if (data) {
            widget.refreshAfterDate = Utils.getNextUpdate(data)
        }
        return widget
    }

    switch (widgetMode) {
        case WIDGET_MODE.INCIDENCE:
            const data = await loadData(location, isLocationFlexible)
            createIncidenceWidget(widget, data, customLandkreisName, isLocationFlexible, location.isCached, isMediumSizedWidget, vaccinationImage)
            if (data) {
                widget.refreshAfterDate = Utils.getNextUpdate(data)
            }
            break;
        case WIDGET_MODE.INFECTIONS:
            const infectionData = await loadAbsoluteCases()
            createInfectionsWidget(widget, infectionData, vaccinationImage)
            if (infectionData) {
                widget.refreshAfterDate = Utils.getNextUpdate(infectionData)
            }
            break;
        default:
            widget.addText("Keine Daten.")
    }
    return widget
}