import fs from 'fs/promises';
import path from 'path';
import { decryptText, encryptText } from '../crypto';

type FileBlob = {
  name: string;
  contentBase64: string;
};

type SessionBlob = {
  files: FileBlob[];
};

export const serializeSessionDir = async (sessionDir: string): Promise<string> => {
  const files = await fs.readdir(sessionDir).catch(() => []);
  const payload: SessionBlob = { files: [] };

  for (const name of files) {
    const filePath = path.join(sessionDir, name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    const content = await fs.readFile(filePath);
    payload.files.push({
      name,
      contentBase64: content.toString('base64'),
    });
  }

  return encryptText(JSON.stringify(payload));
};

export const restoreSessionDirFromBlob = async (sessionDir: string, encryptedBlob: string): Promise<void> => {
  if (!encryptedBlob) return;

  const plain = decryptText(encryptedBlob);
  const parsed = JSON.parse(plain) as SessionBlob;
  await fs.mkdir(sessionDir, { recursive: true });

  for (const file of parsed.files || []) {
    const target = path.join(sessionDir, file.name);
    await fs.writeFile(target, Buffer.from(file.contentBase64, 'base64'));
  }
};

