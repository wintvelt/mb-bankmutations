// to clean up unneccessary foreign currency lines

// to get only foreign currency with name field filled
const CUR_KEY = 'Valuta';
const CUR_DEFAULT = 'EUR';
const NAME_KEY = 'Naam';

const AMOUNT_KEY = 'Net';
const BRUTO_KEY ='Bruto';
const KOSTEN_KEY ='Kosten';
const SALDO_KEY ='Saldo';
const DESC_KEY = 'Item Title'; // to store info about original currency

const sameKeys = [ 'Datum', 'Tijd', , 'Tijdzone', 'Factuurnummer' ]; // keys that should have same value as foreign currency line
const delKV = {key: 'Type', value: 'Algemeen valutaomrekening'}; // to identify lines to delete

// one line should have same currency + negative amount
// one line should have euro in same + or - as original


const cleanPaypal = (csv = [[]]) => {
    const headers = csv[0];
    const rows = csv.slice(1);
    // get all rows with foreign currency and name not empty
    // convert each into cleaned up row { ok, newRow, idsToDel }
    const cleanRows = rows.map((row) => {
        const newRowObj = makeCleanRow(row, headers, rows);
        return newRowObj;
    });

    // replace foreign currency rows
    let idsToDel = [];
    const newRows = cleanRows.map(rObj => {
        idsToDel = [...idsToDel, ...rObj.idsToDel];
        return rObj.newRow;
    });

    // delete conversion lines
    const filteredRows = newRows.filter((r,i) => {
        return (idsToDel.indexOf(i) === -1);
    })

    const newCsv = [headers, ...filteredRows];

    // return cleaned up version
    return newCsv;
}

const getCell = (row = [], headers, key) => {
    const i = headers.indexOf(key);
    if (i === -1) return '';
    return row[i];
}

// convert row into cleaned up row { ok, newRow, idsToDel }
const makeCleanRow = (row, headers, rows) => {
    const maybeReplace = (getCell(row, headers, CUR_KEY) !== CUR_DEFAULT)
        && (getCell(row, headers, NAME_KEY));

    if (!maybeReplace) return { ok: true, newRow: row, idsToDel: [] }

    // get all related rows (including original row) and save idx of rows to delete
    let idsToDel = [];
    const relatedRows = rows.filter((r,i) => {
        const isRelated = sameKeys.reduce((prevOut, key) => {
            return prevOut && 
             (getCell(row, headers, key) === getCell(r, headers, key))
        }, true);
        if (isRelated && getCell(r, headers, delKV.key) === delKV.value) idsToDel = [...idsToDel, i];
        return isRelated;
    });
    const curRows = relatedRows.filter(r => (getCell(r, headers, CUR_KEY) !== CUR_DEFAULT));
    // abort if not 2 rows, or signs in amount are not opposite (e.g. -10 and 10) then return error
    const amounts = curRows.map(r => getCell(r, headers, AMOUNT_KEY))
    if (!(amounts.length === 2 && zeroSum(amounts))) {
        return { ok: false, newRow: row, idsToDel: [],
            msg: 'not 2 opposite foreign currency lines' }
    }
    // abort if there are not 2 rows to delete
    if (idsToDel.length !== 2) {
        return { ok: false, newRow: row, idsToDel: [],
            msg: `got ${idsToDel.length} currency conversion lines, should be 2`}
    }
    // get the row with default currency amount
    const defaultCurRow = relatedRows.filter(r => {
        return (getCell(r, headers, CUR_KEY) === CUR_DEFAULT
            && getCell(r, headers, delKV.key) === delKV.value)
    })[0];
    const defaultCurAmount = getCell(defaultCurRow, headers, AMOUNT_KEY);
    const defaultCurBruto = getCell(defaultCurRow, headers, BRUTO_KEY)
    const defaultCurKosten = getCell(defaultCurRow, headers, KOSTEN_KEY)
    const defaultCurSaldo = getCell(defaultCurRow, headers, SALDO_KEY)
    
    // and replace this currency and value in original
    // get foreign currency amount
    // and add to description field
    const curIdx = headers.indexOf(CUR_KEY);
    const amountIdx = headers.indexOf(AMOUNT_KEY);
    const brutoIdx = headers.indexOf(BRUTO_KEY);
    const kostenIdx = headers.indexOf(KOSTEN_KEY);
    const saldoIdx = headers.indexOf(SALDO_KEY);
    const descIdx = headers.indexOf(DESC_KEY);
    const oldCur = getCell(row, headers, CUR_KEY);
    const oldAmount = getCell(row, headers, AMOUNT_KEY);
    const newDesc = row[descIdx]+` (was ${oldCur} ${oldAmount})`
    const newRow = row.map((c,i) => {
        if (i === curIdx) return CUR_DEFAULT;
        if (i === amountIdx) return defaultCurAmount;
        if (i === brutoIdx) return defaultCurBruto;
        if (i === kostenIdx) return defaultCurKosten;
        if (i === saldoIdx) return defaultCurSaldo;
        if (i === descIdx) return newDesc;
        return c
    })
    // return result
    return { ok: true, newRow, idsToDel }
}

const decomp = (str) => {
    return (str[0] === '-')?
        { abs: str.slice(1), pos:false}
        : { abs: str, pos: true }
}

const zeroSum = (arr) => {
    const first = decomp(arr[0]);
    const snd = decomp(arr[1]);
    return (first.str === snd.str && first.pos !== snd.pos)
}