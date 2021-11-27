export class DateUtils {
    static isBefore(baseTimestamp: number, timestampToCheck: number): boolean {
        return timestampToCheck < baseTimestamp;
    }

	static isSameDay(timestamp1: number, timestamp2: number): boolean {
		const date1 = new Date(timestamp1);
		const date2 = new Date(timestamp2);

		return (
			date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate()
		);
	}

	static formatToReportDate(date: Date): string {
		return `${date.getFullYear()}-${this.withLeadingZero(
			date.getMonth() + 1
		)}-${this.withLeadingZero(date.getDate())}`;
	}

	static isTheDayAfter(baseTimestamp: number, timestampToCheck: number): boolean {
		const dayAfterBaseDate = new Date(baseTimestamp);
		dayAfterBaseDate.setDate(dayAfterBaseDate.getDate() + 1);
		const dateToCheck = new Date(timestampToCheck);
		return (
			dateToCheck.getFullYear() === dayAfterBaseDate.getFullYear() &&
			dateToCheck.getMonth() === dayAfterBaseDate.getMonth() &&
			dateToCheck.getDate() === dayAfterBaseDate.getDate()
		);
	}

    static getTomorrow(date: Date): Date {
        const tomorrowDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        return tomorrowDate;
    }

	private static withLeadingZero(value: number): string {
		return `${value < 10 ? "0" : ""}${value}`;
	}
}
