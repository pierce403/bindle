export const isValidEthAmount = (amount: string): boolean => {
  const normalized = amount.trim();

  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return false;
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0;
};

export const isValidRecipientShape = (recipient: string): boolean => {
  const normalized = recipient.trim();

  if (/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return true;
  }

  if (/^0zk[A-Za-z0-9]{16,}$/.test(normalized)) {
    return true;
  }

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.eth$/i.test(
    normalized
  );
};
