import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateContactInfoDto {
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MinLength(7, { message: 'El teléfono debe tener al menos 7 caracteres' })
  @MaxLength(20, { message: 'El teléfono no puede tener más de 20 caracteres' })
  @Matches(/^[0-9+()-\s]+$/, {
    message:
      'El teléfono solo debe contener números, símbolos (+, -, ()) y espacios',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  phone?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'La dirección no puede tener más de 255 caracteres',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  address?: string;

  @IsOptional()
  @IsString({ message: 'El código postal debe ser una cadena de texto' })
  @MaxLength(10, {
    message: 'El código postal no puede tener más de 10 caracteres',
  })
  @Matches(/^[0-9A-Za-z\s-]+$/, {
    message:
      'El código postal solo debe contener letras, números, espacios y guiones',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  postalCode?: string;

  @IsOptional()
  @IsString({ message: 'El país debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'El país no puede tener más de 100 caracteres',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  country?: string;
}
