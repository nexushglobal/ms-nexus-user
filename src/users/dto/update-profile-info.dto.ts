import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

enum DocumentType {
  DNI = 'DNI',
  CE = 'CE',
  PAS = 'PAS',
}

export class UpdatePersonalInfoDto {
  @IsOptional()
  @IsString({ message: 'El nickname debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nickname debe tener al menos 3 caracteres' })
  @MaxLength(50, {
    message: 'El nickname no puede tener más de 50 caracteres',
  })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message:
      'El nickname solo debe contener letras, números, puntos, guiones y guiones bajos',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  nickname?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo debe tener un formato válido' })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsEnum(DocumentType, {
    message: 'El tipo de documento debe ser DNI, CE o PAS',
  })
  documentType?: DocumentType;

  @IsOptional()
  @IsString({ message: 'El número de documento debe ser una cadena de texto' })
  @MinLength(8, {
    message: 'El número de documento debe tener al menos 8 caracteres',
  })
  @MaxLength(20, {
    message: 'El número de documento no puede tener más de 20 caracteres',
  })
  @Matches(/^[a-zA-Z0-9]+$/, {
    message: 'El número de documento solo debe contener letras y números',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  documentNumber?: string;
}
