export interface RkiHospitalizationReportBundesland {
    Datum: string; // is published with the current date
    Bundesland: string;
    Bundesland_Id: string;
    Altersgruppe: AgeGroup;
    "7T_Hospitalisierung_Faelle": string;
    "7T_Hospitalisierung_Inzidenz": string;
}

export enum AgeGroup {
    ALL = "00+",
    ZERO_TO_FOUR = "00-04",
    FIVE_TO_FOURTEEN = "05-14",
    FIFTEEN_TO_THIRTYFOUR = "15-34",
    THIRTYFIVE_TO_FIFTYNIE = "35-59",
    SIXTY_TO_SEVENTYNINE = "60-79",
    EIGHTY_AND_OVER = "80+"
}