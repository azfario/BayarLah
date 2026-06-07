type ProfileFields = {
  fullName: string | null;
  phone: string | null;
  duitNowIdType: string | null;
  duitNowIdValue: string | null;
  duitNowRecipientName: string | null;
  duitNowQrUrl: string | null;
};

function hasProfileDetails(user: ProfileFields) {
  return Boolean(
    user.fullName?.trim() &&
      user.phone?.trim() &&
      user.duitNowIdType &&
      user.duitNowIdValue?.trim() &&
      user.duitNowRecipientName?.trim() &&
      user.duitNowQrUrl
  );
}

export function isProfileComplete(user: ProfileFields) {
  return hasProfileDetails(user);
}
