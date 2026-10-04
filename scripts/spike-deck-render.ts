/**
 * Phase 14-01 spike: prove PDF page → PNG (local + Vercel) and exercise
 * PPTX → PDF via the candidate conversion backend.
 *
 * Not production code — plan 14-03 / 14-06 own the real modules.
 *
 * Usage: npx tsx scripts/spike-deck-render.ts
 */

import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "module";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function step(n: number, msg: string) {
  console.log(`[${n}] ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function canvasBinaryName(): string {
  try {
    const resolved = require.resolve("@napi-rs/canvas-darwin-arm64");
    if (resolved) return "@napi-rs/canvas-darwin-arm64";
  } catch {
    /* fall through */
  }
  const platform = process.platform;
  const arch = process.arch;
  const map: Record<string, string> = {
    "darwin-arm64": "@napi-rs/canvas-darwin-arm64",
    "darwin-x64": "@napi-rs/canvas-darwin-x64",
    "linux-x64": "@napi-rs/canvas-linux-x64-gnu",
    "linux-arm64": "@napi-rs/canvas-linux-arm64-gnu",
  };
  const key = `${platform}-${arch}`;
  try {
    const name = map[key] ?? `@napi-rs/canvas-${platform}-${arch}`;
    require.resolve(name);
    return name;
  } catch {
    return `unresolved (${platform}-${arch})`;
  }
}

/** Build a minimal valid 3-page PDF with text + filled rectangle per page. */
function buildTestPdf(): Uint8Array {
  const pages: string[] = [];
  const objects: string[] = [];

  // We'll assemble with correct offsets after building content.
  // Object numbers:
  // 1 Catalog, 2 Pages, 3-5 Page, 6-8 Contents, 9 Font
  const fontObj = 9;
  const pageObjs = [3, 4, 5];
  const contentObjs = [6, 7, 8];

  for (let i = 0; i < 3; i++) {
    const label = `Spike Page ${i + 1}`;
    const y = 700 - i * 40;
    // Text + stroked rectangle (avoid Path2D fill quirks seen with `re f`
    // on some @napi-rs/canvas + pdfjs-dist combos during the spike).
    const stream = [
      "0.15 0.35 0.55 RG",
      "2 w",
      "72 72 200 120 re S",
      "0 0 0 rg",
      "BT",
      `/F1 28 Tf`,
      `72 ${y} Td`,
      `(${label}) Tj`,
      "ET",
    ].join("\n");
    pages.push(stream);
  }

  objects[1] = `1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n`;
  objects[2] =
    `2 0 obj<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(" ")}] /Count 3 >>endobj\n`;
  objects[fontObj] =
    `${fontObj} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`;

  for (let i = 0; i < 3; i++) {
    const pageN = pageObjs[i];
    const contentN = contentObjs[i];
    const stream = pages[i];
    objects[contentN] =
      `${contentN} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`;
    objects[pageN] =
      `${pageN} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentN} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>endobj\n`;
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= fontObj; i++) {
    offsets[i] = Buffer.byteLength(body, "utf8");
    body += objects[i];
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  let xref = `xref\n0 ${fontObj + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= fontObj; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${fontObj + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "utf8"));
}

async function rasterizePdfPage(
  pdfBytes: Uint8Array,
  pageNumber: number,
  longEdgePx: number,
  /** When set, scale so width equals this instead of long-edge targeting. */
  targetWidthPx?: number
): Promise<{ png: Buffer; width: number; height: number; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Copy — pdfjs may transfer/detach the underlying ArrayBuffer.
  const data = Uint8Array.from(pdfBytes);
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  if (pageNumber < 1 || pageNumber > doc.numPages) {
    fail(`page ${pageNumber} out of range (doc has ${doc.numPages} pages)`);
  }
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidthPx
    ? targetWidthPx / base.width
    : longEdgePx / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const canvasContext = canvas.getContext("2d");
  const renderTask = page.render({
    canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  });
  await renderTask.promise;
  const png = Buffer.from(canvas.toBuffer("image/png"));
  await doc.destroy();
  return { png, width, height, pageCount: doc.numPages };
}

