# Test Files Directory

This directory contains example files for testing document parsing functionality in the graph-llm application.

## Available Test Files

### Text-Based Formats (Included)

- ✅ **example.html** - Sample HTML document with various elements
- ✅ **example.txt** - Plain text file with multiple lines and special characters
- ✅ **example.md** - Markdown file with formatting, code blocks, and tables
- ✅ **example.json** - JSON file with nested objects and arrays
- ✅ **example.csv** - CSV file with sample data

### Binary Formats (Need to be created)

For binary formats (PDF, DOCX, XLSX, PPTX), you'll need to create sample files yourself. Here are suggestions:

#### PDF (.pdf)
Create a simple PDF file with text content. You can:
- Use any PDF editor (Adobe Acrobat, PDFtk, etc.)
- Generate one programmatically
- Download a sample from the internet
- Use an online PDF generator

**Suggested content for PDF test file:**
- Title: "Sample PDF Document"
- Multiple paragraphs of text
- Headings and sections
- Lists and bullet points

#### DOCX (.docx)
Create a Word document. You can:
- Use Microsoft Word
- Use Google Docs and export as DOCX
- Use LibreOffice Writer

**Suggested content for DOCX test file:**
- Title: "Sample DOCX Document"
- Headings (H1, H2, H3)
- Multiple paragraphs
- Bulleted and numbered lists
- A simple table

#### XLSX (.xlsx)
Create an Excel spreadsheet. You can:
- Use Microsoft Excel
- Use Google Sheets and export as XLSX
- Use LibreOffice Calc

**Suggested content for XLSX test file:**
- Multiple columns (Name, Email, Age, Department, Active)
- Multiple rows of sample data
- Multiple sheets (Sheet1, Sheet2)
- Some formulas (optional)

#### PPTX (.pptx)
Create a PowerPoint presentation. You can:
- Use Microsoft PowerPoint
- Use Google Slides and export as PPTX
- Use LibreOffice Impress

**Suggested content for PPTX test file:**
- Multiple slides
- Slide 1: Title slide with "Sample PPTX Document"
- Slide 2: Bullet points
- Slide 3: Text and image placeholder
- Slide 4: Table or chart

## How to Test

1. Start the application (frontend and backend)
2. Drag and drop any of these files onto the graph canvas
3. Verify that:
   - The correct DocumentNode is created
   - The appropriate icon is displayed
   - The filename is truncated correctly
   - The document content is parsed and stored correctly

## Expected Behavior

- **Text files** (.txt, .md, .json, .csv) → Should be parsed directly
- **HTML files** → Should extract text content, removing scripts/styles
- **PDF files** → Should extract text using PDF.js (client) or pdf-parse (server fallback)
- **DOCX files** → Should extract text using mammoth
- **XLSX files** → Should convert to CSV format
- **PPTX files** → Should extract slide text (primarily server-side)

## Notes

- Binary files (PDF, DOCX, XLSX, PPTX) will fall back to server-side parsing if client-side parsing fails
- Large files may take longer to parse
- Some complex PDFs (scanned documents) may require OCR (not currently implemented)
