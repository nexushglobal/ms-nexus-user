import { IsString, IsUUID } from 'class-validator';

export class GetReferrerMembershipDto {
  @IsString()
  @IsUUID()
  userId: string;
}
