/**
 * Data for a single district as provided by the RKI API.
 */
export interface RkiDistrict {
    OBJECTID: number;
    GEN: string;
    BEZ: string;
    EWZ: number;
    EWZ_BL: number;
    cases: number;
    deaths: number;
    cases_per_100k: number;
    cases_per_population: number;
    BL: string;
    BL_ID: string;
    county: string;
    last_update: string;
    cases7_per_100k: number;
    recovered: number;
    cases7_bl_per_100k: number;
}

/**
 * Data for a single district enriched with incidence history and trends
 * calculated by the corona server.
 */
export interface District extends RkiDistrict {
    cases_previous_day: number;
    deaths_previous_day: number;
    cases7_per_100k_history: number[];
    cases7_bl_per_100k_history: number[];
    cases7_per_100k_trend: PredictedTrend;
    cases7_bl_per_100k_trend: PredictedTrend;
}

export interface Country {
    cases: number;
    cases_previous_day: number;
    new_cases: number;
    new_cases_previous_day: number;
    cases7_de_per_100k: number;
    cases7_de_per_100k_history: number[];
    cases7_de_per_100k_trend: PredictedTrend;
    r_value_7_days: number;
    r_value_7_days_trend: PredictedTrend;
    r_value_7_days_last_updated: number;
    r_value_7_days_fetched_timestamp: number;
}

export interface VaccinationStats {
    vacc_cumulated: number;
    vacc_delta: number;
    vacc_per_1000: number;
    vacc_quote: number;
}

export interface VaccinationState extends VaccinationStats {
    name: string;
    BL_ID: string;
}

/**
 * The vaccination data of all states and the country.
 */
export interface VaccinationData {
    states: {
        [key: string]: VaccinationState;
    };
    country: VaccinationStats;
    last_updated: number;
    fetched_timestamp: number;
}

/**
 * The constructed vaccination data for a single state only.
 * This is part of the {@link CoronaResponse}.
 */
export interface SingleVaccinationData {
    state: VaccinationState;
    country: VaccinationStats;
    last_updated: number;
    fetched_timestamp: number;
}

export interface PredictedTrend {
    readonly slope: number;
    readonly predicted_value: number;
}

export interface Timestamps {
    rki_updated: number;
    rki_updated_date: string;
    fetched: string;
    fetched_timestamp: number;
}

/**
 * Structure of the internal cached data of the server.
 */
export interface CoronaData extends Timestamps {
    landkreise: District[];
    country: Country;
    vaccination: VaccinationData;
}

/**
 * The response from the corona server on requests to the base route.
 */
export interface CoronaResponse extends Timestamps {
    landkreis: District;
    country: Country;
    vaccination: SingleVaccinationData;
    version?: string;
}

/**
 * The response from requesting the RKI Corona Landkreis API
 */
export interface RkiResponse {
    features: {
        attributes: RkiDistrict
    }[]
}