async function renderPageToPng(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  opts: { longEdgePx?: number; targetWidthPx?: number }
): Promise<{ png: Buffer; width: number; height: number }> {
  const base = page.getViewport({ scale: 1 });
  const scale = opts.targetWidthPx
    ? opts.targetWidthPx / base.width
    : (opts.longEdgePx ?? 1600) / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const canvasContext = canvas.getContext("2d");
  await page.render({
    canvasContext,
    viewport,
    canvas,
  }).promise;
  return { png: Buffer.from(canvas.toBuffer("image/png")), width, height };
}

async function section1PdfToPng(): Promise<void> {
  step(1, "Generate 3-page test PDF in-process (no external fixture)");
  const pdfBytes = buildTestPdf();
  console.log(`    PDF bytes: ${pdfBytes.length}`);
  console.log(`    PDF header: ${Buffer.from(pdfBytes.slice(0, 8)).toString("utf8")}`);

  step(2, "Import pdfjs-dist/legacy/build/pdf.mjs + @napi-rs/canvas; render page 1 @ ~1600px long edge");
  const binary = canvasBinaryName();
  console.log(`    @napi-rs/canvas platform binary: ${binary}`);
  console.log(`    process.platform/arch: ${process.platform}/${process.arch}`);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: Uint8Array.from(pdfBytes),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const page = await doc.getPage(1);
  const { png, width, height } = await renderPageToPng(page, { longEdgePx: 1600 });
  console.log(
    `    pageCount=${doc.numPages} rendered=${width}x${height} pngBytes=${png.length}`
  );

  if (png.length <= 5000) {
    fail(`PNG too small (${png.length} bytes) — blank/failed render`);
  }

  const outSlide = "/tmp/spike-slide-001.png";
  writeFileSync(outSlide, png);
  console.log(`    wrote ${outSlide}`);

  step(3, "Write 240px-wide thumbnail to prove two-resolution scheme");
  // Downscale from the full-res canvas rather than a second pdfjs render —
  // a second page.render on the same Node process segfaulted (@napi-rs/canvas).
  const thumbW = 240;
  const thumbH = Math.max(1, Math.round((height / width) * thumbW));
  const thumbCanvas = createCanvas(thumbW, thumbH);
  const thumbCtx = thumbCanvas.getContext("2d");
  const fullImg = await (await import("@napi-rs/canvas")).loadImage(png);
  thumbCtx.drawImage(fullImg, 0, 0, thumbW, thumbH);
  const thumbPng = Buffer.from(thumbCanvas.toBuffer("image/png"));
  const outThumb = "/tmp/spike-thumb-001.png";
  writeFileSync(outThumb, thumbPng);
  console.log(`    wrote ${outThumb} (${thumbPng.length} bytes, ${thumbW}x${thumbH})`);

  await doc.destroy().catch(() => undefined);

  step(4, "PDF → PNG section OK");
  console.log(`    sha256(slide)=${createHash("sha256").update(png).digest("hex").slice(0, 16)}…`);
}

