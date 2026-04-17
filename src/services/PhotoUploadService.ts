import fs from "fs";
import path from "path";

const PHOTOS_DIR = process.env.PHOTOS_DIR || "/app/photos";

export interface PhotoUploadResult {
  success: boolean;
  photoPath?: string;
  photoUrl?: string;
  error?: string;
}

export class PhotoUploadService {
  async uploadPhoto(
    file: Express.Multer.File,
    subFolder: string,
    cardNo: string | number,
  ): Promise<PhotoUploadResult> {
    try {
      const filename = `${cardNo}.jpg`;
      const photoPath = `${subFolder}/${filename}`;
      const fullDir = path.join(PHOTOS_DIR, subFolder);
      const fullPath = path.join(fullDir, filename);

      if (!fs.existsSync(fullDir)) {
        fs.mkdirSync(fullDir, { recursive: true });
      }

      fs.writeFileSync(fullPath, file.buffer);

      console.log(`PhotoUploadService: Photo saved to ${fullPath}`);

      return {
        success: true,
        photoPath,
      };
    } catch (error: any) {
      console.error(
        `PhotoUploadService: Failed to save photo to ${subFolder}`,
        error,
      );

      return {
        success: false,
        error: error.message || "Failed to save photo",
      };
    }
  }

  determineSubFolder(group?: string, host?: string): string {
    if (group) {
      return group;
    }
    return host || "test";
  }
}
