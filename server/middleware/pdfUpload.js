import multer from 'multer';

// One upload rule for every CV route: PDF only, checked by type AND by content (a renamed text file is refused).
// Errors are a 400 with both `message` and `error`, because older client code reads `error`.
export const NOT_PDF_MESSAGE = 'Only PDF files are accepted. Please upload your CV as a PDF.';

export const isPdfBuffer = (buffer) => Buffer.isBuffer(buffer) && buffer.subarray(0, 1024).includes('%PDF-');

const reject = (res, message, status = 400) => res.status(status).json({ success: false, message, error: message });

export const pdfUpload = (field, maxBytes = 10 * 1024 * 1024) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') return cb(null, true);
      const err = new Error(NOT_PDF_MESSAGE);
      err.code = 'NOT_PDF';
      return cb(err, false);
    },
  }).single(field);

  return (req, res, next) => upload(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') return reject(res, `The file is too large. The maximum is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      if (error.code === 'NOT_PDF') return reject(res, NOT_PDF_MESSAGE);
      return reject(res, 'The upload could not be read. Please try again.');
    }
    if (req.file && !isPdfBuffer(req.file.buffer)) return reject(res, NOT_PDF_MESSAGE);
    return next();
  });
};

export default pdfUpload;
