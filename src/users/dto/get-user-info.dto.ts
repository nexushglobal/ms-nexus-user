import { IsMongoId, IsNotEmpty } from 'class-validator';

export class GetUserInfoDto {
  @IsNotEmpty()
  @IsMongoId()
  userId: string;
}
