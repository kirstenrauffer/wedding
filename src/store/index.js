import { configureStore } from '@reduxjs/toolkit';
import weddingReducer from './weddingSlice';

export const store = configureStore({
  reducer: {
    wedding: weddingReducer,
  },
});
