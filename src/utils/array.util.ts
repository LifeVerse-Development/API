export class ArrayUtil {
    public static removeDuplicates<T>(array: T[]): T[] {
        return [...new Set(array)];
    }

    public static chunk<T>(array: T[], chunkSize: number): T[][] {
        if (chunkSize <= 0) throw new Error("Chunk size must be greater than 0");
        const result: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            result.push(array.slice(i, i + chunkSize));
        }
        return result;
    }

    public static shuffle<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    public static areEqual<T>(array1: T[], array2: T[]): boolean {
        if (array1.length !== array2.length) return false;
        const sorted1 = [...array1].sort();
        const sorted2 = [...array2].sort();
        return sorted1.every((val, index) => val === sorted2[index]);
    }

    public static removeItem<T>(array: T[], item: T): T[] {
        return array.filter(element => element !== item);
    }

    public static union<T>(...arrays: T[][]): T[] {
        return ArrayUtil.removeDuplicates(arrays.flat());
    }

    public static intersection<T>(array1: T[], array2: T[]): T[] {
        return array1.filter(value => array2.includes(value));
    }

    public static difference<T>(array1: T[], array2: T[]): T[] {
        return array1.filter(value => !array2.includes(value));
    }

    public static last<T>(array: T[]): T | undefined {
        return array.length > 0 ? array[array.length - 1] : undefined;
    }

    public static range(start: number, end: number, step: number = 1): number[] {
        if (step <= 0) throw new Error("Step must be greater than 0");
        const result: number[] = [];
        for (let i = start; i <= end; i += step) {
            result.push(i);
        }
        return result;
    }

    public static isEmpty<T>(array: (T | null | undefined | "")[]): boolean {
        return array.length === 0 || array.every(item => item === null || item === undefined || item === "");
    }
}