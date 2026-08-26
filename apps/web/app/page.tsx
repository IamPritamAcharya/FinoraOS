'use client';

import { useCallback } from 'react';
import { FinoraChat } from './components/finora-chat';

export default function ChatPage() {
  const refresh = useCallback(() => undefined, []);
  return <FinoraChat onInvestigationCompleted={refresh} />;
}
