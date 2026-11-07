import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileStorageService {
  private readonly uploadsRoot: string;

  constructor() {
    this.uploadsRoot = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(this.uploadsRoot)) {
      fs.mkdirSync(this.uploadsRoot, { recursive: true });
    }
  }

  private getExtension(fileName: string, mimeType?: string): string {
    const ext = path.extname(fileName);
    if (ext) return ext.toLowerCase();

    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
    };
    return mimeMap[mimeType || ''] || '';
  }

  private sanitizeFileName(fileName: string, mimeType?: string): string {
    const ext = this.getExtension(fileName, mimeType);
    let base = fileName || 'file';

    while (base.includes('.')) {
      base = base.substring(0, base.lastIndexOf('.'));
    }

    base = base.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 80) || 'file';
    return `${base}${ext}`;
  }

  private async saveBuffer(
    fileBuffer: Buffer,
    folder: string,
    fileName: string,
    mimeType?: string,
  ): Promise<string> {
    const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '_') || 'files';
    const cleanFileName = this.sanitizeFileName(fileName, mimeType);
    const folderPath = path.join(this.uploadsRoot, safeFolder);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    let finalName = cleanFileName;
    let dest = path.join(folderPath, finalName);
    if (fs.existsSync(dest)) {
      const ext = path.extname(cleanFileName);
      const base = path.basename(cleanFileName, ext);
      finalName = `${base}-${Date.now()}${ext}`;
      dest = path.join(folderPath, finalName);
    }

    await fs.promises.writeFile(dest, fileBuffer);
    return `/uploads/${safeFolder}/${encodeURIComponent(finalName)}`;
  }

  async uploadFile(
    fileBuffer: Buffer,
    folder: string,
    fileName: string,
  ): Promise<string> {
    try {
      return await this.saveBuffer(fileBuffer, folder, fileName);
    } catch (error) {
      console.error('Error saving file locally:', error);
      throw new Error('Failed to save file');
    }
  }

  async uploadImage(
    fileBuffer: Buffer,
    folder: string,
    fileName: string,
    mimeType = 'image/jpeg',
  ): Promise<string> {
    try {
      return await this.saveBuffer(fileBuffer, folder, fileName, mimeType);
    } catch (error) {
      console.error('Error saving image locally:', error);
      throw new Error('Failed to save image');
    }
  }

  async deleteFiles(fileUrls: string[]): Promise<void> {
    if (!fileUrls?.length) return;
    await Promise.all(fileUrls.map((url) => this.deleteSingleFile(url)));
  }

  async deleteSingleFile(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    try {
      const relativePath = this.extractLocalPathFromUrl(fileUrl);
      if (!relativePath) return;

      const filePath = path.join(this.uploadsRoot, ...relativePath.split('/'));
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(this.uploadsRoot))) return;

      if (fs.existsSync(resolved)) {
        await fs.promises.unlink(resolved);
      }
    } catch (error) {
      console.error(`Failed to delete local file ${fileUrl}:`, error);
    }
  }

  private extractLocalPathFromUrl(url: string): string | null {
    try {
      if (url.includes('res.cloudinary.com')) return null;

      const marker = '/uploads/';
      const index = url.indexOf(marker);
      if (index === -1) return null;

      const relative = decodeURIComponent(url.slice(index + marker.length));
      if (!relative || relative.includes('..')) return null;
      return relative;
    } catch (error) {
      console.error('Error extracting local path from URL:', error);
      return null;
    }
  }

  async uploadFileToCloudinary(
    folderName: string,
    localFilePath: string,
    fileName: string,
  ): Promise<string> {
    const buffer = await fs.promises.readFile(localFilePath);
    return this.saveBuffer(buffer, folderName, fileName);
  }
}
