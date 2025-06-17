import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBillingInfoDto {
  @IsOptional()
  @IsString({ message: 'El RUC debe ser una cadena de texto' })
  @MinLength(11, { message: 'El RUC debe tener exactamente 11 dígitos' })
  @MaxLength(11, { message: 'El RUC debe tener exactamente 11 dígitos' })
  @Matches(/^[0-9]{11}$/, {
    message: 'El RUC debe contener solo 11 dígitos numéricos',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  ruc?: string;

  @IsOptional()
  @IsString({ message: 'La razón social debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'La razón social no puede tener más de 255 caracteres',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  razonSocial?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'La dirección no puede tener más de 255 caracteres',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  address?: string;
}
