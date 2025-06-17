export class UpdatePhotoDto {
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}
