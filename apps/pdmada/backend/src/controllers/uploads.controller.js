const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildResponse(subDir, filename) {
  return {
    filename,
    file_url: `/pdmada-api/api/uploads/files/${subDir}/${filename}`
  };
}

async function uploadLogo(req, res) {
  if (!req.file) return res.status(400).json({ message: 'File logo wajib diupload.' });
  return res.json(buildResponse('logos', req.file.filename));
}

async function uploadDocument(req, res) {
  if (!req.file) return res.status(400).json({ message: 'File dokumen wajib diupload.' });
  return res.json(buildResponse('documents', req.file.filename));
}

module.exports = {
  UPLOAD_ROOT,
  ensureDir,
  uploadLogo,
  uploadDocument
};
