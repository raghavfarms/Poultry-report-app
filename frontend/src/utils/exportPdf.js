import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

/**
 * Robustly sanitizes modern CSS color functions (oklch, oklab, lab, lch)
 * within the cloned DOM before canvas rendering, as an extra safety measure.
 */
function sanitizeClonedDoc(clonedDoc) {
  if (!clonedDoc) return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const toRgb = (match) => {
    try {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = match.trim();
      return ctx.fillStyle || "#000000";
    } catch {
      return "#000000";
    }
  };

  const colorRegex = /(?:oklch|oklab|lab|lch)\([^()]*(\([^()]*\)[^()]*)*\)/gi;

  clonedDoc.querySelectorAll("style").forEach((styleEl) => {
    try {
      const text = styleEl.textContent || styleEl.innerHTML;
      if (text && colorRegex.test(text)) {
        styleEl.textContent = text.replace(colorRegex, toRgb);
      }
    } catch {}
  });

  clonedDoc.querySelectorAll("[style]").forEach((el) => {
    try {
      const s = el.getAttribute("style");
      if (s && colorRegex.test(s)) {
        el.setAttribute("style", s.replace(colorRegex, toRgb));
      }
    } catch {}
  });
}

/**
 * Exports an HTML element to a multi-page or single-page PDF cleanly
 * using html2canvas-pro (native oklch/modern CSS support) and jsPDF.
 */
export async function exportReportToPdf(element, options = {}) {
  const {
    filename = "report.pdf",
    orientation = "landscape",
    format = "a3",
    margin = 6,
  } = options;

  if (!element) return;

  // Add temporary PDF exporting class for print styles
  element.classList.add("pdf-exporting");

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: Math.max(element.scrollWidth, 1200),
      onclone: (clonedDoc) => {
        sanitizeClonedDoc(clonedDoc);
      },
    });

    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format,
    });

    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const printableWidth = pdfPageWidth - margin * 2;
    const printableHeight = pdfPageHeight - margin * 2;

    const imgWidth = printableWidth;
    const totalPdfHeight = (canvas.height * printableWidth) / canvas.width;

    if (totalPdfHeight <= printableHeight) {
      // Single page fits comfortably
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      pdf.addImage(imgData, "JPEG", margin, margin, imgWidth, totalPdfHeight);
    } else {
      // Long report: split across multiple pages
      const pxPageHeight = Math.floor(
        (printableHeight * canvas.width) / printableWidth
      );
      let yOffset = 0;
      let pageIndex = 0;

      while (yOffset < canvas.height) {
        const slicePxHeight = Math.min(pxPageHeight, canvas.height - yOffset);

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = slicePxHeight;
        const pageCtx = pageCanvas.getContext("2d");

        pageCtx.fillStyle = "#ffffff";
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(
          canvas,
          0,
          yOffset,
          canvas.width,
          slicePxHeight,
          0,
          0,
          canvas.width,
          slicePxHeight
        );

        if (pageIndex > 0) {
          pdf.addPage();
        }

        const slicePdfHeight = (slicePxHeight * printableWidth) / canvas.width;
        const sliceData = pageCanvas.toDataURL("image/jpeg", 0.98);
        pdf.addImage(
          sliceData,
          "JPEG",
          margin,
          margin,
          imgWidth,
          slicePdfHeight
        );

        yOffset += slicePxHeight;
        pageIndex++;
      }
    }

    pdf.save(filename);
  } finally {
    element.classList.remove("pdf-exporting");
  }
}
