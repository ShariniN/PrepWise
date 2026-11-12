// Text of a PDF upload. Imports the library file itself: the package's index.js runs a debug block when it has
// no CommonJS parent (always the case from ESM) that reads ./test/data/05-versions-space.pdf from the cwd.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export const pdfText = async (buffer) => (await pdfParse(buffer)).text;
