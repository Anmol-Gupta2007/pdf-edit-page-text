// Global State
let uploadedFile = null; 
let originalFileName = "";
let totalPages = 0;
let currentTool = 'text'; // 'text' or 'whiteout'

// Toolbar States
let currentFont = 'Helvetica';
let isBold = false;
let isItalic = false;
let isUnderlined = false;

// UI Elements
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const chooseBtn = document.getElementById('choose-btn');
const pagesContainer = document.getElementById('pages-container');
const editorToolbar = document.getElementById('editor-toolbar');
const modal = document.getElementById('processing-modal');
const downloadBtn = document.getElementById('download-btn');

// Toolbar Elements
const toolTextBtn = document.getElementById('tool-text');
const toolWhiteoutBtn = document.getElementById('tool-whiteout');
const fontSelect = document.getElementById('font-family');
const btnBold = document.getElementById('btn-bold');
const btnItalic = document.getElementById('btn-italic');
const btnUnderline = document.getElementById('btn-underline');
const fontSizeInput = document.getElementById('font-size');
const colorInput = document.getElementById('text-color');

// --- Tool Selector Logic ---
toolTextBtn.addEventListener('click', () => {
    currentTool = 'text';
    toolTextBtn.classList.add('active');
    toolWhiteoutBtn.classList.remove('active');
});

toolWhiteoutBtn.addEventListener('click', () => {
    currentTool = 'whiteout';
    toolWhiteoutBtn.classList.add('active');
    toolTextBtn.classList.remove('active');
});

// --- Rich Text Styling Logic ---
fontSelect.addEventListener('change', (e) => { currentFont = e.target.value; });

btnBold.addEventListener('click', () => {
    isBold = !isBold;
    btnBold.classList.toggle('active');
});

btnItalic.addEventListener('click', () => {
    isItalic = !isItalic;
    btnItalic.classList.toggle('active');
});

btnUnderline.addEventListener('click', () => {
    isUnderlined = !isUnderlined;
    btnUnderline.classList.toggle('active');
});

// --- Helper: Download Function ---
function download(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- Uploading Logic ---
chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
    fileInput.value = ''; 
});

// --- Process File & Render ---
async function processFile(file) {
    if (file.type !== 'application/pdf') {
        alert("Please select a valid PDF file.");
        return;
    }

    modal.style.display = 'flex';
    uploadedFile = file;
    originalFileName = file.name.replace('.pdf', '');

    try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        totalPages = pdfDoc.getPageCount();

        await buildPageEditors();
        editorToolbar.style.display = 'block';

    } catch (error) {
        console.error("Error reading PDF:", error);
        alert("Could not process this PDF.");
    }
    
    modal.style.display = 'none';
}

async function buildPageEditors() {
    pagesContainer.innerHTML = '';

    const previewBuffer = await uploadedFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(previewBuffer) });
    const pdfViewerDoc = await loadingTask.promise;

    for (let i = 0; i < totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'page-container';
        
        card.innerHTML = `
            <div class="page-title">Page ${i + 1}</div>
            <div class="canvas-wrapper" id="wrapper-${i}">
                <canvas id="canvas-${i}" class="pdf-canvas"></canvas>
            </div>
        `;
        
        pagesContainer.appendChild(card);

        try {
            const page = await pdfViewerDoc.getPage(i + 1);
            const canvas = document.getElementById(`canvas-${i}`);
            const context = canvas.getContext('2d');
            
            const unscaledViewport = page.getViewport({ scale: 1 });
            // Scale massively to 900px height for extreme readability
            const scale = 900 / unscaledViewport.height; 
            const viewport = page.getViewport({ scale: scale });
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            const wrapper = document.getElementById(`wrapper-${i}`);
            wrapper.addEventListener('mousedown', (e) => handleCanvasClick(e, wrapper));

        } catch (err) {
            console.error("Error rendering preview", err);
        }
    }
}

