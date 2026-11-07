/** Calendar year (1–12) and month in Asia/Kolkata — Indian books / Tally ke liye. */
function getYearMonthIST(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  let year = 0;
  let month = 0;
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    if (p.type === 'month') month = Number(p.value);
  }
  return { year, month };
}

/** India FY: 1 Apr (year Y) – 31 Mar (year Y+1). e.g. May 2026 → Apr 2026–Mar 2027 → 20260401..20270331 */
export function getFinancialYearDates(): { fromDate: string; toDate: string } {
  const { year, month } = getYearMonthIST(new Date());
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;

  return {
    fromDate: `${fyStartYear}0401`,
    toDate: `${fyEndYear}0331`,
  };
}

// Function to generate XML with dynamic dates
export function getReceivableXml(
  fromDate?: string | null,
  toDate?: string | null,
): string {
  // Use provided dates or fallback to calculated financial year dates
  const dates =
    fromDate && toDate ? { fromDate, toDate } : getFinancialYearDates();

  return `
<ENVELOPE>
<HEADER>
<TALLYREQUEST>Export Data</TALLYREQUEST>
</HEADER>
<BODY>
<EXPORTDATA>
<REQUESTDESC>
<STATICVARIABLES>
<SVFROMDATE>${dates.fromDate}</SVFROMDATE>
<SVTODATE>${dates.toDate}</SVTODATE>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
</STATICVARIABLES>
<REPORTNAME>Rpt_TNX_ExpOutstandings</REPORTNAME>
</REQUESTDESC>
</EXPORTDATA>
</BODY>
</ENVELOPE>
 `;
}

export function getLedgerXml(
  fromDate?: string | null,
  toDate?: string | null,
): string {
  // Use provided dates or fallback to calculated financial year dates
  const dates =
    fromDate && toDate ? { fromDate, toDate } : getFinancialYearDates();

  return `
 <ENVELOPE>
<HEADER>
<TALLYREQUEST>Export Data</TALLYREQUEST>
</HEADER>
<BODY>
<EXPORTDATA>
<REQUESTDESC>
<STATICVARIABLES>
<SVFROMDATE>${dates.fromDate}</SVFROMDATE>
<SVTODATE>${dates.toDate}</SVTODATE>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<DBBILLEXPLODEFLAG>YES</DBBILLEXPLODEFLAG>
<EXPLODEVNUM>YES</EXPLODEVNUM>
<SHOWRUNBALANCE>Yes</SHOWRUNBALANCE>
</STATICVARIABLES>
<REPORTNAME>Rpt_TNX_ExpLedStat</REPORTNAME>
</REQUESTDESC>
</EXPORTDATA>
</BODY>
</ENVELOPE>
`;
}

// Default exports for backward compatibility (using calculated dates)
const { fromDate, toDate } = getFinancialYearDates();

export const receivable = getReceivableXml();
export const ledger = getLedgerXml();
