const fs = require('fs');
const fsPromises = fs.promises;
const { constants: fsConstants } = fs;

const pathExists = async (targetPath) => {
  try {
    await fsPromises.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const ensureDir = (dirPath) => fsPromises.mkdir(dirPath, { recursive: true });

const readJsonFile = async (filePath) => {
  const content = await fsPromises.readFile(filePath, 'utf-8');
  const sanitized = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  return JSON.parse(sanitized);
};

const writeJsonFile = async (filePath, data) => {
  const tempPath = `${filePath}.tmp`;
  await fsPromises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fsPromises.rename(tempPath, filePath);
};

module.exports = {
  fs,
  fsPromises,
  fsConstants,
  pathExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
};
