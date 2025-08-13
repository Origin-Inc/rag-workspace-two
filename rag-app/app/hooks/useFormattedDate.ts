import { useEffect, useState } from 'react';
import { formatDateStable } from '~/utils/date';

export function useFormattedDate(date: string | Date | null | undefined): string {
  const [formattedDate, setFormattedDate] = useState<string>(() => {
    if (!date) return '';
    // Return stable UTC-based format for initial SSR/hydration
    return formatDateStable(date);
  });

  useEffect(() => {
    if (!date) {
      setFormattedDate('');
      return;
    }
    
    // After hydration, update with locale-specific formatting
    const d = typeof date === 'string' ? new Date(date) : date;
    setFormattedDate(d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }));
  }, [date]);

  return formattedDate;
}