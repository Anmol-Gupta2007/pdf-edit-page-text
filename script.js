// Global State
let uploadedFile = null; 
let originalFileName = "";
let totalPages = 0;
let currentTool = 'text'; // 'text' or 'whiteout'

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
const fontSizeInput = document.getElementById('font-size');
const colorInput = document.getElementById('text-color');

// --- Toolbar Logic ---
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

// --- Helper: Hex to RGB for PDF-Lib ---
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
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
        
        // The wrapper traps clicks to calculate exact X, Y coordinates
        card.innerHTML = `
            <div class="page-title">Page ${i + 1}</div>
            <div class="canvas-wrapper" id="wrapper-${i}">
                <canvas id="canvas-${i}" class="pdf-canvas"></canvas>
            </div>
        `;
        
        pagesContainer.appendChild(card);

        // Render PDF page onto canvas
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
            
            // Add click listener to spawn elements on this specific wrapper
            const wrapper = document.getElementById(`wrapper-${i}`);
            wrapper.addEventListener('mousedown', (e) => handleCanvasClick(e, wrapper));

        } catch (err) {
            console.error("Error rendering preview", err);
        }
    }
}

// --- Spawn Text/Whiteout Elements ---
function handleCanvasClick(e, wrapper) {
    // Ignore clicks if they clicked on an existing element (like a textarea)
    if (e.target !== wrapper && e.target.tagName !== 'CANVAS') return;

    // Calculate click coordinates relative to the top-left of the wrapper
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const elementContainer = document.createElement('div');
    elementContainer.className = 'overlay-element';
    elementContainer.style.left = `${x}px`;
    elementContainer.style.top = `${y}px`;

    const deleteBtn = document.createElement('button');
    deleteBtn.innerText = 'X';
    deleteBtn.className = 'delete-btn';
    deleteBtn.onclick = () => wrapper.removeChild(elementContainer);
    elementContainer.appendChild(deleteBtn);

    if (currentTool === 'text') {
        const textarea = document.createElement('textarea');
        textarea.className = 'text-overlay';
        textarea.style.fontSize = `${fontSizeInput.value}px`;
        textarea.style.color = colorInput.value;
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

// --- Process and Download Edited PDF ---
downloadBtn.addEventListener('click', async () => {
    if (!uploadedFile) return;
    modal.style.display = 'flex';

    try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        
        // Loop through all pages to gather overlay elements
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const pdfWidth = page.getWidth();
            const pdfHeight = page.getHeight();
            
            const wrapper = document.getElementById(`wrapper-${i}`);
            const canvas = document.getElementById(`canvas-${i}`);
            
            // Get all overlay elements placed on this page
            const overlays = wrapper.querySelectorAll('.overlay-element');
            
            overlays.forEach(overlay => {
                // Get the DOM position/size of the overlay
                const domX = parseFloat(overlay.style.left);
                const domY = parseFloat(overlay.style.top);
                const domWidth = overlay.offsetWidth;
                const domHeight = overlay.offsetHeight;

                // Map DOM coordinates to PDF coordinates
                // DOM (0,0) is top-left. PDF (0,0) is bottom-left.
                const scaleX = pdfWidth / canvas.offsetWidth;
                const scaleY = pdfHeight / canvas.offsetHeight;

                const pdfX = domX * scaleX;
                const pdfY = pdfHeight - (domY * scaleY) - (domHeight * scaleY); // Flip Y-axis
                const finalPdfWidth = domWidth * scaleX;
                const finalPdfHeight = domHeight * scaleY;

                // Is it Whiteout?
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

                // Is it Text?
                const textarea = overlay.querySelector('.text-overlay');
                if (textarea && textarea.value.trim() !== "") {
                    // Extract styles
                    const domFontSize = parseFloat(textarea.style.fontSize);
                    const hexColor = textarea.style.color; // DOM returns rgb(x, y, z) or hex
                    
                    // Simple hack to parse DOM color string back to RGB percentages
                    const tempEl = document.createElement("div");
                    tempEl.style.color = hexColor;
                    document.body.appendChild(tempEl);
                    const computedColor = window.getComputedStyle(tempEl).color;
                    document.body.removeChild(tempEl);
                    
                    const rgbValues = computedColor.match(/\d+/g);
                    const r = parseInt(rgbValues[0]) / 255;
                    const g = parseInt(rgbValues[1]) / 255;
                    const b = parseInt(rgbValues[2]) / 255;

                    // Convert font size (DOM pixels -> PDF points)
                    // It's a rough approximation based on the scale factor
                    const pdfFontSize = domFontSize * scaleY * 0.75; 

                    // We draw the text slightly inset from the top-left of the textarea box
                    page.drawText(textarea.value, {
                        x: pdfX + (2 * scaleX), // 2px padding offset
                        y: pdfY + finalPdfHeight - pdfFontSize, // Draw from top-down inside the box
                        size: pdfFontSize,
                        color: rgb(r, g, b),
                    });
                }
            });
        }

        const newPdfBytes = await pdfDoc.save();
        download(newPdfBytes, `${originalFileName}_Edited.pdf`, "application/pdf");
        
    } catch (error) {
        console.error("Error editing PDF:", error);
        alert(`Failed to save edits. Error: ${error.message}`);
    }
    
    modal.style.display = 'none';
});
