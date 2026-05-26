const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  UPLOAD_ROOT,
  ensureDir,
  uploadLogo,
  uploadDocument
} = require('../controllers/uploads.controller');

const router = express.Router();

function createStorage(subDir) {
  const dirPath = path.join(UPLOAD_ROOT, subDir);
  ensureDir(dirPath);
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dirPath),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, safeName);
    }
  });
}

function logoFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/jpg'];
  if (!allowed.includes(String(file.mimetype || '').toLowerCase())) {
    return cb(new Error('Logo hanya boleh JPG/JPEG.'));
  }
  return cb(null, true);
}

function documentFilter(req, file, cb) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg'];
  if (!allowed.includes(String(file.mimetype || '').toLowerCase())) {
    return cb(new Error('Dokumen hanya boleh PDF/JPG/JPEG.'));
  }
  return cb(null, true);
}

const uploadLogoFile = multer({ storage: createStorage('logos'), fileFilter: logoFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadDocFile = multer({ storage: createStorage('documents'), fileFilter: documentFilter, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/logo', uploadLogoFile.single('file'), uploadLogo);
router.post('/document', uploadDocFile.single('file'), uploadDocument);

module.exports = router;
