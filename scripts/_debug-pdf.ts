import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function bytes() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([792, 612]);

  page.drawText("Hello from pdf-lib", {
    x: 72,
    y: 500,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function parseWith(label: string, PDFParser: any, buf: Buffer) {
  const pdfParser = new PDFParser();

  return new Promise((resolve) => {
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      console.log(label, "ERR", String(errData?.parserError || errData).slice(0, 100));
      resolve(null);
    });
    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      console.log(label, "OK pages", pdfData.Pages.length);
      resolve(pdfData);
    });
    pdfParser.parseBuffer(buf);
  });
}

async function main() {
  const buf = await bytes();

  const PDFParser1 = (await import("pdf2json")).default;

  await parseWith("fresh", PDFParser1, buf);

  await import("../lib/deck/pptx-extract");
  const PDFParser2 = (await import("pdf2json")).default;

  await parseWith("after-pptx", PDFParser2, buf);

  const { extractPerPageText } = await import("../lib/deck/pdf-extract");

  try {
    console.log("our extract", await extractPerPageText(buf));
  } catch (e: any) {
    console.log("our extract FAIL", e.message);
  }

  // Identical inline copy of our extract logic
  const PDFParser3 = (await import("pdf2json")).default;
  const pdfParser = new PDFParser3();

  await new Promise((resolve) => {
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      console.log("inline ERR", String(errData?.parserError || errData).slice(0, 100));
      resolve(null);
    });
    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      const pages: string[] = [];

      pdfData.Pages.forEach((page: any) => {
        let pageText = "";

        page.Texts.forEach((text: any) => {
          text.R.forEach((run: any) => {
            pageText += decodeURIComponent(run.T);
          });
        });
        pages.push(pageText.trim());
      });
      console.log("inline OK", pages);
      resolve(pages);
    });
    pdfParser.parseBuffer(buf);
  });
}

main();
