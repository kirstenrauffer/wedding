import { createContext, useContext } from 'react';

export const TimeOfDayContext = createContext(12);

export function useTimeOfDay() {
  return useContext(TimeOfDayContext);
}
