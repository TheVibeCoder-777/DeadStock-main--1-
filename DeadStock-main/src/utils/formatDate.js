/**
 * Format any date value to DD-MM-YYYY format.
 * Handles: Excel serial numbers, ISO strings (YYYY-MM-DD), Date objects, and numeric strings.
 * Returns '-' for null/undefined/empty values.
 */
export const formatDate = (val) => {
    if (!val && val !== 0) return '-';

    const str = String(val).trim();
    if (!str) return '-';

    // If it's a pure number (Excel serial date)
    if (typeof val === 'number' || /^\d+$/.test(str)) {
        const num = Number(str);
        if (num > 10000 && num < 100000) {
            // Excel serial date: days since 1900-01-01 (with Excel's off-by-one quirk)
            const date = new Date((num - 25569) * 86400 * 1000);
            const dd = String(date.getUTCDate()).padStart(2, '0');
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = date.getUTCFullYear();
            return `${dd}-${mm}-${yyyy}`;
        }
    }

    // Try parsing as a date string (ISO, etc.)
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        const dd = String(parsed.getDate()).padStart(2, '0');
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const yyyy = parsed.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    // If nothing works, return the string as-is
    return str;
};
