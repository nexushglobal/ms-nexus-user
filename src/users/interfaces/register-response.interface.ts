export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    referralCode: string;
    firstName: string;
    lastName: string;
  };
}
