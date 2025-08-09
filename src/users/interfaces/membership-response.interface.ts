export interface MembershipPlan {
  id: number;
  name: string;
  commissionPercentage: number;
  directCommissionAmount?: number;
}

export interface MembershipResponse {
  hasActiveMembership: boolean;
  id?: number;
  userId?: string;
  userName?: string;
  userEmail?: string;
  plan?: MembershipPlan;
  message?: string;
}

export interface ReferrerMembershipResponse {
  hasReferrer: boolean;
  referrerMembership: MembershipResponse | null;
  message?: string;
}
