import { PrivyClient } from '@privy-io/node';

let client: PrivyClient | null = null;

export function getPrivyClient() {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('Privy is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET.');
  }

  if (!client) {
    client = new PrivyClient({
      appId,
      appSecret,
    });
  }

  return client;
}
