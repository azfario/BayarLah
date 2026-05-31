type ProfileFields = {
  fullName: string | null;
  phone: string | null;
  duitNowIdType: string | null;
  duitNowIdValue: string | null;
  duitNowRecipientName: string | null;
  duitNowQrUrl: string | null;
  whatsappLinkStatus: string | null;
};

export function hasProfileDetails(user: Omit<ProfileFields, "whatsappLinkStatus">) {
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
  return hasProfileDetails(user) && user.whatsappLinkStatus === "LINKED";
}
