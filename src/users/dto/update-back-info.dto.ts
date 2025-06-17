import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBankInfoDto {
  @IsOptional()
  @IsString({ message: 'El nombre del banco debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'El nombre del banco no puede tener más de 100 caracteres',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  bankName?: string;

  @IsOptional()
  @IsString({ message: 'El número de cuenta debe ser una cadena de texto' })
  @MinLength(10, {
    message: 'El número de cuenta debe tener al menos 10 dígitos',
  })
  @MaxLength(50, {
    message: 'El número de cuenta no puede tener más de 50 caracteres',
  })
  @Matches(/^[0-9-]+$/, {
    message: 'El número de cuenta debe contener solo números y guiones',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  accountNumber?: string;

  @IsOptional()
  @IsString({ message: 'El CCI debe ser una cadena de texto' })
  @MinLength(20, { message: 'El CCI debe tener exactamente 20 dígitos' })
  @MaxLength(20, { message: 'El CCI debe tener exactamente 20 dígitos' })
  @Matches(/^[0-9]{20}$/, {
    message: 'El CCI debe contener exactamente 20 dígitos numéricos',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  cci?: string;
}