/** Minimal valid 2-slide PPTX (OOXML) built with jszip. */
async function buildSpikePptx(outPath: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`
  );

  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  zip.folder("ppt")!.file(
    "presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId3"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  zip.folder("ppt")!.folder("_rels")!.file(
    "presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`
  );

  // Minimal theme (required by many LibreOffice builds)
  zip.folder("ppt")!.folder("theme")!.file(
    "theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Spike">
  <a:themeElements>
    <a:clrScheme name="Spike">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Spike">
      <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Spike">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
  );

  const slideMaster = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"
    accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;

  zip.folder("ppt")!.folder("slideMasters")!.file("slideMaster1.xml", slideMaster);
  zip.folder("ppt")!.folder("slideMasters")!.folder("_rels")!.file(
    "slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  );

  const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

  zip.folder("ppt")!.folder("slideLayouts")!.file("slideLayout1.xml", slideLayout);
  zip.folder("ppt")!.folder("slideLayouts")!.folder("_rels")!.file(
    "slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  function slideXml(title: string, bullet: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="274320"/><a:ext cx="8229600" cy="1143000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"/><a:t>${title}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="8229600" cy="4114800"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/><a:lstStyle/>
          <a:p>
            <a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>
            <a:r><a:rPr lang="en-US" sz="2000"/><a:t>${bullet}</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
  }

  const slideRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

  zip.folder("ppt")!.folder("slides")!.file(
    "slide1.xml",
    slideXml("Spike Deck Slide 1", "Proof that OOXML PPTX converts via the backend")
  );
  zip.folder("ppt")!.folder("slides")!.file(
    "slide2.xml",
    slideXml("Spike Deck Slide 2", "Second slide — page count must be 2")
  );
  zip.folder("ppt")!.folder("slides")!.folder("_rels")!.file("slide1.xml.rels", slideRel);
  zip.folder("ppt")!.folder("slides")!.folder("_rels")!.file("slide2.xml.rels", slideRel);

  mkdirSync(dirname(outPath), { recursive: true });
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(outPath, buf);
  console.log(`    wrote PPTX fixture ${outPath} (${buf.length} bytes)`);
}

async function section2PptxConvert(): Promise<void> {
  step(5, "Build minimal valid 2-slide PPTX fixture");
  const fixturePath = join(__dirname, "fixtures", "spike-deck.pptx");
  await buildSpikePptx(fixturePath);

  const url = process.env.DECK_CONVERT_URL;
  const token = process.env.DECK_CONVERT_TOKEN;

  if (!url) {
    console.log(
      "\n*** backend not provisioned — DECK_CONVERT_URL is not set.\n" +
        "    Task 3 checkpoint must resolve this (gotenberg | vercel-libreoffice | cloudconvert).\n" +
        "    Exiting 0 (not a failure; host has not been stood up yet).\n"
    );
    return;
  }

  step(6, `POST PPTX to ${url}/forms/libreoffice/convert (Gotenberg contract)`);
  const pptxBytes = readFileSync(fixturePath);
  const form = new FormData();
  form.append(
    "files",
    new Blob([pptxBytes], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    "spike-deck.pptx"
  );

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const t0 = Date.now();
  const res = await fetch(`${url.replace(/\/$/, "")}/forms/libreoffice/convert`, {
    method: "POST",
    headers,
    body: form,
  });
  const elapsedMs = Date.now() - t0;
  const body = Buffer.from(await res.arrayBuffer());
  console.log(`    status=${res.status} elapsedMs=${elapsedMs} bodyBytes=${body.length}`);

  if (res.status !== 200) {
    fail(`conversion HTTP ${res.status}: ${body.toString("utf8").slice(0, 400)}`);
  }
  if (body.slice(0, 5).toString("utf8") !== "%PDF-") {
    fail(`response is not a PDF (header=${body.slice(0, 8).toString("utf8")})`);
  }

  writeFileSync("/tmp/spike-converted.pptx.pdf", body);
  console.log("    wrote /tmp/spike-converted.pptx.pdf");

  step(7, "Rasterize converted PDF page 1");
  const { png, pageCount } = await rasterizePdfPage(new Uint8Array(body), 1, 1600);
  console.log(`    converted pageCount=${pageCount} pngBytes=${png.length}`);
  if (pageCount !== 2) {
    fail(`expected 2 pages from 2-slide fixture, got ${pageCount}`);
  }
  if (png.length <= 5000) {
    fail(`converted PNG too small (${png.length})`);
  }
  writeFileSync("/tmp/spike-converted-001.png", png);
  console.log(`    wrote /tmp/spike-converted-001.png`);
  console.log(`    conversion time: ${elapsedMs} ms`);
  if (elapsedMs > 45000) {
    console.warn(
      `    WARN: conversion exceeded 45s disqualifier threshold (${elapsedMs} ms)`
    );
  }
  step(8, "PPTX → PDF → PNG section OK");
}

async function main() {
  console.log("=== spike-deck-render (14-01) ===");
  await section1PdfToPng();
  await section2PptxConvert();
  console.log("=== DONE (exit 0) ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
