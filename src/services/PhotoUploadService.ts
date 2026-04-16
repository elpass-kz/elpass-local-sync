import axios from "axios";
import FormData from "form-data";
import { config } from "../config/environment";

/**
 * Результат загрузки фото
 */
export interface PhotoUploadResult {
  success: boolean;
  /** Относительный путь к фото (например: "bigapp/123456789012.jpg") */
  photoPath?: string;
  /** Полный URL к фото */
  photoUrl?: string;
  error?: string;
}

/**
 * Сервис для загрузки фото на elpicserver
 */
export class PhotoUploadService {
  constructor(private picServerUrl: string = config.picServer) {}

  /**
   * Загружает фото на elpicserver
   * @param file - файл для загрузки
   * @param subFolder - папка для сохранения (ID группы или название хоста: bigapp, astanahub, hilton)
   * @param cardNo - номер карточки (используется как имя файла)
   * @returns Результат загрузки с путем к фото
   */
  async uploadPhoto(
    file: Express.Multer.File,
    subFolder: string,
    cardNo: string | number,
  ): Promise<PhotoUploadResult> {
    try {
      console.log(
        `PhotoUploadService: Uploading photo to ${this.picServerUrl}/${subFolder}/`,
      );

      const filename = `${cardNo}.jpg`;

      const photoPath = `${subFolder}/${filename}`;

      const formData = new FormData();

      formData.append("image", file.buffer, {
        filename: photoPath,
        contentType: file.mimetype,
      });

      const response = await axios.post(
        `${this.picServerUrl}/${subFolder}/`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Accept: "*/*",
          },
          timeout: 30000, // 30 seconds timeout
        },
      );

      console.log(
        "RESPONSE FROM PHOTO UPLOAD",
        response.status,
        response.statusText,
        response.data,
      );

      // Формируем полный URL
      const photoUrl = `${this.picServerUrl}/${photoPath}`;

      console.log(
        `PhotoUploadService: Photo uploaded successfully. Path: ${photoPath}`,
      );

      return {
        success: true,
        photoPath,
        photoUrl,
      };
    } catch (error: any) {
      console.error(
        `PhotoUploadService: Failed to upload photo to ${subFolder}`,
        error,
      );

      return {
        success: false,
        error: error.message || "Failed to upload photo",
      };
    }
  }

  /**
   * Определяет subFolder для загрузки фото
   * @param group - ID группы (если есть)
   * @param host - название хоста (bigapp, astanahub, hilton и т.д.)
   * @returns subFolder для загрузки
   */
  determineSubFolder(group?: string, host?: string): string {
    // Если есть группа - используем её ID
    if (group) {
      return group;
    }

    // Иначе используем host
    return host || "test";
  }
}
