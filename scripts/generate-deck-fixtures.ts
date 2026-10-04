/**
 * One-shot generator for scripts/fixtures used by verify-deck-intake.ts.
 * Run: npx tsx scripts/generate-deck-fixtures.ts
 *
 * PDFs are built with pdf-lib (classic xref, no object streams) so pdf2json
 * can read them. PPTX is a minimal OOXML package via jszip.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

const FIXTURES = join(process.cwd(), "scripts/fixtures");

async function buildPdf(
  pages: Array<{
    width: number;
    height: number;
    lines: string[];
    rect?: { x: number; y: number; w: number; h: number };
  }>
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const pageSpec of pages) {
    const page = doc.addPage([pageSpec.width, pageSpec.height]);

    if (pageSpec.rect) {
      const { x, y, w, h } = pageSpec.rect;

      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(0.8, 0.8, 0.8),
      });
    }

    let y = pageSpec.height - 72;

    for (const line of pageSpec.lines) {
      page.drawText(line, {
        x: 72,
        y,
        size: 18,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 28;
    }
  }

  const bytes = await doc.save({ useObjectStreams: false });

  return Buffer.from(bytes);
}

async function buildSpikePptx(): Promise<Buffer> {
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
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`
  );

  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  );

  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
  );

  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  const slideXml = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:t>${title}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:t>${body}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slideXml("Spike Deck Title", "Opening bullet about the product"));
  zip.file("ppt/slides/slide2.xml", slideXml("Market Opportunity", "Second slide body text"));

  const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

  zip.file("ppt/slides/_rels/slide1.xml.rels", slideRels);
  zip.file("ppt/slides/_rels/slide2.xml.rels", slideRels);

  return zip.generateAsync({ type: "nodebuffer" });
}

async function main() {
  mkdirSync(FIXTURES, { recursive: true });

  writeFileSync(
    join(FIXTURES, "deck-landscape.pdf"),
    await buildPdf([
      { width: 792, height: 612, lines: ["Landscape page one", "Investor pitch overview"] },
      { width: 792, height: 612, lines: ["Landscape page two", "Traction metrics"] },
      { width: 792, height: 612, lines: ["Landscape page three", "The ask"] },
    ])
  );

  writeFileSync(
    join(FIXTURES, "deck-portrait.pdf"),
    await buildPdf([
      { width: 612, height: 792, lines: ["Portrait page one", "Still a valid deck"] },
      { width: 612, height: 792, lines: ["Portrait page two", "Must be accepted"] },
    ])
  );

  writeFileSync(
    join(FIXTURES, "deck-one-slide.pdf"),
    await buildPdf([{ width: 792, height: 612, lines: ["Single slide deck", "One page only"] }])
  );

  writeFileSync(
    join(FIXTURES, "deck-image-only.pdf"),
    await buildPdf([
      { width: 792, height: 612, lines: ["Image-only fixture page one"] },
      {
        width: 792,
        height: 612,
        lines: [],
        rect: { x: 100, y: 150, w: 400, h: 250 },
      },
      { width: 792, height: 612, lines: ["Image-only fixture page three"] },
    ])
  );

  writeFileSync(join(FIXTURES, "not-a-deck.txt"), "this is plain text, not a deck\n");
  writeFileSync(
    join(FIXTURES, "fake.pdf"),
    Buffer.from("%PDF-1.4\nthis is not a real PDF body\n%%EOF\n", "utf8")
  );

  const notPptx = new JSZip();

  notPptx.file("readme.txt", "just a zip, no ppt/slides");
  writeFileSync(join(FIXTURES, "not-pptx.zip"), await notPptx.generateAsync({ type: "nodebuffer" }));

  writeFileSync(join(FIXTURES, "deck-two-slide.pptx"), await buildSpikePptx());

  console.log("Wrote fixtures to", FIXTURES);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
