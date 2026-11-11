import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { DOEReport, ReportCategory } from '../types/doe';
import { REGION_ORDER } from './officeUtils';
import { calculateReportTotalSections } from './doeUtils';
import { getEmbeddedGoogleFontsCSS } from './posterExport';
import { formatThaiDateShort } from './thaiDate';

function escapeXml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getCategoryValue(report: DOEReport, catId: string): number {
  if (catId === 'section59') return Number(report.section59) || 0;
  if (catId === 'section62') return Number(report.section62) || 0;
  if (catId === 'section63_1') return Number(report.section63_1) || 0;
  if (catId === 'section63_2') return Number(report.section63_2) || 0;
  if (catId === 'section64') return Number(report.section64) || 0;
  if (catId === 'mouGroup') {
    return Number(report.mouGroup) || Number(report.customCategoryValues?.['mouGroup']) || 0;
  }
  if (catId === 'modifyDetails') return Number(report.modifyDetails) || 0;
  if (catId === 'substituteCard') return Number(report.substituteCard) || 0;
  return Number(report.customCategoryValues?.[catId]) || 0;
}

export interface ExecutiveExportParams {
  reports: DOEReport[];
  allDateFilteredReports: DOEReport[];
  periodLabel: string;
  scopeLabel: string;
  categories: ReportCategory[];
}

/**
 * สร้างไฟล์ Excel สรุปผลผู้บริหารแบบหลายแท็บ (Multi-Sheet Workbook .xls)
 * ประกอบด้วย:
 *   แท็บ 1: สรุปผลรายภูมิภาค (พร้อมยอดรวมย่อยรายภาค + ยอดรวมทั้งประเทศ)
 *   แท็บ 2: รายละเอียดรายศูนย์บริการ (เรียงตามภาคและจังหวัด พร้อมครบทุกกลุ่มมาตรา)
 *   แท็บ 3: สรุปแนวโน้มรายวัน (เปรียบเทียบคิวนัดหมาย ออกบัตรสำเร็จ ไม่มาตามนัด รายวัน)
 */
