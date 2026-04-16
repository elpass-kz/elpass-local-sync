import axios from "axios";
import { config } from "../config/environment";

export class PhotoConverterService {
  async fetchPhotoFromUrl(photoPath: string): Promise<Buffer> {
    const timestamp = Date.now();
    const url = `${config.picServer}/${photoPath}?ts=${timestamp}`;

    console.log("Fetching photo from:", url);

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
    });

    return Buffer.from(response.data);
  }

  blobToBase64(buffer: Buffer): string {
    return buffer.toString("base64");
  }

  base64ToBlob(base64: string): Buffer {
    return Buffer.from(base64, "base64");
  }
}
