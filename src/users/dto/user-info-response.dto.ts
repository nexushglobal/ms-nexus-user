export class UserInfoResponseDto {
  firstName: string;
  lastName: string;
  birthdate: Date;
  ruc?: string;
  razonSocial?: string;
  referralCode: string;
  referrerCode?: string;
  referralsCount: number;
}
