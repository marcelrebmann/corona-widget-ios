export class DateUtils {

    static isSameDay(timestamp1: number, timestamp2: number): boolean {
        const date1 = new Date(timestamp1);
        const date2 = new Date(timestamp2);

        return date1.getFullYear() === date2.getFullYear()
            && date1.getMonth() === date2.getMonth()
            && date1.getDate() === date2.getDate();
    }
}