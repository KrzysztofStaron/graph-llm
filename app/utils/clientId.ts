import logger from './logger';

const CLIENT_ID_KEY = 'graph-llm-client-id';

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  
  if (!clientId) {
    clientId = crypto.randomUUID();
    try {
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    } catch (error) {
      logger.error("Failed to save client ID:", error);
    }
  }
  
  return clientId;
}
