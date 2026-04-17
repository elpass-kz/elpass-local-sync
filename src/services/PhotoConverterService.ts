import fs from "fs";
import path from "path";

const PHOTOS_DIR = process.env.PHOTOS_DIR || "/app/photos";

export class PhotoConverterService {
  async fetchPhotoFromUrl(photoPath: string): Promise<Buffer> {
    const fullPath = path.join(PHOTOS_DIR, photoPath);
    console.log("Reading photo from:", fullPath);
    return fs.readFileSync(fullPath);
  }

  blobToBase64(buffer: Buffer): string {
    return buffer.toString("base64");
  }

  base64ToBlob(base64: string): Buffer {
    return Buffer.from(base64, "base64");
  }
}
