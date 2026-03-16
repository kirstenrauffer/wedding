import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  guestName: '',
  rsvpStatus: null,
};

export const weddingSlice = createSlice({
  name: 'wedding',
  initialState,
  reducers: {
    setGuestName: (state, action) => {
      state.guestName = action.payload;
    },
    setRsvpStatus: (state, action) => {
      state.rsvpStatus = action.payload;
    },
  },
});

export const { setGuestName, setRsvpStatus } = weddingSlice.actions;

export default weddingSlice.reducer;
