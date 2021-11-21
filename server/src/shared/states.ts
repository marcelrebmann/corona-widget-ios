export class States {
    static readonly STATE_LIST: { [key: number]: string } = {
        1: "Schleswig-Holstein",
        2: "Hamburg",
        3: "Niedersachsen",
        4: "Bremen",
        5: "Nordrhein-Westfalen",
        6: "Hessen",
        7: "Rheinland-Pfalz",
        8: "Baden-Württemberg",
        9: "Bayern",
        10: "Saarland",
        11: "Berlin",
        12: "Brandenburg",
        13: "Mecklenburg-Vorpommern",
        14: "Sachsen",
        15: "Sachsen-Anhalt",
        16: "Thüringen",
      };
    static readonly STATE_NAMES = Object.values(this.STATE_LIST);
}