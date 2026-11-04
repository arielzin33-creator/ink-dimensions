// Reads which switchable capabilities are on (FR-036). The server enforces them regardless.
import { useEffect, useState } from 'react';
import { api } from './api.js';

export interface Features {
  photoPathEnabled: boolean;
  renderEnabled: boolean;
}

export function useFeatures(): Features | null {
  const [features, setFeatures] = useState<Features | null>(null);
  useEffect(() => {
    api<Features>('GET', '/api/features')
      .then(setFeatures)
      .catch(() => setFeatures({ photoPathEnabled: true, renderEnabled: true }));
  }, []);
  return features;
}