export function downloadExecutiveExcelReport({
  reports,
  allDateFilteredReports,
  periodLabel,
  scopeLabel,
  categories,
}: ExecutiveExportParams): void {
  const activeCats = categories.filter((c) => c.isActive);

  // 1. Aggregate by Region for Sheet 1
  const regionDisplayList = [
    'กรุงเทพมหานคร',
    'ภาคกลางและตะวันตก',
    'ภาคตะวันออก',
    'ภาคตะวันออกเฉียงเหนือ',
    'ภาคเหนือ',
    'ภาคใต้',
    'เฉพาะกิจ',
  ];

  interface RegionAgg {
    region: string;
    reportCount: number;
    officeSet: Set<string>;
    queue: number;
    issued: number;
    verified: number;
    missed: number;
    wrongDate: number;
    notIssued: number;
    catSums: Record<string, number>;
  }

  const regMap = new Map<string, RegionAgg>();
  regionDisplayList.forEach((reg) => {
    regMap.set(reg, {
      region: reg,
      reportCount: 0,
      officeSet: new Set(),
      queue: 0,
      issued: 0,
      verified: 0,
      missed: 0,
      wrongDate: 0,
      notIssued: 0,
      catSums: {},
    });
  });

  reports.forEach((r) => {
    const isSpec = r.region === 'เฉพาะกิจ' || (r.centerName || '').includes('เฉพาะกิจ');
    const regKey = isSpec ? 'เฉพาะกิจ' : r.region || 'อื่นๆ';
    if (!regMap.has(regKey)) {
      regMap.set(regKey, {
        region: regKey,
        reportCount: 0,
        officeSet: new Set(),
        queue: 0,
        issued: 0,
        verified: 0,
        missed: 0,
        wrongDate: 0,
        notIssued: 0,
        catSums: {},
      });
    }
    const agg = regMap.get(regKey)!;
    agg.reportCount += 1;
    agg.officeSet.add(`${regKey}:${r.officeId || r.id}`);
    agg.queue += Number(r.queueAppointment) || 0;
    const grpSum = calculateReportTotalSections(r, activeCats);
    agg.issued += Math.max(Number(r.cardsIssued) || 0, grpSum);
    agg.verified += Number(r.identityVerified) || 0;
    agg.missed += Number(r.missedAppointment) || 0;
    agg.wrongDate += Number(r.wrongAppointmentDate) || 0;
    agg.notIssued += Number(r.cardsNotIssued) || 0;
    activeCats.forEach((c) => {
      agg.catSums[c.id] = (agg.catSums[c.id] || 0) + getCategoryValue(r, c.id);
    });
  });

  const activeRegionRows = Array.from(regMap.values()).filter((a) => a.reportCount > 0);

  let grandCount = 0;
  let grandOffices = 0;
  let grandQueue = 0;
  let grandIssued = 0;
  let grandVerified = 0;
  let grandMissed = 0;
  let grandWrongDate = 0;
  let grandNotIssued = 0;
  const grandCatSums: Record<string, number> = {};

  activeRegionRows.forEach((a) => {
    grandCount += a.reportCount;
    grandOffices += a.officeSet.size;
    grandQueue += a.queue;
    grandIssued += a.issued;
    grandVerified += a.verified;
    grandMissed += a.missed;
    grandWrongDate += a.wrongDate;
    grandNotIssued += a.notIssued;
    activeCats.forEach((c) => {
      grandCatSums[c.id] = (grandCatSums[c.id] || 0) + (a.catSums[c.id] || 0);
    });
  });

  const grandSuccessPct = grandQueue > 0 ? ((grandIssued / grandQueue) * 100).toFixed(1) : '0.0';

  // Build Sheet 1 XML rows
  const sheet1TotalCols = 9 + activeCats.length;
  const sheet1RowsXml: string[] = [];

  sheet1RowsXml.push(`
    <Row ss:Height="28">
      <Cell ss:MergeAcross="${sheet1TotalCols - 1}" ss:StyleID="TitleCell">
        <Data ss:Type="String">วิเคราะห์ข้อมูลและรายงานสรุปผลการปฏิบัติงาน — ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว กรมการจัดหางาน</Data>
      </Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="${sheet1TotalCols - 1}" ss:StyleID="SubTitleCell">
        <Data ss:Type="String">${escapeXml(periodLabel)} | ขอบเขต: ${escapeXml(scopeLabel)} | รายงานรวม ${grandCount.toLocaleString()} รายการ</Data>
      </Cell>
    </Row>
    <Row ss:Height="10"/>
    <Row ss:Height="26">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ภูมิภาค / ประเภทศูนย์</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">จำนวนแห่ง</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">จำนวนรายงาน</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">คิวนัดหมาย (คิว)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ออกบัตรสำเร็จ (ใบ)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">อัตราสำเร็จ (%)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ไม่มาตามนัด (คน)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">มาไม่ตรงวันนัด (คน)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">บัตรเสีย (ใบ)</Data></Cell>
      ${activeCats
        .map(
          (c) =>
            `<Cell ss:StyleID="HeaderCell"><Data ss:Type="String">${escapeXml(
              c.code ? `${c.code} ${c.title}` : c.title
            )}</Data></Cell>`
        )
        .join('')}
    </Row>
  `);

  activeRegionRows.forEach((a) => {
    const pct = a.queue > 0 ? Number(((a.issued / a.queue) * 100).toFixed(1)) : 0;
    sheet1RowsXml.push(`
      <Row ss:Height="22">
        <Cell ss:StyleID="TextCellBold"><Data ss:Type="String">${escapeXml(
          a.region === 'เฉพาะกิจ'
            ? 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ'
            : a.region
        )}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${a.officeSet.size}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${a.reportCount}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${a.queue}</Data></Cell>
        <Cell ss:StyleID="NumCellSuccess"><Data ss:Type="Number">${a.issued}</Data></Cell>
        <Cell ss:StyleID="PctCell"><Data ss:Type="Number">${pct}</Data></Cell>
        <Cell ss:StyleID="NumCellAlert"><Data ss:Type="Number">${a.missed}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${a.wrongDate}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${a.notIssued}</Data></Cell>
        ${activeCats
          .map(
            (c) =>
              `<Cell ss:StyleID="NumCell"><Data ss:Type="Number">${a.catSums[c.id] || 0}</Data></Cell>`
          )
          .join('')}
      </Row>
    `);
  });

  sheet1RowsXml.push(`
    <Row ss:Height="25">
      <Cell ss:StyleID="TotalLabelCell"><Data ss:Type="String">รวมทั้งสิ้น</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandOffices}</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandCount}</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandQueue}</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandIssued}</Data></Cell>
      <Cell ss:StyleID="TotalPctCell"><Data ss:Type="Number">${Number(grandSuccessPct)}</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandMissed}</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandWrongDate}</Data></Cell>
      <Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${grandNotIssued}</Data></Cell>
      ${activeCats
        .map(
          (c) =>
            `<Cell ss:StyleID="TotalNumCell"><Data ss:Type="Number">${
              grandCatSums[c.id] || 0
            }</Data></Cell>`
        )
        .join('')}
    </Row>
  `);

  // 2. Build Sheet 2: Detailed Office / Center Rows (sorted by Date DESC, then Region, then Office Name)
  const sortedDetailReports = [...reports].sort((a, b) => {
    const dCmp = (b.reportDate || '').localeCompare(a.reportDate || '');
    if (dCmp !== 0) return dCmp;
    const regIdxA = REGION_ORDER.indexOf((a.region || '') as (typeof REGION_ORDER)[number]);
    const regIdxB = REGION_ORDER.indexOf((b.region || '') as (typeof REGION_ORDER)[number]);
    if (regIdxA !== regIdxB && regIdxA !== -1 && regIdxB !== -1) return regIdxA - regIdxB;
    return (a.officeName || '').localeCompare(b.officeName || '', 'th');
  });

  const sheet2TotalCols = 12 + activeCats.length;
  const sheet2RowsXml: string[] = [];
  sheet2RowsXml.push(`
    <Row ss:Height="26">
      <Cell ss:MergeAcross="${sheet2TotalCols - 1}" ss:StyleID="TitleCell">
        <Data ss:Type="String">รายละเอียดผลการปฏิบัติงานรายสำนักงาน / ศูนย์บริการ (${escapeXml(periodLabel)})</Data>
      </Cell>
    </Row>
    <Row ss:Height="25">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ลำดับ</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">วันที่รายงาน</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ภูมิภาค</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">สำนักงานจัดหางาน</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ชื่อศูนย์บริการ</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">คิวนัดหมาย</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ออกบัตรสำเร็จ</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">อัตราสำเร็จ (%)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ไม่มาตามนัด</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">มาไม่ตรงวันนัด</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">บัตรเสีย</Data></Cell>
      ${activeCats
        .map(
          (c) =>
            `<Cell ss:StyleID="HeaderCell"><Data ss:Type="String">${escapeXml(
              c.code ? `${c.code} ${c.title}` : c.title
            )}</Data></Cell>`
        )
        .join('')}
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">หมายเหตุ / ปัญหาอุปสรรค</Data></Cell>
    </Row>
  `);

  sortedDetailReports.forEach((r, idx) => {
    const q = Number(r.queueAppointment) || 0;
    const grpSum = calculateReportTotalSections(r, activeCats);
    const iss = Math.max(Number(r.cardsIssued) || 0, grpSum);
    const pct = q > 0 ? Number(((iss / q) * 100).toFixed(1)) : 0;
    sheet2RowsXml.push(`
      <Row ss:Height="21">
        <Cell ss:StyleID="NumCellCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
        <Cell ss:StyleID="TextCellCenter"><Data ss:Type="String">${escapeXml(
          formatThaiDateShort(r.reportDate)
        )}</Data></Cell>
        <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(r.region)}</Data></Cell>
        <Cell ss:StyleID="TextCellBold"><Data ss:Type="String">${escapeXml(r.officeName)}</Data></Cell>
        <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(r.centerName)}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${q}</Data></Cell>
        <Cell ss:StyleID="NumCellSuccess"><Data ss:Type="Number">${iss}</Data></Cell>
        <Cell ss:StyleID="PctCell"><Data ss:Type="Number">${pct}</Data></Cell>
        <Cell ss:StyleID="NumCellAlert"><Data ss:Type="Number">${Number(r.missedAppointment) || 0}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${Number(r.wrongAppointmentDate) || 0}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${Number(r.cardsNotIssued) || 0}</Data></Cell>
        ${activeCats
          .map(
            (c) =>
              `<Cell ss:StyleID="NumCell"><Data ss:Type="Number">${getCategoryValue(
                r,
                c.id
              )}</Data></Cell>`
          )
          .join('')}
        <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(r.notes || '')}</Data></Cell>
      </Row>
    `);
  });

  // 3. Build Sheet 3: Daily Trend Summary (from allDateFilteredReports sorted newest first)
  const dailyMap = new Map<
    string,
    { count: number; queue: number; issued: number; missed: number; wrongDate: number; notIssued: number }
  >();
  allDateFilteredReports.forEach((r) => {
    const d = r.reportDate || '';
    if (!d) return;
    const prev = dailyMap.get(d) || {
      count: 0,
      queue: 0,
      issued: 0,
      missed: 0,
      wrongDate: 0,
      notIssued: 0,
    };
    const grpSum = calculateReportTotalSections(r, activeCats);
    prev.count += 1;
    prev.queue += Number(r.queueAppointment) || 0;
    prev.issued += Math.max(Number(r.cardsIssued) || 0, grpSum);
    prev.missed += Number(r.missedAppointment) || 0;
    prev.wrongDate += Number(r.wrongAppointmentDate) || 0;
    prev.notIssued += Number(r.cardsNotIssued) || 0;
    dailyMap.set(d, prev);
  });

  const sortedDailyEntries = Array.from(dailyMap.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  );

  const sheet3RowsXml: string[] = [];
  sheet3RowsXml.push(`
    <Row ss:Height="26">
      <Cell ss:MergeAcross="7" ss:StyleID="TitleCell">
        <Data ss:Type="String">สรุปแนวโน้มผลการปฏิบัติงานรายวัน (เรียงวันที่ล่าสุดอยู่บนสุด)</Data>
      </Cell>
    </Row>
    <Row ss:Height="24">
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">วันที่ (YYYY-MM-DD)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">วันที่รายงาน (พ.ศ.)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">จำนวนรายงาน (แห่ง)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">คิวนัดหมาย (คิว)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ออกบัตรสำเร็จ (ใบ)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">อัตราสำเร็จ (%)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">ไม่มาตามนัด (คน)</Data></Cell>
      <Cell ss:StyleID="HeaderCell"><Data ss:Type="String">บัตรเสีย (ใบ)</Data></Cell>
    </Row>
  `);

  sortedDailyEntries.forEach(([dateKey, dStat]) => {
    const pct = dStat.queue > 0 ? Number(((dStat.issued / dStat.queue) * 100).toFixed(1)) : 0;
    sheet3RowsXml.push(`
      <Row ss:Height="21">
        <Cell ss:StyleID="TextCellCenter"><Data ss:Type="String">${escapeXml(dateKey)}</Data></Cell>
        <Cell ss:StyleID="TextCellBold"><Data ss:Type="String">${escapeXml(
          formatThaiDateShort(dateKey)
        )}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${dStat.count}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${dStat.queue}</Data></Cell>
        <Cell ss:StyleID="NumCellSuccess"><Data ss:Type="Number">${dStat.issued}</Data></Cell>
        <Cell ss:StyleID="PctCell"><Data ss:Type="Number">${pct}</Data></Cell>
        <Cell ss:StyleID="NumCellAlert"><Data ss:Type="Number">${dStat.missed}</Data></Cell>
        <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${dStat.notIssued}</Data></Cell>
      </Row>
    `);
  });

  const xmlWorkbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="TitleCell">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Sarabun" ss:Size="13" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F2856" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SubTitleCell">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Sarabun" ss:Size="10" ss:Bold="1" ss:Color="#1E3A8A"/>
      <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="HeaderCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TextCell">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="TextCellBold">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="TextCellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="NumCell">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="NumCellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="NumCellSuccess">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Bold="1" ss:Color="#047857"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="NumCellAlert">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Color="#BE123C"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="PctCell">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <NumberFormat ss:Format="0.0"/>
    </Style>
    <Style ss:ID="TotalLabelCell">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F2856"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F2856"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Bold="1" ss:Color="#0F2856"/>
      <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TotalNumCell">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F2856"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F2856"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Bold="1" ss:Color="#0F2856"/>
      <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="TotalPctCell">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F2856"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F2856"/>
      </Borders>
      <Font ss:FontName="Sarabun" ss:Size="11" ss:Bold="1" ss:Color="#0F2856"/>
      <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.0"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="1_สรุปผลรายภูมิภาค">
    <Table>
      <Column ss:Width="220"/>
      <Column ss:Width="85"/>
      <Column ss:Width="90"/>
      <Column ss:Width="115"/>
      <Column ss:Width="115"/>
      <Column ss:Width="95"/>
      <Column ss:Width="105"/>
      <Column ss:Width="105"/>
      <Column ss:Width="95"/>
      ${activeCats.map(() => '<Column ss:Width="110"/>').join('')}
      ${sheet1RowsXml.join('')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="2_รายละเอียดรายศูนย์">
    <Table>
      <Column ss:Width="50"/>
      <Column ss:Width="95"/>
      <Column ss:Width="135"/>
      <Column ss:Width="200"/>
      <Column ss:Width="250"/>
      <Column ss:Width="95"/>
      <Column ss:Width="95"/>
      <Column ss:Width="90"/>
      <Column ss:Width="95"/>
      <Column ss:Width="95"/>
      <Column ss:Width="85"/>
      ${activeCats.map(() => '<Column ss:Width="105"/>').join('')}
      <Column ss:Width="240"/>
      ${sheet2RowsXml.join('')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="3_แนวโน้มรายวัน">
    <Table>
      <Column ss:Width="110"/>
      <Column ss:Width="130"/>
      <Column ss:Width="110"/>
      <Column ss:Width="115"/>
      <Column ss:Width="115"/>
      <Column ss:Width="95"/>
      <Column ss:Width="110"/>
      <Column ss:Width="95"/>
      ${sheet3RowsXml.join('')}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob(['\uFEFF' + xmlWorkbook], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `วิเคราะห์ข้อมูลและรายงานสรุป_DOE_${dateStamp}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * สร้างและดาวน์โหลดไฟล์รายงานสรุปผู้บริหารรูปแบบ A4 PDF ความละเอียดสูง (.pdf)
 * รองรับการทำงานทั้งบนหน้าเว็บปกติและภายใน iframe sandbox โดยจัดวางแต่ละส่วนลงหน้า A4 แบบไม่ตัดครึ่งตาราง
 */
export async function downloadExecutivePdfReport(containerEl: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  const fontEmbedCSS = await getEmbeddedGoogleFontsCSS();

  const outerShell = document.createElement('div');
  outerShell.style.position = 'fixed';
  outerShell.style.left = '0';
  outerShell.style.top = '0';
  outerShell.style.width = '0';
  outerShell.style.height = '0';
  outerShell.style.overflow = 'hidden';
  outerShell.style.pointerEvents = 'none';
  outerShell.style.zIndex = '-1';

  const stage = document.createElement('div');
  stage.style.width = '1080px';
  stage.style.background = '#ffffff';
  stage.style.padding = '0';
  stage.style.color = '#0f172a';

  const clone = containerEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, [data-no-print]').forEach((el) => el.remove());
  clone.querySelectorAll('.overflow-x-auto').forEach((el) => {
    (el as HTMLElement).style.overflow = 'visible';
  });
  clone.querySelectorAll('[data-pdf-kpi-grid]').forEach((el) => {
    const gridEl = el as HTMLElement;
    gridEl.style.display = 'grid';
    gridEl.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    gridEl.style.gap = '16px';
  });

  stage.appendChild(clone);
  outerShell.appendChild(stage);
  document.body.appendChild(outerShell);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const blockNodes = Array.from(clone.querySelectorAll('[data-pdf-block]')) as HTMLElement[];
    const targets = blockNodes.length > 0 ? blockNodes : [clone];

    const capturedBlocks: { dataUrl: string; widthPx: number; heightPx: number }[] = [];

    for (const block of targets) {
      const widthPx = Math.max(block.offsetWidth || 1080, block.scrollWidth || 1080);
      const heightPx = Math.max(block.offsetHeight || 60, block.scrollHeight || 60);
      if (heightPx <= 4) continue;

      let dataUrl: string;
      try {
        dataUrl = await toPng(block, {
          cacheBust: true,
          pixelRatio: 2,
          width: widthPx,
          height: heightPx,
          backgroundColor: '#ffffff',
          style: {
            width: `${widthPx}px`,
            minWidth: `${widthPx}px`,
            maxWidth: `${widthPx}px`,
            margin: '0',
          },
          ...(fontEmbedCSS ? { fontEmbedCSS, skipFonts: false } : { skipFonts: true }),
        });
      } catch {
        dataUrl = await toPng(block, {
          cacheBust: false,
          pixelRatio: 1.6,
          width: widthPx,
          height: heightPx,
          backgroundColor: '#ffffff',
          skipFonts: true,
        });
      }

      capturedBlocks.push({ dataUrl, widthPx, heightPx });
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const marginX = 9;
    const marginTop = 9;
    const marginBottom = 10;
    const maxContentWidthMm = pageWidthMm - marginX * 2;
    const maxContentHeightMm = pageHeightMm - marginTop - marginBottom;
    const gapMm = 3.5;

    let cursorY = marginTop;

    capturedBlocks.forEach((item, index) => {
      let renderW = maxContentWidthMm;
      let renderH = (item.heightPx / item.widthPx) * renderW;

      if (renderH > maxContentHeightMm) {
        const scale = maxContentHeightMm / renderH;
        renderH = maxContentHeightMm;
        renderW = renderW * scale;
      }

      if (index > 0 && cursorY + renderH > pageHeightMm - marginBottom) {
        pdf.addPage();
        cursorY = marginTop;
      }

      const offsetX = marginX + (maxContentWidthMm - renderW) / 2;
      pdf.addImage(item.dataUrl, 'PNG', offsetX, cursorY, renderW, renderH, undefined, 'FAST');
      cursorY += renderH + gapMm;
    });

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = blobUrl;
    link.download = `วิเคราะห์ข้อมูลและรายงานสรุป_DOE_${dateStamp}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } finally {
    if (outerShell.parentNode) {
      outerShell.parentNode.removeChild(outerShell);
    }
  }
}
