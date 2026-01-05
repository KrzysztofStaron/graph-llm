const CLIENT_ID_KEY = 'graph-llm-client-id';

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  
  return clientId;
}
