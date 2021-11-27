import { CoronaData } from "./../interfaces/data.interfaces.js";

/**
 * Specifies the connector execution frequency.
 * Connectors with type REGULAR are not executed as often as those
 * with type FREQUENT.
 */
export enum ConnectorUpdateType {
    REGULAR,
    FREQUENT
}

export abstract class Connector {
    private id: NonNullable<string>;
    private type: NonNullable<ConnectorUpdateType>;

    constructor(id: string, type: ConnectorUpdateType = ConnectorUpdateType.REGULAR) {
        if (!id) {
            throw new Error("Could not create connector! Missing ID or update type.")
        }
        this.id = id;
        this.type = type;
    }

    public getId(): string {
        return this.id;
    }
    public getType(): ConnectorUpdateType {
        return this.type;
    }
    public abstract update(cachedData: CoronaData): Promise<CoronaData>;
}