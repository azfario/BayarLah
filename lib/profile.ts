type ProfileFields = {
  fullName: string | null;
  phone: string | null;
  duitNowIdType: string | null;
  duitNowIdValue: string | null;
  duitNowQrUrl: string | null;
};

export function isProfileComplete(user: ProfileFields) {
  return Boolean(
    user.fullName?.trim() &&
      user.phone?.trim() &&
      user.duitNowIdType &&
      user.duitNowIdValue?.trim() &&
      user.duitNowQrUrl
  );
}