// --- Spawn Text & Whiteout Elements ---
function handleCanvasClick(e, wrapper) {
    if (e.target !== wrapper && e.target.tagName !== 'CANVAS') return;

    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const elementContainer = document.createElement('div');
    elementContainer.className = 'overlay-element';
    
    // Offset slightly based on tool for better cursor placement
    if (currentTool === 'text') {
        elementContainer.style.left = `${x}px`;
        elementContainer.style.top = `${y - 15}px`; 
    } else {
        elementContainer.style.left = `${x}px`;
        elementContainer.style.top = `${y}px`;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.innerText = 'X';
    deleteBtn.className = 'delete-btn';
    deleteBtn.onclick = () => wrapper.removeChild(elementContainer);
    elementContainer.appendChild(deleteBtn);

    if (currentTool === 'text') {
        const textarea = document.createElement('textarea');
        textarea.className = 'text-overlay';
        
        // Apply current toolbar styles to the textarea
        textarea.style.fontFamily = currentFont === 'TimesRoman' ? '"Times New Roman", Times, serif' : 
                                    currentFont === 'Courier' ? '"Courier New", Courier, monospace' : 
                                    'Helvetica, Arial, sans-serif';
        textarea.style.fontSize = `${fontSizeInput.value}px`;
        textarea.style.color = colorInput.value;
        textarea.style.fontWeight = isBold ? 'bold' : 'normal';
        textarea.style.fontStyle = isItalic ? 'italic' : 'normal';
        textarea.style.textDecoration = isUnderlined ? 'underline' : 'none';
        
        // Store metadata for the PDF rendering step later
        textarea.dataset.fontFamily = currentFont;
        textarea.dataset.isBold = isBold;
        textarea.dataset.isItalic = isItalic;
        textarea.dataset.isUnderlined = isUnderlined;

        textarea.placeholder = "Type here...";
        elementContainer.appendChild(textarea);
        wrapper.appendChild(elementContainer);
        textarea.focus();
    } 
    else if (currentTool === 'whiteout') {
        const whitebox = document.createElement('div');
        whitebox.className = 'whiteout-overlay';
        elementContainer.appendChild(whitebox);
        wrapper.appendChild(elementContainer);
    }
}

// --- Helper: Map Styles to PDF-Lib Standard Fonts ---
function getPdfFont(pdfDoc, PDFLib, fontFamily, isBold, isItalic) {
    const { StandardFonts } = PDFLib;
    let fontEnum = StandardFonts.Helvetica;

    if (fontFamily === 'Helvetica') {
        if (isBold && isItalic) fontEnum = StandardFonts.HelveticaBoldOblique;
        else if (isBold) fontEnum = StandardFonts.HelveticaBold;
        else if (isItalic) fontEnum = StandardFonts.HelveticaOblique;
    } 
    else if (fontFamily === 'TimesRoman') {
        if (isBold && isItalic) fontEnum = StandardFonts.TimesRomanBoldItalic;
        else if (isBold) fontEnum = StandardFonts.TimesRomanBold;
        else if (isItalic) fontEnum = StandardFonts.TimesRomanItalic;
        else fontEnum = StandardFonts.TimesRoman;
    } 
    else if (fontFamily === 'Courier') {
        if (isBold && isItalic) fontEnum = StandardFonts.CourierBoldOblique;
        else if (isBold) fontEnum = StandardFonts.CourierBold;
        else if (isItalic) fontEnum = StandardFonts.CourierOblique;
        else fontEnum = StandardFonts.Courier;
    }

    return pdfDoc.embedFont(fontEnum);
}

// --- Process and Download Edited PDF ---
downloadBtn.addEventListener('click', async () => {
    if (!uploadedFile) return;
    modal.style.display = 'flex';

    try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const pdfWidth = page.getWidth();
            const pdfHeight = page.getHeight();
            
            const wrapper = document.getElementById(`wrapper-${i}`);
            const canvas = document.getElementById(`canvas-${i}`);
            const overlays = wrapper.querySelectorAll('.overlay-element');
            
            for (const overlay of overlays) {
                const domX = parseFloat(overlay.style.left);
                const domY = parseFloat(overlay.style.top);
                const domWidth = overlay.offsetWidth;
                const domHeight = overlay.offsetHeight;

                const scaleX = pdfWidth / canvas.offsetWidth;
                const scaleY = pdfHeight / canvas.offsetHeight;

                const pdfX = domX * scaleX;
                const pdfY = pdfHeight - (domY * scaleY) - (domHeight * scaleY);
                const finalPdfWidth = domWidth * scaleX;
                const finalPdfHeight = domHeight * scaleY;

                // 1. Process Whiteout Boxes
                const whitebox = overlay.querySelector('.whiteout-overlay');
                if (whitebox) {
                    page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: finalPdfWidth,
                        height: finalPdfHeight,
                        color: rgb(1, 1, 1), // Pure white
                    });
                }

                // 2. Process Text Boxes
                const textarea = overlay.querySelector('.text-overlay');
                if (textarea && textarea.value.trim() !== "") {
                    
                    const textContent = textarea.value;
                    const domFontSize = parseFloat(textarea.style.fontSize);
                    const pdfFontSize = domFontSize * scaleY * 0.75; 

                    // Extract color
                    const tempEl = document.createElement("div");
                    tempEl.style.color = textarea.style.color;
                    document.body.appendChild(tempEl);
                    const computedColor = window.getComputedStyle(tempEl).color;
                    document.body.removeChild(tempEl);
                    const rgbValues = computedColor.match(/\d+/g);
                    const r = parseInt(rgbValues[0]) / 255;
                    const g = parseInt(rgbValues[1]) / 255;
                    const b = parseInt(rgbValues[2]) / 255;

                    // Get embedded font based on styles
                    const isB = textarea.dataset.isBold === 'true';
                    const isI = textarea.dataset.isItalic === 'true';
                    const isU = textarea.dataset.isUnderlined === 'true';
                    const font = await getPdfFont(pdfDoc, PDFLib, textarea.dataset.fontFamily, isB, isI);

                    const drawY = pdfY + finalPdfHeight - pdfFontSize;

                    // Draw the text
                    page.drawText(textContent, {
                        x: pdfX + (2 * scaleX),
                        y: drawY,
                        size: pdfFontSize,
                        font: font,
                        color: rgb(r, g, b),
                        lineHeight: pdfFontSize * 1.2
                    });

                    // Draw Underline manually if requested
                    if (isU) {
                        const lines = textContent.split('\n');
                        let currentY = drawY;
                        
                        lines.forEach(line => {
                            const textWidth = font.widthOfTextAtSize(line, pdfFontSize);
                            page.drawLine({
                                start: { x: pdfX + (2 * scaleX), y: currentY - 2 },
                                end: { x: pdfX + (2 * scaleX) + textWidth, y: currentY - 2 },
                                thickness: pdfFontSize * 0.08,
                                color: rgb(r, g, b)
                            });
                            currentY -= (pdfFontSize * 1.2);
                        });
                    }
                }
            }
        }

        const newPdfBytes = await pdfDoc.save();
        download(newPdfBytes, `${originalFileName}_Edited.pdf`, "application/pdf");
        
    } catch (error) {
        console.error("Error editing PDF:", error);
        alert(`Failed to save edits. Error: ${error.message}`);
    }
    
    modal.style.display = 'none';
});
